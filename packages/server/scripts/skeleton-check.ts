// Kontrola vývojových sídel na kostře světa (world-skeleton.md – Uložení, verze vrstev a vývojová sídla).
// Spuštění z kořene: npm run skeleton-check   (databáze podle DATABASE_URL, jinak bohemia; seed
// podle WORLD_SEED, jinak výchozí). JEN ČTE – žádný zápis. Vypíše aktivní sídla s `grid_*`, jejichž
// uložený výřez (`settlement.skeleton`) se liší od `skeletonSlice(worldSeed, políčko)`.
import { and, isNull, isNotNull } from 'drizzle-orm';
import { createSkeletonCache, skeletonSlice } from '@bohemia/game';
import { createDatabase, databaseUrl, schema } from '@bohemia/db';
import { worldSeed } from '../src/world';

/** Kanonický JSON (seřazené klíče) – jsonb pořadí klíčů nezachovává. */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function describe(slice: { rivers?: unknown[]; trails?: unknown[] } | null): string {
  if (!slice) return 'suchá';
  return `řeky ${slice.rivers?.length ?? 0}, stezky ${slice.trails?.length ?? 0}`;
}

async function main(): Promise<void> {
  const seed = worldSeed();
  const db = createDatabase(databaseUrl(process.env));
  const rows = await db
    .select({
      id: schema.settlement.id,
      gridX: schema.settlement.gridX,
      gridY: schema.settlement.gridY,
      isSeat: schema.settlement.isSeat,
      premiumType: schema.settlement.premiumType,
      skeleton: schema.settlement.skeleton,
    })
    .from(schema.settlement)
    .where(
      and(
        isNull(schema.settlement.archivedAt),
        isNotNull(schema.settlement.gridX),
        isNotNull(schema.settlement.gridY),
      ),
    );
  const cache = createSkeletonCache(seed);
  let differing = 0;
  for (const row of rows) {
    if (row.gridX === null || row.gridY === null) continue;
    const expected = skeletonSlice(seed, { x: row.gridX, y: row.gridY }, cache);
    if (canonical(row.skeleton) === canonical(expected)) continue;
    differing += 1;
    console.log(
      `${row.id} [${row.gridX}, ${row.gridY}] ${row.isSeat ? 'sídelní' : 'ves'} prémie ${row.premiumType ?? '-'}: uloženo ${describe(row.skeleton as never)} | kostra světa ${describe(expected as never)}`,
    );
  }
  console.log(
    `WORLD_SEED ${seed}: ${rows.length} aktivních sídel na mřížce, ${differing} se liší od kostry světa.`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
