// Vyšlapanost (paths.md – Vyšlapanost a vznik cesty): kudy trasy vedou, tam se tráva prošlapává,
// kde se nechodí, dorůstá. Číslo na políčko 3,75 m (buňka mřížky pěšin) v souřadnicích světa, celá
// čísla v setinách cesty. Trasa přidá jen buňkám, kudy vede (bez sousedů). Sčítá se po intervalech – mezi dny změny tras je provoz stálý, takže změna je
// (provoz − 1 cesta) × dny oříznutá na 0 a strop, přesně jako den po dni. Provoz tras po políčkách
// (provozní pole) se spočítá jednou pro sadu tras (`routes.key`) a drží v paměti, ne ve stavu.

import { WEAR } from '../rules-roads';
import type {
  LaborDay,
  LegacyRoadFields,
  LaborTarget,
  RoadLaborShare,
  RoadPoint,
  RoadWear,
  StoredRoute,
  VillageRoads,
  VillageRoutes,
  VillageState,
} from '../types';
import { type GridWindow } from './network-grid';
import { TRIPS_PER_MAN_DAY } from './network-types';
import { type RouteCode, routeCells } from './routes';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_VALUE: ReadonlyMap<string, number> = new Map(
  [...BASE64].map((ch, i): [string, number] => [ch, i]),
);

/** Posun a rozpětí indexu políčka v klíči – ± 32 768 políček (± 245 km) stačí každé krajině. */
const KEY_OFFSET = 32_768;
const KEY_SPAN = 65_536;

/**
 * Klíč políčka (i, j) – políčko i je buňka mřížky pěšin i (`routeCells`): pokrývá světa x do půl
 * buňky od i × 3,75 m (paths.md – Stálé trasy, pravidlo 4).
 */
export function wearKey(i: number, j: number): number {
  if (!(Math.abs(i + 0.5) < KEY_OFFSET && Math.abs(j + 0.5) < KEY_OFFSET)) {
    throw new RangeError(`Políčko vyšlapanosti mimo rozsah klíče: ${i}, ${j}`);
  }
  return (i + KEY_OFFSET) * KEY_SPAN + (j + KEY_OFFSET);
}

/** Index nejbližší buňky (střed buňky i leží v i × `WEAR.cellM`). */
function wearIndex(world: number): number {
  return Math.floor(world / WEAR.cellM + 0.5);
}

function keyI(key: number): number {
  return Math.floor(key / KEY_SPAN) - KEY_OFFSET;
}

function keyJ(key: number): number {
  return (key % KEY_SPAN) - KEY_OFFSET;
}

/** Klíč políčka, ve kterém leží bod světa (x, z) v metrech. */
export function wearCellAt(x: number, z: number): number {
  return wearKey(wearIndex(x), wearIndex(z));
}

// --- kódování -----------------------------------------------------------------------------

/** Kódy znaků base64 – varint se skládá z kódů a na řetězec se převede po kusech. */
const BASE64_CODES: readonly number[] = [...BASE64].map((ch) => ch.charCodeAt(0));

/** Nezáporné celé číslo jako varint v base64 – 5 bitů na znak, šestý bit = pokračuje. */
function pushVarint(out: number[], value: number): void {
  let v = value;
  while (v >= 32) {
    out.push(BASE64_CODES[(v % 32) + 32]!);
    v = Math.floor(v / 32);
  }
  out.push(BASE64_CODES[v]!);
}

/** Vyšlapanost do stavu: nenulová políčka podle klíče, rozdíl klíče a hodnota jako varint. */
export function encodeWear(cells: ReadonlyMap<number, number>): string {
  const keys = new Float64Array(cells.size);
  let n = 0;
  for (const [key, value] of cells) if (value > 0) keys[n++] = key;
  const sorted = keys.subarray(0, n).sort();
  const out: number[] = [];
  let previous = 0;
  for (const key of sorted) {
    pushVarint(out, key - previous);
    pushVarint(out, cells.get(key)!);
    previous = key;
  }
  let text = '';
  for (let i = 0; i < out.length; i += 8192) {
    text += String.fromCharCode(...out.slice(i, i + 8192));
  }
  return text;
}

