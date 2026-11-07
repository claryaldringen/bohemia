import type { Random } from '../landscape/random';
import {
  breachStart,
  breachStep,
  breachWork,
  defenderMultiplier,
  fortificationArea,
  fortificationOutline,
  fortSegments,
  segmentIsGap,
  type BreachProgress,
  type BreachSpot,
  type FortSegmentShape,
} from '../village/fortification';
import type { Fortification, FortSegment } from '../village/fortification/types';
import { FORTIFICATIONS } from '../village/rules-fortifications';
import type { GridGeometry } from '../village/square-grid';
import type { GroupOrder } from './campaign-types';
import { defenderPlan, type Defender } from './defenders';
import { nearestForest } from './flight';
import { MARCH_FOREST, MARCH_WALL, marchCellAt, type MarchGrid, type Pos } from './march-grid';
import {
  attackerPlan,
  battleLeader,
  canAttack,
  dist2,
  inFight,
  type FighterPlan,
  type Leash,
  type PlanContext,
} from './orders';
import { WAR } from './rules-war';
import type { ShelterReport } from './stance';
import { TICKS_PER_SECOND } from './ticks';

// Boj muž po muži (war.md – Boj; fortifications.md – Obrana, Prolomení): po taktech ve skutečném
// čase, každý muž zvlášť – zdraví 100, zásah `10 × síla ÷ násobek obrany`, luk na 20–60 m
// poloviční zásah ≈ každé 4 s, zblízka plný ≈ každé 2 s, zda rána padne, určí los taktu. Na nule
// padlý, nebo raněný; skupina uteče při bodu zlomu podle počtu; velitel sám neuteče; poslední muž
// rodu doma neklesne pod 10 zdraví a vždy uteče. Opevnění: stěny úseků jsou úsečky, kterými se
// neprojde – jen branou, mezerou nebo průlomem; prolamující nebojují. Stav je JSON, takt čte jen
// stav, bojiště a náhodu taktu – výsledek nezávisí na kouscích taktů. Jen det-math.

/** Strana boje. */
export type BattleSide = 'attack' | 'defend';

/** Bojuje, prolamuje opevnění, prchá, je pryč z bojiště (utekl), leží (padlý nebo raněný). */
export type FighterState = 'fight' | 'breach' | 'flee' | 'fled' | 'down';

/** Muž v boji. */
export interface Fighter {
  /** `a:<index muže tažení>`, `d:<id člověka vsi>`. */
  id: string;
  side: BattleSide;
  /** Útočník: index v `CampaignState.members`; obránce: id člověka vsi. */
  ref: number;
  /** Útočník: skupina tažení; obránce: skupina domů. */
  group: number;
  line: boolean;
  bow: boolean;
  mounted: boolean;
  /** Síla v boji (u útočníka × podíl síly po mrazu). */
  strength: number;
  health: number;
  pos: Pos;
  /** Obránce: jeho dům; útočník: kde vstoupil do boje (tam prchá). */
  home: Pos;
  state: FighterState;
  /** Takty do další rány. */
  cooldown: number;
  /** Na koho v tomto taktu útočí. */
  aim: string | null;
  /** Hráčem řízený muž (war.md – Boj: hráč živě řídí jen svého muže). */
  controlled: boolean;
  /** Koho napadnout a kam jít – určil hráč (jen řízený muž). */
  chosen: string | null;
  goal: Pos | null;
  /** Průchod opevněním – body před a za průchodem; `routeFor` = cíl, ke kterému vede. */
  route: Pos[];
  routeFor: string | null;
  /** Místo prolomení (`BattleBreach.key`). */
  breachAt: string | null;
  /** Kam prchá (útočník domů, obránce do nejbližšího lesa). */
  fleeTo: Pos | null;
  atHouseOnly: boolean;
  lastLine: boolean;
  /** Na nule zdraví – padl (jinak raněný). */
  killed: boolean;
}

/** Skupina v boji – skupina tažení s rozkazem, nebo skupina domů obránců (rozkaz null). */
export interface BattleGroup {
  side: BattleSide;
  id: number;
  order: GroupOrder | null;
  holdAt: Pos | null;
  /** Muži, kteří do boje vstoupili – jmenovatel bodu zlomu. */
  entered: number;
  broken: boolean;
}

