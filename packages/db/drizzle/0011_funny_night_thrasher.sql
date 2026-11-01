DROP INDEX "village_settlement_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "village_settlement_uq" ON "village" USING btree ("settlement_id");