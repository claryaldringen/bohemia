CREATE TABLE "vassalage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lord_house_id" uuid NOT NULL,
	"vassal_house_id" uuid NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text NOT NULL,
	"since_at" timestamp with time zone NOT NULL,
	"since_day" integer NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"breaches" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_activity" (
	"player_id" text NOT NULL,
	"prague_date" text NOT NULL,
	CONSTRAINT "player_activity_player_id_prague_date_pk" PRIMARY KEY("player_id","prague_date")
);
--> statement-breakpoint
CREATE TABLE "succession_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"used_day" integer,
	CONSTRAINT "succession_credit_invitee_id_unique" UNIQUE("invitee_id")
);
--> statement-breakpoint
ALTER TABLE "vassalage" ADD CONSTRAINT "vassalage_lord_house_id_house_id_fk" FOREIGN KEY ("lord_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vassalage" ADD CONSTRAINT "vassalage_vassal_house_id_house_id_fk" FOREIGN KEY ("vassal_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_activity" ADD CONSTRAINT "player_activity_player_id_user_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "succession_credit" ADD CONSTRAINT "succession_credit_player_id_user_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "succession_credit" ADD CONSTRAINT "succession_credit_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vassalage_lord_alive_idx" ON "vassalage" USING btree ("lord_house_id") WHERE "vassalage"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vassalage_vassal_alive_idx" ON "vassalage" USING btree ("vassal_house_id") WHERE "vassalage"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "succession_credit_player_idx" ON "succession_credit" USING btree ("player_id");