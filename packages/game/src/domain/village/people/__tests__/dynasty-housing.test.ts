import { describe, expect, it } from 'vitest';
import { NO_DYNASTY } from '../dynasty';
import { secondaryWifeFamilies, settlingFamilies } from '../dynasty-housing';
import {
  familiesOf,
  leavingFamilies,
  occupyEmptyDwellings,
  settleNewDwelling,
  waitingHouseholds,
} from '../households';
import { removePeople } from '../kinship';
import { populationDay } from '../population';
import { dynastyDay } from '../succession';
import { DWELLINGS } from '../../rules';
import type { Family } from '../households';
import type { Person, VillageState } from '../../types';
import {
  DAY,
  LINE_LORD_ID as LORD,
  couple,
  dwelling,
  trackedVillage,
  type KinSpec,
} from '../../__tests__/kin-fixtures';

// Bydlení rodu vojvody (lord.md – Manželky – Bydlení a Přednost při osídlení; Synové po sňatku
// odcházejí z dvorce). Dvorec je obydlí 1 (zemnice), vojvoda 10.

const home = (s: VillageState, id: number): number | undefined =>
  s.people.find((p) => p.id === id)?.dwellingId;
const heads = (families: readonly Family[]): number[] => families.map((f) => f.people[0]!.id);
const kinds = (s: VillageState): string[] => s.chronicle.map((e) => e.kind);
const untracked = (s: VillageState): VillageState => ({ ...s, dynasty: NO_DYNASTY });
const child = (
  id: number,
  age: number,
  mother: number,
  sex: Person['sex'] = 'female',
): KinSpec => ({
  id,
  age,
  sex,
  mother,
  father: LORD,
});

it('dvorec je zemnice o 6 místech (předpoklad fixtur)', () => {
  expect(DWELLINGS.zemnice.capacity).toBe(6);
});

/** Dvorec: vojvoda, hlavní manželka, ženatí synové 20 (se dvěma ženami) a 22, svobodný 24, dcera. */
const marriedSons: KinSpec[] = [
  ...couple({ id: LORD, age: 50 }, { id: 11, age: 45 }),
  ...couple({ id: 20, age: 25, mother: 11, father: LORD }, { id: 21, age: 23 }),
  { id: 26, age: 19, sex: 'female', spouse: 20 },
  ...couple({ id: 22, age: 22, mother: 11, father: LORD }, { id: 23, age: 20 }),
  child(24, 17, 11, 'male'),
  child(25, 10, 11),
];

describe('ženatí synové odcházejí z dvorce (lord.md – Synové po sňatku)', () => {
  it('odcházejí všichni včetně nejstaršího, se všemi ženami; svobodný syn zůstává', () => {
    const s = trackedVillage(marriedSons);
    s.people.find((p) => p.id === 20)!.name = 'Bořivoj';
    occupyEmptyDwellings(s, DAY);
    expect([20, 21, 26].map((id) => home(s, id))).toEqual([2, 2, 2]);
    expect([22, 23].map((id) => home(s, id))).toEqual([3, 3]);
    expect([LORD, 11, 24, 25].map((id) => home(s, id))).toEqual([1, 1, 1, 1]);
    expect(s.chronicle.filter((e) => e.kind === 'son-left-manor')).toEqual([
      { day: DAY, kind: 'son-left-manor', name: 'Bořivoj' },
      { day: DAY, kind: 'son-left-manor' },
    ]);
    // ves bez rodu: nejstarší ženatý syn zůstává jako dědic
    const old = untracked(trackedVillage(marriedSons.filter((k) => k.id !== 26)));
    occupyEmptyDwellings(old, DAY);
    expect(home(old, 20)).toBe(1);
    expect(home(old, 22)).toBe(2);
    expect(kinds(old)).not.toContain('son-left-manor');
  });

  it('bez volného obydlí zůstávají a čekají na dům', () => {
    const s = trackedVillage(marriedSons, [dwelling(1)]);
    occupyEmptyDwellings(s, DAY);
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    expect(heads(settlingFamilies(s, DAY))).toEqual([20, 22]);
    expect(waitingHouseholds(s, DAY)).toBe(2);
  });

  it('svobodný syn z plného dvorce sám neodchází', () => {
    const specs: KinSpec[] = [
      ...couple({ id: LORD, age: 45 }, { id: 11, age: 40 }),
      child(24, 18, 11, 'male'),
      child(25, 12, 11),
      child(27, 10, 11),
      child(28, 8, 11),
    ];
    const s = trackedVillage(specs);
    occupyEmptyDwellings(s, DAY);
    expect(home(s, 24)).toBe(1);
    const old = untracked(trackedVillage(specs));
    occupyEmptyDwellings(old, DAY);
    expect(home(old, 24)).toBe(2);
  });
});

