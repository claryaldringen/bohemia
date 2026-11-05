CREATE TABLE "negotiation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_low" uuid NOT NULL,
	"party_high" uuid NOT NULL,
	"opener" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "negotiation_reject" (
	"proposer_house_id" uuid NOT NULL,
	"rejecter_house_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "negotiation_reject_proposer_house_id_rejecter_house_id_pk" PRIMARY KEY("proposer_house_id","rejecter_house_id")
);
--> statement-breakpoint
CREATE TABLE "negotiation_round" (
	"negotiation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"author_house_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"message" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "negotiation_round_negotiation_id_seq_pk" PRIMARY KEY("negotiation_id","seq")
);
--> statement-breakpoint
CREATE TABLE "player_block" (
	"blocker_house_id" uuid NOT NULL,
	"blocked_house_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_block_blocker_house_id_blocked_house_id_pk" PRIMARY KEY("blocker_house_id","blocked_house_id")
);
--> statement-breakpoint
ALTER TABLE "negotiation" ADD CONSTRAINT "negotiation_party_low_house_id_fk" FOREIGN KEY ("party_low") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation" ADD CONSTRAINT "negotiation_party_high_house_id_fk" FOREIGN KEY ("party_high") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation" ADD CONSTRAINT "negotiation_opener_house_id_fk" FOREIGN KEY ("opener") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_reject" ADD CONSTRAINT "negotiation_reject_proposer_house_id_house_id_fk" FOREIGN KEY ("proposer_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_reject" ADD CONSTRAINT "negotiation_reject_rejecter_house_id_house_id_fk" FOREIGN KEY ("rejecter_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_round" ADD CONSTRAINT "negotiation_round_negotiation_id_negotiation_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_round" ADD CONSTRAINT "negotiation_round_author_house_id_house_id_fk" FOREIGN KEY ("author_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_block" ADD CONSTRAINT "player_block_blocker_house_id_house_id_fk" FOREIGN KEY ("blocker_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_block" ADD CONSTRAINT "player_block_blocked_house_id_house_id_fk" FOREIGN KEY ("blocked_house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "negotiation_open_pair_uq" ON "negotiation" USING btree ("party_low","party_high") WHERE "negotiation"."status" = 'open';--> statement-breakpoint
CREATE INDEX "negotiation_low_idx" ON "negotiation" USING btree ("party_low");--> statement-breakpoint
CREATE INDEX "negotiation_high_idx" ON "negotiation" USING btree ("party_high");