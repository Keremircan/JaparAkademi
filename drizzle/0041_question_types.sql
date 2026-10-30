ALTER TYPE "public"."question_type" ADD VALUE 'matching';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'hotspot';--> statement-breakpoint
ALTER TABLE "question_versions" ALTER COLUMN "correct_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_attempt_items" ADD COLUMN "answer" jsonb;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "pairs" jsonb;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "regions" jsonb;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_type_fields_check" CHECK (("question_versions"."type"::text in ('single_choice','true_false') and "question_versions"."correct_index" is not null)
        or ("question_versions"."type"::text = 'matching' and "question_versions"."pairs" is not null)
        or ("question_versions"."type"::text = 'hotspot' and "question_versions"."regions" is not null and "question_versions"."media_asset_id" is not null));