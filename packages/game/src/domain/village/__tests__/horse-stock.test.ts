import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundPen, foundVillage } from '../actions';
import { cancelConstruction } from '../cancel-construction';
import { craftCoverage } from '../crafts';
import { paymentPool } from '../craft-buying';
import {
  HORSE_PEN_NO_SURPLUS,
  horsePenPayment,
  payHorsePen,
  refundHorsePen,
} from '../horse-pen-payment';
import { sowingTargets } from '../field-food';
import { breedingCows, oxenCalvesWanted, surplusCows } from '../husbandry';
import { legumeNeedPerYear } from '../livestock';
import { horsePenValueKg, withHorsePenStock } from '../horse-stock';
import { penSquaresFromCells } from '../placement';
import { HORSE_PEN_STOCK, HORSE_TRADE, TRADE_GOOD_VALUES } from '../rules';
import { advanceVillage } from '../simulate';
import { sellPrice } from '../trade';
import type { PenInput } from '../oxen';
import type { VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling, withoutSmallGame } from './village-fixtures';

// Koně se stavbou ohrady (horses.md – Koně se stavbou ohrady): hodnota 5 600 kg obilí se platí
// předem z přebytku (hřivny → zvířata → obilí nad pojistkou), tři koně přijdou při dokončení.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();

function village(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 100;
  s.storesKg = 0;
  return withoutSmallGame(s);
}

function input(s: VillageState): PenInput {
  const check = penSquaresFromCells(landscape, s, block(4, 4, 1, 1), 'horse', EMPTY);
  expect(check.check.ok).toBe(true);
  return { species: 'horse', squares: check.squares, takenLand: check.takenLand };
}

const pay = (s: VillageState): ReturnType<typeof horsePenPayment> =>
  horsePenPayment(s, s.lastDay, craftCoverage(s, s.lastDay));

