CREATE TABLE "journey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_checkpoint" (
	"journey_id" uuid PRIMARY KEY NOT NULL,
	"tick" bigint NOT NULL,
	"state" jsonb NOT NULL,
	"outbox" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_intent" (
	"seq" serial PRIMARY KEY NOT NULL,
	"journey_id" uuid NOT NULL,
	"tick" bigint NOT NULL,
	"by_player" text NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_player_id_user_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_checkpoint" ADD CONSTRAINT "journey_checkpoint_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_intent" ADD CONSTRAINT "journey_intent_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_status_idx" ON "journey" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_player_active_idx" ON "journey" USING btree ("player_id") WHERE "journey"."status" = 'active';--> statement-breakpoint
CREATE INDEX "journey_checkpoint_outbox_idx" ON "journey_checkpoint" USING btree ("journey_id") WHERE "journey_checkpoint"."outbox" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "journey_intent_tick_idx" ON "journey_intent" USING btree ("journey_id","tick","seq");