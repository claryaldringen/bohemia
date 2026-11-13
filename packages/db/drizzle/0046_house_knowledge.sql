CREATE TABLE "house_knowledge" (
	"house_id" uuid NOT NULL,
	"grid_x" integer NOT NULL,
	"grid_y" integer NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_knowledge_house_id_grid_x_grid_y_pk" PRIMARY KEY("house_id","grid_x","grid_y")
);
--> statement-breakpoint
ALTER TABLE "house_knowledge" ADD CONSTRAINT "house_knowledge_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "house_knowledge_house_idx" ON "house_knowledge" USING btree ("house_id");