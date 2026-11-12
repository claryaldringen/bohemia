import { describe, expect, it } from 'vitest';
import type { SceneCart, SceneVillage } from '../../village-view';
import {
  buildingCartParts,
  CART_BODY_LOW_M,
  CART_SCALE,
  cartPlanPose,
  cartLength,
  createCartPose,
  routeAt,
  shuttleAt,
  shuttleLeg,
  type CartShuttle,
  type RoutePoint,
} from '../cart-layout';
import { carpenterCartSpot } from '../craft-yard-layout';
import { penLayout } from '../pen-layout';
import { penHerds } from '../village-pens';
import {
  buildingCartPlans,
  draftTeamsToday,
  drivingCarts,
  parkedCartSpot,
  stoneCartLoadSpot,
  villageCartPlans,
} from '../village-carts';

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
    const plans = villageCartPlans(v, pens);
    expect(plans).toHaveLength(3);
    expect('shuttle' in plans[0]!).toBe(true);
    expect('parked' in plans[1]!).toBe(true);
    // bez trasy (nedojede) stojí
    expect('parked' in plans[2]!).toBe(true);
    // bez ohrady se stojící vůz nekreslí
    expect(villageCartPlans(village([cart()]), [])).toEqual([]);
  });

  it('svoz i výprava dokola tempem volů, výprava naložená tam i zpět, náklad podle úlohy', () => {
    const trade = cart({
      id: 2,
      kind: 'four-wheel',
      job: { activity: 'trade', target: { kind: 'trail', id: 1 }, load: 'goods' },
      route: ROUTE,
    });
    const [haul, goods] = villageCartPlans(village([hauling(1), trade]), pens);
    expect(haul).toMatchObject({ kind: 'two-wheel', cargo: 'sheaves' });
    expect(goods).toMatchObject({ kind: 'four-wheel', cargo: 'goods', loadedBothWays: true });
  });

  it('mimo svoz (Co vozy vozí): osivo naložené tam, uhlí zpátky, sudy na vodu tam i zpět', () => {
    const job = (load: 'goods' | 'water', outbound?: true): SceneCart =>
      cart({
        id: 1,
        job: {
          activity: 'haul',
          target: { kind: 'field', id: 3, parts: [9] },
          load,
          ...(outbound ? { outbound } : {}),
        },
        route: ROUTE,
      });
    const [seed] = villageCartPlans(village([job('goods', true)]), pens);
    expect(seed).toMatchObject({ cargo: 'goods', loadedOut: true });
    const [coal] = villageCartPlans(village([job('goods')]), pens);
    expect(coal).toMatchObject({ cargo: 'goods' });
    expect('loadedOut' in coal!).toBe(false);
    const [water] = villageCartPlans(village([job('water')]), pens);
    expect(water).toMatchObject({ cargo: 'water', loadedBothWays: true });
    // sudy jsou na voze celou cestu – prázdné tam, plné zpět
    for (let ms = 0; ms < 86_000; ms += 2000) {
      expect(cartPlanPose(water!, ms, createCartPose()).loaded).toBe(true);
    }
    // osivo: tam naložený, zpátky prázdný
    const pose = createCartPose();
    const shuttle = seed as CartShuttle;
    const L = shuttle.shuttle.route.length;
    const out = { s: 0, speed: 0, loaded: false };
    let sawOut = false;
    let sawBack = false;
    const [kiln] = villageCartPlans(
      village([
        cart({
          id: 1,
          job: { activity: 'haul', target: { kind: 'kiln', id: 5, x: 40, z: 80 }, load: 'goods' },
          route: ROUTE,
        }),
      ]),
      pens,
    );
    expect(kiln).toMatchObject({ cargo: 'goods' });
    for (let ms = 0; ms < 600_000; ms += 500) {
      cartPlanPose(seed!, ms, pose);
      const at = shuttleAt(shuttle.shuttle, shuttle.schedule, ms, out);
      if (at.speed > 0 && at.s < shuttle.shuttle.farM) {
        expect(pose.loaded).toBe(true);
        sawOut = true;
      } else if (at.speed > 0 && at.s > shuttle.shuttle.farM && at.s < L) {
        expect(pose.loaded).toBe(false);
        sawBack = true;
      }
    }
    expect(sawOut && sawBack).toBe(true);
  });

  it('vůz s kamenem: od stavby prázdný k lomu, nakládá na konci trasy, plný zpět na stavbu', () => {
    // trasa z cíle s `reverse` – od hromady u stavby (začátek) k lomu (konec)
    const stone = cart({
      id: 1,
      job: {
        activity: 'haul',
        target: { kind: 'quarry', id: 42 },
        load: 'stone',
        construction: 8,
      },
      route: ROUTE,
    });
    const [plan] = villageCartPlans(village([stone]), pens);
    expect(plan).toMatchObject({ id: 1, cargo: 'stone' });
    const shuttle = plan as CartShuttle;
    expect('loadedBothWays' in shuttle || 'loadedOut' in shuttle).toBe(false);
    // u lomu stojí na konci osy (ne uprostřed obratiště za ním)
    const end = ROUTE[ROUTE.length - 1]!;
    const at: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
    routeAt(shuttle.shuttle.route, shuttle.shuttle.farM, at);
    expect(Math.hypot(at.x - end.x, at.z - end.z)).toBeLessThan(0.5);
    // k lomu prázdný, zpět na stavbu plný, u stavby (začátek trasy) skládá
    const pose = createCartPose();
    const out = { s: 0, speed: 0, loaded: false };
    const legs = new Set<string>();
    for (let ms = 0; ms < 900_000; ms += 500) {
      cartPlanPose(plan!, ms, pose);
      const state = shuttleAt(shuttle.shuttle, shuttle.schedule, ms, out);
      const leg = shuttleLeg(shuttle.shuttle, state);
      legs.add(leg);
      if (leg === 'out') expect(pose.loaded).toBe(false);
      if (leg === 'back') expect(pose.loaded).toBe(true);
    }
    expect([...legs].sort()).toEqual(['back', 'load', 'out', 'unload']);
    // odnášeč v lomu nosí kámen k zadku vozu na konci trasy
    const spot = stoneCartLoadSpot(village([stone]), 42)!;
    const prev = ROUTE[ROUTE.length - 2]!;
    const behind = Math.hypot(spot.x - end.x, spot.z - end.z);
    expect(behind).toBeCloseTo(cartLength('two-wheel') + 0.7, 5);
    expect(Math.hypot(spot.x - prev.x, spot.z - prev.z)).toBeLessThan(
      Math.hypot(end.x - prev.x, end.z - prev.z),
    );
    // jiný lom, vůz bez trasy nebo bez podílu – k vozu se nenosí
    expect(stoneCartLoadSpot(village([stone]), 43)).toBeNull();
    expect(stoneCartLoadSpot(village([cart({ ...stone, route: [] })]), 42)).toBeNull();
    expect(stoneCartLoadSpot(village([cart()]), 42)).toBeNull();
    expect(villageCartPlans(village([cart()]), pens)[0]).toHaveProperty('parked');
  });

  it('víc vozů na téže trase jede za sebou (posun fáze)', () => {
    const plans = villageCartPlans(village([hauling(1), hauling(2)]), pens);
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

  it('vůl táhne buď vůz, nebo rádlo – v ohradě nezůstane ani není u obojího', () => {
    // svoz a orba téhož dne, dva voli: dvoukolák táhne jeden, k rádlu pár nezbude, druhý v ohradě
    const both = village([hauling(1)], true);
    const draft = draftTeamsToday(both, 1);
    expect(draft).toEqual({ carts: 1, cartOxen: 1, plough: 0 });
    expect(penHerds(both, 2 * draft.plough + draft.cartOxen).get(7)?.oxen).toBe(1);
    // tři voli: jeden u vozu, pár u rádla – v ohradě nikdo
    const three: SceneVillage = { ...both, pens: [{ ...both.pens![0]!, oxen: 3 }] };
    const shared = draftTeamsToday(three, 2);
    expect(shared).toEqual({ carts: 1, cartOxen: 1, plough: 1 });
    expect(penHerds(three, 2 * shared.plough + shared.cartOxen).get(7)?.oxen).toBe(0);
    // čtyřkolák táhne pár
    const four = village([{ ...hauling(1), kind: 'four-wheel' }], true);
    expect(draftTeamsToday(four, 1)).toEqual({ carts: 1, cartOxen: 2, plough: 0 });
    // vůz stojí: voli v ohradě (bez orby), orba má pár
    const idle = village([cart()]);
    const rest = draftTeamsToday(idle, 1);
    expect(rest).toEqual({ carts: 0, cartOxen: 0, plough: 1 });
    expect(penHerds(idle, 0).get(7)?.oxen).toBe(2);
  });
});

