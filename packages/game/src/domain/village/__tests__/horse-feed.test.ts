import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundVillage } from '../actions';
import { eatDiet } from '../diet';
import { dayMealInput, emergencySlaughter } from '../emergency-slaughter';
import { storesOutlook } from '../field-food';
import { feedHay, herdHayCoverage, horsesHayCoverage, winterHayKg, HAY_WINTER_DAYS } from '../hay';
import { horsesWinterEnd } from '../horse-feed';
import { horseCareLabor, horseGrainToday, horseHayDailyKg, villageHorses } from '../horses';
import { grazingDemandHa } from '../livestock';
import { NO_CRAFTS } from '../productivity';
import { HORSES } from '../rules';
import { advanceVillage } from '../simulate';
import { eat } from '../simulate-food';
import type { HerdSpecies, Horse, Pen, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Péče a krmení koní (horses.md – Péče, Krmení): hodina denně na koně z práce vsi, jezdecký kůň
// 1,5 kg obilí denně (lidé napřed), seno v zimě po volech a před stádem, úhyn 1. 3.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const YEAR = 365.25;
const FAR = { x: -90, z: -90, rotation: 0 };
const POTTERY = NO_CRAFTS.pottery;
const EMPTY = packObstacles([], 16, 15);

const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  cow: 0,
  pig: 0,
  ...over,
});

function horse(id: number, ageYears: number, sex: Horse['sex'] = 'male', day = DAY): Horse {
  return { id, bornDay: Math.round(day - ageYears * YEAR), sex, training: 0 };
}

function horsePen(id: number, horses: Horse[]): Pen {
  return {
    id,
    species: 'horse',
    cell: { x: 4, y: 4 },
    x: 0,
    z: 0,
    builtDay: DAY - 400,
    team: null,
    training: null,
    horses,
  };
}

function village(horses: Horse[] = []): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  if (horses.length > 0) s.pens = [...(s.pens ?? []), horsePen(90, horses)];
  return s;
}

const riders = (n: number): Horse[] => Array.from({ length: n }, (_, i) => horse(i + 1, 6));

describe('péče o koně', () => {
  it('0,1 člověkodne na koně, hříbě do roka nic navíc', () => {
    const five = [...riders(3), horse(4, 8, 'female'), horse(5, 2, 'female')];
    expect(horseCareLabor(five, DAY)).toBeCloseTo(0.5, 9);
    expect(horseCareLabor([...five, horse(6, 0.4)], DAY)).toBeCloseTo(0.5, 9);
    expect(horseCareLabor([], DAY)).toBe(0);
  });

  it('pokrytí péče jde do stavu, ves bez koní ho nemá', () => {
    const s = village(riders(2));
    s.storesKg = 20_000;
    const bare = village();
    bare.storesKg = 20_000;
    const after = advanceVillage(s, s.lastDay + 1, EMPTY);
    expect(after.horsesCaredToday).toBe(1);
    expect(advanceVillage(bare, bare.lastDay + 1, EMPTY).horsesCaredToday).toBeUndefined();
    // ves bez dospělých koně nepostará – výcvik stojí (úloha 6)
    const nobody = village(riders(2));
    nobody.storesKg = 20_000;
    nobody.people = nobody.people.filter((p) => DAY - p.bornDay < 10 * YEAR);
    expect(advanceVillage(nobody, nobody.lastDay + 1, EMPTY).horsesCaredToday).toBe(0);
  });
});

