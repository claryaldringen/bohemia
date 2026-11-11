import { describe, expect, it } from 'vitest';
import {
  applyRepairs,
  decayEmptyDwelling,
  isFull,
  isOvercrowded,
  rebuildType,
  repairNeedPerDay,
  wantsRebuild,
} from '../dwellings';
import { DWELLINGS } from '../../rules';
import type { Dwelling, Person, VillageState } from '../../types';

const YEAR = 365.25;
const DAY = 100 * YEAR; // dostatečně pozdě, aby šly narodit všechny věky

const dwelling = (id: number, builtDay = 0, type: Dwelling['type'] = 'zemnice'): Dwelling => ({
  id,
  type,
  builtDay,
  condition: 1,
  position: { x: 0, z: 0, rotation: 0 },
});
const ofAge = (id: number, years: number, dwellingId = 1): Person => ({
  id,
  bornDay: DAY - years * YEAR,
  dwellingId,
});
const village = (people: Person[], dwellings: Dwelling[] = [dwelling(1)]): VillageState =>
  ({
    seed: 1,
    foundedDay: 0,
    lastDay: DAY,
    nextId: 100,
    people,
    dwellings,
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
  }) satisfies VillageState;

describe('kapacita obydlí', () => {
  it('plná při kapacitě, přeplněná nad ní', () => {
    const five = village([1, 2, 3, 4, 5].map((i) => ofAge(i, 20)));
    const six = village([1, 2, 3, 4, 5, 6].map((i) => ofAge(i, 20)));
    const seven = village([1, 2, 3, 4, 5, 6, 7].map((i) => ofAge(i, 20)));
    expect(isFull(five, 1, DAY)).toBe(false);
    expect(isFull(six, 1, DAY)).toBe(true);
    expect(isOvercrowded(six, 1, DAY)).toBe(false);
    expect(isOvercrowded(seven, 1, DAY)).toBe(true);
  });
});

describe('opravy a přestavba', () => {
  it('v den postavení nic neopravuje, na konci životnosti zemnice plnou roční potřebu oprav', () => {
    const d = dwelling(1, 0);
    const atEnd = DWELLINGS.zemnice.repairAtEndOfLifePerYear / 365;
    expect(repairNeedPerDay(d, 0)).toBe(0);
    expect(repairNeedPerDay(d, DWELLINGS.zemnice.lifespanYears * YEAR)).toBeCloseTo(atEnd, 4);
  });

  it('nedodělek ubírá stav o (potřeba − práce) / cena, nejméně na 0', () => {
    const d = dwelling(1);
    applyRepairs(d, 0.1, 0.4);
    expect(d.condition).toBeCloseTo(1 - 0.3 / DWELLINGS.zemnice.cost, 6);
    applyRepairs(d, 0, 1000);
    expect(d.condition).toBe(0);
  });

  it('splněná potřeba stav nemění', () => {
    const d = dwelling(1);
    d.condition = 0.5;
    applyRepairs(d, 0.4, 0.4);
    applyRepairs(d, 2, 0.4);
    expect(d.condition).toBe(0.5);
  });

  it('chce přestavbu po uplynutí životnosti (zemnice 18 let) – rozhoduje jen stáří, ne stav', () => {
    const d = dwelling(1);
    expect(DWELLINGS.zemnice.lifespanYears).toBe(18);
    expect(wantsRebuild(d, 18 * YEAR)).toBe(true);
    expect(wantsRebuild(d, 17 * YEAR)).toBe(false);
    // obydlený dům nechátrá (Martin) – ani zbylý nízký stav po chátrání přestavbu nespustí
    d.condition = 0;
    expect(wantsRebuild(d, 1)).toBe(false);
  });

  it('nové prázdné obydlí chátrá rychleji – zemnice zanikne za ≈ 5 let, polozemnice za ≈ 8', () => {
    const lastsYears = (
      type: Dwelling['type'],
      decay: (d: Dwelling, day: number) => void,
    ): number => {
      const d = dwelling(1, 0, type);
      let day = 0;
      while (d.condition > 0) {
        day++;
        decay(d, day);
      }
      return day / YEAR;
    };
    const empty = decayEmptyDwelling;
    expect(DWELLINGS.zemnice.emptyLifespanYears).toBe(5);
    const zemnice = lastsYears('zemnice', empty);
    expect(zemnice).toBeGreaterThan(4.5);
    expect(zemnice).toBeLessThan(5.5);
    const polozemnice = lastsYears('polozemnice', empty);
    expect(polozemnice).toBeGreaterThan(7.5);
    expect(polozemnice).toBeLessThan(8.5);
    // jen bez oprav (dřívější prázdné obydlí) by vydržela ≈ 16 a ≈ 26 let
    const unrepaired = (d: Dwelling, day: number): void =>
      applyRepairs(d, 0, repairNeedPerDay(d, day));
    expect(lastsYears('zemnice', unrepaired)).toBeGreaterThan(15);
    expect(lastsYears('polozemnice', unrepaired)).toBeGreaterThan(25.5);
  });

  it('prázdnému obydlí ubývá k chátrání podle stáří pevný denní podíl, nejméně na 0', () => {
    const old = dwelling(1, 0);
    const day = 10 * YEAR;
    const ageOnly = dwelling(1, 0);
    applyRepairs(ageOnly, 0, repairNeedPerDay(ageOnly, day));
    decayEmptyDwelling(old, day);
    expect(ageOnly.condition - old.condition).toBeCloseTo(1 / (5 * YEAR), 12);
    old.condition = 1e-6;
    decayEmptyDwelling(old, day);
    expect(old.condition).toBe(0);
  });

  it('lepší obydlí, když na něj ves za rok společné práce má', () => {
    expect(rebuildType('zemnice', 0.7, 18)).toBe('polozemnice');
    expect(rebuildType('zemnice', 0.5, 18)).toBe('zemnice');
    // dřevo na polozemnici (18 stromů) nestačí – stejný typ
    expect(rebuildType('zemnice', 0.7, 17)).toBe('zemnice');
  });
});
