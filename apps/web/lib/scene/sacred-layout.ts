// Posvátná místa ve scéně bez Babylonu (happiness.md – Co hráč vidí): fáze staveniště modly
// a svatyně (díly z {idol,shrine}-construction.glb – tools/blender/sacred.py), ohniště svatyně
// pro dým, kameny na okraji dubového háje a natočení obětin u posvátného dubu. Souřadnice
// modelu jako u obydlí (`localToWorld`: x napříč, z k předku – modla a obětiny se dívají do +z).
import { SACRED_BUILDINGS, type Position, type SacredBuildingKind } from '@bohemia/game';
import type { SceneSacred } from '../village-view';
import { cellsBoundary, cellsContain, type CellSquare } from './field-cells';
import { hash01 } from './smoke-schedule';
import { footprintCorners, localToWorld, type Point } from './village-layout';

/** Druh staveniště v construction.glb – předpona dílů („modla-…“, „svatyne-…“). */
export type SacredSiteKind = 'modla' | 'svatyne';

export const SACRED_SITE_KIND: Record<SacredBuildingKind, SacredSiteKind> = {
  idol: 'modla',
  shrine: 'svatyne',
};

/** Modely posvátných míst (`public/models/sacred/`). */
export const SACRED_MODEL_BASE_URL = '/models/sacred/';
export const SACRED_MODELS = {
  idol: 'idol.glb',
  shrine: 'shrine.glb',
  idolConstruction: 'idol-construction.glb',
  shrineConstruction: 'shrine-construction.glb',
  oakOfferings: 'oak-offerings.glb',
  groveStones: 'grove-stones.glb',
} as const;

export type SacredPhaseId =
  | 'layout'
  | 'ground'
  | 'log'
  | 'raise'
  | 'hewn'
  | 'carved'
  | 'dig'
  | 'platform'
  | 'tamp'
  | 'fires'
  | 'carve'
  | 'finish';

export interface SacredPhase {
  id: SacredPhaseId;
  /** Popis pro vývojovou lištu (česky). */
  label: string;
  from: number;
  to: number;
}

/**
 * Fáze stavby modly a svatyně (průběh 0–1 bez kácení dubů, navazují na sebe). Vytyčení
 * (kolíky a provázek) je vidět od chvíle, kdy hráč stavbu zadá – i při průběhu 0, než na ni
 * dojde práce (Martin: „ať se hned vytyčí provázkem a kolíky“).
 * Modla: vytyčení kruhu → udusaný kruh → kmen na podložkách → vztyčení (vzpěry, klínové kameny)
 * → osekání do čtyřhranu → tváře nahrubo → řezba, stužka a obětiny.
 * Svatyně: vytyčení (střed, provaz, kolíky kruhu a okvětí) → příkop výběžek po výběžku → navážka
 * plochy → udusaná plocha → ohniště → vztyčení modly → osekání a řezba → dlažba a obětiny.
 */
export const SACRED_PHASES: Record<SacredSiteKind, readonly SacredPhase[]> = {
  modla: [
    { id: 'layout', label: 'vytyčení kruhu – kolíky a provázek', from: 0, to: 0.08 },
    { id: 'ground', label: 'udusaný kruh', from: 0.08, to: 0.2 },
    { id: 'log', label: 'dubový kmen na podložkách', from: 0.2, to: 0.32 },
    { id: 'raise', label: 'vztyčení kůlu – vzpěry a klínové kameny', from: 0.32, to: 0.48 },
    { id: 'hewn', label: 'osekání do čtyřhranu', from: 0.48, to: 0.66 },
    { id: 'carved', label: 'tváře nahrubo', from: 0.66, to: 0.86 },
    { id: 'finish', label: 'řezba, stužka a obětiny', from: 0.86, to: 1 },
  ],
  svatyne: [
    { id: 'layout', label: 'vytyčení – střed, provaz, kolíky kruhu a okvětí', from: 0, to: 0.05 },
    { id: 'dig', label: 'příkop výběžek po výběžku s valem', from: 0.05, to: 0.45 },
    { id: 'platform', label: 'navážka vyvýšené plochy', from: 0.45, to: 0.58 },
    { id: 'tamp', label: 'udusaná plocha', from: 0.58, to: 0.66 },
    { id: 'fires', label: 'ohniště ve výběžcích', from: 0.66, to: 0.76 },
    { id: 'raise', label: 'dubový kmen a vztyčení modly', from: 0.76, to: 0.86 },
    { id: 'carve', label: 'osekání a řezba modly', from: 0.86, to: 0.95 },
    { id: 'finish', label: 'kamenná dlažba, stužka a obětiny', from: 0.95, to: 1 },
  ],
};

