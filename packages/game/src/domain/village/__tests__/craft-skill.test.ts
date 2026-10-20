import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, startWorkshop } from '../actions';
import {
  craftSkillSummary,
  gainPractice,
  skillShare,
  withCraftSkill,
  workshopSkill,
} from '../craft-skill';
import { newWorkshop, workCrafts, workshopLabor } from '../crafts';
import { NO_CRAFTS } from '../productivity';
import { CRAFT_BASE } from '../rules';
import { advanceVillage } from '../simulate';
import type { Craft, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Učení řemesla (crafts.md – Učení řemesla; Martin 20. 10. 2026: „Každý řemeslník vychovává svého
// nástupce - syna. Pokud je řemeslník úplně nový, trvá mu, než se řemeslo naučí“): praxe v letech
// u člověka, výkon dílny 50 % → 100 % za 5 let praxe, syn se učí od 10 let, starší vsi vyučené.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const WORKSHOP_ID = 50;
const FATHER = 60;
const MOTHER = 61;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  extra: Partial<Person> = {},
  day = DAY,
): Person => ({ id, bornDay: day - Math.ceil(years * YEAR), dwellingId, ...extra });

/** Ves s hotovou zemnicí (id 1) a plnou domácností – jeden pár k osídlení, bez polí a staveb. */
function fullVillage(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 45, 1, { sex: 'male', spouseId: 3 }, day),
    person(3, 44, 1, { sex: 'female', spouseId: 2 }, day),
    person(4, 20, 1, { sex: 'male', spouseId: 5 }, day),
    person(5, 19, 1, { sex: 'female', spouseId: 4 }, day),
    person(6, 5, 1, { sex: 'male', fatherId: 4, motherId: 5 }, day),
    person(7, 3, 1, { sex: 'female', fatherId: 4, motherId: 5 }, day),
  ];
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = day;
  s.nextId = 100;
  return s;
}

/**
 * Přidá hotovou dílnu `craft` s rodinou – otec, matka a děti (věky); `tracked` = dílna zná učení
 * řemesla (nově postavená), jinak dílna z doby před ním.
 */
function withWorkshop(
  s: VillageState,
  craft: Craft,
  children: { years: number; sex: Person['sex'] }[] = [],
  tracked = true,
): VillageState {
  s.dwellings.push({
    id: WORKSHOP_ID,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { x: 40, z: 0, rotation: 0 },
    workshop: { ...newWorkshop(craft), ...(tracked ? { skillTracked: true as const } : {}) },
  });
  s.people.push(
    person(FATHER, 30, WORKSHOP_ID, { sex: 'male', spouseId: MOTHER }, s.lastDay),
    person(MOTHER, 28, WORKSHOP_ID, { sex: 'female', spouseId: FATHER }, s.lastDay),
    ...children.map((c, i) =>
      person(70 + i, c.years, WORKSHOP_ID, {
        sex: c.sex,
        fatherId: FATHER,
        motherId: MOTHER,
      }),
    ),
  );
  return s;
}

const practice = (s: VillageState, id: number, craft: Craft): number =>
  s.people.find((p) => p.id === id)?.practice?.[craft] ?? 0;

