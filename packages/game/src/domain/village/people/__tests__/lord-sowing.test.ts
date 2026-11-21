import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { craftCoverage } from '../../crafts/crafts';
import { allocateDay } from '../../core/labor';
import { NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import {
  lordHelpDay,
  sowingCapacity,
  sowingHelpLoad,
  villageProductivity,
} from '../../core/simulate-plan';
import { villagersToday, planVillagers } from '../../core/morning-water';
import { windowSeedThreshKg } from '../../fields/seed';
import { createCropWork, lateHarvestRemaining } from '../../core/year-plan';
import { cullingMeatKg, LIVESTOCK } from '../../livestock/livestock';
import {
  cropLoadOf,
  lordSowingHelp,
  lordSowingShare,
  type CropLoad,
  type SowingCapacity,
} from '../../fields/sowing';
import { harvestFieldIds, lordApartIds, lordFamily, manorLabor } from '../lord';
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

describe('úlohy dne před přípravou půdy a chybějící práce (D102 kolo 1)', () => {
  const DAY = at(600, 9, 2);
  const planned = (count = 600, ready?: (s: VillageState) => void): VillageState => {
    const s = sowingVillage(count);
    ready?.(s);
    return advanceVillage(s, PLAN_DAY, null);
  };
  const capacity = (
    s: VillageState,
    day: number,
    options: Parameters<typeof sowingCapacity>[6] = {},
  ): SowingCapacity =>
    sowingCapacity(s, day, craftCoverage(s, day), false, null, undefined, options);
  // nutná otava (2. seč) – zbývá `work` člověkodnů do 30. 9.
  const withAftermath = (s: VillageState, work: number): VillageState => {
    s.hay = {
      ...(s.hay ?? { kg: 0 }),
      mowing: { partIds: [], required: work, needed: work, done: 0, yieldKg: 1000, cut: 2 },
    };
    return s;
  };
  // jedno spřežení v ohradě (oxen.md – Jen rádlo)
  const withTeam = (s: VillageState): void => {
    s.pens = [
      {
        id: 900,
        cell: { x: 8, y: 9 },
        x: -22.5,
        z: -7.5,
        builtDay: START - 800,
        team: { readyDay: START - 10 },
        training: null,
      },
    ];
  };

  it('otava a porážka ubírají vsi okna setí, ve kterých dnešek leží – rodině ne', () => {
    const s = withAftermath(planned(), 30);
    s.livestock = { ...s.livestock!, slaughterWork: { required: 5, done: 0 } };
    const plain = capacity(s, DAY);
    const busy = capacity(s, DAY, { beforeTillage: true });
    expect(plain.autumnWinter - busy.autumnWinter).toBeCloseTo(35, 9);
    expect(plain.autumn - busy.autumn).toBeCloseTo(35, 9);
    // jaro (březen–duben) dnešní úlohy nenese, žně taky ne
    expect(busy.spring).toBe(plain.spring);
    expect(busy.september).toBe(plain.september);
    // práce rodiny v okně zůstane celá – s otavou a porážkou nepomáhá
    const family = (options: Parameters<typeof sowingCapacity>[6]): number =>
      capacity(s, DAY, { ...options, lord: true }).autumnWinter -
      capacity(s, DAY, options).autumnWinter;
    expect(family({ beforeTillage: true })).toBeCloseTo(family({}), 9);
  });

  it('zimní porážka po dnech – listopad nese podzim, březen podzim i jaro', () => {
    const s = planned();
    s.livestock = {
      ...s.livestock!,
      herds: { ...s.livestock!.herds, cow: 4 },
      culling: { sheep: 0, goat: 0, pig: 0, cow: 2 },
    };
    const work = cullingMeatKg(s) / LIVESTOCK.slaughterKgPerManDay;
    expect(work).toBeGreaterThan(0);
    // 16. 11. 600: do 30. 11. 15 dní, březen 31, zima do 31. 3. 601 136 dní
    const day = at(600, 11, 16);
    const plain = capacity(s, day);
    const busy = capacity(s, day, { beforeTillage: true });
    expect(plain.autumn - busy.autumn).toBeCloseTo((work * 46) / 136, 9);
    expect(plain.spring - busy.spring).toBeCloseTo((work * 31) / 136, 9);
    // v září a říjnu ves kusy na zimu ještě nevybrala – nic
    // (okno `autumn` – září–listopad – zimní měsíce má, `autumnWinter` ne; D102 kolo 2, N2)
    expect(capacity(s, DAY, { beforeTillage: true }).autumn).toBeCloseTo(
      capacity(s, DAY).autumn,
      9,
    );
  });

  it('ves s otavou v září – rodina pomůže, i když přípravu a setí by jinak stihla sama', () => {
    const fine = planned(40);
    lordHelpDay(fine, DAY, craftCoverage(fine, DAY), null);
    expect(fine.season!.lordSowing).toBeUndefined();
    const mowing = withAftermath(planned(40), 2000);
    lordHelpDay(mowing, DAY, craftCoverage(mowing, DAY), null);
    expect(mowing.season!.lordSowing?.autumnWinter).toBeGreaterThan(0);
  });

  it('ves bez osiva – rodina nepomáhá, i když půdy na řadě je dost', () => {
    const fed = planned();
    lordHelpDay(fed, DAY, craftCoverage(fed, DAY), null);
    expect(fed.season!.lordSowing?.autumnWinter).toBeGreaterThan(0);
    const empty = planned();
    empty.storesKg = 0;
    delete empty.sowingSeed;
    for (const crop of empty.season!.crops) if (crop.seedKg !== undefined) crop.seedKg = 0;
    const load = cropLoadOf(sowingHelpLoad(empty, DAY, NO_CRAFTS.tools, false, undefined));
    expect(load.winterAutumn).toBe(0);
    lordHelpDay(empty, DAY, craftCoverage(empty, DAY), null);
    expect(empty.season!.lordSowing).toBeUndefined();
  });

  it('ves s jedním spřežením – zátěž i podíl jen na to, co spřežení do konce okna zorají', () => {
    // ruce vsi v září na otavě – sama nezorá ani to, co spřežení stihne
    const s = withAftermath(planned(1200, withTeam), 150);
    const coverage = craftCoverage(s, DAY);
    const village = sowingCapacity(s, DAY, coverage, true, null, undefined, {
      beforeTillage: true,
    });
    expect(village.plough).toBeDefined();
    const capped = cropLoadOf(sowingHelpLoad(s, DAY, coverage.tools, true, village.plough));
    const free = cropLoadOf(sowingHelpLoad(s, DAY, coverage.tools, true, undefined));
    // orba ozimu nejvýš to, co spřežení do konce října zorá – víc rukou ji nezrychlí
    expect(capped.ploughWinter).toBeCloseTo(village.plough!.autumnWinter, 6);
    expect(free.ploughWinter).toBeGreaterThan(capped.ploughWinter + 1);
    const withLord = sowingCapacity(s, DAY, coverage, true, null, undefined, {
      lord: true,
      beforeTillage: true,
      ploughCapacity: village.plough!,
    });
    lordHelpDay(s, DAY, coverage, null);
    const share = s.season!.lordSowing!.autumnWinter!;
    expect(share).toBeCloseTo(
      (capped.winterAutumn - village.autumnWinter) / (withLord.autumnWinter - village.autumnWinter),
      9,
    );
    // bez stropu orby by rodina šla celá – zorat by to ale nestihla
    expect(share).toBeLessThan(0.5);
    expect(lordSowingHelp(free, village, withLord).autumnWinter).toBe(1);
  });

  it('v září dá rodina napřed žni jaře, kterou ves nestihne – setí jen zbytek', () => {
    const s = planned();
    const family = (state: VillageState): number =>
      capacity(state, DAY, { lord: true }).autumnWinter - capacity(state, DAY).autumnWinter;
    const late = structuredClone(s);
    // loňská jař osetá a nesklizená – v září se dožíná (fields.md – Žeň jaře i v září)
    const work = createCropWork(late.parts.slice(0, 300), at(599, 9, 1), 0, false);
    work.done = { ...work.required };
    work.done.harvest = 0;
    work.done.thresh = 0;
    work.required.harvest = 5000;
    late.threshingSeason = {
      startDay: at(599, 9, 1),
      crops: [{ crop: 'spring', ...work, harvestedKg: null }],
    } as unknown as FarmSeason;
    // žeň, kterou ves se žňovými rukama v září nestihne, vezme rodině celé září
    expect(lateHarvestRemaining(late)).toBe(5000);
    const september = capacity(late, DAY, { lord: true }).september - capacity(late, DAY).september;
    expect(september).toBeGreaterThan(0);
    expect(family(s) - family(late)).toBeCloseTo(september, 6);
    expect(capacity(late, DAY, { lord: true }).autumn - capacity(late, DAY).autumn).toBeCloseTo(
      capacity(s, DAY, { lord: true }).autumn - capacity(s, DAY).autumn - september,
      6,
    );
  });
});

describe('plán počítá stejné lidi jako den (D102 kolo 2)', () => {
  const DAY = at(600, 9, 2);
  const capacity = (s: VillageState): SowingCapacity =>
    sowingCapacity(s, DAY, craftCoverage(s, DAY), false, null, undefined, {});
  const base = (): VillageState => advanceVillage(sowingVillage(600), PLAN_DAY, null);

  it('mistr huti mezi stavbami a člověk na tažení do volné práce plánu nepatří', () => {
    const plain = base();
    const withIdle = structuredClone(plain);
    withIdle.people = [
      ...withIdle.people,
      person(30, 30, OUTSIDE, 'male', { mason: 'builder' }),
      person(31, 35, OUTSIDE, 'female', { priest: true }),
      person(32, 28, OUTSIDE, 'male', { away: { kind: 'campaign', untilDay: DAY + 100 } }),
    ];
    expect(capacity(withIdle)).toEqual(capacity(plain));
    // stejní lidé jako den (`villagersToday`) a jedna sdílená funkce
    const crafts = new Set<number>();
    const apart = lordApartIds(withIdle, DAY);
    expect(apart.size).toBeGreaterThan(0);
    expect(villagersToday(withIdle, DAY, crafts).villagers.map((p) => p.id)).toEqual(
      planVillagers(withIdle, DAY)
        .filter((p) => !apart.has(p.id))
        .map((p) => p.id),
    );
    expect(planVillagers(withIdle, DAY)).toHaveLength(plain.people.length);
    // bez nich bez změny – týž seznam
    expect(planVillagers(plain, DAY)).toBe(plain.people);
  });

  it('denní nepřítomnost (lov, požár, nájezd) plán nezná – jen trvalá', () => {
    const s = base();
    const hunter = s.people.find((p) => p.dwellingId === OUTSIDE)!;
    hunter.away = { kind: 'service', untilDay: DAY + 1 };
    expect(planVillagers(s, DAY).some((p) => p.id === hunter.id)).toBe(false);
    expect(planVillagers(s, DAY + 1).some((p) => p.id === hunter.id)).toBe(true);
  });
});

describe('výmlat na osivo nejvýš na plochu zátěže (D102 kolo 2, I2)', () => {
  const DAY = at(600, 9, 2);
  it('odhad nepřestřelí osivo plochy; ideál hromady okna bez stropu ano', () => {
    const s = advanceVillage(sowingVillage(600), PLAN_DAY, null);
    // málo zásob, hodně snopů – ves musí mlátit na osivo
    s.storesKg = 50;
    s.sowingSeed = { crop: 'winter', totalKg: 9000, kg: 50, days: 60 } as never;
    s.sheaves = { grainKg: 100000, legumesKg: 0 };
    s.threshingGraceUntil = DAY + 100;
    const tools = craftCoverage(s, DAY).tools;
    const wide = windowSeedThreshKg(s, DAY, tools, () => Infinity);
    const small = windowSeedThreshKg(s, DAY, tools, () => 100);
    const none = windowSeedThreshKg(s, DAY, tools, () => 0);
    expect(none).toBe(0);
    // osivo plochy 100 kg, 50 kg ve stodole – vymlátit jen zbytek; bez stropu skoro ideál okna
    expect(small).toBeCloseTo(50, 6);
    expect(wide).toBeGreaterThan(small * 10);
  });
});
