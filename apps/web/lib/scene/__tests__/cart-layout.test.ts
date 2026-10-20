import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CART_PARTS,
  CART_SCALE,
  CART_SPEED_M_S,
  CART_TURN_M,
  cartPlanPose,
  cartPose,
  cartRoute,
  createCartPose,
  parkedCartPose,
  routeAt,
  shuttleAt,
  shuttleRoute,
  type CartKind,
  type CartPose,
  type CartRoute,
  type RoutePoint,
  type ShuttleState,
} from '../cart-layout';
import { TEAM_PARTS, type GroundFn, type PartFrame } from '../plough-team';

const k = CART_SCALE;

function point(): RoutePoint {
  return { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
}

/** Bod v rámci dílu (vpřed, nahoru, vpravo) ve světě. */
function inFrame(f: PartFrame, forward: number, up: number, right = 0): [number, number, number] {
  const rx = f.uy * f.fz - f.uz * f.fy;
  const ry = f.uz * f.fx - f.ux * f.fz;
  const rz = f.ux * f.fy - f.uy * f.fx;
  return [
    f.x + (f.fx * forward + f.ux * up + rx * right) * k,
    f.y + (f.fy * forward + f.uy * up + ry * right) * k,
    f.z + (f.fz * forward + f.uz * up + rz * right) * k,
  ];
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

const STRAIGHT = cartRoute(
  [
    { x: 0, z: -200 },
    { x: 0, z: 200 },
  ],
  { closed: false, turnRadius: 4 },
);
const LOOP = cartRoute(
  [
    { x: -15, z: -10 },
    { x: 15, z: -10 },
    { x: 15, z: 10 },
    { x: -15, z: 10 },
  ],
  { closed: true, turnRadius: 5 },
);

function pose(kind: CartKind, route: CartRoute, t: number, ground: GroundFn = () => 0): CartPose {
  return cartPose({ kind, cargo: 'empty', route, offsetM: 0 }, t, createCartPose(), ground);
}

describe('trasa vozu', () => {
  it('rohy zaoblené obloukem, trasa navazuje bez skoků a úhel směru přibývá', () => {
    expect(LOOP.closed).toBe(true);
    expect(LOOP.lapTurn).toBeCloseTo(2 * Math.PI, 9);
    // 4 oblouky o poloměru 5 m místo rohů: délka = obvod obdélníku − 8 · 5 + 2π · 5
    expect(LOOP.length).toBeCloseTo(2 * (30 + 20) - 8 * 5 + 2 * Math.PI * 5, 6);
    const a = point();
    const b = point();
    for (let s = 0; s < LOOP.length * 2; s += 0.25) {
      routeAt(LOOP, s, a);
      routeAt(LOOP, s + 0.25, b);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(0.25 + 1e-6);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(0.2);
      expect(b.heading - a.heading).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.cos(a.heading)).toBeCloseTo(a.hx, 6);
      expect(Math.sin(a.heading)).toBeCloseTo(a.hz, 6);
    }
  });

  it('otevřená trasa pokračuje za koncem rovně', () => {
    const p = routeAt(STRAIGHT, -5, point());
    expect(p.z).toBeCloseTo(-205, 6);
    expect(routeAt(STRAIGHT, STRAIGHT.length + 3, point()).z).toBeCloseTo(203, 6);
  });

  it('krátké úseky – oblouk se zmenší, aby se vešel', () => {
    const r = cartRoute(
      [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 2, z: 2 },
        { x: 0, z: 2 },
      ],
      { closed: true, turnRadius: 10 },
    );
    expect(r.lapTurn).toBeCloseTo(2 * Math.PI, 9);
    for (const seg of r.segments) if (seg.kind === 'arc') expect(seg.radius).toBeCloseTo(1, 6);
  });
});