/** Vyšlapanost ze stavu – políčka vzestupně podle klíče. */
export function decodeWear(encoded: string): Map<number, number> {
  const cells = new Map<number, number>();
  let i = 0;
  const next = (): number => {
    let value = 0;
    let scale = 1;
    for (;;) {
      const ch = encoded[i++];
      const d = ch === undefined ? undefined : BASE64_VALUE.get(ch);
      if (d === undefined) throw new Error(`Neplatný kód vyšlapanosti: ${encoded}`);
      value += (d % 32) * scale;
      if (d < 32) return value;
      scale *= 32;
    }
  };
  let key = 0;
  while (i < encoded.length) {
    key += next();
    cells.set(key, next());
  }
  return cells;
}

/** Vyšlapanost v bodě světa (x, z) – setiny cesty. */
export function wearAt(cells: ReadonlyMap<number, number>, x: number, z: number): number {
  return cells.get(wearCellAt(x, z)) ?? 0;
}

/**
 * Vyšlapanost bodu čáry trasy (setiny cesty): nejvyšší z buňky bodu a sousedních. Čára je
 * zjednodušená a vyhlazená (`extractLines`), takže bod leží až o buňku vedle buněk trasy –
 * vyšlapanost se tím jen čte, přibývá jen buňkám trasy.
 */
export function wearNear(cells: ReadonlyMap<number, number>, x: number, z: number): number {
  if (cells.size === 0) return 0;
  const i = wearIndex(x);
  const j = wearIndex(z);
  let best = 0;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) best = Math.max(best, cells.get(wearKey(i + di, j + dj)) ?? 0);
  }
  return best;
}

/**
 * Síla pěšiny z vyšlapanosti po buňkách okna mřížky pěšin (paths.md – Slévání): vyšlapanost / práh
 * cesty, nejvýš 1; pod viditelnou (`WEAR.visibleFrom`) nic.
 */
export function wearStrengths(grid: GridWindow, wear: ReadonlyMap<number, number>): Float32Array {
  const out = new Float32Array(grid.width * grid.height);
  if (wear.size === 0) return out;
  const { width, height, originX, originZ, cellM } = grid;
  const i0 = wearIndex(originX);
  const i1 = wearIndex(originX + (width - 1) * cellM);
  const j0 = wearIndex(originZ);
  const j1 = wearIndex(originZ + (height - 1) * cellM);
  // jen nenulová políčka (okno je o řády větší než vyšlapaná místa): buňky okna, jejichž bod padne
  // do políčka – rozsah odhadem ± 1, rozhodne přesně týž `wearIndex` jako u bodu buňky
  const span = (k: number, origin: number, n: number): [number, number] => [
    Math.max(0, Math.floor(((k - 0.5) * WEAR.cellM - origin) / cellM) - 1),
    Math.min(n - 1, Math.ceil(((k + 0.5) * WEAR.cellM - origin) / cellM) + 1),
  ];
  for (const [key, w] of wear) {
    if (w < WEAR.visibleFrom) continue;
    const i = keyI(key);
    const j = keyJ(key);
    if (i < i0 || i > i1 || j < j0 || j > j1) continue;
    const s = Math.min(1, w / WEAR.roadAt);
    const [xa, xb] = span(i, originX, width);
    const [za, zb] = span(j, originZ, height);
    for (let z = za; z <= zb; z++) {
      if (wearIndex(originZ + z * cellM) !== j) continue;
      for (let x = xa; x <= xb; x++) {
        if (wearIndex(originX + x * cellM) === i) out[z * width + x] = s;
      }
    }
  }
  return out;
}

// --- provozní pole ------------------------------------------------------------------------

/**
 * Políčka, kterými trasa vede (paths.md – Stálé trasy, pravidlo 4: bez sousedů – stálé trasy se
 * neposouvají), každé jednou, vzestupně; s `band` i sousední ± 1 (pás pro provoz cest – osa cesty
 * je vyhlazená čára trasy). `cellM` – strana buňky mřížky pěšin (buňka světa × `cellM` = střed).
 */
