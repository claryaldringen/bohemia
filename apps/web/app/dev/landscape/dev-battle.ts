// VÝVOJOVÝ NÁSTROJ – ukázka Bitva na /dev/landscape (war.md – Ve scéně; fortifications.md – Ve
// scéně), bez databáze: ves ukázky dostane palisádu s branou na jihu a boj běží skutečným taktem
// jádra (`battleTick`, 4 takty za sekundu) – dvě skupiny útočníků z jihu (jezdci rodu s pěšími
// „útočit na vše“, lučištník s pěšími „držet místo“) proti mužům u domů. Brána se před útočníky
// zavře, pěší ji prolomí sekerami a vniknou dovnitř; padlí leží, ranění sedí u domů. Druhý krok –
// útěk vsi: lidé se zásobami k lesu, vojsko přijde hloučky a odežene stádo. Mlha války
// z pohledu útočníka. Třetí krok – útok na hradbu (plán hradeb Úloha 21): palisáda s ochozem,
// obránci na ochozu házejí kameny a oštěpy, jedna skupina nese žebříky (ukázka je přinese
// rovnou – v boji je muži vyrobí v lese), druhá nanosí otepi z dříví vsi k patě a zapálí ji.
import {
  OFFICIAL_WORLD,
  addGate,
  battleForts,
  battleTick,
  fortificationArea,
  areaOutline,
  fortSegments,
  foundVillage,
  hoursPerTick,
  marchGrid,
  nearestForest,
  obstaclesOf,
  openBattle,
  tickRandom,
  tileCenterWorld,
  type BattleAttacker,
  type BattleField,
  type BattleState,
  type Defender,
  type FortOutline,
  type Fortification,
  type Landscape,
  type Pos,
} from '@bohemia/game';
import { sceneFortification, type SceneFortification } from '@/lib/fort-view';
import {
  battleFortifications,
  battleWalls,
  sceneBattle,
  type SceneMarch,
  type SceneWall,
} from '@/lib/scene/army';
import type { SceneWar } from '@/lib/scene/army-renderer';
import { planFlight, type FleeingPerson } from '@/lib/scene/villager-plan';
import type { SceneVillage } from '@/lib/village-view';

export type BattleDemoStage = 'fight' | 'flight' | 'walls';
export const BATTLE_DEMO_STAGES: Record<BattleDemoStage, string> = {
  fight: 'boj u brány',
  flight: 'útěk vsi',
  walls: 'útok na hradbu',
};

/** Další krok ukázky: vypnuto → boj u brány → útěk vsi → útok na hradbu → vypnuto. */
export function nextBattleDemo(stage: BattleDemoStage | null): BattleDemoStage | null {
  if (stage === null) return 'fight';
  if (stage === 'fight') return 'flight';
  if (stage === 'flight') return 'walls';
  return null;
}

/** Id opevnění ukázky (mimo id vývojové vsi). */
const FORT_ID = 9301;
/** Polovina strany palisády ve čtvercích (6 × 6 čtverců kolem místa vsi). */
const HALF_CELLS = 3;
/** Útočníci začínají tolik m jižně od brány. */
const START_M = 120;
/** Den ukázky – padlí leží ještě tolik s po konci boje (zkrácený „konec dne“). */
const FALLEN_AFTER_S = 40;

/** Rozjetá ukázka – stav boje jádra, bojiště a palisáda vsi. */
export interface BattleDemo {
  stage: BattleDemoStage;
  battle: BattleState | null;
  field: BattleField | null;
  fort: SceneFortification | null;
  gate: Pos;
  tick: number;
  startMs: number;
  endMs: number | null;
  /** Útěk: lidé ukázky, les a kam vojsko jde. */
  flight: SceneWar['flight'];
  /** Hradby bojiště pro scénu (výšky lezců a obránců na ochozu) – jednou za ukázku. */
  walls: SceneWall[];
  forest: Pos;
  homes: Pos[];
}

/**
 * Palisáda kolem místa vsi s branou na jižní straně (jádro – plocha, obvod a brány); útok na
 * hradbu – palisáda s ochozem.
 */
