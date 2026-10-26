CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected', 'auto_self');--> statement-breakpoint
CREATE TYPE "public"."approval_step" AS ENUM('section', 'ohs');--> statement-breakpoint
CREATE TYPE "public"."approval_subject" AS ENUM('content_version', 'position_card_version', 'question_version', 'classroom_session');--> statement-breakpoint
CREATE TYPE "public"."common_target" AS ENUM('all', 'blue', 'white');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('text', 'pdf', 'video', 'gallery', 'instruction', 'checklist', 'form_template');--> statement-breakpoint
CREATE TYPE "public"."content_version_status" AS ENUM('draft', 'section_review', 'ohs_review', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'pdf', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" "approval_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"step" "approval_step" NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"comment" text,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_reject_comment_check" CHECK ("approvals"."decision" <> 'rejected' or length(trim("approvals"."comment")) > 0)
);
--> statement-breakpoint
CREATE TABLE "content_tags" (
	"content_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "content_tags_content_id_tag_id_pk" PRIMARY KEY("content_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "content_version_assets" (
	"content_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "content_version_assets_content_version_id_asset_id_pk" PRIMARY KEY("content_version_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "content_version_locales" (
	"content_version_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "content_version_locales_content_version_id_locale_pk" PRIMARY KEY("content_version_id","locale")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"content_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "content_version_status" DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"require_reread" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	CONSTRAINT "content_versions_content_version_unique" UNIQUE("content_id","version")
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "content_type" NOT NULL,
	"owner_org_unit_id" uuid,
	"is_ohs" boolean DEFAULT false NOT NULL,
	"common_target" "common_target",
	"current_published_version_id" uuid,
	"title" text NOT NULL,
	"search_vector" "tsvector",
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contents_common_target_check" CHECK (("contents"."owner_org_unit_id" is null) = ("contents"."common_target" is not null))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'pending_upload' NOT NULL,
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"original_name" text NOT NULL,
	"upload_id" text,
	"derived" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_sec" integer,
	"width" integer,
	"height" integer,
	"page_count" integer,
	"error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tag_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tag_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_type_name_unique" UNIQUE("tag_type_id","name")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version_assets" ADD CONSTRAINT "content_version_assets_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version_assets" ADD CONSTRAINT "content_version_assets_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version_locales" ADD CONSTRAINT "content_version_locales_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_owner_org_unit_id_org_units_id_fk" FOREIGN KEY ("owner_org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_current_published_version_id_content_versions_id_fk" FOREIGN KEY ("current_published_version_id") REFERENCES "public"."content_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tag_type_id_tag_types_id_fk" FOREIGN KEY ("tag_type_id") REFERENCES "public"."tag_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_subject_idx" ON "approvals" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "content_tags_tag_idx" ON "content_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "content_version_assets_asset_idx" ON "content_version_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "content_versions_status_idx" ON "content_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contents_owner_idx" ON "contents" USING btree ("owner_org_unit_id");--> statement-breakpoint
CREATE INDEX "contents_search_idx" ON "contents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "media_assets_created_by_idx" ON "media_assets" USING btree ("created_by");