/** Rozdělaný průlom – úsek `segment` opevnění `fort` (pořadí ve vsi), brána nebo zeď. */
export interface BattleBreach {
  key: string;
  fort: number;
  segment: number;
  spot: BreachSpot;
  /** Kde prolamující stojí (venku u stěny). */
  at: Pos;
  progress: BreachProgress;
}

/** Výsledek boje: běží, útočníci drží bojiště, útočníci poraženi, útočníci ustoupili. */
export type BattleOutcome = 'ongoing' | 'attackers' | 'defenders' | 'withdrawn';

/** Stav boje (část stavu tažení). */
export interface BattleState {
  fighters: Fighter[];
  groups: BattleGroup[];
  /** Velitel a zástupce tažení (id bojovníků). */
  commander: string | null;
  deputy: string | null;
  /** Zavřené brány `<opevnění>:<úsek>` (fortifications.md – Brány se zavřou). */
  closedGates: string[];
  breaches: BattleBreach[];
  outcome: BattleOutcome;
  /** Spočtené takty boje. */
  ticks: number;
  /** Kdo ze vsi odešel před bojem: útočiště, les, vzdaní, odnesené zásoby (Ú6.10 je použije). */
  shelter?: ShelterReport;
  /**
   * NPC velitel silné opevnění nenapadl a vzal, co je venku (Ú6.12) – výsledek `attackers`, ale
   * útočiště zůstalo nedobyté.
   */
  plundered?: true;
}

/** Opevnění na bojišti s tvarem úseků (pořadí jako ve vsi). */
export interface BattleFort {
  fort: Fortification;
  shapes: FortSegmentShape[];
  center: Pos;
}

/** Bojiště – co takt čte mimo stav: mřížka mapy, opevnění vsi, den a délka taktu. */
export interface BattleField {
  grid: MarchGrid;
  geo: GridGeometry;
  forts: readonly BattleFort[];
  day: number;
  /** Herní hodiny jednoho taktu (prolamování je v mužohodinách). */
  hoursPerTick: number;
}

/** Útočník do boje – muž tažení. */
export interface BattleAttacker {
  member: number;
  group: number;
  line: boolean;
  mounted: boolean;
  strength: number;
  health: number;
  pos: Pos;
}

/** Vstup nového boje. */
export interface NewBattle {
  attackers: readonly BattleAttacker[];
  defenders: readonly Defender[];
  groups: readonly { id: number; order: GroupOrder; holdAt: Pos | null }[];
  /** Index velitele a zástupce mezi muži tažení (`member`). */
  commander: number | null;
  deputy: number | null;
  /** Velitele řídí hráč živě. */
  liveCommand: boolean;
  /** Kdo ze vsi odešel před bojem (`planDefense`) – zásoby a dobytek, které útočník nedostane. */
  shelter?: ShelterReport;
}

/** Zásah `10 × síla ÷ násobek obrany`, luk polovina (war.md – Boj – Souboj mužů). */
export function hitDamage(strength: number, multiplier: number, bow: boolean): number {
  const c = WAR.combat;
  return (c.hitPerStrength * strength * (bow ? c.bowFactor : 1)) / multiplier;
}

/** Opevnění vsi s tvarem úseků pro bojiště. */
export function battleForts(geo: GridGeometry, forts: readonly Fortification[]): BattleFort[] {
  return forts.map((fort) => {
    const area = fortificationArea(fort.cells, fort.grid, geo);
    if ('error' in area) return { fort, shapes: [], center: { x: 0, z: 0 } };
    const shapes = fortSegments(fortificationOutline(area, fort.kind));
    let x = 0;
    let z = 0;
    for (const s of shapes) {
      x += s.line.x + (s.line.dx * s.line.length) / 2;
      z += s.line.z + (s.line.dz * s.line.length) / 2;
    }
    const n = Math.max(1, shapes.length);
    return { fort, shapes, center: { x: x / n, z: z / n } };
  });
}

const attackerId = (member: number): string => `a:${member}`;

