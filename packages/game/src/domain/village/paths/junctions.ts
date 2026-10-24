// Křižovatky (paths.md – Křižovatky; Martin, #6: „Křižovatka: samostatný objekt, který jde
// označit; buď kříž se 4 vchody, nebo Y se 3 vchody; natočená tak, aby cesty co nejlépe navazovaly,
// a cesty vedou přesně do jejích vchodů; kousek bokem stojí náhodně strom, velký vztyčený kámen
// nebo dřevěný kůl, jednou vylosované to zůstane …“). Čisté funkce: tvar a natočení, vchody, ohyb
// konce osy do vchodu, rozdělení uzlu s 5+ cestami, rozestup a los znamení; v síti je drží
// `updateJunctions` (měsíční úklid – krok 6).
// Deterministická vrstva (jen přesná aritmetika a det-math – soubor hlídá ESLint jako síť pěšin).

import { detAtan2, detCos, detSin, length2 } from '../../landscape';
import { wrapAngle } from '../../landscape/det-math';
import { createRandom, deriveSeed } from '../../landscape/random';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { JUNCTION, ROAD_TREES } from '../rules-roads';
import type {
  JunctionLandmark,
  JunctionLandmarkKind,
  JunctionShape,
  Road,
  RoadJunction,
  RoadPoint,
  RoadTreeSpecies,
  VillageRoads,
} from '../types';
import { pointFrom, roadLandWidthM } from './road-land';
import { relinkApples } from './roads-overgrow';
import { simplifyPathLine } from './network-lines';
import {
  DAYS_PER_YEAR,
  ROAD_CLEAR_M,
  SIMPLIFY_M,
  axisDistance,
  cm,
  roadLengthM,
} from './roads-geometry';
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

/**
 * Dosah plácku od středu (m): kružnice opsaná obrysu ve scéně (`junction-shape.ts` – rohy ramen ve
 * vchodu ± půl šířky nejširší cesty, vnitřní rohy nejvýš u vchodů).
 */
export function junctionReachM(widths: readonly number[]): number {
  return length2(junctionEntranceM(widths), Math.max(0, ...widths) / 2);
}

/**
 * Nejmenší rozestup středů dvou křižovatek (m; paths.md – Křižovatky, návrh Clauda 24. 10. 2026):
 * dosahy obou plácků a `JUNCTION.spacingReserveM` – plácky se nepřekrývají a mezi nimi zůstane kus
 * cesty. Vyšlapané ≈ 7 m, vozové ≈ 12,1 m. Argumenty jsou šířky cest v ramenech každé křižovatky.
 */