describe('výkon dílny podle praxe (crafts.md – Učení řemesla)', () => {
  it('50 % bez praxe, lineárně do 100 % po 5 letech, dál 100 %', () => {
    expect(skillShare(0)).toBe(0.5);
    expect(skillShare(2.5)).toBeCloseTo(0.75, 12);
    expect(skillShare(5)).toBe(1);
    expect(skillShare(12)).toBe(1);
  });

  it('nový řemeslník začne na 50 % a za 5 let praxe je vyučený', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    expect(workshopSkill(s, WORKSHOP_ID, DAY)).toBe(0.5);
    const worked = new Set([WORKSHOP_ID]);
    for (let d = 1; d <= 365 * 2.5; d++) gainPractice(s, DAY + d, worked);
    expect(workshopSkill(s, WORKSHOP_ID, DAY + 913)).toBeCloseTo(0.75, 3);
    for (let d = 914; d <= 365 * 5 + 1; d++) gainPractice(s, DAY + d, worked);
    expect(practice(s, FATHER, 'potter')).toBe(5);
    expect(workshopSkill(s, WORKSHOP_ID, DAY + 365 * 5 + 1)).toBe(1);
  });

  it('nováček vyrobí za den polovinu – denní minimum domácnosti se nemění', () => {
    const run = (years: number): { kg: number; dailyMin: number } => {
      const s = withWorkshop(fullVillage(), 'potter');
      for (const p of s.people) if (p.dwellingId === WORKSHOP_ID) p.practice = { potter: years };
      s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.fuelKg = 10_000;
      const [day] = workCrafts(s, DAY + 1, null, NO_CRAFTS, 1, new Map());
      return {
        kg: day!.producedKg,
        dailyMin: workshopLabor(s, DAY + 1, WORKSHOP_ID, 0).dailyMin,
      };
    };
    const novice = run(0);
    const master = run(5);
    expect(novice.kg).toBeGreaterThan(0);
    expect(novice.kg).toBeCloseTo(master.kg / 2, 9);
    expect(novice.dailyMin).toBe(master.dailyMin);
  });

  it('dílna z doby před učením řemesla pracuje jako vyučená', () => {
    const s = withWorkshop(fullVillage(), 'smith', [], false);
    expect(workshopSkill(s, WORKSHOP_ID, DAY)).toBe(1);
    expect(craftSkillSummary(s, WORKSHOP_ID, DAY)).toEqual({
      share: 1,
      years: 5,
      apprentices: [],
    });
  });

  it('nově dostavěná dílna zná učení – mladý pár začíná od nuly', () => {
    const next = startWorkshop(fullVillage(), DAY, 'burner', { x: 40, z: 0, rotation: 0 }, 0);
    const site = next.constructions.at(-1)!;
    site.done = site.cost;
    site.wood!.felled = site.wood!.fell.length;
    const after = advanceVillage(next, DAY + 1, null);
    const workshop = after.dwellings.find((d) => d.workshop)!;
    expect(workshop.workshop!.skillTracked).toBe(true);
    expect(workshopSkill(after, workshop.id, DAY + 1)).toBe(0.5);
  });
});

describe('praxe roste jen při práci (crafts.md – Učení řemesla)', () => {
  it('dospělí v dílně, která dnes pracovala, získají den praxe – ve dny odpočinku ne', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    gainPractice(s, DAY + 1, new Set());
    expect(practice(s, FATHER, 'potter')).toBe(0);
    gainPractice(s, DAY + 1, new Set([WORKSHOP_ID]));
    expect(practice(s, FATHER, 'potter')).toBeCloseTo(1 / 365, 12);
    expect(practice(s, MOTHER, 'potter')).toBeCloseTo(1 / 365, 12);
    // ve vsi mimo dílnu praxi nikdo nezíská
    expect(s.people.filter((p) => p.dwellingId === 1).every((p) => !p.practice)).toBe(true);
  });

  it('v simulaci: hrnčíř s plnou zásobou keramiky odpočívá a praxe nepřibývá', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 10_000 };
    const after = advanceVillage(s, DAY + 30, null);
    expect(after.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.activity).toBe('resting');
    expect(practice(after, FATHER, 'potter')).toBe(0);
  });

  it('v simulaci: hrnčíř, který vypaluje, praxi získává den po dni', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.fuelKg = 10_000;
    const after = advanceVillage(s, DAY + 30, null);
    expect(practice(after, FATHER, 'potter')).toBeCloseTo(30 / 365, 9);
  });
});

