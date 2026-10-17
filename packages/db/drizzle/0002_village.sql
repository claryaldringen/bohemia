CREATE TABLE "village" (
	"settlement_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "village" ADD CONSTRAINT "village_settlement_id_settlement_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlement"("id") ON DELETE cascade ON UPDATE no action;