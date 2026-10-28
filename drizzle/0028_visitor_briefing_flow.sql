CREATE TYPE "public"."visit_session_channel" AS ENUM('link', 'kiosk', 'self');--> statement-breakpoint
CREATE TABLE "visit_quiz_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"briefing_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"score" integer,
	"passed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visit_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"channel" "visit_session_channel" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "visitor_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"legal_text_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "visitor_consents_visit_text_unique" UNIQUE("visit_id","legal_text_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_signatures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"subject_hash" text NOT NULL,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "visitor_signatures_visitId_unique" UNIQUE("visit_id")
);
--> statement-breakpoint
ALTER TABLE "visits" ALTER COLUMN "host_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "host_name_text" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "code" text;--> statement-breakpoint
-- Mevcut ziyaretlere benzersiz kod (elle eklendi)
UPDATE "visits" v SET "code" = lpad(n.rn::text, 6, '0') FROM (SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM "visits") n WHERE n.id = v.id;--> statement-breakpoint
ALTER TABLE "visits" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "self_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "briefing_id" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "briefing_locale" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "briefing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "briefing_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "quiz_score" integer;--> statement-breakpoint
ALTER TABLE "visit_quiz_attempts" ADD CONSTRAINT "visit_quiz_attempts_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_quiz_attempts" ADD CONSTRAINT "visit_quiz_attempts_briefing_id_visitor_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."visitor_briefings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_sessions" ADD CONSTRAINT "visit_sessions_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_consents" ADD CONSTRAINT "visitor_consents_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_consents" ADD CONSTRAINT "visitor_consents_legal_text_id_legal_texts_id_fk" FOREIGN KEY ("legal_text_id") REFERENCES "public"."legal_texts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_signatures" ADD CONSTRAINT "visitor_signatures_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_signatures" ADD CONSTRAINT "visitor_signatures_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_quiz_attempts_visit_idx" ON "visit_quiz_attempts" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "visit_sessions_visit_idx" ON "visit_sessions" USING btree ("visit_id");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_briefing_id_visitor_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."visitor_briefings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visits_open_code_unique" ON "visits" USING btree ("code") WHERE "visits"."status" in ('planned', 'briefed');--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_host_check" CHECK ("visits"."host_user_id" is not null or "visits"."host_name_text" is not null);