/** Výchozí stav boje – útočníci u svých skupin, obránci u domů. */
export function openBattle(input: NewBattle): BattleState {
  const fighters: Fighter[] = [];
  const base = {
    cooldown: 0,
    aim: null,
    chosen: null,
    goal: null,
    route: [],
    routeFor: null,
    breachAt: null,
    fleeTo: null,
    killed: false,
  };
  for (const a of input.attackers) {
    fighters.push({
      ...base,
      id: attackerId(a.member),
      side: 'attack',
      ref: a.member,
      group: a.group,
      line: a.line,
      bow: a.line,
      mounted: a.mounted,
      strength: a.strength,
      health: a.health,
      pos: { ...a.pos },
      home: { ...a.pos },
      state: 'fight',
      controlled: input.liveCommand && a.member === input.commander,
      atHouseOnly: false,
      lastLine: false,
    });
  }
  for (const d of input.defenders) {
    fighters.push({
      ...base,
      id: `d:${d.personId}`,
      side: 'defend',
      ref: d.personId,
      group: d.houseGroup,
      line: d.line,
      bow: d.bow,
      mounted: false,
      strength: d.strength,
      health: WAR.combat.health,
      pos: { ...d.pos },
      home: { ...d.pos },
      state: 'fight',
      controlled: false,
      atHouseOnly: d.atHouseOnly,
      lastLine: d.lastLine,
    });
  }
  const groups: BattleGroup[] = [];
  for (const g of input.groups) {
    const men = fighters.filter((f) => f.side === 'attack' && f.group === g.id);
    if (men.length === 0) continue;
    const holdAt = g.order === 'hold-place' ? (g.holdAt ?? { ...men[0]!.pos }) : g.holdAt;
    groups.push({
      side: 'attack',
      id: g.id,
      order: g.order,
      holdAt,
      entered: men.length,
      broken: false,
    });
  }
  const houseGroups = [...new Set(input.defenders.map((d) => d.houseGroup))].sort((a, b) => a - b);
  for (const id of houseGroups) {
    const entered = input.defenders.filter((d) => d.houseGroup === id).length;
    groups.push({ side: 'defend', id, order: null, holdAt: null, entered, broken: false });
  }
  const idOf = (m: number | null): string | null =>
    m !== null && input.attackers.some((a) => a.member === m) ? attackerId(m) : null;
  return {
    fighters,
    groups,
    commander: idOf(input.commander),
    deputy: idOf(input.deputy),
    closedGates: [],
    breaches: [],
    outcome: 'ongoing',
    ticks: 0,
    ...(input.shelter ? { shelter: input.shelter } : {}),
  };
}

// --- Stěny opevnění -------------------------------------------------------------------------

