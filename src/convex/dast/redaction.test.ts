import { describe, expect, it } from "vitest";
import { canonicalEvidence, redactSensitive } from "./redaction";

describe("recursive evidence redaction", () => {
  it("redacts nested headers, tokens and credentials without removing structure", () => {
    const input = {
      request: {
        method: "POST",
        headers: {
          Authorization: "Bearer abcdefghijklmnop",
          Cookie: "session=raw-session",
          "X-Request-Id": "req-1",
        },
        body: {
          travellerEmail: "priya@example.test",
          pnr: "SYN-A1",
          nested: [{ password: "hunter2", note: "safe" }],
        },
      },
    };
    const output = redactSensitive(input) as typeof input;
    expect(output.request.headers.Authorization).toBe("[REDACTED]");
    expect(output.request.headers.Cookie).toBe("[REDACTED]");
    expect(output.request.headers["X-Request-Id"]).toBe("req-1");
    expect(output.request.body.travellerEmail).toBe("p•••@example.test");
    expect(output.request.body.pnr).toBe("SY-••");
    expect(output.request.body.nested[0].password).toBe("[REDACTED]");
    expect(output.request.body.nested[0].note).toBe("safe");
  });

  it("redacts secrets embedded in free text and arrays", () => {
    const output = redactSensitive([
      "Authorization: Bearer abcdefghijklmnop",
      "contact priya@example.test",
      "sk_live_1234567890abcdef",
      "session=abc123; theme=dark",
    ]);
    expect(output).toEqual([
      "Authorization: Bearer [REDACTED]",
      "contact p•••@example.test",
      "[REDACTED_KEY]",
      "session=[REDACTED]; theme=dark",
    ]);
  });

  it("produces stable canonical evidence text independent of key order", () => {
    const a = canonicalEvidence({ b: 2, a: { y: 1, x: 2 } });
    const b = canonicalEvidence({ a: { x: 2, y: 1 }, b: 2 });
    expect(a).toBe(b);
    expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"b"'));
  });

  it("does not mutate the input object", () => {
    const input = { token: "secret", nested: { email: "a@b.test" } };
    const before = JSON.stringify(input);
    redactSensitive(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
