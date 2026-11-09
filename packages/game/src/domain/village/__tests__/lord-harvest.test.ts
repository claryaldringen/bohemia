import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { craftCoverage } from '../crafts';
import { allocateDay } from '../labor';
import { lordDayCounts, lordFieldShares, manorLabor, type LordFamily } from '../lord';
import { NO_CRAFTS } from '../productivity';
import { advanceVillage } from '../simulate';
import { lordHelpDay, villageProductivity } from '../simulate-plan';
import { lordHarvestHelp, lordHelpShare, type CropLoad, type SowingCapacity } from '../sowing';
import type { Person, VillageState, FarmSeason } from '../types';
import { seasonCrops } from '../year-plan';
import { dwelling } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Vojvodova rodina ve žních (lord.md – Kdy jde rodina na pole; Martin 9. 11. 2026: „Pokud by se
// nestíhala sklizeň, ať se zapojí i celá vojvodova rodina, pokud je zrovna ve vsi“ a „Pokud se
// nestíhá, jdou ženy z vojvodovy rodiny, pokud se i tak nestíhá, jdou muži z vojvodovy rodiny,
// samotný vojvoda až úplně nakonec“): když ves žně sama nestíhá, dá rodina jen práci, která chybí –
// napřed ženy a dcery, pak muži, vojvoda nakonec; zbytek dne cvičí. S osevem a při hladu nepomáhá.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const START = at(600, 8, 31);
const PLAN_DAY = at(600, 9, 1);
const OUTSIDE = 500;
/** Zásoby, se kterými ves dřív osev bez rodiny nestihla (pomoc s osevem, zrušeno 9. 11. 2026). */
const SHORT_STORES = 3500;

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

describe('podíl dne rodiny ve žních (lordHarvestHelp)', () => {
  const village: SowingCapacity = {
    autumnWinter: 70,
    autumn: 200,
    spring: 100,
    july: 50,
    august: 80,
    september: 30,
  };
  const withLord: SowingCapacity = { ...village, july: 90, august: 140, september: 60 };
  const load = (extra: Partial<CropLoad> = {}): CropLoad => ({
    winterAutumn: 60,
    july: 30,
    springReclaim: 0,
    springDig: 0,
    springSow: 40,
    august: 60,
    september: 0,
    ploughWinter: 0,
    ploughSpring: 0,
    ...extra,
  });

  it('ves, která žně stihne bez rodiny, pomoc nemá', () => {
    expect(lordHarvestHelp(load(), village, withLord)).toEqual({});
  });

  it('s osevem rodina nepomáhá, ani když ves nestíhá', () => {
    const short = load({ winterAutumn: 500, springSow: 500, springDig: 500 });
    expect(lordHarvestHelp(short, village, withLord)).toEqual({});
  });

  it('žeň, kterou červenec nestihne, dá rodina podílem; zbytek přejde do srpna', () => {
    // červenec: chybí 20 z 40 práce rodiny
    expect(lordHarvestHelp(load({ july: 70 }), village, withLord)).toEqual({ july: 0.5 });
    // červenec nestihne ani s rodinou – 10 přejde do srpna, kde ves s 60 + 10 nestačí o nic
    const both = lordHarvestHelp(load({ july: 100, august: 75 }), village, withLord);
    expect(both.july).toBe(1);
    expect(both.august).toBeCloseTo(5 / 60, 12);
  });

  it('žeň jaře, kterou srpen nestihne ani s rodinou, se žne v září (Žeň jaře i v září)', () => {
    // srpen: 80 + 60 rodiny = 140 proti 160 – 20 přejde do září, ves sama 30 → září bez pomoci
    expect(lordHarvestHelp(load({ august: 160 }), village, withLord)).toEqual({ august: 1 });
    // 175 – do září přejde 35, ves sama 30, rodina dá 5 z 30
    const late = lordHarvestHelp(load({ august: 175 }), village, withLord);
    expect(late.august).toBe(1);
    expect(late.september).toBeCloseTo(5 / 30, 12);
    // v září dosklizeň loňské jaře (`CropLoad.september`): chybí 15 z 30 práce rodiny
    expect(lordHarvestHelp(load({ september: 45 }), village, withLord)).toEqual({
      september: 0.5,
    });
  });
});

describe('podíl dnešního dne (lordHelpShare)', () => {
  const plan = (lordHelp?: FarmSeason['lordHelp']): FarmSeason =>
    ({ startDay: PLAN_DAY, ...(lordHelp ? { lordHelp } : {}) }) as FarmSeason;

  it('jen v oknech žní – okna setí starších plánů se nepočítají', () => {
    const p = plan({ autumnWinter: 0.3, spring: 0.7, july: 0.1, august: 0.2 });
    expect(lordHelpShare(p, at(600, 9, 15))).toBe(0);
    expect(lordHelpShare(p, at(601, 3, 1))).toBe(0);
    expect(lordHelpShare(p, at(601, 7, 1))).toBe(0.1);
    expect(lordHelpShare(p, at(601, 8, 1))).toBe(0.2);
    expect(lordHelpShare(plan(), at(601, 7, 1))).toBe(0);
    // září – dosklizeň jaře (fields.md – Žeň jaře i v září)
    expect(lordHelpShare(plan({ september: 0.4 }), at(601, 9, 10))).toBe(0.4);
    expect(lordHelpShare(null, at(601, 7, 1))).toBe(0);
  });
});

describe('práce dne (manorLabor, allocateDay)', () => {
  it('mimo žňový den (setí, zima) rodina nepomáhá, ani se starším plánem pomoci', () => {
    const s = sowingVillage(8000);
    s.people.push(person(15, 15, s.manorId!, 'female', { fatherId: 10, motherId: 11 }));
    s.season = {
      startDay: PLAN_DAY,
      crops: [],
      lordHelp: { autumnWinter: 1, july: 0.5 },
    } as unknown as FarmSeason;
    const coverage = craftCoverage(s, START);
    const p = villageProductivity(s, coverage);
    // mimo žňový den (setí, zima) nic
    expect(manorLabor(s, at(600, 10, 5), coverage.pottery, p).help).toBe(0);
    expect(manorLabor(s, at(600, 12, 5), coverage.pottery, p).help).toBe(0);
  });

  it('pomoc rodiny jde jen na žeň a výmlat, ne na setí, seč a jiné úlohy dne', () => {
    const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery, capacity: 0 };
    const a = allocateDay({
      ...base,
      lordHelp: 5,
      tasks: [
        { name: 'mow', remaining: 2 },
        { name: 'sow', remaining: 2 },
        { name: 'harvest', remaining: 2 },
        { name: 'thresh', remaining: 1 },
      ],
    });
    expect(a.tasks.mow).toBe(0);
    expect(a.tasks.sow).toBe(0);
    expect(a.tasks.harvest).toBeCloseTo(2, 12);
    expect(a.tasks.thresh).toBeCloseTo(1, 12);
    expect(a.lordField).toBeCloseTo(3, 12);
  });

  it('pomoc rodiny jde až po práci vsi – vsi neuvolní práci na stavby', () => {
    const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery, capacity: 3 };
    const tasks = (remaining: number): { name: 'harvest'; remaining: number }[] => [
      { name: 'harvest', remaining },
    ];
    // ves nestihne: dá vše, rodina jen zbytek
    const short = allocateDay({ ...base, lordHelp: 2, tasks: tasks(3) });
    const alone = allocateDay({ ...base, tasks: tasks(3) });
    expect(short.common).toBe(alone.common);
    expect(short.common).toBe(0);
    expect(short.tasks.harvest).toBeCloseTo(3, 12);
    expect(short.lordField).toBeCloseTo(3 - alone.tasks.harvest, 12);
    // ves stihne sama: rodina cvičí, volná práce vsi stejná jako bez rodiny
    const light = allocateDay({ ...base, lordHelp: 2, tasks: tasks(0.5) });
    expect(light.lordField).toBe(0);
    expect(light.common).toBe(allocateDay({ ...base, tasks: tasks(0.5) }).common);
  });
});

