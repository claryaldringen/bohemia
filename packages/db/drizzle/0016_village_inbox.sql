CREATE TABLE "village_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"village_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"ref" text NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "village_inbox_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "village_inbox" ADD CONSTRAINT "village_inbox_village_id_village_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "village_inbox_village_day_idx" ON "village_inbox" USING btree ("village_id","day");