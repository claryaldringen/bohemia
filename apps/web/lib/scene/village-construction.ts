// Fáze stavby obydlí bez Babylonu: co staveniště ukáže při průběhu 0–1 – díly modelu
// z construction.glb (tools/blender/dwellings.py), hloubka jámy, obtisky a rekvizity.
// Souřadnice modelu jako `localToWorld` (x napříč, z k vchodu).
import { PIT_SHAPES } from './dwelling-pit';
import type { DwellingType } from './village-types';

export type ConstructionPhaseId =
  'layout' | 'turf' | 'dig' | 'posts' | 'logs' | 'frame' | 'wattle' | 'daub' | 'thatch' | 'finish';

export interface ConstructionPhase {
  id: ConstructionPhaseId;
  /** Popis pro vývojovou lištu (česky). */
  label: string;
  from: number;
  to: number;
}

/**
 * Fáze stavby (průběh 0–1, navazují na sebe): vytyčení, sejmutí drnu, kopání jámy, pak
 * zemnice sloupy a krov na zemi, polozemnice srub z trámů po řadách, latě a pletené štíty,
 * mazanice, došky po řadách zdola nahoru a nakonec hřeben s kozami a valy hlíny.
 */
export const CONSTRUCTION_PHASES: Record<DwellingType, readonly ConstructionPhase[]> = {
  zemnice: [
    { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.06 },
    { id: 'turf', label: 'sejmutí drnu', from: 0.06, to: 0.14 },
    { id: 'dig', label: 'kopání jámy', from: 0.14, to: 0.36 },
    { id: 'posts', label: 'zahloubené sloupy', from: 0.36, to: 0.44 },
    { id: 'frame', label: 'vaznice a krokve', from: 0.44, to: 0.54 },
    { id: 'wattle', label: 'latě a pletené štíty', from: 0.54, to: 0.64 },
    { id: 'daub', label: 'omazávání mazanicí', from: 0.64, to: 0.72 },
    { id: 'thatch', label: 'došky po řadách', from: 0.72, to: 0.94 },
    { id: 'finish', label: 'hřeben, kozy a valy', from: 0.94, to: 1 },
  ],
  polozemnice: [
    { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.05 },
    { id: 'turf', label: 'sejmutí drnu', from: 0.05, to: 0.12 },
    { id: 'dig', label: 'kopání jámy', from: 0.12, to: 0.26 },
    { id: 'logs', label: 'roubení stěn', from: 0.26, to: 0.44 },
    { id: 'frame', label: 'vaznice, sloupy a krokve', from: 0.44, to: 0.54 },
    { id: 'wattle', label: 'latě a pletené štíty', from: 0.54, to: 0.62 },
    { id: 'daub', label: 'omazávání mazanicí', from: 0.62, to: 0.72 },
    { id: 'thatch', label: 'došky po řadách', from: 0.72, to: 0.94 },
    { id: 'finish', label: 'hřeben, kozy a valy', from: 0.94, to: 1 },
  ],
};

/** Řad došků na model (podle atlasu – tools/blender/atlas.py). */
export const THATCH_COURSES: Record<DwellingType, number> = { zemnice: 8, polozemnice: 9 };
const RAFTER_PAIRS = 5;
const LOG_COURSES = 6;

export type SiteProp = 'spoil' | 'turf' | 'timber' | 'rods' | 'straw' | 'spade' | 'basket';
export const SITE_PROPS: readonly SiteProp[] = [
  'spoil',
  'turf',
  'timber',
  'rods',
  'straw',
  'spade',
  'basket',
];

/** Kde na staveništi leží rekvizity (souřadnice modelu, natočení vůči obydlí). */
export const SITE_PROP_PLACES: Record<
  DwellingType,
  Record<SiteProp, { x: number; z: number; rotation: number }>
> = {
  zemnice: {
    spoil: { x: -3.55, z: -0.4, rotation: Math.PI / 2 },
    turf: { x: 3.45, z: -2.7, rotation: 0.3 },
    timber: { x: 3.45, z: 0.5, rotation: 0.05 },
    rods: { x: -1.3, z: -3.45, rotation: 0.1 },
    straw: { x: 1.4, z: -3.55, rotation: Math.PI / 2 },
    spade: { x: -2.65, z: 1.0, rotation: 0.6 },
    basket: { x: -1.35, z: 3.6, rotation: 0 },
  },
  polozemnice: {
    spoil: { x: -3.85, z: -0.4, rotation: Math.PI / 2 },
    turf: { x: 3.75, z: -2.8, rotation: 0.3 },
    timber: { x: 3.75, z: 0.5, rotation: 0.05 },
    rods: { x: -1.3, z: -3.75, rotation: 0.1 },
    straw: { x: 1.4, z: -3.85, rotation: Math.PI / 2 },
    spade: { x: -2.95, z: 1.0, rotation: 0.6 },
    basket: { x: -1.45, z: 3.4, rotation: 0 },
  },
};

export interface ConstructionState {
  phase: ConstructionPhase;
  /** Díly z construction.glb, které stojí (bez předpony typu, např. 'rafters-2'). */
  parts: string[];
  /** Hloubka jámy (m); 0 = ještě se nekope a terén zůstává celý. */
  pitDepth: number;
  /** Jak moc jámu kryje střecha 0–1. */
  roofCover: number;
  /** Světlá čára vytyčení po obvodu 0–1. */
  outline: number;
  /** Sejmutý drn: podíl půdorysu od zadní stěny k šíji 0–1. */
  turf: number;
  /** Ušlapaná tráva kolem staveniště 0–1. */
  trampled: number;
  /** Rekvizity a jejich velikost (hromada roste s kopáním, hráň ubývá se stavbou…). */
  props: { prop: SiteProp; scale: number }[];
}