describe('dvoukolák', () => {
  it('na rovině: oj leží pod jhem, korba vodorovně, kola na zemi', () => {
    const p = pose('two-wheel', STRAIGHT, 100);
    const tip = inFrame(
      p.body,
      CART_PARTS['two-wheel'].poleTip.z,
      CART_PARTS['two-wheel'].poleTip.y,
    );
    expect(distance(tip, [p.yoke.x, p.yoke.y, p.yoke.z])).toBeLessThan(0.01);
    expect(p.body.uy).toBeGreaterThan(0.999);
    for (const w of p.wheels.slice(0, 2)) expect(w.y).toBeCloseTo(CART_PARTS.hubY * k, 2);
    // kola vlevo a vpravo od korby, levé má menší x (osy scény: x vpravo)
    expect(p.wheels[0]!.x).toBeCloseTo(-CART_PARTS['two-wheel'].track * k, 3);
    expect(p.wheels[1]!.x).toBeCloseTo(CART_PARTS['two-wheel'].track * k, 3);
    // korba je za voly – zadky volů ≈ 1,6 m za jhem, předek korby dál
    const front = p.yoke.z - (p.body.z + CART_PARTS['two-wheel'].front * k);
    expect(front).toBeGreaterThan(1.7 * k);
  });

  it('táhne jeden vůl mezi ojemi oplení, čtyřkolák pár (oxen.md – Potah)', () => {
    const p = pose('two-wheel', STRAIGHT, 100);
    expect(p.team).toBe(1);
    // vůl uprostřed pod jhem, za jhem o kus jako vůl spřežení
    expect(p.oxen[0].x).toBeCloseTo(p.yoke.x, 9);
    expect(p.yoke.z - p.oxen[0].z).toBeCloseTo(TEAM_PARTS.oxYokeZ * k, 9);
    // oje po stranách vola – vůl (≈ ± 0,35 m) se mezi ně vejde
    expect(CART_PARTS['two-wheel'].shaftX).toBeGreaterThan(0.35 + 0.05);
    const four = pose('four-wheel', STRAIGHT, 100);
    expect(four.team).toBe(2);
    expect(four.oxen[1].x - four.oxen[0].x).toBeCloseTo(2 * TEAM_PARTS.oxSpan * k, 9);
  });

  it('do kopce: oj pořád pod jhem, korba nakloněná', () => {
    const slope = (_x: number, z: number): number => 0.12 * z;
    const p = pose('two-wheel', STRAIGHT, 230, slope);
    const tip = inFrame(
      p.body,
      CART_PARTS['two-wheel'].poleTip.z,
      CART_PARTS['two-wheel'].poleTip.y,
    );
    expect(distance(tip, [p.yoke.x, p.yoke.y, p.yoke.z])).toBeLessThan(0.02);
    expect(p.body.fy).toBeGreaterThan(0.05);
    // kola na svahu na zemi (náboj ve výšce náboje nad zemí)
    for (const w of p.wheels.slice(0, 2)) {
      expect(w.y - slope(w.x, w.z)).toBeCloseTo(CART_PARTS.hubY * k, 1);
    }
  });

  it('na příčném svahu se korba naklopí k nižšímu kolu', () => {
    const side = (x: number): number => 0.15 * x;
    const p = pose('two-wheel', STRAIGHT, 230, side);
    // vpravo (+x) je výš – osa nahoru se kloní doleva (−x)
    expect(p.body.ux).toBeLessThan(-0.05);
  });

  it('kola se točí podle ujeté dráhy, v oblouku vnější víc', () => {
    const a = pose('two-wheel', STRAIGHT, 100);
    const b = pose('two-wheel', STRAIGHT, 101);
    const turned = (w0: PartFrame, w1: PartFrame): number =>
      Math.acos(Math.min(1, w0.ux * w1.ux + w0.uy * w1.uy + w0.uz * w1.uz));
    // (korba se s krokem volů nepatrně kývá – jho na šíjích)
    const expected = CART_SPEED_M_S / (CART_PARTS.wheelR * k);
    expect(turned(a.wheels[0]!, b.wheels[0]!)).toBeCloseTo(expected, 2);
    expect(turned(a.wheels[1]!, b.wheels[1]!)).toBeCloseTo(expected, 2);
    // vršek kola jde dopředu (+z)
    expect(b.wheels[0]!.uz).toBeGreaterThan(a.wheels[0]!.uz);
    // kruh doleva (proti směru hodinek): levé kolo uvnitř se točí pomaleji
    const circle = cartRoute(
      Array.from({ length: 48 }, (_, i) => ({
        x: 10 * Math.cos((2 * Math.PI * i) / 48),
        z: 10 * Math.sin((2 * Math.PI * i) / 48),
      })),
      { closed: true, turnRadius: 3 },
    );
    const c0 = pose('two-wheel', circle, 50);
    const c1 = pose('two-wheel', circle, 50.5);
    expect(turned(c0.wheels[0]!, c1.wheels[0]!)).toBeLessThan(turned(c0.wheels[1]!, c1.wheels[1]!));
  });

  it('stejný čas = stejná póza (i po mnoha kolech uzavřené trasy)', () => {
    const t = 3600 * 5 + 17.3;
    expect(pose('two-wheel', LOOP, t)).toEqual(pose('two-wheel', LOOP, t));
    const p = pose('two-wheel', LOOP, t);
    const tip = inFrame(
      p.body,
      CART_PARTS['two-wheel'].poleTip.z,
      CART_PARTS['two-wheel'].poleTip.y,
    );
    expect(distance(tip, [p.yoke.x, p.yoke.y, p.yoke.z])).toBeLessThan(0.03);
  });
});

