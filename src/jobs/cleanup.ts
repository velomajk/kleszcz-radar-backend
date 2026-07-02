import { and, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { abuseEvents, symptomAccessTokens, verificationRequests } from "../db/schema.js";

const config = loadConfig();
const { db, close } = createDatabase(config);
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

try {
  const result = await db.transaction(async (tx) => {
    const expiredVerifications = await tx.delete(verificationRequests).where(or(
      and(isNull(verificationRequests.consumedAt), lt(verificationRequests.expiresAt, daysAgo(1))),
      and(isNotNull(verificationRequests.consumedAt), lt(verificationRequests.consumedAt, daysAgo(30))),
    )).returning({ id: verificationRequests.id });
    const expiredSymptomTokens = await tx.delete(symptomAccessTokens).where(lt(symptomAccessTokens.expiresAt, daysAgo(7))).returning({ id: symptomAccessTokens.id });
    await tx.update(abuseEvents).set({ emailHmac: null, ipHmac: null }).where(and(
      lt(abuseEvents.createdAt, daysAgo(30)),
      sql`${abuseEvents.emailHmac} IS NOT NULL OR ${abuseEvents.ipHmac} IS NOT NULL`,
    ));
    const expiredAbuseEvents = await tx.delete(abuseEvents).where(lt(abuseEvents.createdAt, daysAgo(365))).returning({ id: abuseEvents.id });
    return { verificationRequests: expiredVerifications.length, symptomTokens: expiredSymptomTokens.length, abuseEvents: expiredAbuseEvents.length };
  });
  console.info(JSON.stringify({ event: "retention_cleanup_complete", ...result }));
} finally {
  await close();
}
