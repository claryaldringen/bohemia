import { describe, expect, it } from 'vitest';
import { ageYears, occupants } from '../people';
import { arrangeMarriages, canWed, singles } from '../marriage';
import { NEIGHBOR_DIRECTIONS } from '../rules';
import type { VillageState } from '../types';
import { DAY, couple, dwelling, kin, village } from './kin-fixtures';

// Sňatky (kinship.md – Sňatky; Martin, 18. 10. 2026: sňatky s okolím varianta „c“, detaily návrh
// Clauda): muž a žena, kteří nejsou blízcí příbuzní, žena se stěhuje k muži; z okolí ≈ 30 % ročně.

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

  it('vdova s dětmi do 14 let zůstává v domě manžela a nevdává se', () => {
    const s = village([
      kin({ id: 1, age: 30, sex: 'female' }),
      kin({ id: 2, age: 6, sex: 'male', mother: 1 }),
      kin({ id: 3, age: 28, sex: 'female' }),
      kin({ id: 4, age: 15, sex: 'male', mother: 3 }),
    ]);
    expect(ids(singles(s, DAY))).toEqual([3]);
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
      { day: DAY, kind: 'marriage', fromDwellingId: 2, toDwellingId: 1 },
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

  it('nevěsta neodejde, když by se jí domácnost rozpadla; do přeplněného domu také ne', () => {
    const groom = kin({ id: 1, age: 25, sex: 'male', home: 1 });
    // nevěsta je v domě 2 jediná 16–44 (zbyli by starší a malé děti)
    const alone = village(
      [
        groom,
        kin({ id: 2, age: 20, sex: 'female', home: 2 }),
        kin({ id: 3, age: 60, sex: 'male', home: 2 }),
        kin({ id: 4, age: 5, sex: 'male', home: 2 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    expect(canWed(alone, DAY, person(alone, 1), person(alone, 2))).toBe(false);
    // ženich v přeplněné zemnici (7 lidí)
    const crowded = village(
      [
        groom,
        ...[2, 3, 4, 5, 6, 7].map((id) => kin({ id: 10 + id, age: 5, sex: 'male', home: 1 })),
        kin({ id: 2, age: 20, sex: 'female', home: 2 }),
        kin({ id: 3, age: 40, sex: 'male', home: 2 }),
      ],
      [dwelling(1), dwelling(2)],
    );
    expect(canWed(crowded, DAY, person(crowded, 1), person(crowded, 2))).toBe(false);
    // plný dům ještě smí – po svatbě o jednoho přes kapacitu
    crowded.people = crowded.people.filter((p) => p.id !== 17);
    expect(canWed(crowded, DAY, person(crowded, 1), person(crowded, 2))).toBe(true);
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

  it('svobodná žena bez ženicha se vdá pryč – v rodokmenu zůstane se směrem vsi', () => {
    let gone = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = maiden(seed);
      if (firstYear(s) === null) continue;
      gone++;
      expect(occupants(s, 1).map((p) => p.id)).toEqual([1, 2, 4]);
      expect(s.emigrants).toHaveLength(1);
      expect(s.emigrants?.[0]).toMatchObject({ id: 3, sex: 'female', motherId: 2, fatherId: 1 });
      expect(NEIGHBOR_DIRECTIONS).toContain(s.emigrants?.[0]?.direction);
    }
    expect(gone / 400).toBeGreaterThan(0.24);
    expect(gone / 400).toBeLessThan(0.36);
  });

  it('kdo má ve vsi s kým se vzít, z okolí si nikoho nebere; v hladu nevěsta nepřijde', () => {
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
