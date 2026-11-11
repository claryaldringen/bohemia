import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { eatDiet } from '../diet';
import { fieldStoresKg, storesOutlook } from '../field-food';
import { NO_CRAFTS, storageLossPerYear } from '../productivity';
import { STRAW, THRESHING } from '../rules';
import { advanceVillage } from '../simulate';
import { seedThreshKg } from '../seed';
import {
  addSheaves,
  canThresh,
  sheafWork,
  sheavesOutlook,
  spoilSheaves,
  THRESHED_CROPS,
  THRESH_OVERDUE_END,
  THRESH_URGENT_END,
  threshCrop,
  threshForFoodKg,
  threshSeasonTasks,
  threshTasks,
  threshingCapacity,
  threshingStatus,
  villageSheaves,
  withThreshingGrace,
} from '../threshing';
import type { ChronicleEvent, VillageState } from '../types';
import { craftCoverage } from '../crafts';
import { ageGroup } from '../people';
import { harvestLaborPerDay } from '../simulate-plan';
import { threshingFloorHaulPoints } from '../threshing-floors';
import { THRESHING_FLOOR_ENTRANCE_M } from '../paths/entrances';
import { withThreshingFloor } from './village-fixtures';
import { emptyTaskRecord, seasonCrop, springCrop } from '../year-plan';

// Snopy a výmlat (production-chains.md – Humno; fields.md – Pořadí důležitosti polních prací
// a výmlat do zimy): sklizeň jde do snopů, výmlat je převádí do zásob – ozim a luštěniny od srpna,
// jař od září, do konce února, na humně (kapacita se sčítá), jinak nouzově na udusané zemi; snopy
// po okně se kazí 10 % za měsíc.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];
const field = (count = 75): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
const bare = (day: number, parts = field()): VillageState =>
  foundVillage({
    seed: 42,
    day,
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts },
  });
/** Ztráta zásob obilí za rok bez nádob od hrnčíře (eatDiet ji počítá denně). */
const NO_CRAFTS_LOSS = storageLossPerYear(NO_CRAFTS.pottery);
/** Měsíc ubytku snopů: podíl, který zbude za `days` dní. */
const keep = (days: number): number => (1 - THRESHING.spoilPerMonth) ** ((12 * days) / 365);

type HarvestEvent = Extract<ChronicleEvent, { kind: 'harvest' }>;
const harvests = (s: VillageState): HarvestEvent[] =>
  s.chronicle.filter((e): e is HarvestEvent => e.kind === 'harvest');

/** Ves se snopy (bez polí), humny a odkladem podle potřeby testu. */
function withSheaves(
  day: number,
  sheaves: VillageState['sheaves'],
  floors = 1,
  graceUntil?: number,
  builtDay = day - 10,
): VillageState {
  const s = bare(day);
  s.lastDay = day - 1;
  s.sheaves = structuredClone(sheaves);
  s.threshingFloors = Array.from({ length: floors }, (_, k) => ({
    id: 900 + k,
    position: { x: 100 + 20 * k, z: 0, rotation: 0 },
    builtDay,
  }));
  if (graceUntil !== undefined) s.threshingGraceUntil = graceUntil;
  return s;
}

/** Ves s `count` dospělými navíc (kopie prvního dospělého) – ruce pro výmlat. */
function withHands(s: VillageState, day: number, count: number): VillageState {
  const adult = s.people.find((p) => ageGroup(p, day) === 'adult')!;
  for (let k = 0; k < count; k++) s.people.push({ ...structuredClone(adult), id: 10_000 + k });
  return s;
}

/** Práce vsi za den ve žních – ruce pro výmlat, které simulace ukládá (`threshHands`). */
const handsPerDay = (s: VillageState, day: number): number =>
  harvestLaborPerDay(s, day, craftCoverage(s, day));

/** Ves s rukama pro výmlat dne, jak je simulace uloží na začátku dne. */
function withThreshHands(s: VillageState, day: number): VillageState {
  s.threshHands = handsPerDay(s, day);
  return s;
}

/**
 * Výmlat po dnech jako simulace (mutuje `s`): ubytek snopů na začátku dne, úlohy výmlatu dne
 * s `hands` čd práce denně, dokud snopy nejsou vymlácené. Vrátí, kolik zrna a luštěnin přibylo.
 */
function threshByDays(
  s: VillageState,
  day: number,
  hands: number,
): { grainKg: number; legumesKg: number } {
  const stores = s.storesKg;
  const legumes = s.legumesKg ?? 0;
  for (let d = 0; d < 365 && THRESHED_CROPS.some((c) => sheafWork(s, c) > 1e-9); d++) {
    if (d > 0) spoilSheaves(s, day + d);
    let labor = hands;
    for (const task of threshTasks(s, day + d)) {
      const used = threshCrop(s, task, labor);
      labor -= used.floor + used.ground;
    }
  }
  return { grainKg: s.storesKg - stores, legumesKg: (s.legumesKg ?? 0) - legumes };
}

