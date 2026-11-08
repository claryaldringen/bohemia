import { describe, expect, it } from 'vitest';
import { nameLineMan } from '../dynasty';
import { nameWaitingSons } from '../dynasty-kin-names';
import { LINE_NAMES } from '../dynasty-names';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { advanceVillage } from '../simulate';
import { dynastyDay } from '../succession';
import type { Person, VillageState } from '../types';
import { DAY, dwelling, kin, village, type KinSpec } from './kin-fixtures';

// Jména synů po roce (absence.md – Jména synů): jméno po dědovi → strýci → pradědovi → jiném muži
// rodu → vygenerované; žijící nositel jména se přeskočí.

const line = (spec: KinSpec, name?: string): Person => ({
  ...kin(spec),
  line: true,
  ...(name === undefined ? {} : { name }),
});

/**
 * Vojvoda 12 (Svatobor) se ženou 21 a synem 13 (rok a půl, bez jména); otec vojvody 10 zemřel
 * (Radim), jeho bratr 14 žije (Mojmír), vojvodův bratr 15 zemřel (Slavoj).
 */
function family(extra: Partial<VillageState> = {}, boyAge = 1): VillageState {
  return village(
    [
      line({ id: 12, age: 35, sex: 'male', father: 10, home: 1 }, 'Svatobor'),
      { ...kin({ id: 21, age: 33, sex: 'female', spouse: 12 }) },
      line({ id: 13, age: boyAge, sex: 'male', mother: 21, father: 12 }),
      line({ id: 14, age: 40, sex: 'male', father: 9, home: 2 }, 'Mojmír'),
    ],
    [dwelling(1), dwelling(2)],
    {
      dynasty: {
        lordId: 12,
        lords: [{ id: 12, fromDay: 0 }],
        deceased: [
          { id: 10, name: 'Radim', fatherId: 9 },
          { id: 15, name: 'Slavoj', fatherId: 10 },
        ],
      },
      ...extra,
    },
  );
}
const boy = (s: VillageState): Person | undefined => s.people.find((p) => p.id === 13);

describe('jména synů po roce', () => {
  it('před uplynutím roku syn jméno nedostane', () => {
    const s = family({}, 0);
    expect(nameWaitingSons(s, DAY)).toEqual([]);
    expect(boy(s)?.name).toBeUndefined();
  });

  it('po roce dostane jméno po dědovi (zemřelém otci otce)', () => {
    const s = family();
    const events = dynastyDay(s, DAY);
    expect(boy(s)?.name).toBe('Radim');
    expect(boy(s)?.nameByHouse).toBe(true);
    expect(events).toContainEqual({
      day: DAY,
      kind: 'line-named',
      name: 'Radim',
      who: 'son',
      house: true,
      after: 'grandfather',
    });
  });

  it('bez děda dostane jméno po strýci (otcův bratr)', () => {
    const s = family();
    // dědeček 10 v rodě jméno nemá, strýc 15 (syn 10, bratr otce 12) zemřel jako Slavoj
    s.dynasty!.deceased = [
      { id: 10, fatherId: 9 } as unknown as { id: number; name: string },
      { id: 15, name: 'Slavoj', fatherId: 10 },
    ];
    const events = nameWaitingSons(s, DAY);
    expect(boy(s)?.name).toBe('Slavoj');
    expect(events[0]).toMatchObject({ after: 'uncle' });
  });

  it('přeskočí jméno, které nese žijící muž rodu', () => {
    const s = family();
    s.people.find((p) => p.id === 14)!.name = 'Radim';
    nameWaitingSons(s, DAY);
    // děd Radim žije v osobě 14 – přeskočen, strýc Slavoj následuje
    expect(boy(s)?.name).toBe('Slavoj');
  });

  it('bez příbuzných a jiných mužů rodu je jméno vygenerované', () => {
    const s = family();
    delete s.dynasty!.deceased;
    s.people = s.people.filter((p) => p.id !== 14);
    const events = nameWaitingSons(s, DAY);
    expect(LINE_NAMES).toContain(boy(s)?.name);
    expect(events[0]).toMatchObject({ kind: 'line-named', house: true });
    expect(events[0]).not.toHaveProperty('after');
  });

  it('hráč jméno od rodu jednou přepíše, jméno od hráče už ne', () => {
    const s = family();
    nameWaitingSons(s, DAY);
    const first = nameLineMan(s, 13, 'Bořivoj', DAY);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const b = boy(first.state);
    expect(b?.name).toBe('Bořivoj');
    expect(b?.nameByHouse).toBeUndefined();
    expect(nameLineMan(first.state, 13, 'Jaromír', DAY).ok).toBe(false);
  });

  it('syn pojmenovaný hráčem a vojvoda se nemění', () => {
    const s = family();
    s.people.find((p) => p.id === 13)!.name = 'Ctibor';
    s.people.find((p) => p.id === 12)!.name = undefined;
    expect(nameWaitingSons(s, DAY)).toEqual([]);
    expect(s.people.find((p) => p.id === 12)?.name).toBeUndefined();
  });

  it('je deterministické a nezávisí na stavu mimo seed a den', () => {
    const a = family();
    const b = family();
    delete a.dynasty!.deceased;
    delete b.dynasty!.deceased;
    a.people = a.people.filter((p) => p.id !== 14);
    b.people = b.people.filter((p) => p.id !== 14);
    nameWaitingSons(a, DAY);
    nameWaitingSons(b, DAY);
    expect(boy(a)?.name).toBe(boy(b)?.name);
  });

  it('výsledek dopočtu nezávisí na kouscích (syn bez jména po roce)', () => {
    const start = dayIndexOf({ year: 601, month: 3, day: 1 });
    const founded = foundVillage({
      seed: 11,
      day: start,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      lord: { name: 'Bořivoj' },
    });
    const end = start + 365 * 6;
    const whole = advanceVillage(founded, end, null);
    let pieces = founded;
    while (pieces.lastDay < end) {
      pieces = advanceVillage(pieces, Math.min(end, pieces.lastDay + 30), null);
    }
    const names = (v: VillageState): (string | undefined)[] =>
      v.people.filter((p) => p.line).map((p) => p.name);
    expect(names(pieces)).toEqual(names(whole));
    expect(pieces.chronicle.filter((e) => e.kind === 'line-named')).toEqual(
      whole.chronicle.filter((e) => e.kind === 'line-named'),
    );
  });
});
