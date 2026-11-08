// Opevnění ve scéně bez Babylonu (fortifications.md – Ve scéně): kde stojí kůly palisády a plotu,
// brány, val s příkopem a staveniště po úsecích. Tvar obvodu (úseky – rovná část a oblouk rohu)
// je z jádra (`SceneFortification.shapes`); vše ostatní se odvozuje pevně z id opevnění a indexu
// úseku, takže se při každém kreslení vyjde stejně. Souřadnice světa scény v metrech (x, z).
import { FORTIFICATIONS, segmentRampart, segmentWall, type WallKind } from '@bohemia/game';
import type { SceneFortification, SceneFortSegment } from '../fort-view';
import {
  FORT_SITE_DONE,
  fortSitePhase,
  type FortLayer,
  type FortSitePhase,
} from './village-construction';
import { PEG_SPACING_M } from './staking-layout';
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

/**
 * Palisáda s ochozem ve scéně (fortifications.md – Hradby a obrana, Druhy; rešerše hradeb – ochoz
 * 1,5 m pod špičkami kůlů): vzdálenosti od čáry kůlů dovnitř (m). Fošny ochozu na sloupcích
 * za kůly, pod nimi a za nimi násyp zevnitř až k vnitřnímu okraji pásu 5,5 m, schůdky z násypu
 * na ochoz jednou v úseku (≈ po 15 m). Rozměry dílů z tools/blender/fortifications.py.
 */
export const WALKWAY = {
  /** Vrch fošen nad zemí – 1,5 m pod špičkami kůlů. */
  deckM: STAKE_HEIGHT_M - 1.5,
  /** Osa ochozu za čárou kůlů a jeho šířka (fošny vedle sebe – měřítko dílu napříč). */
  deckInM: 0.65,
  deckWidthM: 0.9,
  /** Fošna `walk-plank`: délka, šířka a tloušťka modelu. */
  plankM: 2,
  plankWidthM: 0.3,
  plankThickM: 0.05,
  /** Sloupek `walk-post` (výška modelu) – na vnitřní hraně ochozu, na spoji fošen. */
  postM: 1.6,
  postInM: 1,
  /** Násyp: výška, koruna od kůlů po `bankCrownToM`, pata na vnitřním okraji pásu 5,5 m. */
  bankM: 1.2,
  bankFromM: 0.12,
  bankCrownToM: 1.75,
  bankFootM: FORTIFICATIONS.bandM.walkway - FORTIFICATIONS.bandM.palisade / 2,
  /** Schůdky `walk-steps`: délka a výška modelu, poloha v úseku (podíl délky – mimo bránu). */
  stepsRunM: 2,
  stepsM: 2,
  stepsAt: 0.25,
} as const;

/**
 * Roštová hradba ve scéně (rešerše hradeb – Roštová: rošt 6 pater po 0,5 m, kamenná plenta vně,
 * stupňovitý týl): vzdálenosti od vnějšího okraje hradby dovnitř (m), pás 7 m.
 */
export const CRIB = {
  heightM: 3,
  /** Kamenná plenta `facing-stone-a/-b`: tloušťka, modul po obvodu a výška modelu. */
  facingM: 0.5,
  facingStepM: 1,
  facingModuleM: 2,
  /** Příčné klády `crib-log` (4 m) na koruně po 2 m – středy napříč. */
  logM: 4,
  logStepM: 2,
  crossAtM: [2.5, 4.6],
  /** Týl: podélná kláda v každém patře, patro o 0,2 m dál dovnitř než nižší. */
  layers: 6,
  layerM: 0.5,
  rearStepM: 0.2,
  /** Hliněné jádro: od plenty po korunu, pak týl k zemi na konci pásu. */
  coreFromM: 0.5,
  coreTopToM: 5.6,
  bandM: FORTIFICATIONS.bandM.crib,
} as const;

/**
 * Komorová hradba ve scéně (rešerše hradeb – Komorová: srubové komory po 5–6 m plněné zeminou
 * a kamenem, kamenná čelní zeď): vzdálenosti od vnějšího okraje hradby dovnitř (m), pás 8 m.
 */
export const CHAMBER = {
  heightM: 4,
  /** Čelní zeď `chamber-face`: tloušťka a modul po obvodu (výška modelu = výška hradby). */
  faceM: 0.8,
  faceStepM: 1,
  /** Komora `chamber-box`: délka po obvodu, hloubka modelu, roztažená napříč přes celý pás. */
  boxM: 5,
  boxDepthM: 3,
  /** Výplň komor (hlína a kámen) – vnitřní líc srubů a výška. */
  fillFromM: 1.5,
  fillToM: 7.3,
  fillM: 3.85,
  bandM: FORTIFICATIONS.bandM.chamber,
} as const;

/** Předprseň `parapet` na koruně roštové a komorové hradby – délka modelu (m). */
const PARAPET_M = 2;

/** Jak daleko po obvodu (v šířkách pásu) se hledá smyčka vnitřního okraje v ostrém ohybu. */
const LOOP_REACH_BANDS = 4;

