import type { Config } from "../config.js";

type TurnstileResponse = { success: boolean; "error-codes"?: string[]; action?: string };

export const verifyTurnstile = async (config: Config, token: string, remoteIp: string): Promise<boolean> => {
  if (config.TURNSTILE_BYPASS && config.NODE_ENV !== "production") return true;
  const body = new URLSearchParams({ secret: config.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return false;
  const result = await response.json() as TurnstileResponse;
  return result.success;
};
