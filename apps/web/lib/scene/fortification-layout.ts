// Opevnění ve scéně bez Babylonu (fortifications.md – Ve scéně): kde stojí kůly palisády a plotu,
// brány, val s příkopem a staveniště po úsecích. Tvar obvodu (úseky – rovná část a oblouk rohu)
// je z jádra (`SceneFortification.shapes`); vše ostatní se odvozuje pevně z id opevnění a indexu
// úseku, takže se při každém kreslení vyjde stejně. Souřadnice světa scény v metrech (x, z).
import { FORTIFICATIONS, type FortTop } from '@bohemia/game';
import type { SceneFortification, SceneFortSegment } from '../fort-view';
import {
  FORT_SITE_DONE,
  fortSitePhase,
  type FortLayer,
  type FortSitePhase,
} from './village-construction';
import { RAIL_WEAVE_M, type FencePost, type FenceRail, type FenceStage } from './woven-fence';

/** Kůlů palisády na metr (fortifications.md – Ve scéně: Ø ≈ 25 cm těsně vedle sebe). */
export const STAKES_PER_M = 4;
/** Výška kůlu palisády nad zemí (m) – model (tools/blender/fortifications.py). */
export const STAKE_HEIGHT_M = 3.5;
/** Výška kůlu brány palisády nad zemí (m) – nese trám. */
export const GATE_POST_HEIGHT_M = 4.2;
/** Šířka brány (m) – z jádra. */
export const FORT_GATE_M = FORTIFICATIONS.gate.widthM;
/** Příkop a násep valu (fortifications.md – Ve scéně): šířky z jádra, výška a hloubka. */
export const RAMPART = {
  ditchM: FORTIFICATIONS.rampartBand.ditchM,
  footM: FORTIFICATIONS.rampartBand.footM,
  heightM: 2,
  ditchDepthM: 1.5,
} as const;
/** Šířka pásu valu – příkop a pata náspu. */
export const RAMPART_BAND_M = RAMPART.ditchM + RAMPART.footM;
/** Koruna valu – osa náspu, kde stojí nástavba. */
export const RAMPART_CROWN_M = RAMPART.ditchM + RAMPART.footM / 2;
/** Osa příkopu. */
export const DITCH_AXIS_M = RAMPART.ditchM / 2;
/** Za kolik let čerstvá hlína valu zaroste trávou (fortifications.md – Ve scéně: 2–3 roky). */
export const RAMPART_GRASS_YEARS = { from: 0.3, full: 2.7 } as const;
/** Pletený plot opevnění – hustota jako polský plot pozemků, brána 4 m. */
export const FORT_FENCE = {
  postStep: 1,
  rails: [0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88],
  gateWidth: FORT_GATE_M,
} as const;

/** Kolik bodů má čtvrtkruh rohu při vzorkování obvodu. */
const ARC_STEPS = 8;

/** Díl modelu opevnění (models/fortifications/fortifications.glb). */
export type FortPart =
  | 'stake-a'
  | 'stake-b'
  | 'stake-c'
  | 'gate-post'
  | 'gate-beam'
  | 'gate-planks'
  | 'gate-wicker'
  | 'gate-bar';
export const STAKE_PARTS: readonly FortPart[] = ['stake-a', 'stake-b', 'stake-c'];

/**
 * Instance dílu: pata ve světě (výška = terén + `lift`), natočení kolem svislé osy (Babylon:
 * +x → (cos θ, 0, −sin θ)), náklon (kam se vrchol vychýlí na metr výšky), svislé měřítko a barva
 * (násobí barvu materiálu – šednutí dřeva).
 */
export interface FortInstance {
  part: FortPart;
  x: number;
  z: number;
  lift: number;
  yaw: number;
  lean: readonly [number, number];
  scaleY: number;
  color: readonly [number, number, number];
}

/**
 * Bod vnějšího okraje: poloha, normála dovnitř, vzdálenost po obvodu, úsek a protější bod
 * vnitřního okraje pásu na stejném průřezu (`insetPoint`).
 */
export interface PerimeterSample {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Vzdálenost po vnějším okraji od začátku prvního úseku (m). */
  s: number;
  segment: number;
  /** Bod vnitřního okraje pásu na průřezu tohoto bodu. */
  ix: number;
  iz: number;
}

/** Opevnění pro průřezy pásu: tvar obvodu, poloměry rohů a druh (šířka pásu). */
export type FortEdges = Pick<SceneFortification, 'shapes' | 'corners' | 'kind'>;

/**
 * Pás pro posun dovnitř: šířka `full` a vnější část `rigid` (příkop valu), která drží pevnou
 * vzdálenost od vnějšího okraje; zbytek pásu vede poměrně až k vnitřnímu okraji.
 */
export interface FortBand {
  rigid: number;
  full: number;
}

/** Bod čáry uvnitř pásu (kůly, koruna valu, osa příkopu) – nese polohu na vnějším okraji `s`. */
export interface LinePoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
  s: number;
  segment: number;
}

type Shape = SceneFortification['shapes'][number];

/** Začátky úseků po obvodu (m) a délka obvodu. */
export function segmentStarts(shapes: readonly Shape[]): { starts: number[]; length: number } {
  const starts: number[] = [];
  let length = 0;
  for (const shape of shapes) {
    starts.push(length);
    length += shape.lengthM;
  }
  return { starts, length };
}

/** Znaménko oběhu obvodu v rovině (x, z): +1 proti směru os, −1 po směru. */
function orientation(shapes: readonly Shape[]): number {
  let area = 0;
  const points = shapes.flatMap((s): [number, number][] => [
    [s.line.x, s.line.z],
    [s.line.x + s.line.dx * s.line.length, s.line.z + s.line.dz * s.line.length],
  ]);
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    area += ax * bz - bx * az;
  }
  return area >= 0 ? 1 : -1;
}

