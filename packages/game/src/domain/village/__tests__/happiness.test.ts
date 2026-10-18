import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundField, foundVillage } from '../actions';
import type { PartInput } from '../actions';
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
} from '../happiness';
import { WINDOWS } from '../rules';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import type { VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Štěstí obyvatel (happiness.md).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 10, 1);
const POSITION = { x: 0, z: 0, rotation: 0 };
const village = (): VillageState =>
  withBuiltFirstDwelling(foundVillage({ seed: 11, day: DAY, dwellingPosition: POSITION }));
const NONE = { hunger: 0, deaths: 0, crowding: 0, toil: 0, stores: 0, fruit: 0, sacred: 0 };

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
    // ovoce je sladké – štěstí +5 (diet.md)
    expect(happinessTarget({ ...NONE, fruit: 5 })).toBe(55);
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

  it('konec okna: kopání v říjnu do 30. 11., výmlat v prosinci do konce února, mimo okno null', () => {
    expect(windowEndDay(WINDOWS.dig, at(600, 10, 5))).toBe(at(600, 11, 30));
    expect(windowEndDay(WINDOWS.dig, at(601, 3, 5))).toBe(at(601, 4, 30));
    expect(windowEndDay(WINDOWS.thresh, at(600, 12, 5))).toBe(at(601, 2, 28));
    expect(windowEndDay(WINDOWS.thresh, at(601, 1, 5))).toBe(at(601, 2, 28));
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