/** Výběžků příkopu a ohnišť svatyně (sacred.py – N_PETALS). */
export const SHRINE_PETALS = 8;
/** Poloměr ohnišť – uprostřed výběžku příkopu (sacred.py – R_FIRE = (R_IN + R_TIP) / 2). */
export const SHRINE_FIRE_RADIUS_M = 12.5;
/** Vnitřní okraj příkopu, hroty a vrcholy okvětí (sacred.py – R_IN, R_CUSP, R_TIP). */
export const SHRINE_RING_M = { inner: 11.1, cusp: 12.1, tip: 13.9 } as const;
/** Udusaný kruh modly (sacred.py – kruh Ø ≈ 4 m). */
export const IDOL_RING_M = 2;
/** Dým z ohniště stoupá kousek nad dnem příkopu (m). */
export const SHRINE_SMOKE_LIFT_M = 0.35;

interface PartRule {
  part: string;
  from: number;
  /** Od kdy díl zmizí (kolíky po vytyčení, kmen po vztyčení…). */
  to?: number;
}

function phaseOf(kind: SacredSiteKind, id: SacredPhaseId): SacredPhase {
  return SACRED_PHASES[kind].find((p) => p.id === id) ?? SACRED_PHASES[kind][0]!;
}

/** Fáze stavby podle průběhu (poslední fáze zahrnuje i 1). */
export function sacredPhase(kind: SacredSiteKind, progress: number): SacredPhase {
  const phases = SACRED_PHASES[kind];
  const p = Math.min(1, Math.max(0, progress));
  return phases.find((phase) => p < phase.to) ?? phases[phases.length - 1]!;
}

/** Kdy se který díl staveniště objeví a zmizí (jména dílů bez předpony druhu). */
export function sacredPartSchedule(kind: SacredSiteKind): PartRule[] {
  const within = (id: SacredPhaseId, t: number): number => {
    const p = phaseOf(kind, id);
    return p.from + (p.to - p.from) * t;
  };
  const series = (name: string, count: number, id: SacredPhaseId): PartRule[] =>
    Array.from({ length: count }, (_, k) => ({
      part: `${name}-${k + 1}`,
      from: within(id, 0.05 + (0.85 * k) / Math.max(1, count - 1)),
    }));
  if (kind === 'modla') {
    return [
      // kolíky a provázek stojí od zadání stavby (průběh 0) do konce dusání kruhu
      { part: 'stakes', from: 0, to: phaseOf(kind, 'ground').to },
      { part: 'ground', from: within('ground', 0.3) },
      { part: 'log', from: within('log', 0.1), to: within('raise', 0.3) },
      { part: 'struts', from: within('raise', 0.2), to: phaseOf(kind, 'hewn').from },
      { part: 'post', from: within('raise', 0.3), to: within('hewn', 0.4) },
      { part: 'stones', from: within('raise', 0.7) },
      { part: 'hewn', from: within('hewn', 0.4), to: within('carved', 0.4) },
      { part: 'chips', from: within('hewn', 0.2), to: within('finish', 0.6) },
      { part: 'carved', from: within('carved', 0.4), to: within('finish', 0.3) },
      { part: 'idol', from: within('finish', 0.3) },
      { part: 'ribbon', from: within('finish', 0.6) },
      { part: 'offerings', from: within('finish', 0.8) },
    ];
  }
  return [
    // vytyčení kruhu a okvětí stojí od zadání stavby, dokud se kope příkop
    { part: 'stakes', from: 0, to: phaseOf(kind, 'platform').from },
    ...series('ditch', SHRINE_PETALS, 'dig'),
    { part: 'platform-1', from: within('platform', 0.2), to: within('tamp', 0.5) },
    { part: 'platform-2', from: within('tamp', 0.5) },
    ...series('fire', SHRINE_PETALS, 'fires'),
    { part: 'log', from: within('raise', 0.05), to: within('raise', 0.45) },
    { part: 'struts', from: within('raise', 0.4), to: phaseOf(kind, 'carve').from },
    { part: 'post', from: within('raise', 0.45), to: within('carve', 0.25) },
    { part: 'stones', from: within('raise', 0.8) },
    { part: 'hewn', from: within('carve', 0.25), to: within('carve', 0.55) },
    { part: 'carved', from: within('carve', 0.55), to: within('carve', 0.9) },
    { part: 'idol', from: within('carve', 0.9) },
    { part: 'chips', from: within('carve', 0.1), to: within('finish', 0.4) },
    { part: 'paving', from: within('finish', 0.2) },
    { part: 'ribbon', from: within('finish', 0.5) },
    { part: 'offerings', from: within('finish', 0.75) },
  ];
}

