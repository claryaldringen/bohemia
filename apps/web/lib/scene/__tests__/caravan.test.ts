import type { CraftPurchase, IronTrip, VillageState } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { sceneExpeditions } from '../../caravan-view';
import type { SceneCart, SceneExpedition, SceneVillage } from '../../village-view';
import { cartPlanPose, createCartPose, routeAt, type CartCaravan } from '../cart-layout';
import { CARAVAN_GAP_M, caravanHead, caravanPlan, caravanProgress, memberSpot } from '../caravan';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { villageCartPlans } from '../village-carts';
import { createVillagerPose } from '../villager-motion';
import { planVillagers, type VillagerGround } from '../villager-plan';

// Karavana výpravy k sousedovi ve scéně (trade.md – Ve scéně; Martin 19. 10. 2026: „Měl bych
// vidět skupinu lidí, jak jde po té zemské stezce s nákladem… Zpátky by se mělo vracet o dva lidi
// víc… Až bude vůz, pojedou zásoby na voze.“)

const WINDOW = { startMs: 1_000_000, endMs: 1_090_000 };
const at = (f: number): number => WINDOW.startMs + f * (WINDOW.endMs - WINDOW.startMs);

const expedition = (over: Partial<SceneExpedition> = {}): SceneExpedition => ({
  id: 3,
  trailId: 40,
  porters: 5,
  carts: [],
  cartCrew: 2,
  leaving: [
    { sex: 'male', age: 30 },
    { sex: 'female', age: 27 },
    { sex: 'female', age: 5 },
  ],
  coming: [
    { sex: 'male', age: 22 },
    { sex: 'female', age: 19 },
  ],
  carriesOut: true,
  carriesBack: false,
  progress: 0,
  rate: 1,
  day: 500,
  onMap: 0.8,
  ...over,
});

/** Rovná stezka 300 m od (0, 0) na východ. */
const TRAIL = {
  id: 40,
  direction: 'E' as const,
  points: [
    { x: 0, z: 0 },
    { x: 150, z: 0 },
    { x: 300, z: 0 },
  ],
  built: true,
};

const GROUND: VillagerGround = { walkable: () => true, tree: () => null, treesIn: () => [] };

function village(e: SceneExpedition, carts: SceneCart[] = []): SceneVillage {
  return {
    dwellings: [
      {
        id: 1,
        type: 'dvorec',
        position: { x: -10, z: 0, rotation: 0 },
        built: true,
        progress: 1,
        inhabited: true,
      },
    ],
    fields: [],
    trails: [TRAIL],
    expeditions: [e],
    carts,
    labor: {
      day: 500,
      month: 7,
      people: { children: 0, adults: 6, elders: 0 },
      shares: [
        { activity: 'trade', target: { kind: 'trail', id: 40 }, manDays: 5 },
        { activity: 'domestic', target: { kind: 'village' }, manDays: 1 },
      ],
    },
  };
}

/** Postavy karavany v okamžiku `nowMs` – vidět, kde a jak jdou. */
function caravanAt(
  v: SceneVillage,
  nowMs: number,
): { key: string; x: number; hidden: boolean; clip: string; kind: string; scale: number }[] {
  const people = planVillagers(v, GROUND, { seed: 1, herds: 0, dayWindow: () => WINDOW });
  const t = (nowMs - LIVESTOCK_EPOCH_MS) / 1000;
  return people
    .filter((p) => p.key.startsWith('caravan:'))
    .map((p) => {
      const pose = p.pose(t, [], { ...createVillagerPose(), hidden: false });
      return {
        key: p.key,
        x: pose.x,
        hidden: pose.hidden === true,
        clip: pose.clip,
        kind: p.kind,
        scale: p.scale,
      };
    });
}

