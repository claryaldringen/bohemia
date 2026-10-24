import { describe, expect, it } from 'vitest';
import {
  CART_TURN_M,
  cartPlanPose,
  createCartPose,
  shuttleLeg,
  shuttleRoute,
  type CartPlan,
} from '../cart-layout';
import {
  PERSON_BIAS_PX,
  capsuleDistance,
  draftHitTarget,
  draftSelectionFor,
  pickCart,
  pickTeam,
} from '../draft-pick';
import { loopActivity, routeActivity, sameTeamActivity } from '../draft-state';
import {
  TURN_RADIUS_M,
  createTeamPose,
  routePose,
  ploughPath,
  ploughRoute,
  teamPose,
  teamTrack,
  transitTrack,
  type PloughField,
  type RouteStint,
  type RouteTrack,
} from '../plough-team';
import type { Project } from '../villager-pick';

// Výběr spřežení s rádlem a vozu (villagers.md – Výběr postavy; oxen.md, wagons.md): díl pod
// kurzorem, co klik vybere, co spřežení a vůz právě dělají.

/** Šikmý pohled shora: x doprava, výška nahoru, z dolů (20 px na metr). */
const project: Project = (x, y, z) => ({ x: 400 + x * 20, y: 300 - y * 20 + z * 10 });
const screen = (x: number, y: number, z: number): { x: number; y: number } => project(x, y, z)!;

const FIELD: PloughField = { x: 0, z: 0, size: 15, dirX: 1, dirZ: 0, rows: 4 };

describe('výběr – válec v obrazovce', () => {
  it('kurzor uvnitř válce má vzdálenost 0, mimo o tolik px, kolik chybí k okraji', () => {
    const c = { ax: 0, ay: 1, az: 0, bx: 2, by: 1, bz: 0, radius: 0.5 };
    const mid = screen(1, 1, 0);
    expect(capsuleDistance(c, mid.x, mid.y, project)).toBe(0);
    // poloměr 0,5 m = 10 px nahoru; kurzor 25 px nad osou → 15 px
    expect(capsuleDistance(c, mid.x, mid.y - 25, project)).toBeCloseTo(15, 6);
    // za kamerou nic
    expect(capsuleDistance(c, 0, 0, () => null)).toBeNull();
  });
});

describe('výběr spřežení s rádlem', () => {
  const pose = teamPose(ploughPath(FIELD), 3, createTeamPose());

  it('klik na vola, rádlo, oráče a honáka – díl spřežení', () => {
    const ox = pose.oxen[0];
    const at = screen(ox.x, ox.y + 0.9, ox.z);
    expect(pickTeam([pose], at.x, at.y, project)).toMatchObject({ index: 0, part: 'ox' });
    const man = pose.plowman;
    const head = screen(man.x, man.y + 1.5, man.z);
    expect(pickTeam([pose], head.x, head.y, project)).toMatchObject({ part: 'ploughman' });
    const boy = pose.boy;
    const b = screen(boy.x, boy.y + 1, boy.z);
    expect(pickTeam([pose], b.x, b.y, project)).toMatchObject({ part: 'leader' });
    const pole = pose.pole;
    const p = screen((pole.ax + pole.bx) / 2, (pole.ay + pole.by) / 2, (pole.az + pole.bz) / 2);
    expect(pickTeam([pose], p.x, p.y, project)?.part).toMatch(/ard|ox|ploughman|leader/);
  });

  it('daleko od spřežení nic; víc spřežení – vybere to pod kurzorem', () => {
    expect(pickTeam([pose], 5, 5, project)).toBeNull();
    const other = teamPose(ploughPath({ ...FIELD, x: 60 }), 3, createTeamPose());
    const ox = other.oxen[1];
    const at = screen(ox.x, ox.y + 0.9, ox.z);
    expect(pickTeam([pose, other], at.x, at.y, project)).toMatchObject({ index: 1, part: 'ox' });
  });

  it('člověk má přednost před dílem, ve kterém stojí', () => {
    expect(PERSON_BIAS_PX).toBeGreaterThan(0);
    const man = pose.plowman;
    const foot = screen(man.x, man.y + 0.3, man.z);
    expect(pickTeam([pose], foot.x, foot.y, project)?.part).toBe('ploughman');
  });
});

