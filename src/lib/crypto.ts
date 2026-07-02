import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const normalizeEmail = (email: string): string => email.trim().toLowerCase().normalize("NFKC");
export const hmac = (value: string, secret: string): string => createHmac("sha256", secret).update(value).digest("base64url");
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("base64url");
export const randomToken = (): string => randomBytes(32).toString("base64url");
export const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

// A network prefix is sufficient for throttling and less identifying than a full address.
export const truncateIp = (ip: string): string => {
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".0/24";
  return ip.split(":").slice(0, 4).join(":") + "::/64";
};
