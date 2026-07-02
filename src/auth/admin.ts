import type { FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import type { Config } from "../config.js";
import { PublicError } from "../services/reports.js";

export type AdminIdentity = { subject: string };

export const requireAdmin = async (request: FastifyRequest, config: Config): Promise<AdminIdentity> => {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) throw new PublicError(401, "unauthorized", "Admin bearer token required");
  try {
    const { payload } = await jwtVerify(value.slice(7), new TextEncoder().encode(config.ADMIN_JWT_SECRET), { issuer: config.ADMIN_JWT_ISSUER, audience: "radar-kleszczy-admin" });
    if (payload.role !== "admin" || !payload.sub) throw new Error("Invalid claims");
    return { subject: payload.sub };
  } catch {
    throw new PublicError(401, "unauthorized", "Invalid admin token");
  }
};
