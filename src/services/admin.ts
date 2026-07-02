import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { cellToParent } from "h3-js";
import type { Database } from "../db/client.js";
import { abuseEvents, adminAuditLog, reports, settings, symptoms } from "../db/schema.js";
import { PublicError } from "./reports.js";

export class AdminService {
  constructor(private readonly db: Database) {}

  async stats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [[reportStats], [symptomStats], abuse] = await Promise.all([
      this.db.select({ total: count(), visible: sql<number>`count(*) filter (where ${reports.moderationStatus} = 'visible')::int`, review: sql<number>`count(*) filter (where ${reports.moderationStatus} = 'review')::int` }).from(reports).where(gte(reports.createdAt, since)),
      this.db.select({ total: count() }).from(symptoms).where(gte(symptoms.createdAt, since)),
      this.db.select({ kind: abuseEvents.kind, total: count() }).from(abuseEvents).where(gte(abuseEvents.createdAt, since)).groupBy(abuseEvents.kind),
    ]);
    return { periodDays: 30, reports: reportStats, symptoms: symptomStats, abuse };
  }

  async suspicious(limit: number, offset: number) {
    return this.db.select({
      id: reports.id, occurredOn: reports.occurredOn, h3Cell: reports.h3Cell, placeType: reports.placeType,
      subjectType: reports.subjectType, score: reports.suspiciousScore, status: reports.moderationStatus,
      duplicateOfId: reports.duplicateOfId, createdAt: reports.createdAt,
    }).from(reports).where(sql`${reports.suspiciousScore} > 0 OR ${reports.moderationStatus} <> 'visible'`).orderBy(desc(reports.suspiciousScore), desc(reports.createdAt)).limit(limit).offset(offset);
  }

  async moderate(admin: string, reportId: string, status: "visible" | "excluded" | "review", reason: string) {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(reports).set({ moderationStatus: status, updatedAt: new Date() }).where(eq(reports.id, reportId)).returning({ id: reports.id, status: reports.moderationStatus });
      if (!updated) throw new PublicError(404, "report_not_found", "Report not found");
      await tx.insert(adminAuditLog).values({ adminSubject: admin, action: "moderate_report", targetId: reportId, metadata: { status, reason } });
      return updated;
    });
  }

  async setThreshold(admin: string, threshold: number) {
    await this.db.transaction(async (tx) => {
      await tx.insert(settings).values({ key: "public_min_cell_count", value: threshold, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.key, set: { value: threshold, updatedAt: new Date() } });
      await tx.insert(adminAuditLog).values({ adminSubject: admin, action: "set_public_threshold", metadata: { threshold } });
    });
    return { publicMinimumCellCount: threshold };
  }

  async exportAggregates(from: string, to: string) {
    const [setting] = await this.db.select({ value: settings.value }).from(settings).where(eq(settings.key, "public_min_cell_count")).limit(1);
    const threshold = typeof setting?.value === "number" ? Math.max(5, Math.min(100, Math.trunc(setting.value))) : 7;
    const rows = await this.db.select({
      week: sql<string>`date_trunc('week', ${reports.occurredOn}::timestamp)::date::text`,
      h3Cell: reports.h3Cell, placeType: reports.placeType, subjectType: reports.subjectType,
      reports: sql<number>`count(*)::int`,
      symptomReports: sql<number>`count(${symptoms.id})::int`,
    }).from(reports).leftJoin(symptoms, eq(symptoms.reportId, reports.id)).where(and(
      eq(reports.moderationStatus, "visible"), gte(reports.occurredOn, from), sql`${reports.occurredOn} <= ${to}`,
    )).groupBy(sql`date_trunc('week', ${reports.occurredOn}::timestamp)::date`, reports.h3Cell, reports.placeType, reports.subjectType).having(sql`count(*) >= ${threshold}`);
    return rows.map((row) => ({ ...row, h3Cell: cellToParent(row.h3Cell, 6) }));
  }
}