describe('výběr vozu', () => {
  const AXIS = [
    { x: 0, z: 0 },
    { x: 0, z: 40 },
    { x: 30, z: 70 },
  ];
  const shuttle = shuttleRoute(AXIS, 'two-wheel');
  const WINDOW = { startMs: 1_000_000, endMs: 1_086_000 };
  const plan: CartPlan = {
    id: 5,
    kind: 'two-wheel',
    cargo: 'sheaves',
    shuttle,
    schedule: { window: WINDOW, maxTrips: 8, phase: 0 },
  };

  it('klik na korbu, vola a vozku; stojící vůz jen korba; vůz za krajem mapy nic', () => {
    const pose = cartPlanPose(plan, WINDOW.startMs + 4000, createCartPose());
    const body = screen(pose.body.x, pose.body.y + 0.9, pose.body.z);
    expect(pickCart([{ kind: 'two-wheel', pose }], body.x, body.y, project)).toMatchObject({
      index: 0,
      part: 'body',
    });
    // vůl dvoukoláku stojí mezi ojemi těsně před korbou – vybere vůz (vůl nebo korba)
    const ox = pose.oxen[0];
    const o = screen(ox.x + ox.hx * 0.8, ox.y + 0.9, ox.z + ox.hz * 0.8);
    expect(pickCart([{ kind: 'two-wheel', pose }], o.x, o.y, project)?.part).toMatch(/ox|body/);
    const drover = pose.boy;
    const d = screen(drover.x, drover.y + 1.5, drover.z);
    expect(pickCart([{ kind: 'two-wheel', pose }], d.x, d.y, project)?.part).toBe('drover');

    const parked = cartPlanPose(
      { id: 6, kind: 'four-wheel', parked: { x: 50, z: 50, hx: 1, hz: 0 } },
      0,
      createCartPose(),
    );
    expect(parked.leg).toBe('parked');
    const pb = screen(parked.body.x, parked.body.y + 0.9, parked.body.z);
    expect(pickCart([{ kind: 'four-wheel', pose: parked }], pb.x, pb.y, project)?.part).toBe(
      'body',
    );
    // stojící vůz nemá vozku ani voly – klik na místo vola nic nevybere
    const away = { ...pose, hidden: true };
    expect(pickCart([{ kind: 'two-wheel', pose: away }], body.x, body.y, project)).toBeNull();
  });

  it('úsek jízdy: k cíli, nakládá, zpátky, skládá u ohrady', () => {
    expect(shuttleLeg(shuttle, { s: 1, speed: 1 })).toBe('out');
    expect(shuttleLeg(shuttle, { s: shuttle.farM, speed: 0 })).toBe('load');
    expect(shuttleLeg(shuttle, { s: shuttle.farM + 1, speed: 1 })).toBe('back');
    expect(shuttleLeg(shuttle, { s: shuttle.route.length, speed: 0 })).toBe('unload');
    const legs = new Set(
      Array.from(
        { length: 860 },
        (_, i) => cartPlanPose(plan, WINDOW.startMs + i * 100, createCartPose()).leg,
      ),
    );
    expect([...legs].sort()).toEqual(['back', 'load', 'out', 'unload']);
    expect(CART_TURN_M['two-wheel']).toBeGreaterThan(0);
  });
});

