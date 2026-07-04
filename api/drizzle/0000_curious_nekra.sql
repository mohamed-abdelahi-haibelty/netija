CREATE TYPE "public"."decision" AS ENUM('Admis', 'Ajourné', 'Sessionnaire', 'Absent', 'Délibérable', 'Annulé');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"exam_year" integer NOT NULL,
	"exam_no" text NOT NULL,
	"public_slug" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"name_fr" text,
	"name_ar" text,
	"serie" text NOT NULL,
	"moyenne" numeric(4, 2),
	"decision" "decision" NOT NULL,
	"decision_raw" text,
	"import_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
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
	"progress" integer,
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
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejects" ADD CONSTRAINT "rejects_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_exam_year_exam_no_unique" ON "attempts" USING btree ("exam_year","exam_no");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_public_slug_unique" ON "attempts" USING btree ("public_slug");