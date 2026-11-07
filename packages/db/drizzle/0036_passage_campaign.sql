ALTER TABLE "passage" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
CREATE INDEX "passage_campaign_idx" ON "passage" USING btree ("campaign_id");