export function wearCellsOf(route: RouteCode, cellM: number, band = false): number[] {
  const cells = new Set<number>();
  let lastI = Number.NaN;
  let lastJ = Number.NaN;
  const reach = band ? 1 : 0;
  for (const [x, z] of routeCells(route)) {
    const i = wearIndex(x * cellM);
    const j = wearIndex(z * cellM);
    if (i === lastI && j === lastJ) continue;
    lastI = i;
    lastJ = j;
    for (let di = -reach; di <= reach; di++) {
      for (let dj = -reach; dj <= reach; dj++) cells.add(wearKey(i + di, j + dj));
    }
  }
  return [...cells].sort((a, b) => a - b);
}

/** Políčka tras k jednomu cíli práce – kolik setin cest za den jimi z tras k cíli vede. */
export interface TrafficTarget {
  cells: number[];
  cover: number[];
  /** Cesty za den všech tras k cíli (setiny). */
  total: number;
}

/**
 * Provozní pole sady tras: provoz tras mimo práci (setiny cest za den po políčkách, celá čísla)
 * a pro každý cíl práce jeho políčka – práci intervalu nesou trasy k cíli podle svých cest za den.
 */
export interface TrafficField {
  /** Provoz, který se sčítá do vyšlapanosti: trasy mimo práci celé, trasy `work` jen `base`. */
  cells: ReadonlyMap<number, number>;
  /**
   * Celý provoz všech tras (`trips`, i `work`) v pásu ± 1 políčka, každá trasa jednou – provoz
   * nových a starých cest (`trafficAt`, `fieldTraffic`).
   */
  walk: ReadonlyMap<number, number>;
  targets: ReadonlyMap<string, TrafficTarget>;
}

interface CachedField {
  check: string;
  field: TrafficField;
}

/** Pole posledních sad tras podle `routes.key` – dopočet jich střídá jen málo. */
const FIELDS = new Map<string, CachedField>();
const FIELDS_KEPT = 8;

function fieldCheck(list: readonly StoredRoute[]): string {
  let trips = 0;
  let steps = 0;
  for (const r of list) {
    trips += r.trips;
    steps += r.steps.length;
  }
  return `${list.length}/${trips}/${steps}`;
}

function buildField(list: readonly StoredRoute[], cellM: number): TrafficField {
  const cells = new Map<number, number>();
  const walk = new Map<number, number>();
  const covers = new Map<string, { cells: Map<number, number>; total: number }>();
  for (const route of list) {
    const routeCellsOf = wearCellsOf(route, cellM);
    for (const c of wearCellsOf(route, cellM, true)) walk.set(c, (walk.get(c) ?? 0) + route.trips);
    if (route.purpose === 'work') {
      // stálá část (chůze na zavedené místo) se vyšlapává hned, práci dne nese `wear.labor`
      const base = Math.min(route.trips, route.base ?? 0);
      if (base > 0) for (const c of routeCellsOf) cells.set(c, (cells.get(c) ?? 0) + base);
      const target = covers.get(route.to) ?? { cells: new Map<number, number>(), total: 0 };
      covers.set(route.to, target);
      target.total += route.trips;
      for (const c of routeCellsOf) target.cells.set(c, (target.cells.get(c) ?? 0) + route.trips);
      continue;
    }
    for (const c of routeCellsOf) cells.set(c, (cells.get(c) ?? 0) + route.trips);
  }
  const targets = new Map<string, TrafficTarget>();
  for (const [to, t] of covers) {
    const keys = [...t.cells.keys()].sort((a, b) => a - b);
    targets.set(to, { cells: keys, cover: keys.map((k) => t.cells.get(k)!), total: t.total });
  }
  return { cells, walk, targets };
}

/**
 * Provozní pole tras (paths.md – Vyšlapanost, výkon): políčka 3,75 m se součtem cest za den tras,
 * kterými vedou – trasy za prací (účel `work`) jen stálou částí `base`, zbytek (práci dne) nese
 * `wear.labor` podle podílů cíle, takže se nic nepočítá dvakrát.
 * Spočítá se jednou pro `routes.key` a drží v paměti (pár posledních sad tras).
 */
