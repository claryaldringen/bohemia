import { BUILD_COSTS } from './costs';
import { CEMETERY, CEMETERY_DISTANCE_M, HYGIENE_DEATH_EXTRA } from './rules';
import type { Cemetery, ChronicleEvent, Position, VillageState } from './types';

// Pohřebiště (cemetery.md): kapacita, hygiena podle vzdálenosti od obydlí a od vody, pohřeb
// zemřelých. Hygiena je vnitřní číslo simulace – hráč ji nevidí (Martin), jen její následky.

type AgeGroup = 'child' | 'adult' | 'elder';
type DistanceLimits = { readonly worst: number; readonly ok: number };

/** Pohřebiště vsi – vsi uložené před zavedením pohřebišť je nemají (= žádné). */
export function villageCemeteries(state: Pick<VillageState, 'cemeteries'>): Cemetery[] {
  return state.cemeteries ?? [];
}

/** Kolik hrobů se do pohřebiště vejde (56 na čtverec). */
export function cemeteryCapacity(cemetery: Pick<Cemetery, 'squares'>): number {
  return cemetery.squares.length * CEMETERY.gravesPerSquare;
}

/** Volné hroby pohřebiště. */
export function freeGraves(cemetery: Pick<Cemetery, 'squares' | 'graves'>): number {
  return Math.max(0, cemeteryCapacity(cemetery) - cemetery.graves);
}

/** Pohřebiště přijímá mrtvé: je vytyčené a ohrazené a má volný hrob. */
export function acceptsBurials(cemetery: Cemetery): boolean {
  return cemetery.builtDay !== null && freeGraves(cemetery) > 0;
}

/** Cena založení pohřebiště v člověkodnech: 10 na čtverec (`BUILD_COSTS`) + překážky. */
export function cemeteryFoundingCost(squares: readonly { obstacleCost: number }[]): number {
  const perSquare = BUILD_COSTS.cemetery.laborManDays;
  return squares.reduce((sum, s) => sum + perSquare + s.obstacleCost, 0);
}

/** Vzdálenost bodu od čtverce se středem (x, z) a stranou `sizeM` – uvnitř čtverce 0. */
export function distanceToSquare(
  x: number,
  z: number,
  square: { readonly x: number; readonly z: number },
  sizeM: number,
): number {
  const half = sizeM / 2;
  return Math.hypot(
    Math.max(0, Math.abs(x - square.x) - half),
    Math.max(0, Math.abs(z - square.z) - half),
  );
}

/**
 * Vzdálenost pohřebiště od nejbližšího obydlí (m): od středu obydlí k okraji nejbližšího
 * čtverce. Bez obydlí nekonečno.
 */
export function cemeteryDwellingDistance(
  squares: readonly { readonly x: number; readonly z: number }[],
  sizeM: number,
  dwellings: readonly Position[],
): number {
  let best = Infinity;
  for (const square of squares) {
    for (const p of dwellings) best = Math.min(best, distanceToSquare(p.x, p.z, square, sizeM));
  }
  return best;
}

/** Činitel vzdálenosti 0–1: do `worst` 0, od `ok` 1, mezi tím plynule (lineárně). */
export function hygieneDistanceFactor(distanceM: number, limits: DistanceLimits): number {
  return Math.min(1, Math.max(0, (distanceM - limits.worst) / (limits.ok - limits.worst)));
}

/**
 * Hygiena pohřebiště 0–1 (cemetery.md – Hygiena): činitel vzdálenosti od nejbližšího obydlí
 * (v pořádku od 150 m, nejhorší pod 50 m) × činitel vzdálenosti od vody (100 m / 30 m).
 */
export function cemeteryHygiene(
  cemetery: Pick<Cemetery, 'squares' | 'squareSizeM'>,
  dwellings: readonly Position[],
): number {
  const dwelling = cemeteryDwellingDistance(cemetery.squares, cemetery.squareSizeM, dwellings);
  const water = cemetery.squares.reduce((min, s) => Math.min(min, s.waterDistanceM), Infinity);
  return (
    hygieneDistanceFactor(dwelling, CEMETERY_DISTANCE_M.dwelling) *
    hygieneDistanceFactor(water, CEMETERY_DISTANCE_M.water)
  );
}

/** Polohy hotových obydlí – od nich se měří hygiena a pořadí pohřbívání. */
function dwellingPositions(state: VillageState): Position[] {
  return state.dwellings.map((d) => d.position);
}

/**
 * Hygiena vsi 0–1: podle nejlepšího hotového pohřebiště s volným místem; bez takového 0
 * (žádné pohřebiště, nebo jsou všechna plná).
 */
export function villageHygiene(state: VillageState): number {
  const cemeteries = villageCemeteries(state);
  if (cemeteries.length === 0) return 0;
  const dwellings = dwellingPositions(state);
  let best = 0;
  for (const cemetery of cemeteries) {
    if (acceptsBurials(cemetery)) best = Math.max(best, cemeteryHygiene(cemetery, dwellings));
  }
  return best;
}

/** Násobek ročního rizika úmrtí za hygienu: 1 + extra × (1 − hygiena), extra podle věku. */
export function hygieneDeathFactor(group: AgeGroup, hygiene: number): number {
  return 1 + HYGIENE_DEATH_EXTRA[group] * (1 - Math.min(1, Math.max(0, hygiene)));
}

/** Pořadí pohřbívání: pohřebiště nejblíž k obydlím první, při shodě nižší id. */
export function burialOrder(
  cemeteries: readonly Cemetery[],
  dwellings: readonly Position[],
): Cemetery[] {
  return cemeteries
    .map((c) => ({ c, d: cemeteryDwellingDistance(c.squares, c.squareSizeM, dwellings) }))
    .sort((a, b) => (a.d === b.d ? a.c.id - b.c.id : a.d - b.d))
    .map((x) => x.c);
}

/**
 * Pohřeb zemřelého (mutuje stav): obsadí hrob v hotovém pohřebišti s volným místem nejblíž
 * k obydlím. Když se tím pohřebiště zaplní, vrátí událost kroniky. Bez volného místa se nic
 * nestane – je to, jako by ves pohřebiště neměla.
 */
export function bury(state: VillageState, day: number): ChronicleEvent | null {
  const open = villageCemeteries(state).filter(acceptsBurials);
  if (open.length === 0) return null;
  const target = burialOrder(open, dwellingPositions(state))[0];
  if (!target) return null;
  target.graves += 1;
  if (freeGraves(target) > 0) return null;
  const othersFree = open.some((c) => c !== target);
  return { day, kind: 'cemetery-full', cemeteryId: target.id, othersFree };
}
