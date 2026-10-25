import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { foundField, foundPen, foundVillage } from '../actions';
import { fieldPartLooks, taskPosition, taskSpans } from '../field-progress';
import { partFoundingCost } from '../fields';
import { breedingCows } from '../husbandry';
import { LIVESTOCK } from '../livestock';
import { haulCartsToday, tradeCarts } from '../carts';
import {
  ARD,
  PEN,
  ableTeams,
  lastingOxen,
  oxPlaces,
  oxenTraining,
  penBuildLabor,
  penDay,
  ploughCapacityPerDay,
  trainTeamsWhenReady,
  trainedOxen,
  villageArds,
  villageOxen,
  withOxen,
  type OxenGoal,
  type PenInput,
} from '../oxen';
import { oxTrainedDay } from '../pens';
import { DRAFT_OXEN, OXEN, PEN_PLACES_PER_SQUARE } from '../rules';
import { PLOUGH_HA_PER_DAY, PLOUGH_SOD_FACTOR, hasSod, ploughWorkPerHa } from '../plough';
import { NO_CRAFTS } from '../productivity';
import { cloneState } from '../clone';
import { advanceVillage } from '../simulate';
import { chooseCrops, orchardOnlyLoad } from '../sowing';
import type { ChronicleEvent, FieldPart, VillageState } from '../types';
import {
  createCropWork,
  createPlan,
  partWeight,
  partWork,
  planCrops,
  planPartIds,
  ploughToHoe,
  tilledShare,
} from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

// Ohrada, spřežení a orba rádlem (oxen.md).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** Kolik volů a párů ves chce a kolik krav drží (telata jen nad nimi – bez údaje 1 kráva). */
const goal = (oxen: number, ploughPairs: number, breedingCows = 1): OxenGoal => ({
  oxen,
  ploughPairs,
  breedingCows,
});
const PEN_INPUT: PenInput = {
  species: 'team',
  squares: [
    {
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      obstacleCost: 0,
      obstacleIds: [],
      clearedTrees: 0,
    },
  ],
};

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.woodLogs = 20;
  return s;
}

/**
 * Dopočítá ves do `toDay` a každé léto (1. 8., po seči) doplní seno na `hayKg` – ves v testu nemá
 * louky na seč a loňské seno se k nové seči zkazí (oxen.md – Seno).
 */
function advanceWithHay(s: VillageState, toDay: number, hayKg: number): VillageState {
  let state = s;
  while (state.lastDay < toDay) {
    const { year } = dateOfDayIndex(state.lastDay);
    let august = at(year, 8, 1);
    if (august <= state.lastDay) august = at(year + 1, 8, 1);
    state = advanceVillage(state, Math.min(toDay, august), null);
    if (state.lastDay === august) state.hay = { ...(state.hay ?? { mowing: null }), kg: hayKg };
  }
  return state;
}

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

/**
 * Ves s hotovou ohradou spřežení a vycvičeným spřežením a s ohradou skotu (krávy stojí na noc
 * v ohradě – oxen.md, Ohrady podle druhu).
 */
function withTeam(day: number): VillageState {
  const s = village(day);
  s.pens = [
    {
      id: 900,
      species: 'team',
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: day - 800,
      team: { readyDay: day - 10 },
      training: null,
    },
    {
      id: 901,
      species: 'cattle',
      cell: { x: 4, y: 4 },
      x: 65,
      z: 60,
      builtDay: day - 800,
      team: null,
      training: null,
    },
  ];
  return s;
}