/** Úsečka stěny, kterou se neprojde. */
interface WallLine {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Průchod opevněním – brána, mezera, průlom; body vně a uvnitř. */
interface Opening {
  out: Pos;
  in: Pos;
}

/** Místo, kde jde opevnění prolomit. */
interface Spot {
  key: string;
  fort: number;
  segment: number;
  spot: BreachSpot;
  at: Pos;
  work: number;
}

/** Stěny, průchody a místa prolomení každého opevnění v tomto taktu. */
interface Walls {
  lines: WallLine[][];
  openings: Opening[][];
  spots: Spot[][];
}

/** Úsek blokuje: stojí a není to holý val (ten se přejde čtvrtinovým tempem – mřížka). */
function blocks(fort: Fortification, seg: FortSegment, day: number): boolean {
  if (segmentIsGap(fort, seg, day)) return false;
  if ((seg.kind ?? fort.kind) !== 'rampart') return true;
  return fort.top !== undefined && seg.topBuiltDay !== undefined && seg.topBuiltDay !== null;
}

/** Opevnění s průlomy boje (prolomený úsek je mezera – `breachedDay`). */
function breachedForts(field: BattleField, b: BattleState): BattleFort[] {
  const done = new Set(
    b.breaches.filter((x) => x.progress.breached).map((x) => `${x.fort}:${x.segment}`),
  );
  if (done.size === 0) return [...field.forts];
  return field.forts.map((bf, fi) => ({
    ...bf,
    fort: {
      ...bf.fort,
      segments: bf.fort.segments.map((s) =>
        done.has(`${fi}:${s.index}`) ? { ...s, breachedDay: field.day } : s,
      ),
    },
  }));
}

function wallsOf(forts: readonly BattleFort[], closed: ReadonlySet<string>, day: number): Walls {
  const walls: Walls = { lines: [], openings: [], spots: [] };
  forts.forEach((bf, fi) => {
    const lines: WallLine[] = [];
    const openings: Opening[] = [];
    const spots: Spot[] = [];
    bf.shapes.forEach((shape, k) => {
      const l = shape.line;
      const at = (t: number): Pos => ({ x: l.x + l.dx * t, z: l.z + l.dz * t });
      const mid = at(l.length / 2);
      let nx = l.dz;
      let nz = -l.dx;
      if ((mid.x - bf.center.x) * nx + (mid.z - bf.center.z) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const shift = (p: Pos, m: number): Pos => ({ x: p.x + nx * m, z: p.z + nz * m });
      const opening = (p: Pos): Opening => ({ out: shift(p, 3), in: shift(p, -3) });
      const part = (from: number, to: number): void => {
        if (to - from <= 1e-6) return;
        const a = at(from);
        const e = at(to);
        lines.push({ ax: a.x, az: a.z, bx: e.x, bz: e.z });
      };
      const seg = bf.fort.segments.find((s) => s.index === shape.index);
      if (!seg || !blocks(bf.fort, seg, day)) {
        openings.push(opening(mid));
        return;
      }
      const key = `${fi}:${shape.index}`;
      const gate = bf.fort.gates.find((g) => g.segment === shape.index);
      if (gate && !closed.has(key)) {
        const half = FORTIFICATIONS.gate.widthM / 2;
        part(0, gate.offsetM - half);
        part(gate.offsetM + half, l.length);
        openings.push(opening({ x: gate.x, z: gate.z }));
      } else {
        part(0, l.length);
      }
      // roh – tětiva oblouku ke začátku dalšího úseku
      const next = bf.shapes[(k + 1) % bf.shapes.length];
      if (shape.arc && next) {
        const e = at(l.length);
        lines.push({ ax: e.x, az: e.z, bx: next.line.x, bz: next.line.z });
      }
      if (gate) {
        spots.push({
          key: `${key}:gate`,
          fort: fi,
          segment: shape.index,
          spot: 'gate',
          at: shift({ x: gate.x, z: gate.z }, 1),
          work: breachWork(bf.fort, seg, 'gate'),
        });
      }
      const wallT = gate
        ? gate.offsetM > l.length / 2
          ? l.length / 4
          : (3 * l.length) / 4
        : l.length / 2;
      spots.push({
        key: `${key}:wall`,
        fort: fi,
        segment: shape.index,
        spot: 'wall',
        at: shift(at(wallT), 1),
        work: breachWork(bf.fort, seg, 'wall'),
      });
    });
    walls.lines.push(lines);
    walls.openings.push(openings);
    walls.spots.push(spots);
  });
  return walls;
}

function orient(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

/** Protne úsečka p → q stěnu? (Kolineární neblokuje.) */
function crosses(p: Pos, q: Pos, l: WallLine): boolean {
  const d1 = orient(l.ax, l.az, l.bx, l.bz, p.x, p.z);
  const d2 = orient(l.ax, l.az, l.bx, l.bz, q.x, q.z);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0) || (d1 === 0 && d2 === 0)) return false;
  const d3 = orient(p.x, p.z, q.x, q.z, l.ax, l.az);
  const d4 = orient(p.x, p.z, q.x, q.z, l.bx, l.bz);
  return !((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0));
}

/** První stěna na cestě p → q: opevnění a úsečka; žádná null. */
function firstWall(p: Pos, q: Pos, walls: Walls): { fort: number; line: WallLine } | null {
  for (let fi = 0; fi < walls.lines.length; fi++) {
    for (const line of walls.lines[fi]!) if (crosses(p, q, line)) return { fort: fi, line };
  }
  return null;
}

// --- Pohyb ------------------------------------------------------------------------------------

/** Tempo buňky mřížky; stěny opevnění řeší úsečky, ne buňky. */
function paceAt(grid: MarchGrid, p: Pos): number {
  const c = marchCellAt(grid, p);
  return (grid.flags[c]! & MARCH_WALL) !== 0 ? 1 : grid.pace[c]!;
}

function leashGap(leash: Leash, p: Pos): number {
  let best = Infinity;
  for (const a of leash.at) best = Math.min(best, dist2(a, p));
  return best;
}

/**
 * Krok k `to` tempem muže a terénu. Stěnu neprojde – sklouzne podél ní; na vodu a sráz nevstoupí;
 * z vodítka ven nevykročí (zpátky k němu ano). Vrací, zda se pohnul.
 */
function stepToward(
  f: Fighter,
  to: Pos,
  field: BattleField,
  walls: Walls,
  leash: Leash | null,
): boolean {
  const dx = to.x - f.pos.x;
  const dz = to.z - f.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-9) return false;
  const here = paceAt(field.grid, f.pos);
  const speed =
    (WAR.pace.metersPerSecond / TICKS_PER_SECOND) *
    (f.mounted ? WAR.pace.riders : 1) *
    (here > 0 ? here : 1);
  const step = Math.min(d, speed);
  const ux = dx / d;
  const uz = dz / d;
  let q = { x: f.pos.x + ux * step, z: f.pos.z + uz * step };
  const wall = firstWall(f.pos, q, walls);
  if (wall) {
    // podél stěny – průmět kroku do jejího směru
    const lx = wall.line.bx - wall.line.ax;
    const lz = wall.line.bz - wall.line.az;
    const len = Math.sqrt(lx * lx + lz * lz);
    if (len <= 1e-9) return false;
    const along = ((ux * lx + uz * lz) / len) * step;
    q = { x: f.pos.x + (lx / len) * along, z: f.pos.z + (lz / len) * along };
  }
  if (paceAt(field.grid, q) <= 0 || firstWall(f.pos, q, walls)) return false;
  if (leash) {
    const gap = leashGap(leash, q);
    if (gap > leash.radiusM * leash.radiusM && gap >= leashGap(leash, f.pos)) return false;
  }
  if (q.x === f.pos.x && q.z === f.pos.z) return false;
  f.pos = q;
  return true;
}

