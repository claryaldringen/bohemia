// Mřížka a trasy vozu v paměti (paths.md – Stálé trasy; docs/code/village-roads.md – Trasy
// v paměti): jen zrychlení – výsledek je bit po bitu týž jako výpočet bez paměti, i po studeném
// startu (prázdná paměť uprostřed dopočtu).

import type { Landscape, ObstacleLayer } from '../../landscape';
import type { ObstacleChanges } from '../core/obstacles';
import type { CartKind } from '../types';
import {
  cartCostOn,
  cartPartSpeed,
  cartRoutesOn,
  type CartCost,
  type CartGrid,
  type CartRoute,
  type CartTarget,
  type CartVillage,
} from './cart';
import type { PathPoint, PathSquare } from './network';
import type { PathWindow } from './terrain';

/** Mřížek vozu na krajinu (nejdéle nepoužitá vypadne) – v jednom dni vsi stačí jedna, dvě. */
const GRIDS_PER_LANDSCAPE = 2;
/** Hledání (vůz a místa výjezdu) na mřížku – přejezdy spřežení mezi díly mají každý své. */
const SEARCHES_PER_GRID = 64;
/** Pamatovaných tras na hledání – nad mez se hledání zapomene celé. */
const ROUTES_PER_SEARCH = 1024;
/**
 * Mez paměti jedné mřížky: součet buněk všech pamatovaných tras (každá nese `cells` i `points`).
 * Nad ní se nejstarší hledání zapomenou – paměť při dlouhém dopočtu neroste do stovek MB.
 */
const MAX_CELLS_PER_GRID = 200_000;

interface CartMemo {
  obstacles: ObstacleLayer | null;
  key: string;
  grid: CartGrid;
  /** Trasy po hledáních (`searchKey`) a cílech (`targetKey`). */
  searches: Map<string, Map<string, CartRoute>>;
  /** Součet `cells.length` pamatovaných tras (mez `MAX_CELLS_PER_GRID`). */
  cells: number;
}

const MEMO = new WeakMap<Landscape, CartMemo[]>();

/** Oddělí v klíči mřížky vozu „zarostlý“ dílů od zbytku (`cartGridKey`). */
const PART_FLAGS = '#';

/**
 * Klíč mřížky vozu (`cartGrid`): okno terénu, pokácené a přidané stromy dne a z vsi přesně to, co
 * mřížka čte – díly polí (políčko, poloha, velikost, natočení a ze stadia jen „zarostlý“ – jinak
 * stálá cena), les vsi, pevné cesty (osa, druh, stupeň, mokřina, olemování), sady, hřbitovy,
 * ohrady, svatyně a modly, obydlí, milíře, humna a zemní práce. Stadia, lidé, práce dne ani den
 * v něm nejsou – táž mapa jiný den mřížku najde. „Zarostlý“ po dílech je na konci za
 * `PART_FLAGS` – mřížka, která se od klíče liší jen jím, se odvodí (`memoGrid`, `withPartStages`).
 */
export function cartGridKey(
  village: CartVillage,
  window: PathWindow,
  changes: ObstacleChanges | null,
): string {
  const square = (s: PathSquare): string =>
    `${s.cell.x}/${s.cell.y}:${s.x},${s.z},${s.size},${s.rotation ?? ''}`;
  const flags = village.fields
    .map((f) => f.parts.map((p) => (cartPartSpeed(p.stage) > 0 ? '0' : '1')).join(''))
    .join(',');
  const layout = JSON.stringify([
    window,
    village.fields.map((f) => f.parts.map(square).join(';')),
    village.woods ?? null,
    village.roads ?? null,
    village.orchards ?? null,
    village.cemeteries ?? null,
    village.pens ?? null,
    village.sacred?.buildings ?? null,
    village.dwellings,
    village.kilns ?? null,
    village.threshingFloors ?? null,
    village.earthworks ?? null,
    changes,
    // stojící opevnění (fortifications.md – Brány) – klíč vsi bez něj beze změny
    ...(village.fortifications ? [village.fortifications] : []),
  ]);
  return `${layout}${PART_FLAGS}${flags}`;
}

/** Klíč mřížky bez „zarostlý“ dílů (`cartGridKey`); klíč bez nich (testy) null. */
function layoutOf(key: string): string | null {
  const at = key.lastIndexOf(PART_FLAGS);
  return at >= 0 ? key.slice(0, at) : null;
}

const pointKey = (p: PathPoint): string => `${p.x},${p.z}`;
const targetKey = (t: CartTarget): string => `${t.x},${t.z},${t.reachM}`;

/**
 * Stavba mřížky vozu pro paměť: `similar` – mřížka z paměti, jejíž klíč se liší jen „zarostlý“
 * dílů (`withPartStages` z ní odvodí novou), jinak null.
 */
export type MakeCartGrid = (similar: CartGrid | null) => CartGrid;

