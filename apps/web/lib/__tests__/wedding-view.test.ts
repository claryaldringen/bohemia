import type { ChronicleEvent, Dwelling, Person, VillageState } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import {
  MAX_MANOR_WEDDING_FIGURES,
  MAX_WEDDING_FIGURES,
  OUTSIDE_PARTY,
  WEDDING_VIEW_DAYS,
  sceneWeddings,
  weddingCompanions,
} from '../wedding-view';

// Svatba ve scéně (kinship.md – Svatba ve scéně; Martin – GitHub issue #2: „Jako máme pohřeb,
// udělej i svatbu. Svatebčané půjdou na některé z posvátných míst v okolí, kde budou oddáni.“).

const DAY = 120_000;
const DAYS_PER_YEAR = 365.25;
const LANDSCAPE = { size: 128, cellSizeM: 15 };
const person = (
  id: number,
  years: number,
  dwellingId: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: DAY - Math.ceil(years * DAYS_PER_YEAR), dwellingId, sex, ...extra });
const dwelling = (id: number, x: number, z: number): Dwelling =>
  ({
    id,
    type: 'zemnice',
    position: { x, z, rotation: 0 },
    builtDay: 0,
    condition: 1,
  }) as Dwelling;
/** Ves: nevěsta (3) z domu 1 si bere ženicha (6) z domu 2; domy 3 a 4 jsou sousedé. */
const PEOPLE: Person[] = [
  person(1, 50, 1, 'male'),
  person(2, 46, 1, 'female'),
  person(3, 19, 2, 'female', { spouseId: 6 }),
  person(4, 12, 1, 'male'),
  person(5, 52, 2, 'female'),
  person(6, 23, 2, 'male', { spouseId: 3 }),
  person(7, 8, 2, 'female'),
  person(8, 30, 3, 'male'),
  person(9, 28, 3, 'female'),
  person(10, 4, 3, 'male'),
  person(11, 66, 4, 'female'),
  person(12, 40, 4, 'male'),
  person(20, 45, 5, 'male'),
  person(21, 44, 5, 'female'),
];
const DWELLINGS = [
  dwelling(1, 0, 0),
  dwelling(2, 20, 0),
  dwelling(3, 0, 20),
  dwelling(4, 20, 20),
  dwelling(5, -30, 0),
];
const marriage = (day: number, extra: Partial<ChronicleEvent> = {}): ChronicleEvent =>
  ({
    day,
    kind: 'marriage',
    fromDwellingId: 1,
    toDwellingId: 2,
    groomId: 6,
    brideId: 3,
    groomFromDwellingId: 2,
    brideFromDwellingId: 1,
    ...extra,
  }) as ChronicleEvent;
const state = (
  chronicle: ChronicleEvent[],
  extra: Partial<VillageState> = {},
): Pick<
  VillageState,
  'chronicle' | 'people' | 'seed' | 'dwellings' | 'manorId' | 'constructions'
> => ({
  chronicle,
  people: PEOPLE,
  seed: 77,
  dwellings: DWELLINGS,
  constructions: [],
  manorId: 5,
  ...extra,
});

