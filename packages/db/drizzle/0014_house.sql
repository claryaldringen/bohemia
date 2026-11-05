CREATE TABLE "house" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_day" integer,
	"lord_village_id" uuid,
	"lord_person_id" integer
);
--> statement-breakpoint
ALTER TABLE "house" ADD CONSTRAINT "house_player_id_user_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "house_player_alive_idx" ON "house" USING btree ("player_id") WHERE "house"."ended_at" IS NULL AND "house"."kind" = 'player';--> statement-breakpoint
INSERT INTO "house" ("player_id", "kind", "created_at")
SELECT "owner_id", 'player', min("created_at")
FROM "settlement"
WHERE "archived_at" IS NULL
GROUP BY "owner_id";