describe('ohrada', () => {
  it('stavba 40 čd (i s kácením blízkého lesa) a 6 stromů – klády z hromady', () => {
    const day = at(600, 5, 1);
    const s = foundPen(village(day), day, PEN_INPUT, null);
    const c = s.constructions.find((x) => x.kind === 'pen')!;
    expect(penBuildLabor()).toBe(PEN.laborManDays - PEN.trees * 2);
    // dřevo z hromady – nic se nekácí
    expect(c.cost).toBe(penBuildLabor());
    expect(s.woodLogs).toBe(20 - PEN.trees);
    expect(s.pens).toHaveLength(1);
    expect(s.pens![0]!.builtDay).toBeNull();
    const built = advanceVillage(s, day + 60, null);
    expect(built.pens![0]!.builtDay).not.toBeNull();
    expect(
      built.chronicle.some(
        (e) => e.kind === 'construction-finished' && e.constructionKind === 'pen',
      ),
    ).toBe(true);
    expect(() => foundPen(built, built.lastDay, PEN_INPUT, null)).toThrow(/ohrada/);
  });

  it('výcvik začne sám (Martin 19. 10. 2026): ohrada stojí, telata ze stáda a dřevo na rádlo', () => {
    const day = at(600, 5, 1);
    const s = foundPen(village(day), day, PEN_INPUT, null);
    expect(oxenTraining(s, day, goal(2, 1), null)).toMatch(/staví/);
    s.livestock!.herds.cow = 3;
    const built = advanceVillage(s, day + 60, null);
    // telata chybí – krávy nemají přírůstek nad chovné stádo (půl krávy na mléko + 3 krávy + půl
    // krávy na vola), ohrada čeká
    expect(breedingCows(built)).toBeCloseTo(4.5, 9);
    expect(built.pens![0]!.builtDay).not.toBeNull();
    expect(built.pens![0]!.oxen).toEqual([]);
    expect(oxenTraining(built, built.lastDay, goal(2, 1, 4.5), null)).toMatch(/telata/);
    built.livestock!.herds.cow = 6.6;
    const training = advanceVillage(built, built.lastDay + 1, null);
    // bez hráče: pár telat do výcviku (ves chce pár k rádlu), rádlo staví ves (kláda z hromady);
    // krávy pod chovné stádo neklesnou
    expect(training.livestock!.herds.cow).toBeCloseTo(4.6, 2);
    const ready = oxTrainedDay(built.lastDay + 1);
    expect(training.pens![0]!.oxen).toEqual([{ trainedDay: ready }, { trainedDay: ready }]);
    const ard = training.constructions.find((c) => c.kind === 'ard')!;
    expect(ard.cost).toBe(ARD.laborManDays);
    expect(oxenTraining(training, training.lastDay, goal(2, 1), null)).toBe('Ves má dost volů.');
  });

  it('telata jen z přírůstku nad chovnými kravami – stádo pod cíl neklesne, výcvik počká na jaro', () => {
    expect(
      oxenTraining(withOxen(withTeam(at(600, 5, 1))), at(600, 5, 1), goal(4, 1, 4), null),
    ).toMatch(/přírůstek/);
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.pens![0]!.team = null;
    // chovné stádo 4,5 krávy (půl krávy na mléko + 3 + půl krávy na vola) – 4,6 krávy přírůstek
    // na tele nemají
    s.livestock!.herds.cow = 4.6;
    const march = advanceWithHay(s, at(601, 3, 31), 20_000);
    expect(march.pens![0]!.oxen).toEqual([]);
    expect(march.livestock!.herds.cow).toBeGreaterThan(3);
    // 1. 4. mláďata – telata z přírůstku, krávy zůstanou nad chovným stádem
    const spring = advanceWithHay(s, at(601, 4, 1), 20_000);
    expect(spring.pens![0]!.oxen!.length).toBeGreaterThan(0);
    expect(spring.livestock!.herds.cow).toBeGreaterThanOrEqual(breedingCows(spring) - 1e-9);
    // přímo: z 5,5 krávy při cíli 4 jen jedno tele, ze 4,6 žádné
    const t = withOxen(withTeam(day));
    t.pens![0]!.oxen = [];
    // bez rádla – náhrada posledního páru neplatí (oxen.md – Co nejvíc sena a co největší stáda)
    t.ards = 0;
    t.livestock!.herds.cow = 5.5;
    expect(oxenTraining(t, day, goal(2, 1, 4), null)).toEqual({ calves: 1, ards: 0 });
    trainTeamsWhenReady(t, day, null, goal(2, 1, 4));
    expect(t.livestock!.herds.cow).toBeCloseTo(4.5, 9);
    t.livestock!.herds.cow = 4.6;
    expect(oxenTraining(t, day, goal(4, 1, 4), null)).toMatch(/přírůstek/);
  });

  it('náhrada volů i po rozpadu páru – ves má rádlo, pár nemá ani necvičí (24. 10. 2026)', () => {
    const day = at(600, 5, 1);
    const t = withOxen(withTeam(day));
    t.pens![0]!.oxen = [];
    t.ards = 1;
    // 4,6 krávy pod chovným stádem 4 + přírůstek – dřív by výcvik čekal (pár už nesloužil)
    t.livestock!.herds.cow = 4.6;
    expect(oxenTraining(t, day, goal(4, 1, 4), null)).toEqual({ calves: 2, ards: 0 });
    // chovný pár krav zůstane – z 3,5 krávy jen jedno tele
    t.livestock!.herds.cow = 3.5;
    expect(oxenTraining(t, day, goal(4, 1, 4), null)).toEqual({ calves: 1, ards: 0 });
  });

  it('náhrada posledního páru k orbě má přednost před cílem krav – dokud zůstane chovný pár', () => {
    const day = at(600, 5, 1);
    const t = withOxen(withTeam(day));
    // pár je v posledních 2 letech služby – bez náhrady by ves orala motykou
    const old = day - Math.ceil((OXEN.serviceYears - OXEN.trainingYears) * 365.25);
    t.pens![0]!.oxen = [{ trainedDay: old }, { trainedDay: old }];
    t.livestock!.herds.cow = 3.5;
    // chovné stádo 4 krávy: přírůstek žádný, ale chovný pár zůstane – jedno tele hned
    expect(oxenTraining(t, day, goal(2, 1, 4), null)).toEqual({ calves: 1, ards: 0 });
    t.livestock!.herds.cow = 4.2;
    expect(oxenTraining(t, day, goal(2, 1, 4), null)).toEqual({ calves: 2, ards: 0 });
    // pod chovný pár ne
    t.livestock!.herds.cow = 2.9;
    expect(oxenTraining(t, day, goal(2, 1, 4), null)).toMatch(/přírůstek/);
    // ves, která neorá (bez párů k rádlům), ani voli na vozy přednost nemají
    t.livestock!.herds.cow = 3.5;
    expect(oxenTraining(t, day, goal(1, 0, 4), null)).toMatch(/přírůstek/);
    // jiný pár ještě slouží – druhý pár a voli na vozy jen z přírůstku
    t.pens![0]!.oxen.push({ trainedDay: day - 10 }, { trainedDay: day - 10 });
    t.pens![0]!.extraSquares = [{ cell: { x: 3, y: 5 }, x: 50, z: 75 }];
    expect(oxenTraining(t, day, goal(5, 2, 4), null)).toMatch(/přírůstek/);
  });

  it('v zimě začne výcvik, jen když seno vystačí volům i telatům do konce března', () => {
    const day = at(600, 12, 1);
    const s = withTeam(day);
    s.pens![0]!.team = null;
    s.livestock!.herds.cow = 4;
    s.hay = { kg: 100, mowing: null };
    expect(oxenTraining(s, day, goal(2, 1), null)).toBe('Na výcvik chybí seno.');
    // 1 tele × 6 kg × (prosinec až březen – 121 dní) – jen jedno
    s.hay.kg = 6 * 121;
    expect(oxenTraining(s, day, goal(2, 1), null)).toEqual({ calves: 1, ards: 0 });
    s.hay.kg = 2 * 6 * 121;
    expect(oxenTraining(s, day, goal(2, 1), null)).toEqual({ calves: 2, ards: 1 });
    expect(oxenTraining(s, at(601, 4, 1), goal(2, 1), null)).toEqual({ calves: 2, ards: 1 });
  });

  it('dopočet po kouscích dá stejný výcvik jako jedním voláním', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.pens![0]!.team = null;
    s.livestock!.herds.cow = 2.7;
    s.hay = { kg: 20_000, mowing: null };
    const end = at(602, 5, 1);
    const whole = advanceVillage(s, end, null);
    let chunked = s;
    for (let d = s.lastDay + 41; d < end; d += 41) chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, end, null);
    expect(chunked.pens).toEqual(whole.pens);
    expect(chunked.livestock).toEqual(whole.livestock);
    expect(chunked.constructions).toEqual(whole.constructions);
  });

  it('trainTeamsWhenReady nic nezačne, když voli stačí, a cvičí tolik, kolik ves chce a vejde se', () => {
    const day = at(600, 5, 1);
    const s = withOxen(withTeam(day));
    trainTeamsWhenReady(s, day, null, goal(2, 1));
    // pár slouží – nic
    expect(s.pens![0]!.oxen).toHaveLength(2);
    expect(s.constructions.some((c) => c.kind === 'ard')).toBe(false);
    s.livestock!.herds.cow = 10;
    // ves chce 5 volů: 3 telata, rádlo jen pro nový pár k orbě (chce 2 páry)
    trainTeamsWhenReady(s, day, null, goal(5, 2));
    expect(s.pens![0]!.oxen).toHaveLength(5);
    expect(s.constructions.filter((c) => c.kind === 'ard')).toHaveLength(1);
    // 6 míst na čtverec – víc se nevejde
    trainTeamsWhenReady(s, day, null, goal(12, 2));
    expect(s.pens![0]!.oxen).toHaveLength(6);
    expect(oxenTraining(s, day, goal(12, 2), null)).toBe('Ohrada volů je plná.');
    expect(s.constructions.filter((c) => c.kind === 'ard')).toHaveLength(1);
  });

  it('za 2 roky je vůl vycvičený, po 10 letech dosloužil a šel na maso', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.pens![0]!.team = null;
    s.pens![0]!.training = { startDay: day };
    s.hay = { kg: 20_000, mowing: null }; // telata přes zimu potřebují seno
    const before = advanceWithHay(s, day + 700, 20_000);
    expect(trainedOxen(before, before.lastDay)).toBe(0);
    // výcvik zadaný ve starší vsi doběhne beze změny – druhý nezačne (pár stačí)
    expect(before.pens![0]!.oxen).toEqual([
      { trainedDay: oxTrainedDay(day) },
      { trainedDay: oxTrainedDay(day) },
    ]);
    const ready = advanceWithHay(before, day + 732, 20_000);
    expect(ableTeams(ready, ready.lastDay)).toBe(1);
    expect(ready.chronicle.some((e) => e.kind === 'team-ready' && e.oxen === 2)).toBe(true);
    const old = structuredClone(ready);
    const readyDay = old.lastDay - Math.ceil(OXEN.serviceYears * 365.25) + 1;
    old.pens![0]!.oxen = [{ trainedDay: readyDay }, { trainedDay: readyDay }];
    const meat = old.meatKg ?? 0;
    const events = penDay(old, old.lastDay + 1, false, NO_CRAFTS.tools);
    expect(events).toEqual([{ day: old.lastDay + 1, kind: 'team-retired', penId: 900, oxen: 2 }]);
    expect(old.meatKg).toBeCloseTo(meat + 2 * LIVESTOCK.oxMeatKg, 9);
    expect(ableTeams(old, old.lastDay + 1)).toBe(0);
  });
});