/** Je oblouk vnější (střed leží uvnitř plochy – dovnitř se poloměr zmenšuje)? */
function convexArc(shape: Shape, sign: number): boolean {
  const a = shape.arc;
  if (!a) return false;
  // začátek oblouku a jeho tečna (směr rovné části)
  const px = a.x + a.r * a.ux;
  const pz = a.z + a.r * a.uz;
  const nx = sign > 0 ? -shape.line.dz : shape.line.dz;
  const nz = sign > 0 ? shape.line.dx : -shape.line.dx;
  return (a.x - px) * nx + (a.z - pz) * nz > 0;
}

/**
 * Oblouk rohu u vnitřního okraje pásu (fortifications.md – Obvod): u vnějšího rohu má vnitřní
 * okraj poloměr vnitřního rohu obvodu (u valu 4 m, u palisády 1,5 m, u plotu 0,5 m), nejméně
 * soustředný; jeho střed leží na ose rohu o `shift` dál dovnitř a vnitřní okraj se tak napojí
 * na rovné části `shift` m před obloukem a za ním. U vnitřního rohu (tvar L) je soustředný.
 */
interface InnerCorner {
  shift: number;
  x: number;
  z: number;
  r: number;
}

/** Rovné kusy obvodu – úseky od úseku za obloukem po úsek s obloukem (indexy po obvodu). */
function straightRuns(shapes: readonly Shape[]): number[][] {
  const n = shapes.length;
  const first = shapes.findIndex((_, k) => shapes[(k + n - 1) % n]!.arc);
  if (first < 0) return n > 0 ? [shapes.map((_, k) => k)] : [];
  const runs: number[][] = [];
  let k = first;
  for (let done = 0; done < n;) {
    const run: number[] = [];
    for (let j = k; ; j = (j + 1) % n) {
      run.push(j);
      if (shapes[j]!.arc) break;
    }
    runs.push(run);
    done += run.length;
    k = (run[run.length - 1]! + 1) % n;
  }
  return runs;
}

/** Délka rovného kusu (m). */
function runLength(shapes: readonly Shape[], run: readonly number[]): number {
  return run.reduce((sum, k) => sum + shapes[k]!.line.length, 0);
}

/**
 * Oblouky vnitřního okraje pro rohy úseků (null – úsek bez oblouku). Posun napojení se u kusu
 * kratšího než oba posuny zmenší (val na pruhu širokém jeden čtverec – pás se tam stejně slije).
 */
function innerCorners(fort: FortEdges, sign: number, band: number): (InnerCorner | null)[] {
  const { shapes } = fort;
  const n = shapes.length;
  const shifts = shapes.map((s) =>
    convexArc(s, sign) ? Math.max(0, band + fort.corners.inner - s.arc!.r) : 0,
  );
  for (const run of straightRuns(shapes)) {
    const start = (run[0]! + n - 1) % n;
    const end = run[run.length - 1]!;
    const length = runLength(shapes, run);
    const need = (shapes[start]!.arc ? shifts[start]! : 0) + (shapes[end]!.arc ? shifts[end]! : 0);
    if (need <= length) continue;
    const scale = need > 0 ? length / need : 0;
    shifts[start] = shifts[start]! * scale;
    shifts[end] = shifts[end]! * scale;
  }
  return shapes.map((s, k) => {
    const a = s.arc;
    if (!a) return null;
    const shift = shifts[k]!;
    const convex = convexArc(s, sign);
    return {
      shift,
      x: a.x - shift * (a.ux + a.vx),
      z: a.z - shift * (a.uz + a.vz),
      r: convex ? Math.max(0, a.r - band + shift) : a.r + band,
    };
  });
}

/**
 * Body vnějšího okraje po obvodu: rovné části nejvýš po `step` m, oblouky po osminách čtvrtkruhu
 * (uzavřená čára – poslední bod nenavazuje sám na sebe). Každý bod nese protější bod vnitřního
 * okraje pásu: na rovné části kolmo o šířku pásu, u rohu na oblouku vnitřního okraje – kus
 * vnějšího okraje od napojení před obloukem po napojení za ním se rozloží po celém vnitřním
 * oblouku (průřezy se v rohu rozevřou, nesbíhají se).
 */
