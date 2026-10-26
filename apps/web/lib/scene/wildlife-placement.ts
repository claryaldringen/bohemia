// Divoká zvěř ve scéně (docs/design/wildlife.md – Ve scéně): zvěř jsou v jádru jen počty – scéna
// ukáže pár kusů podle stupně stavu (`SceneWildlife.shown`) jako skupiny na okraji lesa, na
// loukách, u kraje vsi a v létě na dílu s největší škodou. Čisté funkce bez Babylonu: rozmístění
// je deterministické ze seedu vsi, dat vsi a terénu pro zvířata (`LivestockGround`); pohyb
// skupin je stejný jako u stád dobytka (livestock-motion.ts), útěk a výskyt ve wildlife-motion.ts.

import type { SceneWildlife } from '../village-view-scene-types';
import type { WildlifeSpecies } from '../wildlife-view';
import {
  GROUND_REACH_M,
  type Herd,
  type HerdAnimal,
  type HerdKind,
  type LivestockGround,
  type LivestockSpecies,
  type LivestockVillage,
} from './livestock-placement';
import { hash01 } from './smoke-schedule';

/** Modely zvěře (`public/models/fauna/<model>.glb` – W8; buffery hlídá fauna.test.ts). */
export type WildModel =
  'wild-boar' | 'wild-stag' | 'wild-hind' | 'wild-wolf' | 'wild-bear' | 'wild-fox' | 'wild-hare';

export const WILD_MODELS: readonly WildModel[] = [
  'wild-boar',
  'wild-stag',
  'wild-hind',
  'wild-wolf',
  'wild-bear',
  'wild-fox',
  'wild-hare',
];

/** Kde skupina je: okraj lesa (prasata, šelmy), louka před lesem (jelení zvěř), louka (i strniště), kraj vsi, díl se škodou. */
export type WildZone = 'edge' | 'verge' | 'meadow' | 'village' | 'field';

/** Skupina zvěře – stádo s trasou (pohyb jako dobytek) a model každého kusu. */
export interface WildGroup {
  /** Druh pro výběr kliknutím (panel druhu). */
  species: WildlifeSpecies;
  zone: WildZone;
  herd: Herd;
  /** Model kusu `i` (`herd.animals[i]`). */
  models: WildModel[];
  /** Podíl úseků skutečného času, kdy je skupina vidět (1 vždy – vzácní vlci a medvěd méně). */
  presence: number;
  /** Rychlost útěku (m/s). */
  fleeSpeed: number;
}

/** Co z vsi rozhoduje o zvěři – stavby, pole a zvěř z jádra. */
export interface WildlifeVillage extends Pick<
  LivestockVillage,
  'dwellings' | 'cemeteries' | 'orchards' | 'pens'
> {
  fields: readonly {
    parts: readonly {
      id?: number;
      x: number;
      z: number;
      size: number;
      look?: string;
    }[];
  }[];
  wildlife?: SceneWildlife;
  /** Pokácený les (jen počty do otisku) – okraj lesa se mění s kácením. */
  obstacles?: { removed: readonly unknown[]; stumps: readonly unknown[] };
}

/** Rozteč míst, na kterých se hledá stanoviště (m), a jak daleko od středu vsi (m). */
const SITE_STEP_M = 8;
const SITE_REACH_M = GROUND_REACH_M - 20;
/** Zvěř se drží dál od obydlí (m): okraj lesa, louky; liška u kraje vsi v pásu od–do. */
const EDGE_DWELLING_M = 45;
const MEADOW_DWELLING_M = 55;
const FOX_DWELLING_M = { from: 22, to: 60 };
/** Obydlí blokuje kruh (m) – dům s dvorkem; pozemek svým čtvercem. */
const DWELLING_CLEAR_M = 12;
/** Další stanoviště trasy leží tolik metrů od předchozího. */
const ROUTE_STEP_M = { from: 14, to: 34 };
const ROUTE_SPOTS = 3;
/** Skupiny se drží od sebe (m). */
const GROUP_GAP_M = 40;
/** Přihrádky pro dotaz „je bod volný“ (m). */
const BUCKET_M = 32;
/** Osamělé zvíře (zajíc, liška, medvěd) se toulá v kruhu o tomto poloměru (m). */
const SOLO_RADIUS_M = 3;

