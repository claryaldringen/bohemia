import type { Random } from '../landscape/random';
import {
  assaultSteps,
  climbTicks,
  crossingLayers,
  wallSpotSegment,
  fatigueFactor,
  rampartFatigue,
  type AssaultMethod,
  type FortSegmentShape,
} from '../village/fortification';
import { FORTIFICATIONS } from '../village/rules-fortifications';
import type { WallKind } from '../village/types';
import type { BattleField, BattleFort, BattleState, Fighter } from './battle';
import type { GroupAssault } from './campaign-types';
import {
  MARCH_FOREST,
  MARCH_RAMPART,
  MARCH_WALL,
  marchCellAt,
  marchCellCenter,
  type MarchGrid,
  type Pos,
} from './march-grid';
import { dist2, inFight } from './orders';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';

// Přechod hradby v boji (fortifications.md – Obrana bez násobku 1, 4, 5; Přechod hradby; Martin
// 8. 11. 2026): plot se přeleze, na palisádu a hradbu se leze po žebříku vyrobeném v lese. Na
// žebříku je jeden lezec, žebříky nejméně 1 m od sebe; volný žebřík vezme kdokoli. Lezec je
// znevýhodněný (Martin „A“) – bojuje na půl síly, každá rána obránce na něj padne a obránce smí
// místo rány žebřík shodit. Nahoru se dostane jen na neobsazeném místě nebo přes sraženého obránce.
// Po příkopu a valu je muž unavený. Postup volí skupině hráč rozkazem (Martin „ano“), jinak – i NPC –
// nejrychlejší. Bitva (`battle.ts`) jen volá; stav je JSON a los ze seedu taktu. Jen det-math.

const A = FORTIFICATIONS.assault;
const D = FORTIFICATIONS.defense;

/** Fáze přechodu: vyrobit žebřík v lese, donést k hradbě, opřít, vylézt, přetáhnout druhý, slézt. */
export type ClimbPhase = 'make' | 'carry' | 'lean' | 'up' | 'over' | 'down';

/** Muž, který přechází hradbu (stav `climb`). */
export interface FighterClimb {
  /** Žebřík (`BattleLadder.key`); null – žebřík teprve vyrábí, nebo přelézá plot. */
  ladder: string | null;
  phase: ClimbPhase;
  /** Zbývající takty fáze (`make` – až v lese; `up` na nule = nahoře). */
  ticks: number;
  /** Opevnění (pořadí na bojišti) a úsek, přes který leze. */
  fort: number;
  segment: number;
  /** Kam jde: les (`make`), pata žebříku nebo místo u plotu (`carry`). */
  at: Pos | null;
  /**
   * Přes vodní příkop: vrchol žebříku nejvýš 2 m od tohoto bodu čáry hradby (zasypaný kus –
   * `ClimbWorld.moatFilled`); jinak chybí.
   */
  near?: Pos;
}

/** Žebřík u hradby. */
export interface BattleLadder {
  key: string;
  fort: number;
  segment: number;
  /** Pata vně, vrchol na hradbě. */
  foot: Pos;
  top: Pos;
  /** Pata druhého žebříku uvnitř palisády bez ochozu – po přetažení; jinak null. */
  inner: Pos | null;
  /** Kdo ho drží (nese, opírá, leze); null = volný. */
  climber: string | null;
  /** Opřený (jinak leží u paty). */
  up: boolean;
}

/** Prolamující a lezec pracuje, když stojí do tolika metrů od místa. */
const AT_M = 1.5;
/** Pata žebříku a bod za hradbou – metry od čáry hradby. */
const FOOT_M = 1;
/** Obránce bojuje s lezcem a shazuje žebřík do 2,5 m od vrcholu (polovina 5 m obsazení). */
const REACH_M = D.perDefenderM / 2;
/** Žebřík přes zasypaný kus vodního příkopu – nejvýš půl šířky průlomu od jeho středu. */
const FILL_M = FORTIFICATIONS.breach.widthM / 2;

/** Lezec je na žebříku (vylézá, přetahuje, slézá po vnitřním žebříku) – ne na zemi. */
export function onLadder(f: Fighter, b: Pick<BattleState, 'ladders'>): boolean {
  const c = f.climb;
  if (f.state !== 'climb' || !c) return false;
  if (c.phase === 'up' || c.phase === 'over') return true;
  if (c.phase !== 'down' || c.ladder === null) return false;
  return (b.ladders ?? []).some((l) => l.key === c.ladder && l.inner !== null);
}