describe('co klik vybere a co ves zvýrazní', () => {
  const crew = {
    teamCrew: (team: number) => (team === 0 ? { ploughman: 201, leader: 203 } : null),
    cartDrover: (cart: number) => (cart === 5 ? 301 : null),
  };

  it('oráč, honák a vozka jsou lidé vsi; voli, rádlo a korba vyberou spřežení či vůz', () => {
    expect(draftHitTarget({ kind: 'team', team: 0, part: 'ploughman', distance: 1 }, crew)).toEqual(
      { kind: 'person', id: 201 },
    );
    expect(draftHitTarget({ kind: 'team', team: 0, part: 'leader', distance: 1 }, crew)).toEqual({
      kind: 'person',
      id: 203,
    });
    expect(draftHitTarget({ kind: 'team', team: 0, part: 'ox', distance: 1 }, crew)).toEqual({
      kind: 'plough-team',
      team: 0,
    });
    expect(draftHitTarget({ kind: 'cart', cart: 5, part: 'drover', distance: 1 }, crew)).toEqual({
      kind: 'person',
      id: 301,
    });
    expect(draftHitTarget({ kind: 'cart', cart: 5, part: 'body', distance: 1 }, crew)).toEqual({
      kind: 'cart',
      id: 5,
    });
    // bez lidí ve scéně (nebo bez volného člověka) vybere klik na oráče celé spřežení
    expect(draftHitTarget({ kind: 'team', team: 1, part: 'ploughman', distance: 1 }, crew)).toEqual(
      { kind: 'plough-team', team: 1 },
    );
    expect(draftHitTarget({ kind: 'cart', cart: 9, part: 'drover', distance: 1 }, null)).toEqual({
      kind: 'cart',
      id: 9,
    });
  });

  it('přechod mezi člověkem a spřežením: oráč zvýrazní sebe u spřežení, spřežení celé', () => {
    const ploughman = { kind: 'plough', team: 0, role: 'ploughman' } as const;
    expect(draftSelectionFor({ kind: 'person', id: 201 }, ploughman)).toEqual({
      kind: 'team',
      team: 0,
      figure: 'ploughman',
    });
    expect(draftSelectionFor({ kind: 'plough-team', team: 0 }, null)).toEqual({
      kind: 'team',
      team: 0,
      figure: 'team',
    });
    expect(draftSelectionFor({ kind: 'person', id: 301 }, { kind: 'cart', cart: 5 })).toEqual({
      kind: 'cart',
      cart: 5,
      figure: 'drover',
    });
    expect(draftSelectionFor({ kind: 'cart', id: 5 }, null)).toEqual({
      kind: 'cart',
      cart: 5,
      figure: 'cart',
    });
    // jiný člověk (nese vodu) ani jiný cíl spřežení nezvýrazní
    expect(draftSelectionFor({ kind: 'person', id: 202 }, null)).toBeNull();
    expect(draftSelectionFor({ kind: 'dwelling', id: 2 }, null)).toBeNull();
    expect(draftSelectionFor(null, null)).toBeNull();
  });
});