export function perimeterSamples(
  fort: FortEdges,
  step: number,
  arcSteps = ARC_STEPS,
): PerimeterSample[] {
  const { shapes } = fort;
  const sign = orientation(shapes);
  const { starts } = segmentStarts(shapes);
  const n = shapes.length;
  const band = fortBand(fort).full;
  const corners = innerCorners(fort, sign, band);
  // poloha úseku na rovném kusu: začátek a délka kusu (m)
  const place = new Map<number, { at: number; length: number; first: number; last: number }>();
  for (const run of straightRuns(shapes)) {
    const length = runLength(shapes, run);
    const first = (run[0]! + n - 1) % n;
    const last = run[run.length - 1]!;
    let at = 0;
    for (const k of run) {
      place.set(k, { at, length, first, last });
      at += shapes[k]!.line.length;
    }
  }
  // bod vnitřního oblouku rohu `k` ve vzdálenosti `zeta` od napojení před obloukem
  const innerAt = (k: number, zeta: number): [number, number] => {
    const c = corners[k]!;
    const a = shapes[k]!.arc!;
    const zone = 2 * c.shift + a.r * (Math.PI / 2);
    const th = zone > 0 ? (Math.min(Math.max(zeta, 0), zone) / zone) * (Math.PI / 2) : 0;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    return [c.x + c.r * (a.ux * cos + a.vx * sin), c.z + c.r * (a.uz * cos + a.vz * sin)];
  };
  const out: PerimeterSample[] = [];
  const normal = (dx: number, dz: number): [number, number] => (sign > 0 ? [-dz, dx] : [dz, -dx]);
  shapes.forEach((shape, k) => {
    const { x, z, dx, dz, length } = shape.line;
    const [nx, nz] = normal(dx, dz);
    const run = place.get(k)!;
    const before = corners[run.first]?.shift ?? 0;
    const after = corners[run.last]?.shift ?? 0;
    const count = Math.max(1, Math.ceil(length / step - 1e-9));
    for (let i = 0; i < count; i++) {
      const t = (i / count) * length;
      const u = run.at + t;
      const px = x + dx * t;
      const pz = z + dz * t;
      let [ix, iz] = [px + nx * band, pz + nz * band];
      if (u < before) {
        const prev = shapes[run.first]!.arc!;
        [ix, iz] = innerAt(run.first, before + prev.r * (Math.PI / 2) + u);
      } else if (u > run.length - after) {
        [ix, iz] = innerAt(run.last, u - (run.length - after));
      }
      out.push({ x: px, z: pz, nx, nz, s: starts[k]! + t, segment: k, ix, iz });
    }
    const a = shape.arc;
    if (!a) return;
    const shift = corners[k]!.shift;
    for (let j = 0; j < arcSteps; j++) {
      const th = (j / arcSteps) * (Math.PI / 2);
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const tx = -a.ux * sin + a.vx * cos;
      const tz = -a.uz * sin + a.vz * cos;
      const [ax, az] = normal(tx, tz);
      const [ix, iz] = innerAt(k, shift + a.r * th);
      out.push({
        x: a.x + a.r * (a.ux * cos + a.vx * sin),
        z: a.z + a.r * (a.uz * cos + a.vz * sin),
        nx: ax,
        nz: az,
        s: starts[k]! + length + a.r * th,
        segment: k,
        ix,
        iz,
      });
    }
  });
  return out;
}

/**
 * Bod průřezu `d` m od vnějšího okraje dovnitř: do `rigid` m (příkop valu, u plotu a palisády
 * celý pás) v pevné vzdálenosti od vnějšího okraje, zbytek pásu poměrně mezi koncem této části
 * a vnitřním okrajem (v rohu valu je násep širší), za pásem dál po normále.
 */
export function insetPoint(p: PerimeterSample, d: number, band: FortBand): [number, number] {
  if (d <= band.rigid) return [p.x + p.nx * d, p.z + p.nz * d];
  if (d >= band.full) return [p.ix + p.nx * (d - band.full), p.iz + p.nz * (d - band.full)];
  const ex = p.x + p.nx * band.rigid;
  const ez = p.z + p.nz * band.rigid;
  const f = (d - band.rigid) / (band.full - band.rigid);
  return [ex + (p.ix - ex) * f, ez + (p.iz - ez) * f];
}

/**
 * Uzavřená čára `d` m uvnitř pásu (`insetPoint`) znovu rozdělená po stejných krocích `step` m
 * (kůly 4 na metr i po obloucích). Body nesou polohu na vnějším okraji (`s`) a úsek – podle nich
 * se ví, kde je brána a jak úsek vypadá.
 */
export function insetLine(fort: FortEdges, d: number, step: number): LinePoint[] {
  const { shapes } = fort;
  const samples = perimeterSamples(fort, Math.min(1, step * 4));
  if (samples.length < 2) return [];
  const { starts, length: total } = segmentStarts(shapes);
  const band = fortBand(fort);
  const pts = samples.map((p) => {
    const [x, z] = insetPoint(p, d, band);
    return { x, z, s: p.s, nx: p.nx, nz: p.nz };
  });
  const cumulative: number[] = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i % pts.length]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cumulative[pts.length]!;
  const count = Math.max(1, Math.round(length / step));
  const out: LinePoint[] = [];
  let i = 0;
  for (let k = 0; k < count; k++) {
    const at = (k / count) * length;
    while (i < pts.length - 1 && cumulative[i + 1]! <= at) i++;
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const span = cumulative[i + 1]! - cumulative[i]!;
    const t = span > 0 ? (at - cumulative[i]!) / span : 0;
    const bs = b.s < a.s ? b.s + total : b.s;
    const s = (a.s + (bs - a.s) * t) % total;
    out.push({
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      nx: a.nx,
      nz: a.nz,
      s,
      segment: segmentAt(starts, s),
    });
  }
  return out;
}

/** Úsek, ve kterém leží bod `s` obvodu. */
export function segmentAt(starts: readonly number[], s: number): number {
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1]! <= s) k++;
  return k;
}

/** Vzdálenost dvou bodů obvodu délky `total` (kratší cestou). */
function loopDistance(a: number, b: number, total: number): number {
  const d = Math.abs(a - b) % total;
  return Math.min(d, total - d);
}

/** Polohy bran po obvodu (m od začátku prvního úseku). */
export function gatePositions(fort: SceneFortification): number[] {
  const { starts } = segmentStarts(fort.shapes);
  return fort.gates.map((g) => (starts[g.segment] ?? 0) + g.offsetM);
}