/** Díl modelu opevnění (models/fortifications/fortifications.glb). */
export type FortPart =
  | 'stake-a'
  | 'stake-b'
  | 'stake-c'
  | 'gate-post'
  | 'gate-beam'
  | 'gate-planks'
  | 'gate-wicker'
  | 'gate-bar'
  | 'walk-plank'
  | 'walk-post'
  | 'walk-steps'
  | 'crib-log'
  | 'facing-stone-a'
  | 'facing-stone-b'
  | 'chamber-box'
  | 'chamber-face'
  | 'parapet';
export const STAKE_PARTS: readonly FortPart[] = ['stake-a', 'stake-b', 'stake-c'];

/**
 * Instance dílu: pata ve světě (výška = terén + `lift`), natočení kolem svislé osy (Babylon:
 * +x → (cos θ, 0, −sin θ)), náklon (kam se vrchol vychýlí na metr výšky), svislé měřítko a barva
 * (násobí barvu materiálu – šednutí dřeva). Vodorovné měřítko dílu podél jeho osy x (`scaleX`)
 * a napříč (`scaleZ`) – fošny ochozu, komory; chybí = 1.
 */
export interface FortInstance {
  part: FortPart;
  x: number;
  z: number;
  lift: number;
  yaw: number;
  lean: readonly [number, number];
  scaleY: number;
  scaleX?: number;
  scaleZ?: number;
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

/** Průsečík úseček ab a cd (bez konců), nebo null. */
function crossing(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): [number, number] | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return [a[0] + rx * t, a[1] + rz * t];
}

/**
 * Vnitřní okraj bez smyček: kde je ohyb ostřejší, než šířka pásu dovolí, posun o šířku pásu se
 * přehne do smyčky – body mezi průsečíkem smyčky se sejdou v něm (vnitřní okraj do rohu –
 * fortifications.md, Obvod). Hledá se jen kus obvodu dopředu (`reach` bodů).
 */
function trimLoops(inner: [number, number][], reach: number): void {
  const n = inner.length;
  if (n < 4) return;
  for (let i = 0; i < n; i++) {
    const a = inner[i]!;
    const b = inner[(i + 1) % n]!;
    for (let k = 2; k <= Math.min(reach, n - 2); k++) {
      const j = (i + k) % n;
      const hit = crossing(a, b, inner[j]!, inner[(j + 1) % n]!);
      if (!hit) continue;
      for (let m = 1; m <= k; m++) inner[(i + m) % n] = hit;
      break;
    }
  }
}

/**
 * Body vnějšího okraje po obvodu – lomená čára křivky (`shape.path`) nejvýš po `step` m
 * (uzavřená čára – poslední bod nenavazuje sám na sebe). Každý bod nese normálu dovnitř (kolmo
 * na tečnu z obou sousedů) a protější bod vnitřního okraje pásu – o šířku pásu po normále; kde je
 * ohyb ostřejší než šířka pásu, sejde se vnitřní okraj do rohu (`trimLoops`).
 */
export function perimeterSamples(fort: FortEdges, step: number): PerimeterSample[] {
  const { shapes } = fort;
  const { starts } = segmentStarts(shapes);
  const band = fortBand(fort).full;
  const raw: { x: number; z: number; s: number; segment: number }[] = [];
  shapes.forEach((shape, k) => {
    const path = shape.path;
    let along = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, az] = path[i]!;
      const [bx, bz] = path[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const count = Math.max(1, Math.ceil(len / step - 1e-9));
      for (let j = 0; j < count; j++) {
        const t = j / count;
        raw.push({
          x: ax + (bx - ax) * t,
          z: az + (bz - az) * t,
          s: starts[k]! + along + len * t,
          segment: k,
        });
      }
      along += len;
    }
  });
  const n = raw.length;
  if (n < 3) return [];
  // znaménko oběhu (shoelace): kladná plocha = proti směru os, dovnitř je vlevo od směru
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = raw[i]!;
    const q = raw[(i + 1) % n]!;
    area += p.x * q.z - q.x * p.z;
  }
  const sign = area > 0 ? 1 : -1;
  const normals = raw.map((_, i): [number, number] => {
    const prev = raw[(i + n - 1) % n]!;
    const next = raw[(i + 1) % n]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    return sign > 0 ? [-dz / len, dx / len] : [dz / len, -dx / len];
  });
  const inner = raw.map((p, i): [number, number] => [
    p.x + normals[i]![0] * band,
    p.z + normals[i]![1] * band,
  ]);
  trimLoops(inner, Math.ceil((LOOP_REACH_BANDS * band) / step));
  return raw.map((p, i) => ({
    x: p.x,
    z: p.z,
    nx: normals[i]![0],
    nz: normals[i]![1],
    s: p.s,
    segment: p.segment,
    ix: inner[i]![0],
    iz: inner[i]![1],
  }));
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

/** Odchylka osy příkopu od úseček prořezu (m) – křivka po ≈ 0,1 m jako dřív oblouky po čtvrtinách. */
const DITCH_SIMPLIFY_M = 0.1;

