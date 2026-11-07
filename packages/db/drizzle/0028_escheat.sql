CREATE TABLE "escheat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dead_house_id" uuid NOT NULL,
	"lord_house_ids" jsonb NOT NULL,
	"village_ids" jsonb NOT NULL,
	"vassal_ids" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"plan" jsonb,
	"consents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "escheat_dead_house_id_unique" UNIQUE("dead_house_id")
);
--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "pending_owner_id" text;--> statement-breakpoint
ALTER TABLE "escheat" ADD CONSTRAINT "escheat_dead_house_id_house_id_fk" FOREIGN KEY ("dead_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escheat_status_idx" ON "escheat" USING btree ("status");--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_pending_owner_id_user_id_fk" FOREIGN KEY ("pending_owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;