describe('voli po kusech (Martin 20. 10. 2026)', () => {
  it('ohrada volů má 6 míst na čtverec i s telaty – víc ohrad se sčítá', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    expect(PEN_PLACES_PER_SQUARE.team).toBe(6);
    expect(oxPlaces(s)).toBe(6);
    s.pens![0]!.extraSquares = [{ cell: { x: 3, y: 5 }, x: 50, z: 75 }];
    expect(oxPlaces(s)).toBe(12);
    s.pens!.push({ ...s.pens![1]!, id: 902, species: 'team', cell: { x: 9, y: 9 } });
    expect(oxPlaces(s)).toBe(18);
    // rozšíření ve stavbě se nepočítá
    s.pens![0]!.extraSquares[0]!.constructionId = 77;
    expect(oxPlaces(s)).toBe(12);
  });

  it('převod: spřežení = 2 vycvičení voli se stejným dnem, výcvik = 2 telata, rádlo za spřežení', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.pens![0]!.team = { readyDay: day - 10, weak: 0.7 };
    s.pens![0]!.training = { startDay: day - 100 };
    const converted = withOxen(s);
    expect(converted.pens![0]!.oxen).toEqual([
      { trainedDay: day - 10, weak: 0.7 },
      { trainedDay: day - 10, weak: 0.7 },
      { trainedDay: oxTrainedDay(day - 100) },
      { trainedDay: oxTrainedDay(day - 100) },
    ]);
    expect('team' in converted.pens![0]!).toBe(false);
    expect('training' in converted.pens![1]!).toBe(false);
    expect(converted.pens![1]!.oxen).toBeUndefined();
    expect(converted.ards).toBe(1);
    // jednou – převedená ves se nemění
    expect(withOxen(converted)).toBe(converted);
    // čtení funguje i bez převodu
    expect(villageOxen(s)).toBe(4);
    expect(trainedOxen(s, day)).toBe(2);
    expect(villageArds(s)).toBe(1);
  });

  it('potah: rádlo 2 voli, čtyřkolák 2, dvoukolák 1', () => {
    expect(DRAFT_OXEN).toEqual({ ard: 2, 'four-wheel': 2, 'two-wheel': 1 });
    const day = at(600, 5, 1);
    const s = withOxen(withTeam(day));
    // tři vycvičení voli a jedno rádlo – jeden pár orá, zbyde vůl na dvoukolák
    s.pens![0]!.oxen!.push({ trainedDay: day - 5 });
    expect(ableTeams(s, day)).toBe(1);
    s.carts = [
      { id: 1, kind: 'two-wheel', builtDay: day - 10 },
      { id: 2, kind: 'two-wheel', builtDay: day - 10 },
      { id: 3, kind: 'four-wheel', builtDay: day - 10 },
    ];
    expect(haulCartsToday(s, day, false)).toBe(2);
    expect(haulCartsToday(s, day, true)).toBe(1);
    // na výpravu čtyřkolák (2 voli) a dvoukolák (1 vůl)
    expect(tradeCarts(s, day).map((c) => c.id)).toEqual([3, 1]);
    // druhé rádlo – dva páry orají, vozy stojí
    s.ards = 2;
    s.pens![0]!.oxen!.push({ trainedDay: day - 5 });
    expect(ableTeams(s, day)).toBe(2);
    expect(haulCartsToday(s, day, true)).toBe(0);
  });

  it('zima bez sena: uhyne tolik volů, aby zbylí měli polovinu – nejdřív telata', () => {
    const day = at(601, 3, 1);
    const s = withOxen(withTeam(day));
    s.pens![0]!.oxen!.push({ trainedDay: day + 300 }, { trainedDay: day + 300 });
    // 4 voli, pokrytí 0,2 (potřeba zimy 2 880 kg + březen 744 kg) → seno na 1,6 vola po půl
    // přídělu: přežije jeden – slabý (0,8)
    s.hay = {
      kg: 0,
      mowing: null,
      winter: { oxenNeedKg: 2880, oxenEatenKg: 0.2 * 3624, herdNeedKg: 0, herdEatenKg: 0 },
    };
    const events = penDay(s, day, true, NO_CRAFTS.tools);
    expect(villageOxen(s)).toBe(1);
    expect(s.pens![0]!.oxen![0]!.trainedDay).toBe(day - 10);
    expect(s.pens![0]!.oxen![0]!.weak).toBeCloseTo(0.8, 9);
    expect(events).toEqual([
      { day, kind: 'ox-died', penId: 900, training: false, oxen: 1 },
      { day, kind: 'ox-died', penId: 900, training: true, oxen: 2 },
    ]);
  });
});