/** Všechny díly staveniště daného druhu (jména uzlů v GLB bez předpony). */
export function sacredConstructionParts(kind: SacredSiteKind): string[] {
  return sacredPartSchedule(kind).map((rule) => rule.part);
}

/** Díly, které staveniště ukáže při průběhu `progress` (0–1). */
export function sacredSiteParts(kind: SacredSiteKind, progress: number): string[] {
  const p = Math.min(1, Math.max(0, progress));
  return sacredPartSchedule(kind)
    .filter((rule) => p >= rule.from && (rule.to === undefined || p < rule.to))
    .map((rule) => rule.part);
}

/**
 * Ohniště svatyně v souřadnicích modelu (x napříč, z k předku): uprostřed výběžků příkopu pod
 * úhlem 22,5° + k · 45° od předku (sacred.py – fire-1…fire-8). Rozložení je souměrné, na
 * zrcadlení osy x z Blenderu nezáleží.
 */
export function shrineFireSpots(): Point[] {
  return Array.from({ length: SHRINE_PETALS }, (_, k): Point => {
    const a = Math.PI / SHRINE_PETALS + (k * 2 * Math.PI) / SHRINE_PETALS;
    return [-SHRINE_FIRE_RADIUS_M * Math.sin(a), SHRINE_FIRE_RADIUS_M * Math.cos(a)];
  });
}

/** Ohniště svatyně ve světě. */
export function shrineFiresWorld(position: Position): Point[] {
  return shrineFireSpots().map(([x, z]) => localToWorld(position, x, z));
}

/**
 * Vytyčení v souřadnicích modelu – kolíky a provázek mezi nimi (náhrada dílu `stakes`, když se
 * model nenačte): modla kruh, svatyně vnitřní kruh příkopu a okvětí (hroty a vrcholy výběžků).
 */
export function sacredStakeLines(kind: SacredBuildingKind): Point[][] {
  const ring = (radius: number, count: number): Point[] => {
    const points = Array.from({ length: count }, (_, k): Point => {
      const a = (k * 2 * Math.PI) / count;
      return [radius * Math.sin(a), radius * Math.cos(a)];
    });
    return [...points, points[0]!];
  };
  if (kind === 'idol') return [ring(IDOL_RING_M, 8)];
  const lines: Point[][] = [ring(SHRINE_RING_M.inner, 16)];
  const petal: Point[] = [];
  for (let k = 0; k <= SHRINE_PETALS * 2; k++) {
    const a = (k * Math.PI) / SHRINE_PETALS;
    const r = k % 2 === 0 ? SHRINE_RING_M.cusp : SHRINE_RING_M.tip;
    petal.push([r * Math.sin(a), r * Math.cos(a)]);
  }
  lines.push(petal);
  return lines;
}

/** Natočení obětin u posvátného dubu – deterministicky podle id stromu (stužky různě). */
export function oakOfferingRotation(id: number): number {
  return hash01(id, 7, 31) * Math.PI * 2;
}

