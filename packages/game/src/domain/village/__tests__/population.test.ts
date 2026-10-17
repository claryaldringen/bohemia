import { describe, expect, it } from 'vitest';
import { birthChancePerDay, deathChancePerDay, populationDay } from '../population';
import { ageYears } from '../people';
import { START_AGES } from '../rules';
import type { ChronicleEvent, Dwelling, Person, VillageState } from '../types';

const YEAR = 365.25;
const FOUNDED = 1000;

const dwelling = (id: number, type: Dwelling['type'] = 'zemnice'): Dwelling => ({
  id,
  type,
  builtDay: FOUNDED,
  condition: 1,
  position: { x: 0, z: 0, rotation: 0 },
});
const ofAge = (id: number, years: number, dwellingId: number, day: number): Person => ({
  id,
  bornDay: day - years * YEAR,
  dwellingId,
});
const village = (
  seed: number,
  people: Person[],
  dwellings: Dwelling[],
  foundedDay = FOUNDED,
): VillageState => ({
  seed,
  foundedDay,
  lastDay: foundedDay,
  nextId: 1000,
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
});
const startVillage = (seed: number): VillageState =>
  village(
    seed,
    START_AGES.map((age, i) => ofAge(i + 1, age, 1, FOUNDED)),
    [dwelling(1)],
  );
const copy = (state: VillageState): VillageState => structuredClone(state);
const adultDeaths = (events: ChronicleEvent[]): number =>
  events.filter((e) => e.kind === 'death' && e.group === 'adult').length;

const AFTER_LUCK = FOUNDED + 31 * YEAR;
const person = (years: number, day: number): Person => ofAge(1, years, 1, day);
const ctx = {
  foundedDay: FOUNDED,
  satiation: 1,
  overcrowded: false,
  dwellingType: 'zemnice' as const,
  protectFromHunger: false,
};

describe('birthChancePerDay', () => {
  it('při plném nasycení je třetina porodu ročně', () => {
    expect(birthChancePerDay({ satiation: 1, overcrowded: false })).toBeCloseTo(1 / 3 / 365, 8);
  });
  it('při nasycení 0,5 se nerodí', () => {
    expect(birthChancePerDay({ satiation: 0.5, overcrowded: false })).toBe(0);
  });
  it('mezi 0,5 a 0,95 roste lineárně', () => {
    expect(birthChancePerDay({ satiation: 0.725, overcrowded: false })).toBeCloseTo(
      1 / 3 / 365 / 2,
      8,
    );
  });
  it('přeplněnost násobí 0,3', () => {
    expect(birthChancePerDay({ satiation: 1, overcrowded: true })).toBeCloseTo(
      (1 / 3 / 365) * 0.3,
      8,
    );
  });
});

describe('deathChancePerDay', () => {
  it('dospělý mimo hájení ≈ 0,015 ročně', () => {
    const p = deathChancePerDay(person(30, AFTER_LUCK), { ...ctx, day: AFTER_LUCK });
    expect(p).toBeCloseTo(1 - 0.985 ** (1 / 365), 10);
  });
  it('v hájení dospělý ani starší neumírají, dítě má poloviční riziko', () => {
    const day = FOUNDED + 5 * YEAR;
    expect(deathChancePerDay(person(30, day), { ...ctx, day })).toBe(0);
    expect(deathChancePerDay(person(60, day), { ...ctx, day, satiation: 0 })).toBe(0);
    const childInLuck = deathChancePerDay(person(5, day), { ...ctx, day });
    const childLater = deathChancePerDay(person(5, AFTER_LUCK), { ...ctx, day: AFTER_LUCK });
    expect(childInLuck).toBeGreaterThan(0);
    expect(childInLuck).toBeLessThan(childLater);
  });
  it('přeplněnost a hlad riziko zvyšují', () => {
    const day = AFTER_LUCK;
    const base = deathChancePerDay(person(30, day), { ...ctx, day });
    expect(deathChancePerDay(person(30, day), { ...ctx, day, overcrowded: true })).toBeGreaterThan(
      base,
    );
    expect(deathChancePerDay(person(30, day), { ...ctx, day, satiation: 0 })).toBeGreaterThan(base);
  });
  it('(A) s ochranou před hladem je dospělý při nasycení 0 stejně ohrožen jako při 1', () => {
    const day = AFTER_LUCK;
    const starving = deathChancePerDay(person(30, day), {
      ...ctx,
      day,
      satiation: 0,
      protectFromHunger: true,
    });
    expect(starving).toBe(deathChancePerDay(person(30, day), { ...ctx, day, satiation: 1 }));
  });
  it('dítě v polozemnici umírá méně než v zemnici', () => {
    const day = AFTER_LUCK;
    expect(
      deathChancePerDay(person(5, day), { ...ctx, day, dwellingType: 'polozemnice' }),
    ).toBeLessThan(deathChancePerDay(person(5, day), { ...ctx, day }));
  });
});

