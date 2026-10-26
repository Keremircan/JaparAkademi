CREATE TYPE "public"."assignment_item_kind" AS ENUM('content', 'card_section');--> statement-breakpoint
CREATE TYPE "public"."assignment_module_status" AS ENUM('locked', 'available', 'in_progress', 'completed', 'review_required', 'waived');--> statement-breakpoint
CREATE TYPE "public"."assignment_reason" AS ENUM('new_hire', 'position_change', 'recertification', 'extra_training');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('active', 'awaiting_readiness', 'awaiting_decision', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."classroom_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."completed_via" AS ENUM('online', 'classroom', 'carried_over');--> statement-breakpoint
CREATE TYPE "public"."device_kind" AS ENUM('shared_pc', 'kiosk');--> statement-breakpoint
CREATE TYPE "public"."quiz_question_type" AS ENUM('single_choice', 'true_false');--> statement-breakpoint
CREATE TABLE "assignment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_module_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"kind" "assignment_item_kind" NOT NULL,
	"content_id" uuid,
	"content_version_id" uuid,
	"card_version_id" uuid,
	"section_key" text,
	"started_at" timestamp with time zone,
	"watched_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress_ratio" real DEFAULT 0 NOT NULL,
	"reached_end_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_items_kind_check" CHECK (("assignment_items"."kind" = 'content' and "assignment_items"."content_version_id" is not null) or ("assignment_items"."kind" = 'card_section' and "assignment_items"."card_version_id" is not null and "assignment_items"."section_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "assignment_modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"is_common" boolean DEFAULT false NOT NULL,
	"kind" "module_kind" NOT NULL,
	"title" text NOT NULL,
	"duration_min" integer NOT NULL,
	"is_ohs" boolean NOT NULL,
	"remote_allowed" boolean NOT NULL,
	"validity_months" integer,
	"is_required" boolean NOT NULL,
	"prerequisite_module_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pinned_task_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "assignment_module_status" DEFAULT 'locked' NOT NULL,
	"unlocked_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_via" "completed_via",
	"carried_from_id" uuid,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_modules_assignment_module_unique" UNIQUE("assignment_id","module_id"),
	CONSTRAINT "assignment_modules_completed_check" CHECK (("assignment_modules"."status" = 'completed') = ("assignment_modules"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"card_version_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"reason" "assignment_reason" NOT NULL,
	"trainer_user_id" uuid,
	"start_date" date NOT NULL,
	"target_date" date,
	"status" "assignment_status" DEFAULT 'active' NOT NULL,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_cancel_check" CHECK (("assignments"."status" = 'cancelled') = ("assignments"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "classroom_attendees" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "classroom_attendees_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "classroom_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"trainer_user_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"duration_min" integer NOT NULL,
	"location" text NOT NULL,
	"scanned_form_asset_id" uuid,
	"notes" text,
	"status" "classroom_status" DEFAULT 'draft' NOT NULL,
	"recorded_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classroom_sessions_duration_check" CHECK ("classroom_sessions"."duration_min" > 0 and "classroom_sessions"."duration_min" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "device_kind" DEFAULT 'shared_pc' NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"registered_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "devices_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"type" "quiz_question_type" NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_module_id" uuid NOT NULL,
	"quiz_question_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"answer_index" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reread_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "reread_tasks_user_version_unique" UNIQUE("user_id","content_version_id")
);
--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_card_version_id_position_card_versions_id_fk" FOREIGN KEY ("card_version_id") REFERENCES "public"."position_card_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_modules" ADD CONSTRAINT "assignment_modules_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_modules" ADD CONSTRAINT "assignment_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_card_version_id_position_card_versions_id_fk" FOREIGN KEY ("card_version_id") REFERENCES "public"."position_card_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_plan_id_training_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_attendees" ADD CONSTRAINT "classroom_attendees_session_id_classroom_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."classroom_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_attendees" ADD CONSTRAINT "classroom_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_scanned_form_asset_id_media_assets_id_fk" FOREIGN KEY ("scanned_form_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD CONSTRAINT "quiz_responses_assignment_module_id_assignment_modules_id_fk" FOREIGN KEY ("assignment_module_id") REFERENCES "public"."assignment_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD CONSTRAINT "quiz_responses_quiz_question_id_quiz_questions_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reread_tasks" ADD CONSTRAINT "reread_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reread_tasks" ADD CONSTRAINT "reread_tasks_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reread_tasks" ADD CONSTRAINT "reread_tasks_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_items_module_idx" ON "assignment_items" USING btree ("assignment_module_id");--> statement-breakpoint
CREATE INDEX "assignment_items_content_version_idx" ON "assignment_items" USING btree ("content_version_id");--> statement-breakpoint
CREATE INDEX "assignment_modules_module_idx" ON "assignment_modules" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "assignments_user_idx" ON "assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assignments_trainer_idx" ON "assignments" USING btree ("trainer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_one_open_per_user" ON "assignments" USING btree ("user_id") WHERE "assignments"."status" in ('active', 'awaiting_readiness', 'awaiting_decision');--> statement-breakpoint
CREATE INDEX "classroom_attendees_user_idx" ON "classroom_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "classroom_sessions_module_idx" ON "classroom_sessions" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_module_idx" ON "quiz_questions" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "quiz_responses_module_idx" ON "quiz_responses" USING btree ("assignment_module_id");--> statement-breakpoint
CREATE INDEX "reread_tasks_user_idx" ON "reread_tasks" USING btree ("user_id");