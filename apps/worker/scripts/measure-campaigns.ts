import { Session } from 'node:inspector/promises';
import { parseArgs } from 'node:util';
import {
  circlePoints,
  dayIndexOf,
  emptyCellLandscape,
  fortificationOutline,
  fortSegments,
  foundVillage,
  newCampaign,
  OFFICIAL_WORLD,
  realTimeOf,
  stepCampaign,
  type CampaignIntent,
  type CampaignMap,
  type CampaignMember,
  type CampaignState,
  type CampaignWorld,
  type GridCell,
  type VillageState,
} from '@bohemia/game';

// Měření tažení (plán 2026-11-03 – Úloha 6.17; docs/code/worker.md – Výkon): 1 / 5 / 20 tažení
// × 60 mužů na pochodu přes skutečné krajiny prázdných políček a 5 tažení u opevněných vsí
// (prolamování, útočiště). Všechno v paměti – žádná databáze. Smyčka napodobí worker
// (`stepCampaigns` každých 250 ms): každé kolo načte kontrolní bod (JSON jako jsonb), dopočítá
// tažení do teď a bod uloží, až přibude ≥ 40 taktů nebo vznikne událost – mezi uloženími se tedy
// takty počítají znovu od bodu. „Takty/s“ = spočtené takty tažení za sekundu času procesoru
// jednoho jádra; „jádro“ = čas procesoru ÷ skutečný čas, který kola představují.
//
//   npx tsx apps/worker/scripts/measure-campaigns.ts [--ticks 480] [--profile]

const { values: args } = parseArgs({
  options: {
    ticks: { type: 'string', default: '480' },
    profile: { type: 'boolean', default: false },
  },
});
const TICKS = Number(args.ticks);
const MEN = 60;
const WORLD_SEED = 1;
const SAVE_EVERY = 40;
const TICK_S = 0.25;
const PATH_FUNCTIONS = new Set(['marchPath', 'marchPathToEdge', 'worldRoute']);
const GRID_FUNCTIONS = new Set(['marchGrid']);

const world = OFFICIAL_WORLD;
/** Léto 501 – pochod bez zimy. */
const SUMMER = { year: 501, month: 7, day: 15 };
const START_TICK = Math.ceil((realTimeOf(SUMMER, world) - world.startMs) / 250);
const DAY = dayIndexOf(SUMMER);

const maps = new Map<string, CampaignMap>();
const villages = new Map<string, VillageState>();
const keyOf = (c: GridCell): string => `${c.x},${c.y}`;

function emptyMap(cell: GridCell): CampaignMap {
  const key = keyOf(cell);
  let map = maps.get(key);
  if (!map) {
    const cl = emptyCellLandscape(WORLD_SEED, cell);
    map = { landscape: cl.landscape, obstacles: cl.obstacles, villageIds: [] };
    maps.set(key, map);
  }
  return map;
}

/** Opevněná ves na políčku: zakladatelé v dostavěné zemnici, palisáda kolem jádra (r = 35 m). */
function fortifiedVillage(cell: GridCell, id: string): void {
  const cl = emptyCellLandscape(WORLD_SEED, cell);
  const founded = foundVillage({
    seed: cell.x * 1000 + cell.y,
    day: DAY - 1,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    obstacles: cl.obstacles,
  });
  const site = founded.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null);
  const outline = fortificationOutline(circlePoints([0, 0], 35), 'palisade');
  if (!site || site.dwellingId === null || !site.position || !outline) {
    throw new Error('Ves bez zemnice nebo obvodu.');
  }
  const state: VillageState = {
    ...founded,
    constructions: founded.constructions.filter((c) => c !== site),
    dwellings: [
      ...founded.dwellings,
      {
        id: site.dwellingId,
        type: 'zemnice',
        builtDay: founded.lastDay,
        condition: 1,
        position: site.position,
      },
    ],
    defense: { stance: 'defend' },
    fortifications: [
      {
        id: 1,
        grid: null,
        points: circlePoints([0, 0], 35),
        kind: 'palisade',
        segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: 0, state: 1 })),
        gates: [],
      },
    ],
  };
  villages.set(id, state);
  maps.set(keyOf(cell), { landscape: cl.landscape, obstacles: cl.obstacles, villageIds: [id] });
}

