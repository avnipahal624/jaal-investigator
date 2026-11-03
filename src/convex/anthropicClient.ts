/**
 * Anthropic transport — the single place a request to the Claude API is built.
 *
 * Kept free of Convex/generated imports so it can be exercised directly by the
 * unit tests (see anthropicClient.test.ts) with a stubbed fetch. Every caller
 * goes through `callClaude`, so the security and reliability properties hold
 * for strategy, summary, copilot, assistant and voice analysis alike:
 *
 *  - the API key is read from the deployment environment by the caller and is
 *    never logged, returned, or echoed in an error message;
 *  - each attempt has a hard timeout, so a hung provider cannot stall an action
 *    until Convex's runtime limit;
 *  - only transient failures (408/409/429/5xx/network) are retried, once, so an
 *    invalid key or a malformed request fails immediately instead of burning
 *    the caller's rate-limit budget;
 *  - provider error text is reduced to the HTTP status before it propagates.
 */

/** Provider error carrying only the status code — never the response body. */
export class AnthropicError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Anthropic API ${status}`);
    this.name = "AnthropicError";
    this.status = status;
  }
}

/** Statuses worth one retry: overloaded, rate limited, or transient upstream. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/** Per-attempt timeout. Two attempts worst case stays well inside action limits. */
export const ANTHROPIC_TIMEOUT_MS = 10_000;

/** Backoff between the first attempt and the single retry. */
const RETRY_DELAY_MS = 350;

/** Model identifier — configured via env, never invented per call. */
export function currentModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
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
  if (err instanceof AnthropicError) return false;
  // AbortSignal.timeout → TimeoutError/DOMException, fetch network failure → TypeError.
  return err instanceof Error;
}

/**
 * Call the Claude messages API and return the first text block, or null when
 * the provider returned no text. Throws `AnthropicError` for a non-retryable
 * HTTP status, and the underlying error for repeated transient failures.
 */
export async function callClaude(
  apiKey: string,
  system: string,
  userContent: string,
  maxTokens: number,
  deps: Partial<Deps> = {},
): Promise<string | null> {
  // A pasted key commonly carries a trailing newline, which makes the header
  // invalid and surfaces as an unexplained 401. Trim before it is sent.
  const key = apiKey.trim();
  if (!key) throw new AnthropicError(401);

  const { fetch: doFetch, sleep } = { ...defaultDeps, ...deps };
  const model = currentModel();
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt === 0;
    try {
      const res = await doFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body,
        signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (canRetry && RETRYABLE_STATUSES.has(res.status)) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new AnthropicError(res.status);
      }

      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      return data.content?.find((c) => c.type === "text")?.text ?? null;
    } catch (err) {
      if (canRetry && isTransientNetworkError(err)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}
