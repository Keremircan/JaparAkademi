CREATE TYPE "public"."ohs_topic" AS ENUM('general', 'health', 'technical', 'other');--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "ohs_topic" "ohs_topic";--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_ohs_topic_check" CHECK ("modules"."ohs_topic" is null or "modules"."is_ohs");