/** Pevné číslo 0–1 z celých čísel (bez náhody – stejné při každém kreslení). */
export function hash01(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Co na úseku stojí a v jaké fázi: vrstva u země, nástavba na valu, val. */
export interface SegmentBuild {
  /** Plot či palisáda u země (bez valu); null – nic. */
  ground: { layer: 'fence' | 'palisade'; phase: FortSitePhase; age: number } | null;
  /** Rozdělané vylepšení plotu na palisádu – palisáda vedle stojícího plotu. */
  upgrade: { phase: FortSitePhase } | null;
  /** Plot či palisáda na koruně valu; null – bez nástavby. */
  top: { layer: FortTop; phase: FortSitePhase; age: number } | null;
  /** Val: podíl hlíny 0–1 (staveniště roste) a stáří; null – úsek není val. */
  rampart: { earth: number; age: number } | null;
  /** Stav úseku 0–1 (chátrání za životností – mezery). */
  state: number;
  breached: boolean;
}

/** Co stojí na úseku `index` (stáří, stavba, vylepšení, nástavba). */
export function segmentBuild(fort: SceneFortification, index: number): SegmentBuild {
  const segment = fort.segments.find((s) => s.index === index);
  const look: SceneFortSegment = fort.looks[index] ?? { age: null };
  const state = segment?.state ?? 1;
  const breached = segment?.breachedDay !== undefined;
  const progress = look.progress;
  const kind = segment?.kind ?? fort.kind;
  const result: SegmentBuild = {
    ground: null,
    upgrade: null,
    top: null,
    rampart: null,
    state,
    breached,
  };
  if (kind === 'rampart') {
    const earth =
      look.age !== null ? 1 : fort.work === 'build' && progress !== undefined ? progress : 0;
    result.rampart = { earth, age: look.age ?? 0 };
    if (fort.top && earth >= 1) {
      if (look.topAge !== undefined && look.topAge !== null)
        result.top = { layer: fort.top, phase: FORT_SITE_DONE, age: look.topAge };
      else if (fort.work === 'top' && progress !== undefined)
        result.top = { layer: fort.top, phase: fortSitePhase(fort.top, progress), age: 0 };
    }
    return result;
  }
  const layer: 'fence' | 'palisade' = kind;
  if (look.age !== null) result.ground = { layer, phase: FORT_SITE_DONE, age: look.age };
  else if (fort.work === 'build' && progress !== undefined)
    result.ground = { layer, phase: fortSitePhase(layer, progress), age: 0 };
  if (fort.work === 'upgrade' && layer === 'fence' && progress !== undefined && progress > 0)
    result.upgrade = { phase: fortSitePhase('palisade', progress) };
  return result;
}

/** Barva dřeva podle stáří: čerstvé hnědé (1, 1, 1) → šedé a tmavé ke konci životnosti. */
export function woodTint(age: number, layer: 'fence' | 'palisade'): [number, number, number] {
  const t = Math.min(1, Math.max(0, age / FORTIFICATIONS.lifeYears[layer]));
  // šednutí: méně červené, víc modré, celkově tmavší
  return [1 - 0.36 * t, 1 - 0.2 * t, 1 + 0.12 * t];
}

/** Náklon ke konci životnosti (na metr výšky) – posledních 30 % let se kůly naklánějí. */
function ageLean(age: number, layer: 'fence' | 'palisade'): number {
  const t = age / FORTIFICATIONS.lifeYears[layer];
  return t <= 0.7 ? 0 : Math.min(1, (t - 0.7) / 0.3) * 0.12;
}

/** Výška koruny valu nad terénem v bodě `s` (nástavba na valu tam stojí). */
export type CrownLift = (s: number) => number;

/** Úsek, do kterého spadá bod a jeho poloha 0–1 v úseku. */
function along(fort: SceneFortification, starts: readonly number[], p: LinePoint): number {
  const len = fort.shapes[p.segment]?.lengthM ?? 1;
  return len > 0 ? (p.s - starts[p.segment]!) / len : 0;
}

/** Kůl palisády v bodě `p` čáry (výška, náklon, varianta a barva pevně z id a pořadí). */
function stake(
  fort: SceneFortification,
  p: LinePoint,
  k: number,
  age: number,
  lift: number,
  fallen: boolean,
): FortInstance {
  const h = (salt: number): number => hash01(fort.id, k, salt);
  const variant = STAKE_PARTS[Math.floor(h(1) * 3)]!;
  const angle = h(2) * Math.PI * 2;
  const tilt = 0.012 + 0.014 * h(3) + ageLean(age, 'palisade') * (0.4 + 0.6 * h(4));
  let lean: [number, number] = [Math.cos(angle) * tilt, Math.sin(angle) * tilt];
  if (fallen) {
    // vyvrácený kůl leží ven z opevnění (≈ 80°)
    const side = 0.6 * (h(5) - 0.5);
    lean = [(-p.nx + side * p.nz) * 5.5, (-p.nz - side * p.nx) * 5.5];
  }
  return {
    part: variant,
    x: p.x,
    z: p.z,
    lift,
    yaw: h(6) * Math.PI * 2,
    lean,
    scaleY: 0.95 + 0.08 * h(7),
    color: woodTint(age, 'palisade'),
  };
}

/** Kus pásu, kde se prolomilo (fortifications.md – Prolomení: průlom 4 m uprostřed úseku). */
function inBreach(u: number, lengthM: number): boolean {
  return Math.abs(u - 0.5) * lengthM < FORTIFICATIONS.breach.widthM / 2;
}

/** Kde stojí palisáda nebo plot: u země, nebo na koruně valu. */
function layerLine(fort: SceneFortification, layer: 'fence' | 'palisade'): number {
  if (fort.kind === 'rampart') return RAMPART_CROWN_M;
  return FORTIFICATIONS.bandM[layer] / 2;
}

/** Pás pro posun dovnitř (`insetPoint`): u valu drží vzdálenost příkop, jinak celý pás. */
export function fortBand(fort: Pick<SceneFortification, 'kind'>): FortBand {
  return fort.kind === 'rampart'
    ? { rigid: RAMPART.ditchM, full: RAMPART_BAND_M }
    : { rigid: FORTIFICATIONS.bandM[fort.kind], full: FORTIFICATIONS.bandM[fort.kind] };
}

/** Palisáda opevnění, staveniště a průlom – kůly a čáry vykopaného žlabu. */
export interface PalisadeLayout {
  stakes: FortInstance[];
  /** Vykopaný žlab bez kůlů (staveniště) – úsečky čáry palisády. */
  trench: [number, number, number, number][];
}

/**
 * Kůly palisády ≈ 4 na metr po rovných úsecích i obloucích (kromě bran): na úsecích s palisádou
 * u země, s rozdělaným vylepšením a na koruně valu. Staveniště – žlab a kůly od začátku úseku
 * (od brány), stáří – šednutí, náklon a za životností mezery, průlom – vyvrácené kůly.
 */
export function palisadeLayout(fort: SceneFortification, crown: CrownLift): PalisadeLayout {
  const line = insetLine(fort, layerLine(fort, 'palisade'), 1 / STAKES_PER_M);
  const { starts, length } = segmentStarts(fort.shapes);
  const gates = gatePositions(fort);
  const builds = fort.shapes.map((s) => segmentBuild(fort, s.index));
  const stakes: FortInstance[] = [];
  const trench: [number, number, number, number][] = [];
  const gap = FORT_GATE_M / 2 + 0.12;
  line.forEach((p, k) => {
    if (gates.some((g) => loopDistance(p.s, g, length) < gap)) return;
    const b = builds[p.segment]!;
    const u = along(fort, starts, p);
    let phase: FortSitePhase | null = null;
    let age = 0;
    if (b.ground?.layer === 'palisade') ({ phase, age } = b.ground);
    else if (b.upgrade) phase = b.upgrade.phase;
    else if (b.top?.layer === 'palisade') ({ phase, age } = b.top);
    if (!phase) return;
    const next = line[(k + 1) % line.length]!;
    if (u >= phase.posts && u < phase.trench) trench.push([p.x, p.z, next.x, next.z]);
    if (u >= phase.posts) return;
    // za životností řídnou do mezer (stav úseku), průlom vyvrátí kůly uprostřed úseku
    if (hash01(fort.id, k, 9) < (1 - b.state) * 0.92) return;
    const fallen = b.breached && inBreach(u, fort.shapes[p.segment]!.lengthM);
    if (fallen && hash01(fort.id, k, 10) < 0.4) return;
    const lift = fort.kind === 'rampart' ? crown(p.s) : 0;
    stakes.push(stake(fort, p, k, age, lift, fallen));
  });
  return { stakes, trench };
}

/**
 * Polský plot opevnění – tentýž pletený plot jako u pozemků (`FenceStage` pro
 * WovenFenceRenderer): kůly po metru i po obloucích, mezery bran 4 m, větve mezi sousedními
 * kůly. Staveniště po úsecích (kůly, pak větve), za životností kůly nakřivo, pahýly a vypadané
 * větve, průlom bez větví a s vyvrácenými kůly. Na valu stojí plot na koruně (kůl je zvednutý).
 */
export function fortFenceStage(fort: SceneFortification, crown: CrownLift): FenceStage {
  const line = insetLine(fort, layerLine(fort, 'fence'), FORT_FENCE.postStep);
  const { starts, length } = segmentStarts(fort.shapes);
  const gates = gatePositions(fort);
  const builds = fort.shapes.map((s) => segmentBuild(fort, s.index));
  const half = FORT_GATE_M / 2;
  const posts: FencePost[] = [];
  /** Kolik výšek větví smí vést od kůlu dál (podle úseku), –1 = kůl za mezerou brány. */
  const levels: number[] = [];
  const lifts: number[] = [];
  line.forEach((p, k) => {
    const near = gates.map((g) => loopDistance(p.s, g, length));
    if (near.some((d) => d < half)) {
      levels.push(-1);
      return;
    }
    const b = builds[p.segment]!;
    const fence = b.ground?.layer === 'fence' ? b.ground : b.top?.layer === 'fence' ? b.top : null;
    if (!fence) {
      levels.push(-1);
      return;
    }
    const u = along(fort, starts, p);
    if (u >= fence.phase.posts) {
      levels.push(-1);
      return;
    }
    const h = (salt: number): number => hash01(fort.id, k, salt);
    const decay = 1 - b.state;
    const lift = fort.kind === 'rampart' ? crown(p.s) : 0;
    const post: FencePost = {
      x: p.x,
      z: p.z,
      gate: near.some((d) => d < half + FORT_FENCE.postStep),
      outX: -p.nx,
      outZ: -p.nz,
      ...(lift > 0 ? { sink: -lift } : {}),
    };
    const lean = ageLean(fence.age, 'fence') + (decay > 0 ? 0.3 * decay : 0);
    if (lean > 0) {
      const a = h(2) * Math.PI * 2;
      post.lean = { x: Math.cos(a) * lean * h(3), z: Math.sin(a) * lean * h(3) };
    }
    const fallen = b.breached && inBreach(u, fort.shapes[p.segment]!.lengthM);
    if (fallen) post.lean = { x: -p.nx * 4, z: -p.nz * 4 };
    // pahýly za životností (stav úseku)
    if (!fallen && h(4) < (decay - 0.4) * 1.4) post.sink = 0.6 + 0.3 * h(5) - lift;
    posts.push(post);
    lifts.push(lift);
    const railLevels = Math.ceil(FORT_FENCE.rails.length * fence.phase.rails - 1e-9);
    levels.push(fallen || (post.sink !== undefined && post.sink > 0) ? 0 : railLevels);
  });
  // větve mezi sousedními kůly čáry (kolem brány se nevedou)
  const rails: FenceRail[] = [];
  let index = 0;
  const indexOf = new Map<number, number>();
  levels.forEach((l, k) => {
    if (l >= 0) indexOf.set(k, index++);
  });
  for (let k = 0; k < line.length; k++) {
    const j = (k + 1) % line.length;
    const a = indexOf.get(k);
    const b = indexOf.get(j);
    if (a === undefined || b === undefined) continue;
    const count = Math.min(levels[k]!, levels[j]!);
    const pa = posts[a]!;
    const pb = posts[b]!;
    const lift = (lifts[a]! + lifts[b]!) / 2;
    for (let level = 0; level < count; level++) {
      if (hash01(fort.id, k * 16 + level, 11) < (1 - (builds[line[k]!.segment]?.state ?? 1)) * 1.15)
        continue;
      const side = (k + level) % 2 === 0 ? 1 : -1;
      rails.push({
        height: FORT_FENCE.rails[level]! + lift,
        a,
        b,
        ax: pa.x + pa.outX * RAIL_WEAVE_M * side,
        az: pa.z + pa.outZ * RAIL_WEAVE_M * side,
        bx: pb.x - pb.outX * RAIL_WEAVE_M * side,
        bz: pb.z - pb.outZ * RAIL_WEAVE_M * side,
      });
    }
  }
  return { posts, rails };
}

/**
 * Brány opevnění: díly modelu – křídla, kůly a trám, závora. Brána valu stojí v průchodu bez
 * náspu (`RAMPART_PASSAGE`), takže u země i s nástavbou.
 */
export function fortGateInstances(fort: SceneFortification): FortInstance[] {
  const { starts, length } = segmentStarts(fort.shapes);
  const out: FortInstance[] = [];
  const samples = perimeterSamples(fort, 0.5);
  fort.gates.forEach((g, gi) => {
    const shape = fort.shapes[g.segment];
    if (!shape) return;
    const b = segmentBuild(fort, g.segment);
    const layer: FortLayer | null =
      b.ground && b.ground.phase.posts >= 1
        ? b.ground.layer
        : b.top && b.top.phase.posts >= 1
          ? b.top.layer
          : b.rampart && b.rampart.earth >= 1
            ? 'rampart'
            : null;
    if (!layer) return;
    const age = b.ground?.age ?? b.top?.age ?? 0;
    const s = (starts[g.segment]! + g.offsetM) % length;
    const sample = samples.reduce((best, p) =>
      loopDistance(p.s, s, length) < loopDistance(best.s, s, length) ? p : best,
    );
    const inset = layer === 'rampart' ? RAMPART_CROWN_M : layerLine(fort, layer);
    const [cx, cz] = insetPoint(sample, inset, fortBand(fort));
    const tx = shape.line.dx;
    const tz = shape.line.dz;
    const nx = sample.nx;
    const nz = sample.nz;
    const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);
    const tint = layer === 'rampart' ? woodTint(0, 'palisade') : woodTint(age, layer);
    const base = { lift: 0, scaleY: 1, color: tint, lean: [0, 0] as const };
    const open = !fort.gatesClosed;
    const broken = b.breached;
    const h = (salt: number): number => hash01(fort.id, gi, salt);
    if (layer === 'rampart') {
      // závora v průchodu valem: zavřená napříč, otevřená odklopená podél průchodu
      out.push(
        open
          ? {
              ...base,
              part: 'gate-bar',
              x: cx + tx * (FORT_GATE_M / 2 + 0.8),
              z: cz + tz * (FORT_GATE_M / 2 + 0.8),
              yaw: yawOf(nx, nz),
            }
          : { ...base, part: 'gate-bar', x: cx, z: cz, yaw: yawOf(tx, tz) },
      );
      return;
    }
    const half = FORT_GATE_M / 2;
    const leafPart: FortPart = layer === 'palisade' ? 'gate-planks' : 'gate-wicker';
    for (const side of [-1, 1] as const) {
      const hx = cx + tx * half * side;
      const hz = cz + tz * half * side;
      if (layer === 'palisade')
        out.push({
          ...base,
          part: 'gate-post',
          x: hx + tx * 0.18 * side,
          z: hz + tz * 0.18 * side,
          yaw: 0,
        });
      // křídlo míří od závěsu ke středu (zavřené), nebo dovnitř opevnění (otevřené)
      let dir: [number, number] = open ? [nx, nz] : [-tx * side, -tz * side];
      let lean: readonly [number, number] = [0, 0];
      if (broken) {
        // rozsekaná brána: křídla vyvrácená ven a zkřivená
        dir = [
          -tx * side + nx * 0.5 * (h(side + 2) - 0.5),
          -tz * side + nz * 0.5 * (h(side + 2) - 0.5),
        ];
        const fall = side < 0 ? 5 : 0.5 + h(7);
        lean = [-nx * fall, -nz * fall];
      }
      out.push({ ...base, part: leafPart, x: hx, z: hz, yaw: yawOf(dir[0], dir[1]), lean });
    }
    if (layer === 'palisade')
      out.push({
        ...base,
        part: 'gate-beam',
        x: cx,
        z: cz,
        lift: GATE_POST_HEIGHT_M,
        yaw: yawOf(tx, tz),
      });
  });
  return out;
}

