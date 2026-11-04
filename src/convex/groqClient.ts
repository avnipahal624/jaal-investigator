/**
 * Groq chat transport — the single place a request to Groq's OpenAI-compatible
 * chat API is built.
 *
 * Kept free of Convex/generated imports so the unit tests can exercise it with
 * a stubbed fetch (see groqClient.test.ts). Every AI workflow — strategy,
 * summary, intelligence modules, copilot, safety assistant, consumer content
 * analysis and voice analysis — goes through `callGroq`, so these properties
 * hold everywhere:
 *
 *  - the API key is read from the deployment environment by the caller and is
 *    never logged, returned, or echoed in an error message;
 *  - each attempt has a hard timeout, so a hung provider cannot stall an action
 *    until Convex's runtime limit;
 *  - only transient failures (408/409/429/5xx/network) are retried, once, so an
 *    invalid key or a malformed request fails immediately instead of burning
 *    the caller's rate-limit budget;
 *  - provider error text is reduced to the HTTP status before it propagates;
 *  - responses are returned as plain text and MUST be schema-validated by the
 *    caller before use. JSON mode is a hint to the model, never a guarantee.
 */

/** Provider error carrying only the status code — never the response body. */
export class GroqError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Groq API ${status}`);
    this.name = "GroqError";
    this.status = status;
  }
}

/** Statuses worth one retry: rate limited or transient upstream. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

/** Per-attempt timeout. Two attempts worst case stays inside action limits. */
export const GROQ_TIMEOUT_MS = 25_000;

/** Backoff between the first attempt and the single retry. */
const RETRY_DELAY_MS = 400;

/** OpenAI-compatible chat completions endpoint (same host as speech-to-text). */
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Model identifier — configured via env, never invented per call. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export function currentGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

/**
 * gpt-oss models spend output tokens on a reasoning pass before writing the
 * answer, so they need an explicit reasoning budget hint and the newer token
 * limit field; otherwise a small max-token request returns empty content.
 */
function isReasoningModel(model: string): boolean {
  return model.startsWith("openai/gpt-oss");
}

type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof GroqError) return false;
  // AbortSignal.timeout → TimeoutError, fetch network failure → TypeError.
  return err instanceof Error;
}

export type GroqCallOptions = {
  /** Ask for a JSON object. Prompts must still demand JSON in words. */
  json?: boolean;
  temperature?: number;
  /** Test seams; production always uses the real fetch/timers. */
  deps?: Partial<Deps>;
};

/**
 * Call Groq's chat completions API and return the assistant message text, or
 * null when the provider returned no text. Throws `GroqError` for a
 * non-retryable HTTP status, and the underlying error for repeated transient
 * failures.
 */
export async function callGroq(
  apiKey: string,
  system: string,
  userContent: string,
  maxTokens: number,
  options: GroqCallOptions = {},
): Promise<string | null> {
  // A pasted key commonly carries a trailing newline, which makes the header
  // invalid and surfaces as an unexplained 401. Trim before it is sent.
  const key = apiKey.trim();
  if (!key) throw new GroqError(401);

  const { fetch: doFetch, sleep } = { ...defaultDeps, ...options.deps };
  const model = currentGroqModel();
  const reasoning = isReasoningModel(model);
  const body = JSON.stringify({
    model,
    // Reasoning models account for the thinking pass in this budget too, so
    // reserve a floor above the caller's requested answer length.
    ...(reasoning
      ? {
          max_completion_tokens: Math.max(maxTokens, 1_024),
          reasoning_effort: "low",
        }
      : { max_tokens: maxTokens }),
    temperature: options.temperature ?? 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    ...(options.json ? { response_format: { type: "json_object" } } : {}),
  });

  for (let attempt = 0; ; attempt += 1) {
    const canRetry = attempt === 0;
    try {
      const res = await doFetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body,
        signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (canRetry && RETRYABLE_STATUSES.has(res.status)) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new GroqError(res.status);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      return typeof text === "string" && text.trim() ? text : null;
    } catch (err) {
      if (canRetry && isTransientNetworkError(err)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}