describe('náhrada volů (Martin 18. 10. 2026)', () => {
  const YEAR = 365.25;

  it('výcvik náhrady jde jen v posledních 2 letech služby', () => {
    const day = at(600, 5, 1);
    const s = withOxen(withTeam(day));
    s.livestock!.herds.cow = 4;
    const pen = s.pens![0]!;
    const pair = (readyDay: number): void => {
      pen.oxen = [{ trainedDay: readyDay }, { trainedDay: readyDay }];
    };
    pair(day - Math.ceil(YEAR));
    expect(lastingOxen(s, day)).toBe(2);
    expect(oxenTraining(s, day, goal(2, 1), null)).toBe('Ves má dost volů.');
    pair(day - Math.ceil(7.9 * YEAR));
    expect(oxenTraining(s, day, goal(2, 1), null)).toBe('Ves má dost volů.');
    pair(day - Math.ceil((OXEN.serviceYears - OXEN.trainingYears) * YEAR));
    expect(lastingOxen(s, day)).toBe(0);
    // rádlo ves má – vyrobí se jen pro nový pár navíc
    expect(oxenTraining(s, day, goal(2, 1), null)).toEqual({ calves: 2, ards: 0 });
    // ohrada bez volů cvičí kdykoli
    pen.oxen = [];
    expect(oxenTraining(s, day, goal(2, 1), null)).toEqual({ calves: 2, ards: 0 });
  });

  it('náhrada posledního páru i pod cílem krav: ves neorá motykou ani den (návrh Clauda 20. 10. 2026)', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    // chovné stádo 3,5 krávy, ve stádu jen 4,1 – přírůstek na pár nemá, chovný pár ale zůstane
    s.livestock!.herds.cow = 4.1;
    s.hay = { kg: 30_000, mowing: null };
    const readyDay = day + 1 - Math.ceil((OXEN.serviceYears - OXEN.trainingYears) * YEAR - 1e-9);
    s.pens![0]!.team = { readyDay };
    const training = advanceVillage(s, day + 1, null);
    expect(training.pens![0]!.oxen).toHaveLength(4);
    expect(training.livestock!.herds.cow).toBeGreaterThanOrEqual(LIVESTOCK.breedingMin - 1e-9);
    const after = advanceWithHay(training, day + Math.ceil(OXEN.trainingYears * YEAR) + 30, 30_000);
    const retired = after.chronicle.find((e) => e.kind === 'team-retired' && e.day > day)!;
    const ready = after.chronicle.find((e) => e.kind === 'team-ready' && e.day > day)!;
    expect(ready.day).toBe(retired.day);
    expect(ableTeams(after, after.lastDay)).toBe(1);
  });

  it('náhrada začne sama a naváže bez překryvu – starý pár doslouží 10 let, nový táhne týž den', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.livestock!.herds.cow = 6;
    s.hay = { kg: 30_000, mowing: null };
    // první dopočítaný den je první den, kdy náhrada smí – výcvik začne sám
    const readyDay = day + 1 - Math.ceil((OXEN.serviceYears - OXEN.trainingYears) * YEAR - 1e-9);
    s.pens![0]!.team = { readyDay };
    const training = advanceVillage(s, day + 1, null);
    expect(training.pens![0]!.oxen).toHaveLength(4);
    const after = advanceWithHay(training, day + Math.ceil(OXEN.trainingYears * YEAR) + 30, 30_000);
    const teamEvents = after.chronicle.filter(
      (e) => (e.kind === 'team-retired' || e.kind === 'team-ready') && e.day > day,
    );
    expect(teamEvents.map((e) => e.kind)).toEqual(['team-retired', 'team-ready']);
    const [retired, ready] = teamEvents as [ChronicleEvent, ChronicleEvent];
    expect(retired.day).toBe(ready.day);
    // starý pár sloužil celou dobu, nový je vycvičený
    expect(retired.day - readyDay).toBeGreaterThanOrEqual(OXEN.serviceYears * YEAR);
    expect(after.pens![0]!.oxen).toEqual([{ trainedDay: ready.day }, { trainedDay: ready.day }]);
    expect(after.ards).toBe(1);
  });
});

