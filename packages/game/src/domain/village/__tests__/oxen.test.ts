import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundPen, foundVillage, trainTeam } from '../actions';
import { fieldPartLooks } from '../field-progress';
import { LIVESTOCK } from '../livestock';
import {
  ARD,
  OXEN,
  PEN,
  ableTeams,
  penBuildLabor,
  penDay,
  ploughCapacityPerDay,
  returnPloughToHoe,
  trainingBlock,
} from '../oxen';
import { PLOUGH_HA_PER_DAY, isPloughable, ploughWorkPerHa } from '../plough';
import { NO_CRAFTS } from '../productivity';
import { cloneState } from '../clone';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, FieldPart, VillageState } from '../types';
import { createCropWork, partWork, tilledShare } from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

// Ohrada, spřežení a orba rádlem (oxen.md).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const PEN_INPUT = {
  cell: { x: 3, y: 4 },
  x: 50,
  z: 60,
  obstacleCost: 0,
  obstacleIds: [],
  clearedTrees: 0,
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

/** Ves s hotovou ohradou a vycvičeným spřežením. */
function withTeam(day: number): VillageState {
  const s = village(day);
  s.pens = [
    {
      id: 900,
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: day - 800,
      team: { readyDay: day - 10 },
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

  it('výcvik: ohrada stojí, aspoň 3 krávy (dvě telata do výcviku) a dřevo na rádlo', () => {
    const day = at(600, 5, 1);
    const s = foundPen(village(day), day, PEN_INPUT, null);
    const penId = s.pens![0]!.id;
    expect(trainingBlock(s, penId, day, null)).toMatch(/staví/);
    const built = advanceVillage(s, day + 60, null);
    built.livestock!.herds.cow = 2;
    expect(trainingBlock(built, penId, built.lastDay, null)).toMatch(/telata/);
    built.livestock!.herds.cow = 4;
    expect(trainingBlock(built, penId, built.lastDay, null)).toBeNull();
    const training = trainTeam(built, built.lastDay, penId, null);
    expect(training.livestock!.herds.cow).toBe(2);
    expect(training.pens![0]!.training).toEqual({ startDay: built.lastDay });
    const ard = training.constructions.find((c) => c.kind === 'ard')!;
    expect(ard.cost).toBe(ARD.laborManDays); // kláda z hromady
    expect(trainingBlock(training, penId, built.lastDay, null)).toMatch(/cvičí/);
  });

  it('za 2 roky je spřežení vycvičené, po 10 letech dosloužilo a šlo na maso', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.pens![0]!.team = null;
    s.pens![0]!.training = { startDay: day };
    s.hay = { kg: 20_000, mowing: null }; // telata přes zimu potřebují seno
    const before = advanceVillage(s, day + 700, null);
    expect(before.pens![0]!.team).toBeNull();
    const ready = advanceVillage(before, day + 732, null);
    expect(ready.pens![0]!.team).not.toBeNull();
    expect(ready.chronicle.some((e) => e.kind === 'team-ready')).toBe(true);
    const old = structuredClone(ready);
    old.pens![0]!.team = { readyDay: ready.lastDay - Math.ceil(OXEN.serviceYears * 365.25) + 1 };
    const meat = old.meatKg ?? 0;
    const events = penDay(old, old.lastDay + 1, false, NO_CRAFTS.tools);
    expect(events).toEqual([{ day: old.lastDay + 1, kind: 'team-retired', penId: 900 }]);
    expect(old.meatKg).toBeCloseTo(meat + 2 * LIVESTOCK.oxMeatKg, 9);
    expect(ableTeams(old)).toBe(0);
  });
});