/** Síla v boji: `strength × únava × (lezec 0,5)` (fortifications.md – Obrana bez násobku 4, 5). */
export function fighterStrength(f: Fighter, b: Pick<BattleState, 'ladders' | 'ticks'>): number {
  const tired = f.fatigue ? fatigueFactor(f.fatigue.factor, b.ticks - f.fatigue.tick) : 1;
  return f.strength * tired * (onLadder(f, b) ? D.climberStrength : 1);
}

/** Únava se vrátila – záznam pryč (JSON zůstane malý). */
export function restFatigue(f: Fighter, tick: number): void {
  if (f.fatigue && tick - f.fatigue.tick >= A.fatigueTicks) delete f.fatigue;
}

/** Výška valu z tempa buňky mřížky (`rampartPace` obráceně). */
function rampartHeightOfPace(pace: number): number {
  return pace > 0 ? Math.min(1, Math.max(0, (1 / pace - 1) / A.rampartSlowdown)) : 1;
}

/**
 * Muž sešel z příkopu a valu (z buňky valu na jinou) – je unavený podle výšky valu. Val pod
 * stojící hradbou (buňka stěny) unaví jen útočníka – obránce chodí po svém valu.
 */
export function rampartFatigueStep(f: Fighter, from: Pos, grid: MarchGrid, tick: number): void {
  const c0 = marchCellAt(grid, from);
  if ((grid.flags[c0]! & MARCH_RAMPART) === 0) return;
  if ((grid.flags[c0]! & MARCH_WALL) !== 0 && f.side !== 'attack') return;
  const c1 = marchCellAt(grid, f.pos);
  if ((grid.flags[c1]! & MARCH_RAMPART) !== 0) return;
  f.fatigue = { factor: rampartFatigue(rampartHeightOfPace(grid.pace[c0]!)), tick };
}