describe('orba rádlem', () => {
  it('sazba 10 → 6 čd/ha podle nástrojů, spřežení 0,3 ha za den', () => {
    expect(ploughWorkPerHa(0)).toBe(10);
    expect(ploughWorkPerHa(1)).toBe(6);
    const s = withTeam(at(600, 9, 1));
    expect(ploughCapacityPerDay(s, 0)).toBeCloseTo(PLOUGH_HA_PER_DAY * 10, 9);
    // víc ohrad se spřežením = víc kapacity
    s.pens!.push({ ...s.pens![0]!, id: 901, team: { readyDay: at(599, 1, 1) } });
    expect(ploughCapacityPerDay(s, 0)).toBeCloseTo(2 * PLOUGH_HA_PER_DAY * 10, 9);
  });

  it('ves se spřežením orá všechno (Martin 19. 10. 2026): i drn, motyka nekope; křoviny se klučí', () => {
    const day = at(600, 9, 1);
    const plain = [
      part(1),
      part(2, { state: 'ready', sownYears: 0 }),
      part(3, { state: 'fallow', fallowSinceDay: at(599, 9, 1) }),
    ];
    for (const p of plain) {
      expect(hasSod(p, day)).toBe(false);
      const work = partWork(p, day, 0, true);
      expect(work.dig).toBe(0);
      expect(work.reclaim).toBe(0);
      expect(work.plough).toBeCloseTo(10, 9);
    }
    // drn – příloh ve fázi louky i louka založená rádlem: orba křížem, víc práce, bez motyky
    const meadow = part(4, { state: 'fallow', fallowSinceDay: at(590, 9, 1) });
    const founded = part(5, { state: 'ready', sownYears: 0, sod: true });
    for (const p of [meadow, founded]) {
      expect(hasSod(p, day)).toBe(true);
      const work = partWork(p, day, 0, true);
      expect(work.dig).toBe(0);
      expect(work.reclaim).toBe(0);
      expect(work.plough).toBeCloseTo(10 * PLOUGH_SOD_FACTOR, 9);
    }
    // křoviny vyklučí lidé jako dřív, pak se orá běžně
    const shrubs = part(6, { state: 'fallow', fallowSinceDay: at(590, 9, 1), overgrowthYears: 6 });
    const cleared = partWork(shrubs, day, 0, true);
    expect(cleared.reclaim).toBeCloseTo(100, 9);
    expect(cleared.plough).toBeCloseTo(10, 9);
    // bez spřežení kope motyka – drn louky založené rádlem jako vrácení louky
    const hoe = partWork(founded, day, 0, false);
    expect(hoe.plough).toBe(0);
    expect(hoe.dig).toBeCloseTo(100, 9);
    expect(hoe.reclaim).toBeCloseTo(100, 9);
  });

  it('setí jde za zoranou částí; díl s drnem nese orba s větší vahou', () => {
    const day = at(600, 9, 1);
    const sod = part(2, { state: 'fallow', fallowSinceDay: at(590, 9, 1) });
    const work = createCropWork([part(1), sod], day, 0, true);
    expect(work.plough).toMatchObject({
      partIds: [1, 2],
      required: 10 + 10 * PLOUGH_SOD_FACTOR,
      done: 0,
      weight: 2,
      sodIds: [2],
    });
    // díly bez políčka – každý svůj pás
    expect(work.plough!.bands!.map((b) => b.partIds)).toEqual([[1], [2]]);
    expect(work.required.dig).toBe(0);
    expect(tilledShare(work)).toBe(0);
    work.plough!.done = work.plough!.required / 2;
    expect(tilledShare(work)).toBeCloseTo(0.5, 9);
    // plán vsi bez spřežení orbu nemá
    expect(createCropWork([part(1), sod], day, 0, false).plough).toBeUndefined();
  });

  it('plán osevu nevybere víc, než spřežení v oknech orby stihnou zorat', () => {
    const day = at(600, 9, 1);
    const parts = Array.from({ length: 30 }, (_, i) => part(i + 1, { distanceM: 100 + i }));
    const people = 1e9;
    const crops = chooseCrops(parts, {
      targetKg: 1e9,
      startKg: 0,
      capacity: {
        autumnWinter: people,
        autumn: people,
        spring: people,
        july: people,
        august: people,
        plough: { autumnWinter: 25, autumn: 45, spring: 30 },
      },
      load: orchardOnlyLoad(0),
      allowWinter: true,
      day,
      toolCoverage: 0,
      plough: true,
    });
    // 10 čd orby na díl: ozim do 25 (2 díly), jař na podzim zbytek do 45 a na jaře 30 (5 dílů)
    expect(crops.winter).toHaveLength(2);
    expect(crops.spring).toHaveLength(5);
  });

  it('slabí voli po zimě orají na jaře jen podílem; na podzim zase plnou silou', () => {
    const day = at(601, 2, 28);
    const s = withTeam(day);
    s.hay = { kg: 0, mowing: null, winter: { oxenNeedKg: 2000, oxenEatenKg: 1500 } };
    const spring = advanceVillage(s, at(601, 3, 1), null);
    const weak = spring.pens![0]!.oxen![0]!.weak!;
    expect(weak).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(1);
    expect(ploughCapacityPerDay(spring, 0, at(601, 4, 10))).toBeCloseTo(weak * 3, 9);
    expect(ploughCapacityPerDay(spring, 0, at(601, 10, 10))).toBeCloseTo(3, 9);
  });

  it('ves se spřežením orá: plán k 1. 9. bez kopání, spřežení na čele orby', () => {
    const day = at(600, 8, 31);
    const s = withTeam(day);
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 8 }, (_, i) =>
      part(i + 1, { areaM2: 2250, distanceM: 100 + i, cell: { x: i, y: 0 } }),
    );
    // zásoby jen na pár měsíců – s velkými by ves podle zásob nic nezasela (fields.md – Osev podle
    // zásob)
    s.storesKg = 300;
    // 1. 9. – plán osevu a první den orby (setí jde za zoranou částí od dalšího dne)
    const sept = advanceVillage(s, at(600, 9, 1), null);
    const plan = sept.plan!;
    expect(plan.ard).toBe(true);
    for (const { work } of planCrops(plan)) {
      expect(work.plough!.partIds).toEqual(work.partIds);
      expect(work.required.dig).toBe(0);
    }
    expect(planPartIds(plan).length).toBeGreaterThan(0);
    const ploughShares = sept.labor!.shares.filter((share) => share.activity === 'plough');
    expect(ploughShares.length).toBeGreaterThan(0);
    expect(sept.labor!.shares.some((share) => share.activity === 'dig')).toBe(false);
    // spřežení zorá nejvýš 0,3 ha za den
    const ploughed = ploughShares.reduce((sum, share) => sum + share.manDays, 0);
    expect(ploughed).toBeLessThanOrEqual(ploughCapacityPerDay(sept, 0) + 1e-3);
    // orané díly mají vzhled zoraného pole
    const looks = fieldPartLooks(sept, sept.lastDay);
    expect([...looks.values()].some((v) => v.look === 'plowed')).toBe(true);
  });

  it('louku zakládá ves se spřežením bez motyky – jen překážky, drn rozorá první orba', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    const input = {
      parts: Array.from({ length: 4 }, (_, i) => ({
        areaM2: 2250,
        distanceM: 100 + i,
        naturalFertility: 70,
        surface: 'meadow' as const,
        obstacleCost: i === 0 ? 3 : 0,
        cell: { x: i, y: 0 },
      })),
    };
    const founded = foundField(s, day, input);
    const parts = founded.parts.filter((p) => p.state === 'founding');
    expect(parts.map((p) => p.foundingCost)).toEqual([3, 0, 0, 0]);
    for (const p of parts) expect(p.sod).toBe(true);
    expect(partFoundingCost('meadow', 2250, 3, 0, true)).toBe(3);
    expect(partFoundingCost('meadow', 2250, 3, 0)).toBeCloseTo(100 * 0.225 + 3, 9);
    // díly bez překážek jsou založené hned, díl s překážkami po jejich vyklizení – drn zůstal
    // (pastvina) a čeká na orbu
    const first = advanceVillage(founded, day + 1, null);
    expect(first.parts.filter((p) => p.state === 'founding').length).toBeLessThanOrEqual(1);
    const next = advanceVillage(founded, day + 20, null);
    const ready = next.parts.filter((p) => parts.some((x) => x.id === p.id));
    for (const p of ready) {
      expect(p.state).toBe('ready');
      expect(fieldPartLooks(next, next.lastDay).get(p.id)!.look).toBe('pasture');
    }
    expect(next.constructions.some((c) => c.kind === 'field')).toBe(false);
    // ves bez spřežení zakládá motykou jako dřív
    const hoe = foundField(village(day), day, input);
    for (const p of hoe.parts.filter((x) => x.state === 'founding')) {
      expect(p.sod).toBeUndefined();
      expect(p.foundingCost).toBeGreaterThan(20);
    }
  });

  it('ves přijde o poslední spřežení: letošní plán dokončí motyka, zorané díly zůstanou', () => {
    const day = at(600, 9, 1);
    const parts = [
      part(1),
      part(2, { distanceM: 110, state: 'fallow', fallowSinceDay: at(590, 9, 1) }),
      part(3, { distanceM: 120 }),
    ];
    const byId = new Map(parts.map((p) => [p.id, p]));
    const work = createCropWork(parts, day, 0, true);
    work.plough!.done = work.plough!.required * 0.2; // rozpracovaný druhý díl (drn)
    const ploughSpans = taskSpans(work, byId, 'plough', day);
    const ploughAt = taskPosition(work, 'plough');
    ploughToHoe(work, byId, 0, 'spring');
    expect(work.plough).toBeUndefined();
    // motyka: kopání všech dílů a drn louky jako vrácení
    const weights = parts.map((p) => partWeight(p));
    expect(work.required.dig).toBeCloseTo(
      100 * (weights[0]! + weights[1]! + weights[2]!) + 100 * weights[1]!,
      6,
    );
    // díly, kam orba došla, jsou zoraně stejně daleko i v kopání
    const digSpans = taskSpans(work, byId, 'dig', day);
    const digAt = taskPosition(work, 'dig');
    for (const span of ploughSpans) {
      const dig = digSpans.find((x) => x.id === span.id)!;
      const share = (at: number, x: { start: number; end: number }): number =>
        Math.min(1, Math.max(0, (at - x.start) / (x.end - x.start)));
      expect(share(digAt, dig)).toBeCloseTo(share(ploughAt, span), 9);
    }
    expect(tilledShare(work)).toBeCloseTo(digAt, 9);
  });

  it('zima bez sena: voli uhynou a letošní plán dokončí motyka', () => {
    const day = at(601, 2, 28);
    const s = withTeam(day);
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 4 }, (_, i) =>
      part(i + 1, { areaM2: 2250, distanceM: 100 + i, cell: { x: i, y: 0 } }),
    );
    s.plan = createPlan(s.parts, at(600, 9, 1), 0, true);
    s.hay = { kg: 0, mowing: null, winter: { oxenNeedKg: 2400, oxenEatenKg: 0 } };
    const spring = advanceVillage(s, at(601, 3, 1), null);
    expect(spring.pens![0]!.oxen).toEqual([]);
    expect(spring.chronicle.some((e) => e.kind === 'ox-died')).toBe(true);
    // jaro kopou motyky – plán orbu nemá, ves letos ale orala (kulaté rohy zůstanou)
    expect(spring.plan!.plough).toBeUndefined();
    expect(spring.plan!.required.dig).toBeGreaterThan(0);
    expect(spring.plan!.ard).toBe(true);
    // uhynulí voli na maso nejdou (voli po kusech – oxen.md); na jaře kopou
    const later = advanceVillage(spring, at(601, 3, 6), null);
    expect(later.labor!.shares.some((share) => share.activity === 'dig')).toBe(true);
  });
});

