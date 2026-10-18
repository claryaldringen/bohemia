-- Víc vsí jednoho sídla (migration.md – Na stavitelích): ves dostane vlastní id místo primárního
-- klíče settlement_id, sídlo polohu v mřížce světa. Primární klíč z 0002_village má výchozí jméno.
ALTER TABLE "village" DROP CONSTRAINT "village_pkey";--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "grid_x" integer;--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "grid_y" integer;--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "village" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_grid_idx" ON "settlement" USING btree ("grid_x","grid_y") WHERE "settlement"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "village_settlement_idx" ON "village" USING btree ("settlement_id","created_at");