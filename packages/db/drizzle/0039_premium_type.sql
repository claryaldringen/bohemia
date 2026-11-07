ALTER TABLE "settlement" ADD COLUMN "premium_type" text;--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "premium_owner_id" text;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_premium_owner_id_user_id_fk" FOREIGN KEY ("premium_owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlement_premium_owner_idx" ON "settlement" USING btree ("premium_owner_id") WHERE "settlement"."premium_type" IS NOT NULL;