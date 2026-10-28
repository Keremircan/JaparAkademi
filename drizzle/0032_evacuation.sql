CREATE TYPE "public"."rollcall_kind" AS ENUM('drill', 'real');--> statement-breakpoint
CREATE TABLE "evacuation_marks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rollcall_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"safe_at" timestamp with time zone,
	"safe_by" uuid,
	CONSTRAINT "evacuation_marks_rollcall_visit_unique" UNIQUE("rollcall_id","visit_id")
);
--> statement-breakpoint
CREATE TABLE "evacuation_rollcalls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "rollcall_kind" NOT NULL,
	"started_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_by" uuid,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evacuation_marks" ADD CONSTRAINT "evacuation_marks_rollcall_id_evacuation_rollcalls_id_fk" FOREIGN KEY ("rollcall_id") REFERENCES "public"."evacuation_rollcalls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuation_marks" ADD CONSTRAINT "evacuation_marks_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuation_marks" ADD CONSTRAINT "evacuation_marks_safe_by_users_id_fk" FOREIGN KEY ("safe_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuation_rollcalls" ADD CONSTRAINT "evacuation_rollcalls_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuation_rollcalls" ADD CONSTRAINT "evacuation_rollcalls_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;