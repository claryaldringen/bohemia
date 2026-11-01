CREATE TABLE "village_year" (
	"village_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"day" integer NOT NULL,
	"adults" integer NOT NULL,
	"children" integer NOT NULL,
	"births" integer NOT NULL,
	"deaths" integer NOT NULL,
	"deaths_hunger" integer NOT NULL,
	"harvest_kg" integer NOT NULL,
	"stores_kg" integer NOT NULL,
	"hungry_days" integer NOT NULL,
	"field_m2" integer NOT NULL,
	"sown_m2" integer NOT NULL,
	"data" jsonb NOT NULL,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "village_year_village_id_year_pk" PRIMARY KEY("village_id","year")
);
--> statement-breakpoint
ALTER TABLE "village_year" ADD CONSTRAINT "village_year_village_id_village_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;