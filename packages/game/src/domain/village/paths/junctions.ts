// Křižovatky (paths.md – Křižovatky; Martin, #6: „Křižovatka: samostatný objekt, který jde
// označit; buď kříž se 4 vchody, nebo Y se 3 vchody; natočená tak, aby cesty co nejlépe navazovaly,
// a cesty vedou přesně do jejích vchodů; kousek bokem stojí náhodně strom, velký vztyčený kámen
// nebo dřevěný kůl, jednou vylosované to zůstane …“). Čisté funkce: tvar a natočení, vchody, ohyb
// konce osy do vchodu, rozdělení uzlu s 5+ cestami a los znamení. Do sítě je zapojí Úloha 9b.
// Deterministická vrstva (jen přesná aritmetika a det-math – soubor hlídá ESLint jako síť pěšin).

import { detAtan2, detCos, detSin, length2 } from '../../landscape';
import { wrapAngle } from '../../landscape/det-math';
import { createRandom, deriveSeed } from '../../landscape/random';
import { JUNCTION } from '../rules-roads';
import type { JunctionLandmarkKind, JunctionShape, RoadPoint, RoadTreeSpecies } from '../types';
import { cm } from './roads-geometry';
import { speciesOf } from './roads-trees';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const DEG = Math.PI / 180;
/** Krok natočení i rozevření Y (rad). */
const STEP = JUNCTION.rotationStepDeg * DEG;
/** Rozdíl součtu čtverců odchylek, který je ještě shoda (rad²) – pak rozhodne menší úhel a β. */
const TIE = 1e-9;

/** Úhel v [0, 2π). */
function normAngle(angle: number): number {
  const a = wrapAngle(angle);
  const b = a < 0 ? a + TWO_PI : a;
  return b >= TWO_PI ? b - TWO_PI : b;
}

/** Posun ramen od natočení: kříž po 90°, Y kmen a dvě větve o β od směru proti kmeni. */
function armOffsets(shape: JunctionShape, spread: number): number[] {
  return shape === 'cross'
    ? [0, HALF_PI, Math.PI, 3 * HALF_PI]
    : [0, Math.PI - spread, Math.PI + spread];
}

/** Směry ramen od středu (rad, [0, 2π)) v pořadí `RoadJunction.arms` – rameno 0 je u Y kmen. */
export function junctionArmDirs(shape: JunctionShape, rotation: number, spread = 0): number[] {
  return armOffsets(shape, spread).map((offset) => normAngle(rotation + offset));
}

/** Vzdálenost vchodů od středu (m): 1,5 × šířka nejširší přicházející cesty. */
export function junctionEntranceM(widths: readonly number[]): number {
  return JUNCTION.entranceWidths * Math.max(0, ...widths);
}

/** Vchody na koncích ramen (m, na cm). */
export function junctionEntrances(
  center: RoadPoint,
  armDirs: readonly number[],
  entranceM: number,
): RoadPoint[] {
  return armDirs.map((dir) => ({
    x: cm(center.x + detCos(dir) * entranceM),
    z: cm(center.z + detSin(dir) * entranceM),
  }));
}

/** Tvar a natočení křižovatky pro přicházející cesty. */
export interface JunctionFit {
  shape: JunctionShape;
  /** Natočení (rad, [0, 2π)) – směr ramene 0. */
  rotation: number;
  /** β (rad) – jen Y. */
  spread?: number;
  /** Rameno pro každou cestu (index do `junctionArmDirs`). */
  assign: number[];
  /** Součet čtverců odchylek ramen od směrů cest (rad²). */
  cost: number;
}

/** Všechna pořadí 0..n−1 (lexikograficky). */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const rest of permutations(n - 1)) {
    for (let at = 0; at <= rest.length; at++)
      out.push([...rest.slice(0, at), n - 1, ...rest.slice(at)]);
  }
  return out.sort((a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return 0;
  });
}