/**
 * Mřížka vozu s klíčem `key` (`cartGridKey`) z paměti krajiny – `makeGrid` ji postaví jen
 * poprvé (z mřížky, která se liší jen „zarostlý“ dílů, je-li v paměti); použitá mřížka jde na
 * začátek fronty (nejdéle nepoužitá vypadne).
 */
function memoGrid(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  key: string,
  makeGrid: MakeCartGrid,
): CartMemo {
  const list = MEMO.get(landscape) ?? [];
  const at = list.findIndex((m) => m.obstacles === obstacles && m.key === key);
  const similar = (): CartGrid | null => {
    const layout = layoutOf(key);
    if (layout === null) return null;
    const m = list.find((x) => x.obstacles === obstacles && layoutOf(x.key) === layout);
    return m?.grid ?? null;
  };
  const memo: CartMemo =
    at >= 0
      ? list.splice(at, 1)[0]!
      : { obstacles, key, grid: makeGrid(similar()), searches: new Map(), cells: 0 };
  list.unshift(memo);
  if (list.length > GRIDS_PER_LANDSCAPE) list.length = GRIDS_PER_LANDSCAPE;
  MEMO.set(landscape, list);
  return memo;
}

/**
 * Cena trasy vozu `kind` z `depots` k jednomu cíli po mřížce s klíčem `key` (`cartGridKey`) –
 * jen cena, bez trasy (`cartCostOn` – tatáž cena jako `cartRoutesOn`, rychleji). Ceny se
 * nepamatují – přesun spřežení má každý den jiný výjezd i cíl.
 */
export function memoCartCost(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  key: string,
  makeGrid: MakeCartGrid,
  kind: CartKind,
  depots: readonly PathPoint[],
  target: CartTarget,
): CartCost {
  return cartCostOn(memoGrid(landscape, obstacles, key, makeGrid).grid, { kind, depots, target });
}

/**
 * Trasy vozu `kind` z `depots` k `targets` po mřížce s klíčem `key` (`cartGridKey`) – mřížku
 * postaví `makeGrid` jen poprvé. Známé cíle se nehledají, neznámé jedním hledáním
 * (`cartRoutesOn` – trasa k cíli nezávisí na ostatních cílech). Výsledek po pořadí cílů.
 * S `nearestM` stačí nejlevnější cíl (`cartRoutesOn`): neznámý cíl dražší o víc než `nearestM`
 * než nejlevnější neznámý vrátí „nedojede“ a nezapamatuje se (není jisté, že nedojede).
 */
export function memoCartRoutes(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  key: string,
  makeGrid: MakeCartGrid,
  kind: CartKind,
  depots: readonly PathPoint[],
  targets: readonly CartTarget[],
  nearestM: number | null = null,
): readonly CartRoute[] {
  const memo = memoGrid(landscape, obstacles, key, makeGrid);
  const search = `${kind}|${depots.map(pointKey).join(';')}`;
  /** Zapomene hledání (a jeho buňky) z paměti mřížky. */
  const drop = (name: string): void => {
    for (const r of memo.searches.get(name)?.values() ?? []) memo.cells -= r.cells.length;
    memo.searches.delete(name);
  };
  let routes = memo.searches.get(search);
  if (!routes) {
    if (memo.searches.size >= SEARCHES_PER_GRID) drop(memo.searches.keys().next().value!);
    routes = new Map();
  } else {
    // nejdéle nepoužité hledání je první ve frontě k zapomenutí
    memo.searches.delete(search);
  }
  memo.searches.set(search, routes);
  const unknown = (known: Map<string, CartRoute>): Map<string, CartTarget> => {
    const out = new Map<string, CartTarget>();
    for (const t of targets) {
      const k = targetKey(t);
      if (!known.has(k)) out.set(k, t);
    }
    return out;
  };
  let missing = unknown(routes);
  if (missing.size > 0 && routes.size + missing.size > ROUTES_PER_SEARCH) {
    for (const r of routes.values()) memo.cells -= r.cells.length;
    routes.clear();
    missing = unknown(routes);
  }
  if (missing.size === 0) return targets.map((t) => routes.get(targetKey(t))!);
  const found = cartRoutesOn(memo.grid, { kind, depots, targets: [...missing.values()] }, nearestM);
  const unsure = new Map<string, CartRoute>();
  [...missing.keys()].forEach((k, n) => {
    const route = found[n]!;
    if (nearestM !== null && !route.reached) {
      unsure.set(k, route);
      return;
    }
    routes.set(k, route);
    memo.cells += route.cells.length;
  });
  const result = targets.map((t) => routes.get(targetKey(t)) ?? unsure.get(targetKey(t))!);
  // nad mez buněk vypadnou nejstarší hledání; aktuální (poslední vložené) zůstane, i když je samo
  // nad mezí – pak se zapomene až příště
  for (const name of memo.searches.keys()) {
    if (memo.cells <= MAX_CELLS_PER_GRID || name === search) break;
    drop(name);
  }
  return result;
}

/** Zapomene mřížky a trasy vozu krajiny (studený start – testy). */
export function forgetCartRoutes(landscape: Landscape): void {
  MEMO.delete(landscape);
}
