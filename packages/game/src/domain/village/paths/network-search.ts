// Hledání tras „z domu“ (Dijkstra z brány domácnosti ke všem jejím cílům), sčítání provozu po buňkách.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { HUMNO, ROUTE_HABIT, SACRED_BUILDINGS } from '../rules';
import { pathCostFactor } from './walk-speed';
import {
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
const STEP_QUANTUM = 1024;

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
  /**
   * Souvislé oblasti průchodných buněk (`passableAreas`) – spočítají se s prvním kolem (průchodnost
   * se mezi koly nemění); null = ještě ne.
   */
  areas: Int32Array | null;
}

/**
 * Dijkstra z buňky `from` (brána domácnosti) po mřížce s cenou `cost` (Infinity = neprůchodné). Po
 * každé vyjmuté buňce se zeptá `visit(c, d)` – true hledání ukončí; skončí i nad `maxCost`.
 * Úhlopříčně jen kolem průchodných rohů (neproklouzne rohem domu ani podél vody).
 *
 * Remízy (paths.md – Stálé trasy, pravidlo 3; návrh Clauda): ceny kroků po kvantech
 * (`quantizedStep`) a síla pěšiny po setinách (`trodden`), takže dvě stejně drahé trasy jsou
 * opravdu stejně drahé; ze stejně drahých předchůdců buňky vyhraje vyšší index. Nezávisí to na
 * pořadí, v jakém halda buňky vydá: krok stojí aspoň kvantum, stejně drazí předchůdci mají ostře
 * menší vzdálenost a rozbalí se dřív. Každé pevné pravidlo dá přednost jednomu směru; s nižším
 * indexem (jako u vozů) se v testu „jedna pěšina“ trasy dvou sousedů nesejdou, s vyšším ano.
 */
function search(
  grid: Grid,
  cost: Float32Array,
  from: number,
  maxCost: number,
  state: SearchState,
  visit: (c: number, d: number) => boolean,
): void {
  const { dist, parent, heap, stamp } = state;
  const run = ++state.run;
  heap.clear();
  const w = grid.width;
  const h = grid.height;
  const m = grid.cellM / 2;
  stamp[from] = run;
  dist[from] = 0;
  parent[from] = -1;
  heap.push(from, 0);
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    if (d > maxCost || visit(c, d)) break;
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
      // cena kroku po kvantech (`quantizedStep`) – součty přesné, remízy opravdové
      const nd = d + quantizedStep((own + next) * STEP[k]! * m);
      if (stamp[n] !== run || nd < dist[n]!) {
        stamp[n] = run;
        dist[n] = nd;
        parent[n] = c;
        heap.push(n, nd);
      } else if (nd === dist[n]! && c > parent[n]!) {
        // remíza – vyhraje předchůdce s vyšším indexem (viz `search`)
        parent[n] = c;
      }
    }
  }
}

/**
 * Souvislé oblasti průchodných buněk mřížky (−1 = neprůchodná). Stačí 4-okolí: úhlopříčně se jde
 * jen kolem průchodných rohů (`search`), takže úhlopříčkou se do jiné oblasti nedojde. Cíl v jiné
 * oblasti než brána domácnosti (za plotem bez branky, za vodou) se nehledá – hledání by jinak
 * prošlo celou oblast brány.
 */
