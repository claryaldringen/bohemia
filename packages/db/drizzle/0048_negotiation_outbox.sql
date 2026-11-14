CREATE TABLE "negotiation_outbox" (
	"negotiation_id" uuid PRIMARY KEY NOT NULL,
	"effects" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "negotiation_outbox" ADD CONSTRAINT "negotiation_outbox_negotiation_id_negotiation_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiation"("id") ON DELETE cascade ON UPDATE no action;