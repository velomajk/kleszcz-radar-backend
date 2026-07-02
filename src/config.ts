import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((value) => value === "true");

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PUBLIC_APP_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default(""),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().min(3),
  RESEND_API_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  TURNSTILE_BYPASS: bool.default("false"),
  EMAIL_HMAC_SECRET: z.string().min(32),
  IP_HMAC_SECRET: z.string().min(32),
  ADMIN_JWT_SECRET: z.string().min(32),
  ADMIN_JWT_ISSUER: z.string().default("radar-kleszczy-admin"),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(20),
  SYMPTOM_LINK_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(45),
  H3_RESOLUTION: z.coerce.number().int().min(0).max(15).default(7),
  PUBLIC_MIN_CELL_COUNT: z.coerce.number().int().min(5).max(100).default(7),
  SEASON_START_MONTH: z.coerce.number().int().min(1).max(12).default(3),
});

export type Config = z.infer<typeof configSchema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => configSchema.parse(env);
