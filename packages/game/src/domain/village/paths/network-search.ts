// Hledání tras (A*/Dijkstra), sčítání provozu po buňkách a pochůzky.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { length2 } from '../../landscape';
import { HUMNO, ROUTE_HABIT, SACRED_BUILDINGS } from '../rules';
import { pathCostFactor } from './walk-speed';
import {
  A_STAR_WEIGHT,
  ERRAND_REACH,
  GOAL_SLACK,
  MILIR_RADIUS_M,
  MIN_TRIP,
  type PathErrands,
  type PathVillage,
  SQRT2,
} from './network-types';
import { pathStrength } from './network-keys';
import { type Building, type Grid, cellX, cellZ, dwellingBox } from './network-grid';
import { type Household, type TripGroup } from './network-targets';

// --- hledání ---------------------------------------------------------------------------------

/** Binární halda (min) nad buňkami s cenou – líné mazání (zastaralé záznamy se přeskočí). */
export class PathHeap {
  private keys = new Float64Array(1024);
  private cells = new Int32Array(1024);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(cell: number, key: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
      const cells = new Int32Array(this.size * 2);
      cells.set(this.cells);
      this.cells = cells;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.keys[i] = this.keys[parent]!;
      this.cells[i] = this.cells[parent]!;
      i = parent;
    }
    this.keys[i] = key;
    this.cells[i] = cell;
  }

  /** Vyjme nejlevnější buňku; cenu vrátí přes `topKey`. */
  pop(): number {
    const cell = this.cells[0]!;
    this.topKey = this.keys[0]!;
    const lastKey = this.keys[--this.size]!;
    const lastCell = this.cells[this.size]!;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= lastKey) break;
      this.keys[i] = this.keys[child]!;
      this.cells[i] = this.cells[child]!;
      i = child;
    }
    this.keys[i] = lastKey;
    this.cells[i] = lastCell;
    return cell;
  }

  topKey = 0;

  /** Cena nejlevnějšího záznamu bez vyjmutí (prázdná halda Infinity). */
  peekKey(): number {
    return this.size > 0 ? this.keys[0]! : Infinity;
  }
}

/**
 * Kvantum ceny kroku vozu i chůze (paths.md – Stálé trasy, pravidlo 3): cena kroku se zaokrouhlí na
 * násobek 1/1024 m louky (aspoň jeden) – součty takových čísel jsou ve Float64 přesné, takže dvě
 * stejně drahé trasy jsou opravdu stejně drahé a remízu rozhodne pravidlo předchůdce, ne
 * zaokrouhlení sčítání. Dvojková tisícina místo desetinné – přesná bez převodu jednotek.
 */
export const STEP_QUANTUM = 1024;

/** Cena kroku zaokrouhlená na kvantum (`STEP_QUANTUM`), aspoň jedno kvantum. */
export function quantizedStep(cost: number): number {
  return Math.max(1, Math.round(cost * STEP_QUANTUM)) / STEP_QUANTUM;
}

const NEIGHBOURS_8: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [-1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, -1, SQRT2],
];

const DI = Int8Array.from(NEIGHBOURS_8.map((n) => n[0]));

const DJ = Int8Array.from(NEIGHBOURS_8.map((n) => n[1]));

const STEP = Float64Array.from(NEIGHBOURS_8.map((n) => n[2]));

export interface SearchState {
  /**
   * Ceny jako Float64 – zaokrouhlení na Float32 by dělalo z platných záznamů haldy zastaralé.
   * Platí jen u buněk s `stamp` tohoto hledání (pole se mezi hledáními nenuluje).
   */
  dist: Float64Array;
  stamp: Uint32Array;
  run: number;
  parent: Int32Array;
  heap: PathHeap;
  /** Brány domácností, ke kterým hledání ještě má dojít (1 = čeká). */
  sinks: Uint8Array;
}

