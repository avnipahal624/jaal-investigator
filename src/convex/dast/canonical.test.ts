import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalJsonPretty, canonicalize } from "./canonical";

describe("canonical security serialization", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = {
      z: 1,
      a: { beta: true, alpha: ["second", "first"] },
      nested: [{ y: 2, x: 1 }],
    };
    const right = {
      nested: [{ x: 1, y: 2 }],
      a: { alpha: ["second", "first"], beta: true },
      z: 1,
    };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJson(left)).toContain('"alpha":["second","first"]');
  });

  it("drops undefined optional fields and keeps stable whitespace", () => {
    expect(canonicalJson({ a: 1, omitted: undefined, b: true })).toBe('{"a":1,"b":true}');
    expect(canonicalJsonPretty({ b: true, a: 1 })).toBe('{\n  "a": 1,\n  "b": true\n}');
  });

  it("refuses non-finite numbers instead of producing invalid JSON", () => {
    expect(() => canonicalize({ value: Number.NaN })).toThrow(/non-finite/i);
    expect(() => canonicalize({ value: Infinity })).toThrow(/non-finite/i);
  });
});
