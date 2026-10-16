CREATE TABLE "settlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"is_seat" boolean DEFAULT false NOT NULL,
	"landscape_seed" integer NOT NULL,
	"layer_versions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_owner_seat_idx" ON "settlement" USING btree ("owner_id") WHERE "settlement"."is_seat";