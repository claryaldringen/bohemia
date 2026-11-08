import {
  assaultHours,
  assaultSteps,
  climbTicks,
  crossingLayers,
  wallSpotSegment,
  type AssaultMethod,
  type AssaultStep,
  type FortSegmentShape,
} from '../village/fortification';
import { FORTIFICATIONS } from '../village/rules-fortifications';
import type { WallKind } from '../village/types';
import {
  fortPassages,
  type BattleField,
  type BattleFort,
  type BattleState,
  type Fighter,
} from './battle';
import { nearestForestOf, outward } from './ladders';
import type { MarchGrid, Pos } from './march-grid';
import { dist2 } from './orders';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';
import { occupied } from './wall-defense';

// NPC velitel u hradby (fortifications.md – Obrana bez násobku, NPC velitel; Přechod hradby;
// Prolomení; plán hradeb – Úloha 20): odhadne nejrychlejší postup přes opevnění bojiště – mezera
// a prolomení brány či stěny jako v boji (`fortPassages`), přelézt plot, žebříky jen na
// neobsazeném místě (výroba v nejbližším lese a výstup). Velitel (`npc-commander.ts`) napadne,
// trvá-li postup nejvýš 1 herní den, a vede skupinu k místu postupu kolem hradby (`leadTo`); u
// hradby pak každý muž volí nejrychlejší postup místa sám (boj). Jen odhad – stav ani bojiště
// nemění. Jen det-math.

const D = FORTIFICATIONS.defense;
/** Pata žebříku a místo u plotu stojí metr před čarou hradby (jako v boji). */
const FOOT_M = 1;

/** Nejrychlejší postup přes opevnění bojiště. */
export interface Approach {
  /** Opevnění (pořadí na bojišti) a úsek. */
  fort: number;
  segment: number;
  /** Kam velitel vede skupinu – vně, metr před místem postupu. */
  at: Pos;
  method: AssaultMethod;
  /** Herní hodiny postupu od hradby (bez cesty k ní). */
  hours: number;
}

/** Co odhad čte: bojiště, stav boje, počet mužů, odkud jdou, obránci na nohou, volba místa. */
interface Ctx {
  field: BattleField;
  b: BattleState;
  men: number;
  from: Pos;
  defenders: readonly Fighter[];
  consider: (fort: number, segment: number, at: Pos, method: AssaultMethod, hours: number) => void;
}

/** Herní hodiny chůze `m` metrů tempem boje. */
function walkHours(field: BattleField, m: number): number {
  return (m / WAR.pace.metersPerSecond) * TICKS_PER_SECOND * field.hoursPerTick;
}

/** Herní hodiny jednoho přechodu po žebříku (opřít, vylézt, přetáhnout, slézt). */
function climbHours(field: BattleField, kind: WallKind, leaned: boolean): number {
  const c = climbTicks(kind);
  return ((leaned ? 0 : c.lean) + c.up + c.overLadder + c.down) * field.hoursPerTick;
}

const forestCache = new WeakMap<MarchGrid, WeakMap<readonly FortSegmentShape[], (Pos | null)[]>>();

/** Nejbližší les ke středu každého úseku – jednou na mřížku a tvar opevnění. */
function segmentForests(grid: MarchGrid, bf: BattleFort): (Pos | null)[] {
  let byShapes = forestCache.get(grid);
  if (!byShapes) {
    byShapes = new WeakMap();
    forestCache.set(grid, byShapes);
  }
  let list = byShapes.get(bf.shapes);
  if (!list) {
    list = bf.shapes.map((s) => nearestForestOf(grid, { x: s.mid[0], z: s.mid[1] }));
    byShapes.set(bf.shapes, list);
  }
  return list;
}

/**
 * Vrchol žebříku na úseku nejblíž `from`: na neobsazeném místě (`occupied`) – i půl metru na obě
 * strany, ať velitel nevede k úzké škvíře mezi dvěma obránci 5 m od sebe (stojí metr za čarou;
 * návrh Clauda) –, nejméně 1 m od stojících žebříků a mimo vrata brány – po metru podél úseku;
 * null, když takové místo není.
 */
function freeLadderTop(c: Ctx, bf: BattleFort, fi: number, shape: FortSegmentShape): Pos | null {
  const l = shape.line;
  const gate = bf.fort.gates.find((g) => g.segment === shape.index);
  const gap2 = D.ladderGapM * D.ladderGapM - 1e-9;
  const taken = (c.b.ladders ?? []).filter((x) => x.fort === fi);
  let best: Pos | null = null;
  let bestD = Infinity;
  for (let t = Math.min(0.5, l.length / 2); t <= l.length - 0.5 + 1e-9; t += D.ladderGapM) {
    if (gate && Math.abs(t - gate.offsetM) < FORTIFICATIONS.gate.widthM / 2 + D.ladderGapM) {
      continue;
    }
    const at = (s: number): Pos => ({ x: l.x + l.dx * s, z: l.z + l.dz * s });
    const p = at(t);
    const d = dist2(c.from, p);
    if (d >= bestD) continue;
    if (taken.some((x) => dist2(x.top, p) < gap2)) continue;
    const half = D.ladderGapM / 2;
    if ([t - half, t, t + half].some((s) => occupied(bf, at(s), c.defenders))) continue;
    best = p;
    bestD = d;
  }
  return best;
}

