ALTER TABLE "house" ADD COLUMN "placed_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "house" ADD COLUMN "newcomer_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "local_x" integer;--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "local_y" integer;--> statement-breakpoint
ALTER TABLE "negotiation" ADD COLUMN "newcomer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_local_idx" ON "settlement" USING btree ("owner_id","local_x","local_y") WHERE "settlement"."archived_at" IS NULL;--> statement-breakpoint
-- Dosavadní rody jsou na mapě světa od založení (newcomers.md – Odříznutá krajina).
UPDATE "house" SET "placed_at" = "created_at";
