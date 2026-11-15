import { describe, expect, it } from 'vitest';
import { migrateVillage } from '../../core/migrations';
import { advanceVillage } from '../../core/simulate';
import { checkPersonName } from '../dynasty-names';
import { nameUnnamed, personName, withPeopleNames } from '../people-names';
import { populationDay } from '../population';
import { FEMALE_NAMES, LINE_NAMES, MALE_NAMES } from '../../rules';
import type { ChronicleEvent, Person, VillageState } from '../../types';
import {
  DAY,
  LINE_LORD_ID,
  YEAR,
  couple,
  dwelling,
  kin,
  trackedVillage,
  village,
} from '../../__tests__/kin-fixtures';

// Jména všech lidí (population.md – Jména; Martin 15. 11. 2026: „Kdyby měli jména všichni
// vesničané, bylo by to super“ – „Ano“).

const namesOf = (p: Person): readonly string[] => (p.sex === 'female' ? FEMALE_NAMES : MALE_NAMES);
const byId = (s: VillageState, id: number): Person | undefined => s.people.find((p) => p.id === id);

/** Tři mladé páry ve dvou domech se zásobou – rodí se děti. */
function youngVillage(): VillageState {
  return village(
    [
      ...couple({ id: 1, age: 22 }, { id: 2, age: 20 }),
      ...couple({ id: 3, age: 25, home: 2 }, { id: 4, age: 21, home: 2 }),
      ...couple({ id: 5, age: 28, home: 2 }, { id: 6, age: 24, home: 2 }),
    ].map((k) => kin(k)),
    [dwelling(1, 'polozemnice'), dwelling(2, 'polozemnice')],
    { storesKg: 60_000 },
  );
}

describe('seznamy jmen (population.md – Jména)', () => {
  it('mužská obsahují jména mužů rodu; žádné jméno dvakrát ani v obou seznamech', () => {
    for (const name of LINE_NAMES) expect(MALE_NAMES).toContain(name);
    expect(MALE_NAMES.length).toBeGreaterThanOrEqual(80);
    expect(FEMALE_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MALE_NAMES).size).toBe(MALE_NAMES.length);
    expect(new Set(FEMALE_NAMES).size).toBe(FEMALE_NAMES.length);
    const male = new Set(MALE_NAMES);
    expect(FEMALE_NAMES.filter((n) => male.has(n))).toEqual([]);
  });

  it('jen písmena s velkým prvním (NFC); konce, ze kterých jdou pády pravidlem', () => {
    for (const name of [...MALE_NAMES, ...FEMALE_NAMES]) {
      expect(checkPersonName(name).ok).toBe(true);
      expect(name.normalize('NFC')).toBe(name);
      expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());
    }
    // mužská souhláskou nebo -a; ženská -a po tvrdé či obojetné souhlásce, nebo -e (Libuše)
    for (const name of MALE_NAMES) expect(name).toMatch(/(?:[^aeiouyáéíóúůýě]|a)$/u);
    for (const name of FEMALE_NAMES) {
      expect(name).toMatch(/(?:[^žščřcjďťňaeiouyáéíóúůýě]a|[^aeiouyáéíóúůýě]e)$/u);
    }
  });
});

describe('personName – jméno podle pohlaví ze seedu vsi a id', () => {
  it('ze seznamu pohlaví, deterministicky; jiný seed vsi jiná jména', () => {
    const s = village([
      kin({ id: 1, age: 30, sex: 'male' }),
      kin({ id: 2, age: 28, sex: 'female' }),
    ]);
    const him = personName(s, { id: 1, sex: 'male' });
    expect(MALE_NAMES).toContain(him);
    expect(FEMALE_NAMES).toContain(personName(s, { id: 2, sex: 'female' }));
    expect(personName(structuredClone(s), { id: 1, sex: 'male' })).toBe(him);
    const names = (seed: number): string[] =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((id) => personName({ ...s, seed }, { id, sex: 'male' }));
    expect(names(1)).not.toEqual(names(2));
  });

  it('jméno, které nosí někdo žijící, dostane jen při vyčerpaném seznamu', () => {
    const living = (names: readonly string[]): VillageState =>
      village(names.map((name, i) => ({ ...kin({ id: 100 + i, age: 30, sex: 'female' }), name })));
    expect(personName(living(FEMALE_NAMES.slice(1)), { id: 1, sex: 'female' })).toBe(
      FEMALE_NAMES[0],
    );
    expect(FEMALE_NAMES).toContain(personName(living(FEMALE_NAMES), { id: 1, sex: 'female' }));
  });
});