/**
 * Dijkstra z buněk `sources` po mřížce s cenou `cost` (Infinity = neprůchodné). Po každé
 * vyjmuté buňce se zeptá `done(c)` – true hledání ukončí; skončí i nad `maxCost`. S buňkou
 * `toward` je to A* (odhad vzdušnou čarou k ní × A_STAR_WEIGHT – jen směr hledání, `done` může
 * skončit i jinde). Úhlopříčně jen kolem průchodných rohů (neproklouzne rohem domu ani podél
 * vody).
 *
 * Remízy (paths.md – Stálé trasy, pravidlo 3; návrh Clauda): ceny kroků po kvantech
 * (`quantizedStep`) a síla pěšiny po setinách (`trodden`), takže dvě stejně drahé trasy jsou
 * opravdu stejně drahé; ze stejně drahých předchůdců buňky vyhraje vyšší index. Bez odhadu
 * (Dijkstra) to nezávisí na pořadí, v jakém halda buňky vydá – stejně drazí předchůdci mají ostře
 * menší vzdálenost a rozbalí se dřív; s odhadem a předčasným koncem (`done`) může rodiče cíle určit
 * i pořadí haldy – výsledek je dál deterministický. Každé pevné pravidlo dá přednost jednomu směru; s nižším
 * indexem (jako u vozů) se v testu „jedna pěšina“ trasy dvou sousedů nesejdou, s vyšším ano.
 */
function search(
  grid: Grid,
  cost: Float32Array,
  sources: readonly number[],
  maxCost: number,
  state: SearchState,
  done: (c: number) => boolean,
  toward = -1,
): void {
  const { dist, parent, heap, stamp } = state;
  const run = ++state.run;
  heap.clear();
  const w = grid.width;
  const h = grid.height;
  const m = grid.cellM / 2;
  const ti = toward >= 0 ? toward % w : 0;
  const tj = toward >= 0 ? (toward - ti) / w : 0;
  const weight = toward >= 0 ? A_STAR_WEIGHT * grid.cellM : 0;
  // odhad k cíli (A*) přímo z indexů buňky – týž výpočet jako dřív přes index (jen zrychlení)
  const astar = weight > 0;
  for (const s of sources) {
    if (stamp[s] === run) continue;
    stamp[s] = run;
    dist[s] = 0;
    parent[s] = -1;
    const si = s % w;
    heap.push(s, astar ? length2(si - ti, (s - si) / w - tj) * weight : 0);
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const i = c % w;
    const j = (c - i) / w;
    const d = astar ? dist[c]! : heap.topKey;
    if (astar ? heap.topKey > d + length2(i - ti, j - tj) * weight + 1e-9 : d > dist[c]!) continue;
    if (d > maxCost || done(c)) break;
    const own = cost[c]!;
    for (let k = 0; k < 8; k++) {
      const ii = i + DI[k]!;
      const jj = j + DJ[k]!;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      const next = cost[n]!;
      if (next === Infinity) continue;
      if (k >= 4 && (cost[j * w + ii] === Infinity || cost[jj * w + i] === Infinity)) continue;
      // cena kroku po kvantech (`quantizedStep`) – součty přesné, remízy opravdové
      const nd = d + quantizedStep((own + next) * STEP[k]! * m);
      if (stamp[n] !== run || nd < dist[n]!) {
        stamp[n] = run;
        dist[n] = nd;
        parent[n] = c;
        heap.push(n, astar ? nd + length2(ii - ti, jj - tj) * weight : nd);
      } else if (nd === dist[n]! && c > parent[n]!) {
        // remíza – vyhraje předchůdce s vyšším indexem (viz `search`)
        parent[n] = c;
      }
    }
  }
}

/**
 * Provoz kola – po buňkách a po hranách mezi sousedními buňkami: hrana je u buňky s menším
 * indexem, 4 směry na buňku (edgeSlot).
 */
