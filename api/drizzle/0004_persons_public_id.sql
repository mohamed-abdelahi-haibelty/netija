-- Add a random, unguessable public identifier to persons.
-- The integer primary key remains the internal join key; public_id is used
-- only in public URLs and API responses, making bulk enumeration infeasible.
-- gen_random_uuid() is a Postgres 13+ built-in (no extension required).
-- Stripping hyphens yields a 32-char lowercase hex string.
ALTER TABLE "persons" ADD COLUMN "public_id" text;
UPDATE "persons" SET "public_id" = replace(gen_random_uuid()::text, '-', '') WHERE "public_id" IS NULL;
ALTER TABLE "persons" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "persons" ALTER COLUMN "public_id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "persons" ADD CONSTRAINT "persons_public_id_unique" UNIQUE ("public_id");