/**
 * Nejrychlejší postup přes opevnění bojiště pro `men` mužů od `from` (fortifications.md – Obrana
 * bez násobku, NPC velitel): mezery, průlomy boje a nejrychlejší místo prolomení každého opevnění
 * jako v boji (`fortPassages` – `wallsOf`, `chooseSpot`: brána a stěna podle `assaultSteps` se
 * `min(4, muži)`, oheň jen s otepi z lesa či dříví vsi), k tomu přelézt plot a žebříky jen na
 * neobsazeném místě (volný žebřík u hradby jen výstup, jinak výroba – 4 h jednoho muže –, cesta
 * do nejbližšího lesa a zpět a výstup). Brány zavřené – zavřou se, než k nim vojsko dojde. Vybere
 * nejmenší součet cesty k místu a postupu (při shodě první v pořadí); `hours` je jen postup. Null
 * – bez mužů nebo bez opevnění.
 */
export function fastestApproach(
  field: BattleField,
  b: BattleState,
  men: number,
  from: Pos,
): Approach | null {
  if (men <= 0) return null;
  const defenders = b.fighters.filter((f) => f.side === 'defend' && f.state === 'fight');
  let best: Approach | null = null;
  let bestKey = Infinity;
  const consider = (
    fort: number,
    segment: number,
    at: Pos,
    method: AssaultMethod,
    hours: number,
  ): void => {
    if (!Number.isFinite(hours)) return;
    const key = hours + walkHours(field, Math.sqrt(dist2(from, at)));
    if (key >= bestKey - 1e-9) return;
    best = { fort, segment, at, method, hours };
    bestKey = key;
  };
  for (const p of fortPassages(field, b, from, men)) {
    // žebřík přes vodní příkop – zasypání, výrobu i výstup počítá odhad žebříků níž
    if (p.method !== 'ladder') consider(p.fort, p.segment, p.at, p.method, p.hours);
  }
  // přelézt plot a žebříky – boj je volí sám u hradby (`startCrossing`), mimo místa prolomení
  const c: Ctx = { field, b, men, from, defenders, consider };
  field.forts.forEach((bf, fi) => {
    const forests = segmentForests(field.grid, bf);
    bf.shapes.forEach((shape, k) => {
      const seg = bf.fort.segments.find((s) => s.index === shape.index);
      if (!seg) return;
      const l = shape.line;
      const layers = crossingLayers(
        bf.fort,
        wallSpotSegment(bf.fort.gates, seg, l.length),
        field.day,
        false,
      );
      const kind = layers.wall?.kind;
      if (!kind) return;
      for (const step of assaultSteps(layers)) {
        if (step.method === 'ladder') ladderSteps(c, bf, fi, shape, step, kind, forests[k] ?? null);
        if (step.method !== 'climb') continue;
        const n = outward(bf, l);
        const t = Math.min(l.length, Math.max(0, (from.x - l.x) * l.dx + (from.z - l.z) * l.dz));
        const at = { x: l.x + l.dx * t + n.x * FOOT_M, z: l.z + l.dz * t + n.z * FOOT_M };
        const hours = assaultHours(step, men, 0) + climbTicks('fence').up * field.hoursPerTick;
        consider(fi, shape.index, at, 'climb', hours);
      }
    });
  });
  return best;
}

/**
 * Žebříky úseku: volný žebřík opevnění na neobsazeném místě (jen výstup), jinak nový na
 * neobsazeném místě nejblíž `from` – výroba (4 h jednoho muže), cesta do lesa a zpět a výstup.
 * Zasypání vodního příkopu dělí muži místa (`assaultHours` bez výroby).
 */
function ladderSteps(
  c: Ctx,
  bf: BattleFort,
  fi: number,
  shape: FortSegmentShape,
  step: AssaultStep,
  kind: WallKind,
  forest: Pos | null,
): void {
  const fill = assaultHours({ ...step, manHours: 0 }, c.men, 0);
  for (const l of c.b.ladders ?? []) {
    if (l.fort !== fi || l.segment !== shape.index || l.climber !== null) continue;
    if (occupied(bf, l.top, c.defenders)) continue;
    c.consider(fi, shape.index, { ...l.foot }, 'ladder', fill + climbHours(c.field, kind, l.up));
  }
  if (!forest) return;
  const top = freeLadderTop(c, bf, fi, shape);
  if (!top) return;
  const n = outward(bf, shape.line);
  const foot = { x: top.x + n.x * FOOT_M, z: top.z + n.z * FOOT_M };
  const hours =
    step.manHours +
    fill +
    walkHours(c.field, 2 * Math.sqrt(dist2(foot, forest))) +
    climbHours(c.field, kind, false);
  c.consider(fi, shape.index, foot, 'ladder', hours);
}

