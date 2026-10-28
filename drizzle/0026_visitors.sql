CREATE TYPE "public"."visit_status" AS ENUM('planned', 'briefed', 'checked_in', 'checked_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."visitor_id_kind" AS ENUM('tc', 'passport');--> statement-breakpoint
CREATE TYPE "public"."visitor_type" AS ENUM('office', 'site', 'contractor');--> statement-breakpoint
CREATE TABLE "blacklist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"national_id_hmac" text,
	"national_id_masked" text,
	"full_name_snapshot" text NOT NULL,
	"reason" text NOT NULL,
	"ends_at" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_reason" text,
	"lifted_by" uuid,
	"lifted_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contractor_companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tax_no" text,
	"responsible_name" text,
	"phone" text,
	"email" text,
	"contract_end" date,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_briefing_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"briefing_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"title_tr" text NOT NULL,
	"body_tr" text NOT NULL,
	"title_en" text NOT NULL,
	"body_en" text NOT NULL,
	"media_asset_id" uuid
);
--> statement-breakpoint
CREATE TABLE "visitor_briefing_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"briefing_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"stem_tr" text NOT NULL,
	"stem_en" text NOT NULL,
	"options_tr" jsonb NOT NULL,
	"options_en" jsonb NOT NULL,
	"correct_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_briefings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_type" "visitor_type" NOT NULL,
	"version" integer NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_briefings_type_version_unique" UNIQUE("visitor_type","version")
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"company_name" text,
	"contractor_company_id" uuid,
	"phone" text,
	"email" text,
	"id_kind" "visitor_id_kind",
	"id_country" text,
	"national_id_enc" text,
	"national_id_hmac" text,
	"national_id_masked" text,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitors_nationalIdHmac_unique" UNIQUE("national_id_hmac")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"visitor_type" "visitor_type" NOT NULL,
	"host_user_id" uuid NOT NULL,
	"planned_date" date NOT NULL,
	"status" "visit_status" DEFAULT 'planned' NOT NULL,
	"note" text,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_cancel_reason_check" CHECK ("visits"."status" <> 'cancelled' or "visits"."cancel_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "blacklist_entries" ADD CONSTRAINT "blacklist_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist_entries" ADD CONSTRAINT "blacklist_entries_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_companies" ADD CONSTRAINT "contractor_companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_briefing_cards" ADD CONSTRAINT "visitor_briefing_cards_briefing_id_visitor_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."visitor_briefings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_briefing_cards" ADD CONSTRAINT "visitor_briefing_cards_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_briefing_questions" ADD CONSTRAINT "visitor_briefing_questions_briefing_id_visitor_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."visitor_briefings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_briefings" ADD CONSTRAINT "visitor_briefings_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_briefings" ADD CONSTRAINT "visitor_briefings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_contractor_company_id_contractor_companies_id_fk" FOREIGN KEY ("contractor_company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blacklist_entries_hmac_idx" ON "blacklist_entries" USING btree ("national_id_hmac");--> statement-breakpoint
CREATE UNIQUE INDEX "contractor_companies_tax_no_unique" ON "contractor_companies" USING btree ("tax_no") WHERE "contractor_companies"."tax_no" is not null;--> statement-breakpoint
CREATE INDEX "visitor_briefing_cards_briefing_idx" ON "visitor_briefing_cards" USING btree ("briefing_id","sort_order");--> statement-breakpoint
CREATE INDEX "visitor_briefing_questions_briefing_idx" ON "visitor_briefing_questions" USING btree ("briefing_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_briefings_one_draft" ON "visitor_briefings" USING btree ("visitor_type") WHERE "visitor_briefings"."published_at" is null;--> statement-breakpoint
CREATE INDEX "visitors_company_idx" ON "visitors" USING btree ("contractor_company_id");--> statement-breakpoint
CREATE INDEX "visits_date_idx" ON "visits" USING btree ("planned_date");--> statement-breakpoint
CREATE INDEX "visits_host_idx" ON "visits" USING btree ("host_user_id","planned_date");--> statement-breakpoint
CREATE INDEX "visits_visitor_idx" ON "visits" USING btree ("visitor_id");