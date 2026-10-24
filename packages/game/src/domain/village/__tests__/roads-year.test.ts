import { describe, expect, it, vi } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { abandonmentCheck, visitKey } from '../abandonment';
import { emptyRoads } from '../paths/roads-form';
import { roadsDay } from '../paths/roads';
import { accrueVisits, withVisitsSeed } from '../paths/wear';
import type { StoredRoute, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Konec roční sítě pěšin (plán cest v2, Úloha 6): 1. 11. se síť pěšin nepočítá, provoz ke stavbám
// (chátrání staveb) jde z uložených tras po intervalech a starší ves rozhoduje až po roce dat.

vi.mock('../paths/network', async (original) => {
  const actual = await original<typeof import('../paths/network')>();
  return { ...actual, computePathNetwork: vi.fn(actual.computePathNetwork) };
});

const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
const Y0 = NOV1(600);
const Y1 = NOV1(601);

function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: Y0 - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = Y0;
  s.roads = emptyRoads(Y0);
  return s;
}

const route = (visit: string, trips: number): StoredRoute => ({
  from: 'd:1',
  to: visit,
  purpose: 'visit',
  trips,
  start: [0, 0],
  steps: '',
  visit,
});

describe('1. 11. bez roční sítě pěšin', () => {
  it('roční kontrola nepočítá síť pěšin, ale vrátí provoz ke stavbám z tras', async () => {
    const { computePathNetwork } = await import('../paths/network');
    const s = village();
    accrueVisits(s.roads!, [route('idol:7', 50)], 365);
    vi.mocked(computePathNetwork).mockClear();
    s.roads!.labor.days = 365;
    const visits = roadsDay(s, Y1, LANDSCAPE, null);
    expect(computePathNetwork).not.toHaveBeenCalled();
    expect(visits!.get('idol:7')).toBeCloseTo(0.5, 1);
    // součty začínají znovu
    expect(s.roads!.visits).toEqual({ from: Y1, byKey: [] });
  }, 60_000);

  it('provoz ke hřbitovu: úmrtí za poslední rok je návštěva, bez úmrtí a tras ne', () => {
    const run = (deathDay: number | null): ReadonlyMap<string, number> => {
      const s = village();
      s.cemeteries = [
        { id: 3, squares: [], squareSizeM: 5, graves: 0 },
      ] as unknown as VillageState['cemeteries'];
      if (deathDay !== null) s.chronicle.push({ day: deathDay, kind: 'death', group: 'adult' });
      s.roads!.labor.days = 365;
      return roadsDay(s, Y1, LANDSCAPE, null)!;
    };
    expect(run(Y1 - 100).get(visitKey('cemetery', 3))).toBeGreaterThan(0);
    expect(run(Y1 - 400).get(visitKey('cemetery', 3))).toBeUndefined();
    expect(run(null).get(visitKey('cemetery', 3))).toBeUndefined();
  }, 60_000);

  it('provoz k ohradě z tras (pen:) se vrátí a součty se nulují', () => {
    const s = village();
    accrueVisits(s.roads!, [route(visitKey('pen', 4), 73)], 365);
    s.roads!.labor.days = 365;
    const visits = roadsDay(s, Y1, LANDSCAPE, null)!;
    expect(visits.get(visitKey('pen', 4))).toBeCloseTo(0.73, 2);
    expect(visits.get(visitKey('pen', 5))).toBeUndefined();
    expect(s.roads!.visits).toEqual({ from: Y1, byKey: [] });
  }, 60_000);

  it('opuštěná modla bez návštěv začne chátrat, navštěvovaná ne', () => {
    const s = village();
    s.sacredBuildings = [
      { id: 7, kind: 'idol', position: { x: 20, z: 20 }, builtDay: Y0 - 3000 },
      { id: 8, kind: 'idol', position: { x: 30, z: 20 }, builtDay: Y0 - 3000 },
    ] as VillageState['sacredBuildings'];
    accrueVisits(s.roads!, [route('idol:7', 50)], 365);
    s.roads!.labor.days = 365;
    const visits = roadsDay(s, Y1, LANDSCAPE, null)!;
    abandonmentCheck(s, Y1, visits);
    const [seen, ignored] = s.sacredBuildings!;
    expect(seen!.wear?.abandonedDay).toBeUndefined();
    expect(ignored!.wear?.abandonedDay).toBe(Y1);
  }, 60_000);

  it('starší ves bez provozu ke stavbám nechátrá dřív než za rok dat', () => {
    const s = village();
    delete s.roads!.visits;
    s.lastDay = Y0 + 100;
    const seeded = withVisitsSeed(s);
    expect(seeded.roads!.visits).toEqual({ from: Y0 + 101, byKey: [] });
    // idempotentně
    expect(withVisitsSeed(seeded)).toBe(seeded);
    seeded.roads!.labor.days = 365;
    // první 1. 11. po převodu: méně než rok dat – rozhodnutí nepadne, součty se nenulují
    expect(roadsDay(seeded, Y1, LANDSCAPE, null)).toBeNull();
    expect(seeded.roads!.visits!.from).toBe(Y0 + 101);
    // o rok později je rok dat
    seeded.roads!.labor.days = 365;
    expect(roadsDay(seeded, NOV1(602), LANDSCAPE, null)).not.toBeNull();
  }, 60_000);

  it('provoz ke stavbám po 1 / 7 / 30 dnech je totéž co najednou', () => {
    const routes = [route('idol:7', 50), route('cemetery:2', 13)];
    const once = emptyRoads(Y0);
    accrueVisits(once, routes, 210);
    for (const step of [1, 7, 30]) {
      const parts = emptyRoads(Y0);
      for (let done = 0; done < 210; done += step) {
        accrueVisits(parts, routes, Math.min(step, 210 - done));
      }
      expect(parts.visits).toEqual(once.visits);
    }
    expect(visitKey('idol', 7)).toBe('idol:7');
  });
});
