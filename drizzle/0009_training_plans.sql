CREATE TYPE "public"."module_kind" AS ENUM('theory', 'practice', 'theory_exam', 'practice_exam');--> statement-breakpoint
CREATE TABLE "module_contents" (
	"module_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "module_contents_module_id_content_id_pk" PRIMARY KEY("module_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "module_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_min" integer NOT NULL,
	"is_ohs" boolean DEFAULT false NOT NULL,
	"remote_allowed" boolean DEFAULT true NOT NULL,
	"validity_months" integer,
	"owner_org_unit_id" uuid,
	"common_target" "common_target",
	"common_sort_order" integer,
	"card_position_id" uuid,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_cardPositionId_unique" UNIQUE("card_position_id"),
	CONSTRAINT "modules_duration_check" CHECK ("modules"."duration_min" > 0 and "modules"."duration_min" <= 100000),
	CONSTRAINT "modules_validity_check" CHECK ("modules"."validity_months" is null or "modules"."validity_months" between 1 and 240),
	CONSTRAINT "modules_common_check" CHECK (("modules"."owner_org_unit_id" is null) = ("modules"."common_target" is not null) and ("modules"."card_position_id" is null or "modules"."owner_org_unit_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "plan_modules" (
	"plan_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"prerequisite_module_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "plan_modules_plan_id_module_id_pk" PRIMARY KEY("plan_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "position_card_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_version_id" uuid NOT NULL,
	"note" text,
	"reviewed_by" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_card_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "content_version_status" DEFAULT 'draft' NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ohs_section_changed" boolean DEFAULT true NOT NULL,
	"change_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	CONSTRAINT "position_card_versions_position_version_unique" UNIQUE("position_id","version")
);
--> statement-breakpoint
CREATE TABLE "practice_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_critical" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_version_id" uuid NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "training_plans_cardVersionId_unique" UNIQUE("card_version_id")
);
--> statement-breakpoint
ALTER TABLE "module_contents" ADD CONSTRAINT "module_contents_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_contents" ADD CONSTRAINT "module_contents_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_owner_org_unit_id_org_units_id_fk" FOREIGN KEY ("owner_org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_card_position_id_positions_id_fk" FOREIGN KEY ("card_position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_plan_id_training_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_card_reviews" ADD CONSTRAINT "position_card_reviews_card_version_id_position_card_versions_id_fk" FOREIGN KEY ("card_version_id") REFERENCES "public"."position_card_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_card_reviews" ADD CONSTRAINT "position_card_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_card_versions" ADD CONSTRAINT "position_card_versions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_card_versions" ADD CONSTRAINT "position_card_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_card_versions" ADD CONSTRAINT "position_card_versions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_card_version_id_position_card_versions_id_fk" FOREIGN KEY ("card_version_id") REFERENCES "public"."position_card_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "module_contents_content_idx" ON "module_contents" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "modules_owner_idx" ON "modules" USING btree ("owner_org_unit_id");--> statement-breakpoint
CREATE INDEX "plan_modules_module_idx" ON "plan_modules" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "position_card_reviews_version_idx" ON "position_card_reviews" USING btree ("card_version_id");--> statement-breakpoint
CREATE INDEX "position_card_versions_status_idx" ON "position_card_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "practice_tasks_module_idx" ON "practice_tasks" USING btree ("module_id");