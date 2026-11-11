import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { inDisasterProtection, yearSchedule } from '../disasters';
import { localDisastersDay } from '../local-disasters';
import type { ChronicleEvent, Dwelling, VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Ochrana nové vsi (disasters.md – Kraj a ochrana nové vsi; Martin 27. 10. 2026: „Pětiletou
// ochranu“) pro všechny místní pohromy rámce `localDisastersDay` – P9 (smršť) přidá svůj druh
// do `KINDS`.

const YEAR = 365.25;
const SEED = 7;
const KINDS: readonly ChronicleEvent['kind'][] = ['hail', 'flood', 'fire'];
/** Rovina těsně u potoka (sloupec 0) – každá voda kraje zatopí domy uvnitř mapy. */
const LOWLAND = makeLandscape({ size: 128, surface: (x) => (x === 0 ? 'water' : 'meadow') });

/** Ves založená dne `founded` s mnoha vzdálenými domy (požár ≈ jednou za rok). */
function village(founded: number): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed: SEED, day: founded, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const first = base.dwellings[0]!;
  base.dwellings = Array.from({ length: 250 }, (_, i): Dwelling => ({
    ...first,
    id: i + 1,
    position: { x: i * 100, z: 0, rotation: 0 },
  }));
  base.people = [];
  base.weatherSeed = 12345;
  return base;
}

/** Druhy místních pohrom ve vsi založené `founded` mezi roky vsi `from` a `to`. */
function kindsIn(founded: number, from: number, to: number): Set<string> {
  const state = village(founded);
  const kinds = new Set<string>();
  for (let day = Math.ceil(founded + from * YEAR); day < founded + to * YEAR; day++) {
    for (const e of localDisastersDay(state, day, LOWLAND, null)) kinds.add(e.kind);
  }
  return kinds;
}

describe('ochrana nové vsi', () => {
  it('prvních 5 let', () => {
    const founded = dayIndexOf({ year: 500, month: 1, day: 1 });
    expect(inDisasterProtection(founded, founded)).toBe(true);
    expect(inDisasterProtection(founded, founded + Math.floor(5 * YEAR) - 1)).toBe(true);
    expect(inDisasterProtection(founded, founded + Math.ceil(5 * YEAR))).toBe(false);
  });

  it('kroupy: ves ve 3. roce nic, v 6. roce ano', () => {
    const year = Array.from({ length: 400 }, (_, i) => 520 + i).find(
      (y) => yearSchedule(SEED, y).hail !== null,
    )!;
    const day = yearSchedule(SEED, year).hail!.day;
    const hailOn = (founded: number): boolean =>
      localDisastersDay(village(founded), day, null, null).some((e) => e.kind === 'hail');
    expect(hailOn(Math.round(day - 2.5 * YEAR))).toBe(false);
    expect(hailOn(Math.round(day - 5.5 * YEAR))).toBe(true);
  });

  it('žádná místní pohroma prvních 5 let, po nich všechny druhy rámce', () => {
    const founded = dayIndexOf({ year: 500, month: 1, day: 1 });
    expect(kindsIn(founded, 0, 5).size).toBe(0);
    // kroupy jsou vzácné (6 % ročně) – hledá se dost dlouho, požár velké vsi je skoro každý rok
    const later = kindsIn(founded, 5, 40);
    for (const kind of KINDS) expect(later.has(kind)).toBe(true);
  });
});