const campaignWorld: CampaignWorld = {
  clock: world,
  landscapeOf: (cell) => maps.get(keyOf(cell)) ?? emptyMap(cell),
  villageAt: (id) => villages.get(id) ?? null,
};

function members(villageId: string): CampaignMember[] {
  return Array.from({ length: MEN }, (_, i) => ({
    ref: { villageId, personId: i + 1 },
    playerId: 'p',
    line: i === 0,
    mounted: false,
    forced: false,
    strength: i === 0 ? 2 : 0.4,
    health: 100,
    vigor: 1,
    wounded: false,
    group: i % 3,
    status: 'active' as const,
  }));
}

/** Tažení z (0, y) na (2, y) – pochod přes dvě mapy. */
function marching(k: number): CampaignState {
  const y = k % 5;
  return newCampaign(
    {
      id: `m${k}`,
      warId: 'w',
      seed: k + 1,
      tick: START_TICK,
      playerId: 'p',
      leaderName: 'Bořivoj',
      commander: { villageId: `home${k}`, personId: 1 },
      deputy: { villageId: `home${k}`, personId: 2 },
      assembly: {
        villageId: `home${k}`,
        cell: { x: 0, y },
        pos: { x: -400 + 30 * (k % 7), z: 0 },
      },
      target: { villageId: `t${k}`, cell: { x: 2, y }, pos: { x: 0, z: 0 } },
      members: members(`home${k}`),
      foodKg: 600,
      liveCommand: false,
    },
    world,
  );
}

/** Tažení stojí 150 m od opevněné vsi na (1, 10 + k) – nájezd hned v prvním taktu. */
function besieging(k: number): CampaignState {
  const cell = { x: 1, y: 10 + k };
  const id = `fort${k}`;
  fortifiedVillage(cell, id);
  const at = { x: 150, z: 0 };
  const base = newCampaign(
    {
      id: `f${k}`,
      warId: 'w',
      seed: 100 + k,
      tick: START_TICK,
      playerId: 'p',
      leaderName: 'Bořivoj',
      commander: { villageId: `home${k}`, personId: 1 },
      deputy: { villageId: `home${k}`, personId: 2 },
      assembly: { villageId: `home${k}`, cell: { x: 0, y: 10 + k }, pos: { x: 0, z: 0 } },
      target: { villageId: id, cell, pos: at },
      members: members(`home${k}`),
      foodKg: 600,
      liveCommand: false,
    },
    world,
  );
  return {
    ...base,
    phase: 'marching',
    groups: base.groups.map((g) => ({
      ...g,
      cell: { ...cell },
      pos: { ...at },
      goal: { cell: { ...cell }, pos: { ...at } },
      arrived: true,
    })),
  };
}

const SET_OUT: CampaignIntent[] = [
  { tick: START_TICK + 1, seq: 1, byPlayer: 'p', body: { kind: 'set-out' } },
];

interface Result {
  campaigns: number;
  ticks: number;
  cpuS: number;
  realS: number;
  phases: string;
}