/** Útěk (war.md – Bod zlomu): útočník domů – kudy přišel (rozpad po hloučcích Ú6.12), obránce do lesa. */
function startFlee(f: Fighter, field: BattleField): void {
  f.state = 'flee';
  f.aim = null;
  f.route = [];
  f.routeFor = null;
  f.breachAt = null;
  f.fleeTo = f.side === 'attack' ? { ...f.home } : nearestForest(field.grid, f.pos);
  if (f.fleeTo === null) f.state = 'fled';
}

// --- Takt boje --------------------------------------------------------------------------------

/** Co takt zná navíc ke stavu. */
interface TickWorld {
  field: BattleField;
  forts: BattleFort[];
  walls: Walls;
  b: BattleState;
}

const MELEE_TICKS = WAR.combat.meleeSeconds * TICKS_PER_SECOND;
const BOW_TICKS = WAR.combat.bowSeconds * TICKS_PER_SECOND;
/** Prolamující pracuje, když stojí do tolika metrů od místa. */
const AT_SPOT_M = 1.5;

/** Je cíl na ránu – zblízka, nebo lukem? Zblízka má přednost. */
function strikeKind(f: Fighter, t: Fighter): 'melee' | 'bow' | null {
  const d2 = dist2(f.pos, t.pos);
  const c = WAR.combat;
  if (d2 <= c.meleeM * c.meleeM) return 'melee';
  if (f.bow && d2 >= c.bowMinM * c.bowMinM && d2 <= c.bowMaxM * c.bowMaxM) return 'bow';
  return null;
}

