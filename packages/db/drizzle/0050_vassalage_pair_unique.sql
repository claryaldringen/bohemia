DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "vassalage" WHERE "ended_at" IS NULL
    GROUP BY "lord_house_id", "vassal_house_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migrace 0050: v tabulce vassalage jsou duplicitní živé dohody téže dvojice (pán, vazal) – nejdřív je ručně ukonči (ended_at), potom migraci pusť znovu.';
  END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "vassalage_pair_alive_uq" ON "vassalage" USING btree ("lord_house_id","vassal_house_id") WHERE "vassalage"."ended_at" IS NULL;
