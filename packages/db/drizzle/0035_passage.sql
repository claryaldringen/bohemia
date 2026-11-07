CREATE TABLE "passage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_house_id" uuid NOT NULL,
	"to_house_id" uuid NOT NULL,
	"cells" jsonb NOT NULL,
	"eta_day" integer NOT NULL,
	"message" text NOT NULL,
	"announced_at" timestamp with time zone NOT NULL,
	"announced_day" integer NOT NULL,
	"trust" boolean,
	"reply" text,
	"answered_at" timestamp with time zone,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "passage" ADD CONSTRAINT "passage_from_house_id_house_id_fk" FOREIGN KEY ("from_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage" ADD CONSTRAINT "passage_to_house_id_house_id_fk" FOREIGN KEY ("to_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passage_pair_idx" ON "passage" USING btree ("from_house_id","to_house_id");--> statement-breakpoint
CREATE INDEX "passage_to_idx" ON "passage" USING btree ("to_house_id");