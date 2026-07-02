import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const placeType = pgEnum("place_type", ["forest", "meadow", "park", "garden", "allotment", "urban", "other"]);
export const subjectType = pgEnum("subject_type", ["adult", "child", "animal"]);
export const removalMethod = pgEnum("removal_method", ["tweezers", "tick_tool", "fingers", "professional", "other", "unknown"]);
export const moderationStatus = pgEnum("moderation_status", ["visible", "excluded", "review"]);

export type ReportDraft = {
  occurredOn: string;
  h3Cell: string;
  placeType: (typeof placeType.enumValues)[number];
  subjectType: (typeof subjectType.enumValues)[number];
  tickRemoved: boolean;
  removalMethod?: (typeof removalMethod.enumValues)[number];
  estimatedAttachmentHours?: number;
};

export const verificationRequests = pgTable("verification_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: text("token_hash").notNull(),
  emailHmac: text("email_hmac").notNull(),
  ipHmac: text("ip_hmac").notNull(),
  reportDraft: jsonb("report_draft").$type<ReportDraft>().notNull(),
  suspiciousScore: integer("suspicious_score").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("verification_token_hash_uq").on(t.tokenHash), index("verification_email_created_idx").on(t.emailHmac, t.createdAt)]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  h3Cell: text("h3_cell").notNull(),
  placeType: placeType("place_type").notNull(),
  subjectType: subjectType("subject_type").notNull(),
  tickRemoved: boolean("tick_removed").notNull(),
  removalMethod: removalMethod("removal_method"),
  estimatedAttachmentHours: integer("estimated_attachment_hours"),
  suspiciousScore: integer("suspicious_score").notNull().default(0),
  moderationStatus: moderationStatus("moderation_status").notNull().default("visible"),
  duplicateOfId: uuid("duplicate_of_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("reports_public_aggregate_idx").on(t.occurredOn, t.h3Cell, t.moderationStatus), index("reports_review_idx").on(t.moderationStatus, t.suspiciousScore)]);

export const symptomAccessTokens = pgTable("symptom_access_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("symptom_token_hash_uq").on(t.tokenHash), uniqueIndex("symptom_report_uq").on(t.reportId)]);

export const symptoms = pgTable("symptoms", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  rash: boolean("rash").notNull().default(false),
  expandingRash: boolean("expanding_rash").notNull().default(false),
  fever: boolean("fever").notNull().default(false),
  headache: boolean("headache").notNull().default(false),
  muscleOrJointPain: boolean("muscle_or_joint_pain").notNull().default(false),
  neckStiffness: boolean("neck_stiffness").notNull().default(false),
  nauseaOrVomiting: boolean("nausea_or_vomiting").notNull().default(false),
  neurologicalSymptoms: boolean("neurological_symptoms").notNull().default(false),
  doctorContacted: boolean("doctor_contacted").notNull().default(false),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("symptoms_report_uq").on(t.reportId)]);

export const abuseEvents = pgTable("abuse_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  ipHmac: text("ip_hmac"),
  emailHmac: text("email_hmac"),
  score: integer("score").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("abuse_kind_created_idx").on(t.kind, t.createdAt)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminSubject: text("admin_subject").notNull(),
  action: text("action").notNull(),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publicCells = pgTable("public_cells", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  reportCount: integer("report_count").notNull(),
  generationMs: real("generation_ms").notNull(),
}, (t) => [index("public_cells_expiry_idx").on(t.expiresAt)]);

export const now = sql`now()`;