describe('čtyřkolák', () => {
  it('na rovině: nápravy po rozvoru za sebou, oj od rozvory ke jhu', () => {
    const p = pose('four-wheel', STRAIGHT, 100);
    const front = p.wheels[0]!;
    const back = p.wheels[2]!;
    expect(front.z - back.z).toBeCloseTo(CART_PARTS['four-wheel'].wheelbase * k, 3);
    expect(p.yoke.z - (front.z + 0)).toBeCloseTo(CART_PARTS['four-wheel'].yokeReach * k, 2);
    const tip = inFrame(
      p.front,
      CART_PARTS['four-wheel'].houndsTip.z,
      CART_PARTS['four-wheel'].houndsTip.y,
    );
    expect(distance(tip, [p.pole.ax, p.pole.ay, p.pole.az])).toBeLessThan(1e-9);
    expect(p.pole.by).toBeCloseTo(p.yoke.y, 9);
    // oj zhruba délky modelu (scéna ji natáhne jen málo)
    const poleLength = Math.hypot(
      p.pole.bx - p.pole.ax,
      p.pole.by - p.pole.ay,
      p.pole.bz - p.pole.az,
    );
    expect(poleLength / k).toBeGreaterThan(CART_PARTS['four-wheel'].poleM * 0.9);
    expect(poleLength / k).toBeLessThan(CART_PARTS['four-wheel'].poleM * 1.15);
    expect(p.body.uy).toBeGreaterThan(0.999);
  });

  it('v oblouku se předek natáčí ke jhu víc než korba', () => {
    const p = pose('four-wheel', LOOP, 12);
    // někde v oblouku: předek a korba míří jinam
    let found = false;
    for (let t = 0; t < LOOP.length / CART_SPEED_M_S; t += 0.5) {
      const q = pose('four-wheel', LOOP, t);
      const dot = q.front.fx * q.body.fx + q.front.fz * q.body.fz;
      if (dot < Math.cos((8 * Math.PI) / 180)) found = true;
    }
    expect(found).toBe(true);
    expect(p.wheels.length).toBe(4);
  });

  it('do kopce leží korba na obou nápravách', () => {
    const slope = (_x: number, z: number): number => 0.1 * z;
    const p = pose('four-wheel', STRAIGHT, 230, slope);
    expect(p.body.fy).toBeCloseTo(0.1 / Math.hypot(1, 0.1), 2);
    for (const w of p.wheels) expect(w.y - slope(w.x, w.z)).toBeCloseTo(CART_PARTS.hubY * k, 1);
  });
});