describe('sklizeň jde do snopů', () => {
  it('úroda i práce výmlatu sklizené části přibudou do snopů, zásoby ne', () => {
    const s = bare(at(600, 3, 15));
    addSheaves(s, 'winter', 300, 4);
    addSheaves(s, 'spring', 500, 6);
    addSheaves(s, 'legume', 80, 2);
    expect(villageSheaves(s)).toEqual({
      grainKg: 800,
      legumesKg: 80,
      work: { winter: 4, spring: 6, legume: 2 },
    });
    expect(s.storesKg).toBe(bare(at(600, 3, 15)).storesKg);
  });

  it('ve vsi s humnem jde sklizeň 31. 8. do snopů a v září je vymlácená do zásob', () => {
    const before = advanceVillage(withThreshingFloor(bare(at(600, 3, 15))), at(600, 8, 30), null);
    const s = advanceVillage(before, at(600, 8, 31), null);
    const harvest = harvests(s).at(-1)!;
    expect(harvest.kg).toBeGreaterThan(0);
    expect(villageSheaves(s).grainKg).toBeCloseTo(springCrop(s.threshingSeason!).harvestedKg!, 6);
    expect(s.storesKg).toBeLessThan(before.storesKg);
    // v září se mlátí na humně – rozdělení práce jde na humno
    const september = advanceVillage(s, at(600, 9, 1), null);
    expect(september.labor!.shares.filter((x) => x.activity === 'thresh')).toEqual([
      expect.objectContaining({ target: { kind: 'threshing-floor', id: 60_000 } }),
    ]);
    expect(september.storesKg).toBeGreaterThan(s.storesKg);
  });
});

