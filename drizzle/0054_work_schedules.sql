CREATE TYPE "public"."schedule_kind" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TABLE "personal_schedules" (
	"user_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"base_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_schedules_user_id_schedule_id_pk" PRIMARY KEY("user_id","schedule_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_choices" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"schedule_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "schedule_kind" NOT NULL,
	"days" smallint[] NOT NULL,
	"start_time" text DEFAULT '00:00' NOT NULL,
	"items" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_schedules_position_name_unique" UNIQUE("position_id","name"),
	CONSTRAINT "work_schedules_start_time_check" CHECK ("work_schedules"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "work_schedules_version_check" CHECK ("work_schedules"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "personal_schedules" ADD CONSTRAINT "personal_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_schedules" ADD CONSTRAINT "personal_schedules_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_choices" ADD CONSTRAINT "schedule_choices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_choices" ADD CONSTRAINT "schedule_choices_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_schedules_schedule_idx" ON "personal_schedules" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedule_choices_schedule_idx" ON "schedule_choices" USING btree ("schedule_id");