export function passableAreas(grid: Grid): Int32Array {
  const w = grid.width;
  const all = w * grid.height;
  const area = new Int32Array(all).fill(-1);
  const stack = new Int32Array(all);
  let next = 0;
  for (let s = 0; s < all; s++) {
    if (area[s] !== -1 || grid.base[s] === Infinity) continue;
    let top = 0;
    stack[top++] = s;
    area[s] = next;
    while (top > 0) {
      const c = stack[--top]!;
      const i = c % w;
      const around = [i > 0 ? c - 1 : -1, i < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const n of around) {
        if (n < 0 || n >= all || area[n] !== -1 || grid.base[n] === Infinity) continue;
        area[n] = next;
        stack[top++] = n;
      }
    }
    next++;
  }
  return area;
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
 * Pořadí domácností v kolech (paths.md – Slévání): od nejvytíženější – součet cest za den ke všem
 * cílům před prvním kolem, při shodě nižší index. Stejné ve všech kolech. Návštěva sousedů je jedna
 * trasa na dvojici (`tripGroups`), chodí se ale oběma směry – vytíží obě domácnosti (návrh Clauda;
 * jinak by pořadí rozhodovalo, kterému z dvojice trasa připadla).
 */
export function householdOrder(
  groups: readonly TripGroup[],
  homes: readonly Household[],
): number[] {
  const total = homes.map((_, k) => groups.reduce((sum, g) => sum + g.weights[k]!, 0));
  for (const g of groups) {
    if (g.purpose !== 'neighbour') continue;
    const host = homes.findIndex((h) => `d:${h.dwellingId}` === g.to);
    if (host < 0) continue;
    total[host] = total[host]! + g.weights.reduce((sum, w) => sum + w, 0);
  }
  return homes.map((_, k) => k).sort((a, b) => total[b]! - total[a]! || a - b);
}

/**
 * Jedno kolo „z domu“ (paths.md – Slévání; Martin 8. 11. 2026): domácnosti po sobě v pořadí
 * `order` (`householdOrder`), každá jedno hledání z brány ke všem svým cílům najednou
 * (`routeHome`). Trasy domácnosti se pak přičtou do provozu a hned vyšlapou –
 * další domácnost se k pěšinám těch před ní přidá; trasy jednoho domu sdílejí kmen ze stromu
 * nejkratších cest. Cíl v jiné souvislé oblasti než brána se předem vyřadí. Nedosažený cíl (moc
 * daleko, nedosažitelný) dostane váhu 0 – další kola ho nehledají. Pochůzka v prvním kole určí,
 * jak daleko smí další kola (ERRAND_REACH), u dřeva i podíl cest podle ceny (`nearCost`), a domácnost
 * si zapamatuje, kam došla (`ends`). S `routes` zapíše každou trasu kola (buňky od brány k cíli) –
 * hledání ani provoz se tím nemění.
 *
 * Po krocích: před hledáním každé domácnosti se zastaví, aby volající mohl dát přestávku
 * (server – dlouhý dopočet neblokuje ostatní požadavky). Výsledek na přestávkách nezávisí.
 */
export function* routeAllSteps(
  grid: Grid,
  costs: PassCosts,
  homes: readonly Household[],
  groups: readonly TripGroup[],
  order: readonly number[],
  state: SearchState,
  ends: Map<number, PathErrands> | null,
  routes: RouteRecord[] | null = null,
): Generator<void, Traffic, void> {
  const all = grid.width * grid.height;
  const traffic: Traffic = {
    cells: new Float32Array(all),
    edges: new Float32Array(all * 4),
    edgeYears: new Float32Array(all * 4),
    trips: 0,
  };
  const areas = (state.areas ??= passableAreas(grid));
  const targets = targetIndex(groups, all);
  const groupAreas = groups.map((g) => areasOf(g.sources, areas));
  // pochůzky: v prvním kole hledání nejvýš do meze skupiny, v dalších do ERRAND_REACH z prvního
  const first = groups.map((g) => g.errand !== undefined && !g.reach);
  const reach = groups.map((g) =>
    g.errand !== undefined ? (g.reach ?? homes.map(() => g.maxCost)) : null,
  );
  const search: HomeSearch = {
    want: new Uint8Array(groups.length),
    limit: new Float64Array(groups.length),
    found: new Int32Array(groups.length),
    foundDist: new Float64Array(groups.length),
    errand: Uint8Array.from(groups.map((g) => (g.errand !== undefined ? 1 : 0))),
    // pěšiny pochůzek kola – další domácnost se k nim cestou může přidat
    trails: groups.map((g) => (g.errand !== undefined ? errandTrail(all) : null)),
    best: new Int32Array(groups.length),
    bestValue: new Float64Array(groups.length),
  };
  for (const k of order) {
    const home = homes[k]!;
    const area = areas[home.gate]!;
    const wanted: number[] = [];
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]!;
      search.want[g] = 0;
      if (group.weights[k]! < MIN_TRIP) continue;
      if (!groupAreas[g]!.includes(area)) {
        // cíl v jiné oblasti (za plotem bez branky, za vodou) – další kola ho nehledají
        group.weights[k] = 0;
        continue;
      }
      search.want[g] = 1;
      search.limit[g] = reach[g]?.[k] ?? group.maxCost;
      wanted.push(g);
    }
    if (wanted.length === 0) continue;
    yield;
    routeHome(grid, costs.cost, home.gate, wanted, targets, search, state);
    for (const g of wanted) {
      const group = groups[g]!;
      const at = search.found[g]!;
      if (at < 0) {
        // moc daleko – další kola už nehledají
        group.weights[k] = 0;
        continue;
      }
      if (first[g]) {
        const total = search.foundDist[g]!;
        reach[g]![k] = total * ERRAND_REACH.factor + ERRAND_REACH.extra;
        // pro dřevo se daleko chodí méně často (s větším nákladem) – pěšina tam vznikne, až když
        // se slije; pro vodu vždy naplno
        if (group.nearCost !== undefined) {
          const scale = Math.min(1, group.nearCost / Math.max(1, total));
          group.weights[k] = group.weights[k]! * scale;
          // podíl si trasa nese – převážení bez hledání (paths.md – Stálé trasy, pravidlo 5)
          (group.scale ??= [])[k] = scale;
        }
      }
      const trips = group.weights[k]!;
      const years = group.years?.[k] ?? home.years;
      const path = routes ? [] : null;
      const trail = search.trails[g];
      if (trail) {
        const mark = isTarget(targets, at, g);
        const end = addErrand(grid, state, traffic, costs, trail, mark, at, trips, years, path);
        if (ends && group.errand) {
          const entry = ends.get(home.dwellingId) ?? { water: null, wood: null };
          entry[group.errand] = { x: cellX(grid, end), z: cellZ(grid, end) };
          ends.set(home.dwellingId, entry);
        }
      } else {
        addTrip(state, traffic, costs, grid.width, at, trips, years, path);
        path?.reverse();
      }
      if (routes && path) routes.push({ home: k, group, trips, cells: path });
    }
  }
  groups.forEach((g, i) => {
    const r = reach[i];
    if (r) g.reach = r;
  });
  return traffic;
}

