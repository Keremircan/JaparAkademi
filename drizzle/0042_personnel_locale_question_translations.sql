ALTER TABLE "personnel" ADD COLUMN "locale" text DEFAULT 'tr' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "translations" jsonb;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_locale_check" CHECK ("personnel"."locale" in ('tr','en'));