export function trafficField(
  routes: Pick<VillageRoutes, 'key' | 'list'>,
  cellM: number,
): TrafficField {
  const key = `${routes.key}|${cellM}`;
  const check = fieldCheck(routes.list);
  const cached = FIELDS.get(key);
  if (cached && cached.check === check) return cached.field;
  const field = buildField(routes.list, cellM);
  FIELDS.delete(key);
  FIELDS.set(key, { check, field });
  if (FIELDS.size > FIELDS_KEPT) FIELDS.delete(FIELDS.keys().next().value!);
  return field;
}

/** Celý provoz tras (i k cílům práce) v pásu ± 1 políčka u bodu světa (x, z) – setiny cest za den. */
export function trafficAt(field: TrafficField, x: number, z: number): number {
  return field.walk.get(wearCellAt(x, z)) ?? 0;
}

// --- sčítání ------------------------------------------------------------------------------

/**
 * Cíl trasy, ke kterému patří práce (`StoredRoute.to` – network-targets.ts); práce bez pěší trasy
 * (celá ves, vůz pro vodu) null.
 */
export function wearLaborKey(target: LaborTarget): string | null {
  switch (target.kind) {
    case 'village':
    case 'water':
      return null;
    case 'trees':
      return `trees:${target.ids.join('.')}`;
    case 'meadow':
      return 'meadow';
    case 'edge':
      return `edge:${target.direction}`;
    default:
      return `${target.kind}:${target.id}`;
  }
}

/** Práce intervalu po políčkách – setiny cest celkem (celá čísla), podle podílu tras cíle. */
function laborCells(labor: readonly RoadLaborShare[], field: TrafficField): Map<number, number> {
  const cells = new Map<number, number>();
  for (const share of labor) {
    const key = wearLaborKey(share.target);
    const target = key === null ? undefined : field.targets.get(key);
    const trips = Math.round(share.manDays * TRIPS_PER_MAN_DAY * 100);
    if (!target || trips <= 0) continue;
    target.cells.forEach((c, k) => {
      const add = Math.floor((trips * target.cover[k]!) / target.total);
      if (add > 0) cells.set(c, (cells.get(c) ?? 0) + add);
    });
  }
  return cells;
}

// --- pracovní políčka (výkon) --------------------------------------------------------------

/**
 * Měření (`road-report.ts`): hodiny volajícího a součty času sčítání a kódování. Ve hře hodiny
 * chybí a nic se neměří – výsledek na nich nezávisí.
 */
export const WEAR_TIMING: {
  clock: (() => number) | null;
  settleMs: number;
  settles: number;
  encodeMs: number;
  encodes: number;
} = { clock: null, settleMs: 0, settles: 0, encodeMs: 0, encodes: 0 };

interface WearWork {
  cells: Map<number, number>;
  /** Kód, ze kterého políčka vznikla nebo do kterého se naposledy zapsala. */
  encoded: string;
  /** Políčka se od posledního zápisu změnila – `wear.cells` je zastaralý. */
  dirty: boolean;
  /** Číslo změny pracovních políček (z čítače `REVISIONS`) – klíč sítě, dokud je `dirty`. */
  rev: number;
}

/** Čítač změn pracovních políček (jen v paměti; nikdy se neukládá ani neporovnává se stavem). */
let REVISIONS = 0;

/**
 * Pracovní políčka po objektech vyšlapanosti (paths.md – Výkon): dopočet je mezi intervaly drží
 * v paměti a do stavu je zapíše až `flushWear` (konec dopočtu) – nekóduje se každý interval.
 */
const WORK = new WeakMap<RoadWear, WearWork>();

function workOf(wear: RoadWear): WearWork {
  const work = WORK.get(wear);
  if (work && work.encoded === wear.cells) return work;
  const fresh: WearWork = {
    cells: decodeWear(wear.cells),
    encoded: wear.cells,
    dirty: false,
    rev: 0,
  };
  WORK.set(wear, fresh);
  return fresh;
}

