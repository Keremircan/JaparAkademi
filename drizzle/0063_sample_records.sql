CREATE TABLE "sample_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid,
	"setting_key" text,
	"setting_item" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sample_records_target_check" CHECK (("sample_records"."record_id" is not null) <> ("sample_records"."setting_key" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sample_records_record_idx" ON "sample_records" USING btree ("table_name","record_id");