/** 0 před `from`, 1 po `to`, mezi tím lineárně. */
export function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

/** Fáze stavby podle průběhu (poslední fáze zahrnuje i 1). */
export function constructionPhase(type: DwellingType, progress: number): ConstructionPhase {
  const phases = CONSTRUCTION_PHASES[type];
  const p = Math.min(1, Math.max(0, progress));
  return phases.find((phase) => p < phase.to) ?? phases[phases.length - 1]!;
}

interface PartRule {
  part: string;
  from: number;
  /** Od kdy díl zmizí (výplet pod mazanicí, kolíky po zasazení sloupů). */
  to?: number;
}

/** Kdy se který díl objeví – postupně uvnitř své fáze. */
export function partSchedule(type: DwellingType): PartRule[] {
  const phase = (id: ConstructionPhaseId): ConstructionPhase =>
    CONSTRUCTION_PHASES[type].find((p) => p.id === id)!;
  const within = (id: ConstructionPhaseId, t: number): number => {
    const p = phase(id);
    return p.from + (p.to - p.from) * t;
  };
  const series = (
    name: string,
    count: number,
    id: ConstructionPhaseId,
    from: number,
    to: number,
    until?: number,
  ): PartRule[] =>
    Array.from({ length: count }, (_, k) => ({
      part: `${name}-${k + 1}`,
      from: within(id, from + ((to - from) * k) / Math.max(1, count - 1)),
      ...(until === undefined ? {} : { to: until }),
    }));
  const rules: PartRule[] = [];
  const daubFrom = within('daub', 0.25);
  if (type === 'zemnice') {
    rules.push({ part: 'stakes', from: 0, to: within('posts', 0.2) });
    rules.push({ part: 'posts', from: within('posts', 0.2) });
    rules.push({ part: 'ridge-beam', from: within('posts', 0.75) });
    rules.push(...series('rafters', RAFTER_PAIRS, 'frame', 0.1, 0.85));
  } else {
    rules.push({ part: 'stakes', from: 0, to: within('logs', 0.05) });
    rules.push(...series('logs', LOG_COURSES, 'logs', 0.05, 0.9, daubFrom));
    rules.push({ part: 'plates', from: within('frame', 0.05) });
    rules.push({ part: 'posts', from: within('frame', 0.25) });
    rules.push({ part: 'ridge-beam', from: within('frame', 0.4) });
    rules.push(...series('rafters', RAFTER_PAIRS, 'frame', 0.5, 0.95));
  }
  rules.push({ part: 'laths', from: within('wattle', 0.15) });
  rules.push({ part: 'wattle', from: within('wattle', 0.55), to: daubFrom });
  rules.push({ part: 'daub', from: daubFrom });
  rules.push(...series('thatch', THATCH_COURSES[type], 'thatch', 0.04, 0.92));
  rules.push({ part: 'ridge', from: within('finish', 0.1) });
  rules.push({ part: 'berms', from: within('finish', 0.45) });
  return rules;
}

/** Všechny díly staveniště daného typu (jména v construction.glb bez předpony). */
export function constructionParts(type: DwellingType): string[] {
  return partSchedule(type).map((rule) => rule.part);
}

/** Co staveniště ukáže při průběhu `progress` (0–1). */
export function constructionState(type: DwellingType, progress: number): ConstructionState {
  const p = Math.min(1, Math.max(0, progress));
  const phase = (id: ConstructionPhaseId): ConstructionPhase =>
    CONSTRUCTION_PHASES[type].find((x) => x.id === id) ?? CONSTRUCTION_PHASES[type][0]!;
  const parts = partSchedule(type)
    .filter((rule) => p >= rule.from && (rule.to === undefined || p < rule.to))
    .map((rule) => rule.part);
  const turf = phase('turf');
  const dig = phase('dig');
  const frame = phase('frame');
  const wattle = phase('wattle');
  const daub = phase('daub');
  const thatch = phase('thatch');
  const finish = phase('finish');
  // dřevo se začne brát se sloupy (zemnice), nebo s roubením (polozemnice)
  const timberUse = type === 'zemnice' ? phase('posts') : phase('logs');
  const props: { prop: SiteProp; scale: number }[] = [];
  const add = (prop: SiteProp, visible: boolean, scale: number): void => {
    if (visible && scale > 0) props.push({ prop, scale });
  };
  const used = 1 - 0.6 * ramp(p, finish.from, finish.to);
  add('spoil', p >= dig.from, (0.3 + 0.7 * ramp(p, dig.from, dig.to)) * used);
  add('turf', p >= turf.from, (0.4 + 0.6 * ramp(p, turf.from, turf.to)) * used);
  add('timber', p < frame.to, 1 - 0.65 * ramp(p, timberUse.from, frame.to));
  add('rods', p >= frame.from && p < wattle.to, 1 - 0.6 * ramp(p, wattle.from, wattle.to));
  add('straw', p >= daub.from && p < thatch.to, 1 - 0.7 * ramp(p, thatch.from, thatch.to));
  add('spade', p >= turf.from, 1);
  add('basket', p >= dig.from, 1);
  return {
    phase: constructionPhase(type, p),
    parts,
    pitDepth: PIT_SHAPES[type].depth * ramp(p, dig.from, dig.to),
    roofCover: ramp(p, thatch.from, thatch.to),
    outline: 1 - ramp(p, dig.from, dig.from + 0.04),
    turf: ramp(p, turf.from, turf.to),
    trampled: 0.85 * ramp(p, 0.01, dig.from + 0.04),
    props,
  };
}
