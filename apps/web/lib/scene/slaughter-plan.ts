// Porážka ve scéně bez Babylonu (diet.md – Porážka ve scéně; Martin 26. 10. 2026: „Ideální by
// bylo, kdyby porážka měla vlastní sekvenci - omráčení, vykrvení, vyvržení a rozčtvrcení“).
// Jen zobrazení: z kusů poražených dnes (`SceneLabor.slaughter`) stanoviště na dvoře u domu
// (kráva u branky ohrady skotu) – kozlina, necky, špalek s prknem a miska –, parta 1–4 dospělých
// a pro každý okamžik dne fáze, póza a klip každého člověka a stav zvířete (stojí → padne →
// leží → visí → po čtvrtinách mizí, kýty na prkně, nosiči masa ke vchodu). Všechno je čistá
// funkce skutečného času a vstupu: časy jsou podíly okna herního dne (vzor funeral-plan.ts),
// náhoda ze seedu vsi a dne. Kreslí slaughter-renderer (zvíře, rekvizity) a postavy vsi.
import type { HerdSpecies } from '@bohemia/game';
import {
  alongRoute,
  route as makeRoute,
  type Route,
  type VillagerClip,
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

/** Bod s natočením (jednotkový směr, kam míří lokální +Z modelu). */
export interface Spot extends Point {
  headingX: number;
  headingZ: number;
}

export type SlaughterPhase =
  | 'bring'
  | 'stun'
  // ovce a koza se neomračují – jen přidržení, podříznou se (Martin 26. 10. 2026)
  | 'hold'
  | 'bleed'
  | 'hang'
  | 'gut'
  | 'quarter'
  | 'carry';

/**
 * Fáze porážky jako podíly okna herního dne (≈ 86 s – návrh Clauda, diet.md – Porážka ve scéně):
 * přivedení, omráčení (u ovce a kozy přidržení), vykrvení, zavěšení, vyvržení, rozčtvrcení
 * a odnos masa. Den se opakuje (stejně jako jízdy – riders.ts `hourOfDay`), když scéna ukazuje
 * práci dne déle než jeho okno.
 */
export const SLAUGHTER_PHASES: readonly { phase: SlaughterPhase; from: number; to: number }[] = [
  { phase: 'bring', from: 0, to: 0.06 },
  { phase: 'stun', from: 0.06, to: 0.14 },
  { phase: 'bleed', from: 0.14, to: 0.35 },
  { phase: 'hang', from: 0.35, to: 0.4 },
  { phase: 'gut', from: 0.4, to: 0.62 },
  { phase: 'quarter', from: 0.62, to: 0.85 },
  { phase: 'carry', from: 0.85, to: 1 },
];

/** Začátek fáze (podíl dne) z tabulky. */
function phaseFrom(phase: SlaughterPhase): number {
  return SLAUGHTER_PHASES.find((p) => p.phase === phase)!.from;
}
const BLEED_F = phaseFrom('bleed');
const HANG_F = phaseFrom('hang');
const GUT_F = phaseFrom('gut');
const QUARTER_F = phaseFrom('quarter');
const CARRY_F = phaseFrom('carry');

/**
 * Časy uvnitř fází: omráčené zvíře padne ve 12 % dne (pád 0,6 s), ovce a koza na začátku
 * vykrvení; zavěšení uprostřed fáze (37,5 %) – zvíře se za 1,2 s zvedne na háky; úder palicí (klip `build`) trvá 0,83 s
 * (build.dae z 0 A.D.), podříznutí vestoje 2 s. Rozčtvrcení má 4 kroky: první půlku kroku seká
 * řezník sekerou, v půlce čtvrtina zmizí, další čtvrtinu kroku ji nosič nese na prkno. Odnos:
 * nosiči jdou stálou rychlostí (stav prkna nezávisí na postavě), u dveří chvíli zůstanou uvnitř.
 */
export const SLAUGHTER_TIMING = {
  fallAt: 0.12,
  fallS: 0.6,
  hoistAt: 0.375,
  liftS: 1.2,
  blowS: 0.83,
  cutS: 2,
  quarterSteps: 4,
  carryMS: 1,
  pickS: 0.6,
  insideS: 1.5,
  staggerS: 0.7,
} as const;

/** Parta podle druhu (dospělí 16+): ovce a koza 2, prase 3, kráva 4 – málo lidí → řezník sám. */
export const SLAUGHTER_CREW: Record<HerdSpecies, number> = { sheep: 2, goat: 2, pig: 3, cow: 4 };

/** Parta jen z dospělých 16+ (děti a výrostci dál u stád). */
export const SLAUGHTER_MIN_AGE = 16;

/** Omračuje se jen prase a kráva (Martin 26. 10. 2026). */
export const STUNNED: ReadonlySet<HerdSpecies> = new Set<HerdSpecies>(['pig', 'cow']);

/** Nejvýš tolik stanovišť naráz (1. 11., nouzová porážka, porážka pro seno). */
export const MAX_SLAUGHTER_STATIONS = 3;

/**
 * Kozliny (tools/blender/slaughter.py – změřeno z GLB): polovina šíře (x), přední a zadní dosah
 * nohou od středu (otevřená strana vpředu, lokální +Z), výška hrotů háků.
 */
export const TRESTLE = {
  large: { halfX: 1.13, front: 0.68, back: 1.3, hookY: 2.45 },
  small: { halfX: 0.77, front: 0.47, back: 0.89, hookY: 1.5 },
} as const;

export type TrestleSize = keyof typeof TRESTLE;

/** Špalek s prknem: výška vršku prkna a místa pro 4 kýty podél prkna (m od středu). */
export const BLOCK = { boardY: 0.59, legSlots: [-0.24, -0.08, 0.08, 0.24] } as const;

/**
 * Mršiny (carcass-<druh>.glb – změřeno): délka a polovina šíře ležícího zvířete a výška háku
 * nad počátkem visícího modelu (počátek visícího = hroty háků − `hangTop`). Visí hlavou dolů
 * za hlezna – kopyta trčí nad háky (špičky nohou visícího modelu: kráva 1,02 m nad počátkem,
 * prase 0,52, ovce 0,64, koza 0,74; nejnižší bod −1,31 / −0,82 / −0,78 / −0,64 m). Kráva
 * o 0,18 m, aby hlava nad zemí zůstala (≈ 30 cm na kozlině s háky v 2,45 m), ostatní o 0,1 m (hlava
 * 0,18–0,26 m nad zemí, v neckách).
 */
export const CARCASS: Record<HerdSpecies, { length: number; halfWidth: number; hangTop: number }> =
  {
    cow: { length: 2.04, halfWidth: 0.61, hangTop: 0.84 },
    pig: { length: 1.18, halfWidth: 0.36, hangTop: 0.42 },
    sheep: { length: 1.24, halfWidth: 0.45, hangTop: 0.54 },
    goat: { length: 1.1, halfWidth: 0.36, hangTop: 0.64 },
  };

/** Odhad chůze přes bod před kozlinou (m/s) – pomalejší postava by na něm poskočila. */
const VIA_M_S = 0.9;

/** Kozlina stojí 2–3 m od vchodu (od branky ohrady), stanoviště od sebe aspoň tolik. */
export const STATION_FROM_DOOR_M = [2.5, 2, 3] as const;
const STATION_SIDE_M = [0, 1.5, -1.5, 3, -3] as const;
const STATION_GAP_M = 6;

/** Čtvrtiny mršiny jako bity stavu (přední/zadní × levá/pravá) – pořadí sekání. */
export const QUARTER_BITS = [1, 2, 4, 8] as const;

/** Role v partě: řezník, žena s miskou, pomocník (drží), druhý pomocník (u krávy). */
export type SlaughterRole = 'butcher' | 'bowl' | 'holder' | 'helper';
export const SLAUGHTER_ROLES: readonly SlaughterRole[] = ['butcher', 'bowl', 'holder', 'helper'];

/** Rekvizita v ruce podle klipu (people.json – propy se ukazují jen v klipu). */
export type SlaughterProp = 'mallet' | 'knife' | 'bowl' | 'axe' | 'meat';

/** Obydlí pro porážku: bod před vchodem (volné místo) a směr ven z domu (jednotkový). */
export interface SlaughterHome {
  id: number;
  door: Point;
  out: Point;
}

/** Branka ohrady skotu a směr ven z ohrady (jednotkový). */
export interface SlaughterGate {
  x: number;
  z: number;
  outX: number;
  outZ: number;
}

/** Vstup plánu porážky (villager-plan-slaughter.ts ho sestaví z vsi). */
export interface SlaughterInput {
  /** Kusy poražené dnes (`SceneLabor.slaughter`, i zlomky); bez údaje se neporáží. */
  heads: Partial<Record<HerdSpecies, number>> | undefined;
  day: number;
  seed: number;
  window: DayWindow;
  /** Obydlené domácnosti. */
  homes: readonly SlaughterHome[];
  /** Branka hotové ohrady skotu, nebo null – kráva se poráží u domu. */
  cattleGate: SlaughterGate | null;
  /** Kolik postav je pro porážku (podíl `slaughter`, aspoň 2). */
  figures: number;
  /** Smí tu stát kozlina, zvíře a lidé – schůdná zem mimo domy, pozemky, pole a hroby. */
  standable(x: number, z: number): boolean;
  /** Trasa nosičů ke vchodu (body [x, z]), nebo null – jdou rovně. */
  route?(a: Point, b: Point): readonly (readonly [number, number])[] | null;
}

/** Místo porážky před obsazením party – druh, domácnost, kozlina a kolik lidí chce. */
export interface SlaughterSite extends Spot {
  key: string;
  species: HerdSpecies;
  /** Domácnost (id obydlí), které maso patří – nosiči jdou k jejímu vchodu. */
  home: number;
  door: Point;
  /** Kráva u branky ohrady skotu. */
  atGate: boolean;
  trestle: TrestleSize;
  /** Kolik lidí v partě (podle druhu a postav). */
  wanted: number;
  /** Úderů palicí (2–3 – prase a kráva), ovce a koza 0. */
  blows: number;
}

/** Krok scénáře člověka: od `at` (s od začátku dne) jde na místo a pak dělá `clip`. */
export interface SlaughterStep extends Spot {
  at: number;
  clip: VillagerClip;
  /** Klip cestou na místo (`walk`, s masem `carry-meat`). */
  move: VillagerClip;
  /** Pevná doba cesty (s) – nosiči; jinak podle rychlosti postavy. */
  walkS?: number;
  /** Na místě není vidět (uvnitř domu). */
  hidden?: boolean;
  /** Cesta po trase (nosiči ke vchodu a zpět – `reverse`), jinak rovně z předchozího místa. */
  route?: Route;
  reverse?: boolean;
}

/** Člověk party a jeho scénář dne. */
export interface SlaughterMember {
  role: SlaughterRole;
  steps: readonly SlaughterStep[];
}

/** Stanoviště porážky – vše, co kreslí slaughter-renderer, a scénáře lidí. */
export interface SlaughterStation extends SlaughterSite {
  crew: SlaughterRole[];
  members: SlaughterMember[];
  /** Kde zvíře stojí, padne a leží (střed, hlavou ke vchodu). */
  animal: Spot;
  /** Kde visí: pod háky (střed kozliny), natočené břichem k řezníkovi; počátek ve výšce `lift`. */
  hang: Spot & { lift: number };
  trough: Spot;
  block: Spot;
  /** Miska s krví na zemi od konce vykrvení (jen s ženou s miskou). */
  bowl: Point | null;
  /**
   * Časy dne (s od začátku okna): pád, zavěšení, miska na zemi, zmizení čtvrtin, kýty na prkno
   * a z prkna (nosiči).
   */
  times: {
    fallS: number;
    hoistS: number;
    bowlS: number;
    cutS: number[];
    legOnS: number[];
    legOffS: number[];
  };
}

export interface SlaughterPlan {
  day: number;
  window: DayWindow;
  stations: SlaughterStation[];
}

/** Stav stanoviště v okamžiku – co renderer přečte. */
export interface SlaughterState {
  phase: SlaughterPhase;
  /** Postup fáze 0–1. */
  progress: number;
  carcass: {
    visible: boolean;
    /** Morph mršiny: 1 stojí, 0 leží, −1 visí (keyA/keyB – scene-village.md, Mršiny). */
    pose: number;
    x: number;
    z: number;
    /** Výška počátku nad zemí (visí). */
    lift: number;
    headingX: number;
    headingZ: number;
    /** Kolik čtvrtin ještě visí (0–4) a bity useknutých (QUARTER_BITS). */
    quarters: number;
    cutMask: number;
  };
  /** Kýty na prkně špalku (0–4, místa BLOCK.legSlots). */
  legsOnBoard: number;
  bowlOnGround: boolean;
}

// --- náhoda a čas -------------------------------------------------------------------------

/** Deterministická náhoda 0–1 ze seedu vsi, dne a čísla losu. */
export function slaughterRoll(seed: number, day: number, k: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((day | 0) + 0x632be5ab, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(k | 0, 0xc2b2ae35) ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Délka dne (s) a čas od začátku okna (s, dokola – den se opakuje). */
export function slaughterSeconds(window: DayWindow, nowMs: number): { s: number; dayS: number } {
  const dayMs = Math.max(1, window.endMs - window.startMs);
  const ms = (((nowMs - window.startMs) % dayMs) + dayMs) % dayMs;
  return { s: ms / 1000, dayS: dayMs / 1000 };
}

/** Fáze a její postup v okamžiku `nowMs`. */
export function slaughterPhaseAt(
  window: DayWindow,
  nowMs: number,
): { phase: SlaughterPhase; progress: number } {
  const { s, dayS } = slaughterSeconds(window, nowMs);
  const f = s / dayS;
  const row = SLAUGHTER_PHASES.find((p) => f < p.to) ?? SLAUGHTER_PHASES.at(-1)!;
  return { phase: row.phase, progress: Math.min(1, (f - row.from) / (row.to - row.from)) };
}

// --- stanoviště ---------------------------------------------------------------------------

/** Druh losem váženým kusy (zlomky jsou podíly), nebo null. */
function drawSpecies(weights: Partial<Record<HerdSpecies, number>>, r: number): HerdSpecies | null {
  const list = (['pig', 'sheep', 'goat', 'cow'] as const).filter((s) => (weights[s] ?? 0) > 0);
  const total = list.reduce((sum, s) => sum + weights[s]!, 0);
  if (total <= 0) return null;
  let pick = r * total;
  for (const s of list) {
    pick -= weights[s]!;
    if (pick < 0) return s;
  }
  return list.at(-1)!;
}

/**
 * Kolik stanovišť: zaokrouhlený součet kusů (zimní den se zlomky dá 1), nejvýš
 * MAX_SLAUGHTER_STATIONS a polovina postav, aspoň 1 (návrh Clauda).
 */
export function stationCount(heads: Partial<Record<HerdSpecies, number>>, figures: number): number {
  const total = Object.values(heads).reduce((sum, n) => sum + Math.max(0, n ?? 0), 0);
  if (total <= 0 || figures <= 0) return 0;
  return Math.max(1, Math.min(MAX_SLAUGHTER_STATIONS, Math.floor(figures / 2), Math.round(total)));
}

/** Lokální osa stanoviště: `side` podél bidla (lokální +X modelu), `front` k vchodu. */
function local(o: Spot, side: number, front: number): Point {
  return {
    x: o.x + o.headingZ * side + o.headingX * front,
    z: o.z - o.headingX * side + o.headingZ * front,
  };
}

/** Směr v lokálních osách → svět (jednotkový). */
function localDir(o: Spot, side: number, front: number): Point {
  const p = local({ ...o, x: 0, z: 0 }, side, front);
  const l = Math.hypot(p.x, p.z);
  return l > 1e-6 ? { x: p.x / l, z: p.z / l } : { x: o.headingX, z: o.headingZ };
}

/** Kde leží zvíře v osách stanoviště (vedle kozliny, tělem k vchodu). */
function animalLocal(species: HerdSpecies, size: TrestleSize): { side: number; front: number } {
  return { side: -(TRESTLE[size].halfX + 0.5 + CARCASS[species].halfWidth), front: 0.15 };
}

/**
 * Řezník při vyvržení stojí z boku visícího zvířete (u kratšího konce bidla, tam, kde předtím leželo
 * zvíře) – nezakrývá ho z pohledu zepředu (Martin 26. 10. 2026, kontrola snímků).
 */
function gutLocal(size: TrestleSize): { side: number; front: number } {
  return { side: -(TRESTLE[size].halfX + 0.45), front: 0.1 };
}

/** Miska stojí na zemi vedle necek u hlavy visícího zvířete (necky 1,4 m – za jejich koncem). */
const BOWL_LOCAL = { side: 0.98, front: 0.05 } as const;

function blockLocal(size: TrestleSize): { side: number; front: number } {
  return { side: TRESTLE[size].halfX + 0.9, front: 0.3 };
}

/** Body, které musí být schůdné: nohy kozliny, zvíře, špalek a místo řezníka. */
function footprint(o: Spot, species: HerdSpecies, size: TrestleSize): Point[] {
  const t = TRESTLE[size];
  const a = animalLocal(species, size);
  const c = CARCASS[species];
  const b = blockLocal(size);
  return [
    local(o, 0, 0),
    local(o, t.halfX, t.front),
    local(o, -t.halfX, t.front),
    local(o, 0, -t.back),
    local(o, a.side, a.front + c.length / 2 + 0.5),
    local(o, a.side, a.front - c.length / 2 - 0.4),
    local(o, a.side - c.halfWidth - 0.5, a.front),
    local(o, b.side, b.front),
    local(o, b.side, b.front + 0.6),
    local(o, gutLocal(size).side, gutLocal(size).front),
    local(o, BOWL_LOCAL.side, BOWL_LOCAL.front),
  ];
}

/** Kozlina 2–3 m od bodu `from` ve směru `out` (otevřenou stranou k němu), nebo null. */
function placeTrestle(
  input: SlaughterInput,
  from: Point,
  out: Point,
  species: HerdSpecies,
  size: TrestleSize,
  taken: readonly Point[],
): Spot | null {
  const ol = Math.hypot(out.x, out.z) || 1;
  const ox = out.x / ol;
  const oz = out.z / ol;
  for (const d of STATION_FROM_DOOR_M) {
    for (const side of STATION_SIDE_M) {
      const o: Spot = {
        x: from.x + ox * d + oz * side,
        z: from.z + oz * d - ox * side,
        headingX: -ox,
        headingZ: -oz,
      };
      if (taken.some((p) => Math.hypot(p.x - o.x, p.z - o.z) < STATION_GAP_M)) continue;
      if (footprint(o, species, size).every((p) => input.standable(p.x, p.z))) return o;
    }
  }
  return null;
}

/**
 * Stanoviště dne: druh losem váženým dnešními kusy (každé další bez už vylosovaného kusu),
 * domácnost losem ze seedu a dne (každá nejvýš jednou), kozlina 2–3 m před vchodem na schůdné
 * zemi; kráva u branky ohrady skotu (bez ohrady u domu). Parta podle druhu, postavy se rozdělí
 * napřed po jednom (řezník), pak po stanovištích. Bez kusů, obydlí nebo postav nic.
 */
export function slaughterSites(input: SlaughterInput): SlaughterSite[] {
  const heads = input.heads ?? {};
  const total = Object.values(heads).reduce((sum, n) => sum + Math.max(0, n ?? 0), 0);
  // zimní den s méně než jedním kusem (zlomek ≈ 0,04 prasete denně): stanoviště jen v tom podílu
  // dní, jaký zlomek je – průměr přes zimu odpovídá kusům, ne porážce každý den (návrh Clauda)
  const today = total >= 1 || slaughterRoll(input.seed, input.day, 0) < total;
  const count = today ? stationCount(heads, input.figures) : 0;
  const homes = [...input.homes].sort((a, b) => a.id - b.id);
  if (count === 0 || homes.length === 0) return [];
  const weights: Partial<Record<HerdSpecies, number>> = { ...heads };
  const used = new Set<number>();
  const taken: Point[] = [];
  const sites: SlaughterSite[] = [];
  for (let k = 0; k < count; k++) {
    const species =
      drawSpecies(weights, slaughterRoll(input.seed, input.day, 1 + k * 7)) ??
      drawSpecies(heads, slaughterRoll(input.seed, input.day, 2 + k * 7));
    if (!species) break;
    weights[species] = Math.max(0, (weights[species] ?? 0) - 1);
    const size: TrestleSize = species === 'cow' ? 'large' : 'small';
    const first = Math.floor(slaughterRoll(input.seed, input.day, 3 + k * 7) * homes.length);
    let spot: { o: Spot; home: SlaughterHome; atGate: boolean } | null = null;
    for (let j = 0; j < homes.length && !spot; j++) {
      const home = homes[(first + j) % homes.length]!;
      if (used.has(home.id)) continue;
      const gate = species === 'cow' ? input.cattleGate : null;
      const atGate = gate
        ? placeTrestle(input, gate, { x: gate.outX, z: gate.outZ }, species, size, taken)
        : null;
      const o = atGate ?? placeTrestle(input, home.door, home.out, species, size, taken);
      if (o) spot = { o, home, atGate: atGate !== null };
    }
    if (!spot) continue;
    used.add(spot.home.id);
    taken.push(spot.o);
    sites.push({
      ...spot.o,
      key: `${input.day}:${k}`,
      species,
      home: spot.home.id,
      door: spot.home.door,
      atGate: spot.atGate,
      trestle: size,
      wanted: 1,
      blows: STUNNED.has(species)
        ? 2 + Math.floor(slaughterRoll(input.seed, input.day, 4 + k * 7) * 2)
        : 0,
    });
  }
  // postavy: napřed řezník u každého stanoviště, pak doplnit party v pořadí stanovišť
  let left = Math.max(0, input.figures - sites.length);
  for (const site of sites) {
    const more = Math.min(left, SLAUGHTER_CREW[site.species] - 1);
    site.wanted += more;
    left -= more;
  }
  return sites;
}

// --- scénáře lidí -------------------------------------------------------------------------

interface Script {
  steps: SlaughterStep[];
  /** Kde člověk naposledy stojí (pro odhad doby cesty dalšího kroku). */
  last: Point;
}

function addStep(script: Script, step: SlaughterStep): void {
  const prev = script.steps.at(-1);
  script.steps.push({ ...step, at: Math.max(step.at, prev?.at ?? 0) });
  script.last = { x: step.x, z: step.z };
}

/** Krok na místo `p` (svět), pohled ve směru `face`. */
function stepAt(
  at: number,
  p: Point,
  face: Point,
  clip: VillagerClip,
  move: VillagerClip = 'walk',
): SlaughterStep {
  return { at, x: p.x, z: p.z, headingX: face.x, headingZ: face.z, clip, move };
}

function dirTo(a: Point, b: Point): Point {
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  return l > 1e-6 ? { x: (b.x - a.x) / l, z: (b.z - a.z) / l } : { x: 0, z: 1 };
}

/**
 * Stanoviště s partou (`crew` – role, na které se našel člověk; první je řezník): místa zvířete,
 * rekvizit a scénáře lidí po fázích, časy pádu, zavěšení, čtvrtin a kýt.
 */
export function slaughterStation(
  site: SlaughterSite,
  crew: readonly SlaughterRole[],
  input: Pick<SlaughterInput, 'window' | 'route'>,
): SlaughterStation {
  const T = SLAUGHTER_TIMING;
  const dayS = Math.max(1, (input.window.endMs - input.window.startMs) / 1000);
  const at = (f: number): number => f * dayS;
  const t = TRESTLE[site.trestle];
  const c = CARCASS[site.species];
  const a = animalLocal(site.species, site.trestle);
  const b = blockLocal(site.trestle);
  const L = c.length;
  const W = c.halfWidth;
  const P = (side: number, front: number): Point => local(site, side, front);
  const D = (side: number, front: number): Point => localDir(site, side, front);
  const F = { x: site.headingX, z: site.headingZ };
  const back = { x: -F.x, z: -F.z };
  const center = P(0, 0);
  const animal: Spot = { ...P(a.side, a.front), headingX: F.x, headingZ: F.z };
  const block: Spot = { ...P(b.side, b.front), headingX: F.x, headingZ: F.z };
  const stunned = STUNNED.has(site.species);
  const fallS = at(stunned ? T.fallAt : BLEED_F);
  const hoistS = at(T.hoistAt);
  const q0 = QUARTER_F;
  const qd = (CARRY_F - q0) / T.quarterSteps;
  const cutS = QUARTER_BITS.map((_, k) => at(q0 + (k + 0.5) * qd));
  const legOnS = QUARTER_BITS.map((_, k) => at(q0 + (k + 0.75) * qd));
  // místa (osy stanoviště: side podél bidla, front k vchodu)
  const neck = a.front + 0.32 * L;
  const outer = a.side - W;
  const toAnimal = D(1, 0);
  const g = gutLocal(site.trestle);
  const gutSpot = P(g.side, g.front);
  const chopSpot = P(0.45, Math.max(0.8, t.front + 0.2));
  const takeSpot = P(-0.55, Math.max(0.75, t.front + 0.1));
  const wait = (m: number): Point => P(b.side - 0.35 + 0.45 * (m - 1), b.front + 0.9);
  const pick = (m: number): Point => P(b.side + (m - 1.5) * 0.3, b.front + 0.55);
  const bowlSpot = P(BOWL_LOCAL.side, BOWL_LOCAL.front);
  const hasBowl = crew.includes('bowl');
  const runner = crew.includes('holder') ? crew.indexOf('holder') : crew.length > 1 ? 1 : 0;
  const scripts: Script[] = crew.map(() => ({ steps: [], last: site.door }));
  crew.forEach((role, m) => {
    const s = scripts[m]!;
    addStep(s, stepAt(0, site.door, F, 'idle'));
    const go = T.staggerS * m;
    // přivedení a omráčení (přidržení)
    if (role === 'butcher') {
      const spot = stunned ? P(outer - 0.55, a.front + 0.25 * L) : P(outer - 0.45, neck);
      addStep(s, stepAt(go, spot, toAnimal, 'idle'));
      if (stunned) {
        addStep(s, stepAt(fallS - site.blows * T.blowS, spot, toAnimal, 'build'));
        addStep(s, stepAt(fallS, spot, toAnimal, 'idle'));
      } else {
        addStep(s, stepAt(fallS - T.cutS, spot, toAnimal, 'gut'));
      }
    } else if (role === 'bowl') {
      // u ovce a kozy drží zvíře za hlavu žena s miskou (parta 2), u omráčení čeká opodál
      const spot = stunned
        ? P(outer - 1, a.front + L / 2 + 0.7)
        : P(a.side, a.front + L / 2 + 0.45);
      addStep(s, stepAt(go, spot, stunned ? dirTo(spot, animal) : back, 'idle'));
    } else if (role === 'holder') {
      addStep(s, stepAt(go, P(a.side, a.front + L / 2 + 0.45), back, 'idle'));
    } else {
      addStep(s, stepAt(go, P(a.side, a.front - L / 2 - 0.45), F, 'idle'));
    }
    // vykrvení – zvíře leží
    const bleedS = at(BLEED_F);
    if (role === 'butcher') addStep(s, stepAt(bleedS, P(outer - 0.45, neck), toAnimal, 'butcher'));
    else if (role === 'bowl')
      addStep(s, stepAt(bleedS, P(outer - 0.35, neck + 0.6), toAnimal, 'bleed'));
    else if (role === 'holder')
      addStep(s, stepAt(bleedS, P(outer - 0.45, a.front - 0.15 * L), toAnimal, 'weed'));
    else addStep(s, stepAt(bleedS, P(a.side, a.front - L / 2 - 0.4), F, 'weed'));
    // zavěšení: do střihu u zvířete (žena s miskou klečí do střihu), pak u kozliny – kolem
    // její přední strany, ne skrz nohy a necky
    if (role !== 'bowl') addStep(s, { ...s.steps.at(-1)!, at: at(HANG_F), clip: 'idle' });
    const target = role === 'butcher' ? gutSpot : wait(m);
    const via = P(a.side * 0.4, t.front + 1.1);
    addStep(s, stepAt(hoistS, via, dirTo(via, target), 'idle'));
    addStep(
      s,
      stepAt(
        hoistS + Math.hypot(via.x - s.steps.at(-2)!.x, via.z - s.steps.at(-2)!.z) / VIA_M_S,
        target,
        dirTo(target, center),
        'idle',
      ),
    );
    // vyvržení
    if (role === 'butcher') addStep(s, stepAt(at(GUT_F), gutSpot, dirTo(gutSpot, center), 'gut'));
    // rozčtvrcení: řezník seká, nosič nese čtvrtinu na prkno
    for (let k = 0; k < T.quarterSteps; k++) {
      const k0 = q0 + k * qd;
      if (role === 'butcher') {
        // od boku, kde vyvrhoval, jde k prknu předem – aby u první čtvrtiny už sekal
        const lead =
          k === 0 ? Math.hypot(chopSpot.x - gutSpot.x, chopSpot.z - gutSpot.z) / VIA_M_S + 0.3 : 0;
        addStep(s, stepAt(at(k0) - lead, chopSpot, dirTo(chopSpot, center), 'fell'));
      }
      if (m !== runner) {
        if (role === 'butcher')
          addStep(s, stepAt(at(k0 + 0.5 * qd), chopSpot, dirTo(chopSpot, center), 'idle'));
        continue;
      }
      if (role !== 'butcher')
        addStep(s, stepAt(at(k0 + 0.2 * qd), takeSpot, dirTo(takeSpot, center), 'idle'));
      const carryS = at(0.25 * qd);
      addStep(s, {
        ...stepAt(at(k0 + 0.5 * qd), pick(0), back, 'idle', 'carry-meat'),
        walkS: carryS,
      });
      const home = role === 'butcher' ? chopSpot : wait(m);
      addStep(s, {
        ...stepAt(at(k0 + 0.75 * qd), home, dirTo(home, center), 'idle'),
        walkS: carryS,
      });
    }
  });
  // odnos: kýta j – nosič j % n, cesta j / n; stálou rychlostí, uvnitř domu chvíli
  const n = Math.max(1, crew.length);
  const legOffS: number[] = [];
  crew.forEach((_, m) => {
    const s = scripts[m]!;
    const p = pick(m);
    const trip = input.route?.(p, site.door) ?? null;
    const path = makeRoute(
      trip && trip.length >= 2
        ? trip
        : [
            [p.x, p.z],
            [site.door.x, site.door.z],
          ],
    );
    const toDoorS = path.length / T.carryMS;
    const reach = at(CARRY_F) + T.staggerS * m;
    const arrive = reach + Math.hypot(p.x - s.last.x, p.z - s.last.z) / T.carryMS;
    addStep(s, { ...stepAt(reach, p, back, 'idle'), walkS: arrive - reach });
    const legs = QUARTER_BITS.filter((_, j) => j % n === m).length;
    for (let r = 0; r < legs; r++) {
      const depart = arrive + T.pickS + r * (2 * toDoorS + T.insideS + T.pickS);
      legOffS[m + r * n] = depart;
      addStep(s, {
        ...stepAt(depart, site.door, dirTo(p, site.door), 'idle', 'carry-meat'),
        walkS: toDoorS,
        hidden: true,
        route: path,
      });
      if (r < legs - 1) {
        addStep(s, {
          ...stepAt(depart + toDoorS + T.insideS, p, back, 'idle'),
          walkS: toDoorS,
          route: path,
          reverse: true,
        });
      }
    }
  });
  return {
    ...site,
    crew: [...crew],
    members: crew.map((role, m) => ({ role, steps: scripts[m]!.steps })),
    animal,
    hang: { ...center, headingX: back.x, headingZ: back.z, lift: t.hookY - c.hangTop },
    trough: { ...center, headingX: F.x, headingZ: F.z },
    block,
    bowl: hasBowl ? bowlSpot : null,
    times: { fallS, hoistS, bowlS: hoistS, cutS, legOnS, legOffS },
  };
}

/**
 * Plán porážky dne: stanoviště (`slaughterSites`) a parta – `cast` vrátí role, na které se našel
 * člověk (villager-plan-slaughter.ts – lidé vsi); bez něj chtěné role. Stanoviště bez řezníka
 * se vynechá. Bez kusů nic (null).
 */
export function slaughterPlan(
  input: SlaughterInput,
  cast?: (site: SlaughterSite, wanted: readonly SlaughterRole[]) => SlaughterRole[],
): SlaughterPlan | null {
  const stations = slaughterSites(input).flatMap((site) => {
    const wanted = SLAUGHTER_ROLES.slice(0, site.wanted);
    const crew = cast ? cast(site, wanted) : [...wanted];
    return crew[0] === 'butcher' ? [slaughterStation(site, crew, input)] : [];
  });
  return stations.length > 0 ? { day: input.day, window: input.window, stations } : null;
}

// --- okamžik ------------------------------------------------------------------------------

export function createSlaughterState(): SlaughterState {
  return {
    phase: 'bring',
    progress: 0,
    carcass: {
      visible: true,
      pose: 1,
      x: 0,
      z: 0,
      lift: 0,
      headingX: 0,
      headingZ: 1,
      quarters: 4,
      cutMask: 0,
    },
    legsOnBoard: 0,
    bowlOnGround: false,
  };
}

function smooth(u: number): number {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
}

/** Stav stanoviště v okamžiku `nowMs` – zapisuje do `out`, nic nealokuje. */
export function slaughterState(
  plan: SlaughterPlan,
  station: SlaughterStation,
  nowMs: number,
  out: SlaughterState = createSlaughterState(),
): SlaughterState {
  const { s } = slaughterSeconds(plan.window, nowMs);
  const phase = slaughterPhaseAt(plan.window, nowMs);
  out.phase = STUNNED.has(station.species) || phase.phase !== 'stun' ? phase.phase : 'hold';
  out.progress = phase.progress;
  const t = station.times;
  const c = out.carcass;
  let cut = 0;
  let mask = 0;
  t.cutS.forEach((at, k) => {
    if (s >= at) {
      cut++;
      mask |= QUARTER_BITS[k]!;
    }
  });
  c.quarters = QUARTER_BITS.length - cut;
  c.cutMask = mask;
  c.visible = c.quarters > 0;
  // zavěšení: z místa, kde leží, plynule pod háky – zvedne se, otočí a morph leží → visí
  const u = s >= t.hoistS ? smooth((s - t.hoistS) / SLAUGHTER_TIMING.liftS) : 0;
  const { animal, hang } = station;
  c.x = animal.x + (hang.x - animal.x) * u;
  c.z = animal.z + (hang.z - animal.z) * u;
  const from = Math.atan2(animal.headingX, animal.headingZ);
  let turn = Math.atan2(hang.headingX, hang.headingZ) - from;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  const done = u <= 0 ? animal : u >= 1 ? hang : null;
  c.headingX = done ? done.headingX : Math.sin(from + turn * u);
  c.headingZ = done ? done.headingZ : Math.cos(from + turn * u);
  c.lift = hang.lift * u;
  c.pose = s >= t.hoistS ? -u : 1 - smooth((s - t.fallS) / SLAUGHTER_TIMING.fallS);
  const on = t.legOnS.filter((at) => s >= at).length;
  const off = t.legOffS.filter((at) => s >= at).length;
  out.legsOnBoard = Math.max(0, on - off);
  out.bowlOnGround = station.bowl !== null && s >= t.bowlS;
  return out;
}

/**
 * Póza člověka party `member` v okamžiku `nowMs` (`speed` – rychlost chůze postavy, m/s):
 * poslední krok scénáře, který začal; cestou na jeho místo jde (`move`), pak dělá jeho klip.
 * Zapisuje do `out`, nic nealokuje.
 */
export function slaughterPose(
  plan: SlaughterPlan,
  station: SlaughterStation,
  member: number,
  speed: number,
  nowMs: number,
  out: VillagerPose,
): VillagerPose {
  const steps = station.members[member]?.steps ?? [];
  const { s } = slaughterSeconds(plan.window, nowMs);
  let k = 0;
  while (k + 1 < steps.length && steps[k + 1]!.at <= s) k++;
  const step = steps[k];
  out.hidden = false;
  out.pace = 1;
  if (!step) return out;
  const prev = steps[k - 1] ?? step;
  const routed = step.route;
  const length = routed ? routed.length : Math.hypot(step.x - prev.x, step.z - prev.z);
  const walkS = step.walkS ?? length / Math.max(0.1, speed);
  const e = s - step.at;
  if (length > 0.05 && e < walkS) {
    const u = Math.max(0, e / walkS);
    if (routed) {
      const reverse = step.reverse === true;
      alongRoute(routed, (reverse ? 1 - u : u) * routed.length, reverse, out);
    } else {
      out.x = prev.x + (step.x - prev.x) * u;
      out.z = prev.z + (step.z - prev.z) * u;
      out.headingX = (step.x - prev.x) / length;
      out.headingZ = (step.z - prev.z) / length;
    }
    out.clip = step.move;
    out.pace = length / walkS / Math.max(0.1, speed);
    return out;
  }
  out.x = step.x;
  out.z = step.z;
  out.headingX = step.headingX;
  out.headingZ = step.headingZ;
  out.clip = step.clip;
  out.hidden = step.hidden === true;
  return out;
}
