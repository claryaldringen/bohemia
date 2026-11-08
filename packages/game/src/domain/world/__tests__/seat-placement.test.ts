import { describe, expect, it } from 'vitest';
import { PREMIUM_TYPES } from '../../landscape/premium/catalog';
import { SKELETON_PREMIUM_SLOTS, type PremiumType } from '../../landscape/premium/types';
import type { GridCell } from '../../village/world-grid';
import { cellDistance, type OccupiedCell, placeCluster, ringCells } from '../placement';
import { placeSeat, SLOT_TYPES } from '../seat-placement';
import type { SeatSlot } from '../skeleton';

const key = (cell: GridCell): string => `${cell.x},${cell.y}`;

/** Místa kostry podle tabulky „x,y“; ostatní políčka `rest`. */
function slotsOf(
  map: Readonly<Record<string, SeatSlot | null>>,
  rest: SeatSlot | null = 'dry',
): (cell: GridCell) => SeatSlot | null {
  return (cell) => {
    const slot = map[key(cell)];
    return slot === undefined ? rest : slot;
  };
}

/** Všechny typy `base`, vybrané jinak. */
function counts(
  base: number,
  overrides: Partial<Record<PremiumType, number>> = {},
): Partial<Record<PremiumType, number>> {
  const result: Partial<Record<PremiumType, number>> = {};
  for (const type of PREMIUM_TYPES) result[type] = overrides[type] ?? base;
  return result;
}

const LORD: GridCell = { x: 10, y: 10 };
const LORD_WORLD: readonly OccupiedCell[] = [{ cell: LORD, ownerId: 'lord' }];

describe('SLOT_TYPES', () => {
  it('typy kostry jen na svém místě, suchá mapa 15 typů bez kostry', () => {
    for (const slot of ['river', 'ford', 'trail'] as const)
      expect(SLOT_TYPES[slot]).toEqual(
        PREMIUM_TYPES.filter((t) => SKELETON_PREMIUM_SLOTS[t] === slot),
      );
    expect(SLOT_TYPES.dry).toEqual(PREMIUM_TYPES.filter((t) => !SKELETON_PREMIUM_SLOTS[t]));
    expect(SLOT_TYPES.dry).toHaveLength(15);
  });
});