/** Zima vlků (prosinec–únor), medvěd duben–listopad, říje září–říjen, léto na polích červen–srpen. */
const WOLF_MONTHS: readonly number[] = [12, 1, 2];
const BEAR_MONTHS = { from: 4, to: 11 };
const RUT_MONTHS: readonly number[] = [9, 10];
const FIELD_MONTHS: readonly number[] = [6, 7, 8];

/** Vzácní: podíl úseků skutečného času, kdy je skupina vidět (návrh Clauda). */
const PRESENCE = { wolf: 0.35, bear: 0.3, fox: 0.6 } as const;

/** Měřítko modelů (modely jsou ve skutečné velikosti, dobytek je stylizovaně větší – `SCALE`). */
const WILD_SCALE: Record<WildModel, { from: number; to: number }> = {
  'wild-boar': { from: 1.05, to: 1.25 },
  'wild-stag': { from: 1.05, to: 1.15 },
  'wild-hind': { from: 1.0, to: 1.12 },
  'wild-wolf': { from: 1.05, to: 1.2 },
  'wild-bear': { from: 1.05, to: 1.15 },
  'wild-fox': { from: 1.15, to: 1.3 },
  'wild-hare': { from: 1.4, to: 1.6 },
};
/** Mláďata: kolouch a sele jsou menší model matky. */
const YOUNG_SCALE = { calf: 0.62, piglet: 0.5 };

/** Chůze a pastva jako dobytek (GAIT v livestock-motion.ts) – nejbližší domácí zvíře. */
const GAIT_OF: Record<WildModel, LivestockSpecies> = {
  'wild-boar': 'pig',
  'wild-stag': 'horse',
  'wild-hind': 'horse',
  'wild-wolf': 'goat',
  'wild-bear': 'cow',
  'wild-fox': 'goat',
  'wild-hare': 'chicken',
};

/** Rychlost útěku (m/s) – jelen nejrychlejší, medvěd nejpomalejší. */
const FLEE_SPEED: Record<WildlifeSpecies, number> = {
  deer: 7,
  boar: 5,
  hare: 6,
  fox: 5,
  wolf: 6,
  bear: 4,
  fish: 0,
};

/** Kus, který se má objevit ve skupině. */
interface Wanted {
  model: WildModel;
  young?: 'calf' | 'piglet';
}

/** Skupiny, které má scéna ukázat (druh, zóna, kusy) – podle `shown`, měsíce a dílu se škodou. */
export function wantedGroups(
  wild: SceneWildlife,
  topPartFound: boolean,
): { species: WildlifeSpecies; zone: WildZone; kind: HerdKind; animals: Wanted[] }[] {
  const s = wild.shown;
  const repeat = (n: number, w: Wanted): Wanted[] =>
    Array.from({ length: Math.max(0, n) }, () => w);
  const groups: ReturnType<typeof wantedGroups> = [];
  const onField = topPartFound && FIELD_MONTHS.includes(wild.month);
  const hinds = [
    ...repeat(s.hinds, { model: 'wild-hind' }),
    ...repeat(s.calves, { model: 'wild-hind', young: 'calf' }),
  ];
  const stags = repeat(s.stags, { model: 'wild-stag' });
  const boar = [
    ...repeat(s.boars, { model: 'wild-boar' }),
    ...repeat(s.piglets, { model: 'wild-boar', young: 'piglet' }),
  ];
  // prasata na díl se škodou (v létě), jinak laně – kde jádro počítá největší škodu
  const boarOnField = onField && boar.length > 0;
  if (boar.length > 0) {
    groups.push({
      species: 'boar',
      zone: boarOnField ? 'field' : 'edge',
      kind: 'swine',
      animals: boar,
    });
  }
  if (RUT_MONTHS.includes(wild.month)) {
    // v říji jeleni u stáda laní
    const all = [...stags, ...hinds];
    if (all.length > 0)
      groups.push({ species: 'deer', zone: 'verge', kind: 'cattle', animals: all });
  } else {
    if (hinds.length > 0) {
      const zone: WildZone = onField && !boarOnField ? 'field' : 'verge';
      groups.push({ species: 'deer', zone, kind: 'cattle', animals: hinds });
    }
    if (stags.length > 0)
      groups.push({ species: 'deer', zone: 'verge', kind: 'cattle', animals: stags });
  }
  // zajíci každý zvlášť
  for (let i = 0; i < s.hares; i++) {
    groups.push({
      species: 'hare',
      zone: 'meadow',
      kind: 'flock',
      animals: [{ model: 'wild-hare' }],
    });
  }
  if (s.foxes > 0) {
    groups.push({
      species: 'fox',
      zone: 'village',
      kind: 'flock',
      animals: [{ model: 'wild-fox' }],
    });
  }
  if (s.wolves > 0 && WOLF_MONTHS.includes(wild.month)) {
    groups.push({
      species: 'wolf',
      zone: 'edge',
      kind: 'flock',
      animals: repeat(s.wolves, { model: 'wild-wolf' }),
    });
  }
  if (s.bears > 0 && wild.month >= BEAR_MONTHS.from && wild.month <= BEAR_MONTHS.to) {
    groups.push({
      species: 'bear',
      zone: 'edge',
      kind: 'cattle',
      animals: [{ model: 'wild-bear' }],
    });
  }
  return groups;
}

