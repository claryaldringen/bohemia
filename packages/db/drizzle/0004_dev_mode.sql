CREATE TABLE "player_time_offset" (
	"player_id" text PRIMARY KEY NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_time_offset_days_check" CHECK ("player_time_offset"."offset_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "dev_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player_time_offset" ADD CONSTRAINT "player_time_offset_player_id_user_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;