export function junctionSpacingM(a: readonly number[], b: readonly number[]): number {
  return junctionReachM(a) + junctionReachM(b) + JUNCTION.spacingReserveM;
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

/** Klíč místa křižovatky pro los znamení – poloha uzlu zaokrouhlená na metry (mřížka 1 m). */
export function landmarkKey(center: RoadPoint): string {
  return `${Math.round(center.x)},${Math.round(center.z)}`;
}

/**
 * Znamení křižovatky ze seedu vsi a místa křižovatky (`landmarkKey`; paths.md – Křižovatky): strom
 * 40 %, vztyčený kámen 30 %, dřevěný kůl 30 %; jednou vylosované zůstane – týž seed a místo dají
 * vždy totéž, i když křižovatka zanikne a v témže uzlu vznikne znovu.
 */
export function drawLandmark(seed: number, key: string): LandmarkDraw {
  const random = createRandom(deriveSeed(seed, `junction-landmark:${key}`));
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

// --- křižovatky v síti (Úloha 9b) ----------------------------------------------------------------

/** Cesty pro křižovatky: které konce jsou živé a které úseky se neohýbají. */
export interface JunctionRoads {
  /** Živý konec úseku – vede po něm trasa aspoň v udržovacím prahu druhu (`liveRoadEnd`). */
  live: (road: Road, atStart: boolean) => boolean;
  /** Úseky, které se neohýbají: zemská stezka a cesta ve vylepšení (vozová cesta podle druhu). */
  fixed: ReadonlySet<number>;
  /** Kotva (vchod, cíl tras) – uzel v ní se při rozestupu křižovatek nehýbe. */
  anchor?: (p: RoadPoint) => boolean;
}

/** Kolikrát se křižovatka spočítala znovu a kolik konců os se ohnulo – pro měření, hra je nečte. */
export const JUNCTION_RUNS = { refits: 0, bends: 0 };

/** Konec úseku v uzlu. */
interface RoadEnd {
  road: Road;
  atStart: boolean;
}

/** Klíč bodu na cm – jako konce úseků v síti (`endKey`). */
function nodeKey(p: RoadPoint): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/** Osa úseku od uzlu ven (první bod je uzel). */
function fromNode(end: RoadEnd): readonly RoadPoint[] {
  return end.atStart ? end.road.points : [...end.road.points].reverse();
}

/** Směr cesty od středu (paths.md – Křižovatky): k bodu osy `JUNCTION.bendM` daleko. */
function endDir(center: RoadPoint, end: RoadEnd): number {
  const p = pointFrom(fromNode(end), JUNCTION.bendM);
  return detAtan2(p.z - center.z, p.x - center.x);
}

/**
 * Úsek, který se u křižovatky neohýbá: vozová cesta, zemská stezka a cesta ve vylepšení (`fixed`)
 * a úsek kratší než `JUNCTION.bendM` (spojka do branky – ohnul by se celý).
 */
function isFixed(road: Road, net: JunctionRoads): boolean {
  return (
    road.link === true ||
    road.grade === 'wagon' ||
    net.fixed.has(road.id) ||
    roadLengthM(road) < JUNCTION.bendM
  );
}

/**
 * Konec osy do vchodu (mutuje): posledních `JUNCTION.bendM` osy obloukem do vchodu (`bendRoadEnd`)
 * a odtud rovně po rameni do středu – úseky křižovatky tak dál sdílejí bod uzlu (spojení, pahýly
 * a copánky v úklidu beze změny). Konec, který k vchodu nemíří (daleký konec blíž), se nechá.
 */
function bendEnd(end: RoadEnd, center: RoadPoint, entrance: RoadPoint, armDir: number): boolean {
  const line = [...fromNode(end)].reverse();
  const gap = (p: RoadPoint): number => length2(p.x - entrance.x, p.z - entrance.z);
  if (gap(line[0]!) <= gap(line[line.length - 1]!)) return false;
  const arc = bendRoadEnd(line, entrance, armDir);
  // oblouk po 1 m se uloží zjednodušený jako osy cest (SIMPLIFY_M) – body osy zdražují chůzi i vozy
  let same = 0;
  while (
    same < arc.length &&
    same < line.length &&
    arc[same]!.x === line[same]!.x &&
    arc[same]!.z === line[same]!.z
  ) {
    same++;
  }
  const head = Math.max(0, same - 1);
  const bent = [
    ...arc.slice(0, head),
    ...simplifyPathLine(arc.slice(head), [], SIMPLIFY_M).points.map((p) => ({ x: p.x, z: p.z })),
  ];
  bent.push({ x: center.x, z: center.z });
  const before = end.road.points;
  const after = end.atStart ? bent.reverse() : bent;
  if (
    after.length === before.length &&
    after.every((p, i) => p.x === before[i]!.x && p.z === before[i]!.z)
  ) {
    return false;
  }
  end.road.points = after;
  return true;
}

/**
 * Místa na stromy a jabloně do ROAD_CLEAR_M od ohnutých os u křižovatky zmizí (paths.md –
 * Křižovatky); místo se stromem zůstane (strom stojí do smrti). Jen v okolí středu.
 */
function clearAround(roads: VillageRoads, ends: readonly RoadEnd[], center: RoadPoint): void {
  const near = JUNCTION.bendM + ROAD_TREES.offsetM.to + 1;
  const axes = axisDistance(ends.map((e) => e.road.points));
  const blocked = (p: RoadPoint): boolean =>
    length2(p.x - center.x, p.z - center.z) <= near && axes(p.x, p.z) < ROAD_CLEAR_M;
  const occupied = new Set(roads.trees.map((t) => t.spot));
  for (const { road } of ends) {
    road.spots = road.spots.filter((s) => occupied.has(s.id) || !blocked(s));
  }
  const ids = new Set(ends.map((e) => e.road.id));
  if (roads.apples) {
    roads.apples = roads.apples.filter((a) => !ids.has(a.roadId) || !blocked(a));
  }
}

/**
 * Znamení nové křižovatky (`drawLandmark` podle místa uzlu); strom roste jako strom u cesty (keř
 * hned). Stojí-li v okolí strom po zaniklé křižovatce (spot bez cesty a bez křižovatky), převezme
 * se – v témže uzlu nevznikne druhé znamení.
 */
function newLandmark(
  roads: VillageRoads,
  seed: number,
  id: number,
  center: RoadPoint,
  day: number,
  place: RoadPoint,
): JunctionLandmark {
  const key = landmarkKey(center);
  const draw = drawLandmark(seed, key);
  const landmark: JunctionLandmark = {
    kind: draw.kind,
    x: place.x,
    z: place.z,
    turn: draw.turn,
    look: draw.look,
  };
  if (draw.kind === 'tree' && draw.species) {
    const reach = length2(place.x - center.x, place.z - center.z) + JUNCTION.landmarkGapM * 2;
    const roadSpots = new Set(roads.roads.flatMap((r) => r.spots.map((q) => q.id)));
    const live = new Set((roads.junctions ?? []).map((j) => j.id));
    const orphan = roads.trees.find(
      (t) =>
        t.id >= ROAD_TREE_ID_BASE &&
        !roadSpots.has(t.spot) &&
        !live.has(t.spot) &&
        length2(t.x - center.x, t.z - center.z) <= reach,
    );
    if (orphan) {
      orphan.spot = id;
      landmark.x = orphan.x;
      landmark.z = orphan.z;
      landmark.treeId = orphan.id;
      return landmark;
    }
    const life = ROAD_TREES.lifeYears[draw.species];
    const years =
      life.from +
      createRandom(deriveSeed(seed, `junction-tree:${key}`)).next() * (life.to - life.from);
    const treeId = ROAD_TREE_ID_BASE + roads.nextId++;
    roads.trees.push({
      id: treeId,
      spot: id,
      x: place.x,
      z: place.z,
      species: draw.species,
      rootedDay: day,
      diesDay: day + Math.round(years * DAYS_PER_YEAR),
    });
    landmark.treeId = treeId;
  }
  return landmark;
}

/** Úhlová odchylka dvou směrů (rad, 0–π). */
function deviation(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

/**
 * Křižovatka beze změny: tytéž počty ramen, ohnuté konce leží přesně ve vchodech; pevné úseky
 * doplní zbylá ramena podle nejmenší odchylky. Jinak null (spočítá se znovu).
 */
function keptJunction(
  prev: RoadJunction,
  center: RoadPoint,
  live: readonly RoadEnd[],
  net: JunctionRoads,
): RoadJunction | null {
  const dirs = junctionArmDirs(prev.shape, prev.rotation, prev.spread);
  if (dirs.length !== live.length) return null;
  const entranceM = junctionEntranceM(live.map((e) => roadLandWidthM(e.road)));
  const entrances = junctionEntrances(center, dirs, entranceM);
  const arms: (number | null)[] = dirs.map(() => null);
  const loose: RoadEnd[] = [];
  for (const end of live) {
    if (isFixed(end.road, net)) {
      loose.push(end);
      continue;
    }
    const p = fromNode(end)[1]!;
    const k = entrances.findIndex((q, i) => arms[i] === null && q.x === p.x && q.z === p.z);
    if (k < 0) return null;
    arms[k] = end.road.id;
  }
  for (const end of loose) {
    const dir = endDir(center, end);
    let best = -1;
    for (let k = 0; k < dirs.length; k++) {
      if (arms[k] !== null) continue;
      if (best < 0 || deviation(dirs[k]!, dir) < deviation(dirs[best]!, dir) - TIE) best = k;
    }
    arms[best] = end.road.id;
  }
  return { ...prev, arms };
}

/**
 * Nová nebo změněná křižovatka (mutuje osy): tvar a natočení (`fitJunction`), vchody, ohyb konců
 * do vchodů, místa na stromy u nových os; znamení zůstane (kámen a kůl se posunou do nejširší
 * mezery, strom stojí, kde roste), nová dostane id a los.
 */
function fitNode(
  roads: VillageRoads,
  center: RoadPoint,
  live: readonly RoadEnd[],
  net: JunctionRoads,
  prev: RoadJunction | undefined,
  day: number,
  seed: number,
): { junction: RoadJunction; bent: boolean } {
  const fixed = live.map((e) => isFixed(e.road, net));
  const fit = fitJunction(
    live.map((e) => endDir(center, e)),
    fixed,
  );
  const armDirs = junctionArmDirs(fit.shape, fit.rotation, fit.spread);
  const entranceM = junctionEntranceM(live.map((e) => roadLandWidthM(e.road)));
  const entrances = junctionEntrances(center, armDirs, entranceM);
  const arms: (number | null)[] = armDirs.map(() => null);
  let bent = false;
  live.forEach((end, i) => {
    const k = fit.assign[i]!;
    arms[k] = end.road.id;
    if (!fixed[i] && bendEnd(end, center, entrances[k]!, armDirs[k]!)) {
      bent = true;
      JUNCTION_RUNS.bends++;
    }
  });
  if (prev) JUNCTION_RUNS.refits++;
  if (bent) clearAround(roads, live, center);
  const place = landmarkPlace(center, armDirs, entranceM);
  const id = prev?.id ?? roads.nextId++;
  const landmark: JunctionLandmark = prev
    ? prev.landmark.kind === 'tree'
      ? prev.landmark
      : { ...prev.landmark, x: place.x, z: place.z }
    : newLandmark(roads, seed, id, center, day, place);
  return {
    junction: {
      id,
      x: center.x,
      z: center.z,
      shape: fit.shape,
      rotation: fit.rotation,
      ...(fit.spread !== undefined ? { spread: fit.spread } : {}),
      arms,
      landmark,
      bornDay: prev?.bornDay ?? day,
    },
    bent,
  };
}

/** Konce úseků podle uzlů (klíč na cm). */
function nodesOf(roads: VillageRoads): Map<string, RoadEnd[]> {
  const nodes = new Map<string, RoadEnd[]>();
  for (const road of roads.roads) {
    if (road.points.length < 2) continue;
    for (const atStart of [true, false]) {
      const key = nodeKey(atStart ? road.points[0]! : road.points[road.points.length - 1]!);
      const list = nodes.get(key);
      if (list) list.push({ road, atStart });
      else nodes.set(key, [{ road, atStart }]);
    }
  }
  return nodes;
}

/**
 * Uzly s 5+ živými cestami (mutuje): středy se posunou o polovinu `JUNCTION.pairM` (`splitCrowdedNode`),
 * konce každé skupiny se přesunou do svého středu a mezi středy vznikne spojka (`Road.link`).
 * Vrátí, jestli se nějaký uzel rozdělil.
 */
function splitCrowded(
  roads: VillageRoads,
  day: number,
  nodes: Map<string, RoadEnd[]>,
  isLive: (end: RoadEnd) => boolean,
): boolean {
  let done = false;
  for (const ends of nodes.values()) {
    const live = ends.filter(isLive);
    if (live.length < 5) continue;
    const first = live[0]!;
    const at = first.atStart
      ? first.road.points[0]!
      : first.road.points[first.road.points.length - 1]!;
    const center = { x: at.x, z: at.z };
    const parts = splitCrowdedNode(
      center,
      live.map((e) => endDir(center, e)),
    );
    if (!parts) continue;
    parts.groups.forEach((group, g) => {
      const c = parts.centers[g]!;
      for (const i of group) {
        const { road, atStart } = live[i]!;
        road.points[atStart ? 0 : road.points.length - 1] = { x: c.x, z: c.z };
      }
    });
    roads.roads.push({
      id: roads.nextId++,
      points: [{ ...parts.centers[0] }, { ...parts.centers[1] }],
      bornDay: day,
      grade: 'trodden',
      traffic: [],
      spots: [],
      link: true,
    });
    done = true;
  }
  return done;
}

/** Přídavek k rozestupu při odsunutí (m) – středy na cm i po zaokrouhlení nad rozestupem. */
const SPACING_TIE = 0.02;

/** Uzel s 3–4 živými cestami – místo křižovatky. */
interface Hub {
  key: string;
  center: RoadPoint;
  ends: RoadEnd[];
  live: RoadEnd[];
}

/** Bod úseku v uzlu. */
function endPoint(end: RoadEnd): RoadPoint {
  return end.atStart ? end.road.points[0]! : end.road.points[end.road.points.length - 1]!;
}

/** Uzly s 3–4 živými cestami podle klíče (pořadí nezávisí na pořadí úseků). */
function hubsOf(nodes: Map<string, RoadEnd[]>, isLive: (end: RoadEnd) => boolean): Hub[] {
  const hubs: Hub[] = [];
  for (const [key, ends] of nodes) {
    const live = ends.filter(isLive);
    if (live.length < 3 || live.length > 4) continue;
    const at = endPoint(live[0]!);
    hubs.push({ key, center: { x: at.x, z: at.z }, ends, live });
  }
  return hubs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Přesune konce úseků uzlu (kromě `skip`) a jeho křižovatku do bodu `to` (mutuje). */
function moveHub(roads: VillageRoads, hub: Hub, to: RoadPoint, skip?: Road): void {
  for (const { road, atStart } of hub.ends) {
    if (road !== skip) road.points[atStart ? 0 : road.points.length - 1] = { x: to.x, z: to.z };
  }
  const junction = roads.junctions?.find((j) => nodeKey(j) === hub.key);
  if (junction) {
    junction.x = to.x;
    junction.z = to.z;
  }
}

/**
 * Sloučení dvou uzlů do `to` (mutuje): spojka zmizí (jabloně k nejbližší cestě, stromy stojí dál),
 * ostatní konce se přesunou; zůstane starší křižovatka (id, znamení, vznik), druhá zanikne.
 */
function mergeHubs(roads: VillageRoads, a: Hub, b: Hub, link: Road, to: RoadPoint): void {
  const ja = roads.junctions?.find((j) => nodeKey(j) === a.key);
  const jb = roads.junctions?.find((j) => nodeKey(j) === b.key);
  const gone = ja && jb ? (ja.id < jb.id ? jb : ja) : undefined;
  if (gone && roads.junctions) roads.junctions = roads.junctions.filter((j) => j !== gone);
  moveHub(roads, a, to, link);
  moveHub(roads, b, to, link);
  roads.roads.splice(roads.roads.indexOf(link), 1);
  relinkApples(roads, link.id);
}

/**
 * Křižovatky blízko sebe (paths.md – Křižovatky; mutuje): dvojice uzlů s 3–4 živými cestami blíž
 * než `junctionSpacingM` (nejbližší napřed). Spojuje-li je jediný úsek, který se smí ztratit
 * (není pevný – zemská stezka, cesta ve vylepšení), a dohromady mají bez něj nejvýš 4 živé cesty,
 * sloučí se do jednoho uzlu (doprostřed, nebo do kotvy) a spojka zmizí. Jinak se odsunou od sebe
 * po spojnici středů na rozestup (kotva stojí, posune se jen druhý; dvě kotvy zůstanou). Vrátí,
 * jestli se něco změnilo.
 */
function spaceJunctions(
  roads: VillageRoads,
  isLive: (end: RoadEnd) => boolean,
  net: JunctionRoads,
): boolean {
  const widths = (hub: Hub): number[] => hub.live.map((e) => roadLandWidthM(e.road));
  const pinned = (hub: Hub): boolean => net.anchor?.(hub.center) ?? false;
  const stuck = new Set<string>();
  let done = false;
  let nodes = nodesOf(roads);
  for (let guard = nodes.size; guard > 0; guard--) {
    const hubs = hubsOf(nodes, isLive);
    let pair: { a: Hub; b: Hub; d: number; min: number } | null = null;
    for (let i = 0; i < hubs.length; i++) {
      for (let k = i + 1; k < hubs.length; k++) {
        const a = hubs[i]!;
        const b = hubs[k]!;
        const d = length2(b.center.x - a.center.x, b.center.z - a.center.z);
        if (pair && d >= pair.d) continue;
        const min = junctionSpacingM(widths(a), widths(b));
        if (d < min && !stuck.has(`${a.key}|${b.key}`)) pair = { a, b, d, min };
      }
    }
    if (!pair) break;
    const { a, b, d, min } = pair;
    const pinA = pinned(a);
    const pinB = pinned(b);
    const links = a.ends.filter(
      (e) => nodeKey(endPoint({ road: e.road, atStart: !e.atStart })) === b.key,
    );
    const link = links.length === 1 ? links[0]!.road : null;
    const others = (hub: Hub): number => hub.live.filter((e) => e.road !== link).length;
    if (
      link &&
      !net.fixed.has(link.id) &&
      a.live.length - others(a) === 1 &&
      b.live.length - others(b) === 1 &&
      others(a) + others(b) <= 4 &&
      !(pinA && pinB)
    ) {
      const to = pinA
        ? a.center
        : pinB
          ? b.center
          : { x: cm((a.center.x + b.center.x) / 2), z: cm((a.center.z + b.center.z) / 2) };
      mergeHubs(roads, a, b, link, to);
    } else if (pinA && pinB) {
      stuck.add(`${a.key}|${b.key}`);
      continue;
    } else {
      const ux = (b.center.x - a.center.x) / d;
      const uz = (b.center.z - a.center.z) / d;
      const push = min + SPACING_TIE - d;
      const moveA = push * (pinA ? 0 : pinB ? 1 : 0.5);
      const moveB = push - moveA;
      moveHub(roads, a, { x: cm(a.center.x - ux * moveA), z: cm(a.center.z - uz * moveA) });
      moveHub(roads, b, { x: cm(b.center.x + ux * moveB), z: cm(b.center.z + uz * moveB) });
    }
    done = true;
    nodes = nodesOf(roads);
  }
  return done;
}

/**
 * Křižovatky sítě (paths.md – Křižovatky; mutuje – měsíční úklid, krok 6): v uzlu, kde končí 3 nebo
 * 4 živé cesty (`live` – opuštěná ani pahýl se nepočítá), stojí křižovatka – kříž nebo Y natočené
 * k cestám, konce os vedou přesně do vchodů. Beze změny ramen zůstane, jak je; přibude-li nebo
 * ubude-li rameno, tvar a natočení se spočítají znovu a znamení zůstane; klesnou-li živá ramena pod
 * 3, křižovatka zanikne (strom znamení stojí dál jako strom u cesty). Uzel s 5+ živými cestami se
 * nejdřív rozdělí na dva uzly se spojkou (`splitCrowded`). Vrátí, jestli se něco změnilo; beze
 * změny nic, ani nová id. Dvě křižovatky blíž než `junctionSpacingM` se pak sloučí nebo odsunou
 * (`spaceJunctions`).
 */
export function updateJunctions(
  roads: VillageRoads,
  day: number,
  seed: number,
  net: JunctionRoads,
): boolean {
  const isLive = (e: RoadEnd): boolean => e.road.link === true || net.live(e.road, e.atStart);
  let split = false;
  // uzel s 5+ živými cestami se rozdělí; skupina o 4+ ramenech (8+ cest) se dělí dál
  for (let pass = 0; pass < 3; pass++) {
    if (!splitCrowded(roads, day, nodesOf(roads), isLive)) break;
    split = true;
  }
  // křižovatky blízko sebe se sloučí, nebo odsunou (plácky se nepřekrývají)
  if (spaceJunctions(roads, isLive, net)) split = true;
  const nodes = nodesOf(roads);
  const old = new Map((roads.junctions ?? []).map((j) => [nodeKey(j), j]));
  const next: RoadJunction[] = [];
  let changed = split;
  for (const [key, ends] of nodes) {
    if (ends.length < 3) continue;
    const live = ends.filter(isLive);
    if (live.length < 3 || live.length > 4) continue;
    const first = live[0]!;
    const at = first.atStart
      ? first.road.points[0]!
      : first.road.points[first.road.points.length - 1]!;
    const center = { x: at.x, z: at.z };
    const prev = old.get(key);
    old.delete(key);
    const kept = prev ? keptJunction(prev, center, live, net) : null;
    if (kept) {
      if (kept.arms.some((id, k) => id !== prev!.arms[k])) changed = true;
      next.push(kept);
      continue;
    }
    const { junction, bent } = fitNode(roads, center, live, net, prev, day, seed);
    if (bent || !prev || JSON.stringify(junction) !== JSON.stringify(prev)) changed = true;
    next.push(junction);
  }
  if (old.size > 0) changed = true;
  next.sort((a, b) => a.id - b.id);
  if (next.length > 0) roads.junctions = next;
  else delete roads.junctions;
  return changed;
}
