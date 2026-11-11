import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundField, foundVillage } from '../../core/actions';
import type { PartInput } from '../../core/actions';
import {
  crowdedShare,
  deathsPenalty,
  happinessFactors,
  happinessLaborFactor,
  happinessTarget,
  hungerPenalty,
  isToilDay,
  toilPenalty,
  updateHappiness,
  villageHappiness,
  villageLaborFactor,
  windowEndDay,
  deathPointsFor,
} from '../happiness';
import { ORCHARD_WINDOWS, WINDOWS } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { summarizeVillage } from '../../core/summary';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Štěstí obyvatel (happiness.md).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 10, 1);
const POSITION = { x: 0, z: 0, rotation: 0 };
const village = (): VillageState =>
  withBuiltFirstDwelling(foundVillage({ seed: 11, day: DAY, dwellingPosition: POSITION }));
const NONE = {
  hunger: 0,
  deaths: 0,
  crowding: 0,
  toil: 0,
  stores: 0,
  fruit: 0,
  meat: 0,
  sacred: 0,
  wool: 0,
  linen: 0,
};

describe('štěstí – čísla z návrhu', () => {
  it('práce vsi: 0 → × 0,8, 50 → × 1, 100 → × 1,1, mezi tím lineárně', () => {
    expect(happinessLaborFactor(0)).toBeCloseTo(0.8, 12);
    expect(happinessLaborFactor(25)).toBeCloseTo(0.9, 12);
    expect(happinessLaborFactor(50)).toBeCloseTo(1, 12);
    expect(happinessLaborFactor(75)).toBeCloseTo(1.05, 12);
    expect(happinessLaborFactor(100)).toBeCloseTo(1.1, 12);
    expect(happinessLaborFactor(-5)).toBeCloseTo(0.8, 12);
    expect(happinessLaborFactor(130)).toBeCloseTo(1.1, 12);
  });

  it('hlad: nasycení pod 0,9 ubere až 40', () => {
    expect(hungerPenalty(1)).toBe(0);
    expect(hungerPenalty(0.9)).toBe(0);
    expect(hungerPenalty(0.45)).toBeCloseTo(20, 9);
    expect(hungerPenalty(0)).toBeCloseTo(40, 9);
  });

  it('úmrtí nejvýš −20, dřina = podíl 60 dní × 15', () => {
    expect(deathsPenalty([{ points: 5 }, { points: 3 }])).toBe(8);
    expect(deathsPenalty(Array.from({ length: 5 }, () => ({ points: 5 })))).toBe(20);
    expect(toilPenalty([])).toBe(0);
    expect(toilPenalty(Array.from({ length: 30 }, () => 1))).toBeCloseTo(7.5, 9);
    expect(toilPenalty(Array.from({ length: 60 }, () => 1))).toBeCloseTo(15, 9);
  });

  it('cíl = 50 + posvátná místa + zásoby − hlad − úmrtí − přeplněnost − dřina, 0–100', () => {
    expect(happinessTarget(NONE)).toBe(50);
    expect(happinessTarget({ ...NONE, sacred: 40, stores: 5 })).toBe(95);
    expect(happinessTarget({ ...NONE, hunger: 40, deaths: 20, crowding: 15 })).toBe(0);
    expect(happinessTarget({ ...NONE, sacred: 40, stores: 5, toil: 15 })).toBe(80);
    // ovoce je sladké – štěstí +5 (diet.md), maso mírně – až +3 (Martin)
    expect(happinessTarget({ ...NONE, fruit: 5 })).toBe(55);
    expect(happinessTarget({ ...NONE, fruit: 5, meat: 3 })).toBe(58);
    // chybí vlna na oděv – až −6 (diet.md – Oděv)
    expect(happinessTarget({ ...NONE, wool: 6 })).toBe(44);
    // chybí len na oděv – až −4 (fields.md – Len)
    expect(happinessTarget({ ...NONE, linen: 4 })).toBe(46);
  });

  it('dřina: ves dnešním tempem nestihne polní práce do konce okna (nejbližší termín první)', () => {
    expect(isToilDay([{ remaining: 100, endDay: DAY + 50 }], 3, DAY)).toBe(false);
    expect(isToilDay([{ remaining: 100, endDay: DAY + 50 }], 1, DAY)).toBe(true);
    // každá úloha zvlášť by stihla, dohromady ne: první termín 20 dní, druhý 40
    expect(
      isToilDay(
        [
          { remaining: 50, endDay: DAY + 40 },
          { remaining: 30, endDay: DAY + 20 },
        ],
        1.8,
        DAY,
      ),
    ).toBe(true);
    expect(isToilDay([{ remaining: 0, endDay: DAY }], 0, DAY)).toBe(false);
    expect(isToilDay([], 0, DAY)).toBe(false);
  });

  it('konec okna: kopání v říjnu do 30. 11., péče o sad v prosinci do konce února, mimo okno null', () => {
    expect(windowEndDay(WINDOWS.dig, at(600, 10, 5))).toBe(at(600, 11, 30));
    expect(windowEndDay(WINDOWS.dig, at(601, 3, 5))).toBe(at(601, 4, 30));
    expect(windowEndDay(ORCHARD_WINDOWS.care, at(600, 12, 5))).toBe(at(601, 2, 28));
    expect(windowEndDay(ORCHARD_WINDOWS.care, at(601, 1, 5))).toBe(at(601, 2, 28));
    // výmlat do konce února (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)
    expect(windowEndDay(WINDOWS.thresh, at(600, 9, 5))).toBe(at(601, 2, 28));
    expect(windowEndDay(WINDOWS.sow, at(600, 10, 5))).toBeNull();
  });
});