describe('cena ohrady koní', () => {
  it('hodnota koní se odvodí z cen obchodu', () => {
    expect(horsePenValueKg()).toBe(
      HORSE_PEN_STOCK.stallions * TRADE_GOOD_VALUES.ridingHorses.valueKg +
        HORSE_PEN_STOCK.mares * TRADE_GOOD_VALUES.mares.valueKg,
    );
    expect(horsePenValueKg()).toBe(5600);
    expect(HORSE_PEN_STOCK.stallionAgeYears).toBeGreaterThanOrEqual(
      HORSE_TRADE.ages.ridingHorses.from,
    );
    expect(HORSE_PEN_STOCK.mareAgeYears).toBeGreaterThanOrEqual(HORSE_TRADE.ages.mares.from);
  });

  it('bez přebytku je stavba zablokovaná', () => {
    const s = village();
    expect(pay(s)).toBeNull();
    expect(() => foundPen(s, s.lastDay, input(s), EMPTY)).toThrow(HORSE_PEN_NO_SURPLUS);
  });

  it('zaplatí se jen hřivnami', () => {
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 500 };
    const p = pay(s)!;
    expect(p.cows + p.grainKg + p.legumesKg + p.horses.length).toBe(0);
    expect(p.ironBarsKg * sellPrice('ironBars')).toBeGreaterThanOrEqual(5600);
    expect(p.ironBarsKg).toBeLessThan(500);
    const next = foundPen(s, s.lastDay, input(s), EMPTY);
    expect(next.crafts!.ironBarsKg).toBe(500 - p.ironBarsKg);
    expect(next.constructions.find((c) => c.kind === 'pen')!.horsePenPaid).toEqual(p);
    expect(s.crafts.ironBarsKg).toBe(500);
  });

  it('kombinuje hřivny, krávy a obilí – obilí nepřekročí přebytek nad pojistkou', () => {
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 20 };
    s.livestock!.herds.cow = 4;
    s.storesKg = 200_000;
    const pool = paymentPool(s, s.lastDay, craftCoverage(s, s.lastDay));
    const p = pay(s)!;
    expect(p.ironBarsKg).toBe(20);
    // krávy nad chovný pár (2 zůstanou)
    expect(p.cows).toBeLessThanOrEqual(2);
    expect(p.cows).toBeGreaterThan(0);
    expect(p.grainKg).toBeGreaterThan(0);
    expect(p.grainKg).toBeLessThanOrEqual(pool.energyKg + 1e-6);
    const value =
      p.ironBarsKg * sellPrice('ironBars') +
      p.cows * sellPrice('cows') +
      p.grainKg * sellPrice('grain') +
      p.legumesKg * sellPrice('legumes');
    expect(value).toBeGreaterThanOrEqual(5600 - 1e-6);
    expect(value).toBeLessThan(5600 + sellPrice('cows'));
    // deterministické
    expect(pay(s)).toEqual(p);
    const next = foundPen(s, s.lastDay, input(s), EMPTY);
    expect(next.livestock!.herds.cow).toBe(4 - p.cows);
    expect(next.livestock!.herds.cow).toBeGreaterThanOrEqual(2);
  });

  it('nesáhne na chovný pár krav, když zvířata nestačí', () => {
    const s = village();
    s.livestock!.herds.cow = 2;
    expect(pay(s)).toBeNull();
  });

  it('s ohradou volů nechá krávy na mléko a voly – platí jen krávami nad ně', () => {
    // Martin 2. 11. 2026 (návrh Clauda): jako porážka – `breedingCows` a krávy na telata
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 20 };
    s.storesKg = 200_000;
    s.pens = [
      {
        id: 900,
        species: 'team',
        cell: { x: 30, y: 30 },
        x: 400,
        z: 400,
        builtDay: s.lastDay - 400,
        team: null,
        training: null,
      },
    ];
    const keep = breedingCows(s) + oxenCalvesWanted(s, s.lastDay);
    expect(keep).toBeGreaterThan(3);
    s.livestock!.herds.cow = 8;
    const p = pay(s)!;
    expect(surplusCows(s, s.lastDay)).toBe(Math.floor(8 - keep + 1e-9));
    expect(p.cows).toBeLessThanOrEqual(surplusCows(s, s.lastDay));
    expect(8 - p.cows).toBeGreaterThanOrEqual(keep - 1e-9);
    // bez ohrady volů jen chovný pár – zaplatí víc krav
    s.pens = [];
    expect(pay(s)!.cows).toBeGreaterThan(p.cows);
  });

  it('zrušení stavby vrátí přesně zaplacené', () => {
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 30 };
    s.livestock!.herds.cow = 4;
    s.storesKg = 200_000;
    const next = foundPen(s, s.lastDay, input(s), EMPTY);
    const c = next.constructions.find((x) => x.kind === 'pen')!;
    const back = cancelConstruction(next, next.lastDay, c.id);
    expect(back.crafts!.ironBarsKg).toBe(30);
    expect(back.livestock!.herds.cow).toBe(4);
    expect(back.storesKg).toBeCloseTo(200_000, 6);
  });
});

/** Hotová ohrada koní se třemi hříbaty (roční) – ves má co prodat. */
function withFoals(s: VillageState): VillageState {
  s.pens = [
    {
      id: 4023,
      species: 'horse',
      cell: { x: 4, y: 4 },
      x: 0,
      z: 0,
      builtDay: DAY - 100,
      team: null,
      training: null,
      horses: [1, 2, 3].map((id) => ({
        id: 9000 + id,
        bornDay: DAY - 365,
        sex: 'male' as const,
        training: 0,
      })),
    },
  ];
  return s;
}

