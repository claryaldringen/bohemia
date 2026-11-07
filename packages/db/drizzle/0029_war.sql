CREATE TABLE "war" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"house_low" uuid NOT NULL,
	"house_high" uuid NOT NULL,
	"how" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"started_day" integer NOT NULL,
	"last_clash_day" integer NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "war_attack" (
	"house_id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "war_protection_notice" (
	"house_id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "war" ADD CONSTRAINT "war_house_low_house_id_fk" FOREIGN KEY ("house_low") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "war" ADD CONSTRAINT "war_house_high_house_id_fk" FOREIGN KEY ("house_high") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "war_attack" ADD CONSTRAINT "war_attack_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "war_protection_notice" ADD CONSTRAINT "war_protection_notice_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "war_active_pair_uq" ON "war" USING btree ("house_low","house_high") WHERE "war"."status" = 'active';--> statement-breakpoint
CREATE INDEX "war_house_high_idx" ON "war" USING btree ("house_high");