describe('rozměry sedí s modely (tools/blender/wagons_from_0ad.py)', () => {
  const data = readFileSync(join(__dirname, '../../../public/models/wagons/wagons.glb'));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min?: number[]; max?: number[] }[];
  };
  // glTF: x vlevo, y nahoru, z vpřed
  const bounds = (name: string): { min: number[]; max: number[] } => {
    const node = json.nodes.find((n) => n.name === name);
    expect(node, name).toBeDefined();
    const accessor = json.accessors[json.meshes[node!.mesh!]!.primitives[0]!.attributes.POSITION]!;
    return { min: accessor.min!, max: accessor.max! };
  };

  it('díly a náklady obou vozů', () => {
    const names = json.nodes.map((n) => n.name);
    for (const prefix of ['wagon2', 'wagon4']) {
      for (const cargo of ['hay', 'sheaves', 'logs', 'goods', 'water', 'ore', 'clay', 'apples']) {
        expect(names).toContain(`${prefix}-${cargo}`);
      }
    }
    for (const part of [
      'wagon2-body',
      'wagon2-yoke',
      'wagon4-body',
      'wagon4-front',
      'wagon4-pole',
      'wagon-wheel',
    ]) {
      expect(names).toContain(part);
    }
  });

  it('kolo, oj dvoukoláku, rozvora a oj čtyřkoláku', () => {
    const wheel = bounds('wagon-wheel');
    expect(wheel.max[1]).toBeCloseTo(CART_PARTS.wheelR, 2);
    expect(-wheel.min[1]!).toBeCloseTo(CART_PARTS.wheelR, 2);
    const two = bounds('wagon2-body');
    // špička oje + poloměr oje
    expect(two.max[2]! - 0.05).toBeCloseTo(CART_PARTS['two-wheel'].poleTip.z, 1);
    expect(two.max[1]).toBeGreaterThan(TEAM_PARTS.yokeY);
    expect(two.max[1]).toBeLessThan(TEAM_PARTS.yokeY + 0.1);
    expect(two.max[0]).toBeCloseTo(CART_PARTS['two-wheel'].halfWidth, 1);
    // oplení: oje po stranách vola až k bokům jednoduchého jha (oxen.md – Potah)
    expect(two.max[0]).toBeGreaterThan(CART_PARTS['two-wheel'].shaftX);
    const yoke = bounds('wagon2-yoke');
    expect(yoke.max[0]).toBeGreaterThan(CART_PARTS['two-wheel'].shaftX);
    expect(yoke.max[0]).toBeLessThan(CART_PARTS['two-wheel'].shaftX + 0.1);
    expect(-yoke.min[0]!).toBeCloseTo(yoke.max[0]!, 3);
    const front = bounds('wagon4-front');
    expect(front.max[2]).toBeCloseTo(CART_PARTS['four-wheel'].houndsTip.z, 2);
    expect(front.max[1]).toBeGreaterThan(CART_PARTS['four-wheel'].houndsTip.y);
    const pole = bounds('wagon4-pole');
    expect(pole.max[2]).toBeCloseTo(CART_PARTS['four-wheel'].poleM, 2);
    const body4 = bounds('wagon4-body');
    expect(body4.max[2]).toBeCloseTo(CART_PARTS['four-wheel'].front, 1);
    expect(-body4.min[2]!).toBeCloseTo(CART_PARTS['four-wheel'].back, 1);
  });

  it('sudy na vodu stojí na korbě – mezi bočnicemi, nad nimi vyčnívají (Co vozy vozí)', () => {
    for (const [prefix, kind] of [
      ['wagon2', 'two-wheel'],
      ['wagon4', 'four-wheel'],
    ] as const) {
      const water = bounds(`${prefix}-water`);
      const body = bounds(`${prefix}-body`);
      const goods = bounds(`${prefix}-goods`);
      // na dně korby jako ostatní náklad
      expect(water.min[1]).toBeCloseTo(goods.min[1]!, 2);
      // mezi bočnicemi (provaz k bočnici smí na ni) a v délce korby
      expect(water.max[0]).toBeLessThan(CART_PARTS[kind].halfWidth + 0.01);
      expect(-water.min[0]!).toBeLessThan(CART_PARTS[kind].halfWidth + 0.01);
      expect(water.max[2]).toBeLessThan(body.max[2]!);
      expect(-water.min[2]!).toBeLessThan(CART_PARTS[kind].back);
      // sud ≈ 0,72–0,78 m vysoký – nad bočnice korby
      expect(water.max[1]! - water.min[1]!).toBeGreaterThan(0.7);
      expect(water.max[1]).toBeGreaterThan(body.max[1]! - 0.1);
    }
  });
});