describe('karavana – kdo jde tam a kdo zpátky', () => {
  it('tam nosiči se zbožím a lidé, kteří odcházejí; zpátky nosiči a o objednané lidi víc', () => {
    const plan = caravanPlan(expedition());
    expect(plan.out.members.map((m) => m.role)).toEqual([
      'porter',
      'porter',
      'porter',
      'porter',
      'porter',
      'leaving',
      'leaving',
      'leaving',
    ]);
    expect(plan.out.members.filter((m) => m.role === 'porter').every((m) => m.loaded)).toBe(true);
    // zpátky jde o dva lidi víc (muž a žena od souseda); bez nákladu zpět nosiči jdou prázdní
    expect(plan.back.members.map((m) => m.role)).toEqual([
      'porter',
      'porter',
      'porter',
      'porter',
      'porter',
      'coming',
      'coming',
    ]);
    expect(plan.back.members.some((m) => m.loaded)).toBe(false);
    expect(plan.out.length).toBeCloseTo(7 * CARAVAN_GAP_M.person);
  });

  it('s vozem jede náklad na voze – jdou jen dva lidé na vůz (honák u spřežení, pomocník)', () => {
    const plan = caravanPlan(expedition({ porters: 2, carts: [77] }));
    const out = plan.out.members;
    expect(out.filter((m) => m.role === 'porter')).toHaveLength(0);
    expect(out.filter((m) => m.role === 'helper')).toHaveLength(1);
    expect(out.find((m) => m.role === 'helper')!.side).toBeGreaterThan(0);
    // lidé, kteří se stěhují, jdou za vozem
    expect(
      out.filter((m) => m.role === 'leaving').every((m) => m.behind >= CARAVAN_GAP_M.cart),
    ).toBe(true);
    expect(plan.out.carts).toEqual([0]);
  });
});

describe('karavana – rozvrh v čase', () => {
  const columns = { out: 20, back: 15 };

  it('postup plyne přes herní den dnešním tempem; s tempem 0 stojí', () => {
    const e = expedition({ progress: 0.3, rate: 0.2 });
    expect(caravanProgress(e, WINDOW, at(0))).toBeCloseTo(0.3);
    expect(caravanProgress(e, WINDOW, at(0.5))).toBeCloseTo(0.4);
    expect(caravanProgress(e, WINDOW, at(1))).toBeCloseTo(0.5);
    expect(caravanProgress(e, WINDOW, at(2))).toBeCloseTo(0.5);
    const waiting = expedition({ progress: 0.3, rate: 0 });
    expect(caravanProgress(waiting, WINDOW, at(0.9))).toBeCloseTo(0.3);
    expect(caravanHead(waiting, 0.3, 300, columns).perDay).toBe(0);
  });

  it('tam po stezce, za krajem mapy pryč, zpátky po stezce – den za krajem mapy podle onMap', () => {
    const e = expedition({ onMap: 0.8 });
    const out = caravanHead(e, 0.2, 300, columns);
    expect(out.leg).toBe('out');
    expect(out.head).toBeCloseTo(0.5 * 320);
    expect(caravanHead(e, 0.5, 300, columns).leg).toBe('away');
    const back = caravanHead(e, 0.8, 300, columns);
    expect(back.leg).toBe('back');
    expect(back.head).toBeCloseTo(300 - 0.5 * 315);
    // poslední člen dojde za kraj mapy právě na konci cesty tam a domů na konci cesty zpátky
    expect(memberSpot(caravanHead(e, 0.3999, 300, columns), 20, 300, 9).visible).toBe(true);
    expect(memberSpot(caravanHead(e, 1, 300, columns), 15, 300, 7).s).toBeCloseTo(0);
  });

  it('za krajem mapy člen zmizí, před odchodem a po návratu stojí v hloučku u začátku', () => {
    const e = expedition();
    const head = caravanHead(e, 0.39, 300, columns);
    expect(memberSpot(head, 0, 300, 0).visible).toBe(false);
    expect(memberSpot(caravanHead(e, 0, 300, columns), 6, 300, 3).waiting).toBe(3);
    expect(memberSpot(caravanHead(e, 0.5, 300, columns), 0, 300, 0).visible).toBe(false);
  });
});

