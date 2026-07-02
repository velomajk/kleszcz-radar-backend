import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createEmailSender } from "./integrations/email.js";
import { SlidingLimiter } from "./lib/rate-limit.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerPublicRoutes } from "./routes/public.js";
import { AdminService } from "./services/admin.js";
import { HeatmapService } from "./services/heatmap.js";
import { PublicError, ReportService } from "./services/reports.js";
import { SymptomService } from "./services/symptoms.js";

export const buildApp = async (config: Config) => {
  const app = Fastify({
    trustProxy: true,
    logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.authorization", "req.headers.x-symptom-token", "req.body.email", "req.body.token", "req.body.turnstileToken"] },
    bodyLimit: 32 * 1024,
    requestTimeout: 10_000,
  });
  const database = createDatabase(config);
  const limiter = new SlidingLimiter(config);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.CORS_ORIGINS.split(",").filter(Boolean), methods: ["GET", "POST", "PUT", "PATCH"] });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  const reportService = new ReportService(database.db, config, createEmailSender(config), limiter);
  await registerPublicRoutes(app, { reports: reportService, symptoms: new SymptomService(database.db), heatmap: new HeatmapService(database.db, config) });
  await registerAdminRoutes(app, new AdminService(database.db), config);

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async () => { await database.db.execute("select 1"); return { status: "ok" }; });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: "validation_error", message: "Invalid request", details: error.issues.map(({ path, message }) => ({ path, message })) } });
    const httpError = error instanceof Error ? error as Error & { statusCode?: number; code?: string } : undefined;
    if (error instanceof PublicError || (httpError?.statusCode !== undefined && httpError.statusCode < 500)) return reply.code(httpError?.statusCode ?? 400).send({ error: { code: httpError?.code ?? "bad_request", message: httpError?.message ?? "Bad request" } });
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ error: { code: "internal_error", message: "Unexpected server error" } });
  });

  app.addHook("onClose", async () => { await Promise.all([database.close(), limiter.close()]); });
  return app;
};