const PERMUTATIONS: Record<number, number[][]> = { 3: permutations(3), 4: permutations(4) };

/** Je kandidát lepší: menší odchylky, při shodě menší natočení, pak menší β. */
function better(cost: number, rotation: number, spread: number, best: JunctionFit | null): boolean {
  if (!best) return true;
  if (cost < best.cost - TIE) return true;
  if (cost > best.cost + TIE) return false;
  if (rotation !== best.rotation) return rotation < best.rotation;
  return spread < (best.spread ?? 0);
}

/**
 * Tvar a natočení (paths.md – Křižovatky): 4 cesty kříž, 3 cesty Y s β 30–60° po 5°. Natočení po 5°
 * s nejmenším součtem čtverců odchylek ramen od směrů cest (`dirs` – od středu k bodu osy
 * `JUNCTION.bendM` daleko) přes všechna přiřazení ramen; při shodě menší natočení a menší β.
 * Pevná cesta (`fixed` – zemská stezka, vozová cesta) se neohýbá: natočení se k ní přizpůsobí, aby
 * její rameno leželo přesně v jejím směru (je-li pevných víc, vyhraje to s nejmenšími odchylkami).
 */
export function fitJunction(dirs: readonly number[], fixed: readonly boolean[] = []): JunctionFit {
  const n = dirs.length;
  const perms = PERMUTATIONS[n];
  if (!perms) throw new Error(`Křižovatka má 3 nebo 4 ramena, ne ${n}.`);
  const shape: JunctionShape = n === 4 ? 'cross' : 'y';
  const [fromDeg, toDeg] = JUNCTION.spreadDeg;
  const spreads: number[] = [];
  if (shape === 'y') {
    for (let d = fromDeg; d <= toDeg; d += JUNCTION.rotationStepDeg) spreads.push(d * DEG);
  } else spreads.push(0);
  // natočení po 5° – kříž se po 90° opakuje, stačí čtvrtina kruhu
  const grid: number[] = [];
  const steps = Math.round((shape === 'cross' ? HALF_PI : TWO_PI) / STEP);
  for (let k = 0; k < steps; k++) grid.push(k * STEP);
  const anchors = dirs.flatMap((_, i) => (fixed[i] ? [i] : []));

  let best: JunctionFit | null = null;
  for (const spread of spreads) {
    const offsets = armOffsets(shape, spread);
    for (const perm of perms) {
      const rotations =
        anchors.length > 0 ? anchors.map((i) => normAngle(dirs[i]! - offsets[perm[i]!]!)) : grid;
      for (const rotation of rotations) {
        let cost = 0;
        for (let i = 0; i < n; i++) {
          const dev = wrapAngle(dirs[i]! - (rotation + offsets[perm[i]!]!));
          cost += dev * dev;
        }
        if (!better(cost, rotation, spread, best)) continue;
        best =
          shape === 'y'
            ? { shape, rotation, spread, assign: [...perm], cost }
            : { shape, rotation, assign: [...perm], cost };
      }
    }
  }
  return best!;
}

/**
 * Konec osy do vchodu (paths.md – Křižovatky): posledních nejvýš `bendM` osy u křižovatky (konec
 * bližší vchodu – první i poslední bod) se nahradí obloukem od bodu `bendM` daleko po ose do vchodu
 * – kubická Bézierova křivka s tečnou ve směru osy na začátku a ve směru ramene (`armDir` – od středu
 * ven) ve vchodu, řídicí body třetinu tětivy daleko. Body oblouku po `JUNCTION.bendStepM`, na cm;
 * pořadí bodů osy zůstane.
 */
