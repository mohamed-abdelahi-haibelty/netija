ALTER TYPE "public"."import_status" ADD VALUE 'cancelling' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'cancelled' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "worker_pid" integer;