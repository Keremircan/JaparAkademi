CREATE TYPE "public"."competency_grant_source" AS ENUM('training', 'manual');--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD COLUMN "competency_id" uuid;--> statement-breakpoint
ALTER TABLE "competencies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "competencies" ADD COLUMN "validity_months" integer;--> statement-breakpoint
ALTER TABLE "competencies" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD COLUMN "source" "competency_grant_source" DEFAULT 'training' NOT NULL;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD COLUMN "granted_by" uuid;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competencies_org_unit_idx" ON "competencies" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "competency_grants_competency_idx" ON "competency_grants" USING btree ("competency_id","user_id");--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_validity_check" CHECK ("competencies"."validity_months" is null or "competencies"."validity_months" between 1 and 240);