function palisade(
  l: Landscape,
  kind: 'palisade' | 'walkway',
): { fort: Fortification; gate: Pos; outline: FortOutline } | null {
  const site = l.villageSite;
  const cells = [];
  for (let y = site.y - HALF_CELLS; y < site.y + HALF_CELLS; y++) {
    for (let x = site.x - HALF_CELLS; x < site.x + HALF_CELLS; x++) cells.push({ x, y });
  }
  const area = fortificationArea(cells, null, l);
  if ('error' in area) return null;
  // obvod z bodů staré plochy (fortifications.md – Obvod)
  const outline = areaOutline(area, 'palisade');
  const a = tileCenterWorld(l, site.x - HALF_CELLS, site.y - HALF_CELLS);
  const b = tileCenterWorld(l, site.x + HALF_CELLS - 1, site.y - HALF_CELLS);
  const gate = { x: (a.x + b.x) / 2, z: a.z - l.cellSizeM / 2 };
  const gates = addGate(outline, [], gate);
  if (!Array.isArray(gates)) return null;
  return {
    fort: {
      id: FORT_ID,
      points: outline.points,
      kind,
      segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: 0, state: 1 })),
      gates,
    },
    gate,
    outline,
  };
}

/** Nová ukázka: palisáda, bojiště z mřížky pochodu jádra a boj (krok „boj“) nebo útěk. */
export function createBattleDemo(
  stage: BattleDemoStage,
  l: Landscape,
  village: SceneVillage,
  day: number,
  nowMs: number,
): BattleDemo | null {
  const made = palisade(l, stage === 'walls' ? 'walkway' : 'palisade');
  if (!made) return null;
  const { fort, gate, outline } = made;
  const site = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const state = {
    ...foundVillage({ seed: 7, day, dwellingPosition: { x: site.x, z: site.z, rotation: 0 } }),
    fortifications: [fort],
  };
  const grid = marchGrid(l, obstaclesOf(l), state, { day });
  // útok na hradbu: dříví vsi (hromada klád) na otepi kousek před jižní hradbou
  const fuel = stage === 'walls' ? [{ x: gate.x - 30, z: gate.z - 30 }] : undefined;
  const field: BattleField = {
    grid,
    geo: l,
    forts: battleForts(l, [fort]),
    day,
    hoursPerTick: hoursPerTick(OFFICIAL_WORLD),
    ...(fuel ? { fuel } : {}),
  };
  const sceneFort = sceneFortification(
    fort,
    outline,
    fort.segments.map(() => ({ age: 1 })),
    { building: false },
  );
  const built = village.dwellings
    .filter((d) => d.built)
    .map((d) => ({ x: d.position.x, z: d.position.z }));
  // ves bez obydlí (prázdná ukázka) – obránci stojí na šesti místech uvnitř palisády
  const homes =
    built.length >= 3
      ? built
      : Array.from({ length: 6 }, (_, i) => ({
          x: site.x + 22 * Math.cos((i * Math.PI) / 3),
          z: site.z + 22 * Math.sin((i * Math.PI) / 3),
        }));
  const forest = nearestForest(grid, site) ?? { x: site.x + 200, z: site.z };
  const base: BattleDemo = {
    stage,
    battle: null,
    field,
    fort: sceneFort,
    gate,
    tick: 0,
    startMs: nowMs,
    endMs: null,
    flight: null,
    walls: battleWalls(field.forts, day),
    forest,
    homes,
  };
  if (stage === 'flight') {
    const people: FleeingPerson[] = homes.flatMap((home, i) => [
      { id: i * 3, home, kind: 'woman', child: false, carries: true },
      { id: i * 3 + 1, home, kind: 'man', child: false, carries: true },
      { id: i * 3 + 2, home, kind: 'woman', child: false, carries: i % 2 === 0 },
    ]);
    return {
      ...base,
      field: null,
      walls: [],
      flight: { walks: planFlight(people, forest), startMs: nowMs },
    };
  }
  if (stage === 'walls') {
    const posts = southPosts(base.walls, field.forts[0]?.center ?? site, 12);
    return { ...base, battle: wallAssault(gate, homes, posts) };
  }
  const start = { x: gate.x, z: gate.z - START_M };
  const attackers: BattleAttacker[] = [];
  const add = (group: number, line: boolean, mounted: boolean, dx: number, dz: number): void => {
    attackers.push({
      member: attackers.length,
      group,
      line,
      mounted,
      strength: line ? 1 : 0.4,
      health: 100,
      pos: { x: start.x + dx, z: start.z + dz },
    });
  };
  // skupina 0: velitel a muž rodu na koních, šest pěších – útočit na vše
  add(0, true, true, -3, 4);
  add(0, true, true, 3, 4);
  for (let i = 0; i < 6; i++) add(0, false, false, (i % 3) * 2 - 2, -2 - Math.floor(i / 3) * 2);
  // skupina 1: lučištník rodu a čtyři pěší – držet místo 40 m před branou
  add(1, true, false, 14, -6);
  for (let i = 0; i < 4; i++) add(1, false, false, 12 + (i % 2) * 2, -9 - Math.floor(i / 2) * 2);
  const defenders: Defender[] = homes.slice(0, 6).flatMap((home, i) => {
    const man: Defender = {
      personId: i * 2 + 1,
      pos: home,
      houseGroup: 0,
      strength: i === 0 ? 1 : 0.4,
      line: i === 0,
      bow: i === 0,
      atHouseOnly: false,
      lastLine: i === 0,
    };
    // u každého druhého domu i žena – brání jen dům
    return i % 2 === 0
      ? [man]
      : [
          man,
          {
            ...man,
            personId: i * 2 + 2,
            strength: 0.2,
            line: false,
            bow: false,
            atHouseOnly: true,
          },
        ];
  });
  const battle = openBattle({
    attackers,
    defenders,
    groups: [
      { id: 0, order: 'attack-all', holdAt: null },
      { id: 1, order: 'hold-place', holdAt: { x: gate.x + 12, z: gate.z - 40 } },
    ],
    commander: 0,
    deputy: 1,
    liveCommand: false,
  });
  return { ...base, battle };
}

