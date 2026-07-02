import { describe, expect, it } from "vitest";
import { hmac, normalizeEmail, randomToken, sha256, truncateIp } from "../src/lib/crypto.js";

describe("privacy helpers", () => {
  it("normalizes email before a deterministic keyed digest", () => {
    expect(normalizeEmail("  Person@EXAMPLE.org ")).toBe("person@example.org");
    expect(hmac("person@example.org", "a".repeat(32))).toBe(hmac("person@example.org", "a".repeat(32)));
    expect(hmac("person@example.org", "a".repeat(32))).not.toBe(sha256("person@example.org"));
  });

  it("creates high-entropy URL-safe tokens", () => {
    const first = randomToken(); const second = randomToken();
    expect(first).toHaveLength(43); expect(first).not.toBe(second); expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("coarsens IP addresses before abuse pseudonymization", () => {
    expect(truncateIp("192.0.2.123")).toBe("192.0.2.0/24");
    expect(truncateIp("2001:db8:1234:5678:abcd::1")).toBe("2001:db8:1234:5678::/64");
  });
});
