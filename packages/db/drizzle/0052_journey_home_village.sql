ALTER TABLE "journey" ADD COLUMN "home_village_id" text;--> statement-breakpoint
UPDATE "journey" SET "home_village_id" = c."state"->'home'->>'villageId' FROM "journey_checkpoint" c WHERE c."journey_id" = "journey"."id";--> statement-breakpoint
UPDATE "journey" SET "status" = 'done', "home_village_id" = '' WHERE "home_village_id" IS NULL;--> statement-breakpoint
ALTER TABLE "journey" ALTER COLUMN "home_village_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "journey_player_active_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "journey_player_home_active_idx" ON "journey" USING btree ("player_id","home_village_id") WHERE "journey"."status" = 'active';