describe('rozdělaný vůz u tesaře (úloha 11)', () => {
  const yard = (stage: 1 | 2 | 3, kind: 'two-wheel' | 'four-wheel' = 'four-wheel') => ({
    id: 70,
    craft: 'carpenter' as const,
    position: { x: 30, z: -12, rotation: 0.6 },
    yard: { cart: { kind, stage } },
  });

  it('před dílnou tesaře stojí vůz po fázích, jiné dílny ani tesař bez vozu ne', () => {
    const plans = buildingCartPlans([
      yard(1),
      { id: 71, craft: 'carpenter', position: { x: 0, z: 0, rotation: 0 } },
      { id: 72, craft: 'smith', position: { x: 9, z: 0, rotation: 0 }, yard: { bloom: 2 } },
    ]);
    expect(plans).toEqual([{ kind: 'four-wheel', parked: carpenterCartSpot(yard(1)), build: 1 }]);
    // vůz je ve vyklízené ploše před vchodem dílny (≈ 7 m od středu domu)
    const spot = plans[0]!.parked;
    expect(Math.hypot(spot.x - 30, spot.z + 12)).toBeGreaterThan(6);
    expect(Math.hypot(spot.x - 30, spot.z + 12)).toBeLessThan(8);
  });

  it('fáze 1 korba na zemi bez kol, 2 s koly a předkem, 3 celý vůz s ojí', () => {
    expect(buildingCartParts('four-wheel', 1)).toEqual({
      wheels: false,
      front: false,
      pole: false,
    });
    expect(buildingCartParts('four-wheel', 2)).toEqual({ wheels: true, front: true, pole: false });
    expect(buildingCartParts('four-wheel', 3)).toEqual({ wheels: true, front: true, pole: true });
    expect(buildingCartParts('two-wheel', 2)).toEqual({ wheels: true, front: false, pole: false });
    // stojící vůz u ohrady (bez fáze) je celý
    expect(buildingCartParts('four-wheel', undefined)).toEqual({
      wheels: true,
      front: true,
      pole: true,
    });
    const [low] = buildingCartPlans([yard(1, 'two-wheel')]);
    const [whole] = buildingCartPlans([yard(2, 'two-wheel')]);
    const a = cartPlanPose(low!, 0, createCartPose());
    const b = cartPlanPose(whole!, 0, createCartPose());
    expect(a.leg).toBe('parked');
    expect(a.hitched).toBe(false);
    // bez kol leží korba rovně a níž – spodkem na zemi (nevisí ve vzduchu)
    expect(a.body.fy).toBeCloseTo(0, 9);
    expect(a.body.y + a.body.uy * CART_BODY_LOW_M * CART_SCALE).toBeCloseTo(0, 6);
    expect(a.body.y).toBeLessThan(b.body.y);
  });
});