/** Útočníci před hradbou: tolik m jižně od brány. */
const WALL_START_M = 45;

/** Stanoviště na ochozu (ukázka – jako `wallPosts` jádra): po 5 m 1 m za čarou, nejjižnější. */
function southPosts(walls: readonly SceneWall[], center: Pos, count: number): Pos[] {
  const posts: Pos[] = [];
  for (const w of walls) {
    // po lomené čáře úseku – další stanoviště vždy po 5 m délky
    let next = 2.5;
    let walked = 0;
    for (let i = 0; i + 1 < w.path.length; i++) {
      const a = w.path[i]!;
      const b = w.path[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (; next < walked + len; next += 5) {
        const u = (next - walked) / len;
        const p = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
        const k = Math.hypot(center.x - p.x, center.z - p.z) || 1;
        posts.push({ x: p.x + (center.x - p.x) / k, z: p.z + (center.z - p.z) / k });
      }
      walked += len;
    }
  }
  return posts.sort((p, q) => p.z - q.z).slice(0, count);
}

/**
 * Útok na palisádu s ochozem: skupina se žebříky (přinesla je – `Fighter.ladder`) západně od
 * brány, skupina s ohněm východně (postup skupině – `BattleGroup.assault`); obránci ze šesti domů
 * obsadí ochoz (`wall-defense.ts`).
 */
function wallAssault(gate: Pos, homes: readonly Pos[], posts: readonly Pos[]): BattleState {
  const attackers: BattleAttacker[] = [];
  const add = (group: number, line: boolean, dx: number, dz: number): void => {
    attackers.push({
      member: attackers.length,
      group,
      line,
      mounted: false,
      strength: line ? 1 : 0.5,
      health: 100,
      pos: { x: gate.x + dx, z: gate.z - WALL_START_M + dz },
    });
  };
  // skupina 0 – žebříky (velitel a šest pěších), skupina 1 – oheň (muž rodu a pět pěších)
  add(0, true, -24, 0);
  for (let i = 0; i < 6; i++) add(0, false, -28 + (i % 3) * 3, -3 - Math.floor(i / 3) * 2);
  add(1, true, 24, 0);
  for (let i = 0; i < 5; i++) add(1, false, 20 + (i % 3) * 3, -3 - Math.floor(i / 3) * 2);
  const defenders: Defender[] = homes.slice(0, 6).flatMap((home, i) => [
    {
      personId: i * 2 + 1,
      pos: home,
      houseGroup: 0,
      strength: i === 0 ? 1 : 0.5,
      line: i === 0,
      bow: i === 0,
      atHouseOnly: false,
      lastLine: i === 0,
      ...(posts[i * 2] ? { post: posts[i * 2]! } : {}),
    },
    {
      personId: i * 2 + 2,
      pos: home,
      houseGroup: 0,
      strength: 0.4,
      line: false,
      bow: false,
      atHouseOnly: false,
      lastLine: false,
      ...(posts[i * 2 + 1] ? { post: posts[i * 2 + 1]! } : {}),
    },
  ]);
  const battle = openBattle({
    attackers,
    defenders,
    groups: [
      { id: 0, order: 'attack-all', holdAt: null },
      { id: 1, order: 'attack-all', holdAt: null },
    ],
    commander: 0,
    deputy: 7,
    liveCommand: false,
  });
  for (const g of battle.groups) {
    if (g.side === 'attack') g.assault = g.id === 0 ? 'ladder' : 'burn';
  }
  for (const f of battle.fighters) if (f.side === 'attack' && f.group === 0) f.ladder = true;
  return battle;
}

/** Jeden takt boje ukázky (jádro – `battleTick`); po konci boje nic. Vrátí, jestli boj běží. */
export function stepBattleDemo(demo: BattleDemo, nowMs: number): boolean {
  if (!demo.battle || !demo.field) return false;
  if (demo.battle.outcome !== 'ongoing') return false;
  demo.tick++;
  battleTick(demo.battle, demo.field, tickRandom(97, demo.tick, 'battle'));
  if (demo.battle.outcome !== 'ongoing') demo.endMs = nowMs;
  return true;
}

/** Pochod útěku: dvě skupiny jdou od jihu ke vsi, postojí a odejdou s odehnaným stádem. */
function flightMarch(
  demo: BattleDemo,
  nowMs: number,
): { march: SceneMarch; herd: SceneWar['herd'] } {
  const t = (nowMs - demo.startMs) / 1000;
  const walk = 1.5;
  const reach = START_M + 20;
  const arriveS = reach / walk;
  const leaveS = arriveS + 15;
  const at = (dx: number): Pos => {
    const out = t < arriveS ? reach - t * walk : t < leaveS ? 0 : (t - leaveS) * walk;
    return { x: demo.gate.x + dx, z: demo.gate.z - 20 - Math.min(reach + 60, out) };
  };
  const heading = t < leaveS ? { x: 0, z: 1 } : { x: 0, z: -1 };
  const arrived = t >= arriveS && t < leaveS;
  const groups = [
    { id: 0, order: 'follow-leader' as const, pos: at(-8), arrived, heading },
    { id: 1, order: 'attack-all' as const, pos: at(10), arrived, heading },
  ];
  const members = [
    ...Array.from({ length: 2 }, () => ({
      line: true,
      mounted: true,
      wounded: false,
      group: 0,
      status: 'active' as const,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      line: false,
      mounted: false,
      wounded: i === 6,
      group: 0,
      status: 'active' as const,
    })),
    { line: true, mounted: false, wounded: false, group: 1, status: 'active' as const },
    ...Array.from({ length: 5 }, () => ({
      line: false,
      mounted: false,
      wounded: false,
      group: 1,
      status: 'active' as const,
    })),
  ];
  const herd = t >= leaveS ? { lead: groups[0]!.pos, heading, count: 6 } : null;
  return { march: { members, groups }, herd };
}

/** Válka ve scéně ukázky v okamžiku `nowMs` (boj po posledním taktu, nebo útěk a pochod). */
export function battleDemoWar(demo: BattleDemo, nowMs: number): SceneWar {
  if (demo.stage === 'flight') {
    const { march, herd } = flightMarch(demo, nowMs);
    return { battle: null, march, flight: demo.flight, herd, fog: null, dayEndMs: null };
  }
  return {
    battle: demo.battle ? sceneBattle(demo.battle, demo.walls) : null,
    march: null,
    flight: null,
    herd: null,
    fog: { side: 'attack' },
    dayEndMs: demo.endMs === null ? null : demo.endMs + FALLEN_AFTER_S * 1000,
  };
}

/** Ves ukázky s palisádou: brány zavřené a průlomy podle boje. */
export function withBattleDemo(
  village: SceneVillage,
  demo: BattleDemo | null,
  day: number,
): SceneVillage {
  if (!demo?.fort) return village;
  const forts = demo.battle
    ? battleFortifications([demo.fort], sceneBattle(demo.battle, demo.walls), day)
    : demo.stage === 'flight'
      ? [{ ...demo.fort, gatesClosed: true as const }]
      : [demo.fort];
  return { ...village, forts: [...(village.forts ?? []), ...forts] };
}
