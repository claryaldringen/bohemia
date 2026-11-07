// Výpis deníku vsí (village_year): jeden řádek za ves a herní rok.
// Spuštění z kořene: npm run village-log -- --village <id|jméno> [--player <id>] [--from rok]
// Bez --village a --player vypíše všechny vsi. Databáze podle DATABASE_URL (jinak bohemia).
import { and, asc, eq, gte, ilike, type SQL } from 'drizzle-orm';
import { createDatabase, databaseUrl, schema } from '../src';

const { village, villageYear, settlement } = schema;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function args(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Použití: --village <id|jméno> [--player <id>] [--from rok]');
    }
    out.set(key.slice(2), value);
  }
  return out;
}

const COLUMNS = [
  'ves',
  'rok',
  'dosp',
  'dět',
  'nar',
  'úmr',
  'z toho hlad',
  'sklizeň kg',
  'zásoby kg',
  'spotř. kg',
  'hlad dní',
  'pole m²',
  'oseto m²',
  'ovce/kozy/prasata/krávy',
  'správce',
  'postaveno',
  'synů pryč',
  'pohromy',
] as const;

const KIND_CS: Record<string, string> = {
  hail: 'kroupy',
  flood: 'povodeň',
  fire: 'požár',
  tornado: 'vichr',
};

function counts(record: Record<string, number>, names: Record<string, string> = {}): string {
  const parts = Object.entries(record).map(([k, n]) => `${names[k] ?? k}×${n}`);
  return parts.length > 0 ? parts.join(' ') : '-';
}

async function main(): Promise<void> {
  const opts = args(process.argv.slice(2));
  const where: SQL[] = [];
  const target = opts.get('village');
  if (target !== undefined) {
    where.push(UUID.test(target) ? eq(village.id, target) : ilike(village.name, `%${target}%`));
  }
  const player = opts.get('player');
  if (player !== undefined) where.push(eq(settlement.ownerId, player));
  const from = opts.get('from');
  if (from !== undefined) where.push(gte(villageYear.year, Number(from)));
  const db = createDatabase(databaseUrl(process.env));
  try {
    const rows = await db
      .select({ name: village.name, y: villageYear })
      .from(villageYear)
      .innerJoin(village, eq(village.id, villageYear.villageId))
      .innerJoin(settlement, eq(settlement.id, village.settlementId))
      .where(and(...where))
      .orderBy(asc(settlement.ownerId), asc(village.createdAt), asc(villageYear.year));
    // spotřeba (jídlo, osivo, ztráty) = zásoby loni + sklizeň – zásoby letos; jen s řádkem loňska
    const stores = new Map(rows.map(({ y }) => [`${y.villageId}/${y.year}`, y.storesKg]));
    const used = (y: (typeof rows)[number]['y']): string => {
      const last = stores.get(`${y.villageId}/${y.year - 1}`);
      return last === undefined ? '?' : String(last + y.harvestKg - y.storesKg);
    };
    const table: string[][] = rows.map(({ name, y }) => [
      name,
      String(y.year),
      String(y.adults),
      String(y.children),
      String(y.births),
      String(y.deaths),
      String(y.deathsHunger),
      String(y.harvestKg),
      String(y.storesKg),
      used(y),
      String(y.hungryDays),
      String(y.fieldM2),
      String(y.sownM2),
      [y.data.herds.sheep, y.data.herds.goat, y.data.herds.pig, y.data.herds.cow].join('/'),
      y.data.stewardOn ? 'ano' : 'ne',
      counts(y.data.built),
      String(y.data.sonsLeft),
      counts(y.data.disasters, KIND_CS),
    ]);
    const widths = COLUMNS.map((c, i) =>
      Math.max(c.length, ...table.map((r) => (r[i] ?? '').length)),
    );
    const line = (cells: readonly string[]): string =>
      cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
    console.log(line(COLUMNS));
    console.log(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of table) console.log(line(r));
    console.log(`\n${table.length} řádků`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