describe('co spřežení dělá', () => {
  it('na pruhu orá díl, při přechodu na nový pruh jde na pole', () => {
    const part = { fieldId: 7, partId: 71 };
    const track = teamTrack(ploughPath(FIELD));
    expect(loopActivity(track, 10, part)).toEqual({ kind: 'plough', part });
    const moved = transitTrack(
      ploughPath({ ...FIELD, x: 30 }),
      { x: 0, z: 0, hx: 1, hz: 0, lift: 0 },
      100,
    );
    expect(moved.transit).not.toBeNull();
    expect(loopActivity(moved, 101, part)).toEqual({ kind: 'to-field' });
    expect(loopActivity(moved, moved.transit!.arriveS + 1, part).kind).toBe('plough');
  });

  it('trasa dne: z ohrady na pole, orá díly, přechází, večer do ohrady, pak hotovo', () => {
    const stints: RouteStint[] = [
      { fieldId: 7, partId: 71, field: { ...FIELD, rows: 2 } },
      { fieldId: 7, partId: 72, field: { ...FIELD, x: 40, rows: 2 } },
    ];
    const approach = [
      { x: -60, z: -40 },
      { x: -30, z: -20 },
      { x: -10, z: 0 },
    ];
    const route = ploughRoute(stints, { x: -60, z: -41 }, TURN_RADIUS_M, {
      out: approach,
      home: [...approach].reverse(),
    });
    const track: RouteTrack = { route, startMs: 0, endMs: 100_000 };
    const kinds = Array.from({ length: 200 }, (_, i) => routeActivity(track, i * 500, true).kind);
    // pořadí: na pole, orba, přechod, orba, do ohrady
    const order = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1]);
    expect(order).toEqual(['to-field', 'plough', 'between', 'plough', 'to-pen']);
    const parts = new Set(
      Array.from({ length: 200 }, (_, i) => routeActivity(track, i * 500, true)).flatMap((a) =>
        a.kind === 'plough' && a.part ? [a.part.partId] : [],
      ),
    );
    expect([...parts]).toEqual([71, 72]);
    expect(routeActivity(track, 100_000, true)).toEqual({ kind: 'done', atPen: true });
    expect(routeActivity(track, 200_000, false)).toEqual({ kind: 'done', atPen: false });
  });

  it('spřežení na poli (oxen.md – Spřežení zůstane na poli): jen pruhy dne, večer stojí na poli', () => {
    const stints: RouteStint[] = [
      { fieldId: 7, partId: 71, field: { ...FIELD, rows: 2 } },
      { fieldId: 7, partId: 72, field: { ...FIELD, x: 40, rows: 2 } },
    ];
    const stay = ploughRoute(stints, null, TURN_RADIUS_M, null);
    const track: RouteTrack = { route: stay, startMs: 0, endMs: 100_000 };
    const kinds = Array.from({ length: 200 }, (_, i) => routeActivity(track, i * 500, false).kind);
    const order = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1]);
    expect(order).toEqual(['plough', 'between', 'plough']);
    expect(routeActivity(track, 100_000, false)).toEqual({ kind: 'done', atPen: false });
    // stejné pruhy za celý den – bez cest jede pomaleji než v den výjezdu a návratu
    const road = [
      { x: -60, z: -40 },
      { x: -10, z: 0 },
    ];
    const full = ploughRoute(stints, null, TURN_RADIUS_M, { out: road, home: [...road].reverse() });
    expect(stay.length).toBeLessThan(full.length - 100);
    // v den výjezdu bez návratu: z ohrady na pole, večer zůstane na poli
    const out = ploughRoute(stints, null, TURN_RADIUS_M, { out: road });
    const outTrack: RouteTrack = { route: out, startMs: 0, endMs: 100_000 };
    const outKinds = Array.from(
      { length: 200 },
      (_, i) => routeActivity(outTrack, i * 500, false).kind,
    );
    expect(outKinds[0]).toBe('to-field');
    expect(outKinds).not.toContain('to-pen');
  });

  it('den bez orby: spřežení na poli stojí u čela orby, do ohrady nejde', () => {
    const stand = ploughRoute([], null, TURN_RADIUS_M, { stand: { x: 12, z: -4 } });
    const track: RouteTrack = { route: stand, startMs: 0, endMs: 1000 };
    const pose = createTeamPose();
    routePose(track, 500, pose, () => 0);
    expect(Math.hypot(pose.yoke.x - 12, pose.yoke.z + 4)).toBeLessThan(0.1);
    expect(routeActivity(track, 500, false)).toEqual({ kind: 'done', atPen: false });
    // spřežení, které se ve scéně hýbe, dojde na čelo
    const walk = ploughRoute([], { x: 0, z: -4 }, TURN_RADIUS_M, { stand: { x: 12, z: -4 } });
    expect(walk.length).toBeCloseTo(12, 6);
  });

  it('stejná činnost – stejný díl; jiný díl nebo jiná činnost se liší', () => {
    const a = { kind: 'plough', part: { fieldId: 1, partId: 2 } } as const;
    expect(sameTeamActivity(a, { kind: 'plough', part: { fieldId: 1, partId: 2 } })).toBe(true);
    expect(sameTeamActivity(a, { kind: 'plough', part: { fieldId: 1, partId: 3 } })).toBe(false);
    expect(sameTeamActivity(a, { kind: 'to-pen' })).toBe(false);
    expect(sameTeamActivity({ kind: 'done', atPen: true }, { kind: 'done', atPen: false })).toBe(
      false,
    );
  });
});
