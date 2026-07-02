import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { symptomAccessTokens, symptoms } from "../db/schema.js";
import { sha256 } from "../lib/crypto.js";
import type { SymptomInput } from "../lib/validation.js";
import { PublicError } from "./reports.js";

export class SymptomService {
  constructor(private readonly db: Database) {}

  private async resolve(token: string) {
    const [access] = await this.db.select({ reportId: symptomAccessTokens.reportId, expiresAt: symptomAccessTokens.expiresAt })
      .from(symptomAccessTokens).where(and(eq(symptomAccessTokens.tokenHash, sha256(token)), isNull(symptomAccessTokens.revokedAt), gte(symptomAccessTokens.expiresAt, new Date()))).limit(1);
    if (!access) throw new PublicError(410, "invalid_or_expired_token", "Symptom link is invalid or expired");
    return access;
  }

  async status(token: string) {
    const access = await this.resolve(token);
    const [existing] = await this.db.select({ observedAt: symptoms.observedAt, updatedAt: symptoms.updatedAt }).from(symptoms).where(eq(symptoms.reportId, access.reportId)).limit(1);
    return { valid: true, expiresAt: access.expiresAt.toISOString(), submitted: Boolean(existing), lastUpdatedAt: existing?.updatedAt.toISOString() ?? null };
  }

  async submit(token: string, input: SymptomInput) {
    const access = await this.resolve(token);
    const values = { reportId: access.reportId, ...input, observedAt: new Date(input.observedAt), updatedAt: new Date() };
    await this.db.insert(symptoms).values(values).onConflictDoUpdate({
      target: symptoms.reportId,
      set: { ...input, observedAt: new Date(input.observedAt), updatedAt: sql`now()` },
    });
    return { status: "symptoms_saved" as const, disclaimer: "Stored for public-health statistics only. This is not a diagnosis." };
  }
}
