import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { departVillage } from '../departure';
import { breedingCows, oxenCalvesWanted, surplusCows } from '../husbandry';
import { neighbourStock } from '../neighbours';
import { LEAVING, NEIGHBOR_DIRECTIONS, SEED_BUYING, TRADE } from '../rules';
import { reservedSeedKg, sowableSeedKg, foodUntilHarvestKg } from '../seed';
import { seedBuyingDay, seedShortKg } from '../seed-buying';
import { fieldSowingTargets } from '../simulate-plan';
import { NO_CRAFTS } from '../productivity';
import { advanceVillage } from '../simulate';
import { buyPrice, sellPrice } from '../trade';
import type { ChronicleEvent, SeasonCrop, VillageState } from '../types';
import { seasonCrop } from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

// Osivo pro ves bez zásob (fields.md – Osivo ze zásob, Osivo pro ves bez zásob; Martin 27. 10.
// 2026: „ok, jak navrhuješ“): osadníci dceřiné vsi si osivo přinesou, ves bez zásob ho 1. 9.
// a 1. 3. koupí u sousedů – hřivnami a kravami nad dvě, které si ves nechává; koupené a přinesené osivo nesní.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const PART_HA = 0.25;

function partsInput(count: number): PartInput[] {
  return Array.from({ length: count }, (_, i) => ({
    areaM2: PART_HA * 10_000,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
}

/** Hotové díly připravené k osevu, bez staveb a bez hospodářského roku, dopočítané do `day`. */
function readyParts(s: VillageState, day: number): VillageState {
  s.constructions = [];
  s.season = null;
  s.lastDay = day;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Ves s `count` díly po 0,25 ha, zásobami `storesKg` a `cows` kravami (bez hřiven). */
function village(count: number, storesKg: number, cows: number): VillageState {
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: partsInput(count) },
  });
  readyParts(s, at(600, 8, 31));
  s.storesKg = storesKg;
  s.livestock!.herds.cow = cows;
  return s;
}

function winterOf(s: VillageState): SeasonCrop | undefined {
  return s.season ? seasonCrop(s.season, 'winter') : undefined;
}

function eventsOf<K extends ChronicleEvent['kind']>(
  s: VillageState,
  kind: K,
): Extract<ChronicleEvent, { kind: K }>[] {
  return s.chronicle.filter((e): e is Extract<ChronicleEvent, { kind: K }> => e.kind === kind);
}

const grainSupply = (s: VillageState, day: number): number =>
  NEIGHBOR_DIRECTIONS.reduce((sum, d) => sum + (neighbourStock(s, d, day).supply.grain ?? 0), 0);

describe('osivo pro ves bez zásob (fields.md – Osivo pro ves bez zásob)', () => {
  it('dceřiná ves zaseje první rok osivem, které osadníci přinesli', () => {
    const day = at(600, 6, 1);
    const mother = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day, dwellingPosition: { x: 100, z: 100, rotation: 0 } }),
    );
    mother.storesKg = 3000;
    const { settlers, state: left } = departVillage(mother, day, [mother.dwellings[0]!.id]);
    const seed = settlers.seedKg ?? 0;
    expect(seed).toBeGreaterThan(2 * LEAVING.seedKgPerCarrier - 1e-9);
    // mateřská ves přišla o jídlo a osivo osadníků, nic víc
    expect(left.storesKg).toBeCloseTo(3000 - settlers.food.grainKg - seed, 6);
    const daughter = readyParts(
      foundVillage({
        seed: 11,
        day,
        dwellingPosition: POSITION,
        firstField: { outline: OUTLINE, parts: partsInput(8) },
        settlers,
      }),
      day,
    );
    // bez krav na prodej – zaseje jen z osiva osadníků
    daughter.livestock!.herds.cow = 0;
    expect(daughter.reservedSeedKg).toBeCloseTo(seed, 6);
    const sown = advanceVillage(daughter, at(600, 10, 31), null);
    expect(winterOf(sown)?.done.sow ?? 0).toBeGreaterThan(0);
    expect(winterOf(sown)?.seedKg ?? 0).toBeGreaterThan(0);
    // bez osiva osadníků by z jídla nezasela
    const without = structuredClone(daughter);
    without.storesKg -= seed;
    delete without.reservedSeedKg;
    const hungry = advanceVillage(without, at(600, 10, 31), null);
    expect(winterOf(hungry)?.done.sow ?? 0).toBe(0);
  }, 60_000);

  it('ves bez zásob s dobytkem koupí 1. 9. osivo za krávy a zaseje', () => {
    const s = village(20, 0, 6);
    expect(grainSupply(s, at(600, 9, 1))).toBeGreaterThan(0);
    const end = advanceVillage(s, at(600, 10, 31), null);
    const bought = eventsOf(end, 'seed-bought');
    expect(bought).toHaveLength(1);
    expect(bought[0]!.day).toBe(at(600, 9, 1));
    expect(bought[0]!.pay.cows ?? 0).toBeGreaterThan(0);
    // dvě krávy zůstaly
    expect(end.livestock!.herds.cow).toBeGreaterThanOrEqual(TRADE.keepCows);
    expect(winterOf(end)?.done.sow ?? 0).toBeGreaterThan(0);
    expect(winterOf(end)?.seedKg ?? 0).toBeGreaterThan(0);
    // sousedům obilí ubylo
    expect(grainSupply(end, at(600, 10, 31))).toBeLessThan(grainSupply(s, at(600, 9, 1)));
  }, 60_000);

  it('za jeden nákup osiva prodá nejvýš SEED_BUYING.maxCows krav', () => {
    const s = village(20, 0, 8);
    const end = advanceVillage(s, at(600, 10, 31), null);
    const bought = eventsOf(end, 'seed-bought');
    expect(bought).toHaveLength(1);
    expect(bought[0]!.pay.cows ?? 0).toBeLessThanOrEqual(SEED_BUYING.maxCows);
  }, 60_000);

  it('za osivo neprodá krávy, které ves drží na mléko a voly – jako porážka', () => {
    // Martin 2. 11. 2026 (návrh Clauda): jen krávy nad chovné (`breedingCows` a krávy na telata)
    const day = at(600, 9, 1);
    const s = village(20, 0, 0);
    s.pens = [
      {
        id: 900,
        species: 'team',
        cell: { x: 100, y: 120 },
        x: 1500,
        z: 1800,
        builtDay: s.lastDay - 400,
        team: null,
        training: null,
      },
    ];
    const keep = breedingCows(s) + oxenCalvesWanted(s, day);
    expect(keep).toBeGreaterThan(TRADE.keepCows + 1);
    s.livestock!.herds.cow = Math.ceil(keep);
    expect(surplusCows(s, day)).toBe(0);
    const end = advanceVillage(s, at(600, 9, 2), null);
    expect(eventsOf(end, 'seed-bought').reduce((sum, e) => sum + (e.pay.cows ?? 0), 0)).toBe(0);
    // bez ohrady volů drží jen chovný pár – krávy nad něj za osivo dá
    const plain = village(20, 0, Math.ceil(keep));
    const sold = advanceVillage(plain, at(600, 9, 2), null);
    expect(eventsOf(sold, 'seed-bought')[0]?.pay.cows ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it('rezervu osiva ves sní při skutečném hladu, jinak ji drží', () => {
    const s = village(4, 300, 4);
    s.reservedSeedKg = 100;
    s.starvationDays = SEED_BUYING.eatFromStarvationDays - 1;
    seedBuyingDay(s, at(600, 7, 1));
    expect(s.reservedSeedKg).toBe(100);
    s.starvationDays = SEED_BUYING.eatFromStarvationDays;
    seedBuyingDay(s, at(600, 7, 2));
    expect(s.reservedSeedKg).toBeUndefined();
  });

  it('1. 12. se uvolní rezerva nad osivo jaře (bez čekajícího osiva celá)', () => {
    const s = village(4, 300, 4);
    s.reservedSeedKg = 100;
    seedBuyingDay(s, at(600, 11, 30));
    expect(s.reservedSeedKg).toBe(100);
    seedBuyingDay(s, at(600, 12, 1));
    expect(s.reservedSeedKg).toBeUndefined();
  });

  it('osivo zakladatelů se do lhůty neuvolní 1. 6. ani 1. 12., po ní jako každá rezerva', () => {
    const s = village(4, 3000, 4);
    s.reservedSeedKg = 1000;
    s.reservedSeedUntilDay = at(602, 3, 1);
    for (const day of [at(600, 12, 1), at(601, 6, 1), at(601, 12, 1)]) {
      seedBuyingDay(s, day);
      expect(s.reservedSeedKg).toBe(1000);
    }
    // lhůta osiva cíle osevu: osivo zakladatelů jídlem není, po lhůtě ano
    const before = fieldSowingTargets(s, at(601, 9, 1), NO_CRAFTS).leftKg;
    const after = fieldSowingTargets(s, at(602, 9, 1), NO_CRAFTS).leftKg;
    expect(after).toBeGreaterThan(before);
    // po lhůtě 1. 6. obyčejné zrno a značka lhůty zmizí
    seedBuyingDay(s, at(602, 6, 1));
    expect(s.reservedSeedKg).toBeUndefined();
    expect(s.reservedSeedUntilDay).toBeUndefined();
    // ve skutečném hladu ji ves sní i v lhůtě
    const hungry = village(4, 3000, 4);
    hungry.reservedSeedKg = 1000;
    hungry.reservedSeedUntilDay = at(610, 1, 1);
    hungry.starvationDays = SEED_BUYING.eatFromStarvationDays;
    seedBuyingDay(hungry, at(600, 10, 2));
    expect(hungry.reservedSeedKg).toBeUndefined();
    expect(hungry.reservedSeedUntilDay).toBeUndefined();
  });

  it('zakladatelé první vsi drží osivo přes 1. 6. – po kouscích dopočtu stejně', () => {
    const start = foundVillage({
      seed: 5,
      day: at(600, 3, 1),
      dwellingPosition: POSITION,
      lord: {},
    });
    const reserved = start.reservedSeedKg ?? 0;
    expect(reserved).toBeGreaterThan(0);
    const end = at(600, 6, 10);
    const whole = advanceVillage(start, end, null);
    const pieces = advanceVillage(advanceVillage(start, at(600, 6, 1), null), end, null);
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    // ozim ani jař ves bez pole nezasela – rezerva přežila 1. 6. celá
    expect(whole.reservedSeedKg).toBe(reserved);
    expect(whole.reservedSeedUntilDay).toBe(start.reservedSeedUntilDay);
  });

  it('ves bez čeho platit nezaseje a zapíše, kolik osiva chybí', () => {
    const s = village(20, 0, TRADE.keepCows);
    const end = advanceVillage(s, at(600, 10, 31), null);
    expect(eventsOf(end, 'seed-bought')).toHaveLength(0);
    const short = eventsOf(end, 'seed-short');
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ day: at(600, 9, 1), reason: 'pay' });
    expect(short[0]!.shortKg).toBeGreaterThan(0);
    expect(winterOf(end)?.done.sow ?? 0).toBe(0);
    // žádná kráva neprodána (stádo jen přirozeně ubývá)
    expect(end.livestock!.herds.cow).toBeGreaterThan(TRADE.keepCows - 0.5);
  }, 60_000);

  it('koupí jen osivo, které chybí – hřivnami, přeplatek do zásob k jídlu', () => {
    // plán ozimu z 1. 9. bez osiva
    const s = advanceVillage(village(20, 0, TRADE.keepCows), at(600, 9, 1), null);
    s.chronicle = [];
    const day = at(601, 3, 1);
    s.lastDay = day - 1;
    const short = seedShortKg(s, day);
    expect(short).toBeGreaterThan(SEED_BUYING.minKg);
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 1000 };
    const events = seedBuyingDay(s, day);
    const barValue = sellPrice('ironBars');
    const bars = Math.ceil((short * buyPrice('grain')) / barValue - 1e-9);
    expect(events).toEqual([
      {
        day,
        kind: 'seed-bought',
        seedKg: expect.closeTo(short, 6) as number,
        changeKg: expect.closeTo((bars * barValue) / buyPrice('grain') - short, 6) as number,
        pay: { ironBarsKg: bars },
      },
    ]);
    expect(s.crafts.ironBarsKg).toBe(1000 - bars);
    expect(reservedSeedKg(s)).toBeCloseTo(short, 6);
    // osivo už nechybí a smí do země i pod prahy přídělu
    expect(seedShortKg(s, day)).toBeCloseTo(0, 6);
    expect(sowableSeedKg(s, 'grain', foodUntilHarvestKg(s, day))).toBeGreaterThanOrEqual(
      short - 1e-6,
    );
    // jiný den ves nekupuje; 1. 6. je nezaseté osivo obyčejné zrno
    expect(seedBuyingDay(s, day + 1)).toEqual([]);
    seedBuyingDay(s, at(601, 6, 1));
    expect(s.reservedSeedKg).toBeUndefined();
  });

  it('po kouscích přes den nákupu stejně jako jedním voláním', () => {
    const start = village(20, 0, 6);
    const end = at(600, 10, 31);
    const whole = advanceVillage(start, end, null);
    expect(eventsOf(whole, 'seed-bought')).toHaveLength(1);
    let pieces = start;
    for (const day of [at(600, 8, 31), at(600, 9, 1), at(600, 9, 2), at(600, 9, 20), end]) {
      pieces = JSON.parse(JSON.stringify(advanceVillage(pieces, day, null))) as VillageState;
    }
    expect(pieces).toEqual(JSON.parse(JSON.stringify(whole)));
  }, 120_000);

  it('ves se zásobami osivo nekupuje', () => {
    const end = advanceVillage(village(20, 4000, 6), at(600, 10, 31), null);
    expect(eventsOf(end, 'seed-bought')).toHaveLength(0);
    expect(eventsOf(end, 'seed-short')).toHaveLength(0);
    expect(end.reservedSeedKg).toBeUndefined();
    expect(end.livestock!.herds.cow).toBeGreaterThan(5.5);
  }, 60_000);
});
