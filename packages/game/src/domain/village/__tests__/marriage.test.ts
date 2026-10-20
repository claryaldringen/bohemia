import { describe, expect, it } from 'vitest';
import { ageYears, occupants } from '../people';
import { arrangeMarriages, holdsHome, isWidowed, singles, weddingHome } from '../marriage';
import { NEIGHBOR_DIRECTIONS } from '../rules';
import type { ChronicleEvent, VillageState } from '../types';
import { DAY, couple, dwelling, kin, village } from './kin-fixtures';

// Sňatky (kinship.md – Sňatky; Martin, 18. 10. 2026: sňatky s okolím varianta „c“, detaily návrh
// Clauda; 19. 10. 2026: vdova se vdá co nejdřív, populace co nejvíc roste): muž a žena, kteří
// nejsou blízcí příbuzní, žena se stěhuje k muži (když drží dům ona a on ne, přižení se on);
// z okolí nevěsta ≈ 30 % ročně, ženich 10 % (k vdově a dědičce 50 %), pryč 20 %.

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
  it('nepříbuzní muž a žena se vezmou – žena se přestěhuje k muži, kronika', () => {
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

  it('sourozenci ani bratranci se nevezmou, věkový rozdíl přes 15 let také ne', () => {
    const s = village([
      kin({ id: 1, age: 20, sex: 'male', father: 90, mother: 91 }),
      kin({ id: 2, age: 18, sex: 'female', father: 90, mother: 91 }), // sestra
      kin({ id: 3, age: 19, sex: 'female', father: 92, mother: 93 }), // sestřenice (níž rodiče)
      kin({ id: 4, age: 40, sex: 'female' }), // o 20 let starší
    ]);
    s.ancestors = [
      { id: 90, fatherId: 80, motherId: 81 },
      { id: 92, fatherId: 80, motherId: 81 },
    ];
    expect(arrangeMarriages(s, DAY).filter((e) => e.kind === 'marriage')).toEqual([]);
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

describe('sňatky s okolím', () => {
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
  /** Dny do první události z okolí (nejvýš rok), nebo null. */
  const firstYear = (s: VillageState): number | null => {
    for (let day = DAY; day < DAY + 365; day++) {
      if (arrangeMarriages(s, day).length > 0) return day;
    }
    return null;
  };

  it('svobodný muž si přivede ženu z okolí (16–22 let, odkud přišla) – asi 30 % ročně', () => {
    let married = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = bachelor(seed);
      const day = firstYear(s);
      if (day === null) continue;
      married++;
      const bride = s.people.find((p) => p.id >= 1000)!;
      expect(bride).toMatchObject({ sex: 'female', dwellingId: 1, spouseId: 3 });
      expect(bride.motherId).toBeUndefined();
      expect(ageYears(bride.bornDay, day)).toBeGreaterThanOrEqual(16);
      expect(ageYears(bride.bornDay, day)).toBeLessThanOrEqual(22);
      expect(NEIGHBOR_DIRECTIONS).toContain(bride.origin);
      expect(person(s, 3).spouseId).toBe(bride.id);
    }
    expect(married / 400).toBeGreaterThan(0.24);
    expect(married / 400).toBeLessThan(0.36);
  });

  it('ke svobodné ženě se přižení muž z okolí (≈ 10 % ročně), nebo se vdá pryč (≈ 20 %)', () => {
    let gone = 0;
    let grooms = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = maiden(seed);
      const day = firstYear(s);
      if (day === null) continue;
      if (s.emigrants?.length) {
        gone++;
        expect(occupants(s, 1).map((p) => p.id)).toEqual([1, 2, 4]);
        expect(s.emigrants).toHaveLength(1);
        expect(s.emigrants[0]).toMatchObject({ id: 3, sex: 'female', motherId: 2, fatherId: 1 });
        expect(NEIGHBOR_DIRECTIONS).toContain(s.emigrants[0]?.direction);
        continue;
      }
      grooms++;
      const groom = s.people.find((p) => p.id >= 1000)!;
      expect(groom).toMatchObject({ sex: 'male', dwellingId: 1, spouseId: 3 });
      expect(groom.fatherId).toBeUndefined();
      expect(NEIGHBOR_DIRECTIONS).toContain(groom.origin);
      // o 2 roky mladší až o 8 let starší než nevěsta, od 18 let
      const gap = (person(s, 3).bornDay - groom.bornDay) / 365.25;
      expect(ageYears(groom.bornDay, day)).toBeGreaterThanOrEqual(18);
      expect(gap).toBeGreaterThanOrEqual(-2.01);
      expect(gap).toBeLessThanOrEqual(8.01);
      expect(person(s, 3)).toMatchObject({ spouseId: groom.id, nextBirthFrom: day + 274 });
      expect(s.chronicle).toEqual([]);
    }
    expect(gone / 600).toBeGreaterThan(0.14);
    expect(gone / 600).toBeLessThan(0.25);
    expect(grooms / 600).toBeGreaterThan(0.06);
    expect(grooms / 600).toBeLessThan(0.14);
  });

  it('k vdově, dědičce a ženě z domu bez mužů se přižení muž z okolí (≈ 50 % ročně), pryč ne', () => {
    /** Vdova 30 let s dítětem, sama v zemnici. */
    const widow = (seed: number): VillageState => {
      const s = village([
        kin({ id: 1, age: 30, sex: 'female' }),
        kin({ id: 2, age: 6, sex: 'male', mother: 1, father: 90 }),
      ]);
      s.seed = seed;
      return s;
    };
    /** Dcera 20 let a matka 46 – dcera drží dům, muž v něm není. */
    const fatherless = (seed: number): VillageState => {
      const s = village([
        kin({ id: 1, age: 46, sex: 'female' }),
        kin({ id: 2, age: 20, sex: 'female', mother: 1, father: 90 }),
      ]);
      s.seed = seed;
      return s;
    };
    for (const make of [widow, fatherless]) {
      let grooms = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const s = make(seed);
        const events: ChronicleEvent[] = [];
        for (let day = DAY; day < DAY + 365 && events.length === 0; day++) {
          events.push(...arrangeMarriages(s, day));
        }
        expect(s.emigrants ?? []).toEqual([]);
        if (events.length === 0) continue;
        grooms++;
        expect(events[0]).toMatchObject({ kind: 'groom-from-outside', dwellingId: 1 });
        expect(events[0]?.kind === 'groom-from-outside' && events[0].widow).toBe(
          make === widow ? true : undefined,
        );
      }
      expect(grooms / 300).toBeGreaterThan(0.42);
      expect(grooms / 300).toBeLessThan(0.58);
    }
  });

  it('svatba s okolím nese v kronice ženicha a nevěstu (kinship.md – Svatba ve scéně)', () => {
    const first = (s: VillageState): ChronicleEvent | undefined => {
      for (let day = DAY; day < DAY + 365; day++) {
        const events = arrangeMarriages(s, day);
        if (events.length > 0) return events[0];
      }
      return undefined;
    };
    let brides = 0;
    let grooms = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const b = bachelor(seed);
      const bride = first(b);
      if (bride) {
        brides++;
        const id = b.people.find((p) => p.id >= 1000)!.id;
        expect(bride).toMatchObject({ kind: 'bride-from-outside', groomId: 3, brideId: id });
      }
      const m = maiden(seed);
      const groom = first(m);
      if (groom?.kind === 'groom-from-outside') {
        grooms++;
        const id = m.people.find((p) => p.id >= 1000)!.id;
        expect(groom).toMatchObject({ dwellingId: 1, groomId: id, brideId: 3 });
      }
    }
    expect(brides).toBeGreaterThan(0);
    expect(grooms).toBeGreaterThan(0);
  });

  it('vdovec si z okolí přivede ženu nejvýš o 20 let mladší', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = village([
        kin({ id: 1, age: 50, sex: 'male' }),
        kin({ id: 2, age: 15, sex: 'male', father: 1, mother: 90 }),
      ]);
      s.seed = seed;
      const day = firstYear(s);
      if (day === null) continue;
      const bride = s.people.find((p) => p.id >= 1000)!;
      const gap = (bride.bornDay - person(s, 1).bornDay) / 365.25;
      expect(gap).toBeLessThanOrEqual(20.01);
      expect(gap).toBeGreaterThanOrEqual(13.99);
      expect(bride.nextBirthFrom).toBe(day + 274);
    }
  });

  it('kdo má ve vsi s kým se vzít, z okolí si nikoho nebere; v hladu nevěsta ani ženich nepřijde', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = bachelor(seed);
      s.people.push(kin({ id: 9, age: 22, sex: 'female', home: 2 }));
      s.dwellings.push(dwelling(2));
      const events = arrangeMarriages(s, DAY);
      expect(events.map((e) => e.kind)).toEqual(['marriage']);
    }
    let brides = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = bachelor(seed);
      s.hungry = true;
      if (firstYear(s) !== null) brides++;
      const m = maiden(seed);
      m.hungry = true;
      firstYear(m);
      expect(m.people.filter((p) => p.id >= 1000)).toEqual([]);
    }
    expect(brides).toBe(0);
  });

  it('stejný stav ve stejný den – stejná svatba z okolí (los ze seedu vsi a dne)', () => {
    const a = bachelor(7);
    const b = bachelor(7);
    expect(firstYear(a)).toBe(firstYear(b));
    expect(a).toEqual(b);
  });
});