export function bendRoadEnd(
  points: readonly RoadPoint[],
  entrance: RoadPoint,
  armDir: number,
  bendM: number = JUNCTION.bendM,
): RoadPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const gap = (a: RoadPoint, b: RoadPoint): number => length2(a.x - b.x, a.z - b.z);
  const atStart = gap(points[0]!, entrance) < gap(points[points.length - 1]!, entrance);
  const line = atStart ? [...points].reverse() : [...points];

  // bod `bendM` od konce po ose a směr osy v něm (ke konci)
  let walked = 0;
  let kept = 0;
  let from = line[0]!;
  let ux = line[1]!.x - line[0]!.x;
  let uz = line[1]!.z - line[0]!.z;
  for (let i = line.length - 1; i > 0; i--) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = gap(a, b);
    if (seg > 0 && walked + seg >= bendM) {
      const t = (bendM - walked) / seg;
      from = { x: cm(b.x + (a.x - b.x) * t), z: cm(b.z + (a.z - b.z) * t) };
      kept = i;
      ux = b.x - a.x;
      uz = b.z - a.z;
      break;
    }
    walked += seg;
  }
  // Bézierova křivka: tečna na začátku ve směru osy, ve vchodu po rameni dovnitř
  const uLen = length2(ux, uz);
  const chord = length2(entrance.x - from.x, entrance.z - from.z);
  const reach = chord / 3;
  const ax = uLen > 0 ? from.x + (ux / uLen) * reach : from.x;
  const az = uLen > 0 ? from.z + (uz / uLen) * reach : from.z;
  const bx = entrance.x + detCos(armDir) * reach;
  const bz = entrance.z + detSin(armDir) * reach;
  const arc =
    (length2(ax - from.x, az - from.z) +
      length2(bx - ax, bz - az) +
      length2(entrance.x - bx, entrance.z - bz) +
      chord) /
    2;
  const count = Math.max(1, Math.ceil(arc / JUNCTION.bendStepM));
  const out: RoadPoint[] = line.slice(0, kept).map((p) => ({ ...p }));
  const push = (p: RoadPoint): void => {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== p.x || prev.z !== p.z) out.push(p);
  };
  push({ x: from.x, z: from.z });
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const r = 1 - t;
    const w0 = r * r * r;
    const w1 = 3 * r * r * t;
    const w2 = 3 * r * t * t;
    const w3 = t * t * t;
    push({
      x: cm(w0 * from.x + w1 * ax + w2 * bx + w3 * entrance.x),
      z: cm(w0 * from.z + w1 * az + w2 * bz + w3 * entrance.z),
    });
  }
  push({ x: cm(entrance.x), z: cm(entrance.z) });
  return atStart ? out.reverse() : out;
}

/** Rozdělení uzlu s 5+ cestami na dvě křižovatky. */
export interface CrowdedSplit {
  /** Středy obou křižovatek (m, na cm) – `pairM` od sebe, spojí je krátká cesta. */
  centers: [RoadPoint, RoadPoint];
  /** Indexy do `dirs` pro každou křižovatku – sousední ramena podle úhlu. */
  groups: [number[], number[]];
}

/**
 * Uzel s 5+ cestami (paths.md – Křižovatky: „víc než 4 cesty se nečekají, kdyby se sešly, vzniknou
 * dvě křižovatky kousek od sebe“): ramena se rozdělí na dvě skupiny sousedních podle úhlu (polovina
 * a zbytek – u pěti 2 + 3) tak, aby mezery na hranicích skupin byly co největší; středy se posunou
 * o polovinu `pairM` ke svým ramenům. Každá skupina plus spojka dá 3–4 ramena. Méně než 5 → null.
 */
