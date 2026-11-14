ALTER TABLE "negotiation_outbox" ADD COLUMN "next_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "negotiation_outbox" ADD COLUMN "claim" uuid;--> statement-breakpoint
ALTER TABLE "negotiation_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "negotiation_outbox" ADD COLUMN "last_error" text;