/** Val úseku ve scéně: výška náspu a hloubka příkopu 0–1, zaoblení starého valu, tráva 0–1. */
export interface RampartLook {
  height: number;
  round: number;
  grass: number;
}

/** Jak val úseku vypadá: staveniště roste, starý val se snižuje a zaobluje, hlína zarůstá. */
export function rampartLooks(fort: SceneFortification): RampartLook[] {
  const keep = fort.rampartHeight ?? 1;
  return fort.shapes.map((s): RampartLook => {
    const r = segmentBuild(fort, s.index).rampart;
    if (!r) return { height: 0, round: 0, grass: 0 };
    const grass =
      r.earth < 1
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              (r.age - RAMPART_GRASS_YEARS.from) /
                (RAMPART_GRASS_YEARS.full - RAMPART_GRASS_YEARS.from),
            ),
          );
    return { height: r.earth * keep, round: Math.min(1, (1 - keep) * 2), grass };
  });
}

/** Plynulý přechod 0 → 1 mezi `a` a `b`. */
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Průchod valem v bráně (m od středu brány): plná šířka bez náspu, pak náběh. */
export const RAMPART_PASSAGE = { flat: 2.5, ramp: 4.5 } as const;

/**
 * Val v bodě `s` obvodu: vzhled úseků plynule navazuje (přechod 3 m kolem hranice úseků),
 * v bránách je průchod bez náspu a příkopu.
 */
