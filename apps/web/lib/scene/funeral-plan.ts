// Pohřeb ve scéně bez Babylonu (docs/design/cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026:
// „Když je pohřeb, chtěl bych vidět průvod lidí na hřbitov a pak na hřbitově hranici.“). Jen
// zobrazení: z pohřbu ve vsi (`SceneFuneral` – funeral-view.ts) průvod od vchodu domu zemřelého
// po pěšinách k brance hřbitova a k hranici na místě mohyly – vpředu čtyři muži s márami, za
// nimi domácnost a lidé z ostatních domácností –, pak hranice hoří, lidé stojí v kruhu, druhý
// den uhlíky dohasínají, lidé odejdou domů a nasype se mohyla. Všechno je čistá funkce času
// (skutečný čas jako u ostatních postav – stejný okamžik = stejná póza): začátek je začátek
// herního dne pohřbu (okno dne z hodin světa), průvod jde skutečnou chůzí.
import { cemeteryEntrance, type Entrance } from '@bohemia/game';
import { FUNERAL_BEARERS, funeralKey, type SceneFuneral, type SceneMourner } from '../funeral-view';
import type { SceneVillage } from '../village-view';
import { MOUND_SHAPES, gravePlacements, moundPlacements } from './cemetery-layout';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import {
  alongRoute,
  route as makeRoute,
  walkSpeed,
  type PoseFn,
  type Route,
  type VillagerKind,
  type VillagerPose,
} from './villager-motion';

/** Bod ve světě scény (m). */
export interface Point {
  x: number;
  z: number;
}

/** Okno herního dne (skutečný čas, ms). */
export interface DayWindow {
  startMs: number;
  endMs: number;
}

/**
 * Časy obřadu (skutečný čas, ms – návrh Clauda, cemetery.md – Pohřeb ve scéně): průvod se schází
 * před domem od začátku dne pohřbu (GATHER_S), jde po trase tempem `pace` (pomalu 0,6 m/s;
 * u vzdáleného hřbitova rychleji, ať dojde nejvýš za ≈ 3 minuty – WALK_MAX_S), máry se položí na
 * hranici (LAY_S) a zapálí se; hoří do konce dne pohřbu, nejméně MIN_BURN_S; pak herní den
 * (nejméně MIN_SMOULDER_S) uhlíky dohasínají – lidé odejdou domů – a nasype se mohyla.
 */
export const FUNERAL_TIMING = {
  gatherS: 8,
  pace: { slow: 0.6, fast: 1.1 },
  walkMaxS: 180,
  layS: 8,
  minBurnS: 45,
  minSmoulderS: 40,
  /** Lidé odcházejí od hranice chvíli po dohoření, po jednom (s). */
  leaveS: 4,
  leaveStepS: 0.7,
  /** Kdo došel ke kruhu dřív, jde na své místo po příchodu průvodu (s, po řadách). */
  ringStartS: 1,
  ringStepS: 0.35,
} as const;

/**
 * Hranice a máry (m – musí sedět s tools/blender/funeral.py): hranice z polen do kříže
 * 2 × 1,2 m, výška 1 m; máry – dvě tyče PIER.lengthM s příčkami a zemřelým v plátně, nesou je
 * čtyři muži na ramenou (výška tyčí nad zemí `carryM` – rameno postavy zvětšené FIGURE_SCALE).
 */
export const PYRE = { lengthM: 2, widthM: 1.2, heightM: 1 } as const;
export const BIER = { lengthM: 2.6, poleSpanM: 0.8, carryM: 1.62 } as const;

/** Nosiči u konců tyčí: podél (m, + vpřed) a napříč (m, + vlevo) od středu már. */
const BEARER_SPOTS: readonly { along: number; side: number }[] = [
  { along: 1.05, side: 0.62 },
  { along: 1.05, side: -0.62 },
  { along: -1.05, side: 0.62 },
  { along: -1.05, side: -0.62 },
];
/** Průvod za márami: první řada za zadními nosiči, řady po dvou, rozestup řad (m). */
const COLUMN = { firstM: 2.55, rowM: 1.15, sideM: 0.5 } as const;
/** Máry se zastaví, když přední nosiči stojí kus před hranicí (m od konce trasy = střed). */
const STOP_M = PYRE.lengthM / 2 + 1.05 + 0.6;
/** Čelo průvodu vyjde kus od domu – kdo se na trasu nevejde, čeká u vchodu (m). */
const HEAD_START_M = 4;
/** Kruh kolem hranice: poloměry řad (m) a nejmenší rozestup lidí (m). */
const RING_RADII_M = [3.2, 4.5, 5.8, 7.1] as const;
const RING_SPACING_M = 1.15;
/** Obchůzka hranice – trasa nesmí vést blíž středu (m). */
const PYRE_CLEAR_M = 2.2;
/** Branka: kolik metrů před ní a za ní je bod trasy (ať se prochází kolmo plotem). */
const GATE_OUT_M = 2;
const GATE_IN_M = 1.5;