/**
 * Políčka vyšlapanosti, jak je dopočet právě drží (i ještě nezapsaná do `wear.cells`) – volající
 * je nemění. Mimo dopočet (po `flushWear`) totéž co `decodeWear(wear.cells)`.
 */
export function wearMap(wear: RoadWear): ReadonlyMap<number, number> {
  return workOf(wear).cells;
}

/**
 * Klíč vyšlapanosti pro mezipaměť sítě (bez kódování): zapsaná políčka jsou sama kód
 * `wear.cells`, nezapsaná (uprostřed dopočtu) číslo změny.
 */
export function wearRevisionKey(wear: RoadWear): string {
  const work = WORK.get(wear);
  return work?.dirty && work.encoded === wear.cells ? `rev${work.rev}` : `c${wear.cells}`;
}

/** Zapíše pracovní políčka do stavu (`wear.cells`) – konec dopočtu, před uložením vsi. */
export function flushWear(wear: RoadWear): void {
  const work = WORK.get(wear);
  if (!work?.dirty || work.encoded !== wear.cells) return;
  const t0 = WEAR_TIMING.clock?.() ?? 0;
  wear.cells = encodeWear(work.cells);
  work.encoded = wear.cells;
  work.dirty = false;
  if (WEAR_TIMING.clock) {
    WEAR_TIMING.encodeMs += WEAR_TIMING.clock() - t0;
    WEAR_TIMING.encodes++;
  }
}

/**
 * Sečte vyšlapanost za dny `fromDay`–`toDay` (mutuje `wear`): w = clamp(w + (provoz − 1 cesta)
 * × dny + práce, 0, strop). Projde jen sjednocení políček s provozem a s vyšlapaností; práci
 * intervalu (`wear.labor`) vynuluje a posune `wear.day`. Vrátí počet prošlých políček. Políčka
 * zůstávají v paměti (`wearMap`) – do `wear.cells` je zapíše až `flushWear`.
 */
export function settleWear(
  wear: RoadWear,
  field: TrafficField,
  fromDay: number,
  toDay: number,
): number {
  const days = toDay - fromDay;
  if (days <= 0) return 0;
  const t0 = WEAR_TIMING.clock?.() ?? 0;
  const work = workOf(wear);
  const cells = work.cells;
  const labor = laborCells(wear.labor, field);
  const settle = (c: number, trips: number): void => {
    // nejdřív práce intervalu (ořez na strop), pak chůze a dorůstání po dnech (ořez na 0 a strop)
    const worked = Math.min(WEAR.max, (cells.get(c) ?? 0) + (labor.get(c) ?? 0));
    const w = worked + (trips - WEAR.regrowPerDay) * days;
    if (w > 0) cells.set(c, Math.min(WEAR.max, w));
    else cells.delete(c);
  };
  let visited = 0;
  for (const c of [...cells.keys()]) {
    if (field.cells.has(c) || labor.has(c)) continue;
    settle(c, 0);
    visited++;
  }
  for (const [c, trips] of field.cells) {
    settle(c, trips);
    visited++;
  }
  for (const c of labor.keys()) {
    if (field.cells.has(c)) continue;
    settle(c, 0);
    visited++;
  }
  work.dirty = true;
  work.rev = ++REVISIONS;
  wear.day = toDay;
  wear.labor = [];
  if (WEAR_TIMING.clock) {
    WEAR_TIMING.settleMs += WEAR_TIMING.clock() - t0;
    WEAR_TIMING.settles++;
  }
  return visited;
}

/** Provoz vozů po buňkách terénu (cest za den) – jako `PathTraffic`, bez závislosti na síti. */
export interface CartWearTraffic {
  originX: number;
  originZ: number;
  cellM: number;
  width: number;
  height: number;
  raw: Float32Array;
}

