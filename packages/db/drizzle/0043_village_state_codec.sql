DROP INDEX "village_origin_uq";--> statement-breakpoint
ALTER TABLE "village" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "village" ALTER COLUMN "last_day" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "village" ALTER COLUMN "asleep" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "state_day" "bytea";--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "state_land" "bytea";--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "land_hash" text;--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "refuge_ref_id" text;--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "refuge_host_village_id" text;--> statement-breakpoint
-- Stav se převádí líně (první zápis adaptéru zapíše state_day / state_land, state vynuluje);
-- odvozené sloupce dřív počítané z jsonb se doplní hned – last_day a asleep si hodnoty nechaly.
UPDATE "village" SET "origin" = "state"->>'origin', "refuge_ref_id" = "state"->'refuge'->>'refId', "refuge_host_village_id" = "state"->'refuge'->>'hostVillageId';--> statement-breakpoint
CREATE UNIQUE INDEX "village_origin_uq" ON "village" USING btree ("origin") WHERE "village"."origin" IS NOT NULL;