describe('krmení koní – obilí', () => {
  it('jen jezdecký kůň (samec od 3 let) 1,5 kg denně', () => {
    const horses = [...riders(2), horse(3, 8, 'female'), horse(4, 2), horse(5, 0.5)];
    expect(horseGrainToday(horses, DAY)).toBeCloseTo(2 * HORSES.grainKgPerDay, 9);
  });

  it('dost zásob: koně dostanou obilí po lidech', () => {
    const s = village(riders(2));
    s.storesKg = 20_000;
    const bare = village();
    bare.storesKg = 20_000;
    eat(s, DAY, NO_CRAFTS);
    eat(bare, DAY, NO_CRAFTS);
    expect(s.horsesFed).toBe(true);
    expect(bare.horsesFed).toBeUndefined();
    expect(bare.storesKg - s.storesKg).toBeCloseTo(2 * HORSES.grainKgPerDay, 6);
    expect(s.hungry).toBe(bare.hungry);
  });

  it('ves šetří – koně obilí nedostanou', () => {
    const s = village(riders(2));
    s.storesKg = 50;
    const bare = village();
    bare.storesKg = 50;
    eat(s, DAY, NO_CRAFTS);
    eat(bare, DAY, NO_CRAFTS);
    expect(s.hungry).toBe(true);
    expect(s.horsesFed).toBe(false);
    expect(s.storesKg).toBeCloseTo(bare.storesKg, 9);
  });

  it('zásoba vystačí lidem, ale ne lidem a koním – koně nejedí a ves nešetří', () => {
    const horses = riders(3);
    const s = village(horses);
    const { spareAt } = probe(s, DAY);
    const want = horseGrainToday(horses, DAY);
    const days = dayMealInput(s, DAY, POTTERY, 1).daysToHarvest;
    // lidem zbude jen polovina obilí koní do sklizně
    s.storesKg = spareAt(0.5 * want * days);
    eat(s, DAY, NO_CRAFTS);
    expect(s.hungry).toBe(false);
    expect(s.horsesFed).toBe(false);
  });

  it('na hraně zásob se ves ani koně nehoupou den po dni (60 dní)', () => {
    const horses = riders(3);
    const s = village(horses);
    const { spareAt } = probe(s, DAY);
    const want = horseGrainToday(horses, DAY);
    const days = dayMealInput(s, DAY, POTTERY, 1).daysToHarvest;
    // obilí lidem i koním do sklizně a jen půl dne koní navíc – ztráty ve stohu ho ukrojí
    s.storesKg = spareAt(want * (days + 0.5));
    let flips = 0;
    let fed: boolean | undefined;
    let fedDays = 0;
    for (let d = DAY; d < DAY + 60; d++) {
      eat(s, d, NO_CRAFTS);
      expect(s.hungry).toBe(false);
      if (fed !== undefined && s.horsesFed !== fed) flips++;
      fed = s.horsesFed;
      if (fed) fedDays++;
    }
    expect(fedDays).toBeGreaterThan(0);
    expect(flips).toBeLessThanOrEqual(2);
  });
});

/** Zásoba obilí, při které lidem po dnešním jídle zbude do sklizně `spare` kg navíc. */
function probe(s: VillageState, day: number): { spareAt: (spare: number) => number } {
  const at = (stores: number): number => {
    const c = structuredClone(s);
    c.storesKg = stores;
    return eatDiet(dayMealInput(c, day, POTTERY, 1)).grainSpareKg;
  };
  // obilí navíc roste se zásobou lineárně (ztráta dne je podíl zásoby)
  const a = 20_000;
  const b = 40_000;
  const slope = (at(b) - at(a)) / (b - a);
  const zero = a - at(a) / slope;
  return { spareAt: (spare) => zero + spare / slope };
}