describe('přeplatek zvířetem a pojistka', () => {
  it('zbytek po vejdoucích se kusech doplatí jediným nejlevnějším kusem, který ho pokryje', () => {
    const s = withFoals(village());
    s.livestock!.herds.cow = 4;
    // zbytek ≈ 700: vejde se kráva (600), ze zbylých ≈ 100 doplatí jedna kráva – ne hříbě za 800
    const bars = Math.floor((5600 - 700) / sellPrice('ironBars'));
    const left = 5600 - bars * sellPrice('ironBars');
    expect(left).toBeGreaterThan(sellPrice('cows'));
    expect(left).toBeLessThanOrEqual(sellPrice('foals'));
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: bars };
    const p = pay(s)!;
    expect(p.ironBarsKg).toBe(bars);
    expect(p.cows).toBe(2);
    expect(p.horseCounts).toEqual({});
  });

  it('nejdřív obilí z přebytku, zvíře navíc jen na zbytek', () => {
    const s = withFoals(village());
    const bars = Math.floor((5600 - 2 * sellPrice('foals')) / sellPrice('ironBars'));
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: bars };
    s.storesKg = 200_000;
    const pool = paymentPool(s, s.lastDay, craftCoverage(s, s.lastDay));
    const left = 5600 - bars * sellPrice('ironBars');
    // obilí pokryje celý zbytek – žádné zvíře navíc kromě těch, co se vejdou
    const p = pay(s)!;
    const animalsValue = (p.horseCounts.foals ?? 0) * sellPrice('foals');
    expect(animalsValue + p.grainKg * sellPrice('grain')).toBeGreaterThanOrEqual(left - 1e-6);
    expect(p.grainKg).toBeLessThanOrEqual(pool.energyKg + 1e-6);
    expect(p.cows).toBe(0);
  });

  it('po zaplacení pojistka zásob drží (přebytek nepadne pod nulu)', () => {
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 20 };
    s.livestock!.herds.cow = 4;
    s.storesKg = 200_000;
    const p = pay(s)!;
    const next = structuredClone(s);
    payHorsePen(next, p, next.lastDay);
    const t = sowingTargets(
      next,
      next.lastDay,
      legumeNeedPerYear(next, next.lastDay),
      craftCoverage(next, next.lastDay).pottery,
    );
    expect(t.leftKg - t.bufferKg).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('vrácení koní bez ohrady', () => {
  const mare = { bornDay: DAY - 5 * 365, sex: 'female' as const, training: 0 };

  it('ves bez hotové ohrady koní dostane za koně obilí, ne maso', () => {
    const s = village();
    const payment = {
      ironBarsKg: 0,
      cows: 0,
      horseCounts: { mares: 1 },
      horses: [mare],
      grainKg: 0,
      legumesKg: 0,
    };
    const meatBefore = JSON.stringify(s.livestock);
    refundHorsePen(s, payment, s.lastDay);
    expect(s.storesKg).toBeCloseTo(sellPrice('mares'), 6);
    expect(JSON.stringify(s.livestock)).toBe(meatBefore);
  });

  it('ves s hotovou ohradou koní dostane koně zpět', () => {
    const s = withFoals(village());
    const before = s.pens![0]!.horses!.length;
    refundHorsePen(
      s,
      {
        ironBarsKg: 0,
        cows: 0,
        horseCounts: { mares: 1 },
        horses: [mare],
        grainKg: 0,
        legumesKg: 0,
      },
      s.lastDay,
    );
    expect(s.pens![0]!.horses).toHaveLength(before + 1);
    expect(s.storesKg).toBe(0);
  });
});

describe('koně se stavbou', () => {
  it('v den dokončení se objeví hřebec a dvě klisny', () => {
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 500 };
    let next = foundPen(s, s.lastDay, input(s), EMPTY);
    expect(next.pens![0]!.horses).toBeUndefined();
    next = advanceVillage(next, next.lastDay + 150, EMPTY);
    const pen = next.pens![0]!;
    expect(pen.builtDay).not.toBeNull();
    expect(pen.horses).toHaveLength(3);
    expect(pen.horses!.filter((h) => h.sex === 'male')).toHaveLength(1);
    expect(next.chronicle.some((e) => e.kind === 'horses-arrived')).toBe(true);
  });
});

describe('převod starších vsí', () => {
  function oldVillage(): VillageState {
    const s = village();
    s.pens = [
      {
        id: 4023,
        species: 'horse',
        cell: { x: 4, y: 4 },
        x: 0,
        z: 0,
        builtDay: DAY - 100,
        team: null,
        training: null,
      },
    ];
    return s;
  }

  it('ohrada koní, která koně nikdy neměla, je dostane jednou', () => {
    const s = oldVillage();
    const once = withHorsePenStock(s);
    expect(once.pens![0]!.horses).toHaveLength(3);
    expect(s.pens![0]!.horses).toBeUndefined();
    expect(withHorsePenStock(once)).toBe(once);
  });

  it('ves, která koně už měla, nic nedostane', () => {
    const s = oldVillage();
    s.pens![0]!.horses = [];
    expect(withHorsePenStock(s)).toBe(s);
  });

  it('rozestavěná ohrada koně nedostane', () => {
    const s = oldVillage();
    s.pens![0]!.builtDay = null;
    expect(withHorsePenStock(s)).toBe(s);
  });
});
