CREATE TYPE "public"."mark_direction" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TYPE "public"."mark_source" AS ENUM('trainer', 'exam_fail');--> statement-breakpoint
CREATE TYPE "public"."practical_exam_status" AS ENUM('draft', 'awaiting_second_signature', 'final', 'returned');--> statement-breakpoint
CREATE TYPE "public"."practical_fail_reason" AS ENUM('score', 'critical');--> statement-breakpoint
CREATE TYPE "public"."practice_level" AS ENUM('demonstrated', 'supervised', 'independent');--> statement-breakpoint
CREATE TYPE "public"."signature_role" AS ENUM('trainee', 'trainer', 'manager');--> statement-breakpoint
CREATE TABLE "practical_exam_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_module_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" "practical_exam_status" DEFAULT 'draft' NOT NULL,
	"criteria" jsonb NOT NULL,
	"pass_score" integer NOT NULL,
	"score" integer,
	"passed" boolean,
	"fail_reason" "practical_fail_reason",
	"photo_asset_ids" uuid[] DEFAULT '{}' NOT NULL,
	"note" text,
	"evaluator_id" uuid NOT NULL,
	"trainee_signature_id" uuid,
	"trainer_signature_id" uuid,
	"submitted_at" timestamp with time zone,
	"manager_user_id" uuid,
	"manager_signature_id" uuid,
	"return_reason" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practical_exam_results_attempt_unique" UNIQUE("assignment_module_id","attempt_no")
);
--> statement-breakpoint
CREATE TABLE "practice_marks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_module_id" uuid NOT NULL,
	"practice_task_id" uuid NOT NULL,
	"level" "practice_level" NOT NULL,
	"direction" "mark_direction" NOT NULL,
	"note" text,
	"photo_asset_ids" uuid[] DEFAULT '{}' NOT NULL,
	"source" "mark_source" DEFAULT 'trainer' NOT NULL,
	"exam_result_id" uuid,
	"marked_by" uuid NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"signer_user_id" uuid NOT NULL,
	"captured_by" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"role" "signature_role" NOT NULL,
	"subject_hash" text NOT NULL,
	"image_asset_id" uuid NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "practical_exam_results" ADD CONSTRAINT "practical_exam_results_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practical_exam_results" ADD CONSTRAINT "practical_exam_results_evaluator_id_users_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practical_exam_results" ADD CONSTRAINT "practical_exam_results_trainee_signature_id_signatures_id_fk" FOREIGN KEY ("trainee_signature_id") REFERENCES "public"."signatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practical_exam_results" ADD CONSTRAINT "practical_exam_results_trainer_signature_id_signatures_id_fk" FOREIGN KEY ("trainer_signature_id") REFERENCES "public"."signatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practical_exam_results" ADD CONSTRAINT "practical_exam_results_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practical_exam_results" ADD CONSTRAINT "practical_exam_results_manager_signature_id_signatures_id_fk" FOREIGN KEY ("manager_signature_id") REFERENCES "public"."signatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_marks" ADD CONSTRAINT "practice_marks_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_marks" ADD CONSTRAINT "practice_marks_practice_task_id_practice_tasks_id_fk" FOREIGN KEY ("practice_task_id") REFERENCES "public"."practice_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_marks" ADD CONSTRAINT "practice_marks_exam_result_id_practical_exam_results_id_fk" FOREIGN KEY ("exam_result_id") REFERENCES "public"."practical_exam_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_marks" ADD CONSTRAINT "practice_marks_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_user_id_users_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practical_exam_results_status_idx" ON "practical_exam_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "practice_marks_module_task_idx" ON "practice_marks" USING btree ("assignment_module_id","practice_task_id","marked_at");--> statement-breakpoint
CREATE INDEX "signatures_subject_idx" ON "signatures" USING btree ("subject_type","subject_id");