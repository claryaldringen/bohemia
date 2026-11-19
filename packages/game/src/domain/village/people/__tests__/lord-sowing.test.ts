import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { craftCoverage } from '../../crafts/crafts';
import { allocateDay } from '../../core/labor';
import { NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import { lordHelpDay, villageProductivity } from '../../core/simulate-plan';
import {
  lordSowingHelp,
  lordSowingShare,
  type CropLoad,
  type SowingCapacity,
} from '../../fields/sowing';
import { harvestFieldIds, lordFamily, manorLabor } from '../lord';
import type { FarmSeason, Person, VillageState } from '../../types';
import { dwelling } from '../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Vojvodova rodina s přípravou půdy a setím (lord.md – Kdy jde rodina na pole, Příprava půdy
// a setí; Martin 19. 11. 2026 – D102: „Ano. Na začátku vsi to jsou spíš zemědělci. Až postupně,
// když je ves veliká se z rodu knížete stává postupně šlechta“): když ves v okně setí sama
// nestihne připravit a osít půdu, na kterou má osivo, dá rodina jen práci, která chybí – až po
// práci vsi, napřed ženy a dcery, pak muži, vojvoda nakonec; ves, která stihne sama, pomoc nemá.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const START = at(600, 8, 31);
const PLAN_DAY = at(600, 9, 1);
const OUTSIDE = 500;

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
    distanceM: 50 + Math.round((50 * i) / Math.max(1, count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves k 31. 8. 600 s `count` díly po 225 m² (úrodnost 0,9) a zásobami 8000 kg (osivo na všechno):
 * cvičící dvorec (vojvoda 40, žena 38, syn 17 se snachou 16, syn 11) a 4 dospělí jinde. Se 600
 * díly (13,5 ha) ves setí sama nestihne, se 40 díly (0,9 ha) ano.
 */
function sowingVillage(count: number): VillageState {
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
        parts: parts(count),
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
  s.storesKg = 8000;
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

describe('podíl dne rodiny na přípravě půdy a setí (lordSowingHelp)', () => {
  const village: SowingCapacity = {
    autumnWinter: 70,
    autumn: 200,
    spring: 100,
    july: 50,
    august: 80,
    september: 30,
  };
  // práce rodiny v okně: ozim 40, podzim 100, jaro 60
  const withLord: SowingCapacity = { ...village, autumnWinter: 110, autumn: 300, spring: 160 };
  const load = (extra: Partial<CropLoad> = {}): CropLoad => ({
    winterAutumn: 60,
    july: 0,
    springReclaim: 0,
    springDig: 0,
    springSow: 40,
    august: 0,
    september: 0,
    ploughWinter: 0,
    ploughSpring: 0,
    ...extra,
  });

  it('ves, která přípravu a setí stihne sama, pomoc nemá – ani ve žních', () => {
    expect(lordSowingHelp(load(), village, withLord)).toEqual({});
    // zátěž žní se setí netýká
    expect(lordSowingHelp(load({ july: 500, august: 500 }), village, withLord)).toEqual({});
  });

  it('ozim, který ves v září–říjnu nestihne – jen chybějící práce ÷ práce rodiny', () => {
    expect(lordSowingHelp(load({ winterAutumn: 90 }), village, withLord)).toEqual({
      autumnWinter: 0.5,
    });
    // víc, než rodina za okno dá, nejvýš celý den
    expect(lordSowingHelp(load({ winterAutumn: 500 }), village, withLord).autumnWinter).toBe(1);
  });

  it('jař: napřed jaro, co jaro nestihne ani s celou rodinou, už na podzim', () => {
    // okno `autumn` nese i jaro – podzim zvlášť: ves 200 − 100, rodina (300 − 200) − (160 − 100)
    // podzim po ozimu (60) vrátí a zkope 40 z 60, zbytek 20 jde se 120 setí na jaro: chybí 40 z 60
    const spring = lordSowingHelp(load({ springDig: 60, springSow: 120 }), village, withLord);
    expect(spring.spring).toBeCloseTo(40 / 60, 12);
    expect(spring.autumn).toBeUndefined();
    // jaro nestihne ani s rodinou: chybí 70, rodina dá na jaře 60, 10 kopání už na podzim (ze 40)
    const both = lordSowingHelp(load({ springDig: 60, springSow: 150 }), village, withLord);
    expect(both.spring).toBe(1);
    expect(both.autumn).toBeCloseTo(10 / 40, 12);
    // podzimní podíl nese i pomoc s ozimem: 20 ozimu a 20 kopání ze 40 práce rodiny na podzim
    const withWinter = lordSowingHelp(
      load({ winterAutumn: 90, springDig: 60, springSow: 150 }),
      village,
      withLord,
    );
    expect(withWinter.autumnWinter).toBe(0.5);
    expect(withWinter.autumn).toBe(1);
  });
});

describe('podíl dnešního dne (lordSowingShare)', () => {
  const plan = (lordSowing?: FarmSeason['lordSowing']): FarmSeason =>
    ({ startDay: PLAN_DAY, ...(lordSowing ? { lordSowing } : {}) }) as FarmSeason;

  it('jen v oknech setí – v září a říjnu nejvyšší z ozimu a podzimu', () => {
    const p = plan({ autumnWinter: 0.3, autumn: 0.6, spring: 0.7, july: 1 });
    expect(lordSowingShare(p, at(600, 9, 15))).toBe(0.6);
    expect(lordSowingShare(plan({ autumnWinter: 0.8, autumn: 0.2 }), at(600, 10, 1))).toBe(0.8);
    expect(lordSowingShare(p, at(600, 11, 20))).toBe(0.6);
    expect(lordSowingShare(p, at(601, 3, 1))).toBe(0.7);
    expect(lordSowingShare(p, at(601, 7, 1))).toBe(0);
    expect(lordSowingShare(p, at(601, 12, 1))).toBe(0);
    expect(lordSowingShare(plan(), at(600, 9, 15))).toBe(0);
    expect(lordSowingShare(null, at(600, 9, 15))).toBe(0);
  });
});

describe('práce dne s pomocí s přípravou půdy a setím (allocateDay)', () => {
  const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery };

  it('jen vracení, kopání, orba a setí – ne seč, žeň ani pletí', () => {
    const a = allocateDay({
      ...base,
      capacity: 0,
      lordSowing: 10,
      tasks: [
        { name: 'mow', remaining: 2 },
        { name: 'harvest', remaining: 2 },
        { name: 'reclaim', remaining: 1 },
        { name: 'plough', remaining: 1 },
        { name: 'dig', remaining: 1 },
        { name: 'sow', remaining: 1 },
        { name: 'weed', remaining: 2 },
      ],
    });
    expect(a.tasks.mow).toBe(0);
    expect(a.tasks.harvest).toBe(0);
    expect(a.tasks.weed).toBe(0);
    for (const task of ['reclaim', 'plough', 'dig', 'sow'] as const) {
      expect(a.tasks[task]).toBeCloseTo(1, 12);
    }
    expect(a.lordField).toBeCloseTo(4, 12);
  });

  it('až po práci vsi – jen co ves dnes nestihne, vsi neuvolní práci jinam', () => {
    const tasks = (remaining: number): { name: 'dig' | 'mow'; remaining: number }[] => [
      { name: 'dig', remaining },
      { name: 'mow', remaining: 1 },
    ];
    const alone = allocateDay({ ...base, capacity: 3, tasks: tasks(4) });
    const helped = allocateDay({ ...base, capacity: 3, lordSowing: 2, tasks: tasks(4) });
    // ves dá všechno jako bez rodiny, rodina jen zbytek kopání; seč dál čeká
    expect(helped.tasks.mow).toBe(alone.tasks.mow);
    expect(helped.common).toBe(alone.common);
    expect(helped.tasks.dig).toBeCloseTo(alone.tasks.dig + helped.lordField, 12);
    expect(helped.lordField).toBeCloseTo(Math.min(2, 4 - alone.tasks.dig), 12);
    // ves stihne sama – rodina cvičí
    const light = allocateDay({ ...base, capacity: 3, lordSowing: 2, tasks: tasks(0.1) });
    expect(light.lordField).toBe(0);
    expect(light.common).toBe(allocateDay({ ...base, capacity: 3, tasks: tasks(0.1) }).common);
  });

  it('všechny pomoci dne dohromady nejvýš celá práce rodiny; v listopadu výmlat až po setí', () => {
    const harvestDay = allocateDay({
      ...base,
      capacity: 0,
      lordHelp: 3,
      lordSowing: 3,
      lordFree: 4,
      tasks: [
        { name: 'harvest', remaining: 3 },
        { name: 'dig', remaining: 3 },
      ],
    });
    expect(harvestDay.tasks.harvest).toBeCloseTo(3, 12);
    expect(harvestDay.tasks.dig).toBeCloseTo(1, 12);
    expect(harvestDay.lordField).toBeCloseTo(4, 12);
    // listopad: příprava jaře ze svého podílu, výmlat jen do tempa okna ze zbytku práce rodiny
    const november = allocateDay({
      ...base,
      capacity: 0,
      lordSowing: 2,
      lordFree: 3,
      threshPace: 5,
      tasks: [
        { name: 'dig', remaining: 5 },
        { name: 'thresh', remaining: 5 },
      ],
    });
    expect(november.tasks.dig).toBeCloseTo(2, 12);
    expect(november.tasks.thresh).toBeCloseTo(1, 12);
    expect(november.lordField).toBeCloseTo(3, 12);
  });
});

describe('práce dvorce v okně setí (manorLabor)', () => {
  const withShare = (s: VillageState, lordSowing: FarmSeason['lordSowing']): VillageState => {
    s.season = { startDay: PLAN_DAY, crops: [], lordSowing } as unknown as FarmSeason;
    return s;
  };

  it('podíl dne z plánu × práce rodiny jen v oknech setí', () => {
    const s = withShare(sowingVillage(40), { autumnWinter: 0.5, spring: 1 });
    const coverage = craftCoverage(s, START);
    const p = villageProductivity(s, coverage);
    const october = manorLabor(s, at(600, 10, 5), coverage.pottery, p);
    expect(october.sowing).toBeCloseTo(0.5 * october.free, 12);
    expect(october.help).toBe(0);
    expect(manorLabor(s, at(600, 12, 5), coverage.pottery, p).sowing).toBe(0);
    const march = manorLabor(s, at(601, 3, 5), coverage.pottery, p);
    expect(march.sowing).toBeCloseTo(march.free, 12);
  });

  it('kdo je na výpravě, nepomáhá – práci rodiny dají jen ti, kdo jsou ve vsi', () => {
    const day = at(600, 10, 5);
    const home = withShare(sowingVillage(40), { autumnWinter: 1 });
    const away = structuredClone(home);
    for (const p of away.people) {
      if (p.id === 10 || p.id === 12) p.away = { kind: 'journey', refId: 'j1' };
    }
    const coverage = craftCoverage(home, START);
    const p = villageProductivity(home, coverage);
    const all = manorLabor(home, day, coverage.pottery, p);
    const left = manorLabor(away, day, coverage.pottery, p);
    // muži jsou pryč – zbudou jen ženy dvorce
    expect(left.freeMen).toBe(0);
    expect(left.free).toBeLessThan(all.free);
    expect(left.sowing).toBeCloseTo(left.free, 12);
  });

  it('kdo jde podle plánu na pole, nejezdí – ženy napřed, muži, vojvoda nakonec', () => {
    const day = at(600, 10, 5);
    const s = withShare(sowingVillage(40), { autumnWinter: 1 });
    const family = lordFamily(s, day);
    // celý den – na poli jsou oba muži (chlapec 11 let cvičí vždy)
    expect([...harvestFieldIds(s, day, family)].sort()).toEqual([10, 12]);
    // malý podíl – stačí ženy, muži jezdí
    withShare(s, { autumnWinter: 0.05 });
    expect(harvestFieldIds(s, day, family).size).toBe(0);
    // mimo okno setí nikdo
    expect(harvestFieldIds(s, at(600, 12, 5), family).size).toBe(0);
  });
});

describe('rodina v okně setí (lordHelpDay, advanceVillage)', () => {
  it('ves, která setí sama nestihne – rodina dá chybějící práci, kdo je na poli, necvičí', () => {
    const planned = advanceVillage(sowingVillage(600), PLAN_DAY, null);
    const september = advanceVillage(planned, at(600, 9, 10), null);
    const help = september.season!.lordSowing!;
    expect(help.autumnWinter).toBeGreaterThan(0);
    for (const share of Object.values(help)) expect(share).toBeLessThanOrEqual(1);
    expect(Object.keys(help).every((w) => ['autumnWinter', 'autumn', 'spring'].includes(w))).toBe(
      true,
    );
    // ženy napřed, chlapec 11 let cvičí vždy
    const lord = september.labor!.lord!;
    expect(lord.field).toBeGreaterThanOrEqual(2);
    expect(lord.training).toBeLessThan(3);
    expect(lord.training + lord.field + lord.household).toBe(5);
  });

  it('ves, která setí stihne sama, pomoc nemá – rodina cvičí', () => {
    const planned = advanceVillage(sowingVillage(40), PLAN_DAY, null);
    const september = advanceVillage(planned, at(600, 9, 10), null);
    expect(september.season!.lordSowing).toBeUndefined();
    expect(september.labor?.lord).toEqual({ training: 3, field: 0, household: 2 });
  });

  it('rodina, která necvičí, podíl nemá; mimo okna setí se podíl nemění', () => {
    const planned = advanceVillage(sowingVillage(600), at(600, 9, 10), null);
    const working = structuredClone(planned);
    working.lord = {};
    lordHelpDay(working, at(600, 9, 11), craftCoverage(working, at(600, 9, 11)), null);
    expect(working.season!.lordSowing).toBeUndefined();
    const december = structuredClone(planned);
    lordHelpDay(december, at(600, 12, 5), craftCoverage(december, at(600, 12, 5)), null);
    expect(december.season!.lordSowing).toEqual(planned.season!.lordSowing);
  });
});