describe('náhrada spřežení (Martin 18. 10. 2026)', () => {
  const YEAR = 365.25;

  it('výcvik nového páru jde jen v posledních 2 letech služby – jinak důvod se zbývajícími roky', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.livestock!.herds.cow = 4;
    const pen = s.pens![0]!;
    pen.team = { readyDay: day - Math.ceil(YEAR) };
    expect(trainingBlock(s, 900, day, null)).toBe('Spřežení slouží ještě 9 let.');
    pen.team = { readyDay: day - Math.floor(6.5 * YEAR) };
    expect(trainingBlock(s, 900, day, null)).toBe('Spřežení slouží ještě 4 roky.');
    pen.team = { readyDay: day - Math.ceil(7.9 * YEAR) };
    expect(trainingBlock(s, 900, day, null)).toBe('Spřežení slouží ještě 3 roky.');
    pen.team = { readyDay: day - Math.ceil((OXEN.serviceYears - OXEN.trainingYears) * YEAR) };
    expect(trainingBlock(s, 900, day, null)).toBeNull();
    // ohrada bez spřežení cvičí kdykoli
    pen.team = null;
    expect(trainingBlock(s, 900, day, null)).toBeNull();
  });

  it('náhrada naváže bez překryvu – starý pár doslouží celých 10 let a nový orá týž den', () => {
    const day = at(600, 5, 1);
    const s = withTeam(day);
    s.livestock!.herds.cow = 4;
    s.hay = { kg: 30_000, mowing: null };
    const readyDay = day - Math.ceil((OXEN.serviceYears - OXEN.trainingYears) * YEAR);
    s.pens![0]!.team = { readyDay };
    const training = trainTeam(s, day, 900, null);
    const after = advanceVillage(training, day + Math.ceil(OXEN.trainingYears * YEAR) + 30, null);
    const teamEvents = after.chronicle.filter(
      (e) => (e.kind === 'team-retired' || e.kind === 'team-ready') && e.day > day,
    );
    expect(teamEvents.map((e) => e.kind)).toEqual(['team-retired', 'team-ready']);
    const [retired, ready] = teamEvents as [ChronicleEvent, ChronicleEvent];
    expect(retired.day).toBe(ready.day);
    // starý pár sloužil celou dobu, nový je vycvičený
    expect(retired.day - readyDay).toBeGreaterThanOrEqual(OXEN.serviceYears * YEAR);
    expect(after.pens![0]!.team).toEqual({ readyDay: ready.day });
    expect(after.pens![0]!.training).toBeNull();
  });
});