export interface Traffic {
  cells: Float32Array;
  edges: Float32Array;
  /** Součet provoz × stáří spojení po hranách – průměrné stáří pěšiny. */
  edgeYears: Float32Array;
  trips: number;
}

/** Index hrany mezi sousedními buňkami a, b v poli `Traffic.edges` (4 na buňku: V, J, JV, JZ). */
export function edgeSlot(width: number, a: number, b: number): number {
  const lo = a < b ? a : b;
  const d = (a < b ? b : a) - lo;
  const dir = d === 1 ? 0 : d === width ? 1 : d === width + 1 ? 2 : 3;
  return lo * 4 + dir;
}

/** Druhý konec hrany ze slotu (inverze edgeSlot). */
export function edgeOther(width: number, slot: number): [number, number] {
  const lo = slot >> 2;
  const dir = slot & 3;
  const d = dir === 0 ? 1 : dir === 1 ? width : dir === 2 ? width + 1 : width - 1;
  return [lo, lo + d];
}

/** Přičte provoz buňce a hned jí sníží cenu podle síly vyšlapané pěšiny. */
function treadCell(traffic: Traffic, costs: PassCosts, c: number, weight: number): void {
  traffic.cells[c] = traffic.cells[c]! + weight;
  const strength = Math.max(costs.previous[c]!, pathStrength(traffic.cells[c]!));
  costs.cost[c] = trodden(costs, c, strength);
}

/**
 * Cena buňky s pěšinou dne síly `strength` – po pěšině se jde rychleji (PATH_WALK, `pathCostFactor`
 * – stejně jako vzdálenost chůze), kromě buněk, které pěšina nezrychlí (pevná cesta, osev).
 */
export function trodden(costs: PassCosts, c: number, strength: number): number {
  const base = costs.base[c]!;
  if (costs.plain?.[c]) return base;
  // zvyk (ROUTE_HABIT): mimo vyšlapané místo se chodí neradi – cena pro výběr trasy, ne čas chůze;
  // síla po setinách (paths.md – Stálé trasy, pravidlo 3) – drobný rozdíl provozu trasu nemění
  const s = Math.round(Math.min(1, Math.max(0, strength)) * 100) / 100;
  return base * (1 + ROUTE_HABIT.offRoad * (1 - s)) * (s > 0 ? pathCostFactor(s) : 1);
}

/** Ceny kola: základ, síla pěšin z minulého kola a ceny se slevou, které se průběžně snižují. */
export interface PassCosts {
  base: Float32Array;
  previous: Float32Array;
  cost: Float32Array;
  /** Buňky, které pěšina dne nezrychlí (`Grid.plain`). */
  plain: Uint8Array | null;
}

/**
 * Trasa kola zapsaná pro uložení (paths.md – Kdy se trasy počítají): domácnost `home` (index
 * v domácnostech) × skupina, cest za den a buňky od brány domácnosti k cíli.
 */
export interface RouteRecord {
  home: number;
  group: TripGroup;
  trips: number;
  cells: number[];
}

/**
 * Přičte cestu z buňky `from` po rodičích hledání až k jeho zdroji; vrátí zdroj. Buňkám na trase
 * hned sníží cenu podle nového provozu – další trasy kola se k vyšlapané pěšině přidají (aktivní
 * chodci po sobě, ne všichni naráz). S `path` do něj zapíše buňky trasy v pořadí chůze.
 */
function addTrip(
  state: SearchState,
  traffic: Traffic,
  costs: PassCosts,
  width: number,
  from: number,
  weight: number,
  years: number,
  path: number[] | null = null,
): number {
  const all = traffic.cells.length;
  let c = from;
  treadCell(traffic, costs, c, weight);
  path?.push(c);
  traffic.trips++;
  for (let guard = 0; guard < all; guard++) {
    const p = state.parent[c]!;
    if (p < 0) break;
    treadCell(traffic, costs, p, weight);
    path?.push(p);
    const slot = edgeSlot(width, c, p);
    traffic.edges[slot] = traffic.edges[slot]! + weight;
    traffic.edgeYears[slot] = traffic.edgeYears[slot]! + weight * years;
    c = p;
  }
  return c;
}