describe('rodina ve žních (lordHelpDay)', () => {
  it('v okně setí rodina nepomáhá, ani když ves osev nestíhá – cvičí', () => {
    const planned = advanceVillage(sowingVillage(SHORT_STORES), PLAN_DAY, null);
    expect(planned.season!.lordHelp).toBeUndefined();
    const september = advanceVillage(planned, at(600, 9, 10), null);
    expect(september.labor?.lord).toEqual({ training: 3, field: 0, household: 2 });
  });

  it('žně, které ves sama nestíhá – podíl v červenci, srpnu a září; ves bez rodiny nic', () => {
    const planned = advanceVillage(sowingVillage(SHORT_STORES), PLAN_DAY, null);
    const july = structuredClone(planned);
    // ves zaseje víc, než sama sklidí – žeň všech plodin čeká
    for (const { work } of seasonCrops(july.season!)) work.required.harvest += 5000;
    const day = at(601, 7, 1);
    lordHelpDay(july, day, craftCoverage(july, day), null);
    const help = july.season!.lordHelp!;
    expect(help.july).toBeGreaterThan(0);
    for (const share of Object.values(help)) expect(share).toBeLessThanOrEqual(1);
    expect(Object.keys(help).every((w) => ['july', 'august', 'september'].includes(w))).toBe(true);
    // rodina, která necvičí, pracuje jako ostatní – podíl nemá
    const working = structuredClone(july);
    delete working.season!.lordHelp;
    working.lord = {};
    lordHelpDay(working, day, craftCoverage(working, day), null);
    expect(working.season!.lordHelp).toBeUndefined();
  });

  it('dopočet po kouscích dá týž stav – i se zimním osivem', () => {
    const once = advanceVillage(sowingVillage(SHORT_STORES), at(600, 11, 20), null);
    let pieces = sowingVillage(SHORT_STORES);
    for (const day of [PLAN_DAY, at(600, 9, 7), at(600, 11, 2), at(600, 11, 20)]) {
      pieces = advanceVillage(pieces, day, null);
    }
    expect(pieces).toEqual(once);
    expect(once.sowingSeed?.beforeWindow).toBe(true);
  });
});

