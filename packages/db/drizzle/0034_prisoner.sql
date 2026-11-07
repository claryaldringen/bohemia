CREATE TABLE "prisoner" (
	"id" text PRIMARY KEY NOT NULL,
	"captor_village_id" uuid NOT NULL,
	"home_village_id" uuid NOT NULL,
	"person_id" integer NOT NULL,
	"decision" text NOT NULL,
	"decided_day" integer NOT NULL,
	"decided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prisoner" ADD CONSTRAINT "prisoner_captor_village_id_village_id_fk" FOREIGN KEY ("captor_village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prisoner" ADD CONSTRAINT "prisoner_home_village_id_village_id_fk" FOREIGN KEY ("home_village_id") REFERENCES "public"."village"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prisoner_captor_idx" ON "prisoner" USING btree ("captor_village_id");--> statement-breakpoint
CREATE INDEX "prisoner_home_idx" ON "prisoner" USING btree ("home_village_id");