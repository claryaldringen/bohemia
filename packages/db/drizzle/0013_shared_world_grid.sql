-- Společná mřížka světa: dosud měl každý hráč mřížku zvlášť (sídelní sídlo v (0, 0)), teď je
-- jedna pro všechny. Hráči se seřadí podle prvního založeného sídla (k = 0, 1, 2 …) a všechny jejich
-- mapy se posunou o 16 × k sloupců – relativní poloha map hráče se nemění, krajina též (seed je
-- uložený u sídla). Sídelní sídlo bez polohy dostane (16 × k, 0). Převod musí proběhnout PŘED
-- vytvořením nového unikátního indexu.
WITH ranked AS (
	SELECT "owner_id",
		(row_number() OVER (ORDER BY min("created_at"), "owner_id") - 1)::integer AS k
	FROM "settlement"
	GROUP BY "owner_id"
)
UPDATE "settlement" AS s
SET "grid_x" = CASE WHEN s."grid_x" IS NULL THEN 16 * r.k ELSE s."grid_x" + 16 * r.k END,
	"grid_y" = COALESCE(s."grid_y", 0)
FROM ranked AS r
WHERE s."owner_id" = r."owner_id"
	AND (s."grid_x" IS NOT NULL OR (s."is_seat" AND s."archived_at" IS NULL));--> statement-breakpoint
DROP INDEX "settlement_owner_grid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_grid_idx" ON "settlement" USING btree ("grid_x","grid_y") WHERE "settlement"."archived_at" IS NULL;