/** Přeplněný dvorec (10 lidí): vedlejší manželka 12 se synem 30, ženatý syn 20; v domě 2 cizí rod. */
const crowdedManor: KinSpec[] = [
  ...couple({ id: LORD, age: 40 }, { id: 11, age: 37 }),
  { id: 12, age: 30, sex: 'female', spouse: LORD },
  child(30, 12, 12, 'male'),
  ...couple({ id: 20, age: 20, mother: 11, father: LORD }, { id: 21, age: 19 }),
  ...[31, 32, 33, 34].map((id, i) => child(id, 2 + 2 * i, 11)),
  ...couple({ id: 40, age: 60, home: 2 }, { id: 41, age: 58, home: 2 }),
  ...couple({ id: 42, age: 30, home: 2, mother: 41, father: 40 }, { id: 43, age: 28, home: 2 }),
  ...couple({ id: 44, age: 25, home: 2, mother: 41, father: 40 }, { id: 45, age: 22, home: 2 }),
];

describe('přednost při osídlení: syn → vedlejší manželka → ostatní (lord.md – Manželky)', () => {
  const expectSettled = (s: VillageState): void => {
    expect([20, 21].map((id) => home(s, id))).toEqual([3, 3]);
    expect([12, 30].map((id) => home(s, id))).toEqual([4, 4]);
    expect([44, 45].map((id) => home(s, id))).toEqual([5, 5]);
    expect([42, 43].map((id) => home(s, id))).toEqual([2, 2]);
    expect(kinds(s).filter((k) => k.endsWith('-left-manor'))).toEqual([
      'son-left-manor',
      'wife-left-manor',
    ]);
  };

  it('pořadí rodin k osídlení', () => {
    const s = trackedVillage(
      crowdedManor,
      [1, 2, 3, 4, 5].map((id) => dwelling(id)),
    );
    expect(heads(settlingFamilies(s, DAY))).toEqual([20, 12, 44]);
  });

  it('prázdná obydlí', () => {
    const s = trackedVillage(
      crowdedManor,
      [1, 2, 3, 4, 5].map((id) => dwelling(id)),
    );
    occupyEmptyDwellings(s, DAY);
    expectSettled(s);
  });

  it('dostavěná obydlí po jednom', () => {
    const s = trackedVillage(crowdedManor, [dwelling(1), dwelling(2)]);
    for (const id of [3, 4, 5]) {
      s.dwellings.push(dwelling(id));
      expect(settleNewDwelling(s, DAY, id)).toBe(true);
    }
    expectSettled(s);
  });

  it('po odchodu syna už dvorec přeplněný není – vedlejší manželka zůstává', () => {
    const fewer = crowdedManor.filter((k) => k.id !== 33 && k.id !== 34);
    const s = trackedVillage(
      fewer,
      [1, 2, 3, 4].map((id) => dwelling(id)),
    );
    occupyEmptyDwellings(s, DAY);
    expect(home(s, 20)).toBe(3);
    expect(home(s, 12)).toBe(1);
    expect(home(s, 44)).toBe(4);
  });

  it('odešlá se nevrací – jen jako nová hlavní manželka', () => {
    const s = trackedVillage(
      crowdedManor,
      [1, 2, 3, 4, 5].map((id) => dwelling(id)),
    );
    occupyEmptyDwellings(s, DAY);
    // dvorec se uvolní (děti hlavní manželky odejdou ze hry) – vedlejší manželka zůstává ve svém
    s.people = s.people.filter((p) => ![31, 32, 33, 34].includes(p.id));
    for (let d = DAY + 1; d < DAY + 60; d++) {
      occupyEmptyDwellings(s, d);
      dynastyDay(s, d);
    }
    expect(home(s, 12)).toBe(4);
    // po smrti hlavní manželky je hlavní matka nejstaršího syna se živou matkou – přestěhuje se
    removePeople(s, new Set([11]));
    dynastyDay(s, DAY + 60);
    expect(home(s, 12)).toBe(1);
    expect(home(s, 30)).toBe(1);
  });

  it('ves bez rodu – settlingFamilies je leavingFamilies', () => {
    for (const specs of [crowdedManor, marriedSons]) {
      const s = untracked(
        trackedVillage(
          specs,
          [1, 2, 3].map((id) => dwelling(id)),
        ),
      );
      expect(settlingFamilies(s, DAY)).toEqual(leavingFamilies(s, DAY));
    }
  });
});

