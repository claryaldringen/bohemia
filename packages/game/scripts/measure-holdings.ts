// Měření hospodaření podle polohy domů (docs/design/fields.md – Hospodaření podle polohy domů):
// npx tsx packages/game/scripts/measure-holdings.ts [počet krajin]
//
// Na skutečných krajinách (seedy 1 … N) postaví u místa vsi dvě uspořádání – řadovou ves (tři
// domy po pěti čtvercích, pole za nimi na obě strany) a samoty (tři domy daleko od sebe, každý
// uprostřed polnosti) – se všemi čtverci pole připravenými a dvěma dospělými v každém domě
// (pevné složení jako sondy kalibrace). 30 let simulace, měří se roky 8–30 vždy po plánu osevu:
// - za úhorem: podíl osetých čtverců, ke kterým od domu nevede cesta po mřížce bez přílohu (ani
//   vody a cizích pozemků) kratší než 1,3 × vzdušná čára + 1 čtverec – sedlák musí přes úhor,
// - skupiny: souvislé skupiny osetých čtverců (4-sousedství) a čtverců na skupinu,
// - hrany: strany mezi osetým a neosetým čtvercem pole na osetý čtverec,
// - vzdálenost osetého čtverce od nejbližšího domu, příplatek za chůzi (vážený plochou),
// - sklizeň (kg za rok) a polní práce plánu (člověkodny za rok).
import { dayIndexOf } from '../src/domain/calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  surfaceAt,
  tileCenterWorld,
  type Landscape,
} from '../src/domain/landscape';
import {
  advanceVillage,
  distanceFactor,
  fieldPartsFromCells,
  placementVillageOf,
  planCrops,
  type Dwelling,
  type FieldPart,
  type Person,
  type TileCell,
  type VillageState,
} from '../src/domain/village';

const SEEDS = Number(process.argv[2] ?? 12);
const YEARS = 30;
const FROM_YEAR = 8;
const START = dayIndexOf({ year: 600, month: 8, day: 20 });
const AGES = [25.5, 25.5];
const STEP_DAYS = 28;
const DETOUR = { factor: 1.3, cells: 1 };

interface Layout {
  name: string;
  homes: TileCell[];
  cells: TileCell[];
}

const key = (c: TileCell): string => `${c.x},${c.y}`;
const NEIGHBOURS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function layouts(l: Landscape): Layout[] {
  const { x: sx, y: sy } = l.villageSite;
  const dry = (c: TileCell): boolean =>
    c.x >= 0 && c.y >= 0 && c.x < l.size && c.y < l.size && surfaceAt(l, c.x, c.y) !== 'water';
  const row: TileCell[] = [];
  for (let y = sy - 24; y <= sy + 24; y++) {
    if (y === sy) continue;
    for (let x = sx - 7; x <= sx + 7; x++) row.push({ x, y });
  }
  const farmHomes = [
    { x: sx - 14, y: sy - 4 },
    { x: sx + 1, y: sy + 2 },
    { x: sx - 6, y: sy + 13 },
  ];
  const farms: TileCell[] = [];
  for (let y = sy - 25; y <= sy + 30; y++) {
    for (let x = sx - 30; x <= sx + 20; x++) {
      if (farmHomes.some((h) => Math.hypot(h.x - x, h.y - y) <= 8.8)) farms.push({ x, y });
    }
  }
  return [
    { name: 'řadová ves', homes: [-5, 0, 5].map((dx) => ({ x: sx + dx, y: sy })), cells: row },
    { name: 'samoty', homes: farmHomes, cells: farms },
  ]
    .filter((layout) => layout.homes.every(dry))
    .map((layout) => {
      const homes = new Set(layout.homes.map(key));
      return { ...layout, cells: layout.cells.filter((c) => dry(c) && !homes.has(key(c))) };
    });
}

function pin(state: VillageState, day: number): void {
  let id = 1_000_000;
  state.people = state.dwellings.flatMap((d) =>
    AGES.map((age): Person => ({
      id: id++,
      bornDay: day - Math.ceil(age * 365.25),
      dwellingId: d.id,
    })),
  );
}

