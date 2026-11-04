import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROQ_MODEL,
  GROQ_CHAT_URL,
  GroqError,
  callGroq,
  currentGroqModel,
} from "./groqClient";

/**
 * Provider transport tests. The Groq API is stubbed: no network, no key, no
 * billing. These verify the properties every AI feature depends on — that the
 * key is sent cleanly and never echoed, that transient failures get exactly one
 * retry, and that credential/permission failures fail fast.
 */

type Call = { url: string; init: RequestInit };

function stubFetch(responses: (Response | Error)[]): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function chatResponse(content: string | null, status = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const noSleep = async () => {};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("currentGroqModel", () => {
  it("defaults to the configured open model", () => {
    expect(currentGroqModel()).toBe(DEFAULT_GROQ_MODEL);
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("honours GROQ_MODEL and ignores blank overrides", () => {
    vi.stubEnv("GROQ_MODEL", " openai/gpt-oss-20b ");
    expect(currentGroqModel()).toBe("openai/gpt-oss-20b");

    vi.stubEnv("GROQ_MODEL", "   ");
    expect(currentGroqModel()).toBe(DEFAULT_GROQ_MODEL);
  });
});

describe("callGroq", () => {
  it("posts to the chat completions endpoint with bearer auth", async () => {
    const { fetch, calls } = stubFetch([chatResponse("hello")]);
    const out = await callGroq("gsk_test", "SYS", "USER", 400, {
      deps: { fetch, sleep: noSleep },
    });

    expect(out).toBe("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(GROQ_CHAT_URL);

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer gsk_test");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe(DEFAULT_GROQ_MODEL);
    // gpt-oss reserves a reasoning floor and asks for short reasoning passes.
    expect(body.max_completion_tokens).toBe(1_024);
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBe("low");
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
    expect(body.response_format).toBeUndefined();
  });

  it("trims a pasted key before it reaches the header", async () => {
    const { fetch, calls } = stubFetch([chatResponse("ok")]);
    await callGroq("  gsk_padded\n", "S", "U", 10, {
      deps: { fetch, sleep: noSleep },
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer gsk_padded");
  });

  it("requests a JSON object only when json mode is asked for", async () => {
    const { fetch, calls } = stubFetch([
      chatResponse('{"a":1}'),
      chatResponse('{"a":1}'),
    ]);
    await callGroq("k", "S", "U", 10, {
      json: true,
      deps: { fetch, sleep: noSleep },
    });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("uses the plain token field for non-reasoning models", async () => {
    vi.stubEnv("GROQ_MODEL", "qwen/qwen3.8-27b");
    const { fetch, calls } = stubFetch([chatResponse("ok")]);
    await callGroq("k", "S", "U", 300, { deps: { fetch, sleep: noSleep } });

    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.max_tokens).toBe(300);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("keeps a caller's larger budget instead of shrinking it", async () => {
    const { fetch, calls } = stubFetch([chatResponse("ok")]);
    await callGroq("k", "S", "U", 2_000, { deps: { fetch, sleep: noSleep } });
    expect(JSON.parse(String(calls[0]!.init.body)).max_completion_tokens).toBe(2_000);
  });

  it("applies an explicit temperature override", async () => {
    const { fetch, calls } = stubFetch([chatResponse("ok")]);
    await callGroq("k", "S", "U", 10, {
      temperature: 0,
      deps: { fetch, sleep: noSleep },
    });
    expect(JSON.parse(String(calls[0]!.init.body)).temperature).toBe(0);
  });

  it("returns null for an empty or whitespace-only message", async () => {
    for (const content of ["", "   \n ", null]) {
      const { fetch } = stubFetch([chatResponse(content)]);
      expect(
        await callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
      ).toBeNull();
    }
  });

  it("returns null when the provider omits choices", async () => {
    const { fetch } = stubFetch([
      new Response(JSON.stringify({}), { status: 200 }),
    ]);
    expect(
      await callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).toBeNull();
  });

  it("fails fast on a bad key without retrying", async () => {
    const { fetch, calls } = stubFetch([
      new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 }),
    ]);
    await expect(
      callGroq("bad", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toBeInstanceOf(GroqError);
    expect(calls).toHaveLength(1);
  });

  it("retries a rate limit exactly once and then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const { fetch, calls } = stubFetch([
      new Response("slow down", { status: 429 }),
      chatResponse("after retry"),
    ]);
    const out = await callGroq("k", "S", "U", 10, { deps: { fetch, sleep } });

    expect(out).toBe("after retry");
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retries a transient server error once", async () => {
    const { fetch, calls } = stubFetch([
      new Response("upstream", { status: 503 }),
      chatResponse("recovered"),
    ]);
    await expect(
      callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).resolves.toBe("recovered");
    expect(calls).toHaveLength(2);
  });

  it("does not retry a malformed request", async () => {
    const { fetch, calls } = stubFetch([
      new Response('{"error":{"message":"model not found"}}', { status: 400 }),
    ]);
    await expect(
      callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });

  it("retries one network failure, then surfaces it", async () => {
    const { fetch, calls } = stubFetch([new TypeError("fetch failed")]);
    await expect(
      callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(2);
  });

  it("gives up after a single retry on repeated 503s", async () => {
    const { fetch, calls } = stubFetch([
      new Response("down", { status: 503 }),
      new Response("down", { status: 503 }),
    ]);
    await expect(
      callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(2);
  });

  it("never leaks the key or provider body in an error", async () => {
    const { fetch } = stubFetch([
      new Response("invalid key gsk_secret_value", { status: 401 }),
    ]);
    const err = await callGroq("gsk_secret_value", "S", "U", 10, {
      deps: { fetch, sleep: noSleep },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GroqError);
    const message = (err as Error).message;
    expect(message).toBe("Groq API 401");
    expect(message).not.toContain("gsk_");
    expect(message).not.toContain("invalid key");
  });

  it("rejects an empty key before any request is made", async () => {
    const { fetch, calls } = stubFetch([chatResponse("never")]);
    await expect(
      callGroq("   ", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toMatchObject({ status: 401, name: "GroqError" });
    expect(calls).toHaveLength(0);
  });

  it("sends an abort signal so a hung provider cannot stall the action", async () => {
    const { fetch, calls } = stubFetch([chatResponse("ok")]);
    await callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});