describe('pořadí rodiny ve žních (lord.md – Kdy jde rodina na pole; Martin 9. 11. 2026)', () => {
  // ženy a dcery 3 člověkodny po minimu dvorce, synové 2, vojvoda 1
  const manor = { free: 6, freeMen: 3, freeLord: 1 };

  it('napřed ženy a dcery, pak muži, vojvoda až nakonec – každá skupina jen kolik chybí', () => {
    expect(lordFieldShares(manor, 0)).toEqual({ women: 0, men: 0, lord: 0 });
    expect(lordFieldShares(manor, 1.5)).toEqual({ women: 0.5, men: 0, lord: 0 });
    expect(lordFieldShares(manor, 4)).toEqual({ women: 1, men: 0.5, lord: 0 });
    expect(lordFieldShares(manor, 5.5)).toEqual({ women: 1, men: 1, lord: 0.5 });
    // víc, než rodina má, nedá
    expect(lordFieldShares(manor, 9)).toEqual({ women: 1, men: 1, lord: 1 });
  });

  it('bez žen jdou napřed muži, vojvoda zase poslední', () => {
    expect(lordFieldShares({ free: 3, freeMen: 3, freeLord: 1 }, 1)).toEqual({
      women: 0,
      men: 0.5,
      lord: 0,
    });
  });

  it('počty na poli podle skupin – vojvoda jen, když na něj dojde', () => {
    const adult = (id: number, sex: 'male' | 'female'): Person =>
      ({ id, sex, bornDay: -30 * 365 }) as Person;
    const family = {
      lord: adult(1, 'male'),
      trainees: [adult(1, 'male'), adult(2, 'male'), adult(3, 'male')],
      household: [adult(4, 'female'), adult(5, 'female')],
      others: [],
      wivesApart: [],
      eliteHomes: [],
    } satisfies LordFamily;
    expect(lordDayCounts(family, 0, { women: 1, men: 0, lord: 0 })).toEqual({
      training: 3,
      field: 2,
      household: 0,
    });
    expect(lordDayCounts(family, 0, { women: 1, men: 1, lord: 0 })).toEqual({
      training: 1,
      field: 4,
      household: 0,
    });
    expect(lordDayCounts(family, 0, { women: 1, men: 1, lord: 1 })).toEqual({
      training: 0,
      field: 5,
      household: 0,
    });
  });
});
