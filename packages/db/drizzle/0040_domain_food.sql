CREATE TABLE "domain_food_round" (
	"village_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"day" integer NOT NULL,
	"deliveries" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "domain_food_round_village_id_year_pk" PRIMARY KEY("village_id","year")
);
--> statement-breakpoint
ALTER TABLE "domain_food_round" ADD CONSTRAINT "domain_food_round_village_id_village_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_food_round_created_idx" ON "domain_food_round" USING btree ("created_at");