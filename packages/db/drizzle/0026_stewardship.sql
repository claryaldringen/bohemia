CREATE TABLE "stewardship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"steward_house_id" uuid NOT NULL,
	"holder_house_id" uuid NOT NULL,
	"kind" text DEFAULT 'player' NOT NULL,
	"vassalage_id" uuid,
	"since_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
ALTER TABLE "stewardship" ADD CONSTRAINT "stewardship_steward_house_id_house_id_fk" FOREIGN KEY ("steward_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship" ADD CONSTRAINT "stewardship_holder_house_id_house_id_fk" FOREIGN KEY ("holder_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship" ADD CONSTRAINT "stewardship_vassalage_id_vassalage_id_fk" FOREIGN KEY ("vassalage_id") REFERENCES "public"."vassalage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stewardship_village_alive_idx" ON "stewardship" USING btree ("village_id") WHERE "stewardship"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "stewardship_steward_alive_idx" ON "stewardship" USING btree ("steward_house_id") WHERE "stewardship"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "stewardship_vassalage_idx" ON "stewardship" USING btree ("vassalage_id");