describe('výmlat v srpnu a září na humně', () => {
  it('ozim a luštěniny od srpna, jař od září, do konce února; co okno nestihne, dobíhá až nakonec', () => {
    const sheaves = { grainKg: 1000, legumesKg: 100, work: { winter: 10, spring: 20, legume: 5 } };
    // tři humna – kapacita na všechno (jinak by ji vzaly plodiny první v pořadí)
    const august = threshTasks(withSheaves(at(601, 8, 10), sheaves, 3), at(601, 8, 10));
    // okno ozimu a luštěnin srpen–únor (úsek do prosince)
    expect(august.map((t) => [t.crop, t.end, t.overdue])).toEqual([
      ['winter', 12, false],
      ['legume', 12, false],
      // jař v srpnu ještě nebývá – snopy mimo okno se mlátí jako zpožděné, po všem
      ['spring', THRESH_OVERDUE_END, true],
    ]);
    // jedno humno: kapacitu vezme ozim a zbytek luštěniny, jař dnes nic
    const one = threshTasks(withSheaves(at(601, 8, 10), sheaves), at(601, 8, 10));
    expect(one.map((t) => [t.crop, t.floor])).toEqual([
      ['winter', 10],
      ['legume', 2],
      ['spring', 0], // zbytek nouzově na udusané zemi
    ]);
    for (const month of [9, 10, 11, 12]) {
      const tasks = threshTasks(withSheaves(at(601, month, 10), sheaves, 3), at(601, month, 10));
      expect(tasks.map((t) => [t.crop, t.end, t.overdue])).toEqual([
        ['winter', 12, false],
        ['legume', 12, false],
        ['spring', 12, false],
      ]);
    }
    // v lednu a únoru druhý úsek okna
    for (const month of [1, 2]) {
      const tasks = threshTasks(withSheaves(at(602, month, 10), sheaves, 3), at(602, month, 10));
      expect(tasks.map((t) => [t.end, t.overdue])).toEqual([
        [2, false],
        [2, false],
        [2, false],
      ]);
    }
    // zbytky od března – po okně, poslední
    const march = threshTasks(withSheaves(at(602, 3, 10), sheaves, 3), at(602, 3, 10));
    expect(march.every((t) => t.end === THRESH_OVERDUE_END && t.overdue)).toBe(true);
  });

  it('výmlat na dnešní jídlo: chybí-li zrno na jídlo, vymlátí se napřed – před vším ostatním', () => {
    const day = at(601, 8, 10);
    const sheaves = { grainKg: 1000, legumesKg: 0, work: { winter: 10, spring: 30 } };
    const s = withSheaves(day, sheaves);
    s.storesKg = 2;
    expect(threshForFoodKg(s, 6)).toBe(10);
    expect(threshForFoodKg({ storesKg: 20 }, 6)).toBe(0);
    const tasks = threshTasks(s, day, 10);
    // 10 kg ze 1 000 kg snopů = 1 % práce obilí (0,4 čd) – ozim první, na humně
    expect(tasks[0]).toMatchObject({ crop: 'winter', urgent: true, end: THRESH_URGENT_END });
    expect(tasks[0]!.remaining).toBeCloseTo(0.4, 9);
    expect(tasks[1]).toMatchObject({ crop: 'winter', end: 12 });
    expect(tasks[1]!.remaining).toBeCloseTo(10 - 0.4, 9);
    const stores = s.storesKg;
    threshCrop(s, tasks[0]!, tasks[0]!.remaining);
    expect(s.storesKg).toBeCloseTo(stores + 10, 9);
    // bez humna se mlátí nouzově – o 30 % víc práce
    const bareTasks = threshTasks(withSheaves(day, sheaves, 0), day, 10);
    expect(bareTasks[0]).toMatchObject({ crop: 'winter', urgent: true });
    expect(bareTasks[0]!.remaining).toBeCloseTo(
      (0.4 / (1 - THRESHING.emergencyLoss)) * (1 + THRESHING.emergencyWork),
      9,
    );
  });

  it('výmlat na dnešní jídlo nad kapacitu humna: zbytek nouzově o ztrátu víc – zrna tolik, kolik chybí', () => {
    const day = at(601, 8, 10);
    // 25 kg zrna na čd výmlatu; 400 kg na jídlo = 16 čd – humno vezme 12 čd (300 kg), zbylých
    // 100 kg se vymlátí nouzově na udusané zemi (o 10 % méně zrna – mlátí se ho víc)
    const s = withSheaves(day, { grainKg: 1000, legumesKg: 0, work: { winter: 40 } });
    const stores = s.storesKg;
    const [urgent] = threshTasks(s, day, 400);
    expect(urgent).toMatchObject({ crop: 'winter', urgent: true, floor: 12 });
    expect(urgent!.remaining).toBeCloseTo(
      12 + (100 / (25 * (1 - THRESHING.emergencyLoss))) * (1 + THRESHING.emergencyWork),
      9,
    );
    threshCrop(s, urgent!, urgent!.remaining);
    expect(s.storesKg).toBeCloseTo(stores + 400, 9);
  });

  it('výmlat ve svém okně je pro dřinu sezónní úlohou s koncem okna – po okně ne', () => {
    const day = at(601, 8, 10);
    const sheaves = { grainKg: 1000, legumesKg: 0, work: { winter: 120, spring: 40 } };
    // ozim od srpna do konce února (okno přes konec roku); jař má okno až od září
    const february = at(602, 2, 28);
    expect(threshSeasonTasks(withSheaves(day, sheaves), day)).toEqual([
      { remaining: 120, endDay: february },
    ]);
    // bez humna nouzově (vždy, i bez odkladu) – víc práce
    expect(threshSeasonTasks(withSheaves(day, sheaves, 0, day + 100), day)).toEqual([
      { remaining: 120 * (1 + THRESHING.emergencyWork), endDay: february },
    ]);
    expect(threshSeasonTasks(withSheaves(day, sheaves, 0), day)).toEqual([
      { remaining: 120 * (1 + THRESHING.emergencyWork), endDay: february },
    ]);
    // v listopadu i v lednu obě plodiny do konce února, v březnu už žádné okno
    for (const d of [at(601, 11, 5), at(602, 1, 5)]) {
      expect(threshSeasonTasks(withSheaves(d, sheaves), d)).toEqual([
        { remaining: 120, endDay: february },
        { remaining: 40, endDay: february },
      ]);
    }
    expect(threshSeasonTasks(withSheaves(at(602, 3, 5), sheaves), at(602, 3, 5))).toEqual([]);
  });

  it('humno zvládne THRESHING.floorManDaysPerDay za den – víc humen se sčítá', () => {
    const sheaves = { grainKg: 1000, legumesKg: 0, work: { winter: 30 } };
    const one = threshTasks(withSheaves(at(601, 8, 10), sheaves), at(601, 8, 10));
    // 12 čd na humně, zbylých 18 čd nouzově (o 30 % víc práce)
    expect(one).toEqual([
      expect.objectContaining({
        crop: 'winter',
        floor: 12,
        remaining: 12 + 18 * (1 + THRESHING.emergencyWork),
      }),
    ]);
    const two = threshTasks(withSheaves(at(601, 8, 10), sheaves, 2), at(601, 8, 10));
    expect(two[0]).toMatchObject({ floor: 24, remaining: 24 + 6 * (1 + THRESHING.emergencyWork) });
    expect(threshingCapacity(withSheaves(at(601, 8, 10), sheaves, 3), at(601, 8, 10))).toEqual({
      floorManDays: 3 * THRESHING.floorManDaysPerDay,
      emergency: true,
    });
  });

  it('výmlat převede snopy do zásob podílem postupu na práci druhu (obilí ozimu a jaře spolu)', () => {
    const day = at(601, 8, 10);
    const s = withSheaves(day, {
      grainKg: 1000,
      legumesKg: 200,
      work: { winter: 10, spring: 30, legume: 4 },
    });
    const stores = s.storesKg;
    const [winter] = threshTasks(s, day);
    expect(threshCrop(s, winter!, 8)).toEqual({ floor: 8, ground: 0 });
    // 8 ze 40 čd obilí = 20 % obilných snopů
    expect(s.storesKg).toBeCloseTo(stores + 200, 9);
    expect(villageSheaves(s).grainKg).toBeCloseTo(800, 9);
    expect(sheafWork(s, 'winter')).toBeCloseTo(2, 9);
    expect(sheafWork(s, 'spring')).toBe(30);
    // sláma do stohu – 0,75 kg na kg vymláceného zrna (diet.md – Zima bez sena)
    expect(s.hay?.straw?.kg).toBeCloseTo(200 * STRAW.perGrainKg, 9);
    // luštěniny celé – do zásoby luštěnin (sláma jen z obilí)
    const legumes = threshTasks(s, day).find((t) => t.crop === 'legume')!;
    threshCrop(s, legumes, 4);
    expect(s.hay?.straw?.kg).toBeCloseTo(200 * STRAW.perGrainKg, 9);
    expect(s.legumesKg).toBeCloseTo(200, 9);
    expect(villageSheaves(s).legumesKg).toBe(0);
    expect(sheafWork(s, 'legume')).toBe(0);
  });

  it('po celém výmlatu druhu zmizí snopy i práce', () => {
    const day = at(601, 9, 10);
    const s = withSheaves(day, { grainKg: 500, legumesKg: 0, work: { spring: 6 } });
    const stores = s.storesKg;
    threshCrop(s, threshTasks(s, day)[0]!, 6);
    expect(villageSheaves(s)).toEqual({ grainKg: 0, legumesKg: 0 });
    expect(s.storesKg).toBeCloseTo(stores + 500, 9);
  });

  it('v okně výmlatu snopy čekají bez ztráty – i v prosinci a únoru; po únoru se kazí', () => {
    for (const day of [at(601, 9, 10), at(601, 12, 10), at(602, 2, 28)]) {
      const inWindow = withSheaves(day, { grainKg: 500, legumesKg: 0, work: { spring: 6 } });
      spoilSheaves(inWindow, day);
      expect(villageSheaves(inWindow).grainKg).toBe(500);
    }
    const late = withSheaves(at(602, 3, 1), { grainKg: 500, legumesKg: 0, work: { spring: 6 } });
    spoilSheaves(late, at(602, 3, 1));
    expect(villageSheaves(late).grainKg).toBeCloseTo(500 * keep(1), 9);
  });
});