describe('krmení koní – seno', () => {
  it('denní dávka: hříbě 3 a 5 kg, klisna 6, jezdecký 6, bez obilí 7', () => {
    expect(horseHayDailyKg([horse(1, 0.5)], DAY)).toBe(3);
    expect(horseHayDailyKg([horse(1, 2)], DAY)).toBe(5);
    expect(horseHayDailyKg([horse(1, 8, 'female')], DAY)).toBe(6);
    expect(horseHayDailyKg([horse(1, 6)], DAY)).toBe(6);
    expect(horseHayDailyKg([horse(1, 6)], DAY, false)).toBe(7);
    // klisna obilí nikdy nedostává – bez obilí jezdeckých koní pořád 6
    expect(horseHayDailyKg([horse(1, 8, 'female')], DAY, false)).toBe(6);
  });

  it('voli první, pak koně, pak stádo', () => {
    const s = village();
    s.hay = { kg: 20, mowing: null };
    feedHay(s, 2, herds({ cow: 2 }), 12);
    expect(s.hay.kg).toBe(0);
    expect(s.hay.winter).toMatchObject({
      oxenNeedKg: 12,
      oxenEatenKg: 12,
      horsesNeedKg: 12,
      horsesEatenKg: 8,
      herdNeedKg: 10,
      herdEatenKg: 0,
    });
  });

  it('ves bez koní – zima bez klíčů koní', () => {
    const s = village();
    s.hay = { kg: 100, mowing: null };
    feedHay(s, 2, herds({ cow: 2 }));
    expect(Object.keys(s.hay.winter ?? {})).not.toContain('horsesNeedKg');
    expect(winterHayKg(herds({ cow: 2 }), 2, 12)).toBe(
      winterHayKg(herds({ cow: 2 }), 2) + 12 * HAY_WINTER_DAYS,
    );
  });

  it('pokrytí 1. 3.: koně po volech, stádo po koních', () => {
    const s = village();
    s.hay = {
      kg: 31 * 12 + 31 * 6,
      mowing: null,
      winter: {
        oxenNeedKg: 0,
        oxenEatenKg: 0,
        horsesNeedKg: 100,
        horsesEatenKg: 0,
        herdNeedKg: 0,
        herdEatenKg: 0,
      },
    };
    // voli 2 × 6 kg a koně 1 × 6 kg na březen se do zásoby vejdou, stádu nezbude nic
    expect(horsesHayCoverage(s, 2, 6)).toBeCloseTo((31 * 6) / (100 + 31 * 6), 9);
    expect(herdHayCoverage(s, 2, herds({ cow: 2 }), 6)).toBe(0);
    expect(herdHayCoverage(s, 2, herds({ cow: 2 }))).toBeCloseTo(186 / 310, 9);
  });

  it('1. 3. pod polovinu přídělu uhyne tolik koní, aby ostatní měli polovinu – nejmladší napřed', () => {
    const horses = [horse(1, 12), horse(2, 6), horse(3, 2), horse(4, 0.8, 'female')];
    const s = village(horses);
    const events = horsesWinterEnd(s, DAY, 0.25);
    expect(villageHorses(s).map((h) => h.id)).toEqual([1, 2]);
    expect(events).toEqual([{ day: DAY, kind: 'horse-starved', penId: 90, horses: 2 }]);
    // nad polovinou nikdo neuhyne
    expect(horsesWinterEnd(s, DAY, 0.5)).toEqual([]);
    expect(villageHorses(s)).toHaveLength(2);
  });

  it('na nouzovou porážku koně nejdou', () => {
    const s = village(riders(3));
    s.storesKg = 10;
    emergencySlaughter(s, DAY, POTTERY, 1);
    expect(villageHorses(s)).toHaveLength(3);
  });
});

describe('pastva a plán osevu', () => {
  it('kůň spase v létě 1 ha', () => {
    const h = herds({ cow: 2 });
    expect(grazingDemandHa(h, 0, 3)).toBeCloseTo(grazingDemandHa(h, 0) + 3 * HORSES.pastureHa, 9);
  });

  it('výhled zásob se 3 jezdeckými koňmi potřebuje o ≈ 1 650 kg víc', () => {
    const day = dayIndexOf({ year: 600, month: 8, day: 20 });
    const bare = village();
    bare.storesKg = 2_000;
    const s = village(riders(3).map((h) => ({ ...h, bornDay: h.bornDay + (day - DAY) })));
    s.storesKg = 2_000;
    const without = storesOutlook(bare, day, 0, POTTERY);
    const withHorses = storesOutlook(s, day, 0, POTTERY);
    expect(withHorses.needKg - without.needKg).toBeCloseTo(3 * HORSES.grainKgPerDay * 365, 6);
    // koně jedí ze zásob do sklizně – k ní zbude méně
    expect(withHorses.leftKg).toBeLessThan(without.leftKg);
  });
});
