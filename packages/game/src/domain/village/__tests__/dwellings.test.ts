import { describe, expect, it } from 'vitest';
import {
  applyRepairs,
  canStartNewDwelling,
  isFull,
  isOvercrowded,
  qualifyingDwellings,
  rebuildType,
  repairNeedPerDay,
  wantsRebuild,
} from '../dwellings';
import { DWELLINGS } from '../rules';
import type { Dwelling, Person, VillageState } from '../types';

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
    plan: null,
    threshingFromPlan: null,
    storesKg: 0,
    domesticBacklog: 0,
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

describe('odemčení nového obydlí', () => {
  it('startovní ves nekvalifikuje', () => {
    const s = village([ofAge(1, 25), ofAge(2, 25), ofAge(3, 13), ofAge(4, 12)]);
    expect(qualifyingDwellings(s, DAY)).toEqual([]);
    expect(canStartNewDwelling(s, DAY)).toBe(false);
  });

  it('plná domácnost se 4 lidmi 14+ kvalifikuje a stavba ji zablokuje', () => {
    const s = village([
      ofAge(1, 25),
      ofAge(2, 25),
      ofAge(3, 16),
      ofAge(4, 50),
      ofAge(5, 5),
      ofAge(6, 2),
    ]);
    expect(qualifyingDwellings(s, DAY).map((d) => d.id)).toEqual([1]);
    expect(canStartNewDwelling(s, DAY)).toBe(true);
    s.constructions.push({
      id: 50,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 60,
      done: 0,
      dwellingType: 'zemnice',
      position: null,
      dwellingId: null,
      fieldId: null,
    });
    expect(canStartNewDwelling(s, DAY)).toBe(false);
  });

  it('plná domácnost se 7 lidmi, ale jen 2 dospělými, nekvalifikuje', () => {
    const s = village([ofAge(1, 25), ofAge(2, 25), ...[3, 4, 5, 6, 7].map((i) => ofAge(i, 5))]);
    expect(qualifyingDwellings(s, DAY)).toEqual([]);
  });

  it('řadí od nejvíc přeplněné, při shodě podle id', () => {
    const adults = (from: number, n: number, d: number): Person[] =>
      Array.from({ length: n }, (_, i) => ofAge(from + i, 20, d));
    const s = village(
      [...adults(1, 6, 3), ...adults(10, 8, 2), ...adults(30, 6, 1)],
      [dwelling(3), dwelling(2), dwelling(1)],
    );
    expect(qualifyingDwellings(s, DAY).map((d) => d.id)).toEqual([2, 1, 3]);
  });
});

describe('opravy a přestavba', () => {
  it('v den postavení nic neopravuje, na konci životnosti zemnice 35 člověkodní ročně', () => {
    const d = dwelling(1, 0);
    expect(repairNeedPerDay(d, 0)).toBe(0);
    expect(repairNeedPerDay(d, 15 * YEAR)).toBeCloseTo(35 / 365, 4);
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

  it('chce přestavbu po uplynutí životnosti nebo při nulovém stavu', () => {
    const d = dwelling(1);
    expect(wantsRebuild(d, 15 * YEAR)).toBe(true);
    expect(wantsRebuild(d, 14 * YEAR)).toBe(false);
    d.condition = 0;
    expect(wantsRebuild(d, 1)).toBe(true);
  });

  it('lepší obydlí, když na něj ves za rok společné práce má', () => {
    expect(rebuildType('zemnice', 0.7)).toBe('polozemnice');
    expect(rebuildType('zemnice', 0.5)).toBe('zemnice');
  });
});