/** Hledání jedné domácnosti: které skupiny hledá, do jaké ceny a kde a za kolik skončily. */
interface HomeSearch {
  want: Uint8Array;
  limit: Float64Array;
  /** Konec trasy ke skupině (buňka cíle nebo pěšiny pochůzky, −1 = nedosažen, −2 = nad mezí). */
  found: Int32Array;
  /** Cena trasy ke konci (u pochůzky i se zbytkem po pěšině souseda). */
  foundDist: Float64Array;
  /** Skupina je pochůzka (konec s rezervou GOAL_SLACK, i na pěšině souseda). */
  errand: Uint8Array;
  trails: (ErrandTrail | null)[];
  /** Pochůzka: nejlepší dosavadní konec a jeho cena (i se zbytkem po pěšině). */
  best: Int32Array;
  bestValue: Float64Array;
}

/**
 * Hledání z brány ke všem cílům domácnosti (`wanted`) najednou. Konec trasy ke skupině je její
 * buňka s nejmenší cenou nejvýš do meze skupiny, při shodě vyšší index – rozhodne se, až jsou
 * vyjmuté všechny buňky té ceny, ne podle pořadí haldy. Pochůzka (voda, dřevo) skončí u místa,
 * nebo na pěšině souseda k místu (cena = cesta k ní + zbytek po ní – `ErrandTrail`): z vyjmutých
 * buněk vybere nejlevnější konec (při shodě vyšší index) a přijme ho, jakmile hledání dojde do
 * ceny, nad kterou by lepší konec ušetřil víc než GOAL_SLACK – domácnost se tak přidá k vyšlapané
 * pěšině souseda poblíž. Skončí, když má každá skupina konec (a buňky jeho ceny jsou vyjmuté),
 * nebo už žádnou nedosáhne pod svou mezí.
 */