describe('orba rádlem', () => {
  it('sazba 10 → 6 čd/ha podle nástrojů, spřežení 0,3 ha za den', () => {
    expect(ploughWorkPerHa(0)).toBe(10);
    expect(ploughWorkPerHa(1)).toBe(6);
    const s = withTeam(at(600, 9, 1));
    expect(ploughCapacityPerDay(s, 0)).toBeCloseTo(PLOUGH_HA_PER_DAY * 10, 9);
  });

  it('rádlo zorá díl po sklizni, mladý příloh i založený díl; drn pastviny kope motyka', () => {
    const day = at(600, 9, 1);
    expect(isPloughable(part(1), day)).toBe(true);
    expect(isPloughable(part(2, { state: 'ready', sownYears: 0 }), day)).toBe(true);
    expect(isPloughable(part(3, { state: 'fallow', fallowSinceDay: at(599, 9, 1) }), day)).toBe(
      true,
    );
    const sod = part(4, { state: 'fallow', fallowSinceDay: at(590, 9, 1) });
    expect(isPloughable(sod, day)).toBe(false);
    const work = partWork(part(1), day, 0, true);
    expect(work.dig).toBe(0);
    expect(work.plough).toBeCloseTo(10, 9);
    const hoe = partWork(sod, day, 0, true);
    expect(hoe.plough).toBe(0);
    expect(hoe.dig).toBeCloseTo(100, 9);
    expect(hoe.reclaim).toBeCloseTo(100, 9);
  });

  it('setí jde za zkopanou i zoranou částí podle vah dílů', () => {
    const day = at(600, 9, 1);
    const sod = part(2, { state: 'fallow', fallowSinceDay: at(590, 9, 1) });
    const work = createCropWork([part(1), sod], day, 0, true);
    expect(work.plough).toMatchObject({ partIds: [1], required: 10, weight: 1, digWeight: 1 });
    expect(work.required.dig).toBeCloseTo(100, 9);
    expect(tilledShare(work)).toBe(0);
    work.plough!.done = 10;
    expect(tilledShare(work)).toBeCloseTo(0.5, 9);
    work.done.dig = 50;
    expect(tilledShare(work)).toBeCloseTo(0.75, 9);
  });

  it('vrácení motyce: nezačaté díly z konce orby se kopou na konci řady kopání', () => {
    const day = at(600, 9, 1);
    const parts = [part(1), part(2, { distanceM: 110 }), part(3, { distanceM: 120 })];
    const work = createCropWork(parts, day, 0, true);
    const byId = new Map(parts.map((p) => [p.id, p]));
    work.plough!.done = work.plough!.required * 0.2; // rozpracovaný první díl
    returnPloughToHoe(work, byId, 0, 0.5, false);
    // polovina zbývající orby = díl 3 (poslední)
    expect(work.plough!.partIds).toEqual([1, 2]);
    expect(work.plough!.returned).toEqual([3]);
    expect(work.required.dig).toBeCloseTo(100 * 1.02, 9);
    // spřežení už není – vrátí se i rozpracovaný díl
    returnPloughToHoe(work, byId, 0, 1, true);
    expect(work.plough!.partIds).toEqual([]);
    expect(work.plough!.returned).toEqual([3, 1, 2]);
    expect(work.plough!.required).toBe(0);
  });

  it('ves se spřežením orá: plán k 1. 9. bez kopání oraných dílů, spřežení na čele orby', () => {
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
    const crops = [plan, ...(plan.winter ? [plan.winter] : [])];
    expect(crops.some((w) => (w.plough?.partIds.length ?? 0) > 0)).toBe(true);
    const ploughShares = sept.labor!.shares.filter((share) => share.activity === 'plough');
    expect(ploughShares.length).toBeGreaterThan(0);
    // spřežení zorá nejvýš 0,3 ha za den
    const ploughed = ploughShares.reduce((sum, share) => sum + share.manDays, 0);
    expect(ploughed).toBeLessThanOrEqual(ploughCapacityPerDay(sept, 0) + 1e-3);
    // orané díly mají vzhled zoraného pole
    const looks = fieldPartLooks(sept, sept.lastDay);
    expect([...looks.values()].some((v) => v.look === 'plowed')).toBe(true);
  });

  it('zima bez sena: vůl uhyne, spřežení se rozpadne a orbu dokopou motyky', () => {
    const day = at(601, 2, 28);
    const s = withTeam(day);
    s.hay = { kg: 0, mowing: null, winter: { oxenNeedKg: 2400, oxenEatenKg: 0 } };
    const spring = advanceVillage(s, at(601, 3, 1), null);
    expect(spring.pens![0]!.team).toBeNull();
    expect(spring.chronicle.some((e) => e.kind === 'ox-died')).toBe(true);
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
    // orba s vrácenými díly, zimní seno a porážka – všechna nová pole stavu jsou vyplněná
    const work = state.plan!.winter ?? state.plan!;
    work.plough ??= { partIds: [1], required: 1, done: 0, weight: 0.1, digWeight: 0 };
    work.plough.returned = [2];
    expect(state.livestock?.slaughterWork).toBeDefined();
    expect(state.hay?.winter).toBeDefined();
    expect(state.diet).toBeDefined();
    expect(state.meatKg).toBeDefined();
    expect(state.cheeseKg).toBeGreaterThan(0);
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    copy.livestock!.herds.sheep = 999;
    copy.pens![0]!.team!.readyDay = -1;
    copy.hay!.winter!.oxenEatenKg = -1;
    work.plough.returned.push(3);
    expect(state.livestock!.herds.sheep).not.toBe(999);
    expect(state.pens![0]!.team!.readyDay).not.toBe(-1);
    expect(state.hay!.winter!.oxenEatenKg).not.toBe(-1);
    expect((copy.plan!.winter ?? copy.plan!).plough!.returned).toEqual([2]);
  });
});