/**
 * Jedno kolo: skupiny od nejvytíženější. Cíl – jediná domácnost: hledání od buněk cíle k její
 * bráně; víc domácností: každá zvlášť (A* od cíle k její bráně), nejvytíženější první – další se
 * k pěšině, kterou ta před ní právě vyšlapala, přidá (souběžné pěšiny nevzniknou). Pochůzka – v prvním kole od všech míst najednou (každá domácnost dojde k nejbližšímu),
 * v dalších každá domácnost zvlášť od brány (cestou se přidá k pěšině souseda). Trasy se
 * přičtou do provozu; u pochůzek si domácnost zapamatuje, kam došla (`ends`). S `routes` zapíše
 * každou trasu kola (buňky od brány k cíli) – hledání ani provoz se tím nemění.
 */
export function routeAll(
  grid: Grid,
  costs: PassCosts,
  homes: readonly Household[],
  groups: readonly TripGroup[],
  state: SearchState,
  ends: Map<number, PathErrands> | null,
  routes: RouteRecord[] | null = null,
): Traffic {
  const steps = routeAllSteps(grid, costs, homes, groups, state, ends, routes);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * `routeAll` po krocích: po každé domácnosti (hledání cesty) se zastaví, aby volající mohl dát
 * přestávku (server – dlouhý dopočet neblokuje ostatní požadavky). Výsledek je týž.
 */
export function* routeAllSteps(
  grid: Grid,
  costs: PassCosts,
  homes: readonly Household[],
  groups: readonly TripGroup[],
  state: SearchState,
  ends: Map<number, PathErrands> | null,
  routes: RouteRecord[] | null = null,
): Generator<void, Traffic, void> {
  const traffic: Traffic = {
    cells: new Float32Array(grid.width * grid.height),
    edges: new Float32Array(grid.width * grid.height * 4),
    edgeYears: new Float32Array(grid.width * grid.height * 4),
    trips: 0,
  };
  const remember = (group: TripGroup, k: number, end: number): void => {
    if (!ends || !group.errand) return;
    const home = homes[k]!;
    const entry = ends.get(home.dwellingId) ?? { water: null, wood: null };
    entry[group.errand] = { x: cellX(grid, end), z: cellZ(grid, end) };
    ends.set(home.dwellingId, entry);
  };
  const sinks = state.sinks;
  /** Hledání od buněk skupiny ke všem branám s cestou; vrátí, jestli nějaká brána čekala. */
  const toGates = (group: TripGroup): boolean => {
    let remaining = 0;
    group.weights.forEach((w, k) => {
      const gate = homes[k]!.gate;
      if (w >= MIN_TRIP && !sinks[gate]) {
        sinks[gate] = 1;
        remaining++;
      }
    });
    if (remaining === 0) return false;
    search(grid, costs.cost, group.sources, group.maxCost, state, (c) => {
      if (sinks[c]) {
        sinks[c] = 0;
        remaining--;
      }
      return remaining === 0;
    });
    for (const home of homes) sinks[home.gate] = 0;
    return true;
  };
  /** Brána domácnosti `k` byla v posledním hledání dosažena (a ne moc daleko). */
  const reached = (group: TripGroup, k: number): boolean => {
    const gate = homes[k]!.gate;
    return state.stamp[gate] === state.run && state.dist[gate]! <= group.maxCost;
  };
  for (const group of groups) {
    const marks = group.marks;
    if (marks) {
      const first = !group.reach;
      const reach = group.reach ?? homes.map(() => group.maxCost);
      const goals = group.goals ?? [];
      // každá domácnost zvlášť od brány k nejbližšímu místu – po sobě, takže se další přidá
      // k pěšině, kterou vyšlapali sousedé
      const trail = errandTrail(grid.width * grid.height);
      for (let k = 0; k < group.weights.length; k++) {
        const w = group.weights[k]!;
        if (w < MIN_TRIP) continue;
        yield;
        const gate = homes[k]!.gate;
        const at = searchErrand(
          grid,
          costs.cost,
          gate,
          marks,
          trail,
          reach[k]!,
          state,
          goals[k] ?? -1,
        );
        if (at < 0) {
          // pro vodu / dřevo nemá kam (moc daleko, za vodou) – další kola už nehledají
          group.weights[k] = 0;
          continue;
        }
        if (first) {
          const total = state.dist[at]! + (marks[at] ? 0 : trail.rest[at]!);
          reach[k] = total * ERRAND_REACH.factor + ERRAND_REACH.extra;
          // pro dřevo se daleko chodí méně často (s větším nákladem) – pěšina tam vznikne, až když
          // se slije; pro vodu vždy naplno
          if (group.nearCost !== undefined) {
            const scale = Math.min(1, group.nearCost / Math.max(1, total));
            group.weights[k] = w * scale;
            // podíl si trasa nese – převážení bez hledání (paths.md – Stálé trasy, pravidlo 5)
            (group.scale ??= [])[k] = scale;
          }
        }
        const trips = group.weights[k]!;
        const years = group.years?.[k] ?? homes[k]!.years;
        const path = routes ? [] : null;
        const end = addErrand(grid, state, traffic, costs, trail, marks, at, trips, years, path);
        remember(group, k, end);
        if (routes && path) routes.push({ home: k, group, trips, cells: path });
      }
      group.reach = reach;
      continue;
    }
    const walkers = group.weights
      .map((w, k) => ({ w, k }))
      .filter(({ w }) => w >= MIN_TRIP)
      .sort((a, b) => b.w - a.w || a.k - b.k);
    if (walkers.length === 1) {
      // jediná domácnost – jedno hledání od cíle k její bráně
      if (!toGates(group)) continue;
    }
    for (const { w, k } of walkers) {
      yield;
      const home = homes[k]!;
      if (walkers.length > 1) {
        // víc domácností ke stejnému cíli: každá zvlášť, nejvytíženější první – další se po
        // čerstvě vyšlapané pěšině přidá k ní (Martin: „Pokud už cesta vede tím směrem, lidé by
        // měli použít tu, ne si prošlapat vlastní souběžnou.“)
        const gate = home.gate;
        search(grid, costs.cost, group.sources, group.maxCost, state, (c) => c === gate, gate);
      }
      if (!reached(group, k)) {
        // nedosažitelná brána (nebo moc daleko) – další kola ji už nehledají
        group.weights[k] = 0;
        continue;
      }
      const years = group.years?.[k] ?? home.years;
      const path = routes ? [] : null;
      addTrip(state, traffic, costs, grid.width, home.gate, w, years, path);
      if (routes && path) routes.push({ home: k, group, trips: w, cells: path });
    }
  }
  return traffic;
}

/** Pěšina pochůzky v kole: kudy se z buňky jde dál k místu, kolik to ještě stojí a kam vede. */
interface ErrandTrail {
  /** Další buňka po trase k místu (−1 = buňka na trase není). */
  next: Int32Array;
  rest: Float64Array;
  end: Int32Array;
}

function errandTrail(all: number): ErrandTrail {
  return {
    next: new Int32Array(all).fill(-1),
    rest: new Float64Array(all),
    end: new Int32Array(all),
  };
}

/** Cena kroku mezi sousedními buňkami (jako v hledání). */
function stepCost(grid: Grid, cost: Float32Array, a: number, b: number): number {
  const d = Math.abs(a - b);
  const diagonal = d !== 1 && d !== grid.width;
  return ((cost[a]! + cost[b]!) / 2) * (diagonal ? SQRT2 : 1) * grid.cellM;
}

/**
 * A* od brány k nejbližšímu místu pochůzky – nebo k pěšině souseda, která k místu vede (cena =
 * cesta k ní + zbytek po ní): domácnost se přidá k vyšlapané pěšině, jen když se jí to vyplatí,
 * a hledání skončí brzo. Vrátí buňku, kde skončilo (místo, nebo napojení na pěšinu), nebo −1.
 * Odhad A* vzdušnou čarou k `toward` (místo nejblíž vzdušnou čarou) × A_STAR_WEIGHT.
 */
function searchErrand(
  grid: Grid,
  cost: Float32Array,
  gate: number,
  marks: Uint8Array,
  trail: ErrandTrail,
  maxCost: number,
  state: SearchState,
  toward: number,
): number {
  const { dist, parent, heap, stamp } = state;
  const run = ++state.run;
  heap.clear();
  const w = grid.width;
  const h = grid.height;
  const m = grid.cellM / 2;
  const ti = toward >= 0 ? toward % w : 0;
  const tj = toward >= 0 ? (toward - ti) / w : 0;
  const weight = toward >= 0 ? A_STAR_WEIGHT * grid.cellM : 0;
  const estimate = (c: number): number => {
    const ci = c % w;
    return length2(ci - ti, (c - ci) / w - tj) * weight;
  };
  // cíl hledání: místo (zbývá 0) nebo pěšina k místu (zbývá cena po ní) – záznam −(c + 1);
  // cíl se přijme o něco dřív (GOAL_SLACK), hledání pak neprochází celé okolí
  const offer = (c: number, g: number): void => {
    if (marks[c]) heap.push(-(c + 1), g / GOAL_SLACK);
    else if (trail.next[c]! >= 0) heap.push(-(c + 1), (g + trail.rest[c]!) / GOAL_SLACK);
  };
  stamp[gate] = run;
  dist[gate] = 0;
  parent[gate] = -1;
  heap.push(gate, estimate(gate));
  offer(gate, 0);
  while (heap.size > 0) {
    const entry = heap.pop();
    if (entry < 0) return -entry - 1;
    if (heap.topKey > maxCost) return -1;
    const c = entry;
    const d = dist[c]!;
    if (heap.topKey > d + estimate(c) + 1e-9) continue;
    const i = c % w;
    const j = (c - i) / w;
    const own = cost[c]!;
    for (let k = 0; k < 8; k++) {
      const ii = i + DI[k]!;
      const jj = j + DJ[k]!;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      const next = cost[n]!;
      if (next === Infinity) continue;
      if (k >= 4 && (cost[j * w + ii] === Infinity || cost[jj * w + i] === Infinity)) continue;
      const nd = d + quantizedStep((own + next) * STEP[k]! * m);
      if (stamp[n] !== run || nd < dist[n]!) {
        stamp[n] = run;
        dist[n] = nd;
        parent[n] = c;
        heap.push(n, nd + estimate(n));
        offer(n, nd);
      } else if (nd === dist[n]! && c > parent[n]!) {
        // remíza – vyhraje předchůdce s vyšším indexem (viz `search`)
        parent[n] = c;
      }
    }
  }
  return -1;
}

/**
 * Přidá pochůzku domácnosti, která skončila v buňce `at` (místo, nebo napojení na pěšinu):
 * úsek od brány k `at` (rodiče hledání), dál po pěšině souseda k místu; nový úsek zapíše do
 * pěšiny pochůzky. Vrátí místo, kam domácnost chodí.
 */
function addErrand(
  grid: Grid,
  state: SearchState,
  traffic: Traffic,
  costs: PassCosts,
  trail: ErrandTrail,
  marks: Uint8Array,
  at: number,
  weight: number,
  years: number,
  path: number[] | null = null,
): number {
  // trasa od brány: buňky od místa k bráně obráceně
  const back = path ? [] : null;
  addTrip(state, traffic, costs, grid.width, at, weight, years, back);
  if (path && back) for (let i = back.length - 1; i >= 0; i--) path.push(back[i]!);
  const joined = !marks[at] && trail.next[at]! >= 0;
  const end = joined ? trail.end[at]! : at;
  if (joined) {
    // po pěšině souseda až k místu
    let c = at;
    for (let guard = 0; guard < traffic.cells.length && trail.next[c]! >= 0; guard++) {
      const n = trail.next[c]!;
      treadCell(traffic, costs, n, weight);
      path?.push(n);
      const slot = edgeSlot(grid.width, c, n);
      traffic.edges[slot] = traffic.edges[slot]! + weight;
      traffic.edgeYears[slot] = traffic.edgeYears[slot]! + weight * years;
      c = n;
    }
  }
  // nový úsek od `at` zpět k bráně se stane pěšinou, ke které se můžou přidat další
  let child = at;
  let rest = joined ? trail.rest[at]! : 0;
  trail.end[at] = end;
  trail.rest[at] = rest;
  for (let guard = 0; guard < traffic.cells.length; guard++) {
    const p = state.parent[child]!;
    if (p < 0) break;
    rest += stepCost(grid, costs.cost, p, child);
    if (trail.next[p]! < 0 || rest < trail.rest[p]!) {
      trail.next[p] = child;
      trail.rest[p] = rest;
      trail.end[p] = end;
    }
    child = p;
  }
  return end;
}

/** Lehce rozmazaný provoz (3 × 3) – pěšina přitahuje i trasy o buňku vedle. */
export function smoothTraffic(grid: Grid, traffic: Float32Array): Float32Array {
  const w = grid.width;
  const h = grid.height;
  const out = new Float32Array(traffic.length);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      const t = traffic[c]!;
      if (t === 0) continue;
      out[c] = out[c]! + t * 0.6;
      for (const [di, dj, step] of NEIGHBOURS_8) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const n = jj * w + ii;
        out[n] = out[n]! + t * (step === 1 ? 0.07 : 0.03);
      }
    }
  }
  return out;
}

