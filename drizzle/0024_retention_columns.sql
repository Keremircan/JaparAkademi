ALTER TYPE "public"."media_status" ADD VALUE 'purged';--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "change_note" text;