describe('populationDay', () => {
  // Smyčky přes stovky seedů × roky trvají pod paralelní zátěží déle než výchozích 5 s – limit 30 s.
  it('v hájení při nasycení 1 nezemře žádný dospělý (200 seedů × 30 let)', () => {
    let deaths = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const state = startVillage(seed);
      for (let day = FOUNDED; day < FOUNDED + 30 * 365; day++) {
        deaths += adultDeaths(populationDay(state, day, 1));
      }
    }
    expect(deaths).toBe(0);
  }, 30_000);

  it('(B) mrtví se losují před porody, takže hlad na ně u dvou dospělých nemá vliv (500 seedů)', () => {
    let compared = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const hungry = village(
        seed,
        [ofAge(1, 30, 1, AFTER_LUCK), ofAge(2, 30, 1, AFTER_LUCK)],
        [dwelling(1)],
      );
      const fed = copy(hungry);
      // srovnáváme do dne, kdy se v sytém běhu poprvé někdo narodí (pak se lidé liší)
      for (let day = AFTER_LUCK; day < AFTER_LUCK + 3 * 365; day++) {
        const a = populationDay(hungry, day, 0);
        const b = populationDay(fed, day, 1);
        expect(a.filter((e) => e.kind === 'death')).toEqual(b.filter((e) => e.kind === 'death'));
        compared++;
        if (b.some((e) => e.kind === 'birth')) break;
      }
    }
    expect(compared).toBeGreaterThan(500);
  }, 30_000);

  it('(C) (200 seedů × 10 let) šestičlenná ves po hájení má při hladu víc úmrtí dospělých než při sytosti', () => {
    let hungryDeaths = 0;
    let fedDeaths = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const people = [1, 2, 3, 4, 5, 6].map((id) => ofAge(id, 20 + id, 1, AFTER_LUCK));
      const hungry = village(seed, people, [dwelling(1)]);
      const fed = copy(hungry);
      for (let day = AFTER_LUCK; day < AFTER_LUCK + 10 * 365; day++) {
        hungryDeaths += adultDeaths(populationDay(hungry, day, 0));
        fedDeaths += adultDeaths(populationDay(fed, day, 1));
      }
    }
    expect(hungryDeaths).toBeGreaterThan(fedDeaths);
  }, 30_000);

  it('stejný stav a den dají stejné události', () => {
    const a = startVillage(7);
    const b = copy(a);
    for (let day = FOUNDED; day < FOUNDED + 2000; day++) {
      expect(populationDay(a, day, 0.8)).toEqual(populationDay(b, day, 0.8));
    }
    expect(a).toEqual(b);
  });

  it('narozené dítě dostane nové id, den narození a obydlí rodičů', () => {
    // dvojice plodných dospělých, nasycení 1 – někdy za pár let se musí narodit dítě
    const state = village(3, [ofAge(1, 20, 1, FOUNDED), ofAge(2, 20, 1, FOUNDED)], [dwelling(1)]);
    let born: Person | undefined;
    for (let day = FOUNDED; day < FOUNDED + 5 * 365 && !born; day++) {
      const before = state.nextId;
      const events = populationDay(state, day, 1);
      if (events.some((e) => e.kind === 'birth')) {
        born = state.people.find((p) => p.id === before);
        expect(born).toEqual({ id: before, bornDay: day, dwellingId: 1 });
        expect(state.nextId).toBe(before + 1);
      }
    }
    expect(born).toBeDefined();
  });

  it('obydlí jen s dětmi se přestěhuje do obydlí s nejvíc volnými místy', () => {
    const day = FOUNDED + 5 * YEAR; // hájení: nikdo dospělý neumře
    const state = village(
      1,
      [
        ofAge(1, 30, 1, day),
        ofAge(2, 30, 1, day),
        ofAge(3, 30, 1, day),
        ofAge(4, 30, 1, day),
        ofAge(5, 30, 1, day),
        ofAge(6, 30, 2, day),
        ofAge(7, 30, 2, day),
        ofAge(8, 3, 3, day),
        ofAge(9, 1, 3, day),
      ],
      [dwelling(1), dwelling(2), dwelling(3)],
    );
    // 1 má 1 volné místo, 2 má 4 volná místa → děti jdou do 2
    // (narozené dítě v 1 či 2 na věci nic nemění, dospělí v hájení nezemřou)
    const events = populationDay(state, day, 0);
    expect(events).toContainEqual({
      day,
      kind: 'household-merged',
      fromDwellingId: 3,
      toDwellingId: 2,
    });
    expect(state.people.filter((p) => p.dwellingId === 3)).toHaveLength(0);
  });

  it('jediný dospělý bez dětí se přestěhuje jinam; prázdné obydlí zůstává', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [ofAge(1, 30, 1, day), ofAge(2, 30, 1, day), ofAge(3, 30, 2, day)],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 0);
    expect(events).toContainEqual({
      day,
      kind: 'household-merged',
      fromDwellingId: 2,
      toDwellingId: 1,
    });
    expect(state.dwellings).toHaveLength(2);
  });

  it('bez jiného obydlí s lidmi se nic nestěhuje', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(1, [ofAge(1, 30, 1, day)], [dwelling(1), dwelling(2)]);
    const events = populationDay(state, day, 0);
    expect(events.filter((e) => e.kind === 'household-merged')).toHaveLength(0);
    expect(state.people[0]?.dwellingId).toBe(1);
  });

  it('věk lidí po simulaci zůstává konzistentní', () => {
    const state = startVillage(2);
    populationDay(state, FOUNDED, 1);
    expect(ageYears(state.people[0]?.bornDay ?? 0, FOUNDED)).toBe(25);
  });
});