describe('svatby do scény (sceneWeddings)', () => {
  it('jen svatby posledních dnů z kroniky – i z okolí, dcera vdaná pryč ne', () => {
    const chronicle: ChronicleEvent[] = [
      marriage(DAY - WEDDING_VIEW_DAYS),
      marriage(DAY - WEDDING_VIEW_DAYS + 1),
      { day: DAY - 2, kind: 'married-away', dwellingId: 3 },
      { day: DAY - 1, kind: 'bride-from-outside', dwellingId: 3, groomId: 8 },
      marriage(DAY),
      marriage(DAY + 1),
    ];
    const weddings = sceneWeddings(state(chronicle), DAY, LANDSCAPE);
    expect(weddings.map((w) => w.day)).toEqual([DAY - WEDDING_VIEW_DAYS + 1, DAY - 1, DAY]);
    expect(weddings.map((w) => w.key)).toEqual([
      `${DAY - WEDDING_VIEW_DAYS + 1}:0`,
      `${DAY - 1}:0`,
      `${DAY}:0`,
    ]);
  });

  it('pár, domy před svatbou, nový domov a svatebčané – domácnosti obou a z ostatních 1–2', () => {
    const [w] = sceneWeddings(state([marriage(DAY)]), DAY, LANDSCAPE);
    expect(w!.bride).toEqual({ id: 3, age: 19, from: 1 });
    expect(w!.groom).toEqual({ id: 6, age: 23, from: 2 });
    expect(w!.home).toBe(2);
    expect(w!.manor).toBeUndefined();
    expect(w!.companions).toBeUndefined();
    const ids = w!.guests.map((g) => g.id);
    // nevěsta ani ženich mezi svatebčany nejsou
    expect(ids).not.toContain(3);
    expect(ids).not.toContain(6);
    // celé domácnosti obou (dům nevěsty 1, ženicha 2) napřed
    expect(new Set(ids.slice(0, 5))).toEqual(new Set([1, 2, 4, 5, 7]));
    // z ostatních domácností jeden až dva lidé, napřed dospělí
    for (const home of [3, 4, 5]) {
      const n = w!.guests.filter((g) => g.home === home).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
    expect(w!.guests.find((g) => g.home === 3)!.age).toBeGreaterThanOrEqual(14);
    expect(w!.guests.find((g) => g.id === 1)).toEqual({ id: 1, sex: 'male', age: 50, home: 1 });
  });

  it('starší události bez páru a domů: domy z from / to (ženich se přiženil – obráceně)', () => {
    const old = {
      day: DAY,
      kind: 'marriage',
      fromDwellingId: 1,
      toDwellingId: 2,
    } as ChronicleEvent;
    const [w] = sceneWeddings(state([old]), DAY, LANDSCAPE);
    expect(w!.bride).toEqual({ age: 19, from: 1 });
    expect(w!.groom).toEqual({ age: 23, from: 2 });
    expect(w!.home).toBe(2);
    const moved = { ...old, groomMoved: true } as ChronicleEvent;
    const [m] = sceneWeddings(state([moved]), DAY, LANDSCAPE);
    expect(m!.groom.from).toBe(1);
    expect(m!.bride.from).toBe(2);
    expect(m!.home).toBe(2);
  });

  it('nevěsta z okolí: odkud přišla, bod na kraji mapy v jejím směru a lidé, kteří přišli s ní', () => {
    const bride = person(30, 18, 3, 'female', { origin: 'E', spouseId: 8 });
    const event = {
      day: DAY,
      kind: 'bride-from-outside',
      dwellingId: 3,
      groomId: 8,
      brideId: 30,
    } as ChronicleEvent;
    const [w] = sceneWeddings(state([event], { people: [...PEOPLE, bride] }), DAY, LANDSCAPE);
    expect(w!.bride.from).toBeNull();
    expect(w!.bride.outside?.direction).toBe('E');
    // kraj mapy na východě (x = půl mapy bez okraje), stejná řada jako dům ženicha
    const half = (LANDSCAPE.size * LANDSCAPE.cellSizeM) / 2;
    expect(w!.bride.outside?.edge.x).toBeCloseTo(half - 12, 6);
    expect(w!.bride.outside?.edge.z).toBeCloseTo(20, 6);
    expect(w!.groom).toEqual({ id: 8, age: 30, from: 3 });
    expect(w!.home).toBe(3);
    const n = w!.companions!.length;
    expect(n).toBeGreaterThanOrEqual(OUTSIDE_PARTY.min);
    expect(n).toBeLessThanOrEqual(OUTSIDE_PARTY.max);
    expect(w!.guests.map((g) => g.id)).not.toContain(30);
  });

  it('ženich z okolí bez zápisu směru (starší ves) – směr podle losu svatby, stále stejný', () => {
    const event = { day: DAY, kind: 'groom-from-outside', dwellingId: 4 } as ChronicleEvent;
    const [a] = sceneWeddings(state([event]), DAY, LANDSCAPE);
    const [b] = sceneWeddings(state([event]), DAY, LANDSCAPE);
    expect(a!.groom.from).toBeNull();
    expect(a!.groom.outside).toBeDefined();
    expect(a).toEqual(b);
    expect(a!.bride.from).toBe(4);
  });

  it('svatba ve vojvodově rodině – jde celá ves (nejvýš MAX_MANOR_WEDDING_FIGURES)', () => {
    const manor = marriage(DAY, { toDwellingId: 5, groomFromDwellingId: 5 });
    const [w] = sceneWeddings(state([manor]), DAY, LANDSCAPE);
    expect(w!.manor).toBe(true);
    expect(w!.guests).toHaveLength(PEOPLE.length - 2);
    const crowd = Array.from({ length: 80 }, (_, i) => person(100 + i, 30, 3 + (i % 3), 'male'));
    const [big] = sceneWeddings(state([manor], { people: [...PEOPLE, ...crowd] }), DAY, LANDSCAPE);
    expect(big!.guests).toHaveLength(MAX_MANOR_WEDDING_FIGURES - 2);
    const [plain] = sceneWeddings(
      state([marriage(DAY)], { people: [...PEOPLE, ...crowd] }),
      DAY,
      LANDSCAPE,
    );
    expect(plain!.guests.length).toBeLessThanOrEqual(MAX_WEDDING_FIGURES - 2);
  });

  it('lidé z okolí: otec a matka napřed, počet podle losu', () => {
    for (let seed = 0; seed < 40; seed++) {
      const c = weddingCompanions(seed);
      expect(c[0]!.sex).toBe('male');
      expect(c[1]!.sex).toBe('female');
      expect(c.length).toBeGreaterThanOrEqual(OUTSIDE_PARTY.min);
      expect(c.length).toBeLessThanOrEqual(OUTSIDE_PARTY.max);
    }
  });
});
