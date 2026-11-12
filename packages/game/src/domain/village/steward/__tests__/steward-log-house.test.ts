import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { waitingHouseholds } from '../../people/households';
import { logHouseWaiting } from '../../people/log-house-settle';
import { STEWARD } from '../../rules/rules-steward';
import { stewardDay } from '../steward';
import { newSteward } from '../steward-state';
import { planSettlement } from '../steward-plan';
import { couple, kin } from '../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import type { VillageState } from '../../types';

// Správce a nadzemní dům (log-house.md – Správce; steward.md – Obydlí).

const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const onStewardDay = (day: number): number =>
  Math.ceil(day / STEWARD.everyDays) * STEWARD.everyDays;
const Y810 = onStewardDay(dayIndexOf({ year: 810, month: 3, day: 1 }));
const Y799 = onStewardDay(dayIndexOf({ year: 799, month: 3, day: 1 }));

/**
 * Ves se stojící zemnicí a hotovým plánem; v ní ženatý kněz (rodina z pořadí, zároveň čekající
 * domácnost – dvojí stavba) nebo, s `priest = false`, obyčejný mladý pár.
 */
function waiting(day: number, priest = true): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const founded = foundVillage({
    seed: 4242,
    day,
    dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
  });
  let s = withBuiltFirstDwelling({ ...founded, steward: newSteward(day, true) });
  const home = s.dwellings[0]!.id;
  s.people.push(
    ...couple({ id: 900, age: 30, home }, { id: 901, age: 27, home }).map((k) => kin(k, day)),
  );
  if (priest) s.people.find((p) => p.id === 900)!.priest = true;
  for (let k = 0; k < 10 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  return s;
}

const newHouses = (s: VillageState): { type: string | null }[] =>
  s.constructions
    .filter((c) => c.kind === 'dwelling' && c.dwellingId === null)
    .map((c) => ({ type: c.dwellingType }));

describe('správce – nadzemní dům', () => {
  it('v roce 810 s rodinou z pořadí začne srub na pozemku', () => {
    const s = waiting(Y810);
    expect(logHouseWaiting(s, s.lastDay)).toBe(1);
    stewardDay(s, Y810, landscape, obstacles);
    const houses = s.constructions.filter((c) => c.kind === 'dwelling' && c.dwellingId === null);
    expect(houses.map((c) => c.dwellingType)).toEqual(['srub']);
    expect(houses[0]!.plot).toBeDefined();
  });

  it('dvojí stavba: pro rodinu ze srubu se nezačne i polozemnice', () => {
    const s = waiting(Y810);
    expect(waitingHouseholds(s, s.lastDay)).toBe(1);
    stewardDay(s, Y810, landscape, obstacles);
    // po prvním srubu stavby dál nepřibývají, ani o dva dny správce později
    stewardDay(s, Y810 + STEWARD.everyDays, landscape, obstacles);
    expect(newHouses(s)).toEqual([{ type: 'srub' }]);
  });

  it('s rozestavěným srubem nezačne další', () => {
    const s = waiting(Y810);
    stewardDay(s, Y810, landscape, obstacles);
    const before = structuredClone(s.constructions);
    stewardDay(s, Y810 + STEWARD.everyDays, landscape, obstacles);
    expect(s.constructions).toEqual(before);
  });

  it('s prázdným srubem nezačne další', () => {
    const s = waiting(Y810);
    s.dwellings.push({ ...s.dwellings[0]!, id: 777, type: 'srub' });
    stewardDay(s, Y810, landscape, obstacles);
    expect(newHouses(s).some((h) => h.type === 'srub')).toBe(false);
  });

  it('v roce 799 srub nezačne – obydlí jako dosud', () => {
    const s = waiting(Y799);
    stewardDay(s, Y799, landscape, obstacles);
    expect(newHouses(s).some((h) => h.type === 'srub')).toBe(false);
    expect(newHouses(s)).toHaveLength(1);
  });

  it('bez lidí z pořadí srub nezačne, obyčejná rodina dostane polozemnici nebo zemnici', () => {
    const s = waiting(Y810, false);
    expect(logHouseWaiting(s, s.lastDay)).toBe(0);
    stewardDay(s, Y810, landscape, obstacles);
    const houses = newHouses(s);
    expect(houses).toHaveLength(1);
    expect(houses[0]!.type).not.toBe('srub');
  });

  it('nedostatek dřeva – srub nezačne', () => {
    const s = waiting(Y810);
    s.woodLogs = 0;
    // krajina bez stromů ke kácení
    stewardDay(s, Y810, landscape, { ...obstacles, count: 0 });
    expect(newHouses(s).some((h) => h.type === 'srub')).toBe(false);
  });
});
