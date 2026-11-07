CREATE TABLE "dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lord_house_id" uuid NOT NULL,
	"plaintiff_house_id" uuid NOT NULL,
	"defendant_house_id" uuid NOT NULL,
	"pair_key" text NOT NULL,
	"message" text NOT NULL,
	"statement" text,
	"filed_at" timestamp with time zone NOT NULL,
	"filed_day" integer NOT NULL,
	"status" text DEFAULT 'filed' NOT NULL,
	"verdict" jsonb,
	"judged_day" integer,
	"peace_until_day" integer,
	"broken_by" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_lord_house_id_house_id_fk" FOREIGN KEY ("lord_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_plaintiff_house_id_house_id_fk" FOREIGN KEY ("plaintiff_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_defendant_house_id_house_id_fk" FOREIGN KEY ("defendant_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispute_lord_idx" ON "dispute" USING btree ("lord_house_id");--> statement-breakpoint
CREATE INDEX "dispute_plaintiff_idx" ON "dispute" USING btree ("plaintiff_house_id");--> statement-breakpoint
CREATE INDEX "dispute_defendant_idx" ON "dispute" USING btree ("defendant_house_id");--> statement-breakpoint
CREATE INDEX "dispute_pair_idx" ON "dispute" USING btree ("pair_key");--> statement-breakpoint
CREATE UNIQUE INDEX "dispute_running_uq" ON "dispute" USING btree ("pair_key") WHERE "dispute"."status" = 'filed';