import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { craftCoverage } from '../crafts';
import { allocateDay } from '../labor';
import { manorLabor } from '../lord';
import { NO_CRAFTS } from '../productivity';
import { advanceVillage } from '../simulate';
import { orchardHarvestLoad, sowingCapacity, villageProductivity } from '../simulate-plan';
import {
  cropLoadOf,
  lordHelpShare,
  lordSowingHelp,
  planLoad,
  type CropLoad,
  type SowingCapacity,
} from '../sowing';
import type { Person, VillageState, YearPlan } from '../types';
import { dwelling } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Pomoc vojvodovy rodiny s potřebným osevem (lord.md – Kdy jde rodina na pole, bod 1): plán osevu
// počítá práci bez rodiny; když by ves potřebný osev nestihla, dá rodina v oknech jen podíl dne,
// který chybí – zbytek dne cvičí. Osev navíc, stavby ani opravy rodina nedělá.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const START = at(600, 8, 31);
const PLAN_DAY = at(600, 9, 1);
const OUTSIDE = 500;
/**
 * Zásoby, se kterými ves potřebný osev bez rodiny nestihne – i se žňovými rukama ve výmlatu
 * (fields.md – Žně všemi rukama).
 */
const SHORT_STORES = 1500;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: START - Math.ceil(years * 365.25) - 10, dwellingId, sex, ...extra });

const parts = (count: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves k 31. 8. 600 s dostatkem půdy (600 dílů po 225 m², úrodnost 0,9): cvičící dvorec (vojvoda
 * 40, žena 38, syn 17 se snachou 16, syn 11) a 4 dospělí jinde. Se zásobami 1500 kg potřebný osev
 * bez rodiny nestihne (`SHORT_STORES`), s 8000 kg ano.
 */
function sowingVillage(storesKg: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({
      seed: 42,
      day: at(600, 6, 1),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: parts(600),
      },
    }),
  );
  const manor = s.dwellings[0]!.id;
  s.dwellings.push({ ...dwelling(OUTSIDE), position: { x: 30, z: 0, rotation: 0 } });
  s.people = [
    person(10, 40, manor, 'male', { spouseId: 11 }),
    person(11, 38, manor, 'female', { spouseId: 10 }),
    person(12, 17, manor, 'male', { fatherId: 10, motherId: 11, spouseId: 13 }),
    person(13, 16, manor, 'female', { spouseId: 12 }),
    person(14, 11, manor, 'male', { fatherId: 10, motherId: 11 }),
    ...Array.from({ length: 4 }, (_, i) =>
      person(20 + i, 26 + i, OUTSIDE, i % 2 === 0 ? 'male' : 'female'),
    ),
  ];
  s.manorId = manor;
  s.constructions = [];
  s.storesKg = storesKg;
  s.lastDay = START;
  s.nextId = 1000;
  s.lord = { trains: true };
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
    p.sownYears = 1;
    p.fertilityShare = 0.9;
  }
  return s;
}

describe('podíl dne rodiny po oknech (lordSowingHelp)', () => {
  const village: SowingCapacity = {
    autumnWinter: 70,
    autumn: 200,
    spring: 100,
    july: 50,
    august: 80,
  };
  const withLord: SowingCapacity = {
    autumnWinter: 170,
    autumn: 400,
    spring: 180,
    july: 90,
    august: 140,
  };
  const load = (extra: Partial<CropLoad> = {}): CropLoad => ({
    winterAutumn: 60,
    july: 30,
    springReclaim: 0,
    springDig: 0,
    springSow: 40,
    august: 60,
    ploughWinter: 0,
    ploughSpring: 0,
    ...extra,
  });

  it('ves, která osev stihne bez rodiny, pomoc nemá', () => {
    expect(lordSowingHelp(load(), village, withLord)).toEqual({});
  });

  it('chybí 30 % podzimní práce ozimu – rodina dá 0,3 dne jen v září–říjnu', () => {
    const help = lordSowingHelp(load({ winterAutumn: 100 }), village, withLord);
    expect(Object.keys(help)).toEqual(['autumnWinter']);
    expect(help.autumnWinter).toBeCloseTo(0.3, 12);
  });

  it('jař, která se nevejde, dá rodina napřed na jaře, co jaro nepokryje, na podzim', () => {
    // podzim po ozimu 200 − 60 = 140; vrácení a kopání 210 → 70 na jaro, se setím 110 > 100
    const spring = lordSowingHelp(load({ springReclaim: 150, springDig: 60 }), village, withLord);
    expect(Object.keys(spring)).toEqual(['spring']);
    expect(spring.spring).toBeCloseTo(10 / 80, 12);
    // 360 − 140 = 220 na jaro, se setím 260: jaro celé (80), zbylých 80 z podzimu (200)
    const both = lordSowingHelp(load({ springReclaim: 300, springDig: 60 }), village, withLord);
    expect(both.spring).toBe(1);
    expect(both.autumn).toBeCloseTo(80 / 200, 12);
    expect(both.autumnWinter).toBeUndefined();
  });
});