function village(l: Landscape, layout: Layout): VillageState | null {
  const dwellings: Dwelling[] = layout.homes.map((cell, i) => {
    const c = tileCenterWorld(l, cell.x, cell.y);
    return {
      id: i + 1,
      type: 'polozemnice',
      builtDay: START - 1,
      condition: 1,
      position: { x: c.x, z: c.z, rotation: 0 },
      plot: { cell, variant: 'center' },
      forestDistanceM: 50,
    };
  });
  const state: VillageState = {
    seed: 1,
    foundedDay: START - 1,
    lastDay: START - 1,
    nextId: 100,
    people: [],
    dwellings,
    fields: [{ id: 99 }],
    parts: [],
    constructions: [],
    plan: null,
    threshingFromPlan: null,
    storesKg: 2000,
    domesticBacklog: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    clearedObstacles: [],
    felledTrees: [],
    woodLogs: 100,
    plotsMigrated: true,
  };
  const preview = fieldPartsFromCells(
    l,
    placementVillageOf(state, START),
    layout.cells,
    dwellings.map((d) => d.position),
  );
  if (preview.parts.length === 0) return null;
  state.parts = preview.parts.map((p, i): FieldPart => ({
    id: 1000 + i,
    fieldId: 99,
    areaM2: p.areaM2,
    distanceM: p.distanceM,
    naturalFertility: p.naturalFertility,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 1,
    foundingDone: 1,
    surface: 'meadow',
    cell: p.cell!,
  }));
  return state;
}

interface Metrics {
  detour: number;
  patches: number;
  cellsPerPatch: number;
  edges: number;
  distanceM: number;
  walk: number;
}

function measure(l: Landscape, state: VillageState): Metrics {
  const byCell = new Map(state.parts.map((p) => [key(p.cell!), p]));
  const sown = state.parts.filter((p) => p.state === 'sown');
  const isSown = (c: TileCell): boolean => byCell.get(key(c))?.state === 'sown';
  let patches = 0;
  const seen = new Set<string>();
  for (const p of sown) {
    if (seen.has(key(p.cell!))) continue;
    patches++;
    const stack = [p.cell!];
    seen.add(key(p.cell!));
    while (stack.length > 0) {
      const c = stack.pop()!;
      for (const [dx, dy] of NEIGHBOURS_4) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (isSown(n) && !seen.has(key(n))) {
          seen.add(key(n));
          stack.push(n);
        }
      }
    }
  }
  let edges = 0;
  for (const p of sown) {
    for (const [dx, dy] of NEIGHBOURS_4) {
      const n = byCell.get(key({ x: p.cell!.x + dx, y: p.cell!.y + dy }));
      if (n && n.state !== 'sown') edges++;
    }
  }
  // cesta od domu po mřížce bez přílohu (Dijkstra s jednoduchou frontou – okna jsou malá)
  const homes = new Set(state.dwellings.map((d) => key(d.plot!.cell)));
  const paths = new Map<number, Map<string, number>>();
  for (const d of state.dwellings) {
    const start = d.plot!.cell;
    const dist = new Map([[key(start), 0]]);
    const queue: [number, TileCell][] = [[0, start]];
    while (queue.length > 0) {
      queue.sort((a, b) => a[0] - b[0]);
      const [dc, c] = queue.shift()!;
      if (dc > dist.get(key(c))!) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = { x: c.x + dx, y: c.y + dy };
          if ((!dx && !dy) || Math.abs(n.x - start.x) > 40 || Math.abs(n.y - start.y) > 40)
            continue;
          if (n.x < 0 || n.y < 0 || n.x >= l.size || n.y >= l.size) continue;
          const part = byCell.get(key(n));
          const blocked =
            surfaceAt(l, n.x, n.y) === 'water' || homes.has(key(n)) || part?.state === 'fallow';
          if (blocked && !isSown(n)) continue;
          const nd = dc + Math.hypot(dx, dy);
          if (nd < (dist.get(key(n)) ?? Infinity)) {
            dist.set(key(n), nd);
            queue.push([nd, n]);
          }
        }
      }
    }
    paths.set(d.id, dist);
  }
  let detour = 0;
  let distance = 0;
  let walk = 0;
  let area = 0;
  for (const p of sown) {
    let best = Infinity;
    let home = state.dwellings[0]!;
    for (const d of state.dwellings) {
      const r = Math.hypot(d.plot!.cell.x - p.cell!.x, d.plot!.cell.y - p.cell!.y);
      if (r < best) {
        best = r;
        home = d;
      }
    }
    const path = paths.get(home.id)!.get(key(p.cell!)) ?? Infinity;
    if (path > DETOUR.factor * best + DETOUR.cells) detour++;
    distance += best * l.cellSizeM;
    walk += p.areaM2 * distanceFactor(p.distanceM);
    area += p.areaM2;
  }
  const n = Math.max(1, sown.length);
  return {
    detour: detour / n,
    patches,
    cellsPerPatch: sown.length / Math.max(1, patches),
    edges: edges / n,
    distanceM: distance / n,
    walk: walk / Math.max(1, area) - 1,
  };
}

