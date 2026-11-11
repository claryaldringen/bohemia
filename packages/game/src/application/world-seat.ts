import {
  BandFailureError,
  choosePremiumType,
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  MAX_ATTEMPTS,
  PREMIUM_LAYER_VERSION,
  type Landscape,
  type LayerVersions,
  type PremiumType,
  type SkeletonSlice,
} from '../domain/landscape';
import {
  cellLandscapeSeed,
  createSkeletonCache,
  isDry,
  placeSeat,
  seatSlot,
  skeletonSlice,
  SLOT_TYPES,
  type OccupiedCell,
  type PlacementRequest,
  type SeatSlot,
} from '../domain/world';
import type { GridCell } from '../domain/village/people/world-grid';
import { cellSkeletonVersions } from './cell-landscape';

// Sídelní sídlo lidského hráče na mapě světa (world-skeleton.md – Hustota a stejné podmínky):
// místo a typ prémie najednou (`placeSeat`) a prémiová krajina z políčka a jeho výřezu kostry.

/**
 * Verze vrstev prémiového sídelního sídla – průměrné vrstvy a prémiový průchod 2 (typ kostry jen
 * na svém místě kostry, ostatní typy na suché mapě); s výřezem kostry navíc `skeleton`
 * (`cellSkeletonVersions`).
 */
export const PREMIUM_SEAT_VERSIONS: LayerVersions = {
  ...CURRENT_LAYER_VERSIONS,
  premium: PREMIUM_LAYER_VERSION,
};

/**
 * Kolik oken po `MAX_ATTEMPTS` pokusech se zkusí, než se typ na seedu vzdá – prémiový typ projde
 * pásmem do `MAX_ATTEMPTS` pokusů aspoň na 95 % seedů (premium-landscapes.md – Generátor), takže
 * na seedu, kde neprojde, se pokračuje dalšími seedy (seed + 16, + 32 …).
 */
const PREMIUM_SEED_WINDOWS = 4;

/**
 * Kolik políček `seatOnWorld` vyřadí (typ na nich neprošel pásmem ve všech oknech), než se vzdá –
 * návrh Clauda; neprojde-li typ ani jednou z 20 seedů, je chyba jinde než v políčku.
 */
const SEAT_CANDIDATES = 8;

/** Generátor krajiny sídla: přijatý seed a krajina, nebo `BandFailureError`. */
export type SeatGenerator = (
  seed: number,
  versions: LayerVersions,
  premium: PremiumType,
  skeleton: SkeletonSlice | null,
) => { seed: number; landscape: Landscape };

/** Prémiová krajina sídelního sídla – první okno seedů, kde typ projde pásmem. */
export const acceptedPremiumLandscape: SeatGenerator = (seed, versions, premium, skeleton) => {
  for (let window = 0; ; window++) {
    try {
      return generateAcceptedLandscape(
        (seed + window * MAX_ATTEMPTS) >>> 0,
        versions,
        premium,
        skeleton,
      );
    } catch (error) {
      if (!(error instanceof BandFailureError) || window + 1 >= PREMIUM_SEED_WINDOWS) throw error;
    }
  }
};

/**
 * Výřez kostry a místo sídla po políčkách s pamětí – výřez stojí ≈ 110 µs a `placeSeat` se
 * s mnoha cíli (`sameLanguage`) i opakováním (souběh, vyřazené políčko) ptá na stejná políčka.
 * Jedna instance patří jednomu seedu světa a jednomu umisťování.
 */
export interface SeatSkeleton {
  readonly worldSeed: number;
  sliceOf(cell: GridCell): SkeletonSlice | null;
  slotOf(cell: GridCell): SeatSlot | null;
  /** Suché políčko kostry – odříznutý shluk se přesune jen na ně. */
  isDryCell(cell: GridCell): boolean;
}

export function seatSkeleton(worldSeed: number): SeatSkeleton {
  const cache = createSkeletonCache(worldSeed);
  const slices = new Map<string, SkeletonSlice | null>();
  const sliceOf = (cell: GridCell): SkeletonSlice | null => {
    const key = `${cell.x},${cell.y}`;
    let slice = slices.get(key);
    if (slice === undefined) {
      slice = skeletonSlice(worldSeed, cell, cache);
      slices.set(key, slice);
    }
    return slice;
  };
  return {
    worldSeed,
    sliceOf,
    slotOf: (cell) => seatSlot(sliceOf(cell)),
    isDryCell: (cell) => isDry(sliceOf(cell)),
  };
}

export interface SeatOnWorldInput {
  readonly skeleton: SeatSkeleton;
  readonly occupied: readonly OccupiedCell[];
  /** Kolik hráčů má který typ (chybějící = 0). */
  readonly counts: Partial<Record<PremiumType, number>>;
  /** Seed hráče – rozhodne shodu typů (`placeSeat`), pevný pro všechna opakování. */
  readonly playerSeed: number;
  /** Typ, který hráč měl (Začít znovu) – dostane ho, když ho některý kandidát nabízí. */
  readonly owned?: PremiumType | null;
}

/** Sídlo na mapě světa: políčko, typ, výřez kostry, verze vrstev a přijatá krajina. */
export interface WorldSeat {
  cell: GridCell;
  type: PremiumType;
  skeleton: SkeletonSlice | null;
  layerVersions: LayerVersions;
  /** Seed přijatého pokusu – ukládá se u sídla. */
  seed: number;
  landscape: Landscape;
}

/**
 * Místo, typ a krajina sídelního sídla na mapě světa: `placeSeat` vybere políčko a typ, krajina se
 * generuje ze seedu políčka a jeho výřezu (`premium: 2`, s řekou nebo stezkou i `skeleton`). Když
 * typ na políčku neprojde pásmem ani ve všech oknech seedů (`BandFailureError`), políčko se vyřadí
 * (`exclude`) a `placeSeat` vybere znovu – další kandidát s typem, nebo jiný typ. Hráč chybu nevidí.
 */
export function seatOnWorld(
  input: SeatOnWorldInput,
  request: PlacementRequest,
  generate: SeatGenerator = acceptedPremiumLandscape,
): WorldSeat {
  const exclude: GridCell[] = [];
  for (;;) {
    const { cell, type } = placeSeat({
      occupied: input.occupied,
      request,
      slotOf: input.skeleton.slotOf,
      counts: input.counts,
      seed: input.playerSeed,
      owned: input.owned ?? null,
      exclude,
    });
    const slice = input.skeleton.sliceOf(cell);
    const layerVersions = cellSkeletonVersions(slice, PREMIUM_SEAT_VERSIONS);
    try {
      const accepted = generate(
        cellLandscapeSeed(input.skeleton.worldSeed, cell),
        layerVersions,
        type,
        slice,
      );
      return { cell, type, skeleton: slice, layerVersions, ...accepted };
    } catch (error) {
      if (!(error instanceof BandFailureError) || exclude.length + 1 >= SEAT_CANDIDATES) {
        throw error;
      }
      exclude.push(cell);
    }
  }
}

/**
 * Typ odříznutého sídla (world-skeleton.md – Odříznutý nováček): krajina vzniká dřív než místo ve
 * světě, proto jen typy bez kostry – `owned`, je-li mezi nimi, jinak nejméně zastoupený.
 */
export function isolatedSeatType(
  playerSeed: number,
  counts: Partial<Record<PremiumType, number>>,
  owned?: PremiumType | null,
): PremiumType {
  return owned && SLOT_TYPES.dry.includes(owned)
    ? owned
    : choosePremiumType(playerSeed, counts, SLOT_TYPES.dry);
}
