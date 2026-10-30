CREATE TYPE "public"."prior_training_source" AS ENUM('screen', 'excel');--> statement-breakpoint
ALTER TYPE "public"."assignment_reason" ADD VALUE 'periodic';--> statement-breakpoint
CREATE TABLE "prior_trainings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"completed_on" date NOT NULL,
	"note" text,
	"source" "prior_training_source" NOT NULL,
	"entered_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment_modules" ADD COLUMN "renews_prior_id" uuid;--> statement-breakpoint
ALTER TABLE "prior_trainings" ADD CONSTRAINT "prior_trainings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prior_trainings" ADD CONSTRAINT "prior_trainings_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prior_trainings" ADD CONSTRAINT "prior_trainings_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prior_trainings_user_module_idx" ON "prior_trainings" USING btree ("user_id","module_id","created_at");--> statement-breakpoint
CREATE INDEX "assignment_modules_renews_prior_idx" ON "assignment_modules" USING btree ("renews_prior_id");