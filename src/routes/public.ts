import type { FastifyInstance } from "fastify";
import type { HeatmapService } from "../services/heatmap.js";
import type { ReportService } from "../services/reports.js";
import type { SymptomService } from "../services/symptoms.js";
import { heatmapQuerySchema, magicTokenSchema, reportInputSchema, symptomInputSchema } from "../lib/validation.js";

const symptomToken = (headers: Record<string, string | string[] | undefined>): string => {
  const value = headers["x-symptom-token"];
  if (typeof value !== "string" || value.length < 40 || value.length > 100) throw Object.assign(new Error("Valid symptom token required"), { statusCode: 401, code: "invalid_symptom_token" });
  return value;
};

export const registerPublicRoutes = async (app: FastifyInstance, services: { reports: ReportService; symptoms: SymptomService; heatmap: HeatmapService }) => {
  app.post("/v1/report-verifications", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const input = reportInputSchema.parse(request.body);
    const result = await services.reports.requestVerification(input, { ip: request.ip, ...(request.headers["user-agent"] ? { userAgent: request.headers["user-agent"] } : {}) });
    return reply.code(202).send(result);
  });

  app.post("/v1/report-verifications/confirm", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { token } = magicTokenSchema.parse(request.body);
    return reply.code(201).send(await services.reports.confirm(token));
  });

  app.get("/v1/symptoms/status", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => services.symptoms.status(symptomToken(request.headers)));
  app.put("/v1/symptoms", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const input = symptomInputSchema.parse(request.body);
    return services.symptoms.submit(symptomToken(request.headers), input);
  });

  app.get("/v1/heatmap", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("cache-control", "public, max-age=300, stale-while-revalidate=900");
    return services.heatmap.get(heatmapQuerySchema.parse(request.query));
  });
};
