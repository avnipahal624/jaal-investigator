import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROQ_MODEL,
  GROQ_CHAT_URL,
  GROQ_MAX_ATTEMPTS,
  GroqError,
  GroqTruncatedError,
  RETRY_BASE_MS,
  RETRY_MAX_DELAY_MS,
  callGroq,
  completionBudget,
  currentGroqModel,
  describeGroqError,
  groqRetryAfterSeconds,
  isRetryableGroqError,
  parseRetryAfter,
  retryDelayMs,
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
    // gpt-oss gets the answer budget plus reasoning headroom, not a flat
    // floor that silently multiplies a small per-feature budget.
    expect(body.max_completion_tokens).toBe(912);
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

  it("adds reasoning headroom to a larger answer budget", async () => {
    const { fetch, calls } = stubFetch([chatResponse("ok")]);
    await callGroq("k", "S", "U", 2_000, { deps: { fetch, sleep: noSleep } });
    expect(JSON.parse(String(calls[0]!.init.body)).max_completion_tokens).toBe(2_512);
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

  it("retries network failures up to the attempt cap, then surfaces it", async () => {
    const { fetch, calls } = stubFetch([new TypeError("fetch failed")]);
    await expect(
      callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(GROQ_MAX_ATTEMPTS);
  });

  it("gives up after the attempt cap on repeated 503s", async () => {
    const { fetch, calls } = stubFetch([
      new Response("down", { status: 503 }),
      new Response("down", { status: 503 }),
      new Response("down", { status: 503 }),
    ]);
    await expect(
      callGroq("k", "S", "U", 10, { deps: { fetch, sleep: noSleep } }),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(GROQ_MAX_ATTEMPTS);
  });

  it("honours a valid Retry-After header instead of its own backoff", async () => {
    const sleep = vi.fn(async () => {});
    const { fetch, calls } = stubFetch([
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "2" },
      }),
      chatResponse("after wait"),
    ]);
    const out = await callGroq("k", "S", "U", 10, {
      deps: { fetch, sleep, random: () => 0.5 },
    });

    expect(out).toBe("after wait");
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("does not wait out a Retry-After longer than the action budget", async () => {
    const sleep = vi.fn(async () => {});
    const { fetch, calls } = stubFetch([
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "45" },
      }),
    ]);
    const err = await callGroq("k", "S", "U", 10, {
      deps: { fetch, sleep },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GroqError);
    expect((err as GroqError).status).toBe(429);
    expect((err as GroqError).retryAfterMs).toBe(45_000);
    expect(groqRetryAfterSeconds(err)).toBe(45);
    expect(describeGroqError(err)).toBe("groq-rate-limited");
    // No retry storm: the caller stores a retryable state instead.
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("uses bounded exponential backoff with jitter for 5xx", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const { fetch } = stubFetch([
      new Response("a", { status: 500 }),
      new Response("b", { status: 502 }),
      chatResponse("ok"),
    ]);
    await callGroq("k", "S", "U", 10, {
      deps: { fetch, sleep, random: () => 0.5 },
    });
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBe(RETRY_BASE_MS);
    expect(delays[1]).toBe(RETRY_BASE_MS * 2);
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS);
      expect(delay).toBeGreaterThan(0);
    }
  });

  it("treats a length-truncated answer as a failure, not a result", async () => {
    const { fetch } = stubFetch([
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "{\"overallAssessment\":\"HIGH" }, finish_reason: "length" },
          ],
        }),
        { status: 200 },
      ),
    ]);
    const err = await callGroq("k", "S", "U", 100, {
      json: true,
      deps: { fetch, sleep: noSleep },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GroqTruncatedError);
    expect(describeGroqError(err)).toBe("groq-truncated");
    expect(isRetryableGroqError(err)).toBe(false);
  });

  it("reports token usage without exposing content", async () => {
    const seen: unknown[] = [];
    const { fetch } = stubFetch([
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 40,
            completion_tokens_details: { reasoning_tokens: 12 },
          },
        }),
        { status: 200 },
      ),
    ]);
    await callGroq("k", "S", "U", 200, {
      onUsage: (usage) => seen.push(usage),
      deps: { fetch, sleep: noSleep },
    });
    expect(seen).toEqual([
      { promptTokens: 120, completionTokens: 40, reasoningTokens: 12 },
    ]);
  });

  it("does not retry a validation failure", async () => {
    const { fetch, calls } = stubFetch([
      new Response("bad", { status: 422 }),
    ]);
    const err = await callGroq("k", "S", "U", 10, {
      deps: { fetch, sleep: noSleep },
    }).catch((e: unknown) => e);
    expect(calls).toHaveLength(1);
    expect(describeGroqError(err)).toBe("groq-rejected");
    expect(isRetryableGroqError(err)).toBe(false);
  });

  it("classifies transient and permanent failures for the UI", () => {
    expect(describeGroqError(new GroqError(401))).toBe("groq-auth");
    expect(describeGroqError(new GroqError(503))).toBe("groq-unavailable");
    expect(describeGroqError(new GroqError(504))).toBe("groq-unavailable");
    expect(describeGroqError(new Error("fetch failed"))).toBe("groq-network");
    expect(describeGroqError(new Error("The operation was aborted"))).toBe(
      "groq-timeout",
    );
    expect(isRetryableGroqError(new GroqError(503))).toBe(true);
    expect(isRetryableGroqError(new GroqError(401))).toBe(false);
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

describe("parseRetryAfter", () => {
  it("accepts delta-seconds and HTTP dates", () => {
    expect(parseRetryAfter("2")).toBe(2_000);
    expect(parseRetryAfter("0.5")).toBe(500);
    expect(
      parseRetryAfter(new Date(1_700_000_000_000 + 3_000).toUTCString(), 1_700_000_000_000),
    ).toBe(3_000);
  });

  it("ignores garbage and non-positive dates", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter("-5")).toBeNull();
    expect(
      parseRetryAfter(new Date(1_700_000_000_000 - 5_000).toUTCString(), 1_700_000_000_000),
    ).toBe(0);
  });

  it("caps a pathological header so an action is never pinned", () => {
    expect(parseRetryAfter("999999")).toBe(120_000);
  });
});

describe("retryDelayMs", () => {
  it("grows exponentially and stays inside the jitter bounds", () => {
    const low = retryDelayMs(3, null, () => 0);
    const high = retryDelayMs(3, null, () => 1);
    expect(low).toBe(Math.round(2_000 * 0.75));
    expect(high).toBe(Math.round(2_000 * 1.25));
    expect(retryDelayMs(10, null, () => 1)).toBeLessThanOrEqual(
      RETRY_MAX_DELAY_MS * 1.25,
    );
  });

  it("never returns a zero delay", () => {
    for (let i = 1; i <= 5; i += 1) {
      expect(retryDelayMs(i, null, () => 0)).toBeGreaterThan(0);
    }
  });
});

describe("completionBudget", () => {
  it("keeps the intended answer budget for non-reasoning models", () => {
    expect(completionBudget("qwen/qwen3.8-27b", 400)).toEqual({ max_tokens: 400 });
  });

  it("adds fixed headroom rather than a flat floor for reasoning models", () => {
    expect(completionBudget("openai/gpt-oss-120b", 400)).toEqual({
      max_completion_tokens: 912,
    });
    expect(completionBudget("openai/gpt-oss-120b", 3000)).toEqual({
      max_completion_tokens: 3_512,
    });
  });

  it("never exceeds the provider-safe completion cap", () => {
    expect(completionBudget("openai/gpt-oss-20b", 10_000)).toEqual({
      max_completion_tokens: 4_096,
    });
  });
});