/** Kola jako worker: bod z JSON, dopočet do teď, uložení po ≥ 40 taktech nebo s událostí. */
function run(starts: readonly CampaignState[]): Result {
  const points = starts.map((s) => ({ json: JSON.stringify(s), tick: s.tick, last: s }));
  let ticks = 0;
  const before = process.cpuUsage();
  for (let round = 1; round <= TICKS; round++) {
    const now = START_TICK + round;
    for (const point of points) {
      const state = JSON.parse(point.json) as CampaignState;
      if (state.phase === 'done') continue;
      const step = stepCampaign(state, now, SET_OUT, campaignWorld);
      ticks += step.state.tick - state.tick;
      point.last = step.state;
      const events = step.villageEvents.length + step.notices.length > 0;
      if (step.state.tick - point.tick >= SAVE_EVERY || events || step.state.phase === 'done') {
        point.json = JSON.stringify(step.state);
        point.tick = step.state.tick;
      }
    }
  }
  const used = process.cpuUsage(before);
  const phases = new Map<string, number>();
  for (const { last: s } of points) {
    const label = s.battle ? `${s.phase}/${s.battle.breaches.length} průlomů` : s.phase;
    phases.set(label, (phases.get(label) ?? 0) + 1);
  }
  return {
    campaigns: starts.length,
    ticks,
    cpuS: (used.user + used.system) / 1e6,
    realS: TICKS * TICK_S,
    phases: [...phases].map(([k, n]) => `${n}× ${k}`).join(', '),
  };
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string };
  children?: number[];
  hitCount?: number;
}

/** Podíl vzorků (s potomky) pod hledáním cesty a pod stavbou mřížky + nejdražší funkce sami. */
async function profiled(starts: readonly CampaignState[]): Promise<string> {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 200 });
  await session.post('Profiler.start');
  run(starts);
  const { profile } = (await session.post('Profiler.stop')) as {
    profile: { nodes: ProfileNode[] };
  };
  session.disconnect();
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const under = (id: number, names: Set<string>): boolean => {
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      if (names.has(byId.get(cur)!.callFrame.functionName)) return true;
    }
    return false;
  };
  let total = 0;
  let path = 0;
  let grid = 0;
  const self = new Map<string, number>();
  for (const n of profile.nodes) {
    const hits = n.hitCount ?? 0;
    const name = n.callFrame.functionName || '(anonymní)';
    if (hits === 0 || name === '(idle)' || name === '(program)') continue;
    total += hits;
    if (under(n.id, PATH_FUNCTIONS)) path += hits;
    if (under(n.id, GRID_FUNCTIONS)) grid += hits;
    self.set(name, (self.get(name) ?? 0) + hits);
  }
  const top = [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => `${k} ${((100 * n) / total).toFixed(0)} %`)
    .join(', ');
  const pct = (n: number): string => `${((100 * n) / total).toFixed(0)} %`;
  return `cesta ${pct(path)}, mřížka ${pct(grid)}; sami: ${top}`;
}

async function main(): Promise<void> {
  const scenarios: [string, () => CampaignState[]][] = [
    ['pochod 1', () => [marching(0)]],
    ['pochod 5', () => Array.from({ length: 5 }, (_, k) => marching(k))],
    ['pochod 20', () => Array.from({ length: 20 }, (_, k) => marching(k))],
    ['opevněné 5', () => Array.from({ length: 5 }, (_, k) => besieging(k))],
  ];
  console.log(`takty ${TICKS} (${(TICKS * TICK_S).toFixed(0)} s skutečného času), ${MEN} mužů`);
  for (const [name, make] of scenarios) {
    const starts = make();
    // krajiny se generují předem – worker je má v mezipaměti krajin
    for (const s of starts) {
      campaignWorld.landscapeOf(s.assembly.cell);
      campaignWorld.landscapeOf(s.target.cell);
      campaignWorld.landscapeOf({ x: 1, y: s.target.cell.y });
    }
    const r = run(starts);
    // bez opakování od bodu by každé kolo spočetlo jen nový takt každého tažení
    const once = (r.cpuS / r.ticks) * r.campaigns * TICKS;
    const line =
      `${name.padEnd(11)} takty/s ${(r.ticks / r.cpuS).toFixed(0).padStart(6)}, ` +
      `jádro ${((100 * r.cpuS) / r.realS).toFixed(1).padStart(5)} % (${r.cpuS.toFixed(1)} s), ` +
      `takt jednou ${((100 * once) / r.realS).toFixed(1)} % – ${r.phases}`;
    console.log(line);
    if (args.profile) console.log(`            profil: ${await profiled(starts)}`);
  }
}

await main();
