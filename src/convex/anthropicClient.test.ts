import { describe, expect, it, vi } from "vitest";
import { AnthropicError, callClaude, currentModel } from "./anthropicClient";

/**
 * Provider transport tests. The Claude API is stubbed: no network, no key, no
 * billing. These verify the properties every AI feature depends on — that the
 * key is sent cleanly and never echoed, that transient failures get exactly one
 * retry, and that credential/permission failures fail fast.
 */

type Call = { url: string; init: RequestInit };

function stubFetch(
  responses: (Response | Error)[],
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function textResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }] }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const noSleep = async () => {};

describe("callClaude", () => {
  it("posts to the messages endpoint with auth headers and configured model", async () => {
    const { fetch, calls } = stubFetch([textResponse("hello")]);
    const out = await callClaude("sk-ant-test", "SYS", "USER", 400, {
      fetch,
      sleep: noSleep,
    });

    expect(out).toBe("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.max_tokens).toBe(400);
    expect(body.system).toBe("SYS");
    expect(body.messages).toEqual([{ role: "user", content: "USER" }]);
    expect(body.model).toBe(currentModel());
  });

  it("trims a pasted key before it reaches the header", async () => {
    const { fetch, calls } = stubFetch([textResponse("ok")]);
    await callClaude("  sk-ant-padded\n", "S", "U", 100, { fetch, sleep: noSleep });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-padded");
  });

  it("rejects an empty or whitespace-only key without calling the provider", async () => {
    const { fetch, calls } = stubFetch([textResponse("ok")]);
    await expect(
      callClaude("   \n ", "S", "U", 100, { fetch, sleep: noSleep }),
    ).rejects.toBeInstanceOf(AnthropicError);
    expect(calls).toHaveLength(0);
  });

  it("retries once on 429 and returns the retried response", async () => {
    const { fetch, calls } = stubFetch([
      new Response("rate limited", { status: 429 }),
      textResponse("after retry"),
    ]);
    const out = await callClaude("k", "S", "U", 100, { fetch, sleep: noSleep });
    expect(out).toBe("after retry");
    expect(calls).toHaveLength(2);
  });

  it("retries once on 503", async () => {
    const { fetch, calls } = stubFetch([
      new Response("overloaded", { status: 503 }),
      textResponse("ok"),
    ]);
    expect(await callClaude("k", "S", "U", 100, { fetch, sleep: noSleep })).toBe("ok");
    expect(calls).toHaveLength(2);
  });

  it("does not retry an invalid key (401)", async () => {
    const { fetch, calls } = stubFetch([new Response("nope", { status: 401 })]);
    await expect(
      callClaude("bad", "S", "U", 100, { fetch, sleep: noSleep }),
    ).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("does not retry a malformed request (400)", async () => {
    const { fetch, calls } = stubFetch([new Response("bad request", { status: 400 })]);
    await expect(
      callClaude("k", "S", "U", 100, { fetch, sleep: noSleep }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });

  it("gives up after one retry on a persistent transient failure", async () => {
    const { fetch, calls } = stubFetch([new Response("down", { status: 502 })]);
    await expect(
      callClaude("k", "S", "U", 100, { fetch, sleep: noSleep }),
    ).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(2);
  });

  it("retries a network error, then succeeds", async () => {
    const { fetch, calls } = stubFetch([
      new TypeError("fetch failed"),
      textResponse("recovered"),
    ]);
    expect(await callClaude("k", "S", "U", 100, { fetch, sleep: noSleep })).toBe(
      "recovered",
    );
    expect(calls).toHaveLength(2);
  });

  it("throws the network error after a second failure", async () => {
    const { fetch, calls } = stubFetch([new TypeError("fetch failed")]);
    await expect(
      callClaude("k", "S", "U", 100, { fetch, sleep: noSleep }),
    ).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(2);
  });

  it("returns null when the response carries no text block", async () => {
    const { fetch } = stubFetch([
      new Response(JSON.stringify({ content: [{ type: "thinking" }] }), {
        status: 200,
      }),
    ]);
    expect(await callClaude("k", "S", "U", 100, { fetch, sleep: noSleep })).toBeNull();
  });

  it("never echoes the key in a provider error", async () => {
    const { fetch } = stubFetch([new Response("unauthorized", { status: 401 })]);
    const err = await callClaude("sk-ant-secret-value", "S", "U", 100, {
      fetch,
      sleep: noSleep,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AnthropicError);
    expect((err as Error).message).toBe("Anthropic API 401");
    expect((err as Error).message).not.toContain("sk-ant-secret-value");
  });

  it("waits between retries rather than hammering the provider", async () => {
    const sleep = vi.fn(async () => {});
    const { fetch } = stubFetch([
      new Response("rate limited", { status: 429 }),
      textResponse("ok"),
    ]);
    await callClaude("k", "S", "U", 100, { fetch, sleep });
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