/**
 * Jízdy vozů za rok do vyšlapanosti (mutuje; roads.md – Vozy, paths.md – Vyšlapanost): políčko
 * s jízdami (jen to, kudy vůz jel – jako u tras) přibude o jízdy roku × `WEAR.cartWeight` cesty;
 * v políčku platí nejvyšší provoz buněk terénu, které do něj padnou. `days` – dny roku, `raw` je průměr na
 * den. Volá se jednou za rok (1. 11.) po sečtení vyšlapanosti k tomuto dni.
 */
export function addCartWear(wear: RoadWear, traffic: CartWearTraffic, days: number): void {
  const peak = new Map<number, number>();
  for (let z = 0; z < traffic.height; z++) {
    for (let x = 0; x < traffic.width; x++) {
      const r = traffic.raw[z * traffic.width + x]!;
      if (r <= 0) continue;
      const i = wearIndex(traffic.originX + x * traffic.cellM);
      const j = wearIndex(traffic.originZ + z * traffic.cellM);
      const key = wearKey(i, j);
      if (r > (peak.get(key) ?? 0)) peak.set(key, r);
    }
  }
  if (peak.size === 0) return;
  const work = workOf(wear);
  for (const key of [...peak.keys()].sort((a, b) => a - b)) {
    const add = Math.round(peak.get(key)! * days * 100 * WEAR.cartWeight);
    if (add > 0) work.cells.set(key, Math.min(WEAR.max, (work.cells.get(key) ?? 0) + add));
  }
  work.dirty = true;
  work.rev = ++REVISIONS;
}

/** Kopie cíle práce do `wear.labor` – jen to, podle čeho se práce přiřadí trase (`wearLaborKey`). */
function laborTargetCopy(target: LaborTarget): LaborTarget {
  switch (target.kind) {
    case 'field':
      return { kind: 'field', id: target.id };
    case 'trees':
      return { kind: 'trees', ids: [...target.ids] };
    case 'meadow':
      return { kind: 'meadow', cells: [] };
    default:
      return { ...target };
  }
}

/**
 * Práce dne do vyšlapanosti (mutuje `wear.labor`): člověkodny po cílech tras za prací. Práce bez
 * pěší trasy (celá ves, vůz pro vodu) se nepočítá. Stálou část cest k cíli (`StoredRoute.base`)
 * nese provozní pole, sem jde jen odvedená práce – nic se nepočítá dvakrát.
 */
export function addWearLabor(wear: RoadWear, labor: LaborDay | undefined, day: number): void {
  if (!labor || labor.day !== day) return;
  let index: Map<string, RoadLaborShare> | null = null;
  for (const share of labor.shares) {
    if (share.manDays <= 0) continue;
    const key = wearLaborKey(share.target);
    if (key === null) continue;
    index ??= new Map(
      wear.labor.map((s): [string, RoadLaborShare] => [wearLaborKey(s.target)!, s]),
    );
    const sum = index.get(key);
    if (sum) {
      sum.manDays += share.manDays;
      continue;
    }
    const added: RoadLaborShare = { target: laborTargetCopy(share.target), manDays: share.manDays };
    index.set(key, added);
    wear.labor.push(added);
  }
}

// --- převod starých vsí -------------------------------------------------------------------

/**
 * Políčka podél osy i sousední ± 1 (osa loňského úseku je přibližná – trasa vedle ní dostane totéž)
 * – vzorky po čtvrtině políčka, každé políčko jednou.
 */
function axisCells(points: readonly RoadPoint[], out: Set<number>): void {
  const step = WEAR.cellM / 4;
  const mark = (x: number, z: number): void => {
    const i = wearIndex(x);
    const j = wearIndex(z);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) out.add(wearKey(i + di, j + dj));
    }
  };
  points.forEach((p, k) => {
    const prev = points[k - 1];
    if (!prev) {
      mark(p.x, p.z);
      return;
    }
    const dx = p.x - prev.x;
    const dz = p.z - prev.z;
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / step));
    for (let s = 1; s <= n; s++) mark(prev.x + (dx * s) / n, prev.z + (dz * s) / n);
  });
}