describe('bez humna se mlátí nouzově, snopy mimo okno se kazí', () => {
  it('nová ves bez humna a odkladu mlátí nouzově; snopy mimo okno ubývají 10 % za měsíc', () => {
    const day = at(601, 9, 1);
    const s = withSheaves(day, { grainKg: 1000, legumesKg: 100, work: { spring: 20 } }, 0);
    expect(canThresh(s, day)).toBe(true);
    expect(threshTasks(s, day)).not.toEqual([]);
    // v březnu žádné okno výmlatu – snopy čekají a kazí se
    const winter = at(602, 3, 1);
    const w = withSheaves(winter, { grainKg: 1000, legumesKg: 100, work: { spring: 20 } }, 0);
    for (let d = winter; d < winter + 365 / 12; d++) spoilSheaves(w, d);
    const days = Math.ceil(365 / 12);
    expect(villageSheaves(w).grainKg).toBeCloseTo(1000 * keep(days), 6);
    expect(villageSheaves(w).legumesKg).toBeCloseTo(100 * keep(days), 6);
    expect(keep(365 / 12)).toBeCloseTo(0.9, 12);
    expect(sheafWork(w, 'spring')).toBeCloseTo(20 * keep(days), 6);
  });

  it('ves bez humna sklizeň vymlátí nouzově na udusané zemi (o 10 % méně zrna)', () => {
    const before = advanceVillage(bare(at(600, 3, 15)), at(600, 8, 31), null);
    const kg = villageSheaves(before).grainKg;
    expect(kg).toBeGreaterThan(0);
    // bez humna a bez odkladu se mlátí nouzově, snopy nehnijí
    expect(threshingStatus(before, before.lastDay).emergency).toBe(true);
    expect(sheavesOutlook(before, before.lastDay).grainKg).toBeGreaterThan(0);
    const october = advanceVillage(before, at(600, 10, 31), null);
    expect(villageSheaves(october).grainKg).toBe(0);
    // zásoby přibyly o vymlácené zrno (po odečtu jídla za dobu)
    const need = before.people.length * 2 * 61;
    expect(october.storesKg).toBeGreaterThan(before.storesKg + kg * 0.5 - need);
    expect(threshingStatus(october, october.lastDay).emergency).toBe(false);
  });
});

describe('starší ves – rok odkladu, nouzový výmlat na udusané zemi', () => {
  it('převod jednou: prázdné snopy a odklad rok od dneška; ves se snopy beze změny', () => {
    const old = bare(at(600, 3, 15));
    delete old.sheaves;
    const converted = withThreshingGrace(old, at(600, 6, 1));
    expect(converted.sheaves).toEqual({ grainKg: 0, legumesKg: 0 });
    expect(converted.threshingGraceUntil).toBe(at(600, 6, 1) + THRESHING.graceDays);
    expect(withThreshingGrace(converted, at(601, 1, 1))).toBe(converted);
    // nová ves odklad nemá
    const fresh = bare(at(600, 3, 15));
    expect(withThreshingGrace(fresh)).toBe(fresh);
    expect(fresh.threshingGraceUntil).toBeUndefined();
    // simulace převede ves uloženou dřív od dne po posledním dopočítaném
    const advanced = advanceVillage(old, old.lastDay + 1, null);
    expect(advanced.threshingGraceUntil).toBe(old.lastDay + 1 + THRESHING.graceDays);
  });

  it('nouzově o 30 % víc práce a o 10 % méně zrna; bez omezení místa', () => {
    const day = at(601, 9, 10);
    const s = withSheaves(day, { grainKg: 1000, legumesKg: 0, work: { spring: 20 } }, 0, day + 100);
    expect(threshingCapacity(s, day)).toEqual({ floorManDays: 0, emergency: true });
    const [task] = threshTasks(s, day);
    expect(task).toMatchObject({ crop: 'spring', floor: 0 });
    expect(task!.remaining).toBeCloseTo(20 * (1 + THRESHING.emergencyWork), 9);
    const stores = s.storesKg;
    expect(threshCrop(s, task!, 13)).toEqual({ floor: 0, ground: 13 });
    // 13 čd nouzově = 10 čd postupu = polovina snopů, z nich 90 % do zásob
    expect(sheafWork(s, 'spring')).toBeCloseTo(10, 9);
    expect(villageSheaves(s).grainKg).toBeCloseTo(500, 9);
    expect(s.storesKg).toBeCloseTo(stores + 500 * (1 - THRESHING.emergencyLoss), 9);
    // výhled počítá snopy o ztrátu méně
    expect(sheavesOutlook(s, day).grainKg).toBeCloseTo(500 * (1 - THRESHING.emergencyLoss), 9);
    expect(threshingStatus(s, day).emergency).toBe(true);
  });

  it('humno, které v odkladu nestačí, mlátí plným tempem a zbytek nouzově', () => {
    const day = at(601, 9, 10);
    const s = withSheaves(day, { grainKg: 1000, legumesKg: 0, work: { spring: 20 } }, 1, day + 100);
    const [task] = threshTasks(s, day);
    expect(task!.floor).toBe(12);
    expect(task!.remaining).toBeCloseTo(12 + 8 * (1 + THRESHING.emergencyWork), 9);
    const stores = s.storesKg;
    threshCrop(s, task!, task!.remaining);
    expect(villageSheaves(s).grainKg).toBe(0);
    expect(s.storesKg).toBeCloseTo(stores + 600 + 400 * (1 - THRESHING.emergencyLoss), 9);
  });

  it('převedená ves mlátí nouzově i po roce odkladu', () => {
    const old = advanceVillage(bare(at(600, 3, 15)), at(600, 6, 1), null);
    delete old.sheaves;
    const converted = withThreshingGrace(old, at(600, 6, 2));
    const harvested = advanceVillage(converted, at(600, 8, 31), null);
    const kg = villageSheaves(harvested).grainKg;
    expect(kg).toBeGreaterThan(0);
    // výmlat do konce února (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)
    const winter = advanceVillage(harvested, at(601, 2, 28), null);
    expect(villageSheaves(winter).grainKg).toBe(0);
    // nouzový výmlat – o 10 % zrna méně; zásoby k tomu ubyly jídlem
    expect(winter.storesKg).toBeLessThan(harvested.storesKg + kg * 0.9 + 1e-6);
    // po roce odkladu bez humna se dál mlátí nouzově – snopy nečekají
    const next = advanceVillage(winter, at(602, 2, 28), null);
    expect(villageSheaves(next).grainKg).toBe(0);
  });
});