describe('dopočet a staré vsi', () => {
  it('ves s ohradou, spřežením, loukami na seno a stády – výsledek nezávisí na kouscích', () => {
    const day = at(600, 3, 1);
    const s = withTeam(day);
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 30 }, (_, i) =>
      part(i + 1, {
        areaM2: 2250,
        distanceM: 100 + 5 * i,
        cell: { x: i, y: 0 },
        ...(i >= 20
          ? { state: 'fallow' as const, sownYears: 0, fallowSinceDay: at(594, 9, 1) }
          : {}),
      }),
    );
    s.livestock!.herds.cow = 3;
    const end = at(603, 3, 1);
    const whole = advanceVillage(s, end, null);
    let chunked = s;
    for (let d = s.lastDay + 29; d < end; d += 29) chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, end, null);
    expect(chunked).toEqual(whole);
    // seno se sklízelo a spřežení oralo
    expect(whole.chronicle.some((e) => e.kind === 'slaughter')).toBe(true);
    expect(whole.hay?.kg ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('spřežení doslouží uprostřed plánu: motyka dokončí rok, výsledek nezávisí na kouscích', () => {
    const day = at(600, 8, 1);
    const s = withTeam(day);
    // spřežení doslouží v říjnu – náhrada se cvičit nestihne (krávy nejsou)
    s.pens![0]!.team = { readyDay: at(590, 10, 15) };
    s.livestock!.herds.cow = 0;
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 24 }, (_, i) =>
      part(i + 1, {
        areaM2: 2250,
        distanceM: 100 + 5 * i,
        cell: { x: i, y: 0 },
        ...(i >= 16
          ? { state: 'fallow' as const, sownYears: 0, fallowSinceDay: at(594, 9, 1) }
          : {}),
      }),
    );
    s.storesKg = 800;
    const end = at(601, 10, 1);
    const whole = advanceVillage(s, end, null);
    let chunked = s;
    for (let d = s.lastDay + 17; d < end; d += 17) chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, end, null);
    expect(chunked).toEqual(whole);
    const retired = whole.chronicle.find((e) => e.kind === 'team-retired')!;
    expect(retired.day).toBeGreaterThan(at(600, 9, 1));
    // letošní plán po odchodu spřežení kopala motyka, další plán už orbu nemá
    const october = advanceVillage(s, retired.day, null);
    expect(october.plan!.ard).toBe(true);
    expect(planCrops(october.plan!).some(({ work }) => work.plough)).toBe(false);
    expect(whole.plan!.ard).toBeUndefined();
    expect(planCrops(whole.plan!).some(({ work }) => work.plough)).toBe(false);
  });

  it('ves s plánem z doby, kdy rádlo nebralo drn: plán doběhne, od 1. 9. orá všechno', () => {
    const day = at(600, 10, 1);
    const s = withTeam(day);
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 6 }, (_, i) =>
      part(i + 1, { areaM2: 2250, distanceM: 100 + i, cell: { x: i, y: 0 } }),
    );
    // starý plán: spřežení oralo první čtyři díly, poslední dva kopala motyka (jeden vrácený)
    const plan = createPlan(s.parts, at(600, 9, 1), 0, false);
    const ploughed = createCropWork(s.parts.slice(0, 4), at(600, 9, 1), 0, true).plough!;
    plan.plough = { ...ploughed, digWeight: 2 * partWeight(s.parts[4]!) };
    plan.required.dig = 2 * 100 * partWeight(s.parts[4]!);
    (plan.plough as { returned?: number[] }).returned = [6];
    s.plan = JSON.parse(JSON.stringify(plan)) as typeof plan;
    s.storesKg = 300;
    // seno na zimu – voli přežijí a orají dál
    s.hay = { kg: 20_000, mowing: null };
    const end = at(601, 9, 3);
    const whole = advanceVillage(s, end, null);
    let chunked = s;
    for (let d = s.lastDay + 23; d < end; d += 23) chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, end, null);
    expect(chunked).toEqual(whole);
    // jaro: kopání starého plánu doběhlo
    const spring = advanceVillage(s, at(601, 5, 1), null);
    expect(spring.plan!.done.dig).toBeCloseTo(spring.plan!.required.dig, 6);
    // nový plán orá všechno
    expect(whole.plan!.ard).toBe(true);
    for (const { work } of planCrops(whole.plan!)) {
      expect(work.plough!.partIds).toEqual(work.partIds);
      expect(work.required.dig).toBe(0);
    }
  });

  it('ves uložená před dobytkem a orbou (plán bez orby, bez stád a sena) se dopočítá', () => {
    const day = at(600, 10, 1);
    const s = village(day);
    s.fields = [{ id: 1 }];
    s.parts = [part(1, { areaM2: 2250, cell: { x: 0, y: 0 } })];
    s.plan = { plannedDay: at(600, 9, 1), ...createCropWork(s.parts, at(600, 9, 1), 0) };
    delete s.livestock;
    delete s.meatKg;
    delete s.hay;
    delete s.pens;
    delete s.diet;
    const json = JSON.parse(JSON.stringify(s)) as VillageState;
    expect(json.plan!.plough).toBeUndefined();
    const next = advanceVillage(json, at(601, 9, 2), null);
    expect(next.livestock).toBeDefined();
    expect(next.diet).toBeDefined();
    expect(next.people.length).toBeGreaterThan(0);
  });
});