// --- Cesta k místu postupu kolem opevnění ---------------------------------------------------------

/** Kruh kolem opevnění, po kterém velitel obchází hradbu: o tolik metrů dál než nejvzdálenější roh. */
const RING_MARGIN_M = 5;

/** Čára obvodu – úsek i tětiva rohu (jako stěny boje; mezery a brány se neobcházejí, blokuje vše). */
interface RingLine {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

const ringCache = new WeakMap<readonly FortSegmentShape[], { lines: RingLine[]; radius: number }>();

/** Čáry obvodu a poloměr obchůzky opevnění – jednou na tvar. */
function ringOf(bf: BattleFort): { lines: RingLine[]; radius: number } {
  let ring = ringCache.get(bf.shapes);
  if (ring) return ring;
  const lines: RingLine[] = [];
  let far = 0;
  bf.shapes.forEach((shape, k) => {
    const l = shape.line;
    const end = { x: l.x + l.dx * l.length, z: l.z + l.dz * l.length };
    lines.push({ ax: l.x, az: l.z, bx: end.x, bz: end.z });
    const next = bf.shapes[(k + 1) % bf.shapes.length];
    if (shape.arc && next) lines.push({ ax: end.x, az: end.z, bx: next.line.x, bz: next.line.z });
    far = Math.max(far, dist2({ x: l.x, z: l.z }, bf.center), dist2(end, bf.center));
  });
  ring = { lines, radius: Math.sqrt(far) + RING_MARGIN_M };
  ringCache.set(bf.shapes, ring);
  return ring;
}

function orient(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

/** Protne úsečka p–q některou čáru obvodu? */
function crossesRing(lines: readonly RingLine[], p: Pos, q: Pos): boolean {
  return lines.some((l) => {
    const d1 = orient(l.ax, l.az, l.bx, l.bz, p.x, p.z);
    const d2 = orient(l.ax, l.az, l.bx, l.bz, q.x, q.z);
    const d3 = orient(p.x, p.z, q.x, q.z, l.ax, l.az);
    const d4 = orient(p.x, p.z, q.x, q.z, l.bx, l.bz);
    return d1 * d2 < 0 && d3 * d4 < 0;
  });
}

/**
 * Kam má velitel jít, aby došel k místu `to` vně opevnění (boj kolem hradby neobchází – jen
 * klouže podél stěny): vede-li přímá cesta přes obvod, napřed od hradby ven na kruh obchůzky
 * (o 5 m dál než nejvzdálenější roh), pak po kruhu – k nejvzdálenějšímu bodu směrem k místu,
 * kam vidí bez hradby (půlením) –, a k místu, až na něj vidí. Jinak rovnou `to`.
 */
export function leadTo(field: BattleField, from: Pos, to: Pos): Pos {
  for (const bf of field.forts) {
    if (bf.shapes.length === 0) continue;
    const { lines, radius } = ringOf(bf);
    if (!crossesRing(lines, from, to)) continue;
    const c = bf.center;
    const push = (p: Pos): Pos => {
      const d = Math.sqrt(dist2(p, c));
      if (d < 1e-9) return { ...p };
      return { x: c.x + ((p.x - c.x) * radius) / d, z: c.z + ((p.z - c.z) * radius) / d };
    };
    if (dist2(from, c) < (radius - 1) * (radius - 1)) return push(from);
    let p = push(to);
    for (let i = 0; i < 16 && crossesRing(lines, from, p); i++) {
      p = push({ x: (from.x + p.x) / 2, z: (from.z + p.z) / 2 });
    }
    return p;
  }
  return { ...to };
}

/** Velitel jde k místu postupu přes bod o tolik metrů dál od hradby (ne podél ní). */
const STAGE_M = 4;

/**
 * Další bod cesty velitele k místu postupu `way`: napřed k bodu 4 m dál od středu opevnění než
 * místo (ať nejde těsně podél hradby a nestojí na její čáře), kolem hradby `leadTo`; od něj
 * rovnou k místu.
 */
export function approachStep(field: BattleField, from: Pos, way: Approach): Pos {
  if (dist2(from, way.at) <= (STAGE_M + 1) * (STAGE_M + 1)) return { ...way.at };
  const c = field.forts[way.fort]?.center ?? way.at;
  const d = Math.sqrt(dist2(way.at, c));
  const stage =
    d < 1e-9
      ? { ...way.at }
      : {
          x: way.at.x + ((way.at.x - c.x) / d) * STAGE_M,
          z: way.at.z + ((way.at.z - c.z) / d) * STAGE_M,
        };
  return leadTo(field, from, stage);
}
