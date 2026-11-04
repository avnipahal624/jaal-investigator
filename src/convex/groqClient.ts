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
 *  - only transient failures (408/409/429/5xx/network) are retried, with
 *    bounded exponential backoff and jitter. `Retry-After` is honoured when the
 *    provider sends it; an unusable (very long) delay fails fast instead of
 *    holding the action open. Auth and validation failures are never retried;
 *  - a response cut off by the token budget (`finish_reason: "length"`) is an
 *    error, never a "complete" answer;
 *  - provider error text is reduced to the HTTP status before it propagates;
 *  - responses are returned as plain text and MUST be schema-validated by the
 *    caller before use. JSON mode is a hint to the model, never a guarantee.
 */

/** Provider error carrying only the status code — never the response body. */
export class GroqError extends Error {
  readonly status: number;
  /** Milliseconds the provider asked us to wait, when it said so. */
  readonly retryAfterMs: number | null;
  readonly code: string | null;

  constructor(
    status: number,
    options: { retryAfterMs?: number | null; code?: string } = {},
  ) {
    super(`Groq API ${status}`);
    this.name = "GroqError";
    this.status = status;
    this.retryAfterMs =
      typeof options.retryAfterMs === "number" && options.retryAfterMs >= 0
        ? options.retryAfterMs
        : null;
    this.code = options.code ?? null;
  }
}

/**
 * The model stopped because it hit the completion budget. A partial answer is
 * never returned as if it were complete.
 */
export class GroqTruncatedError extends Error {
  constructor() {
    super("Groq response truncated by the token budget");
    this.name = "GroqTruncatedError";
  }
}

/** Statuses worth retrying: rate limited or transient upstream. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

/** Per-attempt timeout. Bounded attempts keep the action inside its limit. */
export const GROQ_TIMEOUT_MS = 25_000;

/** Total attempts (first try + retries). Never unbounded. */
export const GROQ_MAX_ATTEMPTS = 3;

/** Backoff base; doubles each failure and is jittered ±25%. */
export const RETRY_BASE_MS = 500;

/**
 * Longest delay we are willing to sit on. A `Retry-After` above this is
 * surfaced to the caller (which stores a retryable status) rather than burning
 * the action's runtime waiting.
 */
export const RETRY_MAX_DELAY_MS = 8_000;

/** OpenAI-compatible chat completions endpoint (same host as speech-to-text). */
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Model identifier — configured via env, never invented per call. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * Reasoning models spend output tokens on a thinking pass before writing the
 * answer, so the completion budget must cover both. Rather than silently
 * replacing a small per-feature budget with a large flat floor, each call gets
 * its intended answer length plus this measured headroom, capped.
 */
export const REASONING_HEADROOM_TOKENS = 512;
export const MIN_COMPLETION_TOKENS = 256;
export const MAX_COMPLETION_TOKENS = 4_096;

export function currentGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

/** gpt-oss models need the newer token field and an explicit reasoning hint. */
export function isReasoningModel(model: string): boolean {
  return model.startsWith("openai/gpt-oss");
}

/**
 * Completion budget for one request.
 *
 * - reasoning models: answer budget + reasoning headroom (capped), so a
 *   feature's intended answer length is not silently multiplied by a flat
 *   floor;
 * - other models: the caller's answer budget untouched.
 */
export function completionBudget(
  model: string,
  answerTokens: number,
): { max_completion_tokens: number } | { max_tokens: number } {
  if (!isReasoningModel(model)) return { max_tokens: answerTokens };
  const requested = Math.max(answerTokens, MIN_COMPLETION_TOKENS);
  return {
    max_completion_tokens: Math.min(
      MAX_COMPLETION_TOKENS,
      requested + REASONING_HEADROOM_TOKENS,
    ),
  };
}

export type GroqUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
};

/**
 * Parse a `Retry-After` header. Accepts delta-seconds and HTTP dates; returns
 * null for anything else (garbage must not become a wait). Capped so a
 * pathological header cannot pin an action.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.min(120_000, Math.round(seconds * 1000));
  }

  const when = Date.parse(raw);
  if (Number.isNaN(when)) return null;
  return Math.max(0, Math.min(120_000, when - now));
}

/**
 * Delay before the next attempt. `Retry-After` wins when present; otherwise
 * exponential backoff with bounded jitter. `failure` is the number of failed
 * attempts so far (1 after the first failure).
 */
export function retryDelayMs(
  failure: number,
  retryAfterMs: number | null,
  random: () => number = Math.random,
): number {
  const jitter = 0.75 + random() * 0.5;
  if (retryAfterMs !== null) {
    return Math.min(
      RETRY_MAX_DELAY_MS,
      Math.max(RETRY_BASE_MS, Math.round(retryAfterMs * jitter)),
    );
  }
  const base = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_MS * 2 ** Math.max(0, failure - 1),
  );
  return Math.max(1, Math.round(base * jitter));
}

type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};