/** Douglas–Peucker: body otevřené čáry, od kterých se čára odchýlí nejvýš o `tol` m. */
function simplifyLine(pts: readonly [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return [...pts];
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop()!;
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[j]!;
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez);
    let worst = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const [px, pz] = pts[k]!;
      const d =
        len > 1e-9 ? Math.abs((px - ax) * ez - (pz - az) * ex) / len : Math.hypot(px - ax, pz - az);
      if (d > worst) {
        worst = d;
        at = k;
      }
    }
    if (worst > tol && at > 0) {
      keep[at] = true;
      stack.push([i, at], [at, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Směr podél obvodu v bodě `i` vzorků (jednotkový, z obou sousedů). */
function tangentAt(samples: readonly PerimeterSample[], i: number): [number, number] {
  const n = samples.length;
  const a = samples[(i + n - 1) % n]!;
  const b = samples[(i + 1) % n]!;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return [(b.x - a.x) / len, (b.z - a.z) / len];
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

/**
 * Leží bod `s` obvodu v části dílu `segment` s branou, která se zbořila se sousedním úsekem
 * (`demolishedBeforeGate` / `demolishedAfterGate`; demolition.md – Opevnění)? Mezera – nestojí tam
 * plot, palisáda ani val; brána a zbytek dílu stojí.
 */
export function inGoneGatePart(
  fort: Pick<SceneFortification, 'segments' | 'gates'>,
  starts: readonly number[],
  segment: number,
  s: number,
): boolean {
  const seg = fort.segments.find((x) => x.index === segment);
  if (!seg || (seg.demolishedBeforeGate === undefined && seg.demolishedAfterGate === undefined)) {
    return false;
  }
  const gate = fort.gates.find((g) => g.segment === segment);
  if (!gate) return false;
  const center = (starts[segment] ?? 0) + gate.offsetM;
  return (
    (seg.demolishedBeforeGate !== undefined && s < center) ||
    (seg.demolishedAfterGate !== undefined && s > center)
  );
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
  /** Hradba u země (bez valu) – plot, palisáda, s ochozem, roštová, komorová; null – nic. */
  ground: { layer: WallKind; phase: FortSitePhase; age: number } | null;
  /** Rozdělané vylepšení plotu na palisádu – palisáda vedle stojícího plotu. */
  upgrade: { phase: FortSitePhase } | null;
  /** Hradba na koruně valu; null – bez nástavby. */
  top: { layer: WallKind; phase: FortSitePhase; age: number } | null;
  /** Val: podíl hlíny 0–1 (staveniště roste) a stáří; null – úsek není val. */
  rampart: { earth: number; age: number } | null;
  /** Stav úseku 0–1 (chátrání za životností – mezery). */
  state: number;
  breached: boolean;
}

/**
 * Co stojí na úseku `index` (stáří, stavba, vylepšení, nástavba, zboření). Zbořený díl
 * (demolition.md – Opevnění) je mezera – nestojí na něm nic, srovnaný val nemá násep ani příkop.
 * Bouraný díl se rozebírá jako staveniště pozpátku (`fortSitePhase(vrstva, 1 − průběh)`): plot
 * a palisáda u země, na valu nástavba (`demolish`), val sám se srovnává (`level`). Vrstvy dílu
 * z jádra (`segmentWall`, `segmentRampart`) – `top: 'none'` je val bez nástavby.
 */
export function segmentBuild(fort: SceneFortification, index: number): SegmentBuild {
  const segment = fort.segments.find((s) => s.index === index);
  const look: SceneFortSegment = fort.looks[index] ?? { age: null };
  const state = segment?.state ?? 1;
  const breached = segment?.breachedDay !== undefined;
  const progress = look.progress;
  // práce stavby na dílu – na opevnění smí běžet víc staveb (`SceneFortSegment.work`)
  const work = look.work ?? fort.work;
  const layers = segment ?? { builtDay: null };
  const wall = segmentWall(fort, layers);
  const result: SegmentBuild = {
    ground: null,
    upgrade: null,
    top: null,
    rampart: null,
    state,
    breached,
  };
  if (segment?.demolishedDay !== undefined) return result;
  /** Kolik z dílu ještě stojí při zboření `work` (1 − průběh); null – díl se tak nebourá. */
  const left = (kind: 'demolish' | 'level'): number | null =>
    work === kind && progress !== undefined ? 1 - progress : null;
  if (segmentRampart(fort, layers)) {
    const level = left('level');
    const earth =
      look.age !== null ? (level ?? 1) : work === 'build' && progress !== undefined ? progress : 0;
    result.rampart = { earth, age: look.age ?? 0 };
    const top = wall?.kind ?? null;
    if (top && earth >= 1) {
      const down = left('demolish');
      if (look.topAge !== undefined && look.topAge !== null)
        result.top = {
          layer: top,
          phase: down === null ? FORT_SITE_DONE : fortSitePhase(top, down),
          age: look.topAge,
        };
      else if (work === 'top' && progress !== undefined)
        result.top = { layer: top, phase: fortSitePhase(top, progress), age: 0 };
    }
    return result;
  }
  if (!wall) return result;
  const layer = wall.kind;
  const down = left('demolish');
  if (look.age !== null)
    result.ground = {
      layer,
      phase: down === null ? FORT_SITE_DONE : fortSitePhase(layer, down),
      age: look.age,
    };
  else if (work === 'build' && progress !== undefined)
    result.ground = { layer, phase: fortSitePhase(layer, progress), age: 0 };
  if (work === 'upgrade' && layer === 'fence' && progress !== undefined && progress > 0)
    result.upgrade = { phase: fortSitePhase('palisade', progress) };
  return result;
}

/** Barva dřeva podle stáří: čerstvé hnědé (1, 1, 1) → šedé a tmavé ke konci životnosti. */
export function woodTint(age: number, layer: WallKind): [number, number, number] {
  const t = Math.min(1, Math.max(0, age / FORTIFICATIONS.lifeYears[layer]));
  // šednutí: méně červené, víc modré, celkově tmavší
  return [1 - 0.36 * t, 1 - 0.2 * t, 1 + 0.12 * t];
}

/** Náklon ke konci životnosti (na metr výšky) – posledních 30 % let se kůly naklánějí. */
function ageLean(age: number, layer: WallKind): number {
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
  layer: WallKind,
): FortInstance {
  const h = (salt: number): number => hash01(fort.id, k, salt);
  const variant = STAKE_PARTS[Math.floor(h(1) * 3)]!;
  const angle = h(2) * Math.PI * 2;
  const tilt = 0.012 + 0.014 * h(3) + ageLean(age, layer) * (0.4 + 0.6 * h(4));
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
    color: woodTint(age, layer),
  };
}

/** Kus pásu, kde se prolomilo (fortifications.md – Prolomení: průlom 4 m uprostřed úseku). */
function inBreach(u: number, lengthM: number): boolean {
  return Math.abs(u - 0.5) * lengthM < FORTIFICATIONS.breach.widthM / 2;
}

/**
 * Čelo hradby (m od vnějšího okraje): kůly plotu a palisády (i s ochozem) uprostřed jejich pásu,
 * u roštové a komorové střed kamenného čela; na valu čára koruny.
 */
function layerLine(fort: SceneFortification, layer: WallKind): number {
  if (layer === 'crib') return wallBase(fort) + CRIB.facingM / 2;
  if (layer === 'chamber') return wallBase(fort) + CHAMBER.faceM / 2;
  if (fort.kind === 'rampart') return RAMPART_CROWN_M;
  return FORTIFICATIONS.bandM[layer === 'walkway' ? 'palisade' : layer] / 2;
}

/** Hradba s kůly palisády – palisáda a palisáda s ochozem (ochoz je přístavba). */
function staked(layer: WallKind): boolean {
  return layer === 'palisade' || layer === 'walkway';
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
    if (inGoneGatePart(fort, starts, p.segment, p.s)) return;
    const b = builds[p.segment]!;
    const u = along(fort, starts, p);
    let phase: FortSitePhase | null = null;
    let age = 0;
    let layer: WallKind = 'palisade';
    if (b.ground && staked(b.ground.layer)) ({ phase, age, layer } = b.ground);
    else if (b.upgrade) phase = b.upgrade.phase;
    else if (b.top && staked(b.top.layer)) ({ phase, age, layer } = b.top);
    if (!phase) return;
    const next = line[(k + 1) % line.length]!;
    if (u >= phase.posts && u < phase.trench) trench.push([p.x, p.z, next.x, next.z]);
    if (u >= phase.posts) return;
    // za životností řídnou do mezer (stav úseku), průlom vyvrátí kůly uprostřed úseku
    if (hash01(fort.id, k, 9) < (1 - b.state) * 0.92) return;
    const fallen = b.breached && inBreach(u, fort.shapes[p.segment]!.lengthM);
    if (fallen && hash01(fort.id, k, 10) < 0.4) return;
    const lift = fort.kind === 'rampart' ? crown(p.s) : 0;
    stakes.push(stake(fort, p, k, age, lift, fallen, layer));
  });
  return { stakes, trench };
}

/** Hradba druhu `kind` na úseku – u země, nebo na koruně valu; null – úsek ji nemá. */
function wallOf(b: SegmentBuild, kind: WallKind): { phase: FortSitePhase; age: number } | null {
  if (b.ground?.layer === kind) return b.ground;
  if (b.top?.layer === kind) return b.top;
  return null;
}

/** Začátek pásu hradby (m od vnějšího okraje): u země okraj, na valu koruna. */
function wallBase(fort: Pick<SceneFortification, 'kind'>): number {
  return fort.kind === 'rampart' ? RAMPART_CROWN_M : 0;
}

/**
 * Odkud se měří průřez hradby `kind` (m od vnějšího okraje): ochoz od čáry kůlů palisády,
 * roštová a komorová od začátku pásu hradby (na valu od koruny).
 */
export function wallCoreLine(fort: SceneFortification, kind: WallKind): number {
  return kind === 'walkway' ? layerLine(fort, 'walkway') : wallBase(fort);
}

/**
 * Výška zeminy hradby nad patou v hloubce `d` průřezu (`wallCoreLine`) – plná stavba: násyp
 * ochozu (koruna za kůly, svah k vnitřnímu okraji), hliněné jádro roštové hradby (koruna
 * od plenty, týl k zemi), výplň komor komorové hradby. Ostatní druhy nic.
 */
export function wallCoreProfile(kind: WallKind, d: number): number {
  if (kind === 'walkway') {
    if (d < WALKWAY.bankFromM || d >= WALKWAY.bankFootM) return 0;
    if (d <= WALKWAY.bankCrownToM) return WALKWAY.bankM;
    return (WALKWAY.bankM * (WALKWAY.bankFootM - d)) / (WALKWAY.bankFootM - WALKWAY.bankCrownToM);
  }
  if (kind === 'crib') {
    if (d < CRIB.coreFromM || d >= CRIB.bandM) return 0;
    if (d <= CRIB.coreTopToM) return CRIB.heightM;
    return (CRIB.heightM * (CRIB.bandM - d)) / (CRIB.bandM - CRIB.coreTopToM);
  }
  if (kind === 'chamber') return d >= CHAMBER.fillFromM && d <= CHAMBER.fillToM ? CHAMBER.fillM : 0;
  return 0;
}

/** Zemina hradby v místě obvodu (síť `wallCoreMeshData`). */
export interface WallCore {
  kind: 'walkway' | 'crib' | 'chamber';
  /** Odkud se měří průřez (`wallCoreLine`). */
  line: number;
  /** Podíl stavby 0–1 (výška zeminy) a stáří (tráva na násypu). */
  earth: number;
  age: number;
}

/**
 * Zemina hradby v bodě obvodu `s` úseku `segment`: násyp ochozu u země (na valu je násypem val),
 * jádro roštové a výplň komorové hradby; v bráně a ve zbořené části nic.
 */
export function wallCoreAt(
  fort: SceneFortification,
): (p: { s: number; segment: number }) => WallCore | null {
  const { starts, length } = segmentStarts(fort.shapes);
  const gates = gatePositions(fort);
  const builds = fort.shapes.map((s) => segmentBuild(fort, s.index));
  const kinds = ['walkway', 'crib', 'chamber'] as const;
  return (p) => {
    const b = builds[p.segment];
    if (!b) return null;
    const kind = kinds.find((k) => wallOf(b, k) && !(k === 'walkway' && fort.kind === 'rampart'));
    if (!kind) return null;
    if (gates.some((g) => loopDistance(p.s, g, length) < FORT_GATE_M / 2 + 0.5)) return null;
    if (inGoneGatePart(fort, starts, p.segment, p.s)) return null;
    const wall = wallOf(b, kind)!;
    return { kind, line: wallCoreLine(fort, kind), earth: wall.phase.earth, age: wall.age };
  };
}

/** Natočení dílu podél čáry v bodě `k` (osa x dílu po směru čáry). */
function alongYaw(line: readonly LinePoint[], k: number): number {
  const n = line.length;
  const a = line[(k + n - 1) % n]!;
  const b = line[(k + 1) % n]!;
  return Math.atan2(-(b.z - a.z), b.x - a.x);
}

/** Natočení dílu napříč pásem (osa x dílu po normále – příčné klády). */
function acrossYaw(p: LinePoint): number {
  return Math.atan2(-p.nz, p.nx);
}

/**
 * Natočení dílu, jehož osa −z (+Y Blenderu) míří ven z opevnění: schůdky stoupají ke kůlům,
 * předprseň má příčku uvnitř.
 */
function outwardYaw(p: LinePoint): number {
  return Math.atan2(p.nx, p.nz);
}

/** Bod `d` m od čáry dovnitř (po normále bodu čáry). */
function offsetPoint(p: LinePoint, d: number): [number, number] {
  return [p.x + p.nx * d, p.z + p.nz * d];
}

/** Přípravy pro díly hradby po čáře: úseky, brány a zda díl o poloviční délce `half` padne do brány. */
function wallContext(fort: SceneFortification): {
  starts: number[];
  builds: SegmentBuild[];
  blocked: (p: LinePoint, half: number) => boolean;
  u: (p: LinePoint) => number;
  /** Díl chybí – za životností řídne (stav úseku), v průlomu (uprostřed úseku) není. */
  missing: (b: SegmentBuild, p: LinePoint, k: number, salt: number) => boolean;
} {
  const { starts, length } = segmentStarts(fort.shapes);
  const gates = gatePositions(fort);
  const builds = fort.shapes.map((s) => segmentBuild(fort, s.index));
  const u = (p: LinePoint): number => along(fort, starts, p);
  return {
    starts,
    builds,
    u,
    blocked: (p, half) =>
      gates.some((g) => loopDistance(p.s, g, length) < FORT_GATE_M / 2 + half) ||
      inGoneGatePart(fort, starts, p.segment, p.s),
    missing: (b, p, k, salt) =>
      hash01(fort.id, k, salt) < (1 - b.state) * 0.92 ||
      (b.breached && inBreach(u(p), fort.shapes[p.segment]!.lengthM)),
  };
}

/**
 * Palisáda s ochozem (fortifications.md – Hradby a obrana, Druhy; Rozhraní a scéna): kůly kreslí
 * `palisadeLayout`, tady za nimi fošny ochozu po 2 m na sloupcích (vrch 1,5 m pod špičkami kůlů)
 * a schůdky z násypu jednou v úseku (≈ po 15 m). Násyp je síť (`wallCoreMeshData`). Staveniště:
 * fošny přibývají od začátku úseku s násypem (`FortSitePhase.earth`), stáří – šednutí dřeva,
 * za životností a v průlomu fošny chybí. Na valu stojí na koruně – vše se zvedne o korunu.
 */
export function walkwayLayout(fort: SceneFortification, crown: CrownLift): FortInstance[] {
  const ctx = wallContext(fort);
  if (!ctx.builds.some((b) => wallOf(b, 'walkway'))) return [];
  const stakes = layerLine(fort, 'walkway');
  const looks = fort.kind === 'rampart' ? rampartLooks(fort) : null;
  /** Zem pod dílem `rel` m za kůly: koruna valu (svah), jinak násyp ochozu. */
  const ground = (s: number, rel: number, earth: number): number =>
    looks
      ? rampartProfile(stakes + rel, rampartAt(fort, looks, s))
      : wallCoreProfile('walkway', rel) * earth;
  const line = insetLine(fort, stakes + WALKWAY.deckInM, WALKWAY.plankM);
  const out: FortInstance[] = [];
  const stepsDone = new Set<number>();
  line.forEach((p, k) => {
    const b = ctx.builds[p.segment]!;
    const wall = wallOf(b, 'walkway');
    if (!wall || ctx.blocked(p, WALKWAY.plankM / 2)) return;
    const u = ctx.u(p);
    if (u >= wall.phase.earth || ctx.missing(b, p, k, 31)) return;
    const color = woodTint(wall.age, 'walkway');
    const base = { lean: [0, 0] as const, scaleY: 1, color };
    const deck = crown(p.s) + WALKWAY.deckM;
    const yaw = alongYaw(line, k);
    out.push({
      ...base,
      part: 'walk-plank',
      x: p.x,
      z: p.z,
      lift: deck - WALKWAY.plankThickM,
      yaw,
      scaleZ: WALKWAY.deckWidthM / WALKWAY.plankWidthM,
    });
    // sloupek na spoji s další fošnou, na vnitřní hraně ochozu – od zeminy pod ním k fošně
    const next = line[(k + 1) % line.length]!;
    const postIn = WALKWAY.postInM - WALKWAY.deckInM;
    const [jx, jz] = [(p.x + next.x) / 2 + p.nx * postIn, (p.z + next.z) / 2 + p.nz * postIn];
    const postLift = ground(p.s, WALKWAY.postInM, wall.phase.earth);
    out.push({
      ...base,
      part: 'walk-post',
      x: jx,
      z: jz,
      lift: postLift,
      yaw,
      scaleY: Math.max(0.1, (deck - WALKWAY.plankThickM - postLift) / WALKWAY.postM),
    });
    if (stepsDone.has(p.segment) || u < WALKWAY.stepsAt) return;
    // schůdky: pata za ochozem, stoupají ven ke kůlům až k fošnám
    stepsDone.add(p.segment);
    const rel = WALKWAY.deckInM + WALKWAY.deckWidthM / 2 + WALKWAY.stepsRunM;
    const [sx, sz] = offsetPoint(p, rel - WALKWAY.deckInM);
    const stepsLift = ground(p.s, rel, wall.phase.earth);
    out.push({
      ...base,
      part: 'walk-steps',
      x: sx,
      z: sz,
      lift: stepsLift,
      yaw: outwardYaw(p),
      scaleY: Math.max(0.1, (deck - stepsLift) / WALKWAY.stepsM),
    });
  });
  return out;
}

/** Předprseň po koruně hradby `kind` – díly po 2 m `rel` m za čelem, ve výšce koruny. */
function parapets(
  fort: SceneFortification,
  ctx: ReturnType<typeof wallContext>,
  kind: WallKind,
  rel: number,
  height: number,
  crown: CrownLift,
): FortInstance[] {
  const line = insetLine(fort, wallBase(fort) + rel, PARAPET_M);
  const out: FortInstance[] = [];
  line.forEach((p, k) => {
    const b = ctx.builds[p.segment]!;
    const wall = wallOf(b, kind);
    if (!wall || wall.phase !== FORT_SITE_DONE || ctx.blocked(p, PARAPET_M / 2)) return;
    if (ctx.missing(b, p, k, 41)) return;
    out.push({
      part: 'parapet',
      x: p.x,
      z: p.z,
      lift: crown(p.s) + height,
      yaw: outwardYaw(p),
      lean: [0, 0],
      scaleY: 1,
      color: woodTint(wall.age, kind),
    });
  });
  return out;
}

/** Kamenné čelo po 1 m `rel` m od začátku pásu – plenta roštové, čelní zeď komorové hradby. */
function stoneFace(
  fort: SceneFortification,
  ctx: ReturnType<typeof wallContext>,
  kind: 'crib' | 'chamber',
  crown: CrownLift,
): FortInstance[] {
  const crib = kind === 'crib';
  const step = crib ? CRIB.facingStepM : CHAMBER.faceStepM;
  const line = insetLine(fort, layerLine(fort, kind), step);
  const out: FortInstance[] = [];
  line.forEach((p, k) => {
    const b = ctx.builds[p.segment]!;
    const wall = wallOf(b, kind);
    if (!wall || ctx.blocked(p, step / 2)) return;
    const rise = wall.phase.earth;
    if (rise <= 0 || ctx.missing(b, p, k, 51)) return;
    // plenta ani čelní zeď nestárne; výška roste se stavbou
    out.push({
      part: crib
        ? hash01(fort.id, k, 52) < 0.5
          ? 'facing-stone-a'
          : 'facing-stone-b'
        : 'chamber-face',
      x: p.x,
      z: p.z,
      lift: crown(p.s),
      yaw: alongYaw(line, k),
      lean: [0, 0],
      scaleY: crib ? (CRIB.heightM / CRIB.facingModuleM) * rise : rise,
      color: [1, 1, 1],
    });
  });
  return out;
}

/**
 * Roštová hradba (fortifications.md – Hradby a obrana, Druhy; Rozhraní a scéna): kamenná plenta
 * po 1 m na vnější hraně pásu 7 m, na koruně příčné klády roštu po 2 m, stupňovitý týl
 * z podélných klád po patrech a předprseň. Hliněné jádro je síť (`wallCoreMeshData`).
 * Staveniště roste po patrech (`FortSitePhase.earth`), dřevo šedne, plenta nestárne.
 */
export function cribLayout(fort: SceneFortification, crown: CrownLift): FortInstance[] {
  const ctx = wallContext(fort);
  if (!ctx.builds.some((b) => wallOf(b, 'crib'))) return [];
  const base = wallBase(fort);
  const out = stoneFace(fort, ctx, 'crib', crown);
  const line = insetLine(fort, base + CRIB.crossAtM[0], CRIB.logStepM);
  line.forEach((p, k) => {
    const b = ctx.builds[p.segment]!;
    const wall = wallOf(b, 'crib');
    if (!wall || ctx.blocked(p, 1) || ctx.missing(b, p, k, 61)) return;
    const height = CRIB.heightM * wall.phase.earth;
    if (height <= 0) return;
    const common = { lean: [0, 0] as const, scaleY: 1, color: woodTint(wall.age, 'crib') };
    const lift = crown(p.s);
    // příčné klády roštu na koruně – napůl v hlíně
    for (const at of CRIB.crossAtM) {
      const [x, z] = offsetPoint(p, at - CRIB.crossAtM[0]);
      out.push({
        ...common,
        part: 'crib-log',
        x,
        z,
        lift: lift + height - 0.15,
        yaw: acrossYaw(p),
      });
    }
    // týl: podélné klády po 4 m (každý druhý bod), patro po patře o kus dovnitř
    if (k % 2 !== 0) return;
    for (let layer = 0; layer < CRIB.layers; layer++) {
      if ((layer + 1) * CRIB.layerM > height + 1e-9) break;
      const rel = CRIB.bandM - 0.15 - layer * CRIB.rearStepM;
      const [x, z] = offsetPoint(p, rel - CRIB.crossAtM[0]);
      out.push({
        ...common,
        part: 'crib-log',
        x,
        z,
        lift: lift + layer * CRIB.layerM,
        yaw: alongYaw(line, k),
      });
    }
  });
  out.push(...parapets(fort, ctx, 'crib', CRIB.facingM + 0.1, CRIB.heightM, crown));
  return out;
}

/**
 * Komorová hradba (fortifications.md – Hradby a obrana, Druhy; Rozhraní a scéna): srubové komory
 * po 5 m roztažené přes celý pás 8 m, kamenná čelní zeď po 1 m vně a předprseň. Výplň komor je
 * síť (`wallCoreMeshData`). Staveniště: komory od začátku úseku (`FortSitePhase.posts`), pak
 * výplň a čelní zeď rostou (`earth`); dřevo šedne, kámen nestárne.
 */
export function chamberLayout(fort: SceneFortification, crown: CrownLift): FortInstance[] {
  const ctx = wallContext(fort);
  if (!ctx.builds.some((b) => wallOf(b, 'chamber'))) return [];
  const base = wallBase(fort);
  const out = stoneFace(fort, ctx, 'chamber', crown);
  const center = (CHAMBER.faceM + CHAMBER.bandM) / 2;
  const line = insetLine(fort, base + center, CHAMBER.boxM);
  line.forEach((p, k) => {
    const b = ctx.builds[p.segment]!;
    const wall = wallOf(b, 'chamber');
    if (!wall || ctx.blocked(p, CHAMBER.boxM / 2)) return;
    if (ctx.u(p) >= wall.phase.posts || ctx.missing(b, p, k, 71)) return;
    out.push({
      part: 'chamber-box',
      x: p.x,
      z: p.z,
      lift: crown(p.s),
      yaw: alongYaw(line, k),
      lean: [0, 0],
      scaleY: 1,
      scaleZ: (CHAMBER.bandM - CHAMBER.faceM) / CHAMBER.boxDepthM,
      color: woodTint(wall.age, 'chamber'),
    });
  });
  out.push(...parapets(fort, ctx, 'chamber', CHAMBER.faceM + 0.1, CHAMBER.heightM, crown));
  return out;
}

/** Okraje pásu valu pro vytyčení – kousek od vnějšího okraje příkopu a od paty valu (m). */
const RAMPART_STAKING_INSET_M = 0.3;

/** Začala už na bodě `u` (0–1 úseku) práce staveniště – kůly, žlab, patra roštu? */
function siteStarted(phase: FortSitePhase | undefined, u: number): boolean {
  return phase !== undefined && (u < Math.max(phase.posts, phase.trench) || phase.earth > 0);
}

/** Je bod `p` čáry vytyčený (nehotový úsek, na kterém se ještě nepracuje)? */
function markedOut(fort: SceneFortification, b: SegmentBuild, u: number): boolean {
  if (fort.work === 'upgrade')
    return b.ground?.layer === 'fence' && !siteStarted(b.upgrade?.phase, u);
  if (b.rampart) return b.rampart.earth <= 0;
  if (b.ground?.phase === FORT_SITE_DONE) return false;
  return !siteStarted(b.ground?.phase, u);
}

/**
 * Vytyčení rozestavěného opevnění (fortifications.md – Ve scéně; Martin 6. 11. 2026: „Ať je obvod
 * nějak vyznačen, stejně jako u staveb“): kolíky a provázek po celém obvodu nehotových úseků od
 * zadání stavby (0 %) – po čáře, kde bude plot či palisáda (vylepšení – čára palisády vedle
 * stojícího plotu), u valu vnější okraj příkopu a pata valu. Kde už práce začala (kůly, žlab,
 * hlína), vytyčení ustoupí; mezery bran zůstanou volné. Body po `PEG_SPACING_M` (kolík na
 * každém bodu, provázek rovně mezi nimi). Bez stavby nebo s jinou prací (přestavba, nástavba,
 * obnova valu) nic.
 */
export function fortStakingLines(fort: SceneFortification): [number, number][][] {
  const work = fort.work ?? 'build';
  if (!fort.building || (work !== 'build' && work !== 'upgrade')) return [];
  const offsets =
    fort.kind === 'rampart'
      ? [RAMPART_STAKING_INSET_M, RAMPART_BAND_M - RAMPART_STAKING_INSET_M]
      : [layerLine(fort, work === 'upgrade' ? 'palisade' : fort.kind)];
  const { starts, length } = segmentStarts(fort.shapes);
  const gates = gatePositions(fort);
  const builds = fort.shapes.map((s) => segmentBuild(fort, s.index));
  const half = FORT_GATE_M / 2;
  const lines: [number, number][][] = [];
  for (const d of offsets) {
    const line = insetLine(fort, d, PEG_SPACING_M);
    const marks = line.map(
      (p) =>
        !gates.some((g) => loopDistance(p.s, g, length) < half) &&
        !inGoneGatePart(fort, starts, p.segment, p.s) &&
        markedOut(fort, builds[p.segment]!, along(fort, starts, p)),
    );
    // souvislé vytyčené kusy obvodu; kus přes začátek čáry se spojí s posledním
    const runs: [number, number][][] = [];
    let run: [number, number][] | null = null;
    line.forEach((p, k) => {
      if (!marks[k]) {
        run = null;
        return;
      }
      if (!run) {
        run = [];
        runs.push(run);
      }
      run.push([p.x, p.z]);
    });
    if (runs.length > 0 && marks.every(Boolean)) runs[0]!.push(runs[0]![0]!);
    else if (runs.length > 1 && marks[0] && marks[marks.length - 1]) {
      const first = runs.shift()!;
      runs[runs.length - 1]!.push(...first);
    }
    lines.push(...runs.filter((r) => r.length > 1));
  }
  return lines;
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
    if (inGoneGatePart(fort, starts, p.segment, p.s)) {
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
    let at = 0;
    samples.forEach((p, i) => {
      if (loopDistance(p.s, s, length) < loopDistance(samples[at]!.s, s, length)) at = i;
    });
    const sample = samples[at]!;
    const inset = layer === 'rampart' ? RAMPART_CROWN_M : layerLine(fort, layer);
    const [cx, cz] = insetPoint(sample, inset, fortBand(fort));
    // brána je rovná tětiva křivky (fortifications.md – Brány) – směr podél obvodu u brány
    const [tx, tz] = tangentAt(samples, at);
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
    // vyšší stupně mají bránu jako palisáda (klešťová brána a věž – Úloha 18)
    const leafPart: FortPart = layer === 'fence' ? 'gate-wicker' : 'gate-planks';
    for (const side of [-1, 1] as const) {
      const hx = cx + tx * half * side;
      const hz = cz + tz * half * side;
      if (layer !== 'fence')
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
    if (layer !== 'fence')
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
  if (inGoneGatePart(fort, starts, k, s)) return { height: 0, round: 0, grass: 0 };
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
  const samples = perimeterSamples(fort, 0.5);
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
    // zjednodušení čáry (Douglas–Peucker) – úsečka jen tam, kde se křivka odchýlí o víc než
    // DITCH_SIMPLIFY_M, ať se osa příkopu vejde do mezí shaderu
    const kept = simplifyLine(pts, DITCH_SIMPLIFY_M);
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