describe('placeSeat', () => {
  it('prázdný svět, vše suché → střed a nejméně zastoupený typ bez kostry', () => {
    const seat = placeSeat({
      occupied: [],
      request: { kind: 'independent' },
      slotOf: () => 'dry',
      counts: counts(1, { fertile: 0, 'navigable-river': 0 }),
      seed: 7,
    });
    expect(seat).toEqual({ cell: { x: 0, y: 0 }, type: 'fertile' });
  });

  it('R0 jen suchá, R0 + 1 brod a ford-hill chybí → brod na R0 + 1', () => {
    const ford = { x: 13, y: 10 };
    const seat = placeSeat({
      occupied: LORD_WORLD,
      request: { kind: 'invited', lordSeat: LORD },
      slotOf: slotsOf({ [key(ford)]: 'ford' }),
      counts: counts(1, { 'ford-hill': 0 }),
      seed: 3,
    });
    expect(seat).toEqual({ cell: ford, type: 'ford-hill' });
  });

  it('brod až na R0 + 2 je mimo dosah → typ bez kostry na R0', () => {
    const seat = placeSeat({
      occupied: LORD_WORLD,
      request: { kind: 'invited', lordSeat: LORD },
      slotOf: slotsOf({ [key({ x: 14, y: 10 })]: 'ford' }),
      counts: counts(1, { 'ford-hill': 0 }),
      seed: 3,
    });
    expect(cellDistance(seat.cell, LORD)).toBe(2);
    expect(SLOT_TYPES.dry).toContain(seat.type);
  });

  it('vlastní typ kostry v dosahu → ten; bez jeho místa nejméně zastoupený z nabízených', () => {
    const base = {
      occupied: [],
      request: { kind: 'independent' } as const,
      counts: counts(1, { 'mountain-pass': 0, 'iron-ore': 0 }),
      seed: 11,
      owned: 'mountain-pass' as const,
    };
    expect(placeSeat({ ...base, slotOf: slotsOf({ '1,1': 'trail' }) })).toEqual({
      cell: { x: 1, y: 1 },
      type: 'mountain-pass',
    });
    expect(placeSeat({ ...base, slotOf: () => 'dry' })).toEqual({
      cell: { x: 0, y: 0 },
      type: 'iron-ore',
    });
    // Vlastní typ bez kostry patří hráči i proti zastoupení ve světě.
    expect(
      placeSeat({
        ...base,
        owned: 'salt-spring',
        counts: counts(0, { 'salt-spring': 9 }),
        slotOf: () => 'dry',
      }),
    ).toEqual({ cell: { x: 0, y: 0 }, type: 'salt-spring' });
  });

  it('exclude vyřadí políčko i jeho typ', () => {
    const base = {
      occupied: [],
      request: { kind: 'independent' } as const,
      counts: counts(1, { 'ford-hill': 0 }),
      seed: 5,
    };
    expect(placeSeat({ ...base, slotOf: () => 'dry', exclude: [{ x: 0, y: 0 }] }).cell).toEqual({
      x: 0,
      y: 1,
    });
    const slotOf = slotsOf({ '1,0': 'ford' });
    expect(placeSeat({ ...base, slotOf })).toEqual({ cell: { x: 1, y: 0 }, type: 'ford-hill' });
    const without = placeSeat({ ...base, slotOf, exclude: [{ x: 1, y: 0 }] });
    expect(without.cell).toEqual({ x: 0, y: 0 });
    expect(SLOT_TYPES.dry).toContain(without.type);
  });

  it('políčka bez místa pro sídlo přeskočí a hledá v dalších prstencích', () => {
    const slotOf = (cell: GridCell): SeatSlot | null =>
      cellDistance(cell, { x: 0, y: 0 }) <= 2
        ? null
        : cell.x === 3 && cell.y === 0
          ? 'ford'
          : 'dry';
    const base = { occupied: [], request: { kind: 'independent' } as const, slotOf, seed: 1 };
    expect(placeSeat({ ...base, counts: { 'ford-hill': 5 } }).cell).toEqual(
      ringCells({ x: 0, y: 0 }, 3)[0],
    );
    // Okno je celý první prstenec s kandidáty – i brod dál v pořadí prstence.
    expect(placeSeat({ ...base, counts: counts(1, { 'ford-hill': 0 }) })).toEqual({
      cell: { x: 3, y: 0 },
      type: 'ford-hill',
    });
  });

  it('volná políčka mají odstup podle žádosti', () => {
    const occupied: OccupiedCell[] = [];
    for (const cell of ringCells({ x: 0, y: 0 }, 2)) occupied.push({ cell, ownerId: 'x' });
    const seat = placeSeat({
      occupied,
      request: { kind: 'independent' },
      slotOf: () => 'dry',
      counts: {},
      seed: 2,
    });
    for (const o of occupied) expect(cellDistance(seat.cell, o.cell)).toBeGreaterThanOrEqual(3);
  });

  it('nikde místo pro sídlo → skončí výjimkou, nezacyklí se', () => {
    expect(() =>
      placeSeat({
        occupied: LORD_WORLD,
        request: { kind: 'invited', lordSeat: LORD },
        slotOf: () => null,
        counts: {},
        seed: 1,
      }),
    ).toThrow(RangeError);
  });
});

describe('placeCluster s podmínkou políčka', () => {
  it('pán obklopený kostrou do poloměru 3 → shluk na poloměru ≥ 4, bez výjimky', () => {
    const cellOk = (cell: GridCell): boolean => cellDistance(cell, LORD) >= 4;
    const cluster = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const placed = placeCluster(LORD_WORLD, cluster, { kind: 'invited', lordSeat: LORD }, cellOk);
    expect(cellDistance(placed.offset, LORD)).toBeGreaterThanOrEqual(4);
    for (const cell of placed.cells) expect(cellOk(cell)).toBe(true);
    // Bez podmínky na nejbližším prstenci s odstupem.
    const plain = placeCluster(LORD_WORLD, cluster, { kind: 'invited', lordSeat: LORD });
    expect(cellDistance(plain.offset, LORD)).toBe(2);
  });

  it('podmínka nikde nesplněná → skončí výjimkou, nezacyklí se', () => {
    expect(() =>
      placeCluster(LORD_WORLD, [{ x: 0, y: 0 }], { kind: 'invited', lordSeat: LORD }, () => false),
    ).toThrow();
  });
});
