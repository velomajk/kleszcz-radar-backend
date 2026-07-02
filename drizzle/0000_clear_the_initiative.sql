CREATE TYPE "public"."moderation_status" AS ENUM('visible', 'excluded', 'review');--> statement-breakpoint
CREATE TYPE "public"."place_type" AS ENUM('forest', 'meadow', 'park', 'garden', 'allotment', 'urban', 'other');--> statement-breakpoint
CREATE TYPE "public"."removal_method" AS ENUM('tweezers', 'tick_tool', 'fingers', 'professional', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('adult', 'child', 'animal');--> statement-breakpoint
CREATE TABLE "abuse_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ip_hmac" text,
	"email_hmac" text,
	"score" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_subject" text NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_cells" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"report_count" integer NOT NULL,
	"generation_ms" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_on" date NOT NULL,
	"h3_cell" text NOT NULL,
	"place_type" "place_type" NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"tick_removed" boolean NOT NULL,
	"removal_method" "removal_method",
	"estimated_attachment_hours" integer,
	"suspicious_score" integer DEFAULT 0 NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'visible' NOT NULL,
	"duplicate_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"rash" boolean DEFAULT false NOT NULL,
	"expanding_rash" boolean DEFAULT false NOT NULL,
	"fever" boolean DEFAULT false NOT NULL,
	"headache" boolean DEFAULT false NOT NULL,
	"muscle_or_joint_pain" boolean DEFAULT false NOT NULL,
	"neck_stiffness" boolean DEFAULT false NOT NULL,
	"nausea_or_vomiting" boolean DEFAULT false NOT NULL,
	"neurological_symptoms" boolean DEFAULT false NOT NULL,
	"doctor_contacted" boolean DEFAULT false NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email_hmac" text NOT NULL,
	"ip_hmac" text NOT NULL,
	"report_draft" jsonb NOT NULL,
	"suspicious_score" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "symptom_access_tokens" ADD CONSTRAINT "symptom_access_tokens_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_kind_created_idx" ON "abuse_events" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "public_cells_expiry_idx" ON "public_cells" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reports_public_aggregate_idx" ON "reports" USING btree ("occurred_on","h3_cell","moderation_status");--> statement-breakpoint
CREATE INDEX "reports_review_idx" ON "reports" USING btree ("moderation_status","suspicious_score");--> statement-breakpoint
CREATE UNIQUE INDEX "symptom_token_hash_uq" ON "symptom_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "symptom_report_uq" ON "symptom_access_tokens" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "symptoms_report_uq" ON "symptoms" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_token_hash_uq" ON "verification_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_email_created_idx" ON "verification_requests" USING btree ("email_hmac","created_at");