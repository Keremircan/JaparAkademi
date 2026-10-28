CREATE TABLE "contractor_clearances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"valid_until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_clearances_visitId_unique" UNIQUE("visit_id")
);
--> statement-breakpoint
CREATE TABLE "visit_denials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"blacklist_entry_id" uuid NOT NULL,
	"denied_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "badge_no" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "ppe_issued" jsonb;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "checked_in_by" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "checked_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "checked_out_by" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "badge_returned" boolean;--> statement-breakpoint
ALTER TABLE "contractor_clearances" ADD CONSTRAINT "contractor_clearances_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_clearances" ADD CONSTRAINT "contractor_clearances_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_denials" ADD CONSTRAINT "visit_denials_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_denials" ADD CONSTRAINT "visit_denials_blacklist_entry_id_blacklist_entries_id_fk" FOREIGN KEY ("blacklist_entry_id") REFERENCES "public"."blacklist_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_denials" ADD CONSTRAINT "visit_denials_denied_by_users_id_fk" FOREIGN KEY ("denied_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contractor_clearances_visitor_idx" ON "contractor_clearances" USING btree ("visitor_id","valid_until");--> statement-breakpoint
CREATE INDEX "visit_denials_visit_idx" ON "visit_denials" USING btree ("visit_id");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_checked_out_by_users_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;