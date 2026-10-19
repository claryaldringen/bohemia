import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CART_PARTS,
  CART_SCALE,
  CART_SPEED_M_S,
  cartPose,
  cartRoute,
  createCartPose,
  routeAt,
  type CartKind,
  type CartPose,
  type CartRoute,
  type RoutePoint,
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
    const p = pose('two', STRAIGHT, 100);
    const tip = inFrame(p.body, CART_PARTS.two.poleTip.z, CART_PARTS.two.poleTip.y);
    expect(distance(tip, [p.yoke.x, p.yoke.y, p.yoke.z])).toBeLessThan(0.01);
    expect(p.body.uy).toBeGreaterThan(0.999);
    for (const w of p.wheels.slice(0, 2)) expect(w.y).toBeCloseTo(CART_PARTS.hubY * k, 2);
    // kola vlevo a vpravo od korby, levé má menší x (osy scény: x vpravo)
    expect(p.wheels[0]!.x).toBeCloseTo(-CART_PARTS.two.track * k, 3);
    expect(p.wheels[1]!.x).toBeCloseTo(CART_PARTS.two.track * k, 3);
    // korba je za voly – zadky volů ≈ 1,6 m za jhem, předek korby dál
    const front = p.yoke.z - (p.body.z + CART_PARTS.two.front * k);
    expect(front).toBeGreaterThan(1.7 * k);
  });

  it('do kopce: oj pořád pod jhem, korba nakloněná', () => {
    const slope = (_x: number, z: number): number => 0.12 * z;
    const p = pose('two', STRAIGHT, 230, slope);
    const tip = inFrame(p.body, CART_PARTS.two.poleTip.z, CART_PARTS.two.poleTip.y);
    expect(distance(tip, [p.yoke.x, p.yoke.y, p.yoke.z])).toBeLessThan(0.02);
    expect(p.body.fy).toBeGreaterThan(0.05);
    // kola na svahu na zemi (náboj ve výšce náboje nad zemí)
    for (const w of p.wheels.slice(0, 2)) {
      expect(w.y - slope(w.x, w.z)).toBeCloseTo(CART_PARTS.hubY * k, 1);
    }
  });

  it('na příčném svahu se korba naklopí k nižšímu kolu', () => {
    const side = (x: number): number => 0.15 * x;
    const p = pose('two', STRAIGHT, 230, side);
    // vpravo (+x) je výš – osa nahoru se kloní doleva (−x)
    expect(p.body.ux).toBeLessThan(-0.05);
  });

  it('kola se točí podle ujeté dráhy, v oblouku vnější víc', () => {
    const a = pose('two', STRAIGHT, 100);
    const b = pose('two', STRAIGHT, 101);
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
    const c0 = pose('two', circle, 50);
    const c1 = pose('two', circle, 50.5);
    expect(turned(c0.wheels[0]!, c1.wheels[0]!)).toBeLessThan(turned(c0.wheels[1]!, c1.wheels[1]!));
  });

  it('stejný čas = stejná póza (i po mnoha kolech uzavřené trasy)', () => {
    const t = 3600 * 5 + 17.3;
    expect(pose('two', LOOP, t)).toEqual(pose('two', LOOP, t));
    const p = pose('two', LOOP, t);
    const tip = inFrame(p.body, CART_PARTS.two.poleTip.z, CART_PARTS.two.poleTip.y);
    expect(distance(tip, [p.yoke.x, p.yoke.y, p.yoke.z])).toBeLessThan(0.03);
  });
});

describe('čtyřkolák', () => {
  it('na rovině: nápravy po rozvoru za sebou, oj od rozvory ke jhu', () => {
    const p = pose('four', STRAIGHT, 100);
    const front = p.wheels[0]!;
    const back = p.wheels[2]!;
    expect(front.z - back.z).toBeCloseTo(CART_PARTS.four.wheelbase * k, 3);
    expect(p.yoke.z - (front.z + 0)).toBeCloseTo(CART_PARTS.four.yokeReach * k, 2);
    const tip = inFrame(p.front, CART_PARTS.four.houndsTip.z, CART_PARTS.four.houndsTip.y);
    expect(distance(tip, [p.pole.ax, p.pole.ay, p.pole.az])).toBeLessThan(1e-9);
    expect(p.pole.by).toBeCloseTo(p.yoke.y, 9);
    // oj zhruba délky modelu (scéna ji natáhne jen málo)
    const poleLength = Math.hypot(
      p.pole.bx - p.pole.ax,
      p.pole.by - p.pole.ay,
      p.pole.bz - p.pole.az,
    );
    expect(poleLength / k).toBeGreaterThan(CART_PARTS.four.poleM * 0.9);
    expect(poleLength / k).toBeLessThan(CART_PARTS.four.poleM * 1.15);
    expect(p.body.uy).toBeGreaterThan(0.999);
  });

  it('v oblouku se předek natáčí ke jhu víc než korba', () => {
    const p = pose('four', LOOP, 12);
    // někde v oblouku: předek a korba míří jinam
    let found = false;
    for (let t = 0; t < LOOP.length / CART_SPEED_M_S; t += 0.5) {
      const q = pose('four', LOOP, t);
      const dot = q.front.fx * q.body.fx + q.front.fz * q.body.fz;
      if (dot < Math.cos((8 * Math.PI) / 180)) found = true;
    }
    expect(found).toBe(true);
    expect(p.wheels.length).toBe(4);
  });

  it('do kopce leží korba na obou nápravách', () => {
    const slope = (_x: number, z: number): number => 0.1 * z;
    const p = pose('four', STRAIGHT, 230, slope);
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
      for (const cargo of ['hay', 'sheaves', 'logs', 'goods']) {
        expect(names).toContain(`${prefix}-${cargo}`);
      }
    }
    for (const part of [
      'wagon2-body',
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
    expect(two.max[2]! - 0.05).toBeCloseTo(CART_PARTS.two.poleTip.z, 1);
    expect(two.max[1]).toBeGreaterThan(TEAM_PARTS.yokeY);
    expect(two.max[1]).toBeLessThan(TEAM_PARTS.yokeY + 0.1);
    expect(two.max[0]).toBeCloseTo(CART_PARTS.two.halfWidth, 1);
    const front = bounds('wagon4-front');
    expect(front.max[2]).toBeCloseTo(CART_PARTS.four.houndsTip.z, 2);
    expect(front.max[1]).toBeGreaterThan(CART_PARTS.four.houndsTip.y);
    const pole = bounds('wagon4-pole');
    expect(pole.max[2]).toBeCloseTo(CART_PARTS.four.poleM, 2);
    const body4 = bounds('wagon4-body');
    expect(body4.max[2]).toBeCloseTo(CART_PARTS.four.front, 1);
    expect(-body4.min[2]!).toBeCloseTo(CART_PARTS.four.back, 1);
  });
});
