CREATE TABLE "invite_code" (
	"code" text PRIMARY KEY NOT NULL,
	"issuer_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"reserved_by" text,
	"reserved_at" timestamp with time zone,
	"used_by" text,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_issuer_id_user_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_reserved_by_user_id_fk" FOREIGN KEY ("reserved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_code_issuer_idx" ON "invite_code" USING btree ("issuer_id");--> statement-breakpoint
CREATE INDEX "invite_code_reserved_idx" ON "invite_code" USING btree ("reserved_by");