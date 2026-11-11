import { describe, expect, it } from 'vitest';
import {
  LUCKY_STARVATION_CAP,
  birthChancePerDay,
  birthRatePerYear,
  deathChancePerDay,
  deathChances,
  luckyStarvationCap,
  nextStarvationDays,
  populationDay,
  starvationDeathChance,
} from '../population';
import { ageYears } from '../people';
import { BIRTH_SPACING, START_AGES, STARVATION, maritalFertility } from '../../rules';
import type { ChronicleEvent, Dwelling, Person, VillageState } from '../../types';

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
  season: null,
  threshingSeason: null,
  storesKg: 0,
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
};

describe('birthChancePerDay', () => {
  // population.md – Růst populace: plodnost podle věku ženy, po porodu pauza 21 měsíců – průměrný
  // odstup porodů = 1 / plodnost věku (rešerše 2026-10-19-population-growth.md)
  const at25 = { energy: 1, overcrowded: false, motherAge: 25 };
  const rate25 = birthRatePerYear(25);
  it('průměrný odstup porodů = pauza + čekání = 1 / plodnost věku', () => {
    for (const age of [16, 22, 27, 33, 38, 42]) {
      const interval = BIRTH_SPACING.afterBirthDays / YEAR + 1 / birthRatePerYear(age);
      expect(interval).toBeCloseTo(1 / maritalFertility(age), 8);
    }
    // 20–24 let ≈ 31 měsíců (Macfarlane 2002: 24–39 měsíců)
    expect(12 / maritalFertility(22)).toBeCloseTo(30.7, 1);
  });
  it('plodnost podle věku: nejvyšší 20–24, po čtyřicítce nízká, mimo 16–44 nula', () => {
    expect(maritalFertility(22)).toBeCloseTo(0.46 * 0.85, 8);
    expect(maritalFertility(42)).toBeCloseTo(0.167 * 0.85, 8);
    expect(maritalFertility(15)).toBe(0);
    expect(maritalFertility(45)).toBe(0);
    expect(birthRatePerYear(45)).toBe(0);
    // manželská plodnost 20–44 let ≈ 7,5 dítěte
    const total = [20, 25, 30, 35, 40].reduce((sum, age) => sum + 5 * maritalFertility(age), 0);
    expect(total).toBeGreaterThan(7.4);
    expect(total).toBeLessThan(7.7);
  });
  it('při plném nasycení denní šance podle věku ženy', () => {
    expect(birthChancePerDay(at25)).toBeCloseTo(rate25 / 365, 10);
  });
  it('při energii 0,5 se nerodí', () => {
    expect(birthChancePerDay({ ...at25, energy: 0.5 })).toBe(0);
  });
  it('mezi 0,5 a 0,95 roste lineárně', () => {
    expect(birthChancePerDay({ ...at25, energy: 0.725 })).toBeCloseTo(rate25 / 365 / 2, 10);
  });
  it('energie 0,7 dává (0,7 − 0,5) / 0,45 plné šance', () => {
    expect(birthChancePerDay({ ...at25, energy: 0.7 })).toBeCloseTo(
      (rate25 / 365) * (0.2 / 0.45),
      10,
    );
  });
  it('pestrost porody nebrzdí – plný příděl a pestrost 0,8 rodí naplno', () => {
    // populationDay dostává nasycení = energie × pestrost, porody ale řídí energie
    const count = (satiation: number, energy: number): number => {
      let births = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const day0 = FOUNDED + 5 * YEAR;
        const state = village(
          seed,
          [
            { ...ofAge(1, 25, 1, day0), sex: 'male', spouseId: 2 },
            { ...ofAge(2, 25, 1, day0), sex: 'female', spouseId: 1 },
          ],
          [dwelling(1)],
        );
        for (let day = day0; day < day0 + 365; day++) {
          births += populationDay(state, day, satiation, energy).filter(
            (e) => e.kind === 'birth',
          ).length;
        }
      }
      return births;
    };
    const full = count(1, 1);
    const mono = count(0.8, 1);
    expect(full).toBeGreaterThan(0);
    expect(mono).toBe(full);
  });
  it('přeplněnost násobí 0,3', () => {
    expect(birthChancePerDay({ ...at25, overcrowded: true })).toBeCloseTo((rate25 / 365) * 0.3, 10);
  });
});