const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof GroqError || err instanceof GroqTruncatedError) return false;
  if (err instanceof SyntaxError) return false;
  if (!(err instanceof Error)) return false;
  // AbortSignal.timeout → TimeoutError, fetch network failure → TypeError.
  return (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    err.name === "TypeError"
  );
}

export type GroqCallOptions = {
  /** Ask for a JSON object. Prompts must still demand JSON in words. */
  json?: boolean;
  temperature?: number;
  /** Observe token usage (used by diagnostics; never logged with content). */
  onUsage?: (usage: GroqUsage) => void;
  /** Test seams; production always uses the real fetch/timers/random. */
  deps?: Partial<Deps>;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readUsage(raw: unknown): GroqUsage | null {
  const usage = (raw ?? null) as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    completion_tokens_details?: { reasoning_tokens?: unknown };
  } | null;
  if (!usage || typeof usage !== "object") return null;
  return {
    promptTokens: numberOrNull(usage.prompt_tokens),
    completionTokens: numberOrNull(usage.completion_tokens),
    reasoningTokens: numberOrNull(
      usage.completion_tokens_details?.reasoning_tokens,
    ),
  };
}

/**
 * Classify a failure into a stable, content-free code that callers can store
 * and the UI can translate. Never includes provider text or the key.
 */
export function describeGroqError(err: unknown): string {
  if (err instanceof GroqTruncatedError) return "groq-truncated";
  if (err instanceof GroqError) {
    if (err.code) return err.code;
    if (err.status === 429) return "groq-rate-limited";
    if (err.status === 401 || err.status === 403) return "groq-auth";
    if (err.status === 408) return "groq-timeout";
    if (err.status === 400 || err.status === 404 || err.status === 422) {
      return "groq-rejected";
    }
    if (err.status >= 500) return "groq-unavailable";
    return "groq-error";
  }
  const message = err instanceof Error ? err.message : "";
  const status = message.match(/Groq API (\d{3})/);
  if (status) return describeGroqError(new GroqError(Number(status[1])));
  if (/abort|timeout/i.test(message)) return "groq-timeout";
  if (/network|fetch|ECONN|ENOTFOUND|socket/i.test(message)) {
    return "groq-network";
  }
  return "groq-error";
}

/** True when retrying the same request later is reasonable. */
export function isRetryableGroqError(err: unknown): boolean {
  const code = describeGroqError(err);
  return (
    code === "groq-rate-limited" ||
    code === "groq-timeout" ||
    code === "groq-network" ||
    code === "groq-unavailable"
  );
}

/** Seconds the provider asked the caller to wait, when it said so. */
export function groqRetryAfterSeconds(err: unknown): number | null {
  if (!(err instanceof GroqError) || err.retryAfterMs === null) return null;
  return Math.max(1, Math.ceil(err.retryAfterMs / 1000));
}

/**
 * Call Groq's chat completions API and return the assistant message text, or
 * null when the provider returned no text. Throws `GroqError` for a
 * non-retryable HTTP status, `GroqTruncatedError` for a cut-off answer, and the
 * underlying error for repeated transient failures.
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

  const { fetch: doFetch, sleep, random } = { ...defaultDeps, ...options.deps };
  const model = currentGroqModel();
  const reasoning = isReasoningModel(model);
  const body = JSON.stringify({
    model,
    ...completionBudget(model, maxTokens),
    ...(reasoning ? { reasoning_effort: "low" } : {}),
    temperature: options.temperature ?? 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    ...(options.json ? { response_format: { type: "json_object" } } : {}),
  });

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= GROQ_MAX_ATTEMPTS; attempt += 1) {
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
        const retryAfterMs = parseRetryAfter(res.headers?.get?.("retry-after"));
        const canRetry =
          RETRYABLE_STATUSES.has(res.status) &&
          attempt < GROQ_MAX_ATTEMPTS &&
          (retryAfterMs === null || retryAfterMs <= RETRY_MAX_DELAY_MS);

        if (canRetry) {
          lastError = new GroqError(res.status, { retryAfterMs });
          await sleep(retryDelayMs(attempt, retryAfterMs, random));
          continue;
        }
        throw new GroqError(res.status, { retryAfterMs });
      }

      const data = (await res.json()) as {
        choices?: {
          message?: { content?: string | null };
          finish_reason?: string | null;
        }[];
        usage?: unknown;
      };
      const choice = data.choices?.[0];

      // A cut-off answer is not a complete one. JSON callers would fail schema
      // validation anyway, but plain-text callers must not show half an answer.
      if (choice?.finish_reason === "length") throw new GroqTruncatedError();

      const usage = readUsage(data.usage);
      if (usage) options.onUsage?.(usage);

      const text = choice?.message?.content;
      return typeof text === "string" && text.trim() ? text : null;
    } catch (err) {
      // Provider statuses are already classified above; never retry them here.
      if (err instanceof GroqError || err instanceof GroqTruncatedError) throw err;
      lastError = err;
      if (isTransientNetworkError(err) && attempt < GROQ_MAX_ATTEMPTS) {
        await sleep(retryDelayMs(attempt, null, random));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new GroqError(503);
}