/** Časy obřadu (ms). */
export interface FuneralTimeline {
  /** Začátek dne pohřbu – průvod se schází před domem. */
  startMs: number;
  departMs: number;
  /** Máry u hranice (čelo průvodu se zastaví). */
  arriveMs: number;
  /** Zemřelý leží na hranici – zapálí se. */
  litMs: number;
  /** Dohořelo – uhlíky. */
  outMs: number;
  /** Vychladlo – nasype se mohyla. */
  coldMs: number;
  /** Tempo průvodu (m/s). */
  pace: number;
}

/** Člověk v průvodu: nosič, nebo člověk za márami (pohlaví, věk, kam se vrátí). */
export interface FuneralMember {
  key: string;
  bearer: boolean;
  sex: SceneMourner['sex'];
  child: boolean;
  elder: boolean;
  /** O kolik metrů jde za středem már (nosiči vpředu záporně) a napříč (m, + vlevo). */
  behind: number;
  side: number;
  /** Kde čeká u vchodu, než na něj v průvodu přijde řada. */
  wait: Point;
  /** Místo v kruhu kolem hranice. */
  ring: Point;
  /** Cesta od místa u průvodu (po příchodu) ke kruhu – kolem hranice. */
  toRing: Route;
  /** Cesta od kruhu domů (branka, pěšiny) – na konci zmizí. */
  home: Route;
  /** Kdy jde ke kruhu a kdy domů (ms). */
  ringMs: number;
  leaveMs: number;
}

/** Plán pohřbu ve scéně – trasa, časy, lidé a hranice. */
export interface FuneralPlan {
  key: string;
  funeral: SceneFuneral;
  /** Trasa průvodu: vchod domu → pěšiny → branka → střed hranice. */
  path: Route;
  /** Kde se máry zastaví (vzdálenost po trase) a kde čelo vyjde. */
  stopS: number;
  headS: number;
  timeline: FuneralTimeline;
  members: FuneralMember[];
  /** Hranice: střed na místě mohyly a natočení podél posledního úseku trasy. */
  pyre: { x: number; z: number; headingX: number; headingZ: number };
  /** Obdélník trasy, kruhu a cest domů – obal pro ořez záběrem. */
  extent: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Do kdy jsou lidé pohřbu vidět (ms) – poslední doma. */
  figuresUntilMs: number;
}

/** Co plán pohřbu potřebuje od scény (villager-plan.ts – vchody, pěšiny, schůdná zem). */
export interface FuneralEnv {
  /** Okno herního dne; bez hodin null – pohřeb se nekreslí. */
  dayWindow(day: number): DayWindow | null;
  /** Kde se vychází z obydlí `id` (před vchodem, volné místo), nebo null (obydlí ve scéně není). */
  door(id: number): Point | null;
  /** Trasa po pěšinách a cestách z `a` do `b` (body [x, z]), nebo null – jde se rovně. */
  route(a: Point, b: Point): readonly (readonly [number, number])[] | null;
  /** Smí tu stát člověk – schůdná zem mimo domy a pozemky. */
  standable(x: number, z: number): boolean;
  /** Stylizované zvětšení postav (FIGURE_SCALE) – rozestupy průvodu a kruhu. */
  figureScale: number;
}

function smooth(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

function unit(x: number, z: number): Point {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 1 };
}

