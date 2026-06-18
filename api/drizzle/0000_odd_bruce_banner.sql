CREATE TYPE "public"."decision" AS ENUM('Admis', 'Ajourné', 'Sessionnaire', 'Absent', 'Délibérable', 'Annulé');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."link_method" AS ENUM('nni', 'match_key', 'manual');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"exam_year" integer NOT NULL,
	"exam_no" text NOT NULL,
	"nni" text,
	"name_fr" text,
	"name_ar" text,
	"birth_date" date,
	"birth_place" text,
	"serie" text,
	"moyenne" numeric(4, 2),
	"decision" "decision",
	"decision_raw" text,
	"school" text,
	"wilaya" text,
	"match_key" text,
	"import_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "column_aliases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_header" text NOT NULL,
	"canonical_field" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "column_aliases_raw_header_unique" UNIQUE("raw_header")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"original_filename" text NOT NULL,
	"file_path" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"exam_year" integer,
	"summary_inserted" integer,
	"summary_rejected" integer,
	"summary_new_people" integer,
	"summary_duplicates_skipped" integer,
	"smoke_passed" boolean,
	"published" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"attempt_id" bigint NOT NULL,
	"person_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"attempt_id" bigint NOT NULL,
	"person_id" bigint NOT NULL,
	"method" "link_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_links_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name_fr" text,
	"name_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejects" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"import_id" bigint NOT NULL,
	"row_number" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_suggestions" ADD CONSTRAINT "link_suggestions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_suggestions" ADD CONSTRAINT "link_suggestions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_links" ADD CONSTRAINT "person_links_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_links" ADD CONSTRAINT "person_links_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejects" ADD CONSTRAINT "rejects_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_exam_year_exam_no_unique" ON "attempts" USING btree ("exam_year","exam_no");--> statement-breakpoint
CREATE INDEX "attempts_nni_idx" ON "attempts" USING btree ("nni");--> statement-breakpoint
CREATE INDEX "attempts_match_key_idx" ON "attempts" USING btree ("match_key");--> statement-breakpoint
CREATE INDEX "person_links_person_id_idx" ON "person_links" USING btree ("person_id");