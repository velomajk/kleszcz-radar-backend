import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { latLngToCell } from "h3-js";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import { abuseEvents, reports, symptomAccessTokens, verificationRequests, type ReportDraft } from "../db/schema.js";
import type { EmailSender } from "../integrations/email.js";
import { verifyTurnstile } from "../integrations/turnstile.js";
import { hmac, normalizeEmail, randomToken, sha256, truncateIp } from "../lib/crypto.js";
import type { SlidingLimiter } from "../lib/rate-limit.js";
import type { ReportInput } from "../lib/validation.js";

export class PublicError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) { super(message); }
}

type RequestContext = { ip: string; userAgent?: string };

const ageDays = (date: string): number => Math.floor((Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 86_400_000);

export class ReportService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
    private readonly email: EmailSender,
    private readonly limiter: SlidingLimiter,
  ) {}

  async requestVerification(input: ReportInput, context: RequestContext) {
    const email = normalizeEmail(input.email);
    const emailHmac = hmac(email, this.config.EMAIL_HMAC_SECRET);
    const ipHmac = hmac(truncateIp(context.ip), this.config.IP_HMAC_SECRET);

    const [ipLimit, emailLimit] = await Promise.all([
      this.limiter.check(`report-ip:${ipHmac}`, 10, 86_400),
      this.limiter.check(`report-email:${emailHmac}`, 4, 86_400),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      await this.db.insert(abuseEvents).values({ kind: "rate_limit", ipHmac, emailHmac, score: 30 });
      throw new PublicError(429, "rate_limited", "Too many verification attempts");
    }
    if (!await verifyTurnstile(this.config, input.turnstileToken, context.ip)) {
      await this.db.insert(abuseEvents).values({ kind: "turnstile_failed", ipHmac, emailHmac, score: 25 });
      throw new PublicError(400, "challenge_failed", "Anti-spam verification failed");
    }

    const h3Cell = latLngToCell(input.latitude, input.longitude, this.config.H3_RESOLUTION);
    const draft: ReportDraft = {
      occurredOn: input.occurredOn,
      h3Cell,
      placeType: input.placeType,
      subjectType: input.subjectType,
      tickRemoved: input.tickRemoved,
      ...(input.removalMethod ? { removalMethod: input.removalMethod } : {}),
      ...(input.estimatedAttachmentHours !== undefined ? { estimatedAttachmentHours: input.estimatedAttachmentHours } : {}),
    };

    let suspiciousScore = 0;
    if (ageDays(input.occurredOn) > 180) suspiciousScore += 15;
    if ((context.userAgent?.length ?? 0) < 8) suspiciousScore += 10;
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.config.MAGIC_LINK_TTL_MINUTES * 60_000);
    await this.db.insert(verificationRequests).values({ tokenHash: sha256(token), emailHmac, ipHmac, reportDraft: draft, suspiciousScore, expiresAt });

    // The email exists only in this call's memory and is sent directly to the provider.
    const verificationUrl = `${this.config.PUBLIC_APP_URL}/verify-report?token=${encodeURIComponent(token)}`;
    await this.email.sendVerification(email, verificationUrl);
    return { status: "verification_sent" as const, expiresInSeconds: this.config.MAGIC_LINK_TTL_MINUTES * 60 };
  }

  async confirm(token: string) {
    return this.db.transaction(async (tx) => {
      const [verification] = await tx.update(verificationRequests)
        .set({ consumedAt: new Date() })
        .where(and(eq(verificationRequests.tokenHash, sha256(token)), isNull(verificationRequests.consumedAt), gte(verificationRequests.expiresAt, new Date())))
        .returning();
      if (!verification) throw new PublicError(410, "invalid_or_expired_token", "Verification link is invalid, expired, or already used");

      const d = verification.reportDraft;
      const duplicateSince = new Date(Date.now() - 24 * 60 * 60_000);
      const [duplicate] = await tx.select({ id: reports.id }).from(reports).where(and(
        eq(reports.h3Cell, d.h3Cell), eq(reports.occurredOn, d.occurredOn), eq(reports.subjectType, d.subjectType),
        eq(reports.placeType, d.placeType), gte(reports.createdAt, duplicateSince),
      )).orderBy(desc(reports.createdAt)).limit(1);
      const score = verification.suspiciousScore + (duplicate ? 35 : 0);
      const [report] = await tx.insert(reports).values({
        occurredOn: d.occurredOn, h3Cell: d.h3Cell, placeType: d.placeType, subjectType: d.subjectType,
        tickRemoved: d.tickRemoved, removalMethod: d.removalMethod, estimatedAttachmentHours: d.estimatedAttachmentHours,
        suspiciousScore: score, moderationStatus: score >= 35 ? "review" : "visible", duplicateOfId: duplicate?.id,
      }).returning({ id: reports.id });
      if (!report) throw new Error("Report insertion failed");

      const symptomToken = randomToken();
      const symptomExpiresAt = new Date(Date.now() + this.config.SYMPTOM_LINK_TTL_DAYS * 86_400_000);
      await tx.insert(symptomAccessTokens).values({ reportId: report.id, tokenHash: sha256(symptomToken), expiresAt: symptomExpiresAt });
      // Do not place report identifiers and email/IP pseudonyms in the same row.
      if (score > 0) await tx.insert(abuseEvents).values({ kind: duplicate ? "possible_duplicate" : "suspicious_report", score, metadata: { reportId: report.id } });

      return {
        status: "report_created" as const,
        symptomUrl: `${this.config.PUBLIC_APP_URL}/symptoms/${symptomToken}`,
        symptomLinkExpiresAt: symptomExpiresAt.toISOString(),
      };
    });
  }
}