describe('karavana ve scéně – postavy a vůz', () => {
  it('karavana je vidět i bez práce dne; tam rodina, zpátky dva lidé navíc', () => {
    const e = expedition({ rate: 0 });
    // výprava dnes nepostoupila (ves bez dospělých) – karavana nezmizí, stojí na cestě
    const still = caravanAt(
      { ...village(e), labor: { ...village(e).labor!, shares: [] } },
      at(0.5),
    );
    expect(still.length).toBeGreaterThan(0);
    const going = caravanAt(village(expedition({ progress: 0.15 })), at(0));
    const out = going.filter((p) => !p.hidden);
    expect(out).toHaveLength(8);
    expect(out.filter((p) => p.clip === 'carry')).toHaveLength(5);
    // dítě rodiny je menší
    const child = going.find((p) => p.key.endsWith('leaving:2'))!;
    expect(child.scale).toBeLessThan(going.find((p) => p.key.endsWith('leaving:0'))!.scale);
    expect(going.find((p) => p.key.endsWith('leaving:1'))!.kind).toBe('woman');
    const back = caravanAt(village(expedition({ progress: 0.9 })), at(0)).filter((p) => !p.hidden);
    expect(back).toHaveLength(7);
    expect(back.filter((p) => p.key.includes(':coming:'))).toHaveLength(2);
    // u souseda (den za krajem mapy) není vidět nikdo
    expect(caravanAt(village(expedition({ progress: 0.5 })), at(0)).every((p) => p.hidden)).toBe(
      true,
    );
    // nosiči podle práce dne nejsou – jen karavana
    const all = planVillagers(village(e), GROUND, { seed: 1, herds: 0, dayWindow: () => WINDOW });
    expect(all.some((p) => p.key.startsWith('trade:'))).toBe(false);
  });

  it('vůz jede v čele karavany po stezce, za krajem mapy zmizí a vrátí se obráceně', () => {
    const e = expedition({ porters: 2, carts: [77], carriesBack: true });
    const cart: SceneCart = {
      id: 77,
      kind: 'four-wheel',
      x: -20,
      z: 0,
      condition: 1,
      job: { activity: 'trade', target: { kind: 'trail', id: 40 }, load: 'goods' },
      route: [{ x: -20, z: 0 }, ...TRAIL.points],
    };
    const plan = (progress: number): CartCaravan => {
      const [p] = villageCartPlans(
        village(expedition({ ...e, progress }), [cart]),
        [],
        null,
        () => WINDOW,
      );
      expect('routes' in p!).toBe(true);
      return p as CartCaravan;
    };
    const pose = createCartPose();
    const going = cartPlanPose(plan(0.2), at(0), pose);
    expect(going.hidden).toBe(false);
    expect(going.loaded).toBe(true);
    expect(going.body.x).toBeGreaterThan(100);
    expect(cartPlanPose(plan(0.5), at(0), pose).hidden).toBe(true);
    const back = cartPlanPose(plan(0.85), at(0), pose);
    expect(back.hidden).toBe(false);
    // zpátky jede čelem ke vsi (jho blíž vsi než korba)
    expect(back.yoke.x).toBeLessThan(back.body.x);
    const r = plan(0.2).routes.out;
    expect(routeAt(r, 0, { x: 0, z: 0, hx: 0, hz: 1, heading: 0 }).x).toBeCloseTo(-20, 0);
  });
});

