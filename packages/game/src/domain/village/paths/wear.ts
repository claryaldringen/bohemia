// Vyšlapanost (paths.md – Vyšlapanost a vznik cesty): kudy trasy vedou, tam se tráva prošlapává,
// kde se nechodí, dorůstá. Číslo na políčko 7,5 m v souřadnicích světa, celá čísla v setinách
// cesty. Sčítá se po intervalech – mezi dny změny tras je provoz stálý, takže změna je
// (provoz − 1 cesta) × dny oříznutá na 0 a strop, přesně jako den po dni. Provoz tras po políčkách
// (provozní pole) se spočítá jednou pro sadu tras (`routes.key`) a drží v paměti, ne ve stavu.

import { WEAR } from '../rules-roads';
import type { LaborTarget, RoadLaborShare, RoadWear, StoredRoute, VillageRoutes } from '../types';
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

/** Klíč políčka (i, j) – políčko i pokrývá světa x od i × 7,5 m do (i + 1) × 7,5 m. */
export function wearKey(i: number, j: number): number {
  if (!(Math.abs(i + 0.5) < KEY_OFFSET && Math.abs(j + 0.5) < KEY_OFFSET)) {
    throw new RangeError(`Políčko vyšlapanosti mimo rozsah klíče: ${i}, ${j}`);
  }
  return (i + KEY_OFFSET) * KEY_SPAN + (j + KEY_OFFSET);
}

function wearIndex(world: number): number {
  return Math.floor(world / WEAR.cellM);
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
 * Síla pěšiny z vyšlapanosti po buňkách okna mřížky pěšin (paths.md – Slévání): vyšlapanost / práh
 * cesty, nejvýš 1; pod viditelnou (`WEAR.visibleFrom`) nic.
 */
export function wearStrengths(grid: GridWindow, wear: ReadonlyMap<number, number>): Float32Array {
  const out = new Float32Array(grid.width * grid.height);
  if (wear.size === 0) return out;
  for (let z = 0; z < grid.height; z++) {
    const j = wearIndex(grid.originZ + z * grid.cellM);
    for (let x = 0; x < grid.width; x++) {
      const w = wear.get(wearKey(wearIndex(grid.originX + x * grid.cellM), j)) ?? 0;
      if (w >= WEAR.visibleFrom) out[z * grid.width + x] = Math.min(1, w / WEAR.roadAt);
    }
  }
  return out;
}

// --- provozní pole ------------------------------------------------------------------------

/**
 * Políčka trasy a jejich sousedé (± 1 – trasa, která se mezi roky posune, sčítá dál), každé jednou,
 * vzestupně. `cellM` – strana buňky mřížky pěšin (buňka světa × `cellM` = střed buňky).
 */
export function wearCellsOf(route: RouteCode, cellM: number): number[] {
  const cells = new Set<number>();
  let lastI = Number.NaN;
  let lastJ = Number.NaN;
  for (const [x, z] of routeCells(route)) {
    const i = wearIndex(x * cellM);
    const j = wearIndex(z * cellM);
    if (i === lastI && j === lastJ) continue;
    lastI = i;
    lastJ = j;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) cells.add(wearKey(i + di, j + dj));
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
  /** Celý provoz všech tras (`trips`, i `work`) – podle něj zarůstají kusy cest (`trafficAt`). */
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
    for (const c of routeCellsOf) walk.set(c, (walk.get(c) ?? 0) + route.trips);
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
 * Provozní pole tras (paths.md – Vyšlapanost, výkon): políčka 7,5 m se součtem cest za den tras
 * (i sousedi ± 1) – trasy za prací (účel `work`) jen stálou částí `base`, zbytek (práci dne) nese
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

/** Celý provoz tras (i k cílům práce) v bodě světa (x, z) – setiny cest za den. */
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

/** Políčka posledního sčtu a jejich kód – další interval téže vsi je nemusí dekódovat. */
let lastSettled: { encoded: string; cells: Map<number, number> } | null = null;

/**
 * Sečte vyšlapanost za dny `fromDay`–`toDay` (mutuje `wear`): w = clamp(w + (provoz − 1 cesta)
 * × dny + práce, 0, strop). Projde jen sjednocení políček s provozem a s vyšlapaností; práci
 * intervalu (`wear.labor`) vynuluje a posune `wear.day`. Vrátí počet prošlých políček.
 */
export function settleWear(
  wear: RoadWear,
  field: TrafficField,
  fromDay: number,
  toDay: number,
): number {
  const days = toDay - fromDay;
  if (days <= 0) return 0;
  // dopočet řetězí intervaly – poslední sečtená políčka se nedekódují znovu
  const cells =
    lastSettled && lastSettled.encoded === wear.cells ? lastSettled.cells : decodeWear(wear.cells);
  lastSettled = null;
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
  wear.cells = encodeWear(cells);
  lastSettled = { encoded: wear.cells, cells };
  wear.day = toDay;
  wear.labor = [];
  return visited;
}