describe('syn se učí od 10 let (crafts.md – Učení řemesla)', () => {
  it('syn od 10 let se učí, mladší syn a dcery ne', () => {
    const s = withWorkshop(fullVillage(), 'carpenter', [
      { years: 11, sex: 'male' },
      { years: 9, sex: 'male' },
      { years: 12, sex: 'female' },
    ]);
    gainPractice(s, DAY + 1, new Set([WORKSHOP_ID]));
    expect(practice(s, 70, 'carpenter')).toBeCloseTo(1 / 365, 12);
    expect(practice(s, 71, 'carpenter')).toBe(0);
    expect(practice(s, 72, 'carpenter')).toBe(0);
    const summary = craftSkillSummary(s, WORKSHOP_ID, DAY + 1);
    expect(summary.apprentices).toEqual([{ age: 11, years: expect.closeTo(1 / 365, 9) }]);
  });

  it('syn kováře se učí i ve dny, kdy kovář pracuje se vsí a syn nosí uhlí', () => {
    const s = withWorkshop(fullVillage(), 'smith', [{ years: 11, sex: 'male' }]);
    gainPractice(s, DAY + 1, new Set(), new Set([WORKSHOP_ID]));
    expect(practice(s, 70, 'smith')).toBeCloseTo(1 / 365, 12);
    // kovář sám ten den v dílně nepracoval
    expect(practice(s, FATHER, 'smith')).toBe(0);
  });

  it('nástupce po 5 letech učení jede naplno – po smrti otce dílna nezpomalí', () => {
    const s = withWorkshop(fullVillage(), 'smith', [{ years: 10, sex: 'male' }]);
    const worked = new Set([WORKSHOP_ID]);
    for (let d = 1; d <= 365 * 5 + 1; d++) gainPractice(s, DAY + d, worked);
    const day = DAY + 365 * 5 + 2;
    expect(practice(s, 70, 'smith')).toBe(5);
    // otec zemřel – dílnu drží syn (15 let) s matkou
    s.people = s.people.filter((p) => p.id !== FATHER);
    expect(workshopSkill(s, WORKSHOP_ID, day)).toBe(1);
    expect(craftSkillSummary(s, WORKSHOP_ID, day).apprentices).toEqual([]);
  });

  it('cizí rodina v prázdné dílně začíná od nuly', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    for (const p of s.people) if (p.dwellingId === WORKSHOP_ID) p.practice = { potter: 5 };
    // řemeslník zemřel, do dílny se nastěhoval mladý pár z vesnice
    s.people = s.people.filter((p) => p.dwellingId !== WORKSHOP_ID);
    for (const p of s.people.filter((p) => p.id === 4 || p.id === 5)) p.dwellingId = WORKSHOP_ID;
    expect(workshopSkill(s, WORKSHOP_ID, DAY)).toBe(0.5);
  });
});

describe('převod starších vsí (crafts.md – Učení řemesla, Starší vsi)', () => {
  it('dnešní řemeslníci jsou vyučení, synové podle let od 10', () => {
    const s = withWorkshop(
      fullVillage(),
      'smith',
      [
        { years: 12, sex: 'male' },
        { years: 8, sex: 'male' },
      ],
      false,
    );
    const next = withCraftSkill(s);
    expect(next.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.skillTracked).toBe(true);
    expect(practice(next, FATHER, 'smith')).toBe(5);
    expect(practice(next, MOTHER, 'smith')).toBe(5);
    expect(practice(next, 70, 'smith')).toBe(2);
    expect(practice(next, 71, 'smith')).toBe(0);
    expect(workshopSkill(next, WORKSHOP_ID, DAY)).toBe(1);
    // podruhé nic
    expect(withCraftSkill(next)).toBe(next);
    // vstup se nemění
    expect(s.people.some((p) => p.practice)).toBe(false);
  });

  it('dílna dostavěná před půl rokem (kronika) – řemeslník má jen půl roku praxe', () => {
    const s = withWorkshop(fullVillage(), 'carpenter', [], false);
    s.chronicle.push({
      day: DAY - 183,
      kind: 'construction-finished',
      constructionKind: 'dwelling',
      dwellingId: WORKSHOP_ID,
      fieldId: null,
      craft: 'carpenter',
    });
    const next = withCraftSkill(s);
    expect(practice(next, FATHER, 'carpenter')).toBeCloseTo(183 / 365, 9);
    expect(workshopSkill(next, WORKSHOP_ID, DAY)).toBeCloseTo(0.55, 2);
  });

  it('ves bez dílen se nemění (týž objekt)', () => {
    const s = fullVillage();
    expect(withCraftSkill(s)).toBe(s);
  });
});
