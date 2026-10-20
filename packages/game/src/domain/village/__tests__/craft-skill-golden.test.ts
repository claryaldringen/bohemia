import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { advanceVillage } from '../simulate';
import type { Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Učení řemesla a kování vozů (crafts.md – Učení řemesla, wagons.md – Kování vozů): ves bez dílen
// se nemění bit po bitu – lidé nemají praxi, vůz se spřežením jezdí jako dřív. Otisk stavu po dvou
// letech je spočítaný kódem před učením řemesla (commit před zavedením praxe).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(601, 3, 1);

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

const person = (id: number, years: number, dwellingId: number, sex: Person['sex']): Person => ({
  id,
  bornDay: DAY - Math.ceil(years * 365.25) - 10,
  dwellingId,
  sex,
});

/** Ves bez dílen – jedna domácnost, nástroje a nádoby koupené dřív, spřežení s vozem. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 30, 1, 'male'),
    person(3, 28, 1, 'female'),
    person(4, 12, 1, 'male'),
    person(5, 16, 1, 'male'),
    person(6, 9, 1, 'female'),
  ];
  s.constructions = [];
  s.storesKg = 8_000;
  s.lastDay = DAY;
  s.nextId = 1000;
  s.crafts = { charcoalKg: 0, toolsKg: 10, potteryKg: 10 };
  s.pens = [
    {
      id: 900,
      cell: { x: 8, y: 9 },
      x: -22.5,
      z: -7.5,
      builtDay: DAY - 800,
      team: { readyDay: DAY - 10 },
      training: null,
    },
  ];
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
  return s;
}

describe('ves bez dílen beze změny (crafts.md – Učení řemesla)', () => {
  it('stav po dvou letech jako před učením řemesla a kováním vozů', () => {
    const next = advanceVillage(village(), DAY + 730, null);
    expect(next.people.length).toBeGreaterThan(3);
    expect(next.people.some((p) => 'practice' in p)).toBe(false);
    expect(hash(JSON.stringify(next))).toBe('4b528a0a');
  }, 120_000);
});
