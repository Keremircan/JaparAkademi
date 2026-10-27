CREATE TYPE "public"."certificate_kind" AS ENUM('position_competency', 'attendance');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('valid', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."competency_kind" AS ENUM('machine', 'task');--> statement-breakpoint
CREATE TYPE "public"."process_decision" AS ENUM('extra_attempt', 'extra_training', 'end_process');--> statement-breakpoint
CREATE TYPE "public"."readiness_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."mark_source" ADD VALUE 'readiness';--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"serial_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "certificates_serial_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"kind" "certificate_kind" NOT NULL,
	"assignment_id" uuid,
	"assignment_module_id" uuid,
	"position_id" uuid,
	"title" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"verify_token" text NOT NULL,
	"pdf_asset_id" uuid,
	"approved_by" uuid,
	"issued_by" uuid NOT NULL,
	"status" "certificate_status" DEFAULT 'valid' NOT NULL,
	"revoked_reason" text,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "certificates_verifyToken_unique" UNIQUE("verify_token")
);
--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "competency_kind" NOT NULL,
	"org_unit_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competency_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"certificate_id" uuid,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"decision" "process_decision" NOT NULL,
	"reason" text NOT NULL,
	"exam_module_id" uuid,
	"extra_attempts" integer,
	"reopen_module_ids" uuid[] DEFAULT '{}' NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"decision" "readiness_decision" NOT NULL,
	"comment" text,
	"reopen_module_ids" uuid[] DEFAULT '{}' NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_pdf_asset_id_media_assets_id_fk" FOREIGN KEY ("pdf_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_records" ADD CONSTRAINT "decision_records_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_records" ADD CONSTRAINT "decision_records_exam_module_id_assignment_modules_id_fk" FOREIGN KEY ("exam_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_records" ADD CONSTRAINT "decision_records_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_decisions" ADD CONSTRAINT "readiness_decisions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_decisions" ADD CONSTRAINT "readiness_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificates_user_idx" ON "certificates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "certificates_assignment_idx" ON "certificates" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "competency_grants_user_idx" ON "competency_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decision_records_assignment_idx" ON "decision_records" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "readiness_decisions_assignment_idx" ON "readiness_decisions" USING btree ("assignment_id");