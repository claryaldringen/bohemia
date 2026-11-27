import { describe, expect, it } from 'vitest';
import { occupants } from '../people';
import {
  arrangeMarriages,
  holdsHome,
  isWidowed,
  singles,
  weddingChancePerDay,
  weddingHome,
} from '../marriage';
import { craftHouseholds, newWorkshop } from '../../crafts/crafts';
import { MARRIAGE_STORES } from '../../rules';
import type { ChronicleEvent, VillageState } from '../../types';
import { DAY, couple, dwelling, kin, village } from '../../__tests__/kin-fixtures';

// Sňatky (kinship.md – Sňatky; Martin, 18. 10. 2026; 19. 10. 2026: vdova se vdá co nejdřív, populace co nejvíc roste): muž a žena
// (příbuzenství se nehlídá – Martin 23. 11. 2026), žena se stěhuje k muži (když drží dům ona a on ne,
// přižení se on); nevěsty, ženichy ani odchod z vsi okolí nedává (markets.md – Pravidla 1).

const person = (s: VillageState, id: number): VillageState['people'][number] =>
  s.people.find((p) => p.id === id)!;
const ids = (people: { id: number }[]): number[] => people.map((p) => p.id);

describe('svobodní', () => {
  it('muž od 16 let bez horní meze, žena 16–44, bez žijícího manžela – od nejstaršího', () => {
    const s = village([
      ...couple({ id: 1, age: 40 }, { id: 2, age: 38 }).map((k) => kin(k)),
      kin({ id: 3, age: 70, sex: 'male' }),
      kin({ id: 4, age: 50, sex: 'female' }),
      kin({ id: 5, age: 16, sex: 'female' }),
      kin({ id: 6, age: 15, sex: 'male' }),
      kin({ id: 7, age: 30, sex: 'male', spouse: 99 }), // vdovec – manželka 99 už nežije
    ]);
    expect(ids(singles(s, DAY))).toEqual([3, 7, 5]);
  });

  it('vdova s malými dětmi je svobodná – vdá se co nejdřív (Martin, 19. 10. 2026)', () => {
    const s = village([
      kin({ id: 1, age: 30, sex: 'female' }),
      kin({ id: 2, age: 6, sex: 'male', mother: 1 }),
      kin({ id: 3, age: 28, sex: 'female' }),
      kin({ id: 4, age: 15, sex: 'male', mother: 3 }),
    ]);
    expect(ids(singles(s, DAY))).toEqual([1, 3]);
    // vdova = svobodná s dětmi (děti se rodí jen manželům)
    expect(isWidowed(s, person(s, 1), DAY)).toBe(true);
    expect(isWidowed(s, person(s, 4), DAY)).toBe(false);
  });
});

