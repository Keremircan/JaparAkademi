CREATE TYPE "public"."collar_type" AS ENUM('blue', 'white');--> statement-breakpoint
CREATE TYPE "public"."org_unit_kind" AS ENUM('department', 'section');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('active', 'passive');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('employee', 'intern');--> statement-breakpoint
CREATE TYPE "public"."personnel_source" AS ENUM('excel', 'manual', 'hr_sync');--> statement-breakpoint
CREATE TYPE "public"."legal_text_kind" AS ENUM('kvkk_personnel', 'kvkk_visitor', 'visitor_rules');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('validated', 'committed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."import_mode" AS ENUM('existing_staff', 'new_hires');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('valid', 'error', 'created', 'updated', 'unchanged');--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"kind" "org_unit_kind" NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"responsible_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_units_code_unique" UNIQUE("code"),
	CONSTRAINT "org_units_parent_name_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name"),
	CONSTRAINT "org_units_kind_parent_check" CHECK (("org_units"."kind" = 'department' and "org_units"."parent_id" is null) or ("org_units"."kind" = 'section' and "org_units"."parent_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"supervisor_position_id" uuid,
	"deputy_position_id" uuid,
	"collar_type" "collar_type" NOT NULL,
	"shift_pattern" text,
	"status" "position_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_code_unique" UNIQUE("code"),
	CONSTRAINT "positions_org_unit_name_unique" UNIQUE("org_unit_id","name")
);
--> statement-breakpoint
CREATE TABLE "data_access_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "role_scopes" (
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_scopes_user_id_role_org_unit_id_pk" PRIMARY KEY("user_id","role","org_unit_id"),
	CONSTRAINT "role_scopes_role_check" CHECK ("role_scopes"."role" = 'section_manager')
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"legal_text_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "consents_user_text_unique" UNIQUE("user_id","legal_text_id")
);
--> statement-breakpoint
CREATE TABLE "legal_texts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "legal_text_kind" NOT NULL,
	"locale" text DEFAULT 'tr' NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_texts_kind_locale_version_unique" UNIQUE("kind","locale","version")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mode" "import_mode" NOT NULL,
	"status" "import_batch_status" DEFAULT 'validated' NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"error_rows" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_by" uuid,
	"committed_at" timestamp with time zone,
	"created_count" integer,
	"updated_count" integer
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"sicil_no" text,
	"data" jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "import_row_status" NOT NULL,
	"user_id" uuid,
	"committed_at" timestamp with time zone,
	CONSTRAINT "import_rows_batch_row_unique" UNIQUE("batch_id","row_number")
);
--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "national_id_enc" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "national_id_hmac" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "national_id_masked" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "position_id" uuid;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "employment_type" "employment_type" DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "hire_date" date;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "source" "personnel_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "training_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_org_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_supervisor_position_id_positions_id_fk" FOREIGN KEY ("supervisor_position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_deputy_position_id_positions_id_fk" FOREIGN KEY ("deputy_position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_legal_text_id_legal_texts_id_fk" FOREIGN KEY ("legal_text_id") REFERENCES "public"."legal_texts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_texts" ADD CONSTRAINT "legal_texts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_units_parent_idx" ON "org_units" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "positions_org_unit_idx" ON "positions" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "data_access_log_subject_idx" ON "data_access_log" USING btree ("subject_user_id","at");--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_rows_batch_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personnel_position_idx" ON "personnel" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "personnel_status_idx" ON "personnel" USING btree ("status");--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_nationalIdHmac_unique" UNIQUE("national_id_hmac");--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_terminated_end_date_check" CHECK ("personnel"."status" <> 'terminated' or "personnel"."end_date" is not null);