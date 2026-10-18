import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { roadLengthM } from '../paths/roads';
import { ROAD_UPGRADES } from '../rules';
import { advanceVillage } from '../simulate';
import {
  DIRECTIONS,
  TRAIL_BLOCKED,
  TRAIL_BUILDING,
  TRAIL_EXISTS,
  finishTrail,
  planTrail,
  startTrail,
  trailOptions,
  trailRoutes,
  trailTripDays,
  trailWorkFront,
} from '../trail';
import type { VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Zemská stezka (trade.md – Zemská stezka). Krajina testu pěšin: louka 300 × 300 m se středem
// v počátku, řada vodních políček přes celou šířku na z ∈ (75, 90) – na sever stezka nevede.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const HALF = 150;

function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  return s;
}

describe('trasa stezky ke kraji mapy', () => {
  it('na jih vede ke kraji v rozmezí směru, na sever přes vodu bez brodu nevede', () => {
    const routes = trailRoutes(LANDSCAPE, null, { x: 0, z: -6 }, []);
    const south = routes.s!;
    expect(south).not.toBeNull();
    const end = south.at(-1)!;
    expect(end.z).toBeLessThan(-(HALF - 10 - 20) + 0.5);
    expect(Math.abs(end.x)).toBeLessThan(Math.abs(end.z));
    expect(south[0]).toEqual({ x: 0, z: -6 });
    expect(routes.n).toBeNull();
    // na severovýchod jen k východnímu kraji pod vodou (širší rozmezí směru)
    expect(routes.ne!.at(-1)!.x).toBeGreaterThan(HALF - 30.5);
    expect(routes.ne!.at(-1)!.z).toBeLessThan(75);
    expect(routes.e).not.toBeNull();
    expect(routes.e!.at(-1)!.x).toBeGreaterThan(HALF - 30.5);
    // stejný dotaz jde z mezipaměti – stejný objekt
    expect(trailRoutes(LANDSCAPE, null, { x: 0, z: -6 }, [])).toBe(routes);
  });

  it('dny cesty nosičů: 2–6 dní podle délky stezky + 1 den za krajem mapy', () => {
    expect(trailTripDays(150)).toBe(3);
    expect(trailTripDays(400)).toBe(3);
    expect(trailTripDays(401)).toBe(4);
    expect(trailTripDays(900)).toBe(5);
    expect(trailTripDays(5000)).toBe(7);
  });
});

describe('stavba stezky', () => {
  it('osa se uloží jako pevné cesty, cena = upravená cesta po celé délce', () => {
    const s = village();
    const plan = planTrail(s, 's', DAY, LANDSCAPE, null);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pieces.length).toBeGreaterThan(0);
    expect(plan.pieces.every((p) => p.grade === 'improved')).toBe(true);
    const roads = plan.state.roads!.roads;
    const length = plan.pieces.reduce(
      (sum, p) => sum + roadLengthM(roads.find((r) => r.id === p.roadId)!),
      0,
    );
    expect(plan.laborManDays).toBeCloseTo((ROAD_UPGRADES.improvedManDaysPer100M * length) / 100, 0);
    // plán vstupní stav nemění
    expect(s.roads?.roads.length ?? 0).toBe(0);
    const next = startTrail(s, DAY, 's', LANDSCAPE, null);
    expect(next.trails).toHaveLength(1);
    const c = next.constructions.find((x) => x.trail === next.trails![0]!.id)!;
    expect(c.kind).toBe('road');
    expect(c.roadIds).toEqual(plan.pieces.map((p) => p.roadId));
    expect(c.cost).toBe(plan.laborManDays);
  });

  it('kde už upravená cesta vede, platí se jen zbytek', () => {
    const s = village();
    const full = planTrail(s, 's', DAY, LANDSCAPE, null);
    if (!full.ok) throw new Error('stezka');
    const withRoad = village();
    withRoad.roads = structuredClone(full.state.roads!);
    for (const road of withRoad.roads.roads) road.grade = 'improved';
    const cheaper = planTrail(withRoad, 's', DAY, LANDSCAPE, null);
    if (!cheaper.ok) throw new Error('stezka');
    expect(cheaper.laborManDays).toBeLessThan(full.laborManDays * 0.2);
  });

  it('nabídka: 8 směrů, sever zahrazený, hotový a rozestavěný směr s důvodem', () => {
    const s = startTrail(village(), DAY, 's', LANDSCAPE, null);
    const options = trailOptions(s, DAY, LANDSCAPE, null);
    expect(options.map((o) => o.direction)).toEqual(DIRECTIONS);
    const by = Object.fromEntries(options.map((o) => [o.direction, o]));
    expect(by.n!.blocked).toBe(TRAIL_BLOCKED);
    expect(by.s!.status).toBe('building');
    expect(by.s!.blocked).toBe(TRAIL_BUILDING);
    expect(by.w!.blocked).toBeNull();
    expect(by.w!.laborManDays).toBeGreaterThan(0);
    expect(by.w!.tripDays).toBeGreaterThanOrEqual(3);
    expect(() => startTrail(s, DAY, 's', LANDSCAPE, null)).toThrow(TRAIL_BUILDING);
  });

  it('staví se po úsecích od vsi ven; hotová stezka je upravená a v kronice', () => {
    const s = startTrail(village(), DAY, 's', LANDSCAPE, null);
    const trail = s.trails![0]!;
    const c = s.constructions.find((x) => x.trail === trail.id)!;
    const half = trailWorkFront(trail, c, c.cost / 2);
    expect(half.finished).toBeLessThan(trail.pieces.length);
    expect(trailWorkFront(trail, c, c.cost).finished).toBe(trail.pieces.length);
    let later = s;
    for (let i = 0; i < 40 && !later.trails![0]!.builtDay; i++) {
      later = advanceVillage(later, later.lastDay + 20, null, LANDSCAPE);
    }
    const built = later.trails![0]!;
    expect(built.builtDay).not.toBeNull();
    const roads = later.roads!.roads.filter((r) => built.pieces.some((p) => p.roadId === r.id));
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.every((r) => r.grade === 'improved')).toBe(true);
    expect(later.chronicle.some((e) => e.kind === 'trail-built')).toBe(true);
    expect(trailOptions(later, later.lastDay, LANDSCAPE, null)[4]!.blocked).toBe(TRAIL_EXISTS);
  });

  it('dokončení nastaví stupně všem úsekům', () => {
    const s = startTrail(village(), DAY, 'e', LANDSCAPE, null);
    const c = s.constructions.find((x) => x.trail !== undefined)!;
    const events = finishTrail(s, c, DAY + 3);
    expect(events).toEqual([
      { day: DAY + 3, kind: 'trail-built', trailId: c.trail, direction: 'e' },
    ]);
    expect(s.trails![0]!.builtDay).toBe(DAY + 3);
  });

  it('nezávisí na kouscích dopočtu', () => {
    const s = startTrail(village(), DAY, 's', LANDSCAPE, null);
    const end = DAY + 200;
    const whole = advanceVillage(s, end, null, LANDSCAPE);
    let parts = s;
    for (const step of [1, 17, 90, 200]) parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    expect(parts).toEqual(whole);
  });
});
