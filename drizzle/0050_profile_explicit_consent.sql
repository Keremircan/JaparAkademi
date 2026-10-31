CREATE TYPE "public"."explicit_consent_source" AS ENUM('consent_screen', 'profile');--> statement-breakpoint
ALTER TYPE "public"."legal_text_kind" ADD VALUE 'explicit_consent_personnel';--> statement-breakpoint
CREATE TABLE "explicit_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"legal_text_id" uuid NOT NULL,
	"granted" boolean NOT NULL,
	"source" "explicit_consent_source" NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "photo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "explicit_consents" ADD CONSTRAINT "explicit_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explicit_consents" ADD CONSTRAINT "explicit_consents_legal_text_id_legal_texts_id_fk" FOREIGN KEY ("legal_text_id") REFERENCES "public"."legal_texts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "explicit_consents_user_idx" ON "explicit_consents" USING btree ("user_id","decided_at");--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_photo_asset_id_media_assets_id_fk" FOREIGN KEY ("photo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;