describe('jízda tam a zpět (svoz – fáze 3)', () => {
  const AXIS = [
    { x: 0, z: 0 },
    { x: 0, z: 40 },
    { x: 30, z: 70 },
  ];
  const shuttle = shuttleRoute(AXIS, 'two-wheel');
  const WINDOW = { startMs: 1_000_000, endMs: 1_086_000 };
  const schedule = { window: WINDOW, maxTrips: 8, phase: 0 };
  const at = (ms: number): ShuttleState =>
    shuttleAt(shuttle, schedule, ms, { s: 0, speed: 0, loaded: false });

  it('uzavřená trasa: od ohrady k cíli, obratiště, zpět a obratiště u ohrady', () => {
    expect(shuttle.route.closed).toBe(true);
    // tam i zpět po ose, smyčky navíc
    const axisM = 40 + Math.hypot(30, 30);
    expect(shuttle.route.length).toBeGreaterThan(2 * axisM);
    expect(shuttle.farM).toBeGreaterThan(axisM * 0.9);
    expect(shuttle.farM).toBeLessThan(shuttle.route.length - axisM * 0.9);
    // začátek u ohrady čelem k cíli, obrat za cílem
    const p = routeAt(shuttle.route, 0, point());
    expect(Math.hypot(p.x, p.z)).toBeLessThan(CART_TURN_M['two-wheel']);
    expect(p.hz).toBeGreaterThan(0.9);
    const far = routeAt(shuttle.route, shuttle.farM, point());
    expect(Math.hypot(far.x - 30, far.z - 70)).toBeGreaterThan(5);
    expect(Math.hypot(far.x - 30, far.z - 70)).toBeLessThan(15);
  });

  it('za herní den několik jízd: prázdný tam, u cíle nakládá, plný zpátky; den začíná i končí u ohrady', () => {
    const home = (x: ShuttleState): boolean =>
      x.speed === 0 && !x.loaded && (x.s === 0 || x.s === shuttle.route.length);
    expect(home(at(WINDOW.startMs - 500))).toBe(true);
    expect(home(at(WINDOW.endMs - 500))).toBe(true);
    expect(at(WINDOW.startMs + 200).speed).toBeGreaterThan(0);
    const samples = Array.from({ length: 860 }, (_, i) => at(WINDOW.startMs + i * 100));
    // jede tam prázdný, zpátky plný, mezi tím stojí
    const out = samples.filter((x) => x.speed > 0 && x.s < shuttle.farM);
    const back = samples.filter((x) => x.speed > 0 && x.s > shuttle.farM);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((x) => !x.loaded)).toBe(true);
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((x) => x.loaded)).toBe(true);
    expect(samples.some((x) => x.speed === 0 && x.s === shuttle.farM)).toBe(true);
    // počet obratů u cíle = počet jízd (aspoň 1, nejvýš 8), rychlost aspoň tempem volů
    let trips = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1]!.s < shuttle.farM && samples[i]!.s >= shuttle.farM) trips++;
    }
    expect(trips).toBeGreaterThanOrEqual(1);
    expect(trips).toBeLessThanOrEqual(8);
    expect(Math.max(...samples.map((x) => x.speed))).toBeGreaterThanOrEqual(CART_SPEED_M_S);
    // spojitě – vůz neskáče
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!.s;
      const b = samples[i]!.s;
      const step = Math.min(Math.abs(b - a), shuttle.route.length - Math.abs(b - a));
      expect(step).toBeLessThan(2);
    }
  });

  it('bez okna dne jezdí dokola tempem volů; stejný okamžik = stejné místo', () => {
    const real = { window: null, maxTrips: 8, phase: 0.3 };
    const a = shuttleAt(shuttle, real, 5_000_000, { s: 0, speed: 0, loaded: false });
    const b = shuttleAt(shuttle, real, 5_000_000, { s: 0, speed: 0, loaded: false });
    expect(a).toEqual(b);
    expect([0, CART_SPEED_M_S]).toContain(a.speed);
  });

  it('póza podle plánu: na jízdě zapřažený, náklad jen zpátky; stojící bez volů', () => {
    const plan = { kind: 'two-wheel' as const, cargo: 'hay' as const, shuttle, schedule };
    const samples = Array.from({ length: 86 }, (_, i) =>
      cartPlanPose(plan, WINDOW.startMs + i * 1000, createCartPose()),
    );
    expect(samples.every((p) => p.hitched)).toBe(true);
    expect(samples.some((p) => p.loaded)).toBe(true);
    expect(samples.some((p) => !p.loaded)).toBe(true);
    const parked = cartPlanPose(
      { kind: 'four-wheel', parked: { x: 5, z: 6, hx: 1, hz: 0 } },
      0,
      createCartPose(),
    );
    expect(parked.hitched).toBe(false);
    expect(parked.moving).toBe(false);
  });

  it('stojící dvoukolák se opírá ojí o zem, čtyřkolák stojí rovně s ojí na zemi', () => {
    const two = parkedCartPose('two-wheel', { x: 0, z: 0, hx: 0, hz: 1 }, createCartPose());
    const tip = inFrame(
      two.body,
      CART_PARTS['two-wheel'].poleTip.z,
      CART_PARTS['two-wheel'].poleTip.y,
    );
    expect(tip[1]).toBeGreaterThan(0);
    expect(tip[1]).toBeLessThan(0.15);
    expect(two.body.fy).toBeLessThan(-0.2);
    for (const w of two.wheels.slice(0, 2)) expect(w.y).toBeCloseTo(CART_PARTS.hubY * k, 2);
    const four = parkedCartPose('four-wheel', { x: 0, z: 0, hx: 1, hz: 0 }, createCartPose());
    expect(four.body.uy).toBeGreaterThan(0.999);
    expect(four.pole.by).toBeLessThan(0.15);
    expect(four.pole.bx).toBeGreaterThan(four.pole.ax);
  });
});

