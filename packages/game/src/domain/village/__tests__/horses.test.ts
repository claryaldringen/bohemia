import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { abandonmentDay, stockedPenIds } from '../abandonment';
import { foundPen, foundVillage } from '../actions';
import { cancelConstruction } from '../cancel-construction';
import {
  horseKind,
  horsePlaces,
  horsePens,
  horseRoom,
  penHorses,
  stallionId,
  villageHorses,
} from '../horses';
import {
  PEN,
  PEN_BY_SPECIES,
  penBuildLabor,
  penLaborManDays,
  penTrees,
  type PenInput,
} from '../oxen';
import { penCapacity, penOccupancy, penPlaces, touchingPens } from '../pens';
import { penSquaresFromCells } from '../placement';
import { PEN_FENCE, PEN_PLACES_PER_SQUARE } from '../rules';
import { advanceVillage } from '../simulate';
import type { Horse, Pen, PenSpecies, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Ohrada koní a koně po kusech (horses.md – Ohrada koní, Koně po kusech): čtverec 50 člověkodní
// a 8 stromů, 4 koně na čtverec, hříbě do roku bez vlastního místa.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();

function village(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 100;
  s.storesKg = 50_000;
  return s;
}

function input(s: VillageState, cells: { x: number; y: number }[], species: PenSpecies): PenInput {
  const check = penSquaresFromCells(landscape, s, cells, species, EMPTY);
  expect(check.check.ok).toBe(true);
  return { species, squares: check.squares, takenLand: check.takenLand };
}

function horse(id: number, bornDay: number, sex: Horse['sex'] = 'male'): Horse {
  return { id, bornDay, sex, training: 0 };
}

function horsePen(squares: number, horses: Horse[], built = true): Pen {
  return {
    id: 9,
    species: 'horse',
    cell: { x: 4, y: 4 },
    ...(squares > 1
      ? {
          extraSquares: Array.from({ length: squares - 1 }, (_, i) => ({
            cell: { x: 5 + i, y: 4 },
            x: 0,
            z: 0,
          })),
        }
      : {}),
    x: 0,
    z: 0,
    builtDay: built ? DAY - 100 : null,
    team: null,
    training: null,
    horses,
  };
}

describe('ohrada koní', () => {
  it('čtverec stojí 50 člověkodní a 8 stromů, ostatní ohrady beze změny', () => {
    expect(PEN_BY_SPECIES.horse).toEqual({ laborManDays: 50, trees: 8 });
    expect(penBuildLabor('horse')).toBe(penBuildLabor() + 10 - 2 * 2);
    expect(penBuildLabor('sheep')).toBe(penBuildLabor());
    expect(penTrees(1, 4, 'horse')).toBe(8 - PEN_FENCE.trees + PEN_FENCE.trees);
    expect(penTrees(1, 4)).toBe(PEN.trees);
    expect(penLaborManDays(0, { fell: [] }, 1, 4, 'horse')).toBe(penBuildLabor('horse'));
  });

  it('založení platí 8 stromů a 50 čd, rozšíření jen plot nových stran', () => {
    let s = village();
    const logs = s.woodLogs!;
    s = foundPen(s, s.lastDay, input(s, block(4, 4, 1, 1), 'horse'), EMPTY);
    expect(logs - s.woodLogs!).toBe(8);
    expect(s.constructions.find((c) => c.kind === 'pen')!.cost).toBeCloseTo(penBuildLabor('horse'));
    s = advanceVillage(s, s.lastDay + 120, EMPTY);
    const before = s.woodLogs!;
    const check = penSquaresFromCells(landscape, s, block(4, 5, 1, 1), 'horse', EMPTY);
    expect(check.extendsPen).toBe(s.pens![0]!.id);
    s = foundPen(s, s.lastDay, { species: 'horse', squares: check.squares }, EMPTY);
    // 4 stromy zbytku + 3 nové strany plotu
    expect(before - s.woodLogs!).toBe(8 - PEN_FENCE.trees + 3);
    const ext = s.constructions.find((c) => c.kind === 'pen' && c.done === 0)!;
    expect(ext.cost).toBeCloseTo(penBuildLabor('horse') * 0.875, 6);
  });

  it('rozestavěnou ohradu koní jde zrušit', () => {
    let s = village();
    s = foundPen(s, s.lastDay, input(s, block(4, 4, 1, 1), 'horse'), EMPTY);
    const c = s.constructions.find((x) => x.kind === 'pen')!;
    const next = cancelConstruction(s, s.lastDay, c.id);
    expect(next.pens ?? []).toHaveLength(0);
  });

  it('místa 4 na hotový čtverec; rozestavěný se nepočítá; kapacita stád se nemění', () => {
    const s = village();
    const p = horsePen(2, []);
    p.extraSquares![0]!.constructionId = 3;
    s.pens = [p, { ...horsePen(2, []), id: 10 }];
    expect(penPlaces(s.pens[1]!)).toBe(2 * PEN_PLACES_PER_SQUARE.horse);
    expect(horsePlaces(s)).toBe(4 + 8);
    expect(penCapacity(s)).toEqual({ sheep: 0, goat: 0, pig: 0, cow: 0 });
  });

  it('hříbě do roku nemá vlastní místo, kind podle věku a pohlaví', () => {
    const s = village();
    const foal = horse(1, DAY - 100, 'female');
    const mare = horse(2, DAY - 800, 'female');
    const stallion = horse(3, DAY - 1500);
    s.pens = [horsePen(1, [foal, mare, stallion])];
    expect(villageHorses(s)).toHaveLength(3);
    expect(horseKind(foal, DAY)).toBe('foal');
    expect(horseKind(mare, DAY)).toBe('mare');
    expect(horseKind(stallion, DAY)).toBe('riding');
    expect(horseRoom(s, DAY)).toBe(4 - 2);
    expect(horsePens(s)).toHaveLength(1);
    expect(penHorses(s.pens[0]!)).toHaveLength(3);
    expect(penOccupancy(s).get(9)).toBe(3);
  });

  it('ohrada koní se nespojí s ohradou volů a opačně', () => {
    let s = village();
    s = foundPen(s, s.lastDay, input(s, block(4, 4, 1, 1), 'team'), EMPTY);
    const horseCheck = penSquaresFromCells(landscape, s, block(4, 5, 1, 1), 'horse', EMPTY);
    expect(horseCheck.extendsPen ?? null).toBeNull();
    expect(touchingPens(s.pens!, block(4, 5, 1, 1), 'horse')).toHaveLength(0);
  });

  it('prázdná ohrada koní chátrá, s koňmi ne', () => {
    const s = village();
    s.pens = [horsePen(1, [])];
    expect(stockedPenIds(s).size).toBe(0);
    s.pens = [horsePen(1, [horse(1, DAY - 2000)])];
    expect(stockedPenIds(s).has(9)).toBe(true);
    expect(abandonmentDay(s, DAY, null)).toEqual([]);
  });
});

describe('hřebec (horses.md – Chov)', () => {
  it('je nejstarší samec od 3 let, při shodě nižší id; klisny a hříbata ne', () => {
    const day = dayIndexOf({ year: 601, month: 1, day: 10 });
    const h = (id: number, age: number, sex: 'male' | 'female'): Horse => ({
      id,
      bornDay: Math.round(day - age * 365.25),
      sex,
      training: 0,
    });
    expect(
      stallionId([h(1, 12, 'female'), h(3, 6, 'male'), h(2, 6, 'male'), h(4, 1, 'male')], day),
    ).toBe(2);
    expect(stallionId([h(1, 12, 'female'), h(4, 1, 'male')], day)).toBeUndefined();
  });
});