/** Bod zlomu po skupinách (war.md – Bod zlomu): padlí a ranění ÷ muži, kteří do boje vstoupili. */
function breakpoints(w: TickWorld): void {
  for (const g of w.b.groups) {
    if (g.broken || g.entered === 0) continue;
    const men = w.b.fighters.filter((f) => f.side === g.side && f.group === g.id);
    const lost = men.filter((f) => f.state === 'down').length;
    const limit = g.side === 'attack' ? WAR.breakpoint.attacker : WAR.breakpoint.defender;
    if (lost / g.entered < limit - 1e-9) continue;
    g.broken = true;
    // velitel neuteče sám – ustoupí jen na pokyn hráče, nebo NPC velitele (Ú6.12)
    for (const f of men) if (inFight(f) && f.id !== w.b.commander) startFlee(f, w.field);
  }
}

/** Brány se zavřou, když je první útočník do 30 m (fortifications.md – Obrana; útočiště Ú6.9). */
function closeGates(b: BattleState, forts: readonly BattleFort[]): void {
  const r2 = FORTIFICATIONS.gatesCloseWithinM * FORTIFICATIONS.gatesCloseWithinM;
  forts.forEach((bf, fi) => {
    for (const gate of bf.fort.gates) {
      const key = `${fi}:${gate.segment}`;
      if (b.closedGates.includes(key)) continue;
      const near = b.fighters.some(
        (f) => f.side === 'attack' && inFight(f) && dist2(f.pos, gate) <= r2,
      );
      if (near) b.closedGates.push(key);
    }
  });
}

/** Volné místo prolomení: nejméně zbývající práce, pak nejblíž; nejvýš 4 muži na místo. */
function chooseSpot(w: TickWorld, fort: number, from: Pos): Spot | null {
  let best: Spot | null = null;
  let bestKey: [number, number, string] | null = null;
  for (const spot of w.walls.spots[fort] ?? []) {
    const men = w.b.fighters.filter((f) => f.state === 'breach' && f.breachAt === spot.key).length;
    if (men >= FORTIFICATIONS.breach.maxMen) continue;
    const started = w.b.breaches.find((x) => x.key === spot.key);
    const left = started ? started.progress.required - started.progress.done : spot.work;
    const k: [number, number, string] = [left, dist2(from, spot.at), spot.key];
    if (
      bestKey === null ||
      k[0] < bestKey[0] ||
      (k[0] === bestKey[0] && (k[1] < bestKey[1] || (k[1] === bestKey[1] && k[2] < bestKey[2])))
    ) {
      best = spot;
      bestKey = k;
    }
  }
  return best;
}

/**
 * Jde k cíli `goal`. Útočník, kterému v cestě stojí stěna, jde průchodem (brána, mezera, průlom)
 * – body před ním a za ním; bez průchodu začne opevnění prolamovat. Obránce průchody nehledá.
 */
function approach(f: Fighter, goal: Pos, key: string, w: TickWorld, leash: Leash | null): void {
  if (f.side === 'attack') {
    if (f.routeFor === key && f.route.length > 0) {
      if (dist2(f.pos, f.route[0]!) <= 1) f.route.shift();
      // průchod se mezitím zavřel – cesta neplatí
      if (f.route.length > 0 && firstWall(f.pos, f.route[0]!, w.walls)) f.route = [];
      if (f.route.length > 0) {
        stepToward(f, f.route[0]!, w.field, w.walls, leash);
        return;
      }
    }
    const wall = firstWall(f.pos, goal, w.walls);
    if (wall) {
      // nejbližší průchod – nejdřív bod na mé straně, pak za ním
      let route: Pos[] | null = null;
      let routeD = Infinity;
      for (const o of w.walls.openings[wall.fort] ?? []) {
        const outFirst = dist2(f.pos, o.out) <= dist2(f.pos, o.in);
        const near = outFirst ? o.out : o.in;
        const d = dist2(f.pos, near);
        if (d < routeD) {
          routeD = d;
          route = outFirst ? [o.out, o.in] : [o.in, o.out];
        }
      }
      if (route) {
        f.route = route.map((p) => ({ ...p }));
        f.routeFor = key;
        stepToward(f, f.route[0]!, w.field, w.walls, leash);
        return;
      }
      const spot = chooseSpot(w, wall.fort, f.pos);
      if (spot) {
        if (!w.b.breaches.some((x) => x.key === spot.key)) {
          w.b.breaches.push({
            key: spot.key,
            fort: spot.fort,
            segment: spot.segment,
            spot: spot.spot,
            at: { ...spot.at },
            progress: breachStart(spot.work),
          });
        }
        f.state = 'breach';
        f.breachAt = spot.key;
        f.aim = null;
        f.route = [];
        f.routeFor = null;
        stepToward(f, spot.at, w.field, w.walls, null);
        return;
      }
    }
  }
  f.route = [];
  f.routeFor = null;
  stepToward(f, goal, w.field, w.walls, leash);
}

