import { describe, expect, it } from 'vitest';
import { BandFailureError, type Landscape } from '../../domain/landscape';
import {
  cellLandscapeSeed,
  placeSeat,
  seatSlot,
  skeletonSlice,
  SLOT_TYPES,
  type PlacementRequest,
} from '../../domain/world';
import { cellSkeletonVersions } from '../cell-landscape';
import {
  isolatedSeatType,
  PREMIUM_SEAT_VERSIONS,
  seatOnWorld,
  seatSkeleton,
  type SeatGenerator,
} from '../world-seat';

const WORLD_SEED = 4242;
const REQUEST: PlacementRequest = { kind: 'invited', lordSeat: { x: 3, y: -2 } };
const OCCUPIED = [{ ownerId: 'pan', cell: { x: 3, y: -2 } }];

/** Generátor bez generování – vrátí jen seed a typ; `fail` = kolik prvních volání neprojde pásmem. */
function fakeGenerator(fail: number): {
  generate: SeatGenerator;
  calls: { seed: number; skeleton: unknown; versions: unknown }[];
} {
  const calls: { seed: number; skeleton: unknown; versions: unknown }[] = [];
  const generate: SeatGenerator = (seed, versions, premium, skeleton) => {
    calls.push({ seed, skeleton, versions });
    if (calls.length <= fail) throw new BandFailureError(seed);
    return { seed: seed + 1, landscape: { premium } as unknown as Landscape };
  };
  return { generate, calls };
}

describe('seatOnWorld', () => {
  const input = {
    skeleton: seatSkeleton(WORLD_SEED),
    occupied: OCCUPIED,
    counts: {},
    playerSeed: 7,
  };

  it('místo a typ z placeSeat, krajina ze seedu políčka a jeho výřezu (premium 2)', () => {
    const { generate, calls } = fakeGenerator(0);
    const seat = seatOnWorld(input, REQUEST, generate);
    const expected = placeSeat({
      ...input,
      request: REQUEST,
      slotOf: input.skeleton.slotOf,
      seed: 7,
    });
    expect({ cell: seat.cell, type: seat.type }).toEqual(expected);
    const slice = skeletonSlice(WORLD_SEED, seat.cell);
    expect(seat.skeleton).toEqual(slice);
    expect(SLOT_TYPES[seatSlot(slice)!]).toContain(seat.type);
    expect(seat.layerVersions).toEqual(cellSkeletonVersions(slice, PREMIUM_SEAT_VERSIONS));
    expect(seat.layerVersions.premium).toBe(2);
    expect(calls).toEqual([
      {
        seed: cellLandscapeSeed(WORLD_SEED, seat.cell),
        skeleton: slice,
        versions: seat.layerVersions,
      },
    ]);
    // ukládá se seed přijatého pokusu
    expect(seat.seed).toBe(cellLandscapeSeed(WORLD_SEED, seat.cell) + 1);
  });

  it('typ na kandidátovi neprojde pásmem ve všech oknech → další kandidát, hráč chybu nevidí', () => {
    const first = seatOnWorld(input, REQUEST, fakeGenerator(0).generate);
    const { generate, calls } = fakeGenerator(1);
    const seat = seatOnWorld(input, REQUEST, generate);
    expect(seat.cell).not.toEqual(first.cell);
    expect({ cell: seat.cell, type: seat.type }).toEqual(
      placeSeat({
        ...input,
        request: REQUEST,
        slotOf: input.skeleton.slotOf,
        seed: 7,
        exclude: [first.cell],
      }),
    );
    expect(calls.map((c) => c.seed)).toEqual([
      cellLandscapeSeed(WORLD_SEED, first.cell),
      cellLandscapeSeed(WORLD_SEED, seat.cell),
    ]);
  });

  it('jiná chyba než pásmo projde ven; po 8 vyřazených políčkách se vzdá', () => {
    const broken: SeatGenerator = () => {
      throw new RangeError('rozbité');
    };
    expect(() => seatOnWorld(input, REQUEST, broken)).toThrow(RangeError);
    const { generate, calls } = fakeGenerator(Infinity);
    expect(() => seatOnWorld(input, REQUEST, generate)).toThrow(BandFailureError);
    expect(calls).toHaveLength(8);
  });

  it('paměť výřezů vrací stejný výřez jako skeletonSlice', () => {
    const skeleton = seatSkeleton(WORLD_SEED);
    for (const cell of [
      { x: 0, y: 0 },
      { x: 5, y: -3 },
      { x: 0, y: 0 },
    ]) {
      expect(skeleton.sliceOf(cell)).toEqual(skeletonSlice(WORLD_SEED, cell));
      expect(skeleton.slotOf(cell)).toBe(seatSlot(skeletonSlice(WORLD_SEED, cell)));
    }
  });
});

describe('isolatedSeatType', () => {
  it('jen typy bez kostry; vlastní typ bez kostry zůstane, typ kostry se vybere znovu', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(SLOT_TYPES.dry).toContain(isolatedSeatType(seed, {}));
    }
    expect(isolatedSeatType(1, {}, 'fertile')).toBe('fertile');
    expect(SLOT_TYPES.dry).toContain(isolatedSeatType(1, {}, 'navigable-river'));
  });
});
