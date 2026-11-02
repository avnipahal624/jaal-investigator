/**
 * Deterministic link safety check. Purely string-based — it NEVER opens,
 * fetches, or resolves the URL (no network access at all). It only reasons
 * about the URL text the user pasted.
 */

export interface LinkFlag {
  label: string;
  level: "LOW" | "MEDIUM" | "HIGH";
}

export interface LinkCheck {
  valid: boolean;
  host: string;
  protocol: string;
  flags: LinkFlag[];
}

const SUSPICIOUS_TLDS = new Set([
  "zip", "mov", "xyz", "top", "click", "link", "gq", "tk", "ml", "cf", "work", "loan", "country", "stream",
]);

const URGENCY_WORDS = [
  "verify", "confirm", "update", "secure", "login", "signin", "account",
  "password", "otp", "bank", "blocked", "suspend", "expire", "prize", "winner", "kyc",
];

/** Analyse a pasted URL string without ever opening it. */
export function checkLink(raw: string): LinkCheck {
  const input = raw.trim();
  const flags: LinkFlag[] = [];

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return {
      valid: false,
      host: "",
      protocol: "",
      flags: [{ label: "Not a complete URL (needs https://…)", level: "MEDIUM" }],
    };
  }

  const host = url.hostname.toLowerCase();
  const full = input.toLowerCase();

  if (url.protocol === "http:") {
    flags.push({ label: "Uses unencrypted http://, not https://", level: "MEDIUM" });
  }

  // Raw IP address as host.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    flags.push({ label: "Host is a raw IP address, not a normal domain", level: "HIGH" });
  }

  // Punycode / IDN homoglyph attempt.
  if (host.includes("xn--")) {
    flags.push({ label: "Domain uses punycode (possible lookalike)", level: "HIGH" });
  }

  // Suspicious TLD.
  const tld = host.split(".").pop() ?? "";
  if (SUSPICIOUS_TLDS.has(tld)) {
    flags.push({ label: `Unusually risky domain ending .${tld}`, level: "MEDIUM" });
  }

  // Many subdomains (e.g. a.b.c.d.example.com).
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 5) {
    flags.push({ label: "Unusually many subdomains", level: "MEDIUM" });
  }

  // Excessive hyphens / digits in the main domain label.
  const main = parts.length >= 2 ? parts[parts.length - 2] : host;
  if (main && (main.split("-").length >= 4 || /\d{4,}/.test(main))) {
    flags.push({ label: "Domain name looks randomly generated", level: "MEDIUM" });
  }

  // Urgency / credential words anywhere in the URL.
  const hits = URGENCY_WORDS.filter((w) => full.includes(w));
  if (hits.length > 0) {
    flags.push({
      label: `Contains words often used in scams (${hits.slice(0, 4).join(", ")})`,
      level: hits.length >= 3 ? "HIGH" : "MEDIUM",
    });
  }

  // Very long URL.
  if (input.length > 120) {
    flags.push({ label: "Unusually long URL", level: "LOW" });
  }

  return { valid: true, host, protocol: url.protocol.replace(":", ""), flags };
}
