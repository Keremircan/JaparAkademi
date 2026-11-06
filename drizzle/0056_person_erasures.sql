CREATE TABLE "person_erasures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"erased_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"erased_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_erasures_reason_check" CHECK (char_length("person_erasures"."reason") between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "person_erasures" ADD CONSTRAINT "person_erasures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_erasures" ADD CONSTRAINT "person_erasures_erased_by_users_id_fk" FOREIGN KEY ("erased_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_erasures_user_idx" ON "person_erasures" USING btree ("user_id");