describe('převod people-names a nameUnnamed', () => {
  function oldVillage(): VillageState {
    const s = trackedVillage([
      ...couple({ id: LINE_LORD_ID, age: 40 }, { id: 11, age: 35 }),
      { id: 12, age: 16, sex: 'male', father: LINE_LORD_ID, mother: 11 },
      { id: 13, age: 14, sex: 'female', father: LINE_LORD_ID, mother: 11 },
      { id: 14, age: 12, sex: 'male', father: LINE_LORD_ID, mother: 11 },
      ...couple({ id: 20, age: 50, home: 2 }, { id: 21, age: 45, home: 2 }),
    ]);
    byId(s, 12)!.name = 'Bořivoj';
    return s;
  }

  it('jméno dostanou všichni bez jména; muž rodu svoje nemění, bez jména čeká na hráče', () => {
    const s = oldVillage();
    const before = structuredClone(s);
    const next = withPeopleNames(s);
    expect(s).toEqual(before);
    expect(byId(next, 12)?.name).toBe('Bořivoj');
    expect(byId(next, LINE_LORD_ID)?.name).toBeUndefined();
    expect(byId(next, 14)?.name).toBeUndefined();
    for (const id of [11, 13, 20, 21]) {
      const p = byId(next, id)!;
      expect(namesOf(p)).toContain(p.name);
    }
    const names = next.people.flatMap((p) => (p.name === undefined ? [] : [p.name]));
    expect(new Set(names).size).toBe(names.length);
  });

  it('idempotentní – podruhé týž objekt; v seznamu převodů i při dopočtu', () => {
    const next = withPeopleNames(oldVillage());
    expect(withPeopleNames(next)).toBe(next);
    expect(nameUnnamed(structuredClone(next))).toBe(false);
    const migrated = migrateVillage(oldVillage(), { obstacles: null, landscape: null });
    expect(migrated.people.map((p) => p.name)).toEqual(next.people.map((p) => p.name));
  });
});

describe('jméno při narození a příchodu', () => {
  it('narozené dítě má jméno svého pohlaví, zápis narození ho nese', () => {
    const s = youngVillage();
    const events: ChronicleEvent[] = [];
    for (let d = DAY + 1; d < DAY + Math.round(4 * YEAR); d++)
      events.push(...populationDay(s, d, 1));
    const children = s.people.filter((p) => p.bornDay > DAY);
    expect(children.length).toBeGreaterThan(2);
    for (const child of children) expect(namesOf(child)).toContain(child.name);
    const births = events.filter(
      (e): e is Extract<ChronicleEvent, { kind: 'birth' }> => e.kind === 'birth',
    );
    expect(births).toHaveLength(children.length);
    for (const child of children) {
      const birth = births.find((e) => e.day === child.bornDay && e.name === child.name);
      expect(birth?.female === true).toBe(child.sex === 'female');
    }
  });

  it('kdo přijde bez jména (schránka, starší ves), dostane ho týž den', () => {
    const s = withPeopleNames(youngVillage());
    s.people.push(kin({ id: 50, age: 19, sex: 'female', home: 2 }));
    const next = advanceVillage(s, DAY + 1, null);
    expect(FEMALE_NAMES).toContain(byId(next, 50)?.name);
  });

  it('jména nezávisí na kouscích dopočtu (vcelku = po kouscích = po dnech s JSON)', () => {
    const s = youngVillage();
    const end = DAY + Math.round(2 * YEAR);
    const whole = advanceVillage(s, end, null);
    let pieces = s;
    while (pieces.lastDay < end) {
      pieces = advanceVillage(pieces, Math.min(end, pieces.lastDay + 37), null);
    }
    let daily = s;
    while (daily.lastDay < end) {
      daily = JSON.parse(
        JSON.stringify(advanceVillage(daily, daily.lastDay + 1, null)),
      ) as VillageState;
    }
    const names = (v: VillageState): [number, string | undefined][] =>
      v.people.map((p) => [p.id, p.name]);
    // ve vsi se za dva roky narodily děti
    expect(whole.chronicle.some((e) => e.kind === 'birth' && e.name !== undefined)).toBe(true);
    expect(names(pieces)).toEqual(names(whole));
    expect(names(daily)).toEqual(names(whole));
    expect(pieces.chronicle).toEqual(whole.chronicle);
  });
});
