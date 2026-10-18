import { describe, expect, it } from 'vitest';
import {
  adultChildren,
  adultChildrenSettlers,
  adultChildrenSources,
  applyRepairs,
  availableSettlers,
  decayEmptyDwelling,
  householdHeir,
  isFull,
  isOvercrowded,
  qualifyingDwellings,
  rebuildType,
  repairNeedPerDay,
  waitingHouseholds,
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

describe('plná domácnost pro nové obydlí', () => {
  it('startovní ves nekvalifikuje', () => {
    const s = village([ofAge(1, 25), ofAge(2, 25), ofAge(3, 13), ofAge(4, 12)]);
    expect(qualifyingDwellings(s, DAY)).toEqual([]);
    expect(waitingHouseholds(s, DAY)).toBe(0);
  });

  it('plná domácnost se 4 dospělými 14–44 kvalifikuje a čeká, dokud pro ni nezačne stavba', () => {
    const s = village([
      ofAge(1, 25),
      ofAge(2, 25),
      ofAge(3, 16),
      ofAge(4, 44),
      ofAge(5, 5),
      ofAge(6, 2),
    ]);
    expect(qualifyingDwellings(s, DAY).map((d) => d.id)).toEqual([1]);
    expect(waitingHouseholds(s, DAY)).toBe(1);
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
    expect(waitingHouseholds(s, DAY)).toBe(0);
  });

  it('na plnou domácnost čeká i prázdné hotové obydlí', () => {
    const s = village(
      [ofAge(1, 25), ofAge(2, 25), ofAge(3, 16), ofAge(4, 20), ofAge(5, 5), ofAge(6, 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(waitingHouseholds(s, DAY)).toBe(0);
  });

  it('starší se do čtyř dospělých nepočítají – dva by odešli a zůstali by jen starší a děti', () => {
    const s = village([
      ofAge(1, 33),
      ofAge(2, 32),
      ofAge(3, 45),
      ofAge(4, 50),
      ofAge(5, 5),
      ofAge(6, 2),
    ]);
    expect(qualifyingDwellings(s, DAY)).toEqual([]);
    expect(waitingHouseholds(s, DAY)).toBe(0);
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

// Dospělé děti z přeplněné domácnosti osídlí úplně prázdné obydlí (population.md – Prázdné
// obydlí; Martin, detaily návrh Clauda).
describe('dospělé děti z přeplněné domácnosti', () => {
  /** Domácnost obydlí `dwellingId` s lidmi daného věku (id od `from`). */
  const household = (from: number, ages: number[], dwellingId = 1): Person[] =>
    ages.map((age, i) => ofAge(from + i, age, dwellingId));
  const ids = (people: Person[]): number[] => people.map((p) => p.id);

  it('dospělé děti = 14–44 kromě dvou nejstarších od 14 let (i starších nad 44), od nejmladšího', () => {
    expect(ids(adultChildren(household(1, [46, 40, 17, 15, 8]), DAY))).toEqual([4, 3]);
    expect(ids(adultChildren(household(1, [60, 55, 30, 5]), DAY))).toEqual([3]);
    // vdova se dvěma dospívajícími: hlavou domácnosti je i starší z dětí
    expect(ids(adultChildren(household(1, [40, 17, 15, 3]), DAY))).toEqual([3]);
    expect(adultChildren(household(1, [33, 30, 9, 4]), DAY)).toEqual([]);
  });

  it('přeplněná domácnost s dospělými dětmi je zdroj – plná ne', () => {
    // 7 lidí v zemnici (6 míst); dospělí 14–44 jen tři – staré pravidlo nesplňuje
    const crowded = village(household(1, [46, 40, 17, 15, 8, 5, 2]));
    expect(qualifyingDwellings(crowded, DAY)).toEqual([]);
    expect(adultChildrenSources(crowded, DAY).map((s) => ids(s.children))).toEqual([[4, 3]]);
    expect(ids(adultChildrenSettlers(crowded, DAY, 6))).toEqual([4, 3]);
    expect(availableSettlers(crowded, DAY)).toBe(1);
    // plná, ale ne přeplněná
    const full = village(household(1, [46, 40, 17, 15, 8, 5]));
    expect(adultChildrenSources(full, DAY)).toEqual([]);
    expect(availableSettlers(full, DAY)).toBe(0);
  });

  // Martin, 18. 10. 2026: „Pokud už jsou rodiče neplodní, tak ano, má“ – dědic zůstane doma.
  it('dědic: oba rodiče 45+ → nejstarší dospělé dítě; s plodným rodičem žádný', () => {
    expect(householdHeir(household(1, [50, 47, 22, 20, 18, 5]), DAY)?.id).toBe(3);
    expect(householdHeir(household(1, [46, 40, 17, 15, 8]), DAY)).toBeNull();
    expect(householdHeir(household(1, [60, 50]), DAY)).toBeNull(); // bez dospělých dětí
  });

  it('rodiče 50 a 47 se dvěma dospělými dětmi: dědic zůstane, mladší čeká na protějšek', () => {
    const two = village(household(1, [50, 47, 20, 18, 8, 5, 2]), [dwelling(1), dwelling(2)]);
    expect(adultChildrenSources(two, DAY).map((x) => ids(x.children))).toEqual([[4]]);
    expect(adultChildrenSettlers(two, DAY, 6)).toEqual([]);
    expect(availableSettlers(two, DAY)).toBe(-1); // prázdné obydlí 2 nikoho nečeká
    // s jednotlivcem jiné přeplněné domácnosti odejdou spolu, dědic zůstane
    const paired = village(
      [...two.people, ...household(10, [45, 42, 18, 9, 6, 3, 1], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(ids(adultChildrenSettlers(paired, DAY, 6))).toEqual([4, 12]);
    expect(availableSettlers(paired, DAY)).toBe(1);
  });

  it('rodiče 50 a 47 se třemi dospělými dětmi: dva mladší odejdou, nejstarší zůstane', () => {
    const s = village(household(1, [50, 47, 22, 20, 18, 5, 2]));
    expect(ids(adultChildrenSettlers(s, DAY, 6))).toEqual([5, 4]);
    expect(availableSettlers(s, DAY)).toBe(1);
  });

  it('jediné dospělé dítě samo nejde – se svým protějškem z jiné přeplněné domácnosti ano', () => {
    const one = household(1, [46, 40, 16, 8, 5, 2, 1], 1);
    const alone = village(one, [dwelling(1), dwelling(2)]);
    expect(adultChildrenSettlers(alone, DAY, 6)).toEqual([]);
    expect(availableSettlers(alone, DAY)).toBe(-1); // prázdné obydlí 2 nikoho nečeká
    const two = village(
      [...one, ...household(10, [45, 42, 18, 9, 6, 3, 1], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(ids(adultChildrenSettlers(two, DAY, 6))).toEqual([3, 12]);
    expect(availableSettlers(two, DAY)).toBe(1);
    // třetí jednotlivec pár nemá – možné domácnosti se zaokrouhlí dolů
    const three = village(
      [...two.people, ...household(20, [47, 41, 19, 7, 6, 4, 2], 3)],
      [dwelling(1), dwelling(2), dwelling(3)],
    );
    expect(availableSettlers(three, DAY)).toBe(1);
  });

  it('pořadí od nejvíc přeplněné, při shodě nižší id; kapacita omezí počet – zůstanou nejstarší', () => {
    const s = village(
      [
        ...household(1, [46, 40, 17, 15, 8, 5, 2], 3),
        ...household(10, [46, 40, 20, 16, 9, 7, 5, 3], 2),
      ],
      [dwelling(3), dwelling(2)],
    );
    expect(adultChildrenSources(s, DAY).map((x) => x.dwelling.id)).toEqual([2, 3]);
    expect(ids(adultChildrenSettlers(s, DAY, 6))).toEqual([13, 12]);
    expect(ids(adultChildrenSources(s, DAY, 1)[0]!.children)).toEqual([13]);
  });

  it('lidé k osídlení: staré pravidlo + rodiny dospělých dětí + jednotlivci po dvou − čekající obydlí', () => {
    const s = village(
      [
        // plná se 4 dospělými – staré pravidlo
        ...household(1, [25, 25, 16, 20, 5, 2], 1),
        // přeplněná se dvěma dospělými dětmi
        ...household(10, [46, 40, 17, 15, 8, 5, 2], 2),
        // dva jednotlivci
        ...household(20, [46, 40, 16, 8, 5, 2, 1], 3),
        ...household(30, [45, 42, 18, 9, 6, 3, 1], 4),
      ],
      [dwelling(1), dwelling(2), dwelling(3), dwelling(4), dwelling(5)],
    );
    // 1 + 1 + 1 − prázdné obydlí 5
    expect(availableSettlers(s, DAY)).toBe(2);
    expect(waitingHouseholds(s, DAY)).toBe(2);
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

  it('chce přestavbu po uplynutí životnosti (zemnice 18 let) nebo při nulovém stavu', () => {
    const d = dwelling(1);
    expect(DWELLINGS.zemnice.lifespanYears).toBe(18);
    expect(wantsRebuild(d, 18 * YEAR)).toBe(true);
    expect(wantsRebuild(d, 17 * YEAR)).toBe(false);
    d.condition = 0;
    expect(wantsRebuild(d, 1)).toBe(true);
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