/** Bojující muž: plán podle rozkazu (útočník) nebo postoje (obránce), pak krok k cíli. */
function fightStep(f: Fighter, w: TickWorld, ctx: PlanContext): void {
  const group = w.b.groups.find((g) => g.side === f.side && g.id === f.group);
  const plan: FighterPlan =
    f.side === 'attack' && group ? attackerPlan(f, group, ctx) : defenderPlan(f, ctx);
  f.aim = plan.target?.id ?? null;
  if (plan.target) {
    if (strikeKind(f, plan.target) === null)
      approach(f, plan.target.pos, plan.target.id, w, plan.leash);
    return;
  }
  if (plan.moveTo) {
    approach(f, plan.moveTo, 'goal', w, plan.leash);
    if (f.controlled && f.goal && dist2(f.pos, f.goal) <= 1) f.goal = null;
  }
}

/** Prolamující jde k místu; když opevnění mezitím průchod má, vrátí se do boje. */
function breachStepOf(f: Fighter, w: TickWorld): void {
  const br = w.b.breaches.find((x) => x.key === f.breachAt);
  if (!br || br.progress.breached || (w.walls.openings[br.fort]?.length ?? 0) > 0) {
    f.state = 'fight';
    f.breachAt = null;
    return;
  }
  if (dist2(f.pos, br.at) > AT_SPOT_M * AT_SPOT_M) stepToward(f, br.at, w.field, w.walls, null);
}

/** Práce na průlomech v taktu – nejvýš 4 muži na místo (`breachStep`). */
function breachWorkStep(w: TickWorld): void {
  for (const br of w.b.breaches) {
    if (br.progress.breached) continue;
    const men = w.b.fighters.filter(
      (f) =>
        f.state === 'breach' &&
        f.breachAt === br.key &&
        dist2(f.pos, br.at) <= AT_SPOT_M * AT_SPOT_M,
    ).length;
    if (men === 0) continue;
    br.progress = breachStep(br.progress, men, w.field.hoursPerTick);
    if (!br.progress.breached) continue;
    // průlom je mezera – prolamující se vrátí do boje
    for (const f of w.b.fighters) {
      if (f.state === 'breach' && f.breachAt === br.key) {
        f.state = 'fight';
        f.breachAt = null;
      }
    }
  }
}

/**
 * Zásah do muže (war.md – Na nule zdraví): poslední muž rodu doma neklesne pod 10 zdraví a uteče
 * (i řízený hráčem); jinak na nule padlý, nebo raněný – los 1 : 1, muž rodu raněný 2 ze 3.
 */
function takeHit(t: Fighter, damage: number, w: TickWorld, rng: Random): void {
  if (t.lastLine) {
    // Ú6.9: vzdání – poslední muž rodu doma se nevzdá; Ú6.11: nezajme se
    t.health = Math.max(WAR.lastLineManMinHealth, t.health - damage);
    if (t.health <= WAR.lastLineManMinHealth && inFight(t)) startFlee(t, w.field);
    return;
  }
  t.health -= damage;
  if (t.health > 0) return;
  t.health = 0;
  t.state = 'down';
  t.aim = null;
  t.breachAt = null;
  t.route = [];
  const killed = t.line ? 1 - WAR.downed.lineWoundedShare : WAR.downed.killedShare;
  t.killed = rng.next() < killed;
}