describe('podíl dnešního dne (lordHelpShare)', () => {
  const plan = (lordHelp?: YearPlan['lordHelp']): YearPlan =>
    ({ plannedDay: PLAN_DAY, ...(lordHelp ? { lordHelp } : {}) }) as YearPlan;

  it('podíl jen v oknech, v zimě a v květnu–červnu 0', () => {
    const p = plan({ autumnWinter: 0.3 });
    expect(lordHelpShare(p, at(600, 9, 15))).toBe(0.3);
    expect(lordHelpShare(p, at(600, 10, 31))).toBe(0.3);
    expect(lordHelpShare(p, at(600, 11, 10))).toBe(0);
    expect(lordHelpShare(p, at(601, 1, 10))).toBe(0);
    expect(lordHelpShare(p, at(601, 5, 10))).toBe(0);
  });

  it('dny ve více oknech berou nejvyšší podíl', () => {
    const p = plan({ autumnWinter: 0.2, autumn: 0.5, spring: 0.7, july: 0.1 });
    expect(lordHelpShare(p, at(600, 10, 1))).toBe(0.5);
    expect(lordHelpShare(p, at(600, 11, 1))).toBe(0.5);
    expect(lordHelpShare(p, at(601, 3, 1))).toBe(0.7);
    expect(lordHelpShare(p, at(601, 7, 1))).toBe(0.1);
    expect(lordHelpShare(p, at(601, 8, 1))).toBe(0);
  });

  it('starší plán bez lordHelp a ves bez plánu = 0', () => {
    expect(lordHelpShare(plan(), at(600, 9, 15))).toBe(0);
    expect(lordHelpShare(null, at(600, 9, 15))).toBe(0);
  });
});

describe('práce dne (manorLabor, allocateDay)', () => {
  it('rodina dá podíl práce po minimu dvorce, při hladu všechno', () => {
    const s = sowingVillage(8000);
    s.plan = { plannedDay: PLAN_DAY, lordHelp: { autumnWinter: 0.3 } } as YearPlan;
    const coverage = craftCoverage(s, START);
    const p = villageProductivity(s, coverage);
    const october = manorLabor(s, at(600, 10, 5), coverage.pottery, p);
    expect(october.free).toBeGreaterThan(0);
    expect(october.help).toBeCloseTo(0.3 * october.freeMen, 12);
    expect(october.field).toBe(0);
    expect(manorLabor(s, at(600, 12, 5), coverage.pottery, p).help).toBe(0);
    s.lord = { trains: true, field: { since: START, reason: 'hunger' } };
    const hungry = manorLabor(s, at(600, 10, 5), coverage.pottery, p);
    expect(hungry.field).toBe(hungry.free);
    expect(hungry.help).toBe(0);
  });

  it('s osevem pomáhají jen muži – žena a dcery ne, při hladu celá rodina', () => {
    const s = sowingVillage(8000);
    s.plan = { plannedDay: PLAN_DAY, lordHelp: { autumnWinter: 1 } } as YearPlan;
    s.people.push(person(15, 15, s.manorId!, 'female', { fatherId: 10, motherId: 11 }));
    const coverage = craftCoverage(s, START);
    const p = villageProductivity(s, coverage);
    const day = at(600, 10, 5);
    const women = s.people.filter((q) => q.dwellingId === s.manorId && q.sex === 'female');
    expect(women.length).toBeGreaterThanOrEqual(3);
    const calm = manorLabor(s, day, coverage.pottery, p);
    expect(calm.freeMen).toBeGreaterThan(0);
    expect(calm.freeMen).toBeLessThan(calm.free);
    expect(calm.help).toBeCloseTo(calm.freeMen, 12);
    s.lord = { trains: true, field: { since: START, reason: 'hunger' } };
    const hungry = manorLabor(s, day, coverage.pottery, p);
    expect(hungry.field).toBe(hungry.free);
    expect(hungry.field).toBeGreaterThan(calm.help);
  });

  it('pomoc rodiny jde jen na práce osevu, ne na seč a jiné úlohy dne', () => {
    const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery, capacity: 0 };
    const a = allocateDay({
      ...base,
      lordHelp: 5,
      tasks: [
        { name: 'mow', remaining: 2 },
        { name: 'orchard-care', remaining: 2 },
        { name: 'sow', remaining: 2 },
      ],
    });
    expect(a.tasks.mow).toBe(0);
    expect(a.tasks['orchard-care']).toBe(0);
    expect(a.tasks.sow).toBeCloseTo(2, 12);
    expect(a.lordField).toBeCloseTo(2, 12);
  });

  it('pomoc rodiny jde až po práci vsi – vsi neuvolní práci na stavby ani osev navíc', () => {
    const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery, capacity: 3 };
    const tasks = (remaining: number): { name: 'dig'; remaining: number }[] => [
      { name: 'dig', remaining },
    ];
    // ves nestihne: dá vše, rodina jen zbytek
    const short = allocateDay({ ...base, lordHelp: 2, tasks: tasks(3) });
    const alone = allocateDay({ ...base, tasks: tasks(3) });
    expect(short.common).toBe(alone.common);
    expect(short.common).toBe(0);
    expect(short.tasks.dig).toBeCloseTo(3, 12);
    expect(short.lordField).toBeCloseTo(3 - alone.tasks.dig, 12);
    // ves stihne sama: rodina cvičí, volná práce vsi stejná jako bez rodiny
    const light = allocateDay({ ...base, lordHelp: 2, tasks: tasks(0.5) });
    expect(light.lordField).toBe(0);
    expect(light.common).toBe(allocateDay({ ...base, tasks: tasks(0.5) }).common);
  });
});