/** Kruh, do kterého zvěř nechodí (obydlí, pozemek, díl pole, hřbitov, sad, ohrada). */
interface Blocker {
  x: number;
  z: number;
  r: number;
}

/** Dotaz „leží bod v nějaké stavbě nebo na poli“ přes přihrádky. */
function blockerLookup(blockers: readonly Blocker[]): (x: number, z: number) => boolean {
  const buckets = new Map<string, Blocker[]>();
  for (const b of blockers) {
    const i0 = Math.floor((b.x - b.r) / BUCKET_M);
    const i1 = Math.floor((b.x + b.r) / BUCKET_M);
    const j0 = Math.floor((b.z - b.r) / BUCKET_M);
    const j1 = Math.floor((b.z + b.r) / BUCKET_M);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${i},${j}`;
        const list = buckets.get(key);
        if (list) list.push(b);
        else buckets.set(key, [b]);
      }
    }
  }
  return (x, z) => {
    const list = buckets.get(`${Math.floor(x / BUCKET_M)},${Math.floor(z / BUCKET_M)}`);
    return list?.some((b) => Math.hypot(b.x - x, b.z - z) < b.r) ?? false;
  };
}

/** Čtverec (i natočený) jako kruh, který ho celý pokryje. */
const squareCircle = (s: { x: number; z: number; size: number }, pad = 0): Blocker => ({
  x: s.x,
  z: s.z,
  r: s.size * Math.SQRT1_2 + pad,
});

/** Překážky vsi pro zvěř; s `fields` false bez dílů polí (zvěř na poli se škodou). */
function villageBlockers(village: WildlifeVillage, fields: boolean): Blocker[] {
  const blockers: Blocker[] = [];
  for (const d of village.dwellings) {
    blockers.push({ x: d.position.x, z: d.position.z, r: DWELLING_CLEAR_M });
    if (d.plot) blockers.push(squareCircle(d.plot, 1));
  }
  for (const f of fields ? village.fields : []) {
    for (const p of f.parts) {
      if (p.look === 'stubble') continue;
      blockers.push(squareCircle(p));
    }
  }
  for (const c of village.cemeteries ?? [])
    for (const s of c.squares) blockers.push(squareCircle(s, 1));
  for (const o of village.orchards ?? [])
    for (const s of o.squares) blockers.push(squareCircle(s, 1));
  for (const pen of village.pens ?? []) {
    blockers.push(squareCircle(pen, 1));
    for (const e of pen.extraSquares ?? [])
      blockers.push(squareCircle({ ...e, size: pen.size }, 1));
  }
  return blockers;
}

/** Rozteč vzorků na úsečce mezi body trasy (m). */
const ROUTE_SAMPLE_M = 4;

/** Celá úsečka `a`–`b` je volná zem (vzorky po `ROUTE_SAMPLE_M`, i oba konce). */
export function segmentFree(
  test: (x: number, z: number) => boolean,
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / ROUTE_SAMPLE_M));
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    if (!test(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)) return false;
  }
  return true;
}

/** Okruh `radiusM` kolem bodu (osm směrů), kde se zvěř toulá, je volná zem. */
function ringFree(
  test: (x: number, z: number) => boolean,
  p: { x: number; z: number },
  radiusM: number,
): boolean {
  if (radiusM <= 0) return true;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (!test(p.x + radiusM * Math.cos(a), p.z + radiusM * Math.sin(a))) return false;
  }
  return true;
}

/** Skupiny zvěře vsi a volná zem, kam smí zvěř utéct (wildlife-motion.ts – útěk). */
export interface WildlifePlan {
  groups: WildGroup[];
  /** Schůdná zem mimo stavby a pole. */
  free(x: number, z: number): boolean;
}

/** Skupiny zvěře vsi (prázdné bez zvěře nebo bez hotového obydlí). Deterministické ze `seed`. */
export function planWildlife(
  village: WildlifeVillage,
  ground: LivestockGround,
  seed: number,
): WildlifePlan {
  const wild = village.wildlife;
  const built = village.dwellings.filter((d) => d.built);
  const none: WildlifePlan = { groups: [], free: () => false };
  if (!wild || built.length === 0) return none;
  const cx = built.reduce((sum, d) => sum + d.position.x, 0) / built.length;
  const cz = built.reduce((sum, d) => sum + d.position.z, 0) / built.length;
  const topPart =
    wild.topPartId === undefined
      ? undefined
      : village.fields.flatMap((f) => f.parts).find((p) => p.id === wild.topPartId);
  const wanted = wantedGroups(wild, topPart !== undefined);
  if (wanted.length === 0) return none;

  const blocked = blockerLookup(villageBlockers(village, true));
  const blockedOffFields = blockerLookup(villageBlockers(village, false));
  const nearestDwelling = (x: number, z: number): number =>
    village.dwellings.reduce(
      (best, d) => Math.min(best, Math.hypot(d.position.x - x, d.position.z - z)),
      Infinity,
    );
  /** Tady smí zvíře stát – schůdná zem (ne voda, skála, sráz) mimo stavby a pole. */
  const free = (x: number, z: number): boolean => ground.walkable(x, z) && !blocked(x, z);
  /** Na poli se škodou smí zvěř i na sousední díly (pole jsou otevřená). */
  const freeOnField = (x: number, z: number): boolean =>
    ground.walkable(x, z) && !blockedOffFields(x, z);
  // stanoviště po zónách (mřížka kolem středu vsi)
  const sites: Record<WildZone, { x: number; z: number }[]> = {
    edge: [],
    verge: [],
    meadow: [],
    village: [],
    field: [],
  };
  const n = Math.floor(SITE_REACH_M / SITE_STEP_M);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = cx + i * SITE_STEP_M;
      const z = cz + j * SITE_STEP_M;
      if (Math.hypot(x - cx, z - cz) > SITE_REACH_M || !free(x, z)) continue;
      const home = nearestDwelling(x, z);
      if (ground.forestEdge(x, z) && home >= EDGE_DWELLING_M) sites.edge.push({ x, z });
      if ((ground.verge ?? ground.pasture)(x, z) && home >= EDGE_DWELLING_M) {
        sites.verge.push({ x, z });
      }
      if (ground.pasture(x, z) && home >= MEADOW_DWELLING_M) sites.meadow.push({ x, z });
      if (home >= FOX_DWELLING_M.from && home <= FOX_DWELLING_M.to) sites.village.push({ x, z });
    }
  }
  // zajíci i na strništích
  for (const f of village.fields) {
    for (const p of f.parts) {
      if (p.look === 'stubble' && free(p.x, p.z)) sites.meadow.push({ x: p.x, z: p.z });
    }
  }
  if (topPart) {
    const q = topPart.size / 4;
    for (const [dx, dz] of [
      [0, 0],
      [-q, -q],
      [q, -q],
      [q, q],
      [-q, q],
    ] as const) {
      if (freeOnField(topPart.x + dx, topPart.z + dz)) {
        sites.field.push({ x: topPart.x + dx, z: topPart.z + dz });
      }
    }
  }

  const taken: { x: number; z: number }[] = [];
  const groups: WildGroup[] = [];
  wanted.forEach((w, g) => {
    const gseed = (seed * 31 + g * 977 + 13) | 0;
    const radiusM = w.animals.length > 1 ? 2.5 + w.animals.length * 0.55 : 0;
    const animals: HerdAnimal[] = [];
    const models: WildModel[] = [];
    w.animals.forEach((a, k) => {
      const angle = 2 * Math.PI * hash01(gseed, k, 601);
      const r = radiusM * Math.sqrt(hash01(gseed, k, 602));
      const scaleRange = WILD_SCALE[a.model];
      const base = scaleRange.from + (scaleRange.to - scaleRange.from) * hash01(gseed, k, 603);
      animals.push({
        species: a.young === 'calf' ? 'foal' : GAIT_OF[a.model],
        seed: (gseed * 7 + k * 131) | 0,
        scale: base * (a.young ? YOUNG_SCALE[a.young] : 1),
        homeX: r * Math.cos(angle),
        homeZ: r * Math.sin(angle),
      });
      models.push(a.model);
    });
    // stanoviště: celá skupina na volné zemi, dál od ostatních skupin; když se na díl se
    // škodou nevejde, zůstane na okraji lesa
    const wander = animals.length > 1 ? radiusM : SOLO_RADIUS_M;
    const fitsIn = (zone: WildZone, p: { x: number; z: number }): boolean => {
      const test = zone === 'field' ? freeOnField : free;
      return (
        animals.every((a) => test(p.x + a.homeX, p.z + a.homeZ)) &&
        ringFree(test, p, wander) &&
        taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) >= GROUP_GAP_M)
      );
    };
    const orderOf = (zone: WildZone): { p: { x: number; z: number }; key: number }[] =>
      sites[zone].map((p, i) => ({ p, key: hash01(gseed, i, 604) })).sort((a, b) => a.key - b.key);
    let zone = w.zone;
    let order = orderOf(zone);
    let start = order.find((o) => fitsIn(zone, o.p))?.p;
    if (!start && zone === 'field') {
      zone = w.species === 'deer' ? 'verge' : 'edge';
      order = orderOf(zone);
      start = order.find((o) => fitsIn(zone, o.p))?.p;
    }
    if (!start) return;
    const fits = (p: { x: number; z: number }): boolean => fitsIn(zone, p);
    const route = [start];
    while (route.length < ROUTE_SPOTS) {
      const last = route[route.length - 1]!;
      const next = order.find((o) => {
        const d = Math.hypot(o.p.x - last.x, o.p.z - last.z);
        return (
          d >= ROUTE_STEP_M.from &&
          d <= ROUTE_STEP_M.to &&
          !route.includes(o.p) &&
          fits(o.p) &&
          segmentFree(zone === 'field' ? freeOnField : free, last, o.p)
        );
      });
      if (!next) break;
      route.push(next.p);
    }
    taken.push(...route);
    groups.push({
      species: w.species,
      zone,
      herd: {
        kind: w.kind,
        tended: true,
        seed: gseed,
        phase: hash01(gseed, 0, 605),
        routeOffset: 0,
        route,
        radiusM: animals.length > 1 ? radiusM : SOLO_RADIUS_M,
        animals,
      },
      models,
      presence:
        w.species === 'wolf'
          ? PRESENCE.wolf
          : w.species === 'bear'
            ? PRESENCE.bear
            : w.species === 'fox'
              ? PRESENCE.fox
              : 1,
      fleeSpeed: FLEE_SPEED[w.species],
    });
  });
  return { groups, free };
}