describe('kopie stavu', () => {
  it('cloneState zkopíruje stáda, maso, seno, ohrady, spřežení, orbu i jídlo jako structuredClone', () => {
    const day = at(600, 8, 31);
    const s = withTeam(day);
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 12 }, (_, i) =>
      part(i + 1, {
        areaM2: 2250,
        distanceM: 100 + 5 * i,
        cell: { x: i, y: 0 },
        ...(i >= 8
          ? { state: 'fallow' as const, sownYears: 0, fallowSinceDay: at(594, 9, 1) }
          : {}),
      }),
    );
    s.pens![0]!.training = { startDay: day - 100 };
    s.hay = { kg: 2500, mowing: { partIds: [9, 10], required: 3, done: 1, yieldKg: 750 } };
    s.meatKg = 50;
    s.cheeseKg = 20;
    const state = advanceVillage(s, at(600, 11, 20), null);
    // orba s drnem, zimní seno a porážka – všechna nová pole stavu jsou vyplněná
    const work = state.plan!.winter ?? state.plan!;
    work.plough ??= { partIds: [1], required: 1, done: 0, weight: 0.1 };
    work.plough.sodIds = [2];
    expect(state.livestock?.slaughterWork).toBeDefined();
    expect(state.hay?.winter).toBeDefined();
    expect(state.diet).toBeDefined();
    expect(state.meatKg).toBeDefined();
    expect(state.cheeseKg).toBeGreaterThan(0);
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    copy.livestock!.herds.sheep = 999;
    copy.pens![0]!.oxen![0]!.trainedDay = -1;
    copy.hay!.winter!.oxenEatenKg = -1;
    work.plough.sodIds.push(3);
    expect(state.livestock!.herds.sheep).not.toBe(999);
    expect(state.pens![0]!.oxen![0]!.trainedDay).not.toBe(-1);
    expect(state.hay!.winter!.oxenEatenKg).not.toBe(-1);
    expect((copy.plan!.winter ?? copy.plan!).plough!.sodIds).toEqual([2]);
  });
});