function routeHome(
  grid: Grid,
  cost: Float32Array,
  gate: number,
  wanted: readonly number[],
  targets: TargetIndex,
  out: HomeSearch,
  state: SearchState,
): void {
  const { want, limit, found, foundDist, errand, trails, best, bestValue } = out;
  const errands: number[] = [];
  for (const g of wanted) {
    found[g] = -1;
    best[g] = -1;
    if (errand[g]) errands.push(g);
  }
  // podle meze vzestupně – cíl nad mezí už nedojde (ceny vyjmutých buněk rostou)
  const byLimit = [...wanted].sort((a, b) => limit[a]! - limit[b]! || a - b);
  let remaining = wanted.length;
  let lapsed = 0;
  let last = 0;
  let radius = -1;
  /** Pochůzka přijme nejlepší dosavadní konec, stojí-li nejvýš GOAL_SLACK × `upTo`. */
  const settle = (g: number, upTo: number): void => {
    if (found[g] !== -1 || best[g]! < 0 || bestValue[g]! > GOAL_SLACK * upTo) return;
    found[g] = best[g]!;
    foundDist[g] = bestValue[g]!;
    remaining--;
  };
  const offer = (g: number, c: number, value: number): void => {
    if (best[g]! < 0 || value < bestValue[g]! || (value === bestValue[g]! && c > best[g]!)) {
      best[g] = c;
      bestValue[g] = value;
    }
  };
  search(grid, cost, gate, limit[byLimit[byLimit.length - 1]!]!, state, (c, d) => {
    if (d > radius) {
      // všechny levnější buňky jsou vyjmuté – nabídky pochůzek úplné
      for (const g of errands) settle(g, d);
      radius = d;
    }
    while (lapsed < byLimit.length && limit[byLimit[lapsed]!]! < d) {
      const g = byLimit[lapsed++]!;
      if (errand[g]) settle(g, limit[g]!);
      if (found[g] === -1) {
        found[g] = -2;
        remaining--;
      }
    }
    // každý cíl má konec a všechny buňky jeho ceny jsou vyjmuté – remízy rozhodnuté
    if (remaining === 0 && d > last) return true;
    for (let e = targets.head[c]!; e >= 0; e = targets.link[e]!) {
      const g = targets.group[e]!;
      if (!want[g] || found[g] === -2 || d > limit[g]!) continue;
      if (errand[g]) {
        if (found[g] === -1) offer(g, c, d);
      } else if (found[g] === -1) {
        found[g] = c;
        foundDist[g] = d;
        remaining--;
        last = d;
      } else if (d === foundDist[g]! && c > found[g]!) {
        found[g] = c;
      }
    }
    // pěšiny sousedů k místům pochůzek – konec s cenou zbytku po pěšině
    for (const g of errands) {
      const trail = trails[g]!;
      if (found[g] === -1 && trail.next[c]! >= 0) offer(g, c, d + trail.rest[c]!);
    }
    return false;
  });
  // hledání došlo na konec (mez, celá oblast) – pochůzky vezmou nejlepší konec pod mezí
  for (const g of errands) settle(g, limit[g]!);
}

/** Buňka `c` je cílem skupiny `g`. */
function isTarget(targets: TargetIndex, c: number, g: number): boolean {
  for (let e = targets.head[c]!; e >= 0; e = targets.link[e]!) {
    if (targets.group[e] === g) return true;
  }
  return false;
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

/** Cena kroku mezi sousedními buňkami (jako v hledání, po kvantech). */
function stepCost(grid: Grid, cost: Float32Array, a: number, b: number): number {
  const d = Math.abs(a - b);
  const diagonal = d !== 1 && d !== grid.width;
  return quantizedStep(((cost[a]! + cost[b]!) / 2) * (diagonal ? SQRT2 : 1) * grid.cellM);
}

/**
 * Přidá pochůzku domácnosti, která skončila v buňce `at` (místo – `mark`, nebo napojení na pěšinu
 * souseda): úsek od brány k `at` (rodiče hledání), dál po pěšině souseda k místu; nový úsek zapíše
 * do pěšiny pochůzky. S `path` do něj zapíše buňky od brány k místu. Vrátí místo, kam domácnost
 * chodí.
 */
function addErrand(
  grid: Grid,
  state: SearchState,
  traffic: Traffic,
  costs: PassCosts,
  trail: ErrandTrail,
  mark: boolean,
  at: number,
  weight: number,
  years: number,
  path: number[] | null,
): number {
  // trasa od brány: buňky od `at` k bráně obráceně
  const back = path ? [] : null;
  addTrip(state, traffic, costs, grid.width, at, weight, years, back);
  if (path && back) for (let i = back.length - 1; i >= 0; i--) path.push(back[i]!);
  const joined = !mark && trail.next[at]! >= 0;
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

/** Buňka → skupiny, jejichž cílem je: první záznam `head[c]`, další `link[e]` (−1 = konec). */
interface TargetIndex {
  head: Int32Array;
  link: Int32Array;
  group: Int32Array;
}

function targetIndex(groups: readonly TripGroup[], all: number): TargetIndex {
  const total = groups.reduce((sum, g) => sum + g.sources.length, 0);
  const index: TargetIndex = {
    head: new Int32Array(all).fill(-1),
    link: new Int32Array(total),
    group: new Int32Array(total),
  };
  let e = 0;
  groups.forEach((g, gi) => {
    for (const c of g.sources) {
      index.group[e] = gi;
      index.link[e] = index.head[c]!;
      index.head[c] = e;
      e++;
    }
  });
  return index;
}

/** Oblasti (`passableAreas`), ve kterých leží buňky cíle. */
function areasOf(cells: readonly number[], areas: Int32Array): number[] {
  const out: number[] = [];
  for (const c of cells) {
    const a = areas[c]!;
    if (a >= 0 && !out.includes(a)) out.push(a);
  }
  return out;
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
