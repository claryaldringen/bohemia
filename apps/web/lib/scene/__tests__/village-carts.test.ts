import { describe, expect, it } from 'vitest';
import type { SceneCart, SceneVillage } from '../../village-view';
import { penLayout } from '../pen-layout';
import { penHerds } from '../village-pens';
import { draftTeamsToday, drivingCarts, parkedCartSpot, villageCartPlans } from '../village-carts';

// Vozy ve vsi (wagons.md – fáze 3): kdo jede, kdo stojí u ohrady a že voli nejsou zároveň u vozu,
// u rádla a v ohradě.

const PEN = { x: 100, z: 50, size: 15 };
const layout = penLayout(PEN, { x: -1, z: 0 });
const pens = [{ id: 7, layout }];
const ROUTE = [
  { x: 92, z: 50 },
  { x: 60, z: 50 },
  { x: 40, z: 80 },
];

const cart = (over: Partial<SceneCart> = {}): SceneCart => ({
  id: 1,
  kind: 'two-wheel',
  x: PEN.x,
  z: PEN.z,
  condition: 1,
  job: null,
  ...over,
});
const hauling = (id: number, route = ROUTE): SceneCart =>
  cart({
    id,
    job: { activity: 'haul', target: { kind: 'field', id: 3, parts: [9] }, load: 'sheaves' },
    route,
  });

const village = (carts: SceneCart[], plough = false): SceneVillage => ({
  dwellings: [],
  fields: [],
  carts,
  pens: [
    {
      id: 7,
      cell: { x: 0, y: 0 },
      x: PEN.x,
      z: PEN.z,
      size: PEN.size,
      built: true,
      progress: 1,
      oxen: 2,
      trainees: 0,
      cows: 0,
    },
  ],
  ...(plough
    ? {
        labor: {
          day: 10,
          month: 4,
          people: { children: 0, adults: 4, elders: 0 },
          shares: [{ activity: 'plough', target: { kind: 'field', id: 3 }, manDays: 2 }],
        },
      }
    : {}),
});

describe('vozy ve vsi (village-carts.ts)', () => {
  it('jede jen vůz s úlohou a trasou; ostatní stojí u ohrady', () => {
    const v = village([hauling(1), cart({ id: 2 }), cart({ id: 3, job: hauling(3).job })]);
    expect(drivingCarts(v).map((c) => c.id)).toEqual([1]);
    const plans = villageCartPlans(v, pens, null);
    expect(plans).toHaveLength(3);
    expect('shuttle' in plans[0]!).toBe(true);
    expect('parked' in plans[1]!).toBe(true);
    // bez trasy (nedojede) stojí
    expect('parked' in plans[2]!).toBe(true);
    // bez ohrady se stojící vůz nekreslí
    expect(villageCartPlans(village([cart()]), [], null)).toEqual([]);
  });

  it('svoz v okně herního dne, výprava dokola a naložená tam i zpět, náklad podle úlohy', () => {
    const window = { startMs: 0, endMs: 86_000 };
    const trade = cart({
      id: 2,
      kind: 'four-wheel',
      job: { activity: 'trade', target: { kind: 'trail', id: 1 }, load: 'goods' },
      route: ROUTE,
    });
    const [haul, goods] = villageCartPlans(village([hauling(1), trade]), pens, window);
    expect(haul).toMatchObject({ kind: 'two-wheel', cargo: 'sheaves' });
    expect('shuttle' in haul! && haul.schedule.window).toEqual(window);
    expect(goods).toMatchObject({ kind: 'four-wheel', cargo: 'goods', loadedBothWays: true });
    expect('shuttle' in goods! && goods.schedule.window).toBeNull();
  });

  it('víc vozů na téže trase jede za sebou (posun fáze)', () => {
    const plans = villageCartPlans(village([hauling(1), hauling(2)]), pens, null);
    const phases = plans.map((p) => ('shuttle' in p ? p.schedule.phase : -1));
    expect(phases).toEqual([0, 0.5]);
  });

  it('stojící vozy venku u boční stěny ohrady, vedle sebe', () => {
    const a = parkedCartSpot(layout, 0);
    const b = parkedCartSpot(layout, 1);
    const half = PEN.size / 2;
    for (const spot of [a, b]) {
      const outside = Math.max(Math.abs(spot.x - PEN.x), Math.abs(spot.z - PEN.z));
      expect(outside).toBeGreaterThan(half + 1.5);
      expect(Math.hypot(spot.hx, spot.hz)).toBeCloseTo(1, 9);
    }
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2);
  });

  it('voli táhnou buď vůz, nebo rádlo – v ohradě nezůstanou ani nejsou u obojího', () => {
    // svoz a orba téhož dne: jediné spřežení jede s vozem, k rádlu žádné
    const both = village([hauling(1)], true);
    const draft = draftTeamsToday(both, 1);
    expect(draft).toEqual({ carts: 1, plough: 0 });
    expect(penHerds(both, draft.plough + draft.carts).get(7)?.oxen).toBe(0);
    // dvě spřežení: jedno vozí, druhé orá
    expect(draftTeamsToday(both, 2)).toEqual({ carts: 1, plough: 1 });
    // vůz stojí: voli v ohradě (bez orby), orba má spřežení
    const idle = village([cart()]);
    const rest = draftTeamsToday(idle, 1);
    expect(rest).toEqual({ carts: 0, plough: 1 });
    expect(penHerds(idle, 0).get(7)?.oxen).toBe(2);
  });
});
