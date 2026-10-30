CREATE TYPE "public"."invite_batch_mode" AS ENUM('smart', 'email', 'whatsapp', 'print');--> statement-breakpoint
CREATE TABLE "invitation_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" "invite_batch_mode" NOT NULL,
	"total" integer NOT NULL,
	"email_count" integer DEFAULT 0 NOT NULL,
	"whatsapp_count" integer DEFAULT 0 NOT NULL,
	"print_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD COLUMN "link_enc" text;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation_batches" ADD CONSTRAINT "invitation_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_batches_created_idx" ON "invitation_batches" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_batch_id_invitation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."invitation_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_invitations_batch_idx" ON "account_invitations" USING btree ("batch_id");