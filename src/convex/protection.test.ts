import { describe, expect, it } from "vitest";
import { normalizeIndicator } from "./protection";

/**
 * `normalizeIndicator` is the contract that makes lookups actually match —
 * and the same rules are duplicated in
 * jaal-companion/src/protection/threatIntel.ts (normalizePhone) and
 * modules/caller-screening/.../IndicatorStore.kt (normalizePhone). If these
 * diverge, a number the backend flags would never match on-device, so the
 * folding rules are pinned down here.
 */
describe("normalizeIndicator — phone", () => {
  it("folds Indian country code, trunk zero and formatting", () => {
    const expected = "9876543210";
    for (const input of [
      "9876543210",
      "+91 98765 43210",
      "09876543210",
      "00919876543210",
      "91-98765-43210",
      "tel:+919876543210",
    ]) {
      expect(normalizeIndicator("phone", input), input).toBe(expected);
    }
  });

  it("keeps non-Indian numbers intact", () => {
    expect(normalizeIndicator("phone", "+1 415 555 0100")).toBe("14155550100");
  });

  it("rejects numbers that are not plausible", () => {
    expect(normalizeIndicator("phone", "123")).toBeNull();
    expect(normalizeIndicator("phone", "")).toBeNull();
  });
});

describe("normalizeIndicator — url / domain", () => {
  it("lowercases the host, drops www, fragment and default port", () => {
    expect(
      normalizeIndicator("url", "HTTPS://WWW.Example.com:443/a/b?x=1#frag"),
    ).toBe("example.com/a/b?x=1");
  });

  it("keeps the path and query — they matter for phishing", () => {
    expect(
      normalizeIndicator("url", "https://example.com/login?next=evil"),
    ).toBe("example.com/login?next=evil");
  });

  it("reduces a bare domain to its host", () => {
    expect(normalizeIndicator("domain", "https://www.Example.com/path")).toBe(
      "example.com",
    );
    expect(normalizeIndicator("domain", "EXAMPLE.COM.")).toBe("example.com");
  });

  it("rejects garbage", () => {
    expect(normalizeIndicator("domain", "not a host")).toBeNull();
    expect(normalizeIndicator("url", "   ")).toBeNull();
  });
});

describe("normalizeIndicator — upi", () => {
  it("lowercases and strips the scheme", () => {
    expect(normalizeIndicator("upi", "UPI://Name@OKICICI")).toBe(
      "name@okicici",
    );
  });

  it("rejects values that are not a valid VPA", () => {
    expect(normalizeIndicator("upi", "not-an-upi-id")).toBeNull();
  });
});

describe("normalizeIndicator — message_pattern", () => {
  it("collapses whitespace and lowercases", () => {
    expect(
      normalizeIndicator("message_pattern", "  Send   the OTP  NOW  "),
    ).toBe("send the otp now");
  });

  it("requires enough text to be a usable pattern", () => {
    expect(normalizeIndicator("message_pattern", "hi")).toBeNull();
  });
});