/**
 * Jeden takt boje (war.md – Boj). Mění `b` na místě (volající má kopii taktu). Pořadí: brány,
 * bod zlomu, pohyb mužů v pevném pořadí, práce na průlomech, rány (los, zda padne, v pořadí mužů;
 * zásahy se sečtou a použijí až po všech ranách – kdo padne, v tomto taktu ještě udeřil), výsledek.
 */
export function battleTick(b: BattleState, field: BattleField, rng: Random): void {
  if (b.outcome !== 'ongoing') return;
  b.ticks++;
  const forts = breachedForts(field, b);
  closeGates(b, forts);
  const w: TickWorld = {
    field,
    forts,
    walls: wallsOf(forts, new Set(b.closedGates), field.day),
    b,
  };
  breakpoints(w);
  const byId = new Map(b.fighters.map((f) => [f.id, f]));
  const houses = new Map<number, Pos[]>();
  for (const f of b.fighters) {
    if (f.side !== 'defend') continue;
    const list = houses.get(f.group) ?? [];
    if (!list.some((h) => h.x === f.home.x && h.z === f.home.z)) list.push(f.home);
    houses.set(f.group, list);
  }
  const ctx: PlanContext = {
    fighters: b.fighters,
    byId,
    leader: battleLeader(b, byId),
    sees: (p, q) => {
      const forest =
        (field.grid.flags[marchCellAt(field.grid, p)]! & MARCH_FOREST) !== 0 ||
        (field.grid.flags[marchCellAt(field.grid, q)]! & MARCH_FOREST) !== 0;
      const r = forest ? WAR.sight.forestM : WAR.sight.openM;
      return dist2(p, q) <= r * r;
    },
    houses: (g) => houses.get(g) ?? [],
  };
  for (const f of b.fighters) {
    if (f.cooldown > 0) f.cooldown--;
    switch (f.state) {
      case 'down':
      case 'fled':
        break;
      case 'flee': {
        const to = f.fleeTo;
        const moved = to !== null && stepToward(f, to, field, w.walls, null);
        if (!moved || to === null || dist2(f.pos, to) <= 4) f.state = 'fled';
        break;
      }
      case 'breach':
        breachStepOf(f, w);
        break;
      case 'fight':
        fightStep(f, w, ctx);
        break;
    }
  }
  breachWorkStep(w);
  const damage = new Map<string, number>();
  for (const f of b.fighters) {
    if (f.state !== 'fight' || f.aim === null || f.cooldown > 0) continue;
    const t = byId.get(f.aim);
    if (!t || !canAttack(f, t, true)) continue;
    const kind = strikeKind(f, t);
    if (kind === null) continue;
    f.cooldown = kind === 'bow' ? BOW_TICKS : MELEE_TICKS;
    if (rng.next() >= WAR.combat.hitChance) continue;
    const mult =
      t.side === 'defend'
        ? defenderMultiplier(
            field.geo,
            forts.map((x) => x.fort),
            t.pos,
            f.pos,
            field.day,
          )
        : 1;
    damage.set(t.id, (damage.get(t.id) ?? 0) + hitDamage(f.strength, mult, kind === 'bow'));
  }
  for (const t of b.fighters) {
    const d = damage.get(t.id);
    if (d !== undefined && t.state !== 'down') takeHit(t, d, w, rng);
  }
  const attackers = b.fighters.some((f) => f.side === 'attack' && inFight(f));
  const defenders = b.fighters.some(
    (f) => f.side === 'defend' && (inFight(f) || f.state === 'flee'),
  );
  if (!attackers) b.outcome = 'defenders';
  else if (!defenders) b.outcome = 'attackers';
}

/** Hráčův pokyn veliteli v boji: jít na místo, nebo napadnout muže (`chosen`). */
export function commandFighter(
  b: BattleState,
  id: string,
  order: { goal?: Pos; strike?: string },
): void {
  const f = b.fighters.find((x) => x.id === id);
  if (!f || !f.controlled || !inFight(f)) return;
  if (order.goal) {
    f.goal = { x: order.goal.x, z: order.goal.z };
    f.chosen = null;
  }
  if (order.strike !== undefined) {
    const t = b.fighters.find((x) => x.id === order.strike);
    f.chosen = t && t.side !== f.side ? t.id : null;
  }
}