export function rampartAt(
  fort: SceneFortification,
  looks: readonly RampartLook[],
  s: number,
): RampartLook {
  const { starts, length } = segmentStarts(fort.shapes);
  const k = segmentAt(starts, s);
  const here = looks[k] ?? { height: 0, round: 0, grass: 0 };
  const start = starts[k]!;
  const end = start + (fort.shapes[k]?.lengthM ?? 0);
  const blend = 1.5;
  let other: RampartLook | null = null;
  let w = 0;
  if (s - start < blend) {
    other = looks[(k + looks.length - 1) % looks.length] ?? null;
    w = 0.5 * (1 - (s - start) / blend);
  } else if (end - s < blend) {
    other = looks[(k + 1) % looks.length] ?? null;
    w = 0.5 * (1 - (end - s) / blend);
  }
  const mix = (a: number, b: number): number => a + (b - a) * w;
  let height = other ? mix(here.height, other.height) : here.height;
  const round = other ? mix(here.round, other.round) : here.round;
  const grass = other ? mix(here.grass, other.grass) : here.grass;
  for (const g of gatePositions(fort))
    height *= smooth(RAMPART_PASSAGE.flat, RAMPART_PASSAGE.ramp, loopDistance(s, g, length));
  return { height, round, grass };
}

/** Výška náspu nad terénem v hloubce `d` pásu (0 vnější okraj) – kladná násep, záporná příkop. */
export function rampartProfile(d: number, look: Pick<RampartLook, 'height' | 'round'>): number {
  if (look.height <= 0) return 0;
  if (d <= RAMPART.ditchM) {
    // příkop: strmé stěny, rovné dno 1,4 m
    const u = d / RAMPART.ditchM;
    const wall = 0.3;
    const bed = u < wall ? u / wall : u > 1 - wall ? (1 - u) / wall : 1;
    return -RAMPART.ditchDepthM * look.height * smooth(0, 1, bed);
  }
  const u = (d - RAMPART.ditchM) / RAMPART.footM;
  if (u >= 1) return 0;
  // čerstvý násep: lichoběžník s korunou 1,5 m; starý se zaobluje do oblouku
  const crown = 0.125;
  const trapezoid = Math.min(1, Math.max(0, (0.5 - Math.abs(u - 0.5)) / (0.5 - crown)));
  const bell = 0.5 * (1 + Math.cos(Math.PI * 2 * (u - 0.5)));
  const shape = trapezoid + (bell - trapezoid) * look.round;
  return RAMPART.heightM * look.height * shape;
}

