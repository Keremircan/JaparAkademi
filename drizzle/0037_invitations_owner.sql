CREATE TYPE "public"."invite_channel" AS ENUM('email', 'whatsapp', 'print');--> statement-breakpoint
ALTER TYPE "public"."app_role" ADD VALUE 'owner';--> statement-breakpoint
ALTER TYPE "public"."login_attempt_result" ADD VALUE 'bad_invite';--> statement-breakpoint
ALTER TYPE "public"."login_attempt_result" ADD VALUE 'activated';--> statement-breakpoint
CREATE TABLE "account_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "invite_channel" NOT NULL,
	"token_hash" text NOT NULL,
	"code_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_invitations_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "owner_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_actions" ADD CONSTRAINT "owner_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_invitations_user_idx" ON "account_invitations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "owner_actions_actor_idx" ON "owner_actions" USING btree ("actor_id","at");