/** Deterministická náhoda 0–1 z textu a čísla. */
function hashText(text: string, k: number): number {
  let h = 2166136261 ^ Math.imul(k | 0, 0x9e3779b1);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Tempo průvodu (m/s): pomalu (0,6 m/s), u vzdáleného hřbitova rychleji, ať dojde nejvýš za
 * WALK_MAX_S – nejvýš běžnou chůzí (1,1 m/s).
 */
export function processionPace(lengthM: number): number {
  const { slow, fast } = FUNERAL_TIMING.pace;
  return Math.min(fast, Math.max(slow, lengthM / FUNERAL_TIMING.walkMaxS));
}

/**
 * Časy obřadu z okna dne pohřbu a délky chůze průvodu (m od výchozího místa čela k zastavení):
 * schází se od začátku dne, jde tempem `processionPace`, hoří do konce dne (nejméně
 * MIN_BURN_S), doutná délku herního dne (nejméně MIN_SMOULDER_S).
 */
export function funeralTimeline(window: DayWindow, walkM: number): FuneralTimeline {
  const t = FUNERAL_TIMING;
  const pace = processionPace(walkM);
  const startMs = window.startMs;
  const departMs = startMs + t.gatherS * 1000;
  const arriveMs = departMs + (Math.max(0, walkM) / pace) * 1000;
  const litMs = arriveMs + t.layS * 1000;
  const outMs = Math.max(window.endMs, litMs + t.minBurnS * 1000);
  const dayMs = Math.max(1, window.endMs - window.startMs);
  const coldMs = outMs + Math.max(dayMs, t.minSmoulderS * 1000);
  return { startMs, departMs, arriveMs, litMs, outMs, coldMs, pace };
}

export type FuneralPhase =
  'before' | 'gathering' | 'procession' | 'laying' | 'burning' | 'smouldering' | 'done';

/** Co se právě děje (ve skutečný okamžik `nowMs`). */
export function funeralPhase(t: FuneralTimeline, nowMs: number): FuneralPhase {
  if (nowMs < t.startMs) return 'before';
  if (nowMs < t.departMs) return 'gathering';
  if (nowMs < t.arriveMs) return 'procession';
  if (nowMs < t.litMs) return 'laying';
  if (nowMs < t.outMs) return 'burning';
  if (nowMs < t.coldMs) return 'smouldering';
  return 'done';
}

/**
 * Mohyla pohřbu se do vychladnutí uhlíků nekreslí (cemetery.md – Pohřeb ve scéně): nasype se až
 * po dohoření. Bez plánu (bez hodin světa) se kreslí hned.
 */
export function moundHidden(plan: FuneralPlan | null, nowMs: number): boolean {
  return plan !== null && nowMs < plan.timeline.coldMs;
}

/**
 * Stav hranice (cemetery.md – Pohřeb ve scéně): `stack` výška polen 0–1 (hoří a sesedá), `bier`
 * máry se zemřelým na hranici (0–1 – propadají se do ohně a shoří), `fire` síla plamenů,
 * `remains` ohořelé zbytky (0–1 – objeví se, jak hranice dohořívá), `glow` žhavé uhlíky, `ash`
 * zšednutí popela a `smoke` dým. Před zapálením stojí hranice připravená, po vychladnutí nic.
 */
export interface PyreState {
  stack: number;
  bier: number;
  fire: number;
  remains: number;
  glow: number;
  ash: number;
  smoke: number;
}

/** Rozhořívání a dohořívání (podíl doby hoření). */
const BURN = { rise: 0.08, collapseFrom: 0.15, bierUntil: 0.6, remainsFrom: 0.45, fadeFrom: 0.7 };
/** Uhlíky: žhnou první podíl doutnání, zšednou celé; slabé plameny na začátku. */
const SMOULDER = { glowUntil: 0.6, flickerUntil: 0.25 };

export function pyreState(t: FuneralTimeline, nowMs: number): PyreState {
  const none = { stack: 0, bier: 0, fire: 0, remains: 0, glow: 0, ash: 0, smoke: 0 };
  if (nowMs >= t.coldMs) return none;
  if (nowMs < t.litMs) return { ...none, stack: 1 };
  if (nowMs < t.outMs) {
    const u = (nowMs - t.litMs) / Math.max(1, t.outMs - t.litMs);
    const fire =
      smooth(u / BURN.rise) * (1 - 0.7 * smooth((u - BURN.fadeFrom) / (1 - BURN.fadeFrom)));
    return {
      stack: 1 - 0.6 * smooth((u - BURN.collapseFrom) / (1 - BURN.collapseFrom)),
      bier: 1 - smooth(u / BURN.bierUntil),
      fire,
      remains: smooth((u - BURN.remainsFrom) / (1 - BURN.remainsFrom)),
      glow: smooth((u - BURN.remainsFrom) / (1 - BURN.remainsFrom)),
      ash: 0,
      smoke: 0.35 + 0.65 * fire,
    };
  }
  const v = (nowMs - t.outMs) / Math.max(1, t.coldMs - t.outMs);
  return {
    stack: 0,
    bier: 0,
    fire: 0.3 * (1 - smooth(v / SMOULDER.flickerUntil)),
    remains: 1,
    glow: 1 - smooth(v / SMOULDER.glowUntil),
    ash: smooth(v),
    smoke: 0.4 * (1 - smooth(v)),
  };
}

/**
 * Máry v okamžiku `nowMs`: střed tyčí (x, z), výška nad terénem pod nimi (m) a směr vpřed; mimo
 * průvod a pokládání (a po shoření) skryté. Nesou je nosiči na ramenou, při pokládání se zvednou
 * na hranici a s ní se propadají do ohně.
 */
export interface BierPose {
  visible: boolean;
  x: number;
  z: number;
  /** Výška tyčí nad terénem (m). */
  lift: number;
  /** Na hranici: výška nad terénem pod středem hranice (ne pod márami). */
  onPyre: boolean;
  headingX: number;
  headingZ: number;
}

export function createBierPose(): BierPose {
  return { visible: false, x: 0, z: 0, lift: 0, onPyre: false, headingX: 0, headingZ: 1 };
}

/** Kde je čelo průvodu (střed már) – vzdálenost po trase v okamžiku `nowMs`. */
function headAt(plan: FuneralPlan, nowMs: number): number {
  const t = plan.timeline;
  if (nowMs <= t.departMs) return plan.headS;
  return Math.min(plan.stopS, plan.headS + ((nowMs - t.departMs) / 1000) * t.pace);
}

export function bierPose(plan: FuneralPlan, nowMs: number, out: BierPose): BierPose {
  const t = plan.timeline;
  const tmp = TMP_POSE;
  out.visible = false;
  if (nowMs < t.startMs || nowMs >= t.outMs) return out;
  if (nowMs < t.arriveMs) {
    alongRoute(plan.path, headAt(plan, nowMs), false, tmp);
    out.visible = true;
    out.x = tmp.x;
    out.z = tmp.z;
    out.lift = BIER.carryM;
    out.onPyre = false;
    out.headingX = tmp.headingX;
    out.headingZ = tmp.headingZ;
    return out;
  }
  if (nowMs < t.litMs) {
    // nosiči zvednou máry z ramen na hranici (oblouk nahoru a dolů)
    const u = smooth((nowMs - t.arriveMs) / Math.max(1, t.litMs - t.arriveMs));
    alongRoute(plan.path, plan.stopS, false, tmp);
    out.visible = true;
    out.x = tmp.x + (plan.pyre.x - tmp.x) * u;
    out.z = tmp.z + (plan.pyre.z - tmp.z) * u;
    out.lift = BIER.carryM + (PYRE.heightM - BIER.carryM) * u + 0.35 * Math.sin(Math.PI * u);
    out.onPyre = u >= 1;
    out.headingX = plan.pyre.headingX;
    out.headingZ = plan.pyre.headingZ;
    return out;
  }
  const state = pyreState(t, nowMs);
  if (state.bier <= 0) return out;
  out.visible = true;
  out.x = plan.pyre.x;
  out.z = plan.pyre.z;
  out.onPyre = true;
  // propadá se s hranicí a do ohně
  out.lift = PYRE.heightM * state.stack - 0.35 * (1 - state.bier);
  out.headingX = plan.pyre.headingX;
  out.headingZ = plan.pyre.headingZ;
  return out;
}

const TMP_POSE: VillagerPose = { x: 0, z: 0, headingX: 0, headingZ: 1, clip: 'idle', pace: 1 };

/** Bod v osách már / hranice: `along` vpřed, `side` vlevo. */
function frameAt(p: Point, hx: number, hz: number, along: number, side: number): Point {
  // vlevo od směru (hx, hz) je (−hz, hx)
  return { x: p.x + hx * along - hz * side, z: p.z + hz * along + hx * side };
}

/** Vložená zastávka, ať úsečka a–b obejde hranici (nevede blíž než PYRE_CLEAR_M středu). */
function aroundPyre(a: Point, b: Point, c: Point): Point[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const u =
    len2 > 1e-9 ? Math.min(1, Math.max(0, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2)) : 0;
  const px = a.x + dx * u;
  const pz = a.z + dz * u;
  if (Math.hypot(px - c.x, pz - c.z) >= PYRE_CLEAR_M) return [a, b];
  let n = unit(px - c.x, pz - c.z);
  if (Math.hypot(px - c.x, pz - c.z) < 1e-3) n = unit(-dz, dx);
  const r = PYRE_CLEAR_M + 0.9;
  return [a, { x: c.x + n.x * r, z: c.z + n.z * r }, b];
}

function routeOf(points: readonly Point[]): Route {
  const clean: [number, number][] = [];
  for (const p of points) {
    const last = clean[clean.length - 1];
    if (last && Math.hypot(last[0] - p.x, last[1] - p.z) < 1e-3) continue;
    clean.push([p.x, p.z]);
  }
  if (clean.length === 1) clean.push([clean[0]![0], clean[0]![1]]);
  return makeRoute(clean);
}

/** Mohyly hřbitova – překážky v kruhu kolem hranice (střed a poloměr, m). */
function cemeteryMounds(
  village: SceneVillage,
  funeral: SceneFuneral,
): { x: number; z: number; r: number }[] {
  const cemetery = (village.cemeteries ?? []).find((c) => c.id === funeral.cemeteryId);
  if (!cemetery) return [];
  const squares = cemetery.squares.filter((q) => !q.pending);
  const mounds = moundPlacements(
    squares,
    (cemetery.mounds ?? []).filter(
      (m) =>
        !(
          m.cell.x === funeral.cell.x &&
          m.cell.y === funeral.cell.y &&
          m.column === funeral.column &&
          m.row === funeral.row
        ),
    ),
    cemetery.id,
  ).map((m) => {
    const shape = MOUND_SHAPES[m.size];
    return { x: m.x, z: m.z, r: Math.max(shape.radius, shape.length) * m.scale };
  });
  const graves = gravePlacements(squares, cemetery.graves, cemetery.id).map((g) => ({
    x: g.x,
    z: g.z,
    r: MOUND_SHAPES.normal.radius * g.scale,
  }));
  return [...mounds, ...graves];
}

/** Odstup od plotu hřbitova – uvnitř i venku (m). */
const FENCE_CLEAR_M = { inside: 0.7, outside: 0.9 };

/**
 * Nestojí člověk na plotu hřbitova? Uvnitř čtverců kus od plotu, nebo venku kus za ním (plot vede
 * po obrysu čtverců; mezi sousedními čtverci plot není – vnitřní okraj uvnitř hřbitova).
 */
function offFence(
  squares: readonly { x: number; z: number; size: number; rotation?: number }[],
): (x: number, z: number) => boolean {
  const local = (q: (typeof squares)[number], x: number, z: number): [number, number] => {
    const c = Math.cos(q.rotation ?? 0);
    const s = Math.sin(q.rotation ?? 0);
    const dx = x - q.x;
    const dz = z - q.z;
    // natočený čtverec (fields.md – Natočené stavby): osy mřížky x·c + z·s, −x·s + z·c
    return [dx * c - dz * s, dx * s + dz * c];
  };
  const inside = (x: number, z: number, margin: number): boolean =>
    squares.some((q) => {
      const [u, v] = local(q, x, z);
      const half = q.size / 2 + margin;
      return Math.abs(u) < half && Math.abs(v) < half;
    });
  const m = FENCE_CLEAR_M.inside;
  return (x, z) =>
    !inside(x, z, FENCE_CLEAR_M.outside) ||
    (inside(x - m, z - m, 0) &&
      inside(x + m, z - m, 0) &&
      inside(x - m, z + m, 0) &&
      inside(x + m, z + m, 0));
}

/**
 * Místa v kruhu kolem hranice pro `count` lidí: řady od nejbližší (RING_RADII_M), v řadě
 * rovnoměrně kolem dokola od strany branky; místo musí být schůdné, mimo domy a mohyly. Kdo
 * se nevejde, stojí na posledním možném místě.
 */
export function ringSpots(
  center: Point,
  facing: Point,
  count: number,
  spacingM: number,
  free: (x: number, z: number) => boolean,
): Point[] {
  const out: Point[] = [];
  const base = Math.atan2(facing.z, facing.x);
  let left = count;
  for (const radius of RING_RADII_M) {
    if (left <= 0) break;
    const r = radius * (spacingM / RING_SPACING_M);
    const steps = 72;
    const candidates: { a: number; p: Point }[] = [];
    for (let k = 0; k < steps; k++) {
      const a = base + (k / steps) * Math.PI * 2;
      const p = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
      if (free(p.x, p.z)) candidates.push({ a: k, p });
    }
    if (candidates.length === 0) continue;
    const capacity = Math.max(1, Math.floor((2 * Math.PI * r) / spacingM));
    const here = Math.min(left, capacity, candidates.length);
    // rovnoměrně kolem dokola: ideální úhly a nejbližší volné místo bez opakování
    const used = new Set<number>();
    for (let i = 0; i < here; i++) {
      const ideal = (i * steps) / here;
      let best = -1;
      let bestD = Infinity;
      candidates.forEach((c, j) => {
        if (used.has(j)) return;
        const d = Math.min(Math.abs(c.a - ideal), steps - Math.abs(c.a - ideal));
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      if (best < 0) break;
      used.add(best);
      out.push(candidates[best]!.p);
    }
    left = count - out.length;
  }
  while (out.length < count) out.push(out[out.length - 1] ?? { ...center });
  return out;
}

/** Obydlí, odkud průvod vyjde: domácnost zemřelého, jinak obydlí nejblíž k brance. */
function homeOf(village: SceneVillage, funeral: SceneFuneral, gate: Point | null): number | null {
  const homes = village.dwellings.filter((d) => d.built && d.inhabited !== false);
  if (funeral.from !== undefined && village.dwellings.some((d) => d.id === funeral.from)) {
    return funeral.from;
  }
  const target = gate ?? { x: funeral.x, z: funeral.z };
  let best: number | null = null;
  let bestD = Infinity;
  for (const d of homes.length > 0 ? homes : village.dwellings) {
    const dist = Math.hypot(d.position.x - target.x, d.position.z - target.z);
    if (dist < bestD) {
      bestD = dist;
      best = d.id;
    }
  }
  return best;
}

/**
 * Plán pohřbu (cemetery.md – Pohřeb ve scéně): trasa od vchodu domu zemřelého po pěšinách
 * k brance a k hranici, časy obřadu z okna dne pohřbu, nosiči a lidé za márami s místy v kruhu
 * a cestou domů. Bez hodin světa, bez obydlí nebo bez hřbitova null.
 */
export function funeralPlan(
  funeral: SceneFuneral,
  village: SceneVillage,
  env: FuneralEnv,
): FuneralPlan | null {
  const window = env.dayWindow(funeral.day);
  if (!window) return null;
  const cemetery = (village.cemeteries ?? []).find((c) => c.id === funeral.cemeteryId);
  if (!cemetery) return null;
  const entrance: Entrance | null = cemeteryEntrance(cemetery, village.dwellings);
  const home = homeOf(village, funeral, entrance);
  const door = home === null ? null : env.door(home);
  if (!door) return null;
  const pyre: Point = { x: funeral.x, z: funeral.z };
  const scale = env.figureScale;
  // trasa: vchod → pěšiny → před branku → branka → za branku → střed hranice
  const points: Point[] = [door];
  const gateWay: Point[] = [];
  if (entrance) {
    const outside = {
      x: entrance.x + entrance.outX * GATE_OUT_M,
      z: entrance.z + entrance.outZ * GATE_OUT_M,
    };
    const inside = {
      x: entrance.x - entrance.outX * GATE_IN_M,
      z: entrance.z - entrance.outZ * GATE_IN_M,
    };
    const along = env.route(door, outside);
    if (along && along.length >= 2) {
      for (const [x, z] of along.slice(1, -1)) points.push({ x, z });
    }
    gateWay.push(outside, { x: entrance.x, z: entrance.z }, inside);
    points.push(...gateWay);
  }
  points.push(pyre);
  const path = routeOf(points);
  const last = path.points[path.points.length - 2]!;
  const heading = unit(pyre.x - last[0], pyre.z - last[1]);
  const stopS = Math.max(0, path.length - STOP_M);
  const headS = Math.min(HEAD_START_M, stopS);
  const timeline = funeralTimeline(window, stopS - headS);
  alongRoute(path, stopS, false, TMP_POSE);
  const stopPoint = { x: TMP_POSE.x, z: TMP_POSE.z };
  const t = FUNERAL_TIMING;

  // lidé: nosiči vpředu, za nimi řady po dvou; kruh kolem hranice od strany branky
  const mourners = funeral.mourners;
  const count = FUNERAL_BEARERS + mourners.length;
  const mounds = cemeteryMounds(village, funeral);
  const fence = offFence(cemetery.squares);
  const free = (x: number, z: number): boolean =>
    env.standable(x, z) &&
    fence(x, z) &&
    !mounds.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 0.25);
  const toGate = entrance
    ? unit(entrance.x - pyre.x, entrance.z - pyre.z)
    : { x: -heading.x, z: -heading.z };
  const ring = ringSpots(pyre, toGate, count, RING_SPACING_M * scale, free);
  const waits = doorWaits(door, path, count, scale, env);
  // z kruhu ven: za branku (bez branky k místu, kde se máry zastavily)
  const exit = gateWay.length > 0 ? gateWay[gateWay.length - 1]! : stopPoint;
  // cesty domů: domácnost zemřelého po trase průvodu zpět, ostatní od branky ke svému vchodu
  const back = [...points].reverse().slice(1);
  const homeWays = new Map<number, Point[]>();
  const wayHome = (id: number | null): Point[] => {
    if (id === null || id === home || gateWay.length === 0) return back;
    const known = homeWays.get(id);
    if (known) return known;
    const theirDoor = env.door(id);
    let way = back;
    if (theirDoor) {
      const along = env.route(gateWay[0]!, theirDoor);
      way = [
        ...[...gateWay].reverse(),
        ...(along && along.length >= 2 ? along.slice(1, -1).map(([x, z]) => ({ x, z })) : []),
        theirDoor,
      ];
    }
    homeWays.set(id, way);
    return way;
  };
  const members: FuneralMember[] = [];
  for (let i = 0; i < count; i++) {
    const bearer = i < FUNERAL_BEARERS;
    const mourner = bearer ? null : mourners[i - FUNERAL_BEARERS]!;
    const row = bearer ? -1 : Math.floor((i - FUNERAL_BEARERS) / 2);
    const spot = bearer ? BEARER_SPOTS[i]! : null;
    const behind = spot ? -spot.along : COLUMN.firstM + row * COLUMN.rowM * scale;
    const side = spot
      ? spot.side
      : ((i - FUNERAL_BEARERS) % 2 === 0 ? 1 : -1) * COLUMN.sideM * scale;
    const wait = waits[i]!;
    // kde kdo stojí po příchodu: nosiči vedle hranice (po položení már), ostatní v průvodu
    const toRing = bearer
      ? routeOf(
          aroundPyre(
            frameAt(
              pyre,
              heading.x,
              heading.z,
              spot!.along > 0 ? 0.9 : -0.9,
              Math.sign(spot!.side) * 1.25,
            ),
            ring[i]!,
            pyre,
          ),
        )
      : routeOf([
          ...(stopS - behind >= 0
            ? [
                columnPoint(path, stopS, behind, side, wait),
                ...subPath(path, stopS - behind, stopS).slice(1),
              ]
            : [wait, ...subPath(path, 0, stopS)]),
          ...aroundPyre(stopPoint, ring[i]!, pyre).slice(1),
        ]);
    const ringMs = bearer
      ? timeline.litMs + 2000
      : timeline.arriveMs + (t.ringStartS + row * t.ringStepS) * 1000;
    const leaveMs =
      timeline.outMs + (t.leaveS + hashText(funeral.key, i) * count * t.leaveStepS) * 1000;
    const homeRoute = routeOf([
      ...aroundPyre(ring[i]!, exit, pyre),
      ...wayHome(mourner?.home ?? null).slice(gateWay.length > 0 ? 1 : 0),
    ]);
    members.push({
      key: bearer ? `bearer:${i}` : `mourner:${i - FUNERAL_BEARERS}`,
      bearer,
      sex: mourner?.sex ?? 'male',
      child: (mourner?.age ?? 30) < 14,
      elder: (mourner?.age ?? 30) >= 45,
      behind,
      side,
      wait,
      ring: ring[i]!,
      toRing,
      home: homeRoute,
      ringMs,
      leaveMs,
    });
  }
  // obal: trasa, čekání u vchodu, kruh a cesty domů
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const add = (x: number, z: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const [x, z] of path.points) add(x, z);
  for (const m of members) {
    add(m.wait.x, m.wait.z);
    add(m.ring.x, m.ring.z);
    for (const [x, z] of m.home.points) add(x, z);
  }
  // poslední doma: odchod a cesta domů (nejpomalejší chůze – SLOWEST_M_S)
  const figuresUntilMs = Math.max(
    timeline.coldMs,
    ...members.map((m) => m.leaveMs + (m.home.length / SLOWEST_M_S) * 1000 + 1000),
  );
  return {
    key: funeral.key,
    funeral,
    path,
    stopS,
    headS,
    timeline,
    members,
    pyre: { x: pyre.x, z: pyre.z, headingX: heading.x, headingZ: heading.z },
    extent: { minX, maxX, minZ, maxZ },
    figuresUntilMs,
  };
}

/** Nejpomalejší chůze domů (m/s – dítě, starší) – do kdy jsou lidé pohřbu vidět. */
const SLOWEST_M_S = 0.6;

/** Body trasy od vzdálenosti `from` do `to` (včetně krajních bodů). */
function subPath(path: Route, from: number, to: number): Point[] {
  const a = Math.max(0, Math.min(path.length, from));
  const b = Math.max(a, Math.min(path.length, to));
  alongRoute(path, a, false, TMP_POSE);
  const out: Point[] = [{ x: TMP_POSE.x, z: TMP_POSE.z }];
  path.points.forEach(([x, z], i) => {
    const at = path.at[i]!;
    if (at > a && at < b) out.push({ x, z });
  });
  alongRoute(path, b, false, TMP_POSE);
  out.push({ x: TMP_POSE.x, z: TMP_POSE.z });
  return out;
}

/**
 * Kde stojí člověk průvodu po zastavení čela: na trase `behind` metrů za márami, `side` vedle osy;
 * kdo se na trasu nevešel, zůstal u vchodu (`wait`).
 */
function columnPoint(path: Route, stopS: number, behind: number, side: number, wait: Point): Point {
  const s = stopS - behind;
  if (s < 0) return wait;
  alongRoute(path, s, false, TMP_POSE);
  return { x: TMP_POSE.x - TMP_POSE.headingZ * side, z: TMP_POSE.z + TMP_POSE.headingX * side };
}

/** Místa u vchodu, kde lidé čekají, než na ně v průvodu přijde řada (půlkruh před vchodem). */
function doorWaits(
  door: Point,
  path: Route,
  count: number,
  scale: number,
  env: FuneralEnv,
): Point[] {
  alongRoute(path, 0, false, TMP_POSE);
  const ahead = { x: TMP_POSE.headingX, z: TMP_POSE.headingZ };
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    let spot: Point = door;
    for (let k = 0; k < 24; k++) {
      const ring = 1 + Math.floor((i + k) / 6);
      const a = (((i + k) % 6) / 5 - 0.5) * Math.PI * 0.9;
      const r = ring * 1.1 * scale;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const p = {
        x: door.x + (ahead.x * c - ahead.z * s) * r,
        z: door.z + (ahead.z * c + ahead.x * s) * r,
      };
      if (env.standable(p.x, p.z)) {
        spot = p;
        break;
      }
    }
    out.push(spot);
  }
  return out;
}

/**
 * Póza člověka průvodu `index` v čase `t` (s, villagerSeconds) – postava `kind` a měřítka
 * `scale` (rychlost chůze, ať nohy neklouzají). Před začátkem dne pohřbu a doma po obřadu skrytý.
 */
export function funeralPose(
  plan: FuneralPlan,
  index: number,
  kind: VillagerKind,
  scale: number,
): PoseFn {
  const m = plan.members[index]!;
  const t = plan.timeline;
  const walk = walkSpeed(kind, 'walk', scale);
  const own = walk * (m.child ? 0.85 : m.elder ? 0.8 : 0.95);
  return (time, _herds, o) => {
    const nowMs = time * 1000 + LIVESTOCK_EPOCH_MS;
    o.hidden = false;
    if (nowMs < t.startMs) {
      o.hidden = true;
      o.x = m.wait.x;
      o.z = m.wait.z;
      o.clip = 'idle';
      o.pace = 1;
      return o;
    }
    const facePyre = (): void => {
      const d = unit(plan.pyre.x - o.x, plan.pyre.z - o.z);
      o.headingX = d.x;
      o.headingZ = d.z;
    };
    // po dohoření domů – na konci cesty zmizí
    if (nowMs >= m.leaveMs) {
      const d = ((nowMs - m.leaveMs) / 1000) * own;
      alongRoute(m.home, d, false, o);
      o.clip = 'walk';
      o.pace = own / walk;
      o.hidden = d >= m.home.length + 0.5;
      return o;
    }
    // v kruhu kolem hranice (po příchodu)
    if (nowMs >= m.ringMs) {
      const d = ((nowMs - m.ringMs) / 1000) * own;
      alongRoute(m.toRing, d, false, o);
      if (d >= m.toRing.length) {
        facePyre();
        o.clip = 'idle';
        o.pace = 1;
      } else {
        o.clip = 'walk';
        o.pace = own / walk;
      }
      return o;
    }
    // nosiči: pokládání már na hranici – od konců tyčí vedle hranice
    if (m.bearer && nowMs >= t.arriveMs) {
      const spot = BEARER_SPOTS[index]!;
      const u = smooth((nowMs - t.arriveMs) / Math.max(1, t.litMs - t.arriveMs));
      alongRoute(plan.path, plan.stopS, false, TMP_POSE);
      const carried = frameAt(
        TMP_POSE,
        TMP_POSE.headingX,
        TMP_POSE.headingZ,
        spot.along,
        spot.side,
      );
      const end = m.toRing.points[0]!;
      o.x = carried.x + (end[0] - carried.x) * u;
      o.z = carried.z + (end[1] - carried.z) * u;
      o.headingX = plan.pyre.headingX;
      o.headingZ = plan.pyre.headingZ;
      o.clip = u > 0 && u < 1 ? 'walk' : 'idle';
      o.pace = 0.6;
      return o;
    }
    // v průvodu: za čelem o `behind` metrů, kdo se ještě nevešel, čeká u vchodu
    const head = headAt(plan, nowMs);
    const s = head - m.behind;
    const moving = nowMs >= t.departMs && nowMs < t.arriveMs;
    if (s < 0) {
      const door = plan.path.points[0]!;
      const gapM = Math.hypot(m.wait.x - door[0], m.wait.z - door[1]);
      if (s > -gapM && moving) {
        // k vchodu, kde se zařadí
        const u = 1 + s / Math.max(0.01, gapM);
        o.x = m.wait.x + (door[0] - m.wait.x) * u;
        o.z = m.wait.z + (door[1] - m.wait.z) * u;
        const d = unit(door[0] - m.wait.x, door[1] - m.wait.z);
        o.headingX = d.x;
        o.headingZ = d.z;
        o.clip = 'walk';
        o.pace = Math.max(0.35, t.pace / walk);
        return o;
      }
      o.x = m.wait.x;
      o.z = m.wait.z;
      const d = unit(door[0] - m.wait.x, door[1] - m.wait.z);
      o.headingX = d.x;
      o.headingZ = d.z;
      o.clip = 'idle';
      o.pace = 1;
      return o;
    }
    alongRoute(plan.path, s, false, o);
    // vedle osy – vlevo od směru chůze
    o.x -= o.headingZ * m.side;
    o.z += o.headingX * m.side;
    o.clip = moving ? 'walk' : 'idle';
    o.pace = moving ? Math.max(0.35, t.pace / walk) : 1;
    return o;
  };
}

/** Jsou lidé pohřbu vidět během okna dne `window` (počítají se místo pracujících postav)? */
export function funeralActiveIn(plan: FuneralPlan, window: DayWindow | null): boolean {
  if (!window) return false;
  return plan.timeline.startMs < window.endMs && plan.figuresUntilMs > window.startMs;
}

/** Hřbitovy bez mohyl, které ještě nejsou nasypané (hranice hoří nebo doutná). */
export function withoutHiddenMounds(
  cemeteries: NonNullable<SceneVillage['cemeteries']>,
  hidden: ReadonlySet<string>,
): NonNullable<SceneVillage['cemeteries']> {
  if (hidden.size === 0) return cemeteries;
  return cemeteries.map((c) => {
    if (!c.mounds?.some((m) => hidden.has(funeralKey(c.id, m)))) return c;
    const mounds = c.mounds.filter((m) => !hidden.has(funeralKey(c.id, m)));
    const { mounds: _old, ...rest } = c;
    void _old;
    return mounds.length > 0 ? { ...rest, mounds } : rest;
  });
}