describe('svatba ve vsi', () => {
  it('muž a žena se vezmou – žena se přestěhuje k muži, kronika', () => {
    const s = village(
      [
        ...couple({ id: 1, age: 50, home: 1 }, { id: 2, age: 46, home: 1 }).map((k) => kin(k)),
        kin({ id: 3, age: 22, sex: 'male', home: 1, father: 1, mother: 2 }),
        ...couple({ id: 4, age: 48, home: 2 }, { id: 5, age: 45, home: 2 }).map((k) => kin(k)),
        kin({ id: 6, age: 19, sex: 'female', home: 2, father: 4, mother: 5 }),
        kin({ id: 7, age: 17, sex: 'male', home: 2, father: 4, mother: 5 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    expect(arrangeMarriages(s, DAY)).toEqual([
      {
        day: DAY,
        kind: 'marriage',
        fromDwellingId: 2,
        toDwellingId: 1,
        groomId: 3,
        brideId: 6,
        groomFromDwellingId: 1,
        brideFromDwellingId: 2,
      },
    ]);
    expect(person(s, 6)).toMatchObject({ dwellingId: 1, spouseId: 3 });
    expect(person(s, 3).spouseId).toBe(6);
    expect(arrangeMarriages(s, DAY).filter((e) => e.kind === 'marriage')).toEqual([]);
  });

  it('sourozenci se smí vzít (příbuzenství se nehlídá; Martin 23. 11. 2026)', () => {
    const s = village([
      kin({ id: 1, age: 20, sex: 'male', father: 90, mother: 91 }),
      kin({ id: 2, age: 18, sex: 'female', father: 90, mother: 91 }), // sestra
    ]);
    const weddings = arrangeMarriages(s, DAY).filter((e) => e.kind === 'marriage');
    expect(weddings).toMatchObject([{ groomId: 1, brideId: 2 }]);
  });

  it('bratranec a sestřenice se smí vzít, věkový rozdíl přes 15 let ne', () => {
    const s = village([
      kin({ id: 1, age: 20, sex: 'male', father: 90, mother: 91 }),
      kin({ id: 3, age: 19, sex: 'female', father: 92, mother: 93 }), // sestřenice
      kin({ id: 4, age: 40, sex: 'female' }), // o 20 let starší
    ]);
    s.ancestors = [
      { id: 90, fatherId: 80, motherId: 81 },
      { id: 92, fatherId: 80, motherId: 81 },
    ];
    const weddings = arrangeMarriages(s, DAY).filter((e) => e.kind === 'marriage');
    expect(weddings).toMatchObject([{ groomId: 1, brideId: 3 }]);
  });

  it('od nejstaršího svobodného, každý s nejbližším věkem', () => {
    const s = village([
      kin({ id: 1, age: 30, sex: 'male' }),
      kin({ id: 2, age: 22, sex: 'male' }),
      kin({ id: 3, age: 21, sex: 'female' }),
      kin({ id: 4, age: 27, sex: 'female' }),
    ]);
    arrangeMarriages(s, DAY);
    expect(person(s, 1).spouseId).toBe(4);
    expect(person(s, 2).spouseId).toBe(3);
  });

  it('do přeplněného domu ženicha nevěsta smí – zbytek se oddělí, až bude dům (Martin)', () => {
    const groom = kin({ id: 1, age: 25, sex: 'male', home: 1, mother: 30, father: 31 });
    const crowded = village(
      [
        groom,
        ...couple({ id: 31, age: 50, home: 1 }, { id: 30, age: 44, home: 1 }).map((k) => kin(k)),
        ...[2, 3, 4, 5, 6, 7].map((id) => kin({ id: 10 + id, age: 5, sex: 'male', home: 1 })),
        kin({ id: 2, age: 20, sex: 'female', home: 2 }),
        kin({ id: 3, age: 40, sex: 'male', home: 2 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    expect(weddingHome(crowded, DAY, person(crowded, 1), person(crowded, 2))).toEqual({
      mover: person(crowded, 2),
      dwellingId: 1,
    });
    expect(arrangeMarriages(crowded, DAY).filter((e) => e.kind === 'marriage')).toEqual([
      {
        day: DAY,
        kind: 'marriage',
        fromDwellingId: 2,
        toDwellingId: 1,
        groomId: 1,
        brideId: 2,
        groomFromDwellingId: 1,
        brideFromDwellingId: 2,
      },
    ]);
  });

  it('nevěsta, která drží dům (zbyli by starší a děti), si ženicha přivede k sobě', () => {
    const s = village(
      [
        kin({ id: 1, age: 25, sex: 'male', home: 1, mother: 30, father: 31 }),
        ...couple({ id: 31, age: 50, home: 1 }, { id: 30, age: 44, home: 1 }).map((k) => kin(k)),
        kin({ id: 2, age: 20, sex: 'female', home: 2, father: 3 }),
        kin({ id: 3, age: 60, sex: 'male', home: 2 }),
        kin({ id: 4, age: 5, sex: 'male', home: 2, father: 3 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    expect(holdsHome(s, person(s, 2), DAY)).toBe(true);
    expect(holdsHome(s, person(s, 1), DAY)).toBe(false); // doma zůstane matka 44
    expect(arrangeMarriages(s, DAY).filter((e) => e.kind === 'marriage')).toEqual([
      {
        day: DAY,
        kind: 'marriage',
        fromDwellingId: 1,
        toDwellingId: 2,
        groomMoved: true,
        groomId: 1,
        brideId: 2,
        groomFromDwellingId: 1,
        brideFromDwellingId: 2,
      },
    ]);
    expect(occupants(s, 2).map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(occupants(s, 1).map((p) => p.id)).toEqual([30, 31]);
  });
});

describe('vdovy a vdovci (Martin, 19. 10. 2026)', () => {
  /** Vdova 30 let se dvěma dětmi ve vlastní zemnici 1, svobodný muž 28 u rodičů v zemnici 2. */
  const widowAndBachelor = (): VillageState =>
    village(
      [
        kin({ id: 1, age: 30, sex: 'female', home: 1 }),
        kin({ id: 2, age: 8, sex: 'male', home: 1, mother: 1, father: 90 }),
        kin({ id: 3, age: 4, sex: 'female', home: 1, mother: 1, father: 90 }),
        ...couple({ id: 4, age: 50, home: 2 }, { id: 5, age: 44, home: 2 }).map((k) => kin(k)),
        kin({ id: 6, age: 28, sex: 'male', home: 2, father: 4, mother: 5 }),
      ],
      [dwelling(1), dwelling(2)],
    );

  it('vdova s dětmi drží dům – muž, který doma nic nedrží, se k ní přižení', () => {
    const s = widowAndBachelor();
    expect(holdsHome(s, person(s, 1), DAY)).toBe(true);
    expect(arrangeMarriages(s, DAY)).toEqual([
      {
        day: DAY,
        kind: 'marriage',
        fromDwellingId: 2,
        toDwellingId: 1,
        groomMoved: true,
        widow: true,
        groomId: 6,
        brideId: 1,
        groomFromDwellingId: 2,
        brideFromDwellingId: 1,
      },
    ]);
    expect(occupants(s, 1).map((p) => p.id)).toEqual([1, 2, 3, 6]);
    expect(person(s, 1)).toMatchObject({ spouseId: 6, nextBirthFrom: DAY + 274 });
  });

  it('vdovec s dětmi dům drží – vdova jde s dětmi do 16 let k němu i za cenu přeplnění', () => {
    const s = widowAndBachelor();
    s.people = s.people.filter((p) => p.id !== 6);
    s.people.push(
      kin({ id: 6, age: 33, sex: 'male', home: 2, father: 4, mother: 5 }),
      ...[7, 8, 9].map((id) => kin({ id, age: 3, sex: 'male', home: 2, father: 6, mother: 91 })),
      kin({ id: 10, age: 17, sex: 'male', home: 1, mother: 1, father: 90 }),
    );
    // zemnice 2: rodiče 50 a 44 (matka drží dům), vdovec 33 se třemi dětmi = 6 lidí
    expect(holdsHome(s, person(s, 6), DAY)).toBe(false);
    s.people = s.people.filter((p) => p.id !== 5); // matka zemřela – dům drží vdovec
    expect(holdsHome(s, person(s, 6), DAY)).toBe(true);
    const events = arrangeMarriages(s, DAY);
    expect(events).toEqual([
      {
        day: DAY,
        kind: 'marriage',
        fromDwellingId: 1,
        toDwellingId: 2,
        widow: true,
        groomId: 4,
        brideId: 1,
        groomFromDwellingId: 2,
        brideFromDwellingId: 1,
      },
    ]);
    // děti do 16 let jdou s matkou, 17letý syn zůstává a drží dům
    expect(occupants(s, 2).map((p) => p.id)).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
    expect(occupants(s, 1).map((p) => p.id)).toEqual([10]);
  });

  it('vdova má přednost a věkový rozdíl u vdov a vdovců smí být 20 let', () => {
    // svobodná 30 by si jako nejstarší vzala muže 26 – vdova 24 má ale přednost
    const s = village([
      kin({ id: 1, age: 30, sex: 'female', home: 1 }),
      kin({ id: 2, age: 24, sex: 'female', home: 1 }),
      kin({ id: 3, age: 2, sex: 'female', home: 1, mother: 2, father: 90 }),
      kin({ id: 4, age: 26, sex: 'male', home: 1 }),
    ]);
    arrangeMarriages(s, DAY);
    expect(person(s, 4).spouseId).toBe(2);
    expect(person(s, 1).spouseId).toBeUndefined();
    // vdova 36 a muž 17 (rozdíl 19) – smí; svobodná 36 a muž 17 ne
    const widow = village([
      kin({ id: 1, age: 36, sex: 'female' }),
      kin({ id: 2, age: 10, sex: 'male', mother: 1, father: 90 }),
      kin({ id: 3, age: 17, sex: 'male', father: 92 }),
    ]);
    arrangeMarriages(widow, DAY);
    expect(person(widow, 1).spouseId).toBe(3);
    const maiden = village([
      kin({ id: 1, age: 36, sex: 'female' }),
      kin({ id: 3, age: 17, sex: 'male', father: 92 }),
    ]);
    expect(arrangeMarriages(maiden, DAY).filter((e) => e.kind === 'marriage')).toEqual([]);
  });
});

describe('sňatky jen ve vsi (markets.md – Pravidla 1; Martin 22. 11. 2026: „dokud bude vesnice bez spojení s okolím, ať se lidé berou mezi sebou“)', () => {
  /** Svobodný muž 25 let a jeho rodiče – ve vsi pro něj nevěsta není. */
  const bachelor = (seed: number): VillageState => {
    const s = village(
      [
        ...couple({ id: 1, age: 50 }, { id: 2, age: 46 }).map((k) => kin(k)),
        kin({ id: 3, age: 25, sex: 'male', father: 1, mother: 2 }),
      ],
      [dwelling(1)],
    );
    s.seed = seed;
    return s;
  };
  /** Svobodná dcera 20 let, rodiče (matka 40 drží dům) a malý bratr – ženich ve vsi není. */
  const maiden = (seed: number): VillageState => {
    const s = village(
      [
        ...couple({ id: 1, age: 50 }, { id: 2, age: 40 }).map((k) => kin(k)),
        kin({ id: 3, age: 20, sex: 'female', father: 1, mother: 2 }),
        kin({ id: 4, age: 12, sex: 'male', father: 1, mother: 2 }),
      ],
      [dwelling(1)],
    );
    s.seed = seed;
    return s;
  };
  const OUTSIDE = ['bride-from-outside', 'groom-from-outside', 'married-away'];

  it('svobodný muž bez nevěsty ve vsi si nikoho z okolí nepřivede – rok sňatků', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = bachelor(seed);
      const people = s.people.length;
      const nextId = s.nextId;
      const events: ChronicleEvent[] = [];
      for (let d = DAY; d < DAY + 365; d++) events.push(...arrangeMarriages(s, d));
      expect(events).toEqual([]);
      expect(s.people).toHaveLength(people);
      expect(s.nextId).toBe(nextId);
    }
  });

  it('svobodná žena bez muže ve vsi se nevdá pryč a nikdo k ní nepřijde', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = maiden(seed);
      const emigrantsBefore = structuredClone(s.emigrants ?? []);
      const nextId = s.nextId;
      const events: ChronicleEvent[] = [];
      for (let d = DAY; d < DAY + 365; d++) events.push(...arrangeMarriages(s, d));
      expect(events.filter((e) => OUTSIDE.includes(e.kind))).toEqual([]);
      expect(s.emigrants ?? []).toEqual(emigrantsBefore);
      expect(s.nextId).toBe(nextId);
      expect(person(s, 3).spouseId).toBeUndefined();
    }
  });

  it('vdova i dědička bez muže se nevdají pryč, nikdo nepřijde', () => {
    const s = village(
      [kin({ id: 1, age: 35, sex: 'female' }), kin({ id: 2, age: 8, sex: 'male', mother: 1 })],
      [dwelling(1)],
    );
    const nextId = s.nextId;
    const events: ChronicleEvent[] = [];
    for (let d = DAY; d < DAY + 3 * 365; d++) events.push(...arrangeMarriages(s, d));
    expect(events).toEqual([]);
    expect(s.nextId).toBe(nextId);
    expect(s.emigrants ?? []).toEqual([]);
  });

  it('bratranec a sestřenice se vezmou (příbuzenství se nehlídá)', () => {
    const s = village(
      [
        ...couple({ id: 1, age: 50, home: 1 }, { id: 2, age: 46, home: 1 }).map((k) => kin(k)),
        kin({ id: 3, age: 24, sex: 'male', home: 1, father: 1, mother: 2 }),
        ...couple({ id: 4, age: 49, home: 2 }, { id: 5, age: 45, home: 2 }).map((k) => kin(k)),
        kin({ id: 6, age: 21, sex: 'female', home: 2, father: 4, mother: 5 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    const events = arrangeMarriages(s, DAY);
    expect(events.some((e) => e.kind === 'marriage')).toBe(true);
  });

  it('stejný stav ve stejný den – stejný výsledek (los ze seedu vsi a dne)', () => {
    const a = bachelor(7);
    const b = bachelor(7);
    for (let d = DAY; d < DAY + 200; d++) {
      expect(arrangeMarriages(a, d)).toEqual(arrangeMarriages(b, d));
    }
    expect(a).toEqual(b);
  });
});

describe('sňatky čekají na zásoby (kinship.md; Martin 27. 10. 2026)', () => {
  /** Svobodný muž 22 a svobodná žena 19 ze dvou domů – vezmou se hned, když ves má pojistku. */
  const pair = (seed: number): VillageState => {
    const s = village(
      [
        ...couple({ id: 1, age: 50, home: 1 }, { id: 2, age: 46, home: 1 }).map((k) => kin(k)),
        kin({ id: 3, age: 22, sex: 'male', home: 1, father: 1, mother: 2 }),
        ...couple({ id: 4, age: 48, home: 2 }, { id: 5, age: 45, home: 2 }).map((k) => kin(k)),
        kin({ id: 6, age: 19, sex: 'female', home: 2, father: 4, mother: 5 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    s.seed = seed;
    return s;
  };
  /** Den první svatby ve vsi od DAY při naplnění pojistky `fill` (nejvýš 20 let), nebo null. */
  const weddingDay = (s: VillageState, fill: number): number | null => {
    for (let day = DAY; day < DAY + 20 * 365; day++) {
      if (arrangeMarriages(s, day, () => fill).some((e) => e.kind === 'marriage')) return day;
    }
    return null;
  };

  it('odklad průměrně waitYears × (1 − naplnění) let; nad pojistkou beze změny', () => {
    expect(weddingChancePerDay(1)).toBe(1);
    expect(weddingChancePerDay(1.2)).toBe(1);
    // prázdné zásoby: střední čekání waitYears let
    const empty = weddingChancePerDay(0);
    expect(1 / (empty * 365)).toBeCloseTo(MARRIAGE_STORES.waitYears, 1);
    // v půli pojistky polovina
    const half = weddingChancePerDay(0.5);
    expect(1 / (half * 365)).toBeCloseTo(MARRIAGE_STORES.waitYears / 2, 1);
  });

  it('pod pojistkou se svatba odloží, nad ní proběhne hned', () => {
    let waited = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const s = pair(seed);
      if (arrangeMarriages(s, DAY, () => 0.2).length === 0) waited++;
      expect(person(s, 3).spouseId).toBeUndefined();
      // zásoby dorostly k pojistce – svatba týž den
      expect(arrangeMarriages(s, DAY, () => 1).map((e) => e.kind)).toEqual(['marriage']);
      expect(person(s, 3).spouseId).toBe(6);
    }
    expect(waited).toBe(50);
  });

  it('když pojistka nikdy nedoroste, sňatky se jen zpomalí – nezastaví', () => {
    const waits: number[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const day = weddingDay(pair(seed), 0.5);
      expect(day).not.toBeNull();
      waits.push((day! - DAY) / 365);
    }
    const mean = waits.reduce((a, b) => a + b, 0) / waits.length;
    // v půli pojistky ≈ 1,5 roku (exponenciálně – průměr ze 120 losů ± 0,4 roku)
    expect(mean).toBeGreaterThan(MARRIAGE_STORES.waitYears / 2 - 0.4);
    expect(mean).toBeLessThan(MARRIAGE_STORES.waitYears / 2 + 0.4);
  });

  it('snoubenci, kteří čekají, si nevezmou nikoho jiného', () => {
    const s = pair(7);
    s.people.push(kin({ id: 8, age: 21, sex: 'female', home: 2 }));
    expect(arrangeMarriages(s, DAY, () => 0)).toEqual([]);
  });
});

describe('řemeslník zůstává v dílně (Martin 27. 11. 2026, kinship.md – Sňatky)', () => {
  /**
   * Rýžovník 30 sám v dílně 1; vdova 30 drží zemnici 2 – děti 8 a 5 a tchán 62, který po ní
   * v domě zbude.
   */
  const pannerAndWidow = (): VillageState =>
    village(
      [
        kin({ id: 1, age: 30, sex: 'male', home: 1 }),
        kin({ id: 2, age: 30, sex: 'female', home: 2 }),
        kin({ id: 3, age: 8, sex: 'male', home: 2, mother: 2, father: 90 }),
        kin({ id: 4, age: 5, sex: 'female', home: 2, mother: 2, father: 90 }),
        kin({ id: 5, age: 62, sex: 'male', home: 2 }),
      ],
      [{ ...dwelling(1), workshop: newWorkshop('panner') }, dwelling(2)],
    );

  it('vdova, která drží dům, jde i s dětmi do 16 let do dílny – dílna dál pracuje', () => {
    const s = pannerAndWidow();
    expect(holdsHome(s, person(s, 2), DAY)).toBe(true);
    expect(holdsHome(s, person(s, 1), DAY)).toBe(false);
    expect(weddingHome(s, DAY, person(s, 1), person(s, 2))).toEqual({
      mover: person(s, 2),
      dwellingId: 1,
    });
    expect(arrangeMarriages(s, DAY)).toEqual([
      {
        day: DAY,
        kind: 'marriage',
        fromDwellingId: 2,
        toDwellingId: 1,
        widow: true,
        groomId: 1,
        brideId: 2,
        groomFromDwellingId: 1,
        brideFromDwellingId: 2,
      },
    ]);
    expect(occupants(s, 1).map((p) => p.id)).toEqual([1, 2, 3, 4]);
    // její dům zůstane tomu, kdo v něm zbyl
    expect(occupants(s, 2).map((p) => p.id)).toEqual([5]);
    expect([...craftHouseholds(s)]).toEqual([1]);
  });

  it('dům vdovy bez nikoho dalšího zůstane prázdný', () => {
    const s = pannerAndWidow();
    s.people = s.people.filter((p) => p.id !== 5);
    arrangeMarriages(s, DAY);
    expect(occupants(s, 1).map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(occupants(s, 2)).toEqual([]);
  });

  it('ženich z obyčejného domu se k vdově, která drží dům, přižení dál', () => {
    const s = pannerAndWidow();
    delete s.dwellings[0]!.workshop;
    expect(weddingHome(s, DAY, person(s, 1), person(s, 2))).toEqual({
      mover: person(s, 1),
      dwellingId: 2,
    });
  });
});