interface Run {
  metrics: Metrics[];
  harvestKg: number;
  workMd: number;
}

function run(start: VillageState): Run {
  let state = start;
  const metrics: Metrics[] = [];
  let harvestKg = 0;
  let workMd = 0;
  const l = landscapeOf.get(start)!;
  for (let year = 0; year < YEARS; year++) {
    const planDay = dayIndexOf({ year: 600 + year, month: 9, day: 2 });
    while (state.lastDay < planDay) {
      const from = state.lastDay;
      pin(state, from + 1);
      state = advanceVillage(state, Math.min(planDay, from + STEP_DAYS), null);
      if (year < FROM_YEAR) continue;
      for (const e of state.chronicle) {
        if (e.kind === 'harvest' && e.day > from && e.day <= state.lastDay) harvestKg += e.kg;
      }
    }
    if (year < FROM_YEAR) continue;
    metrics.push(measure(l, state));
    for (const { work } of state.plan ? planCrops(state.plan) : []) {
      workMd += Object.values(work.required).reduce((a, b) => a + b, 0);
    }
  }
  return {
    metrics,
    harvestKg: harvestKg / (YEARS - FROM_YEAR - 1),
    workMd: workMd / metrics.length,
  };
}

const landscapeOf = new WeakMap<VillageState, Landscape>();
const results = new Map<string, Run[]>();
for (let seed = 1; seed <= SEEDS; seed++) {
  const l = generateLandscape(seed, CURRENT_LAYER_VERSIONS);
  for (const layout of layouts(l)) {
    const state = village(l, layout);
    if (!state) continue;
    landscapeOf.set(state, l);
    results.set(layout.name, [...(results.get(layout.name) ?? []), run(state)]);
  }
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const fmt = (x: number, digits = 1): string =>
  x.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
for (const [name, runs] of results) {
  const all = runs.flatMap((r) => r.metrics);
  const avg = (f: (m: Metrics) => number): number => mean(all.map(f));
  console.log(`${name} (${runs.length} krajin)`);
  console.log(`  osetých čtverců za úhorem   ${fmt(avg((m) => m.detour) * 100)} %`);
  console.log(`  souvislých skupin osevu     ${fmt(avg((m) => m.patches))}`);
  console.log(`  čtverců na skupinu          ${fmt(avg((m) => m.cellsPerPatch))}`);
  console.log(
    `  hran k neosetému na čtverec ${fmt(
      avg((m) => m.edges),
      2,
    )}`,
  );
  console.log(`  vzdálenost od domu          ${fmt(avg((m) => m.distanceM))} m`);
  console.log(`  příplatek za chůzi          ${fmt(avg((m) => m.walk) * 100, 2)} %`);
  console.log(`  sklizeň                     ${fmt(mean(runs.map((r) => r.harvestKg)), 0)} kg/rok`);
  console.log(`  polní práce plánu           ${fmt(mean(runs.map((r) => r.workMd)), 0)} čd/rok`);
}