describe('obratiště vozu u vody', () => {
  const AXIS = [
    { x: 0, z: 0 },
    { x: 0, z: 40 },
  ];
  // potok napříč za koncem osy: voda od z = 44 dál
  const dry = (_x: number, z: number): boolean => z < 44;

  it('obratiště u břehu leží celé na souši', () => {
    const wet = shuttleRoute(AXIS, 'two-wheel');
    const sh = shuttleRoute(AXIS, 'two-wheel', dry);
    const at: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
    let maxZ = -Infinity;
    for (let s = 0; s < sh.route.length; s += 0.25) {
      routeAt(sh.route, s, at);
      maxZ = Math.max(maxZ, at.z);
    }
    expect(maxZ).toBeLessThan(44);
    let wetMax = -Infinity;
    for (let s = 0; s < wet.route.length; s += 0.25) {
      routeAt(wet.route, s, at);
      wetMax = Math.max(wetMax, at.z);
    }
    expect(wetMax).toBeGreaterThan(44);
  });

  it('na souši (nebo bez testu) je trasa beze změny', () => {
    const base = shuttleRoute(AXIS, 'four-wheel');
    const land = shuttleRoute(AXIS, 'four-wheel', () => true);
    expect(land.route.length).toBe(base.route.length);
    expect(land.farM).toBe(base.farM);
  });
});