describe('výhled jídla a zásob k sklizni', () => {
  it('snopy, které ves vymlátí, jsou ve výhledu jako zrno – bez humna a odkladu ne', () => {
    const day = at(601, 9, 10);
    const floor = withSheaves(day, { grainKg: 800, legumesKg: 50, work: { spring: 10 } });
    // humno stihne výmlat v okně – bez ztrát
    expect(sheavesOutlook(floor, day)).toEqual({ grainKg: 800, legumesKg: 50 });
    expect(fieldStoresKg(floor, day)).toBeCloseTo(floor.storesKg + 850, 9);
    expect(fieldStoresKg(floor)).toBeCloseTo(floor.storesKg, 9);
    // bez humna se mlátí nouzově – výhled počítá o ztrátu méně
    const none = withSheaves(day, { grainKg: 800, legumesKg: 50, work: { spring: 10 } }, 0);
    expect(fieldStoresKg(none, day)).toBeCloseTo(
      none.storesKg + 800 * (1 - THRESHING.emergencyLoss) + 50,
      9,
    );
    // výhled zásob počítá snopy jako zásobu
    const withSheavesTarget = storesOutlook(floor, day, NO_CRAFTS.pottery);
    const withoutTarget = storesOutlook(none, day, NO_CRAFTS.pottery);
    expect(withSheavesTarget.leftKg).toBeGreaterThanOrEqual(withoutTarget.leftKg);
  });

  it('jídlo: výhled se snopy nehladoví, jí se jen vymlácené obilí', () => {
    const base = {
      grainKg: 10,
      meatKg: 0,
      fruitKg: 0,
      needPerDay: 4,
      daysToHarvest: 300,
      daysToRot: 0,
      daysToMeatEnd: 1,
      potteryCoverage: NO_CRAFTS.pottery,
    };
    const without = eatDiet(base);
    expect(without.outlook).toBeLessThan(0.1);
    const withSheaf = eatDiet({ ...base, sheavesGrainKg: 2000 });
    expect(withSheaf.outlook).toBe(1);
    // dnes se sní nejvýš vymlácené zrno – celá dnešní potřeba ze zásob
    const keptKg = 10 * (1 - NO_CRAFTS_LOSS) ** (1 / 365);
    expect(keptKg - withSheaf.grainKg).toBeCloseTo(4, 9);
    expect(withSheaf.diet.energy).toBeCloseTo(1, 9);
    // bez vymláceného zrna se nesní nic – výhled se snopy je plný, ale energie dne nulová (ves
    // pak hladoví podle snědeného – simulace, production-chains.md – Humno)
    const empty = eatDiet({ ...base, grainKg: 0, sheavesGrainKg: 2000 });
    expect(empty.outlook).toBe(1);
    expect(empty.grainKg).toBe(0);
    expect(empty.diet.energy).toBe(0);
  });

  it('výhled po druzích snopů: humno bere snopy v pořadí výmlatu – výhled dá, co výmlat dne vymlátí', () => {
    const day = at(601, 8, 10);
    // ozim i luštěniny mají okno v srpnu – humno (12 čd) vezme napřed ozim (pořadí plodin), zbytek
    // luštěnin (8 z 10 čd) jde nouzově; dřív společný podíl 8/20 nouzově pro oba druhy
    const s = withSheaves(day, { grainKg: 400, legumesKg: 200, work: { winter: 10, legume: 10 } });
    const outlook = sheavesOutlook(s, day);
    expect(outlook.grainKg).toBeCloseTo(400, 9);
    expect(outlook.legumesKg).toBeCloseTo((200 * (2 + 8 * (1 - THRESHING.emergencyLoss))) / 10, 9);
    // celý výmlat dne (dost rukou) dá přesně výhled
    const stores = s.storesKg;
    const legumes = s.legumesKg ?? 0;
    for (const task of threshTasks(s, day)) threshCrop(s, task, task.remaining);
    expect(s.storesKg - stores).toBeCloseTo(outlook.grainKg, 9);
    expect((s.legumesKg ?? 0) - legumes).toBeCloseTo(outlook.legumesKg, 9);
  });

  it('výhled se ztrátami: nouzově o 10 % méně – přebytek nad kapacitu humen se mlátí hned, nic se nekazí', () => {
    const day = at(601, 9, 10);
    const sheaves = { grainKg: 1000, legumesKg: 0, work: { spring: 120 } };
    // odklad bez humna – celé nouzově
    const ground = withSheaves(day, sheaves, 0, day + 100);
    expect(sheavesOutlook(ground, day).grainKg).toBeCloseTo(
      1000 * (1 - THRESHING.emergencyLoss),
      9,
    );
    // humno v odkladu – 12 čd na humně, zbytek nouzově
    const mixedYield = 1000 * (1 - THRESHING.emergencyLoss * (108 / 120));
    const mixed = withSheaves(day, sheaves, 1, day + 100);
    expect(sheavesOutlook(mixed, day).grainKg).toBeCloseTo(mixedYield, 9);
    // jedno humno i mimo odklad: přebytek nad 12 čd se mlátí nouzově, nic se nekazí
    expect(sheavesOutlook(withSheaves(day, sheaves), day).grainKg).toBeCloseTo(mixedYield, 9);
    const slow = withSheaves(day, { ...sheaves, work: { spring: 600 } });
    expect(sheavesOutlook(slow, day).grainKg).toBeCloseTo(
      1000 * (1 - THRESHING.emergencyLoss * (588 / 600)),
      9,
    );
  });

  it('výhled s rukama vsi do konce okna: humno mlátí víc dní – dřív výhled počítal všechno dnes', () => {
    // 1. 9.: 200 čd výmlatu jaře, jedno humno, ruce ≈ 36 čd denně (žňový den – poloviční minimum,
    // den 1,1 – population.md, Skladba dne podle ročního období) – humno mlátí 8 dní
    const day = at(601, 9, 1);
    const sheaves = { grainKg: 2000, legumesKg: 0, work: { spring: 200 } };
    const s = withThreshHands(withHands(withSheaves(day, sheaves), day, 28), day);
    const hands = s.threshHands!;
    expect(hands).toBeGreaterThan(30);
    expect(hands).toBeLessThan(40);
    const outlook = sheavesOutlook(s, day);
    // výhled = výmlat po dnech s rukama vsi (bez kazení – okno stačí)
    expect(outlook.grainKg).toBeCloseTo(threshByDays(structuredClone(s), day, hands).grainKg, 6);
    // dřív: 12 čd na humně a 188 nouzově hned dnes – 90,6 %
    const allToday = 2000 * ((12 + 188 * (1 - THRESHING.emergencyLoss)) / 200);
    expect(allToday).toBeCloseTo(1812, 9);
    expect(outlook.grainKg).toBeGreaterThan(allToday + 60);
    expect(outlook.grainKg).toBeLessThan(2000);
    // bez rukou ve stavu (ves před prvním dopočítaným dnem) výmlat dne při dost rukou
    delete s.threshHands;
    expect(sheavesOutlook(s, day).grainKg).toBeCloseTo(allToday, 9);
  });

  it('výhled s rukama vsi: co ruce do konce okna nestihnou, se kazí; v okně se nekazí nic', () => {
    // malá ves (≈ 2,4 čd rukou denně) – všechno na humně, bez nouzového výmlatu
    const sheaves = { grainKg: 1000, legumesKg: 0, work: { spring: 60 } };
    const early = at(601, 9, 1);
    const fits = withThreshHands(withSheaves(early, sheaves), early);
    expect(fits.threshHands! * 30).toBeGreaterThan(60);
    expect(sheavesOutlook(fits, early).grainKg).toBeCloseTo(1000, 9);
    // 23. 2. zbývá 6 dní okna (do konce února) – zbytek se po okně kazí, než ho ruce vymlátí
    const late = at(602, 2, 23);
    const s = withThreshHands(withSheaves(late, sheaves), late);
    const hands = s.threshHands!;
    expect(hands * 6).toBeLessThan(60);
    const outlook = sheavesOutlook(s, late);
    expect(outlook.grainKg).toBeCloseTo(threshByDays(structuredClone(s), late, hands).grainKg, 6);
    expect(outlook.grainKg).toBeLessThan(1000 - 10);
  });

  it('výhled s rukama vsi: v srpnu má přednost žeň jaře – výmlat dostane jen zbytek rukou', () => {
    const day = at(601, 8, 10);
    const hands = handsPerDay(withSheaves(day, { grainKg: 1000, legumesKg: 0 }), day);
    // výmlat na 195 dní rukou: v okně ozimu (10. 8. – 28. 2., 203 dní) se stihne, od října
    // (151 dní) ne
    const sheaves = { grainKg: 1000, legumesKg: 0, work: { winter: hands * 195 } };
    const idle = withThreshHands(withSheaves(day, sheaves), day);
    expect(idle.threshHands).toBeCloseTo(hands, 9);
    // bez žně stihnou ruce výmlat v okně – bez ztrát
    expect(sheavesOutlook(idle, day).grainKg).toBeCloseTo(1000, 9);
    // žeň jaře vezme všechny ruce do konce svého okna (září – fields.md, Žeň jaře i v září) – ozim
    // na humně čeká v okně bez ztrát, po okně se kazí, než ho ruce vymlátí
    const busy = structuredClone(idle);
    busy.season = {
      startDay: at(600, 9, 1),
      crops: [
        {
          crop: 'spring',
          partIds: [],
          required: { ...emptyTaskRecord(), harvest: 1000 },
          done: emptyTaskRecord(),
          harvestedKg: null,
        },
      ],
    };
    const outlook = sheavesOutlook(busy, day);
    expect(outlook.grainKg).toBeLessThan(1000 - 10);
    // po konci okna žně jaře všechny ruce – ozim se mezitím kazí (výmlat po dnech od 1. 10. je
    // horní odhad: září žeň jaře výmlatu nechá jen zbytek rukou)
    expect(outlook.grainKg).toBeLessThanOrEqual(
      threshByDays(structuredClone(idle), at(601, 10, 1), idle.threshHands!).grainKg + 1e-6,
    );
  });

  it('simulace ukládá ruce pro výmlat na začátku dne – výhled je pak má', () => {
    const s = advanceVillage(bare(at(601, 3, 1)), at(601, 3, 10), null);
    expect(s.threshHands).toBeGreaterThan(0);
  });

  it('ves s prázdnými zásobami před žní nehladoví potají: energie pod 0,9 jen s hladem', () => {
    // ves s humnem a zásobami jen na pár dní před sklizní ozimu – po žni mlátí na dnešní jídlo
    let s = advanceVillage(
      withThreshingFloor(bare(at(600, 3, 15), field(150))),
      at(601, 7, 20),
      null,
    );
    s.storesKg = 30;
    let lowWithoutHunger = 0;
    let low = 0;
    for (let d = at(601, 7, 21); d <= at(601, 9, 30); d++) {
      s = advanceVillage(s, d, null);
      const energy = s.diet?.energy ?? 1;
      // od září bere setí ozimu osivo do roční potřeby ze zásob i za cenu šetření (fields.md –
      // Úroda, Osivo ze zásob) – dosyta se měří do konce srpna
      if (energy < 0.9 && d < at(601, 9, 1)) low++;
      if (energy < 0.9 && !s.hungry) lowWithoutHunger++;
    }
    expect(lowWithoutHunger).toBe(0);
    // výmlat na dnešní jídlo – ves s humnem a snopy jí dosyta
    expect(low).toBe(0);
    // ves bez humna po žni mlátí nouzově; kdyby přesto strádala, ví to (hlad podle energie)
    let bareVillage = advanceVillage(bare(at(600, 3, 15), field(150)), at(601, 7, 20), null);
    bareVillage.storesKg = 30;
    let hungryDays = 0;
    for (let d = at(601, 7, 21); d <= at(601, 9, 30); d++) {
      bareVillage = advanceVillage(bareVillage, d, null);
      const energy = bareVillage.diet?.energy ?? 1;
      expect(energy >= 0.9 || bareVillage.hungry).toBe(true);
      if (bareVillage.hungry) hungryDays++;
    }
    expect(hungryDays).toBeGreaterThanOrEqual(0);
  });

  it('čekající výmlat podzimní práci nebere – příprava půdy pod ozim má přednost (fields.md – Pořadí důležitosti polních prací)', () => {
    const august = advanceVillage(withThreshingFloor(bare(at(600, 3, 15))), at(601, 8, 31), null);
    // příprava půdy pod ozim (bez snopů ves nemá osivo – měří se kopání, vracení a orba)
    const winterSown = (s: VillageState): number => {
      const work = seasonCrop(advanceVillage(s, at(601, 10, 31), null).season, 'winter');
      return work ? work.done.dig + work.done.reclaim + (work.plough?.done ?? 0) : 0;
    };
    const free = structuredClone(august);
    free.sheaves = { grainKg: 0, legumesKg: 0 };
    // velký nevymlácený výmlat v roce odkladu bez humna – počká za přípravou půdy
    const busy = structuredClone(august);
    delete busy.threshingFloors;
    busy.threshingGraceUntil = at(602, 6, 1);
    busy.sheaves = { grainKg: 50_000, legumesKg: 0, work: { spring: 5000 } };
    expect(winterSown(free)).toBeGreaterThan(0);
    // výmlat přípravě nic nevezme: ves se snopy připraví aspoň tolik jako ves bez nich – od
    // přílohové soustavy (10. 11. 2026) dostanou ozim i díly v osevu a ves bez snopů (bez osiva)
    // má čelo práce plné nezasetých dílů, takže připraví méně
    expect(winterSown(busy)).toBeGreaterThanOrEqual(winterSown(free) - 1e-9);
  });
});