describe('štěstí ve vsi', () => {
  it('ves bez štěstí (uložená dřív) má 50 a práci × 1', () => {
    const s = village();
    expect(s.happiness).toBeUndefined();
    expect(villageHappiness(s)).toBe(50);
    expect(villageLaborFactor(s)).toBe(1);
  });

  it('posouvá se o 10 % rozdílu za měsíc – za 4 roky zbude 0,9^48 rozdílu', () => {
    const s = village();
    s.sacredOaks = [1, 2, 3].map((id) => ({ id, day: DAY, x: 0, z: 0 }));
    const target = happinessTarget(happinessFactors(s, DAY, 1));
    // tři posvátné duby (bez vrstvy překážek jako nejmladší – po 1) a zásoby na 18 měsíců
    expect(target).toBe(50 + 3 + 5);
    for (let day = DAY; day < DAY + 1461; day++) {
      updateHappiness(s, day, { satiation: 1, events: [], toil: false });
    }
    expect(villageHappiness(s)).toBeCloseTo(target - (target - 50) * 0.9 ** 48, 9);
  });

  it('úmrtí ubírají rok, dřina se pamatuje 60 dní', () => {
    const s = village();
    updateHappiness(s, DAY, {
      satiation: 1,
      events: [
        { day: DAY, kind: 'death', group: 'child' },
        { day: DAY, kind: 'death', group: 'elder' },
      ],
      toil: true,
    });
    expect(s.happiness!.deaths).toEqual([
      { day: DAY, points: 5 },
      { day: DAY, points: 3 },
    ]);
    expect(happinessFactors(s, DAY, 1).deaths).toBe(8);
    for (let day = DAY + 1; day <= DAY + 365; day++) {
      updateHappiness(s, day, { satiation: 1, events: [], toil: day <= DAY + 30 });
    }
    expect(s.happiness!.deaths).toEqual([]);
    expect(s.happiness!.toil).toHaveLength(60);
    expect(toilPenalty(s.happiness!.toil)).toBe(0);
  });

  it('body za úmrtí klesají s věkem, bez věku podle skupiny, součet nejvýš 20', () => {
    const at = (age: number): number => deathPointsFor({ group: 'adult', age });
    expect(at(0)).toBe(5);
    expect(at(30)).toBeCloseTo(3.2, 9);
    expect(at(75)).toBe(0.5);
    expect(at(90)).toBe(0.5);
    expect(deathPointsFor({ group: 'child' })).toBe(5);
    expect(deathPointsFor({ group: 'elder' })).toBe(3);
    const s = village();
    updateHappiness(s, DAY, {
      satiation: 1,
      events: Array.from({ length: 10 }, () => ({
        day: DAY,
        kind: 'death' as const,
        group: 'child' as const,
        age: 0,
      })),
      toil: false,
    });
    expect(happinessFactors(s, DAY, 1).deaths).toBe(20);
  });

  it('přeplněnost: podíl lidí v přeplněných obydlích × 15', () => {
    const s = village();
    expect(crowdedShare(s, DAY)).toBe(0);
    const extra = Array.from({ length: 4 }, (_, i) => ({
      id: 100 + i,
      bornDay: DAY - 3000,
      dwellingId: s.dwellings[0]!.id,
    }));
    s.people.push(...extra); // 8 lidí v zemnici pro 6
    expect(crowdedShare(s, DAY)).toBe(1);
    expect(happinessFactors(s, DAY, 1).crowding).toBe(15);
  });

  it('hladová ves je nešťastná a pracuje pomaleji; výsledek nezávisí na kouscích dopočtu', () => {
    const s = village();
    s.storesKg = 50;
    const part: PartInput = {
      areaM2: 2250,
      distanceM: 50,
      naturalFertility: 60,
      surface: 'meadow',
      obstacleCost: 0,
    };
    const start = foundField(s, DAY, { parts: [part] });
    const whole = advanceVillage(start, DAY + 200, null);
    let pieces = start;
    for (let day = DAY + 17; day < DAY + 200; day += 37) pieces = advanceVillage(pieces, day, null);
    pieces = advanceVillage(pieces, DAY + 200, null);
    expect(pieces.happiness).toEqual(whole.happiness);
    expect(villageHappiness(whole)).toBeLessThan(45);
    expect(villageLaborFactor(whole)).toBeLessThan(1);
    const summary = summarizeVillage(whole, DAY + 200);
    expect(summary.happiness.value).toBe(villageHappiness(whole));
    expect(summary.happiness.factors.hunger).toBeGreaterThan(0);
    expect(summary.happiness.laborFactor).toBe(villageLaborFactor(whole));
  });
});