/** Vnější normála čáry úseku (od středu opevnění ven). */
export function outward(bf: BattleFort, line: FortSegmentShape['line']): Pos {
  const mx = line.x + (line.dx * line.length) / 2;
  const mz = line.z + (line.dz * line.length) / 2;
  let nx = line.dz;
  let nz = -line.dx;
  if ((mx - bf.center.x) * nx + (mz - bf.center.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: nx, z: nz };
}

function shift(p: Pos, n: Pos, m: number): Pos {
  return { x: p.x + n.x * m, z: p.z + n.z * m };
}

/** Bod na čáře úseku nejblíž `from` (nejméně půl metru od konců). */
function project(line: FortSegmentShape['line'], from: Pos): number {
  const t = (from.x - line.x) * line.dx + (from.z - line.z) * line.dz;
  const lo = Math.min(0.5, line.length / 2);
  return Math.min(line.length - lo, Math.max(lo, t));
}

/**
 * Vrchol žebříku na úseku `segment` nejblíž `from`, nejméně 1 m od ostatních žebříků opevnění –
 * po metru na obě strany, nejvýš `maxOffM` od `from`; null, když se na úsek už nevejde.
 */
export function ladderSpot(
  bf: BattleFort,
  segment: number,
  from: Pos,
  taken: readonly BattleLadder[],
  maxOffM = Infinity,
): Pos | null {
  const shape = bf.shapes.find((s) => s.index === segment);
  if (!shape) return null;
  const l = shape.line;
  const t0 = project(l, from);
  const gap2 = D.ladderGapM * D.ladderGapM - 1e-9;
  for (let k = 0; k <= l.length && k * D.ladderGapM <= maxOffM + 1e-9; k++) {
    for (const t of k === 0 ? [t0] : [t0 - k * D.ladderGapM, t0 + k * D.ladderGapM]) {
      if (t < 0 || t > l.length) continue;
      const p = { x: l.x + l.dx * t, z: l.z + l.dz * t };
      if (taken.every((x) => dist2(x.top, p) >= gap2)) return p;
    }
  }
  return null;
}

/**
 * Obránce shodí žebřík: s lezcem na žebříku 1 : 3, prázdný 1 : 2 (fortifications.md – Obrana
 * bez násobku 4). Jen los – stav mění `defendLadder`.
 */
export function pushLadder(withClimber: boolean, rng: Random): boolean {
  return rng.next() < (withClimber ? D.push.withClimber : D.push.empty);
}

const forestCache = new WeakMap<MarchGrid, Pos[]>();

/** Nejbližší střed buňky lesa (stejně jako `nearestForest`), středy lesa jednou na mřížku. */
export function nearestForestOf(grid: MarchGrid, from: Pos): Pos | null {
  let centers = forestCache.get(grid);
  if (!centers) {
    centers = [];
    for (let c = 0; c < grid.flags.length; c++) {
      if ((grid.flags[c]! & MARCH_FOREST) !== 0) centers.push(marchCellCenter(grid, c));
    }
    forestCache.set(grid, centers);
  }
  let best: Pos | null = null;
  let bestD = Infinity;
  for (const p of centers) {
    const d = dist2(p, from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Druh hradby úseku, který jde přelézt (plot) nebo vylézt po žebříku; postupy místa a zda přechod
 * čeká na zasypání vodního příkopu (`moat`); jinak null.
 */
function wallKindOf(
  bf: BattleFort,
  segment: number,
  day: number,
): {
  kind: WallKind;
  rampart: number | null;
  climb: boolean;
  ladder: boolean;
  moat: boolean;
  methods: AssaultMethod[];
} | null {
  const whole = bf.fort.segments.find((s) => s.index === segment);
  if (!whole) return null;
  // díl s branou – hradba kusu u místa prolomení (`wallSpotSegment`)
  const length = bf.shapes.find((s) => s.index === segment)?.line.length ?? 0;
  const seg = wallSpotSegment(bf.fort.gates, whole, length);
  const layers = crossingLayers(bf.fort, seg, day, false);
  if (!layers.wall) return null;
  const steps = assaultSteps(layers);
  return {
    kind: layers.wall.kind,
    rampart: layers.rampart?.height ?? null,
    climb: steps.some((s) => s.method === 'climb'),
    ladder: steps.some((s) => s.method === 'ladder'),
    moat: steps.some((s) => s.fill === 'moat'),
    methods: steps.map((s) => s.method),
  };
}

/** Takty jednoho přechodu po žebříku (opřít, vylézt, přetáhnout, slézt). */
function climbTotal(kind: WallKind, rampart: number | null): number {
  const c = climbTicks(kind, rampart);
  return c.lean + c.up + c.overLadder + c.down;
}

/** Co bitva podá přechodu: stav, bojiště s průlomy a krok muže (se stěnami). */
export interface ClimbWorld {
  b: BattleState;
  field: BattleField;
  forts: readonly BattleFort[];
  /** Krok muže k bodu tempem a terénem, stěnou neprojde; vrací, zda se pohnul. */
  walk: (f: Fighter, to: Pos) => boolean;
  /** Má opevnění průchod (brána, mezera, průlom)? */
  hasOpening: (fort: number) => boolean;
  /**
   * Nejbližší zasypaný kus vodního příkopu opevnění k bodu – úsek a bod na čáře hradby; žádný null
   * (zasypání – `battle.ts`).
   */
  moatFilled: (fort: number, from: Pos) => { segment: number; at: Pos } | null;
}

function ladderOf(b: BattleState, key: string | null): BattleLadder | undefined {
  return key === null ? undefined : b.ladders?.find((l) => l.key === key);
}

function begin(f: Fighter, climb: FighterClimb): void {
  f.state = 'climb';
  f.climb = climb;
  f.aim = null;
  f.route = [];
  f.routeFor = null;
  f.breachAt = null;
}

/**
 * Útočník narazil na stěnu úseku `segment` bez průchodu: začne hradbu přecházet, je-li to jeho
 * postup – plot přeleze (2 s), na palisádu a hradbu jde po žebříku (volný vezme, jinak vyrobí
 * v nejbližším lese). Postup volí rozkaz skupiny (`assault`; prolomení, nabízí-li ho místo), bez
 * něj nejrychlejší – žebřík proti nejlepšímu místu prolomení (`breachHours`, hodin se 4 muži; null
 * = místo nemá volno). Přes vodní příkop jen zasypaným kusem (`moatFilled`), dokud není, prolamuje
 * – zasype. Vrací, zda začal; jinak prolamuje.
 */
export function startCrossing(
  f: Fighter,
  fort: number,
  hitSegment: number,
  choice: GroupAssault | undefined,
  breachHours: number | null,
  cw: ClimbWorld,
): boolean {
  const bf = cw.forts[fort];
  if (!bf) return false;
  let segment = hitSegment;
  let wall = wallKindOf(bf, segment, cw.field.day);
  if (!wall) return false;
  if (choice !== undefined && choice !== 'ladder' && wall.methods.includes(choice)) return false;
  let near: Pos | null = null;
  if (wall.moat) {
    // vodní příkop – žebříky jen zasypaným kusem (fortifications.md – Přechod hradby – S valem)
    const filled = cw.moatFilled(fort, f.pos);
    if (!filled) return false;
    segment = filled.segment;
    near = filled.at;
    wall = wallKindOf(bf, segment, cw.field.day);
    if (!wall || (!wall.ladder && !wall.climb)) return false;
  }
  const shape = bf.shapes.find((s) => s.index === segment)!;
  const n = outward(bf, shape.line);
  const top = (() => {
    const t = project(shape.line, near ?? f.pos);
    return { x: shape.line.x + shape.line.dx * t, z: shape.line.z + shape.line.dz * t };
  })();
  // jen zvenku – zevnitř ven se neleze
  if ((f.pos.x - top.x) * n.x + (f.pos.z - top.z) * n.z < 0) return false;
  if (wall.climb) {
    begin(f, { ladder: null, phase: 'carry', ticks: 0, fort, segment, at: shift(top, n, FOOT_M) });
    return true;
  }
  if (!wall.ladder) return false;
  const forest = f.ladder ? null : nearestForestOf(cw.field.grid, f.pos);
  // volný žebřík opevnění vezme, je-li blíž než les
  const free = (cw.b.ladders ?? [])
    .filter(
      (l) =>
        l.fort === fort &&
        l.climber === null &&
        (near === null || dist2(l.top, near) <= FILL_M * FILL_M + 1e-9) &&
        (forest === null || dist2(f.pos, l.foot) <= dist2(f.pos, forest)),
    )
    .sort((p, q) => dist2(f.pos, p.foot) - dist2(f.pos, q.foot) || (p.key < q.key ? -1 : 1))[0];
  if (!free && !f.ladder && !forest) return false;
  if (choice !== 'ladder' && !free && !f.ladder) {
    // nejrychlejší: vyrobit žebřík a přelézt, nebo prolomit
    const metersPerTick = WAR.pace.metersPerSecond / TICKS_PER_SECOND;
    const walkM = Math.sqrt(dist2(f.pos, forest!)) + Math.sqrt(dist2(forest!, top));
    const ticks = walkM / metersPerTick + climbTotal(wall.kind, wall.rampart);
    const hours = A.manHours.ladder + ticks * cw.field.hoursPerTick;
    if (breachHours !== null && breachHours <= hours) return false;
  }
  if (free) {
    free.climber = f.id;
    begin(f, {
      ladder: free.key,
      phase: 'carry',
      ticks: 0,
      fort,
      segment: free.segment,
      at: { ...free.foot },
    });
    return true;
  }
  if (f.ladder) {
    begin(f, {
      ladder: null,
      phase: 'carry',
      ticks: 0,
      fort,
      segment,
      at: null,
      ...(near ? { near } : {}),
    });
    return true;
  }
  begin(f, {
    ladder: null,
    phase: 'make',
    ticks: ladderMakeTicks(cw.field.hoursPerTick),
    fort,
    segment,
    at: { ...forest! },
    ...(near ? { near } : {}),
  });
  return true;
}

/** Konec přechodu – zpět do boje (žebřík zůstane, volný). */
function finish(f: Fighter): void {
  f.state = 'fight';
  delete f.climb;
  f.aim = null;
}

/** Obránce do 2,5 m od vrcholu, který lezce nahoru nepustí (první v pořadí mužů). */
function guardOf(top: Pos, b: BattleState): Fighter | null {
  const r2 = REACH_M * REACH_M;
  for (const g of b.fighters) {
    if (g.side === 'defend' && inFight(g) && dist2(g.pos, top) <= r2) return g;
  }
  return null;
}

/** Další fáze po vrcholu: přetáhnout druhý žebřík (palisáda bez ochozu, jednou), nebo slézt. */
function afterTop(f: Fighter, c: FighterClimb, l: BattleLadder, kind: WallKind): void {
  const t = climbTicks(kind);
  if (t.overLadder > 0 && l.inner === null) {
    c.phase = 'over';
    c.ticks = t.overLadder;
  } else {
    c.phase = 'down';
    c.ticks = t.down;
  }
}

/**
 * Takt muže, který přechází hradbu: jde do lesa a vyrábí žebřík, nese ho k hradbě, opírá, leze,
 * nahoře bojuje s obráncem do 2,5 m (`aim`), přetáhne druhý žebřík a sleze dovnitř. Dokud nese
 * nebo vyrábí, vrátí se do boje, když opevnění mezitím průchod má.
 */
export function climbStep(f: Fighter, cw: ClimbWorld): void {
  const c = f.climb;
  const bf = c ? cw.forts[c.fort] : undefined;
  const wall = c && bf ? wallKindOf(bf, c.segment, cw.field.day) : null;
  if (!c || !bf || !wall) {
    finish(f);
    return;
  }
  const shape = bf.shapes.find((s) => s.index === c.segment)!;
  const n = outward(bf, shape.line);
  if ((c.phase === 'make' || c.phase === 'carry') && cw.hasOpening(c.fort)) {
    finish(f);
    return;
  }
  const near = (p: Pos): boolean => dist2(f.pos, p) <= AT_M * AT_M;
  const ticks = climbTicks(wall.kind, wall.rampart);
  switch (c.phase) {
    case 'make': {
      if (c.at && !near(c.at)) {
        if (!cw.walk(f, c.at)) finish(f);
        return;
      }
      if (--c.ticks > 0) return;
      f.ladder = true;
      c.phase = 'carry';
      c.at = null;
      return;
    }
    case 'carry': {
      if (wall.climb) {
        // plot – k místu a přes
        if (c.at && !near(c.at)) {
          if (!cw.walk(f, c.at)) finish(f);
          return;
        }
        if (c.at) f.pos = { ...c.at };
        c.at = null;
        c.phase = 'up';
        c.ticks = ticks.up;
        return;
      }
      let l = ladderOf(cw.b, c.ladder);
      if (!l) {
        const top = c.near
          ? ladderSpot(bf, c.segment, c.near, cw.b.ladders ?? [], FILL_M)
          : ladderSpot(bf, c.segment, f.pos, cw.b.ladders ?? []);
        if (!top) return;
        const ladders = (cw.b.ladders ??= []);
        let k = ladders.length;
        while (ladders.some((x) => x.key === `${c.fort}:${c.segment}:${k}`)) k++;
        l = {
          key: `${c.fort}:${c.segment}:${k}`,
          fort: c.fort,
          segment: c.segment,
          foot: shift(top, n, FOOT_M),
          top,
          inner: null,
          climber: f.id,
          up: false,
        };
        ladders.push(l);
        c.ladder = l.key;
        c.at = { ...l.foot };
      }
      if (!near(l.foot)) {
        if (!cw.walk(f, l.foot)) finish(f);
        return;
      }
      f.pos = { ...l.foot };
      if (l.up) {
        f.ladder = false;
        c.phase = 'up';
        c.ticks = ticks.up;
      } else {
        c.phase = 'lean';
        c.ticks = ticks.lean;
      }
      c.at = null;
      return;
    }
    case 'lean': {
      if (--c.ticks > 0) return;
      const l = ladderOf(cw.b, c.ladder);
      if (l) l.up = true;
      f.ladder = false;
      c.phase = 'up';
      c.ticks = ticks.up;
      return;
    }
    case 'up': {
      if (c.ticks > 0 && --c.ticks > 0) return;
      const l = ladderOf(cw.b, c.ladder);
      if (!l) {
        // plot – přelezl
        f.pos = shift(f.pos, n, -2 * FOOT_M);
        finish(f);
        return;
      }
      f.pos = { ...l.top };
      const guard = guardOf(l.top, cw.b);
      if (guard) {
        f.aim = guard.id;
        return;
      }
      f.aim = null;
      afterTop(f, c, l, wall.kind);
      return;
    }
    case 'over': {
      if (--c.ticks > 0) return;
      const l = ladderOf(cw.b, c.ladder);
      if (l) l.inner = shift(l.top, n, -FOOT_M);
      c.phase = 'down';
      c.ticks = ticks.down;
      return;
    }
    case 'down': {
      if (--c.ticks > 0) return;
      const l = ladderOf(cw.b, c.ladder);
      f.pos = l ? (l.inner ?? shift(l.top, n, -FOOT_M)) : shift(f.pos, n, -FOOT_M);
      if (wall.rampart !== null) {
        f.fatigue = { factor: rampartFatigue(wall.rampart), tick: cw.b.ticks };
      }
      if (l) l.climber = null;
      finish(f);
      return;
    }
  }
}

/** Shození žebříku: lezec na něm padne k patě (z vnitřního žebříku dovnitř) a ztratí 20 zdraví. */
function fall(l: BattleLadder, climber: Fighter | undefined, inner: boolean): number {
  const innerFoot = l.inner;
  if (inner) l.inner = null;
  else l.up = false;
  if (!climber?.climb) return 0;
  const c = climber.climb;
  if (inner && innerFoot) {
    // z vnitřního žebříku padne dovnitř – je za hradbou; druhý žebřík se musí přetáhnout znovu
    climber.pos = { ...innerFoot };
    l.climber = null;
    finish(climber);
  } else {
    climber.pos = { ...l.foot };
    c.phase = 'lean';
    c.ticks = A.climbSeconds.lean * TICKS_PER_SECOND;
    climber.aim = null;
  }
  return D.fallDamage;
}

/**
 * Obránce a žebřík (fortifications.md – Obrana bez násobku 4; návrh Clauda): do 2,5 m od vrcholu
 * opřeného žebříku s lezcem ho shodí místo rány, je-li čekaný pád (1 : 3 × 20) víc než jeho rána
 * (`blow`); prázdný žebřík shodí, když v tomto taktu nemá na koho udeřit (`idle`). Vrací null (nic
 * neudělal), nebo zda shodil, a komu pád ubere kolik zdraví.
 */
export function defendLadder(
  f: Fighter,
  b: BattleState,
  blow: number,
  idle: boolean,
  rng: Random,
): { fallen: string | null; damage: number } | null {
  if (f.side !== 'defend' || f.state !== 'fight') return null;
  const r2 = REACH_M * REACH_M;
  const byId = (id: string | null): Fighter | undefined =>
    id === null ? undefined : b.fighters.find((x) => x.id === id);
  for (const l of b.ladders ?? []) {
    if (!l.up || dist2(f.pos, l.top) > r2) continue;
    const climber = byId(l.climber);
    const on = climber !== undefined && onLadder(climber, b);
    // silný obránce lezce nechá vylézt a bije ho nahoře; prázdný žebřík shodí, když nemá do koho
    if (on ? D.push.withClimber * D.fallDamage <= blow : !idle) continue;
    if (!pushLadder(on, rng)) return { fallen: null, damage: 0 };
    const inner = on && climber.climb!.phase === 'down';
    const damage = fall(l, on ? climber : undefined, inner);
    return { fallen: on ? climber.id : null, damage };
  }
  return null;
}

/**
 * Úklid žebříků a lezců: kdo přestal přecházet (padl, prchá, utekl), pustí žebřík a slezl-li
 * z vrcholu, leží u paty; žebřík bez držitele je volný.
 */
export function settleLadders(b: BattleState): void {
  for (const f of b.fighters) {
    if (f.state === 'climb' || !f.climb) continue;
    const l = ladderOf(b, f.climb.ladder);
    if (l && (f.climb.phase === 'up' || f.climb.phase === 'over')) f.pos = { ...l.foot };
    delete f.climb;
  }
  for (const l of b.ladders ?? []) {
    if (l.climber === null) continue;
    const f = b.fighters.find((x) => x.id === l.climber);
    if (!f || f.state !== 'climb' || f.climb?.ladder !== l.key) l.climber = null;
  }
}

/** Takty výroby žebříku jedním mužem (4 mužohodiny). */
export function ladderMakeTicks(hoursPerTick: number): number {
  return Math.ceil(A.manHours.ladder / hoursPerTick - 1e-9);
}
