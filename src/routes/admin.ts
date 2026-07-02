import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { requireAdmin } from "../auth/admin.js";
import type { AdminService } from "../services/admin.js";

const pagination = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) });
const moderation = z.object({ status: z.enum(["visible", "excluded", "review"]), reason: z.string().trim().min(3).max(500) }).strict();
const threshold = z.object({ publicMinimumCellCount: z.number().int().min(5).max(100) }).strict();
const exportQuery = z.object({ from: z.string().date(), to: z.string().date() }).refine((q) => q.from <= q.to, "Invalid date range");

const csv = (rows: Array<Record<string, unknown>>): string => {
  if (rows.length === 0) return "week,h3Cell,placeType,subjectType,reports,symptomReports\n";
  const keys = Object.keys(rows[0]!);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${keys.join(",")}\n${rows.map((row) => keys.map((key) => escape(row[key])).join(",")).join("\n")}\n`;
};

export const registerAdminRoutes = async (app: FastifyInstance, admin: AdminService, config: Config) => {
  app.get("/v1/admin/stats", async (request) => { await requireAdmin(request, config); return admin.stats(); });
  app.get("/v1/admin/reports/suspicious", async (request) => {
    await requireAdmin(request, config); const query = pagination.parse(request.query); return admin.suspicious(query.limit, query.offset);
  });
  app.patch("/v1/admin/reports/:id/moderation", async (request) => {
    const identity = await requireAdmin(request, config);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = moderation.parse(request.body);
    return admin.moderate(identity.subject, id, body.status, body.reason);
  });
  app.put("/v1/admin/settings/privacy-threshold", async (request) => {
    const identity = await requireAdmin(request, config); const body = threshold.parse(request.body);
    return admin.setThreshold(identity.subject, body.publicMinimumCellCount);
  });
  app.get("/v1/admin/exports/aggregates.csv", async (request, reply) => {
    await requireAdmin(request, config); const query = exportQuery.parse(request.query);
    const rows = await admin.exportAggregates(query.from, query.to);
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="radar-kleszczy-${query.from}-${query.to}.csv"`).send(csv(rows));
  });
};