describe('vedlejší manželka z přeplněného domu (lord.md – Manželky – Bydlení)', () => {
  /** Dvorec: vojvoda, hlavní 11, vedlejší 12 (dcera), 13 (syn 9 let), 14 (syn 11 let). */
  const wives = (sonOf13 = 9, extra: KinSpec[] = []): KinSpec[] => [
    ...couple({ id: LORD, age: 40 }, { id: 11, age: 35 }),
    { id: 12, age: 30, sex: 'female', spouse: LORD },
    child(33, 10, 12),
    { id: 13, age: 28, sex: 'female', spouse: LORD },
    child(34, sonOf13, 13, 'male'),
    { id: 14, age: 26, sex: 'female', spouse: LORD },
    child(35, 11, 14, 'male'),
    ...extra,
  ];
  const manor = (s: VillageState) => s.dwellings[0]!;

  it('odchází ta s nejstarším synem, po jedné, dokud je dům přeplněný', () => {
    const s = trackedVillage(wives());
    expect(heads(secondaryWifeFamilies(s, manor(s), DAY))).toEqual([14]);
    expect(secondaryWifeFamilies(s, manor(s), DAY)[0]?.people.map((p) => p.id)).toEqual([14, 35]);
    // víc přeplněný: syn 11 let, syn 9 let, pak bez syna
    const more = trackedVillage(
      wives(
        9,
        [1, 2, 3].map((age) => child(36 + age, age, 11)),
      ),
    );
    expect(heads(secondaryWifeFamilies(more, manor(more), DAY))).toEqual([14, 13, 12]);
  });

  it('při shodě věku synů nejdéle vdaná (nižší id)', () => {
    const s = trackedVillage(wives(11));
    expect(heads(secondaryWifeFamilies(s, manor(s), DAY))).toEqual([13]);
  });

  it('z plného, ne přeplněného domu neodchází; ve vsi bez rodu nikdy', () => {
    const full = trackedVillage(wives().filter((k) => k.id !== 33 && k.id !== 34));
    expect(secondaryWifeFamilies(full, manor(full), DAY)).toEqual([]);
    const old = untracked(trackedVillage(wives()));
    expect(secondaryWifeFamilies(old, manor(old), DAY)).toEqual([]);
  });

  it('čeká na dům („Rodina čeká na dům“) – zbytky jam po obydlích nebere', () => {
    const s = trackedVillage(
      wives().filter((k) => k.id !== 34),
      [dwelling(1)],
      {
        ruins: [{ id: 2, type: 'zemnice', position: dwelling(2).position, day: DAY - 10 }],
      },
    );
    expect(waitingHouseholds(s, DAY)).toBe(1);
    occupyEmptyDwellings(s, DAY);
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    const roomy = trackedVillage(wives().filter((k) => ![33, 34, 35].includes(k.id)));
    expect(waitingHouseholds(roomy, DAY)).toBe(0);
  });
});

describe('dům vedlejší manželky (lord.md – Manželky – Dům vedlejší manželky)', () => {
  it('drží ho ona, nejstarší ženatý syn je dědic, ostatní odcházejí', () => {
    const s = trackedVillage([
      ...couple({ id: LORD, age: 50 }, { id: 11, age: 45 }),
      { id: 12, age: 45, sex: 'female', spouse: LORD, home: 2 },
      ...couple(
        { id: 30, age: 24, mother: 12, father: LORD, home: 2 },
        { id: 36, age: 22, home: 2 },
      ),
      ...couple(
        { id: 37, age: 21, mother: 12, father: LORD, home: 2 },
        { id: 38, age: 20, home: 2 },
      ),
      { ...child(39, 10, 12), home: 2 },
    ]);
    expect(familiesOf(s, s.dwellings[1]!, DAY).map((f) => f.people.map((p) => p.id))).toEqual([
      [37, 38],
    ]);
  });

  it('samotné děti jdou k otci, i do přeplněného dvorce', () => {
    const specs: KinSpec[] = [
      ...couple({ id: LORD, age: 40 }, { id: 11, age: 35 }),
      ...[31, 32, 33, 34, 35].map((id, i) => child(id, 2 + 2 * i, 11)),
      { ...child(50, 10, 12), home: 2 },
      { ...child(51, 8, 12), home: 2 },
      ...couple(
        { id: 20, age: 20, mother: 11, father: LORD, home: 3 },
        { id: 21, age: 19, home: 3 },
      ),
    ];
    const s = trackedVillage(specs);
    populationDay(s, DAY + 1, 1);
    const orphans = s.people.filter((p) => p.motherId === 12);
    expect(orphans.length).toBeGreaterThan(0);
    for (const o of orphans) expect(o.dwellingId).toBe(1);
    // ves bez rodu – k nevlastnímu bratrovi do domu s nejvíc místy, jako dosud
    const old = untracked(trackedVillage(specs));
    populationDay(old, DAY + 1, 1);
    for (const o of old.people.filter((p) => p.motherId === 12)) expect(o.dwellingId).toBe(3);
  });
});
