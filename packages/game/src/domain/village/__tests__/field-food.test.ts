import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { DIET } from '../diet';
import {
  closeFieldFoodYear,
  fieldFoodShare,
  fieldShareOf,
  recordFieldFood,
  storesOutlook,
  steadyHarvestKg,
  storesTargetKg,
  storesLeft,
  storesNeeded,
  yearlyFieldNeed,
  yearlyFoodNeed,
} from '../field-food';
import { expectedYearlyFoodNeed } from '../food-outlook';
import { hasGoodStores } from '../happiness';
import { daysUntilHarvest } from '../food';
import { daysUntilLegumeHarvest, legumeEnergy } from '../legumes';
import { expectedNetKg } from '../fields';
import { NO_CRAFTS, storageLossPerYear } from '../productivity';
import { FIELD_FOOD, FIELD_STORES, FOOD_NEED_KG_PER_YEAR, LEGUMES } from '../rules';
import { advanceVillage } from '../simulate';
import { withThreshingFloor, withoutSmallGame } from './village-fixtures';
import type { DietDay, VillageState } from '../types';
import { seasonCrops } from '../year-plan';

// Osev podle stravy a podle zásob (fields.md – Kolik ves oseje, Osev podle stravy, Osev podle
// zásob).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Pole ≈ 4 ha – víc, než ves oseje, ať osev určuje cíl, ne půda. */
const field = (count = 180): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((150 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

// ves s humnem – mlátí hned po žni (production-chains.md – Humno)
const found = (day: number, parts = 180): VillageState =>
  withoutSmallGame(
    withThreshingFloor(
      foundVillage({
        seed: 42,
        day,
        dwellingPosition: POSITION,
        firstField: { outline: OUTLINE, parts: field(parts) },
      }),
    ),
  );

const diet = (shares: Partial<DietDay['shares']>): DietDay => ({
  energy: 1,
  protein: 1,
  diversity: 1,
  satiation: 1,
  shares: { grain: 0, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0, ...shares },
});

/** Ves bez polí s danými lidmi (2 dospělí, 2 děti) a zásobami. */
function village(stores = 0): VillageState {
  const day = at(600, 9, 1);
  const s = found(at(600, 3, 1));
  s.storesKg = stores;
  return { ...s, lastDay: day - 1 };
}

describe('podíl jídla z pole', () => {
  it('pole dá, co nepokryje maso, mléko a sýr, vejce a ovoce – nejméně nic', () => {
    const mixed = diet({ grain: 0.3, meat: 0.4, dairy: 0.2, eggs: 0.05, fruit: 0.05 });
    expect(fieldShareOf(mixed)).toBeCloseTo(0.3, 12);
    // luštěniny a obilí jsou z pole – podíl neubírají
    expect(fieldShareOf(diet({ grain: 0.5, legumes: 0.25 }))).toBe(1);
    expect(fieldShareOf(diet({ meat: 0.4, dairy: 0.3, fruit: 0.25, eggs: 0.1 }))).toBe(0);
  });

  it('plánovaný podíl: bez změřeného roku 1, jinak změřený, nejméně FIELD_FOOD.minShare', () => {
    expect(fieldFoodShare({})).toBe(1);
    expect(fieldFoodShare({ fieldFood: { needKg: 10, fieldKg: 5 } })).toBe(1);
    expect(fieldFoodShare({ fieldFood: { needKg: 0, fieldKg: 0, share: 0.45 } })).toBe(0.45);
    expect(fieldFoodShare({ fieldFood: { needKg: 0, fieldKg: 0, share: 0.1 } })).toBe(
      FIELD_FOOD.minShare,
    );
  });

  it('pojistka = co maso a mléko na svých stropech nepokryjí (diet.md)', () => {
    expect(FIELD_FOOD.minShare).toBeCloseTo(1 - DIET.caps.meat - DIET.caps.dairy, 12);
  });

  it('součty běží od 1. 9. – první 1. 9. je začne, další spočítá podíl celého roku', () => {
    const s = village();
    recordFieldFood(s, 2, diet({ meat: 0.5 }));
    expect(s.fieldFood).toBeUndefined(); // před prvním 1. 9. se nesčítá
    closeFieldFoodYear(s);
    expect(s.fieldFood).toEqual({ needKg: 0, fieldKg: 0 });
    recordFieldFood(s, 2, diet({ meat: 0.5 })); // 1 kg z pole
    recordFieldFood(s, 2, diet({ meat: 0.4, dairy: 0.3 })); // 0,6 kg z pole
    recordFieldFood(s, 0, diet({ meat: 1 })); // nikdo nejí – nic
    expect(s.fieldFood?.needKg).toBe(4);
    expect(s.fieldFood?.fieldKg).toBeCloseTo(1.6, 12);
    closeFieldFoodYear(s);
    expect(s.fieldFood?.needKg).toBe(0);
    expect(s.fieldFood?.fieldKg).toBe(0);
    expect(s.fieldFood?.share).toBeCloseTo(0.4, 12);
  });
});

describe('zásoby za rok – spotřeba a ztráty skladováním', () => {
  it('storesLeft a storesNeeded jsou navzájem obrácené a sedí se simulací den po dni', () => {
    const loss = storageLossPerYear(NO_CRAFTS.pottery);
    expect(storesLeft(storesNeeded(300, 1000, 1, loss), 1000, 1, loss)).toBeCloseTo(300, 9);
    expect(storesNeeded(0, 0, 1, 0)).toBe(0);
    expect(storesLeft(100, 500, 1, loss)).toBe(0); // dojde dřív – nejméně nic
    // den po dni: ztráta jako v jídle dne, pak spotřeba
    let stock = 2000;
    for (let d = 0; d < 365; d++) stock = stock * (1 - loss) ** (1 / 365) - 1000 / 365;
    expect(storesLeft(2000, 1000, 1, loss)).toBeCloseTo(stock, 0);
  });
});

describe('výhled zásob k sklizni', () => {
  const day = at(600, 9, 1);
  const loss = storageLossPerYear(NO_CRAFTS.pottery);
  const targetsOf = (s: VillageState): ReturnType<typeof storesOutlook> =>
    storesOutlook(s, day, NO_CRAFTS.pottery);
  // potřeba podle růstu vsi – do sklizně 31. 8. a rok po ní (Osev podle růstu vsi)
  const harvestDay = day + daysUntilHarvest(day) - 1;
  const yearlyNow = (s: VillageState): number => expectedYearlyFoodNeed(s, day, day, harvestDay);
  const yearlyNext = (s: VillageState): number =>
    expectedYearlyFoodNeed(s, day, harvestDay + 1, harvestDay + 365);

  it('prázdné zásoby: potřeba podle růstu vsi, pojistka z celé energie, nic nezbude', () => {
    const s = village(0);
    const today = s.people.reduce((sum, p) => sum + (day - p.bornDay < 14 * 365.25 ? 100 : 180), 0);
    expect(yearlyFoodNeed(s, day)).toBe(today);
    expect(today).toBe(2 * FOOD_NEED_KG_PER_YEAR.adult + 2 * FOOD_NEED_KG_PER_YEAR.child);
    // děti (12 a 13 let) do roku po sklizni dorostou – potřeba větší než dnešní
    const need = yearlyNext(s);
    expect(need).toBeGreaterThan(today * 1.15);
    // bez změřeného podílu celá potřeba energie
    const t = targetsOf(s);
    const buffer = FIELD_STORES.bufferEnergyYears * need;
    expect(t.needKg).toBeCloseTo(need, 9);
    expect(t.bufferKg).toBeCloseTo(buffer, 9);
    expect(t.leftKg).toBe(0);
    const years = daysUntilHarvest(day) / 365;
    expect(t.shortKg).toBeCloseTo(storesNeeded(0, yearlyNow(s), years, loss), 6);
  });

  it('zásoby na cílové zásobě: zbude cílová zásoba, nic nechybí; pojistka z celé energie', () => {
    const s = village(0);
    s.fieldFood = { needKg: 0, fieldKg: 0, share: 0.4 };
    const yearly = yearlyNext(s);
    const need = 0.4 * yearly;
    const buffer = FIELD_STORES.bufferEnergyYears * yearly;
    const keep = storesTargetKg(need, buffer);
    expect(keep).toBeCloseTo(buffer + FIELD_STORES.cushionYears * need, 9);
    const years = daysUntilHarvest(day) / 365;
    // zásoba, ze které k příští sklizni zbude právě cílová zásoba – do sklizně jí dnešní lidé
    s.storesKg = storesNeeded(keep, 0.4 * yearlyNow(s), years, loss);
    const t = targetsOf(s);
    expect(t.bufferKg).toBeCloseTo(buffer, 9);
    expect(t.leftKg).toBeCloseTo(keep, 6);
    expect(t.shortKg).toBe(0);
    // osivo, které ves ještě zaseje, zásoby k sklizni neuživí
    const seeded = storesOutlook(s, day, NO_CRAFTS.pottery, s.storesKg);
    expect(seeded.leftKg).toBe(0);
    expect(seeded.shortKg).toBeGreaterThan(0);
    expect(steadyHarvestKg(need, buffer, NO_CRAFTS.pottery)).toBeGreaterThan(need);
  });

  it('dlouhodobý podíl z pole: každý rok o třetinu rozdílu, starší ves začne ročním podílem', () => {
    const s = village(0);
    // starší ves – roční podíl bez dlouhodobého
    s.fieldFood = { needKg: 100, fieldKg: 70, share: 0.4 };
    expect(fieldFoodShare(s)).toBe(0.4);
    closeFieldFoodYear(s);
    expect(s.fieldFood.share).toBeCloseTo(0.7, 12);
    expect(s.fieldFood.longShare).toBeCloseTo(0.4 + 0.3 / FIELD_STORES.balanceYears, 12);
    expect(fieldFoodShare(s)).toBeCloseTo(0.5, 12);
    // první změřený rok nové vsi – dlouhodobý je roční
    const fresh = village(0);
    fresh.fieldFood = { needKg: 100, fieldKg: 60 };
    closeFieldFoodYear(fresh);
    expect(fresh.fieldFood.longShare).toBeCloseTo(0.6, 12);
    // rok bez měření dlouhodobý podíl nemění
    fresh.fieldFood = { needKg: 0, fieldKg: 0, share: 0.6, longShare: 0.55 };
    closeFieldFoodYear(fresh);
    expect(fresh.fieldFood.longShare).toBe(0.55);
  });

  it('zásoba luštěnin (zboží) – nad strop zbude a sní se příště', () => {
    const s = village(0);
    s.fieldFood = { needKg: 0, fieldKg: 0, share: 0.5 };
    const yearly = yearlyFoodNeed(s, day);
    const capKg = (LEGUMES.energyCap * yearly) / LEGUMES.energy;
    const legumeYears = daysUntilLegumeHarvest(day) / 365;
    s.legumesKg = 2 * capKg;
    const left = storesLeft(2 * capKg, capKg, legumeYears, loss);
    expect(left).toBeGreaterThan(0.5 * capKg);
    // luštěniny, které se do sklizně snědí, i ty, které zbudou, jsou zásoby z pole
    s.storesKg = 0.6 * yearly;
    const withLegumes = targetsOf(s);
    const without = targetsOf({ ...s, legumesKg: 0 });
    expect(withLegumes.leftKg).toBeGreaterThan(without.leftKg + legumeEnergy(left));
  });

  it('dobré zásoby (štěstí) – zásoby z pole proti potřebě z pole, ne proti celé energii', () => {
    const s = village(0);
    s.fieldFood = { needKg: 0, fieldKg: 0, share: 0.4 };
    s.storesKg = 0.3 * yearlyFoodNeed(s, day);
    expect(hasGoodStores(s, day)).toBe(false);
    s.legumesKg = (0.2 * yearlyFoodNeed(s, day)) / LEGUMES.energy; // s luštěninami víc než rok
    expect(hasGoodStores(s, day)).toBe(true);
    delete s.fieldFood;
    expect(hasGoodStores(s, day)).toBe(false);
  });

  it('pojistka podílu: pod FIELD_FOOD.minShare počítá ves s minShare', () => {
    const s = village(0);
    s.fieldFood = { needKg: 0, fieldKg: 0, share: 0.05 };
    expect(yearlyFieldNeed(s, day)).toBeCloseTo(FIELD_FOOD.minShare * yearlyFoodNeed(s, day), 9);
    expect(targetsOf(s).needKg).toBeCloseTo(FIELD_FOOD.minShare * yearlyNext(s), 9);
  });
});

describe('osev podle stravy v simulaci', () => {
  it('podíl jídla z pole nezávisí na kouscích dopočtu', () => {
    const start = found(at(600, 3, 15));
    const end = at(603, 10, 1);
    const whole = advanceVillage(start, end, null);
    let pieces = start;
    const steps = [1, 29, 365, 3, 200, 61];
    for (let i = 0; pieces.lastDay < end; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(end, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces.fieldFood).toEqual(whole.fieldFood);
    expect(pieces).toEqual(whole);
    expect(whole.fieldFood?.share).toBeLessThan(1);
  });

  it('ves s velkou zásobou seje obilí každý rok – nehladoví, nezávisí na kouscích', () => {
    // ves za 10 let vyroste na 8 lidí – pole ≈ 6 ha, ať ani pak osev neomezuje půda (len
    // vysiluje půdu a díly déle leží ladem – fields.md, Len)
    const start = found(at(600, 3, 15), 270);
    start.storesKg = 8 * yearlyFoodNeed(start, start.foundedDay);
    // obilí zasetá do 1. 7. – velká zásoba osev nebrzdí (fields.md – Osevní postup po dílech,
    // bod 3; Martin 25. 10. 2026: „maximum obilí“)
    const allGrain: number[] = [];
    let s = start;
    const grainKg = (day: number): number => {
      const byId = new Map(s.parts.map((p) => [p.id, p]));
      return seasonCrops(s.season!)
        .filter(({ crop }) => crop !== 'legume' && crop !== 'flax')
        .reduce(
          (sum, { work }) =>
            sum + work.partIds.reduce((kg, id) => kg + expectedNetKg(byId.get(id)!, day), 0),
          0,
        );
    };
    for (let year = 600; year <= 610; year++) {
      s = advanceVillage(s, at(year + 1, 7, 1), null);
      allGrain.push(grainKg(at(year + 1, 7, 1)));
    }
    expect(allGrain.every((kg) => kg > 0)).toBe(true);
    // bez hladu: nikdo hladem neumřel a hlad se nenahromadil (energie dne pod 0,9 – population.md);
    // v září a říjnu, než porážka dá maso, smí ves krátce šetřit
    expect(s.chronicle.filter((e) => e.kind === 'death' && e.cause === 'hunger')).toHaveLength(0);
    expect(s.starvationDays ?? 0).toBe(0);
    // stejný stav po kouscích
    let pieces = start;
    const steps = [400, 1, 33, 365, 2, 180];
    for (let i = 0; pieces.lastDay < s.lastDay; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(s.lastDay, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces).toEqual(s);
  }, 120_000);
});