/** Výška koruny valu (nástavba) v bodě `s` obvodu. */
export function crownLift(fort: SceneFortification): CrownLift {
  if (fort.kind !== 'rampart') return () => 0;
  const looks = rampartLooks(fort);
  return (s) => rampartProfile(RAMPART_CROWN_M, rampartAt(fort, looks, s));
}

/** Úsečka prořezu příkopu: konce osy příkopu (poloviční šířka je pevná – `DITCH_CUT_HALF_M`). */
export interface DitchCut {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Nejmenší hloubka příkopu, od které se terén prořízne (m). */
const CUT_MIN_DEPTH_M = 0.08;

/**
 * Prořez příkopu (pit-cut.ts): osa příkopu jako úsečky tam, kde je příkop hlubší než pár cm –
 * rovné kusy po čtvercích obvodu sloučené, oblouky po osminách. Konce souvislého kusu se zkrátí
 * o půl šířky příkopu – prořez kolem úsečky je zakulacený a nesmí přesáhnout do průchodu brány.
 */
export function ditchCuts(fort: SceneFortification): DitchCut[] {
  if (fort.kind !== 'rampart') return [];
  const looks = rampartLooks(fort);
  const band = fortBand(fort);
  // oblouky po čtvrtinách – osa příkopu (poloměr ≈ 6 m) se od tětiv odchýlí nejvýš o ≈ 0,1 m
  const samples = perimeterSamples(fort, 0.5, 4);
  const deep = samples.map(
    (p) => -rampartProfile(DITCH_AXIS_M, rampartAt(fort, looks, p.s)) > CUT_MIN_DEPTH_M,
  );
  const points = samples.map((p) => insetPoint(p, DITCH_AXIS_M, band));
  const n = samples.length;
  if (n === 0 || !deep.some(Boolean)) return [];
  const full = deep.every(Boolean);
  // začátek souvislého kusu za mělkým bodem (u celého obvodu kdekoli)
  const first = full ? 0 : deep.findIndex((d, i) => d && !deep[(i + n - 1) % n]);
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const i = (first + k) % n;
    if (deep[i] && !(k === n && !full)) run.push(points[i]!);
    if ((!deep[i] || k === n) && run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  const half = RAMPART.ditchM / 2;
  const out: DitchCut[] = [];
  for (const r of runs) {
    const pts = full ? r : trimEnds(r, half);
    // sloučení bodů na jedné přímce (rovné kusy) – úsečka jen tam, kde se čára láme
    const kept: [number, number][] = [];
    for (const p of pts) {
      if (kept.length >= 2) {
        const a = kept[kept.length - 2]!;
        const b = kept[kept.length - 1]!;
        const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        if (Math.abs(cross) < 1e-3) kept.pop();
      }
      kept.push(p);
    }
    for (let i = 0; i + 1 < kept.length; i++) {
      const [ax, az] = kept[i]!;
      const [bx, bz] = kept[i + 1]!;
      out.push({ ax, az, bx, bz });
    }
  }
  return out;
}

/** Lomená čára zkrácená o `cut` m na obou koncích (kratší než 2 × cut – nic). */
function trimEnds(pts: readonly [number, number][], cut: number): [number, number][] {
  const lengths: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    lengths.push(
      lengths[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]),
    );
  const total = lengths[lengths.length - 1]!;
  if (total <= cut * 2) return [];
  const at = (d: number): [number, number] => {
    let i = 1;
    while (i < pts.length - 1 && lengths[i]! < d) i++;
    const t = (d - lengths[i - 1]!) / Math.max(1e-9, lengths[i]! - lengths[i - 1]!);
    const a = pts[i - 1]!;
    const b = pts[i]!;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out: [number, number][] = [at(cut)];
  for (let i = 0; i < pts.length; i++)
    if (lengths[i]! > cut && lengths[i]! < total - cut) out.push(pts[i]!);
  out.push(at(total - cut));
  return out;
}

/**
 * Kolik úseček příkopu umí shader terénu prořezat najednou (pole uniform – vec4 na úsečku).
 * Čtvercový val 350 m má 4 rovné kusy a 4 × 4 tětivy oblouků (20, každá brána +1), členitý
 * obvod nebo víc opevnění vsi se vejde do 48; navíc se vezmou úsečky nejblíž bodu `focus`.
 */
export const MAX_DITCH_CUTS = 48;
/** Poloviční šířka prořezu příkopu (m) – celý příkop. */
export const DITCH_CUT_HALF_M = RAMPART.ditchM / 2;

/** Úsečky příkopu pro shader: ax, az, bx, bz na úsečku a obdélník všech (minX, minZ, maxX, maxZ). */
export interface PackedDitchCuts {
  data: Float32Array;
  count: number;
  bounds: [number, number, number, number];
}

/** Vzdálenost bodu od úsečky. */
function segmentDistance(c: DitchCut, x: number, z: number): number {
  const abx = c.bx - c.ax;
  const abz = c.bz - c.az;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - c.ax) * abx + (z - c.az) * abz) / len2)) : 0;
  return Math.hypot(x - c.ax - abx * t, z - c.az - abz * t);
}