/** Kámen na okraji háje (uzel grove-stones.glb) – pata ve světě, natočení a velikost. */
export interface GroveStone {
  model: 'stone-a' | 'stone-b' | 'altar';
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Rozteč hraničních kamenů po okraji háje a jak hluboko pod okrajem stojí (m). */
const GROVE_STONE_STEP_M = 7.5;
const GROVE_STONE_INSET_M = 0.7;
const ALTAR_INSET_M = 2.2;

/**
 * Kamenný kruh na okraji háje: hraniční kameny (vysoké a nízké) po obvodu čtverců háje
 * kousek uvnitř, a oltář na okraji nejblíž ke vsi (`toward`, bez vsi k jihu – ke kameře)
 * čelem ven. Deterministicky podle id háje; `accept` vynechá místa (voda).
 */
export function groveStones(
  grove: { id: number; x: number; z: number; squares: readonly CellSquare[] },
  toward: { x: number; z: number } | null,
  accept: (x: number, z: number) => boolean = () => true,
): GroveStone[] {
  if (grove.squares.length === 0) return [];
  const inside = cellsContain(grove.squares);
  const stones: GroveStone[] = [];
  let k = 0;
  let altar: { x: number; z: number; nx: number; nz: number; d: number } | null = null;
  const target = toward ?? { x: grove.x, z: grove.z - 1000 };
  for (const [a, b] of cellsBoundary(grove.squares) as [Point, Point][]) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length <= 0) continue;
    const ux = dx / length;
    const uz = dz / length;
    // normála dovnitř háje (zkouška bodu kousek vedle středu úsečky)
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const flip = inside(mx - uz * 0.5, mz + ux * 0.5) ? 1 : -1;
    const nx = -uz * flip;
    const nz = ux * flip;
    const count = Math.max(1, Math.round(length / GROVE_STONE_STEP_M));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + (hash01(grove.id, k, 1) - 0.5) * 0.4) / count;
      const inset = GROVE_STONE_INSET_M + hash01(grove.id, k, 2) * 0.5;
      const x = a[0] + dx * t + nx * inset;
      const z = a[1] + dz * t + nz * inset;
      const tall = hash01(grove.id, k, 3) < 0.65;
      k++;
      if (!accept(x, z)) continue;
      stones.push({
        model: tall ? 'stone-a' : 'stone-b',
        x,
        z,
        rotationY: hash01(grove.id, k, 4) * Math.PI * 2,
        scale: 0.85 + hash01(grove.id, k, 5) * 0.35,
      });
    }
    // oltář: střed úsečky nejblíž ke vsi
    const d = Math.hypot(mx - target.x, mz - target.z);
    if (!altar || d < altar.d) altar = { x: mx, z: mz, nx, nz, d };
  }
  if (altar) {
    const x = altar.x + altar.nx * ALTAR_INSET_M;
    const z = altar.z + altar.nz * ALTAR_INSET_M;
    if (accept(x, z)) {
      // předek oltáře (+z modelu) ven z háje – ke vsi
      const rotationY = Math.atan2(-altar.nx, -altar.nz);
      // hraniční kámen hned vedle oltáře by s ním splýval – vynechat
      const kept = stones.filter((s) => Math.hypot(s.x - x, s.z - z) > 2.5);
      stones.length = 0;
      stones.push(...kept, { model: 'altar', x, z, rotationY, scale: 1 });
    }
  }
  return stones;
}

/** Půdorys modly nebo svatyně ve světě (rohy). */
export function sacredFootprintCorners(kind: SacredBuildingKind, position: Position): Point[] {
  const size = SACRED_BUILDINGS[kind].footprintM;
  return footprintCorners(position, size, size);
}

/** Co z posvátné stavby rozhoduje o vzhledu – průběh po 2 % jako u obydlí. */
export function sacredBuildingKey(b: SceneSacred['buildings'][number]): string {
  const p = b.position;
  return [b.kind, p.x, p.z, p.rotation, b.built, b.built ? '' : Math.round(b.progress * 50)].join(
    '|',
  );
}