export function splitCrowdedNode(
  center: RoadPoint,
  dirs: readonly number[],
  pairM: number = JUNCTION.pairM,
): CrowdedSplit | null {
  const n = dirs.length;
  if (n < 5) return null;
  const angle = dirs.map(normAngle);
  const order = dirs.map((_, i) => i).sort((a, b) => angle[a]! - angle[b]! || a - b);
  const at = (k: number): number => order[((k % n) + n) % n]!;
  const gapAfter = (k: number): number => normAngle(angle[at(k + 1)]! - angle[at(k)]!);
  const half = Math.floor(n / 2);
  const sizes = n % 2 === 0 ? [half] : [half, n - half];

  let best = { start: 0, size: half, gaps: -1 };
  for (let start = 0; start < n; start++) {
    for (const size of sizes) {
      const gaps = gapAfter(start - 1) + gapAfter(start + size - 1);
      if (gaps > best.gaps + TIE) best = { start, size, gaps };
    }
  }
  const first: number[] = [];
  const second: number[] = [];
  for (let k = 0; k < n; k++) (k < best.size ? first : second).push(at(best.start + k));

  // osa mezi středy: od průměrného směru druhé skupiny k průměrnému směru první
  const sum = (group: number[]): [number, number] =>
    group.reduce<[number, number]>(
      ([x, z], i) => [x + detCos(angle[i]!), z + detSin(angle[i]!)],
      [0, 0],
    );
  const [ax, az] = sum(first);
  const [bx, bz] = sum(second);
  const axisLen = length2(ax - bx, az - bz);
  const axis = axisLen > 1e-9 ? detAtan2(az - bz, ax - bx) : angle[first[0]!]!;
  const dx = (detCos(axis) * pairM) / 2;
  const dz = (detSin(axis) * pairM) / 2;
  return {
    centers: [
      { x: cm(center.x + dx), z: cm(center.z + dz) },
      { x: cm(center.x - dx), z: cm(center.z - dz) },
    ],
    groups: [first, second],
  };
}

/** Los znamení – druh, podoba, natočení a u stromu druh stromu. */
export interface LandmarkDraw {
  kind: JunctionLandmarkKind;
  /** Podoba kamene nebo kůlu (1–`JUNCTION.landmarkLooks`). */
  look: number;
  /** Natočení (rad, celé stupně v [0, 2π)). */
  turn: number;
  /** Druh stromu (dub, jilm, topol jako u cest) – jen strom. */
  species?: RoadTreeSpecies;
}

/**
 * Znamení křižovatky ze seedu vsi a id křižovatky (paths.md – Křižovatky): strom 40 %, vztyčený
 * kámen 30 %, dřevěný kůl 30 %; jednou vylosované zůstane – týž seed a id dají vždy totéž.
 */
export function drawLandmark(seed: number, id: number): LandmarkDraw {
  const random = createRandom(deriveSeed(seed, `junction-landmark:${id}`));
  const roll = random.next();
  const { tree, stone } = JUNCTION.landmark;
  const kind: JunctionLandmarkKind = roll < tree ? 'tree' : roll < tree + stone ? 'stone' : 'post';
  const look = 1 + Math.floor(random.next() * JUNCTION.landmarkLooks);
  const turn = Math.floor(random.next() * 360) * DEG;
  const speciesRoll = random.next();
  return kind === 'tree'
    ? { kind, look, turn, species: speciesOf(speciesRoll) }
    : { kind, look, turn };
}

/**
 * Místo znamení: v nejširší mezeře mezi rameny (při shodě první od nejmenšího úhlu), na její ose,
 * `JUNCTION.landmarkGapM` za vzdáleností vchodů od středu (m, na cm).
 */
export function landmarkPlace(
  center: RoadPoint,
  armDirs: readonly number[],
  entranceM: number,
): RoadPoint {
  const sorted = armDirs.map(normAngle).sort((a, b) => a - b);
  let dir = 0;
  let widest = -1;
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i]!;
    const gap = sorted.length === 1 ? TWO_PI : normAngle(sorted[(i + 1) % sorted.length]! - from);
    if (gap > widest + TIE) {
      widest = gap;
      dir = from + gap / 2;
    }
  }
  const r = entranceM + JUNCTION.landmarkGapM;
  return { x: cm(center.x + detCos(dir) * r), z: cm(center.z + detSin(dir) * r) };
}