/**
 * Data prořezu příkopů (pit-cut.ts): nejvýš `MAX_DITCH_CUTS` úseček – když je jich víc, ty nejblíž
 * bodu `focus` (střed záběru).
 */
export function packDitchCuts(
  cuts: readonly DitchCut[],
  focus: { x: number; z: number } | null = null,
): PackedDitchCuts {
  let kept = cuts;
  if (cuts.length > MAX_DITCH_CUTS && focus) {
    kept = [...cuts]
      .map((c) => ({ c, d: segmentDistance(c, focus.x, focus.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_DITCH_CUTS)
      .map((e) => e.c);
  }
  const count = Math.min(kept.length, MAX_DITCH_CUTS);
  const data = new Float32Array(MAX_DITCH_CUTS * 4);
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const c = kept[i]!;
    data.set([c.ax, c.az, c.bx, c.bz], i * 4);
    bounds[0] = Math.min(bounds[0], c.ax - DITCH_CUT_HALF_M, c.bx - DITCH_CUT_HALF_M);
    bounds[1] = Math.min(bounds[1], c.az - DITCH_CUT_HALF_M, c.bz - DITCH_CUT_HALF_M);
    bounds[2] = Math.max(bounds[2], c.ax + DITCH_CUT_HALF_M, c.bx + DITCH_CUT_HALF_M);
    bounds[3] = Math.max(bounds[3], c.az + DITCH_CUT_HALF_M, c.bz + DITCH_CUT_HALF_M);
  }
  if (count === 0) bounds.fill(0);
  return { data, count, bounds };
}

/** Stejný test jako shader prořezu: leží bod v příkopu? */
export function insideDitchCut(packed: PackedDitchCuts, x: number, z: number): boolean {
  for (let i = 0; i < packed.count; i++) {
    const d = packed.data;
    const c = { ax: d[i * 4]!, az: d[i * 4 + 1]!, bx: d[i * 4 + 2]!, bz: d[i * 4 + 3]! };
    if (segmentDistance(c, x, z) < DITCH_CUT_HALF_M) return true;
  }
  return false;
}