describe('nošení a vozy k humnu', () => {
  it('vozy se snopy jedou ke vstupu hotových humen rovným dílem; rozestavěné ne', () => {
    const s = withSheaves(at(601, 9, 1), { grainKg: 0, legumesKg: 0 }, 2);
    s.threshingFloors!.push({ id: 950, position: { x: -50, z: 0, rotation: 0 }, builtDay: null });
    const points = threshingFloorHaulPoints(s);
    expect(points).toHaveLength(2);
    // vstup na předku (+z) – kus před mlatem 8 × 10 m
    expect(points[0]!.x).toBeCloseTo(100, 9);
    expect(points[0]!.z).toBeCloseTo(THRESHING_FLOOR_ENTRANCE_M, 9);
    expect(points.every((p) => p.weight === 0.5)).toBe(true);
    expect(threshingFloorHaulPoints(bare(at(601, 9, 1)))).toEqual([]);
  });
});

describe('stav výmlatu pro upozornění', () => {
  it('nouzový výmlat – jen ves bez hotového humna a se snopy', () => {
    const s = advanceVillage(bare(at(600, 3, 15)), at(600, 5, 20), null);
    // před sklizní žádné snopy – nic se nehlásí
    expect(threshingStatus(s, s.lastDay).emergency).toBe(false);
    const harvested = advanceVillage(s, at(600, 8, 31), null);
    expect(threshingStatus(harvested, harvested.lastDay).emergency).toBe(true);
    // s hotovým humnem se nouzově nemlátí
    const built = withThreshingFloor(structuredClone(harvested));
    expect(threshingStatus(built, built.lastDay).emergency).toBe(false);
  });

  it('humno nestačí – výmlat po konci okna mimo odklad, když humno stálo celé okno', () => {
    const sheaves = { grainKg: 500, legumesKg: 0, work: { spring: 6 } };
    // okno výmlatu jaře do konce února – v březnu je výmlat po okně
    const short = withSheaves(at(602, 3, 5), sheaves, 1, undefined, at(600, 5, 1));
    expect(threshingStatus(short, at(602, 3, 5))).toMatchObject({
      floorShort: true,
      emergency: false,
    });
    // v den žně jsou snopy čerstvé – okno výmlatu začíná zítra
    const fresh = withSheaves(at(601, 8, 31), sheaves, 1, undefined, at(600, 5, 1));
    expect(threshingStatus(fresh, at(601, 8, 31)).floorShort).toBe(false);
    expect(sheavesOutlook(fresh, at(601, 8, 31)).grainKg).toBeCloseTo(500, 9);
    // humno postavené až v září – zpoždění je z pozdní stavby, jedno humno stačí
    const late = withSheaves(at(602, 3, 5), sheaves, 1, undefined, at(601, 9, 20));
    expect(threshingStatus(late, at(602, 3, 5)).floorShort).toBe(false);
    const inWindow = withSheaves(at(601, 9, 5), {
      grainKg: 500,
      legumesKg: 0,
      work: { spring: 6 },
    });
    expect(threshingStatus(inWindow, at(601, 9, 5)).floorShort).toBe(false);
  });
});

