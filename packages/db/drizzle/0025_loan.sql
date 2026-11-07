CREATE TABLE "loan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"creditor_house_id" uuid NOT NULL,
	"debtor_house_id" uuid NOT NULL,
	"creditor_village_id" uuid NOT NULL,
	"debtor_village_id" uuid,
	"principal" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"paid_kg" double precision DEFAULT 0 NOT NULL,
	"breaches" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"since_at" timestamp with time zone NOT NULL,
	"since_day" integer NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "loan_negotiation_id_unique" UNIQUE("negotiation_id")
);
--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_negotiation_id_negotiation_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_creditor_house_id_house_id_fk" FOREIGN KEY ("creditor_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_debtor_house_id_house_id_fk" FOREIGN KEY ("debtor_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_debtor_active_idx" ON "loan" USING btree ("debtor_house_id") WHERE "loan"."status" = 'active';--> statement-breakpoint
CREATE INDEX "loan_creditor_idx" ON "loan" USING btree ("creditor_house_id");