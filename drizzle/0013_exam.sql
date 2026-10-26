CREATE TYPE "public"."exam_event_kind" AS ENUM('tab_hidden', 'tab_visible', 'blur', 'reconnect');--> statement-breakpoint
CREATE TYPE "public"."exam_fail_reason" AS ENUM('score', 'ohs_critical');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'true_false');--> statement-breakpoint
CREATE TYPE "public"."question_version_status" AS ENUM('ohs_review', 'active', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."exam_submit_reason" AS ENUM('user', 'timeout');--> statement-breakpoint
CREATE TABLE "attempt_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_module_id" uuid NOT NULL,
	"extra_attempts" integer NOT NULL,
	"reason" text NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_attempt_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"kind" "exam_event_kind" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_attempt_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"question_version_id" uuid NOT NULL,
	"option_order" integer[] NOT NULL,
	"answer_index" integer,
	"is_correct" boolean,
	"answered_at" timestamp with time zone,
	CONSTRAINT "exam_attempt_items_attempt_order_unique" UNIQUE("attempt_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_module_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"proctor_session_id" uuid,
	"proctor_user_id" uuid,
	"question_count" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"pass_score" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"submit_reason" "exam_submit_reason",
	"score" integer,
	"passed" boolean,
	"fail_reason" "exam_fail_reason",
	"ip" text,
	"user_agent" text,
	"tts_used" boolean DEFAULT false NOT NULL,
	"tab_leave_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_attempts_module_no_unique" UNIQUE("assignment_module_id","attempt_no"),
	CONSTRAINT "exam_attempts_result_check" CHECK (("exam_attempts"."submitted_at" is null) = ("exam_attempts"."passed" is null))
);
--> statement-breakpoint
CREATE TABLE "proctor_code_failures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proctor_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proctor_user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_modules" (
	"question_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	CONSTRAINT "question_modules_question_id_module_id_pk" PRIMARY KEY("question_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"stem" text NOT NULL,
	"media_asset_id" uuid,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"topic" text NOT NULL,
	"difficulty" integer NOT NULL,
	"is_ohs_critical" boolean DEFAULT false NOT NULL,
	"status" "question_version_status" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_versions_question_version_unique" UNIQUE("question_id","version"),
	CONSTRAINT "question_versions_difficulty_check" CHECK ("question_versions"."difficulty" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_org_unit_id" uuid,
	"is_ohs" boolean DEFAULT false NOT NULL,
	"current_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_common_ohs_check" CHECK ("questions"."owner_org_unit_id" is not null or "questions"."is_ohs")
);
--> statement-breakpoint
ALTER TABLE "assignment_items" ADD COLUMN "round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_modules" ADD COLUMN "round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_grants" ADD CONSTRAINT "attempt_grants_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_grants" ADD CONSTRAINT "attempt_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempt_events" ADD CONSTRAINT "exam_attempt_events_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempt_items" ADD CONSTRAINT "exam_attempt_items_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempt_items" ADD CONSTRAINT "exam_attempt_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_proctor_session_id_proctor_sessions_id_fk" FOREIGN KEY ("proctor_session_id") REFERENCES "public"."proctor_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_proctor_user_id_users_id_fk" FOREIGN KEY ("proctor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proctor_code_failures" ADD CONSTRAINT "proctor_code_failures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proctor_sessions" ADD CONSTRAINT "proctor_sessions_proctor_user_id_users_id_fk" FOREIGN KEY ("proctor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_modules" ADD CONSTRAINT "question_modules_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_modules" ADD CONSTRAINT "question_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_owner_org_unit_id_org_units_id_fk" FOREIGN KEY ("owner_org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_version_id_question_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_attempt_events_attempt_idx" ON "exam_attempt_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "exam_attempt_items_version_idx" ON "exam_attempt_items" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "proctor_code_failures_user_idx" ON "proctor_code_failures" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "proctor_sessions_code_idx" ON "proctor_sessions" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "question_modules_module_idx" ON "question_modules" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "question_versions_status_idx" ON "question_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "questions_owner_idx" ON "questions" USING btree ("owner_org_unit_id");