describe('deathChancePerDay', () => {
  it('dospělý mimo hájení ≈ 0,02 ročně', () => {
    const p = deathChancePerDay(person(30, AFTER_LUCK), { ...ctx, day: AFTER_LUCK });
    expect(p).toBeCloseTo(1 - 0.98 ** (1 / 365), 10);
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
  it('nahromaděný hlad přidá riziko úmrtí hladem k běžnému riziku', () => {
    const day = AFTER_LUCK;
    const base = deathChancePerDay(person(30, day), { ...ctx, day });
    const parts = deathChances(person(30, day), { ...ctx, day, starvationDays: 40 });
    expect(parts.base).toBe(base);
    expect(parts.starvation).toBe(starvationDeathChance('adult', 40));
    expect(deathChancePerDay(person(30, day), { ...ctx, day, starvationDays: 40 })).toBeCloseTo(
      base + parts.starvation,
      12,
    );
    expect(deathChancePerDay(person(30, day), { ...ctx, day, starvationDays: 60 })).toBe(1);
  });
  it('hájení chrání dospělé a starší i před smrtí hladem, dětem drží hlad pod prahem', () => {
    const day = FOUNDED + 5 * YEAR;
    const starving = { ...ctx, day, satiation: 0, starvationDays: 60 };
    expect(deathChancePerDay(person(30, day), starving)).toBe(0);
    expect(deathChancePerDay(person(60, day), starving)).toBe(0);
    const child = deathChances(person(5, day), starving);
    expect(child.starvation).toBe(0);
    expect(child.base).toBeGreaterThan(0);
    // po hájení stejný hlad zabíjí
    const later = deathChances(person(5, AFTER_LUCK), { ...starving, day: AFTER_LUCK });
    expect(later.starvation).toBe(1);
  });
  it('dítě v polozemnici umírá méně než v zemnici', () => {
    const day = AFTER_LUCK;
    expect(
      deathChancePerDay(person(5, day), { ...ctx, day, dwellingType: 'polozemnice' }),
    ).toBeLessThan(deathChancePerDay(person(5, day), { ...ctx, day }));
  });
});

describe('nextStarvationDays', () => {
  it('pod 90 % přibude (0,9 − nasycení) / 0,9 – bez jídla den', () => {
    expect(nextStarvationDays(0, 0)).toBe(1);
    expect(nextStarvationDays(10, 0.5)).toBeCloseTo(10 + 0.4 / 0.9, 12);
    expect(nextStarvationDays(3, 0.8)).toBeCloseTo(3 + 0.1 / 0.9, 12);
    expect(nextStarvationDays(3, 0.89)).toBeGreaterThan(3);
  });
  it('od 90 % ubude den až k nule – žádné pásmo, kde by hlad stál', () => {
    expect(nextStarvationDays(3, 0.9)).toBe(2);
    expect(nextStarvationDays(3, 0.93)).toBe(2);
    expect(nextStarvationDays(10, 0.95)).toBe(9);
    expect(nextStarvationDays(10, 1)).toBe(9);
    expect(nextStarvationDays(0.4, 1)).toBe(0);
    expect(nextStarvationDays(0, 1)).toBe(0);
  });
  it('víc než maxDays se nehromadí', () => {
    expect(nextStarvationDays(STARVATION.maxDays, 0)).toBe(STARVATION.maxDays);
    expect(nextStarvationDays(STARVATION.maxDays - 0.5, 0)).toBe(STARVATION.maxDays);
  });
  it('v hájení hlad zůstane den pod prahem dospělých (19)', () => {
    expect(luckyStarvationCap('adult')).toBe(19);
    expect(luckyStarvationCap('child')).toBe(11);
    expect(luckyStarvationCap('elder')).toBe(11);
    expect(LUCKY_STARVATION_CAP).toBe(19);
    expect(nextStarvationDays(18.5, 0, true)).toBe(19);
    expect(nextStarvationDays(19, 0, true)).toBe(19);
    // uložený hlad nad stropem (starší stav) se v hájení srovná
    expect(nextStarvationDays(40, 0, true)).toBe(19);
    expect(nextStarvationDays(40, 1, true)).toBe(19);
    expect(nextStarvationDays(19, 1, true)).toBe(18);
  });
});

describe('starvationDeathChance', () => {
  it('do prahu nula – dospělí 20 dní, děti a starší 12', () => {
    expect(starvationDeathChance('adult', 20)).toBe(0);
    expect(starvationDeathChance('child', 12)).toBe(0);
    expect(starvationDeathChance('elder', 12)).toBe(0);
    expect(starvationDeathChance('adult', 12.5)).toBe(0);
    expect(starvationDeathChance('child', 12.5)).toBeGreaterThan(0);
  });
  it('strmě roste až k jisté smrti – dospělí v 60 dnech, děti a starší ve 45', () => {
    const adult = [25, 30, 40, 50, 59].map((d) => starvationDeathChance('adult', d));
    expect(adult).toEqual([...adult].sort((a, b) => a - b));
    expect(adult[0]).toBeLessThan(0.01);
    expect(starvationDeathChance('adult', 60)).toBe(1);
    expect(starvationDeathChance('child', 45)).toBe(1);
    expect(starvationDeathChance('elder', 45)).toBe(1);
    expect(starvationDeathChance('child', 30)).toBeGreaterThan(starvationDeathChance('adult', 30));
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
  }, 120_000);

  it('poslední dva dospělí po hájení už nemají ochranu před hladem (200 seedů × 10 let)', () => {
    let deaths = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const hungry = village(
        seed,
        [ofAge(1, 30, 1, AFTER_LUCK), ofAge(2, 30, 1, AFTER_LUCK)],
        [dwelling(1)],
      );
      const fed = copy(hungry);
      for (let day = AFTER_LUCK; day < AFTER_LUCK + 10 * 365; day++) {
        deaths += adultDeaths(populationDay(hungry, day, 0));
        deaths -= adultDeaths(populationDay(fed, day, 1));
      }
    }
    expect(deaths).toBeGreaterThan(0);
  }, 30_000);

  it('úmrtí z nahromaděného hladu kronika zapíše s příčinou hlad', () => {
    const people = [1, 2, 3, 4, 5, 6].map((id) => ofAge(id, 20 + id, 1, AFTER_LUCK));
    const state = { ...village(5, people, [dwelling(1)]), starvationDays: STARVATION.maxDays };
    const events = populationDay(state, AFTER_LUCK, 0);
    const deaths = events.filter((e) => e.kind === 'death');
    expect(deaths).toHaveLength(6);
    expect(deaths.every((e) => e.kind === 'death' && e.cause === 'hunger')).toBe(true);
    expect(state.people).toEqual([]);
  });

  it('bez nahromaděného hladu žádné úmrtí nemá příčinu hlad (200 seedů × 10 let)', () => {
    let deaths = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const people = [1, 2, 3, 4, 5, 6].map((id) => ofAge(id, 20 + id * 4, 1, AFTER_LUCK));
      const state = village(seed, people, [dwelling(1)]);
      for (let day = AFTER_LUCK; day < AFTER_LUCK + 10 * 365; day++) {
        for (const e of populationDay(state, day, 0.3)) {
          if (e.kind !== 'death') continue;
          deaths++;
          expect(e.cause).toBeUndefined();
        }
      }
    }
    expect(deaths).toBeGreaterThan(0);
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

  /** Manželé daného věku (muž 1, žena 2) v obydlí 1. */
  const spouses = (husbandAge: number, wifeAge: number, day: number): Person[] => [
    { ...ofAge(1, husbandAge, 1, day), sex: 'male', spouseId: 2 },
    { ...ofAge(2, wifeAge, 1, day), sex: 'female', spouseId: 1 },
  ];
  /** Porody za dva roky ve 50 vsích s lidmi `people(den)`. */
  const birthsIn2Years = (people: (day: number) => Person[]): number => {
    let count = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const day0 = FOUNDED + 5 * YEAR; // hájení – nikdo dospělý neumře
      const state = village(seed, people(day0), [dwelling(1)]);
      for (let day = day0; day < day0 + 2 * 365 - 1; day++) {
        count += populationDay(state, day, 1).filter((e) => e.kind === 'birth').length;
      }
    }
    return count;
  };

  it('porody až od 16 let: manželé 14letí (dospělí pro práci) za 2 roky dítě nemají, 16letí ano (50 seedů)', () => {
    expect(birthsIn2Years((day) => spouses(14, 14, day))).toBe(0);
    expect(birthsIn2Years((day) => spouses(16, 16, day))).toBeGreaterThan(0);
  }, 30_000);

  it('děti jen manželským párům: svobodný muž a žena v domě ani žena 45+ dítě nemají (kinship.md)', () => {
    const unmarried = (day: number): Person[] => [
      { ...ofAge(1, 25, 1, day), sex: 'male' },
      { ...ofAge(2, 22, 1, day), sex: 'female' },
    ];
    expect(birthsIn2Years(unmarried)).toBe(0);
    // muž je plodný bez horní meze, žena jen do 44
    expect(birthsIn2Years((day) => spouses(60, 30, day))).toBeGreaterThan(0);
    expect(birthsIn2Years((day) => spouses(40, 46, day))).toBe(0);
  }, 30_000);

  it('narozené dítě dostane nové id, den narození, obydlí, pohlaví, matku a otce', () => {
    // manželé, nasycení 1 – někdy za pár let se musí narodit dítě
    const state = village(3, spouses(22, 20, FOUNDED), [dwelling(1)]);
    let born: Person | undefined;
    for (let day = FOUNDED; day < FOUNDED + 5 * 365 && !born; day++) {
      const before = state.nextId;
      const events = populationDay(state, day, 1);
      if (events.some((e) => e.kind === 'birth')) {
        born = state.people.find((p) => p.id === before);
        expect(born).toMatchObject({
          id: before,
          bornDay: day,
          dwellingId: 1,
          motherId: 2,
          fatherId: 1,
        });
        expect(['male', 'female']).toContain(born?.sex);
        expect(state.nextId).toBe(before + 1);
      }
    }
    expect(born).toBeDefined();
  });

  it('rozestup porodů: po porodu 21 měsíců, po svatbě 9 měsíců žena nerodí (population.md)', () => {
    let gaps = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const state = village(seed, spouses(24, 22, FOUNDED), [dwelling(1, 'polozemnice')]);
      state.people[1]!.nextBirthFrom = FOUNDED + BIRTH_SPACING.afterWeddingDays;
      const births: number[] = [];
      for (let day = FOUNDED; day < FOUNDED + 12 * 365; day++) {
        if (populationDay(state, day, 1).some((e) => e.kind === 'birth')) births.push(day);
      }
      expect(births[0]).toBeGreaterThanOrEqual(FOUNDED + BIRTH_SPACING.afterWeddingDays);
      for (let i = 1; i < births.length; i++) {
        expect(births[i]! - births[i - 1]!).toBeGreaterThanOrEqual(BIRTH_SPACING.afterBirthDays);
        gaps++;
      }
      expect(state.people[1]!.nextBirthFrom).toBe(
        births.length > 0
          ? births.at(-1)! + BIRTH_SPACING.afterBirthDays
          : FOUNDED + BIRTH_SPACING.afterWeddingDays,
      );
    }
    // za 12 let ≈ 4 porody (≈ 31 měsíců od sebe) – rozestupů přes sto
    expect(gaps).toBeGreaterThan(70);
  }, 60_000);

  it('chlapců se rodí 105 na 100 dívek', () => {
    let boys = 0;
    let all = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const state = village(seed, spouses(20, 18, FOUNDED), [dwelling(1, 'polozemnice')]);
      for (let day = FOUNDED; day < FOUNDED + 20 * 365; day++) {
        const before = state.nextId;
        if (!populationDay(state, day, 1).some((e) => e.kind === 'birth')) continue;
        for (const p of state.people) {
          if (p.id < before) continue;
          all++;
          if (p.sex === 'male') boys++;
        }
      }
    }
    expect(all).toBeGreaterThan(800);
    expect(boys / all).toBeGreaterThan(105 / 205 - 0.04);
    expect(boys / all).toBeLessThan(105 / 205 + 0.04);
  }, 120_000);

  it('rozpadlá domácnost jde k příbuzným – do domu syna, i když jinde je víc místa (kinship.md)', () => {
    const day = FOUNDED + 5 * YEAR; // hájení: nikdo dospělý neumře
    const state = village(
      1,
      [
        // dům 1: starší rodiče – nikdo 16–44, domácnost se rozpadne
        { ...ofAge(1, 62, 1, day), sex: 'male', spouseId: 2 },
        { ...ofAge(2, 58, 1, day), sex: 'female', spouseId: 1 },
        // dům 2: jejich syn se ženou a dvěma dětmi (2 volná místa)
        { ...ofAge(3, 30, 2, day), sex: 'male', spouseId: 4, fatherId: 1, motherId: 2 },
        { ...ofAge(4, 27, 2, day), sex: 'female', spouseId: 3 },
        { ...ofAge(5, 4, 2, day), sex: 'female', fatherId: 3, motherId: 4 },
        { ...ofAge(6, 2, 2, day), sex: 'male', fatherId: 3, motherId: 4 },
        // dům 3: nepříbuzní v polozemnici (6 volných míst)
        { ...ofAge(7, 30, 3, day), sex: 'male', spouseId: 8 },
        { ...ofAge(8, 28, 3, day), sex: 'female', spouseId: 7 },
      ],
      [dwelling(1), dwelling(2), dwelling(3, 'polozemnice')],
    );
    const events = populationDay(state, day, 1);
    expect(events).toContainEqual({
      day,
      kind: 'household-merged',
      fromDwellingId: 1,
      toDwellingId: 2,
    });
  });

  it('starší zůstanou doma, když by u příbuzných i jinde přeplnili dům (Martin, 19. 10. 2026)', () => {
    const day = FOUNDED + 5 * YEAR; // hájení: nikdo dospělý neumře
    const state = village(
      1,
      [
        // dům 1: starší rodiče – nikdo 16–44, domácnost se rozpadá
        { ...ofAge(1, 62, 1, day), sex: 'male', spouseId: 2 },
        { ...ofAge(2, 58, 1, day), sex: 'female', spouseId: 1 },
        // dům 2: syn s rodinou – 5 z 6, oba rodiče by ho přeplnili
        { ...ofAge(3, 30, 2, day), sex: 'male', spouseId: 4, fatherId: 1, motherId: 2 },
        { ...ofAge(4, 27, 2, day), sex: 'female', spouseId: 3 },
        { ...ofAge(5, 6, 2, day), sex: 'female', fatherId: 3, motherId: 4 },
        { ...ofAge(6, 4, 2, day), sex: 'male', fatherId: 3, motherId: 4 },
        { ...ofAge(7, 2, 2, day), sex: 'male', fatherId: 3, motherId: 4 },
      ],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 1);
    expect(events.filter((e) => e.kind === 'household-merged')).toEqual([]);
    expect(state.people.filter((p) => p.dwellingId === 1).map((p) => p.id)).toEqual([1, 2]);
  });

  it('osamělý starší zůstane doma, když se jinam nevejde bez přeplnění', () => {
    const day = FOUNDED + 5 * YEAR;
    const full = [1, 2, 3, 4, 5, 6].map((id) => ofAge(id, 30, 1, day));
    const state = village(1, [...full, ofAge(7, 60, 2, day)], [dwelling(1), dwelling(2)]);
    const events = populationDay(state, day, 0);
    expect(events.filter((e) => e.kind === 'household-merged')).toEqual([]);
    expect(state.people.find((p) => p.id === 7)?.dwellingId).toBe(2);
  });

  it('samotné děti jdou k příbuzným i do přeplněného domu – samy bydlet nemohou', () => {
    const day = FOUNDED + 5 * YEAR;
    const full = [1, 2, 3, 4, 5, 6].map((id) => ofAge(id, 30, 1, day));
    const state = village(
      1,
      [...full, ofAge(7, 8, 2, day), ofAge(8, 5, 2, day)],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 0);
    expect(events).toContainEqual({
      day,
      kind: 'household-merged',
      fromDwellingId: 2,
      toDwellingId: 1,
    });
  });

  it('jediný člověk 16–44 v domě zůstává (svobodný), samotný starší se přestěhuje', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [
        { ...ofAge(1, 30, 1, day), sex: 'male' },
        { ...ofAge(2, 60, 2, day), sex: 'female' },
        { ...ofAge(3, 30, 3, day), sex: 'male', spouseId: 4 },
        { ...ofAge(4, 28, 3, day), sex: 'female', spouseId: 3 },
      ],
      [dwelling(1), dwelling(2), dwelling(3)],
    );
    // samotná starší jde do domu s nejvíc volnými místy – k samotnému muži (5 míst)
    const merged = populationDay(state, day, 1).filter((e) => e.kind === 'household-merged');
    expect(merged).toEqual([{ day, kind: 'household-merged', fromDwellingId: 2, toDwellingId: 1 }]);
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

  it('jediný člověk 16–44 zůstává – svobodný, vezme se (sňatky mezi domy)', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [ofAge(1, 30, 1, day), ofAge(2, 30, 1, day), ofAge(3, 30, 2, day)],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 0);
    expect(events.filter((e) => e.kind === 'household-merged')).toEqual([]);
    expect(state.people.find((p) => p.id === 3)?.dwellingId).toBe(2);
  });

  it('jediný dospělý mimo plodný věk (15 let) se přestěhuje jinam; prázdné obydlí zůstává', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [ofAge(1, 30, 1, day), ofAge(2, 30, 1, day), ofAge(3, 15, 2, day)],
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

  it('domácnost jen se staršími (bez nikoho 14–44) se přestěhuje', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [ofAge(1, 30, 1, day), ofAge(2, 30, 1, day), ofAge(3, 50, 2, day), ofAge(4, 60, 2, day)],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 1);
    expect(events).toContainEqual({
      day,
      kind: 'household-merged',
      fromDwellingId: 2,
      toDwellingId: 1,
    });
    expect(state.people.filter((p) => p.dwellingId === 2)).toHaveLength(0);
  });

  it('osamělý starší se přestěhuje', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [ofAge(1, 30, 1, day), ofAge(2, 30, 1, day), ofAge(3, 50, 2, day)],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 1);
    expect(events).toContainEqual({
      day,
      kind: 'household-merged',
      fromDwellingId: 2,
      toDwellingId: 1,
    });
  });

  it('dospělý se staršími zůstává – domácnost má dospělého a není osamělý', () => {
    const day = FOUNDED + 5 * YEAR;
    const state = village(
      1,
      [ofAge(1, 30, 1, day), ofAge(2, 30, 1, day), ofAge(3, 30, 2, day), ofAge(4, 50, 2, day)],
      [dwelling(1), dwelling(2)],
    );
    const events = populationDay(state, day, 1);
    expect(events.filter((e) => e.kind === 'household-merged')).toEqual([]);
    expect(state.people.filter((p) => p.dwellingId === 2).map((p) => p.id)).toEqual([3, 4]);
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