describe('nákup u souseda jako karavana (crafts.md – Nákup u sousedů)', () => {
  const purchase = (over: Partial<CraftPurchase> = {}): CraftPurchase => ({
    direction: 'N',
    startedDay: 495,
    group: 3,
    days: 14,
    tripDays: 7,
    done: 1,
    trailId: null,
    edge: { x: -10, z: 960 },
    get: { toolsKg: 2 },
    pay: { grainKg: 120 },
    ...over,
  });
  /** Ves s dvorcem na (−10, 0) a jedním nákupem na cestě (jen co čte pohled na karavany). */
  const state = (p: CraftPurchase): VillageState =>
    ({
      lastDay: 500,
      seed: 1,
      manorId: 1,
      dwellings: [
        {
          id: 1,
          type: 'dvorec',
          builtDay: 0,
          condition: 1,
          position: { x: -10, z: 0, rotation: 0 },
        },
      ],
      constructions: [],
      people: [],
      purchases: [p],
    }) as unknown as VillageState;
  /** Scéna vsi jako ze serveru: karavany ze stavu, v práci dne skupina nákupu ke kraji mapy. */
  const scene = (p: CraftPurchase): SceneVillage => ({
    ...village(expedition()),
    trails: [],
    expeditions: sceneExpeditions(state(p)),
    labor: {
      day: 500,
      month: 11,
      people: { children: 0, adults: 6, elders: 0 },
      shares: [
        {
          activity: 'trade',
          target: { kind: 'edge', direction: 'N', x: -10, z: 960 },
          manDays: 3,
        },
      ],
    },
  });

  it('bez stezky jde karavana po čáře od dvorce ke kraji mapy, každou cestu zvlášť', () => {
    const [e] = sceneExpeditions(state(purchase({ done: 9 })));
    expect(e).toMatchObject({
      id: 'purchase:N:495',
      trailId: null,
      line: [
        { x: -10, z: 0 },
        { x: -10, z: 960 },
      ],
      porters: 3,
      carriesOut: true,
      carriesBack: true,
    });
    // druhá cesta tam a zpět (7 dní na cestu) – postup v ní 2/7, den za den 1/7
    expect(e!.progress).toBeCloseTo(2 / 7, 3);
    expect(e!.rate).toBeCloseTo(1 / 7, 3);
  });

  it('po sloučení s karavanami nákup ve scéně nezmizí – tam s platbou, zpátky s výrobky', () => {
    // první den cesty – nosiči jdou ke kraji mapy (práce dne `trade` se kreslí jen jako karavana)
    const out = caravanAt(scene(purchase({ done: 1 })), at(0.5));
    expect(out.filter((p) => !p.hidden)).toHaveLength(3);
    expect(out.filter((p) => !p.hidden).every((p) => p.clip === 'carry')).toBe(true);
    const all = planVillagers(scene(purchase()), GROUND, {
      seed: 1,
      herds: 0,
      dayWindow: () => WINDOW,
    });
    expect(all.some((p) => p.key.startsWith('trade:'))).toBe(false);
    // u souseda pryč, cestou zpátky zase vidět
    expect(caravanAt(scene(purchase({ done: 3 })), at(0.5)).every((p) => p.hidden)).toBe(true);
    const back = caravanAt(scene(purchase({ done: 5 })), at(0.5)).filter((p) => !p.hidden);
    expect(back).toHaveLength(3);
    expect(back.every((p) => p.key.includes(':back:'))).toBe(true);
  });
});