describe('výmlat do zimy (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)', () => {
  it('výmlat na osivo: hromada osiva narazila na vymlácené zrno – osivo napřed, za výmlatem na jídlo', () => {
    const day = at(601, 9, 10);
    const sheaves = { grainKg: 5000, legumesKg: 0, work: { winter: 200 } };
    const s = withSheaves(day, sheaves);
    s.storesKg = 0;
    s.sowingSeed = { crop: 'winter', totalKg: 2000, days: 40, kg: 0 };
    const seedKg = seedThreshKg(s, day, NO_CRAFTS.tools);
    expect(seedKg).toBeGreaterThan(0);
    expect(seedKg).toBeLessThanOrEqual(2000);
    const tasks = threshTasks(s, day, 10, seedKg);
    expect(tasks[0]).toMatchObject({ crop: 'winter', urgent: true });
    expect(tasks[1]).toMatchObject({ crop: 'winter', seed: true, end: THRESH_URGENT_END });
    // 25 kg zrna na čd výmlatu – osivo na humně za výmlatem na jídlo (0,4 čd)
    expect(tasks[1]!.floor).toBeCloseTo(Math.min(seedKg / 25, 12 - 0.4), 9);
    expect(tasks[2]).toMatchObject({ crop: 'winter', end: 12 });
    // vymlácené zrno osivo pokryje – hromada je pod ním, výmlat na osivo není
    const covered = withSheaves(day, sheaves);
    covered.storesKg = 10_000;
    covered.sowingSeed = { crop: 'winter', totalKg: 2000, days: 40, kg: 2000 };
    expect(seedThreshKg(covered, day, NO_CRAFTS.tools)).toBe(0);
    // mimo okno setí (hromada zimního osiva) ne
    const winter = withSheaves(at(601, 12, 10), sheaves);
    winter.storesKg = 0;
    winter.sowingSeed = { crop: 'spring', totalKg: 2000, days: 0, kg: 0, beforeWindow: true };
    expect(seedThreshKg(winter, at(601, 12, 10), NO_CRAFTS.tools)).toBe(0);
  });

  it('determinismus: od žní do jara vcelku = po dnech', () => {
    const start = advanceVillage(withThreshingFloor(bare(at(600, 3, 15))), at(600, 7, 31), null);
    const whole = advanceVillage(start, at(601, 3, 31), null);
    let daily = start;
    for (let d = at(600, 8, 1); d <= at(601, 3, 31); d++) daily = advanceVillage(daily, d, null);
    expect(daily).toEqual(whole);
    // snopy vymlácené do konce února
    expect(villageSheaves(advanceVillage(start, at(601, 2, 28), null)).grainKg).toBe(0);
  });
});
