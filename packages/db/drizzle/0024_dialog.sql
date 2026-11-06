CREATE TABLE "dialog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"ref_id" text NOT NULL,
	"year" integer NOT NULL,
	"years" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "dialog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "dialog" ADD CONSTRAINT "dialog_player_id_user_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dialog_player_status_idx" ON "dialog" USING btree ("player_id","status");--> statement-breakpoint
CREATE INDEX "dialog_ref_idx" ON "dialog" USING btree ("ref_id");