describe('tesař pro kování jako jedna postava (wagons.md – Kování vozů)', () => {
  const trip = (over: Partial<IronTrip> = {}): IronTrip => ({
    personId: 62,
    son: true,
    startedDay: 496,
    days: 4,
    done: 1,
    kg: 3,
    grainKg: 173,
    to: {
      kind: 'neighbour',
      name: 'Lhota',
      direction: 'N',
      trailId: null,
      edge: { x: 40, z: 960 },
    },
    ...over,
  });
  /** Ves s dílnou tesaře na (40, 0) a synem na cestě pro kování. */
  const state = (t: IronTrip): VillageState =>
    ({
      lastDay: 500,
      seed: 1,
      dwellings: [
        {
          id: 50,
          type: 'polozemnice',
          builtDay: 0,
          condition: 1,
          position: { x: 40, z: 0, rotation: 0 },
          workshop: {
            craft: 'carpenter',
            felling: null,
            fuelKg: 0,
            activity: 'producing',
            ironTrip: t,
          },
        },
      ],
      constructions: [],
      people: [{ id: 62, bornDay: 500 - 15 * 365 - 10, dwellingId: 50, sex: 'male' }],
    }) as unknown as VillageState;
  const scene = (t: IronTrip): SceneVillage => ({
    ...village(expedition()),
    trails: [],
    expeditions: sceneExpeditions(state(t)),
    labor: {
      day: 500,
      month: 11,
      people: { children: 0, adults: 2, elders: 0 },
      shares: [],
    },
  });

  it('od dílny po čáře ke kraji mapy, tam i zpět jen syn – bez nosičů', () => {
    const [e] = sceneExpeditions(state(trip()));
    expect(e).toMatchObject({
      id: 'iron:50:496',
      trailId: null,
      line: [
        { x: 40, z: 0 },
        { x: 40, z: 960 },
      ],
      porters: 0,
      leaving: [{ sex: 'male', age: 15 }],
      coming: [{ sex: 'male', age: 15 }],
    });
    expect(e!.progress).toBeCloseTo(1 / 4, 6);
    expect(e!.rate).toBeCloseTo(1 / 4, 6);
    // první den cesty jde jedna postava ke kraji mapy
    const out = caravanAt(scene(trip({ done: 0 })), at(0.5)).filter((p) => !p.hidden);
    expect(out).toHaveLength(1);
    expect(out[0]!.clip).toBe('walk');
  });

  it('se 6 nosiči – tam nesou obilí na platbu, zpátky jdou s kováním bez nákladu', () => {
    const t = trip({ porters: 6, done: 0 });
    const [e] = sceneExpeditions(state(t));
    expect(e).toMatchObject({ porters: 6, carts: [], carriesOut: true, carriesBack: false });
    const out = caravanAt(scene(t), at(0.5)).filter((p) => !p.hidden);
    expect(out).toHaveLength(7);
    expect(out.filter((p) => p.clip === 'carry')).toHaveLength(6);
  });

  it('jde-li skupina víckrát, každou cestu zvlášť', () => {
    // 2 cesty po 4 dnech, pátý den – druhá cesta, první den z ní
    const [e] = sceneExpeditions(state(trip({ porters: 1, days: 8, tripDays: 4, done: 4 })));
    expect(e!.progress).toBe(0);
    expect(e!.rate).toBeCloseTo(1 / 4, 6);
  });

  it('s vozem – vůz se sedlákem a tesař vedle vozu, nosiči nejdou', () => {
    const t = trip({
      cartId: 7,
      to: {
        kind: 'neighbour',
        name: 'Lhota',
        direction: 'N',
        trailId: 40,
        edge: { x: 40, z: 960 },
      },
    });
    const [e] = sceneExpeditions(state(t));
    expect(e).toMatchObject({ trailId: 40, carts: [7], porters: 0, leaving: [], coming: [] });
    expect(e!.line).toBeUndefined();
  });

  it('do jiné vsi na téže mapě – celou cestu vidět, ke kovárně a zpět', () => {
    const t = trip({ days: 2, to: { kind: 'village', name: 'Lhota', x: 340, z: 0 } });
    const [e] = sceneExpeditions(state(t));
    expect(e!.line).toEqual([
      { x: 40, z: 0 },
      { x: 340, z: 0 },
    ]);
    expect(e!.onMap).toBe(1);
    // druhý den jde zpátky
    const back = caravanAt(scene({ ...t, done: 1 }), at(0.5)).filter((p) => !p.hidden);
    expect(back).toHaveLength(1);
    expect(back[0]!.key).toContain(':back:');
  });
});