/**
 * Vyšlapanost staré vsi (paths.md – Převod starých vsí, bod 3): chybí-li, založí ji – podél
 * loňských úseků nad prahem (`LegacyRoadFields.candidates`) `WEAR.seed` (polovina prahu cesty),
 * ostatní pěšiny od nuly; platí od dalšího dne dopočtu. Ves bez pevných cest nebo s vyšlapaností
 * vrátí týž stav (jednou a idempotentně).
 */
export function withWearSeed(state: VillageState): VillageState {
  const roads = state.roads;
  if (!roads || roads.wear) return state;
  const keys = new Set<number>();
  for (const axis of (roads as VillageRoads & LegacyRoadFields).candidates ?? []) {
    axisCells(axis, keys);
  }
  const cells = new Map<number, number>([...keys].map((k): [number, number] => [k, WEAR.seed]));
  const wear: RoadWear = {
    day: state.lastDay + 1,
    cells: encodeWear(cells),
    labor: [],
    cellM: WEAR.cellM,
  };
  return { ...state, roads: { ...roads, wear } };
}

/** Strana políčka vyšlapanosti uložené bez značky `cellM` (do 26. 10. 2026). */
const LEGACY_WEAR_CELL_M = 7.5;

/**
 * Vyšlapanost z doby políček 7,5 m (paths.md – Stálé trasy, pravidlo 4): každé staré políčko
 * (i, j) se rozdělí do 4 buněk 3,75 m (2i a 2i + 1 × 2j a 2j + 1 – buňky tras, které do něj
 * padly) s toutéž hodnotou a dostane značku `cellM`. Ves bez vyšlapanosti nebo se značkou vrátí
 * týž stav (jednou a idempotentně). Den sčtu i práce intervalu zůstanou.
 */
export function withWearCells(state: VillageState): VillageState {
  const wear = state.roads?.wear;
  if (!wear || wear.cellM === WEAR.cellM) return state;
  const factor = Math.round((wear.cellM ?? LEGACY_WEAR_CELL_M) / WEAR.cellM);
  const cells = new Map<number, number>();
  for (const [key, w] of decodeWear(wear.cells)) {
    const i = keyI(key) * factor;
    const j = keyJ(key) * factor;
    for (let a = 0; a < factor; a++) {
      for (let b = 0; b < factor; b++) cells.set(wearKey(i + a, j + b), w);
    }
  }
  const converted: RoadWear = { ...wear, cells: encodeWear(cells), cellM: WEAR.cellM };
  return { ...state, roads: { ...state.roads!, wear: converted } };
}

// --- provoz ke stavbám ---------------------------------------------------------------------

/**
 * Provoz ke stavbám za interval `days` dní (mutuje `roads.visits`): trasy s `visit` (hřbitov,
 * modla, svatyně, ohrada – `StoredRoute.visit`) přičtou cesty za den × dny. Po intervalech jako
 * vyšlapanost, takže dopočet po kouscích dá totéž. Chybí-li `visits`, založí se od začátku roku cest (`labor.from`).
 */
export function accrueVisits(
  roads: VillageRoads,
  routes: readonly StoredRoute[],
  days: number,
): void {
  const visits = (roads.visits ??= { from: roads.labor.from, byKey: [] });
  if (days <= 0) return;
  const sums = new Map(visits.byKey);
  for (const route of routes) {
    if (!route.visit) continue;
    sums.set(route.visit, (sums.get(route.visit) ?? 0) + route.trips * days);
  }
  visits.byKey = [...sums].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Provoz ke stavbám staré vsi (plán cest v2, Úloha 6): chybí-li `visits`, založí se od dalšího dne
 * dopočtu – chátrání staveb pak rozhodne až po roce dat (návrh Clauda – stavby nezačnou chátrat
 * naslepo). Ves bez cest nebo s provozem vrátí týž stav (jednou a idempotentně).
 */
export function withVisitsSeed(state: VillageState): VillageState {
  const roads = state.roads;
  if (!roads || roads.visits) return state;
  return { ...state, roads: { ...roads, visits: { from: state.lastDay + 1, byKey: [] } } };
}
