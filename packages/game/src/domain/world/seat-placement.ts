import { choosePremiumType } from '../landscape/premium/assign';
import { PREMIUM_TYPES } from '../landscape/premium/catalog';
import type { PremiumType } from '../landscape/premium/types';
import type { GridCell } from '../village/world-grid';
import { freeCellsByRing, type OccupiedCell, type PlacementRequest } from './placement';
import { WORLD } from './rules-world';
import { SKELETON } from './skeleton/rules-skeleton';
import type { SeatSlot } from './skeleton/sites';

// Místo a typ sídla hráče podle kostry světa (world-skeleton.md – Hustota a stejné podmínky).

/** Typy kostry světa – jen na svém místě kostry; ostatní typy jen na suchých mapách. */
const SKELETON_TYPES: readonly PremiumType[] = [
  'navigable-river',
  'confluence',
  'ford-hill',
  'mountain-pass',
];

/** Typy prémie, které místo sídla nabízí (`'dry'` = 15 typů bez kostry), v pořadí katalogu. */
export const SLOT_TYPES: Readonly<Record<SeatSlot, readonly PremiumType[]>> = {
  dry: PREMIUM_TYPES.filter((type) => !SKELETON_TYPES.includes(type)),
  river: ['navigable-river', 'confluence'],
  ford: ['ford-hill'],
  trail: ['mountain-pass'],
};

export interface SeatPlacementInput {
  readonly occupied: readonly OccupiedCell[];
  readonly request: PlacementRequest;
  /** Místo sídla na políčku (`seatSlot` výřezu kostry); null = sídlo hráče sem nejde. */
  readonly slotOf: (cell: GridCell) => SeatSlot | null;
  /** Kolik hráčů má který typ (chybějící = 0). */
  readonly counts: Partial<Record<PremiumType, number>>;
  /** Seed krajiny sídla – rozhodne shodu typů. */
  readonly seed: number;
  /** Typ, který hráč měl (Začít znovu) – dostane ho, když ho některý kandidát nabízí. */
  readonly owned?: PremiumType | null;
  /** Políčka vyřazená předem (typ na nich neprošel pásmem). */
  readonly exclude?: readonly GridCell[];
}

/**
 * Místo a typ sídla najednou: R0 = první prstenec s volným políčkem (odstup podle žádosti, jako
 * `placeCluster`); kandidáti = volná políčka prstenců R0 … R0 + `SKELETON.seat.slackRings` mimo
 * `exclude`, jejichž místo kostry sídlo hráče připouští (žádný → okno o prstenec dál). Typ =
 * `owned`, když ho kandidáti nabízejí, jinak nejméně zastoupený z nabízených
 * (`choosePremiumType`); políčko = první kandidát s tímto typem v pořadí prstenců a cílů.
 */
export function placeSeat(input: SeatPlacementInput): { cell: GridCell; type: PremiumType } {
  const excluded = new Set((input.exclude ?? []).map((c) => `${c.x},${c.y}`));
  const candidates: { cell: GridCell; slot: SeatSlot }[] = [];
  let first: number | null = null;
  // Poslední prstenec okna: R0 + rezerva, nebo prstenec prvního kandidáta, je-li dál.
  let last = Infinity;
  for (const { cell, radius } of freeCellsByRing(
    input.occupied,
    input.request,
    WORLD.searchRings,
  )) {
    first ??= radius;
    if (radius > last) break;
    if (excluded.has(`${cell.x},${cell.y}`)) continue;
    const slot = input.slotOf(cell);
    if (slot === null) continue;
    if (candidates.length === 0) last = Math.max(first + SKELETON.seat.slackRings, radius);
    candidates.push({ cell, slot });
  }
  if (candidates.length === 0) throw new RangeError('Nenalezeno místo pro sídlo v mřížce světa');
  const offered = new Set<PremiumType>();
  for (const c of candidates) for (const type of SLOT_TYPES[c.slot]) offered.add(type);
  const type =
    input.owned && offered.has(input.owned)
      ? input.owned
      : choosePremiumType(input.seed, input.counts, [...offered]);
  const chosen = candidates.find((c) => SLOT_TYPES[c.slot].includes(type));
  // Nedosažitelné: typ je z nabídky kandidátů.
  if (!chosen) throw new RangeError(`Typ ${type} nemá kandidáta`);
  return { cell: chosen.cell, type };
}