describe('plán osevu s rodinou (planYear, trimPlan)', () => {
  it('ves, která osev stihne bez rodiny – lordHelp chybí, rodina jen cvičí', () => {
    const planned = advanceVillage(sowingVillage(8000), PLAN_DAY, null);
    expect(planned.plan).toBeDefined();
    expect(planned.plan!.lordHelp).toBeUndefined();
    expect(planned.labor?.lord?.field).toBe(0);
  });

  it('ves, která osev nestihne – rodina dá podíl v oknech, kde práce chybí, v zimě cvičí', () => {
    const planned = advanceVillage(sowingVillage(SHORT_STORES), PLAN_DAY, null);
    const help = planned.plan!.lordHelp!;
    expect(help).toBeDefined();
    const shares = Object.values(help);
    expect(shares.length).toBeGreaterThan(0);
    for (const share of shares) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    // plán počítá s rodinou: bez ní by se jeho práce do volné práce vsi nevešla
    const coverage = craftCoverage(planned, PLAN_DAY);
    const load = cropLoadOf(planLoad(planned.plan!, orchardHarvestLoad(planned)));
    const village = sowingCapacity(planned, PLAN_DAY, coverage);
    expect(load.winterAutumn).toBeGreaterThan(village.autumnWinter);
    // v září rodina pomáhá, v zimě cvičí celý den
    const september = advanceVillage(planned, at(600, 9, 10), null);
    expect(lordHelpShare(planned.plan!, at(600, 9, 10))).toBeGreaterThan(0);
    expect(september.labor?.lord?.household).toBe(2);
    const winter = advanceVillage(september, at(600, 12, 10), null);
    expect(winter.labor?.lord).toEqual({
      training: 3,
      field: 0,
      household: 2,
    });
  });

  it('osev navíc se kvůli rodině nezvětší a pomoc nezávisí na dopočtu po kouscích', () => {
    const alone = advanceVillage(sowingVillage(SHORT_STORES), PLAN_DAY, null);
    const once = advanceVillage(sowingVillage(SHORT_STORES), at(600, 10, 20), null);
    let pieces = sowingVillage(SHORT_STORES);
    for (const day of [PLAN_DAY, at(600, 9, 7), at(600, 10, 20)]) {
      pieces = advanceVillage(pieces, day, null);
    }
    expect(pieces).toEqual(once);
    // osev navíc dostane jen práci vsi – stejně jako ves, kde rodina nepomáhá
    const noHelp = structuredClone(alone);
    delete noHelp.plan!.lordHelp;
    const helped = advanceVillage(alone, at(600, 10, 20), null);
    const unhelped = advanceVillage(noHelp, at(600, 10, 20), null);
    // rodina pomáhala (cvičila méně), volná práce vsi na stavby a osev navíc den po dni stejná
    const bow = (v: VillageState): number => v.people.find((p) => p.id === 12)!.arms!.bow;
    expect(bow(helped)).toBeLessThan(bow(unhelped));
    expect(helped.commonLaborHistory).toEqual(unhelped.commonLaborHistory);
  });

  it('jarní úprava přepočítá pomoc podle zbytku plánu', () => {
    const planned = advanceVillage(sowingVillage(SHORT_STORES), PLAN_DAY, null);
    const spring = structuredClone(planned);
    delete spring.plan!.lordHelp;
    spring.lastDay = at(601, 2, 28);
    spring.storesKg = 1500;
    // ves přes zimu přišla o dospělého – jař bez rodiny nestihne, rodina dál cvičí (3 jinde)
    spring.people = spring.people.filter((p) => p.id !== 23);
    const march = advanceVillage(spring, at(601, 3, 1), null);
    expect(march.lord?.trains).toBe(true);
    expect(march.plan!.lordHelp?.spring).toBeGreaterThan(0);
    expect(march.plan!.lordHelp?.autumnWinter).toBeUndefined();
  });
});
