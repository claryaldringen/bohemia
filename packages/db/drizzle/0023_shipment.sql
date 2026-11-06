CREATE TABLE "shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_village_id" uuid NOT NULL,
	"to_village_id" uuid NOT NULL,
	"bundle" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"ref_id" text NOT NULL,
	"sent_day" integer NOT NULL,
	"arrives_day" integer NOT NULL,
	"posted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "shipment_ref_id_unique" UNIQUE("ref_id")
);
--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_from_village_id_village_id_fk" FOREIGN KEY ("from_village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_to_village_id_village_id_fk" FOREIGN KEY ("to_village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_to_idx" ON "shipment" USING btree ("to_village_id");--> statement-breakpoint
CREATE INDEX "shipment_from_idx" ON "shipment" USING btree ("from_village_id");