/**
 * Vyšlapané pěšiny vsi. Bez obydlí (nebo bez průchodné brány) žádné. Výsledek závisí jen na
 * vstupu (deterministicky).
 */
/**
 * Neprůchodné stavby vsi: obydlí, pozemky a staveniště (podle id obydlí), milíře uhlířů a modly.
 * Obydlí zvlášť (brány domácností) a všechny dohromady.
 */
export function villageBuildings(v: PathVillage): {
  dwellings: Map<number, Building>;
  all: Building[];
} {
  const dwellings = new Map<number, Building>();
  for (const d of v.dwellings) {
    dwellings.set(d.id, { position: d.position, box: dwellingBox(d) });
  }
  const all: Building[] = [...dwellings.values()];
  // milíř uhlíře – samostatná stavba u skácených buků, pěšina ho obejde (crafts.md – Milíř
  // u skácených buků)
  for (const k of v.kilns ?? []) {
    const half = MILIR_RADIUS_M;
    all.push({
      position: { x: k.x, z: k.z, rotation: 0 },
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    });
  }
  for (const b of v.sacred?.buildings ?? []) {
    if (b.kind !== 'idol') continue;
    const half = SACRED_BUILDINGS.idol.footprintM / 2;
    all.push({
      position: b.position,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    });
  }
  // humno – mlat s přístřeškem (production-chains.md – Humno): pěšiny, vozy a cesty ho obejdou
  for (const f of v.threshingFloors ?? []) {
    const hx = HUMNO.sizeM.x / 2;
    const hz = HUMNO.sizeM.z / 2;
    all.push({ position: f.position, box: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz } });
  }
  return { dwellings, all };
}