describe('štěstí – víra (christianity.md – Štěstí; K5)', () => {
  const sacredBase = { ...NONE, sacred: 20 };

  it('bez křesťanů a bez zničených míst přesně jako dnes', () => {
    expect(happinessTarget({ ...sacredBase })).toBe(70);
    expect(happinessTarget({ ...sacredBase, christianShare: 0 })).toBe(70);
  });

  it('pohané: zničený háj −15, 2 háje + hřbitov strop −30', () => {
    expect(happinessTarget({ ...sacredBase, desecration: 15 })).toBe(55);
    expect(happinessTarget({ ...sacredBase, desecration: 30 })).toBe(40);
  });

  it('desecrated ve stavu: 2 háje + hřbitov = −30 (strop)', () => {
    const s = village();
    s.faith = { desecrated: { oaksOrGroves: 2, cemeteries: 1 } };
    expect(happinessFactors(s, DAY, 1).desecration).toBe(30);
    s.faith = { desecrated: { oaksOrGroves: 1, cemeteries: 0 } };
    expect(happinessFactors(s, DAY, 1).desecration).toBe(15);
    s.faith = undefined;
    expect(happinessFactors(s, DAY, 1).desecration).toBeUndefined();
  });

  it('samí křesťané: bez nespokojenosti a bez posvátných míst, kostel zatím není', () => {
    expect(happinessTarget({ ...sacredBase, desecration: 30, christianShare: 1 })).toBe(50);
    expect(happinessTarget({ ...sacredBase, christianShare: 1, church: 40 })).toBe(90);
  });

  it('půl na půl = průměr cíle pohanů a křesťanů', () => {
    expect(happinessTarget({ ...sacredBase, desecration: 10, christianShare: 0.5 })).toBe(55);
  });

  it('podíl křesťanů ve vsi se propíše do složek a rozpisu', () => {
    const s = village();
    s.people = s.people.map((p, i) => (i % 2 === 0 ? { ...p, faith: 'christian' as const } : p));
    const f = happinessFactors(s, DAY, 1);
    expect(f.christianShare).toBeCloseTo(
      s.people.filter((p) => p.faith).length / s.people.length,
      9,
    );
    expect(f.church).toBeUndefined();
    expect(summarizeVillage(s, DAY).happiness.christianShare).toBeCloseTo(f.christianShare ?? 0, 9);
  });
});
