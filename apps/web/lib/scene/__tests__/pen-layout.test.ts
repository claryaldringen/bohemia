import { describe, expect, it } from 'vitest';
import { penEntrance, turnRotation, type Position } from '@bohemia/game';
import {
  PEN_FENCE,
  PEN_MODEL_PARTS,
  PEN_PHASES,
  PEN_PROPS,
  PEN_THATCH_COURSES,
  SHELTER_M,
  TRAINEE_SCALE,
  insidePen,
  penAnimalPose,
  penAnimalsFor,
  penConstructionParts,
  penFacing,
  penFenceStage,
  penLayout,
  penMudAt,
  penPartPlace,
  penPhase,
  penStage,
  penStakingLine,
  type PenLayout,
} from '../pen-layout';
import { WOVEN_CORNER_RADIUS_M, fencePosts, wovenFence } from '../woven-fence';

const square = { x: 37.5, z: -22.5, size: 15 };
const dot = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  a.x * b.x + a.z * b.z;
const rel = (layout: PenLayout, p: { x: number; z: number }): { x: number; z: number } => ({
  x: p.x - layout.square.x,
  z: p.z - layout.square.z,
});

/** Bod modelu (x napříč, z dopředu) natočeného jako `at` ve světě. */
function world(at: Position, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(at.rotation);
  const s = Math.sin(at.rotation);
  return { x: at.x + lx * c + lz * s, z: at.z - lx * s + lz * c };
}

/** Rohy střechy přístřešku ve světě. */
function roofCorners(layout: PenLayout): { x: number; z: number }[] {
  const { halfLength: h, front, back } = SHELTER_M;
  return [
    world(layout.shelter, -h, front),
    world(layout.shelter, h, front),
    world(layout.shelter, h, -back),
    world(layout.shelter, -h, -back),
  ];
}

/** Bod pod střechou přístřešku (v osách přístřešku)? */
function underRoof(layout: PenLayout, p: { x: number; z: number }, margin = 0): boolean {
  const c = Math.cos(layout.shelter.rotation);
  const s = Math.sin(layout.shelter.rotation);
  const dx = p.x - layout.shelter.x;
  const dz = p.z - layout.shelter.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    Math.abs(lx) <= SHELTER_M.halfLength - margin &&
    lz <= SHELTER_M.front - margin &&
    lz >= -SHELTER_M.back + margin
  );
}

/** Jak hluboko uvnitř obdélníku plotu se zakulacenými rohy bod leží (m, záporně = venku). */
function depthInside(layout: PenLayout, p: { x: number; z: number }): number {
  const r = layout.fenceRect;
  const k = WOVEN_CORNER_RADIUS_M;
  const edge = Math.min(p.x - r.minX, r.maxX - p.x, p.z - r.minZ, r.maxZ - p.z);
  const qx = Math.max(r.minX + k - p.x, p.x - (r.maxX - k), 0);
  const qz = Math.max(r.minZ + k - p.z, p.z - (r.maxZ - k), 0);
  return qx > 0 && qz > 0 ? Math.min(edge, k - Math.hypot(qx, qz)) : edge;
}

const FACINGS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
  { x: 0.8, z: 0.6 },
  { x: -0.3, z: -0.95 },
  { x: 2, z: -0.4 },
];

describe('ohrada – rozmístění', () => {
  it('branka leží na straně plotu ke vsi; kůly u ní jsou krajní a vyšší', () => {
    for (const facing of FACINGS) {
      const layout = penLayout(square, facing);
      const half = square.size / 2 - 1.5;
      // strana podle převažující osy směru
      expect(dot(rel(layout, layout.gate), layout.front)).toBeCloseTo(half, 6);
      expect(dot(layout.front, facing)).toBeGreaterThan(0);
      const posts = layout.fence.runs[0]!.posts;
      expect(posts[0]!.gate).toBe(true);
      expect(posts[posts.length - 1]!.gate).toBe(true);
      const a = posts[0]!;
      const b = posts[posts.length - 1]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(PEN_FENCE.gateWidth, 6);
      // díl branky (žerdě podél osy x) leží podél plotu mezi kůly branky
      const ax = { x: Math.cos(layout.gate.rotation), z: -Math.sin(layout.gate.rotation) };
      expect(Math.abs(dot(ax, layout.front))).toBeLessThan(1e-9);
    }
  });

  it('branka = vchod z jádra (penEntrance) – i u natočené ohrady; jako dřív', () => {
    for (const rotation of [undefined, turnRotation(2), turnRotation(6), turnRotation(9)]) {
      const sq = rotation === undefined ? square : { ...square, rotation };
      for (const facing of FACINGS) {
        const layout = penLayout(sq, facing);
        const core = penEntrance(sq, facing);
        expect(Math.hypot(layout.gate.x - core.x, layout.gate.z - core.z)).toBeLessThan(1e-6);
        // ven ze středu ohrady
        expect(Math.hypot(core.outX, core.outZ)).toBeCloseTo(1, 9);
        expect(dot({ x: core.outX, z: core.outZ }, rel(layout, core))).toBeCloseTo(
          sq.size / 2 - 1.5,
          6,
        );
      }
    }
    // dřív: branka nejblíž k bodu půl strany plotu + 1 m od středu ve směru `facing`
    for (const facing of FACINGS) {
      const half = square.size / 2 - 1.5;
      const length = Math.hypot(facing.x, facing.z);
      const toward = {
        x: square.x + (facing.x / length) * (half + 1),
        z: square.z + (facing.z / length) * (half + 1),
      };
      const rect: [number, number][] = [
        [square.x - half, square.z - half],
        [square.x + half, square.z - half],
        [square.x + half, square.z + half],
        [square.x - half, square.z + half],
      ];
      const posts = wovenFence([{ points: rect, closed: true }], PEN_FENCE, { toward }).runs[0]!
        .posts;
      const a = posts[0]!;
      const b = posts[posts.length - 1]!;
      const core = penEntrance(square, facing);
      expect(Math.hypot((a.x + b.x) / 2 - core.x, (a.z + b.z) / 2 - core.z)).toBeLessThan(1e-6);
    }
  });

  it('branka se posune po své straně k cíli (směr mimo osu)', () => {
    const toward = { x: square.x + 20, z: square.z + 9 };
    const layout = penLayout(square, penFacing(square, toward));
    expect(layout.front).toEqual({ x: 1, z: 0 });
    expect(layout.gate.z).toBeGreaterThan(square.z + 1);
  });

  it('přístřešek stojí v zadním rohu proti brance, otevřený dopředu, celý uvnitř plotu', () => {
    for (const facing of FACINGS) {
      const layout = penLayout(square, facing);
      const r = rel(layout, layout.shelter);
      expect(dot(r, layout.front)).toBeLessThan(-3.5);
      expect(dot(r, layout.side)).toBeGreaterThan(3);
      // +z přístřešku míří k brance
      const open = { x: Math.sin(layout.shelter.rotation), z: Math.cos(layout.shelter.rotation) };
      expect(dot(open, layout.front)).toBeCloseTo(1, 9);
      // střecha i v zakulaceném rohu nechá místo pro plot (větve obcházejí kůly ± 6,5 cm)
      for (const corner of roofCorners(layout)) {
        expect(depthInside(layout, corner)).toBeGreaterThan(0.15);
      }
    }
  });

  it('přístřešek jde do rohu proti směru, kam se cesta ke vsi stáčí (branka a přístřešek naproti)', () => {
    const left = penLayout(square, { x: 1, z: 0.4 });
    const right = penLayout(square, { x: 1, z: -0.4 });
    expect(left.side.z).toBeLessThan(0);
    expect(right.side.z).toBeGreaterThan(0);
    expect(Math.sign(left.shelter.z - square.z)).toBe(-Math.sign(left.gate.z - square.z));
  });

  it('při směru přesně podél osy rozhodne o rohu čtverec – deterministicky', () => {
    const sides = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const sq = { x: 7.5 + 15 * i, z: 22.5, size: 15 };
      const a = penLayout(sq, { x: 0, z: -1 });
      expect(penLayout(sq, { x: 0, z: -3 })).toEqual(a);
      sides.add(Math.sign(a.side.x));
    }
    expect(sides.size).toBe(2);
  });

  it('jesle stojí pod střechou u zadní stěny, žlab vedle přístřešku podél bočního plotu', () => {
    for (const facing of FACINGS) {
      const layout = penLayout(square, facing);
      // jesle: přední žerď (0,34 m před počátkem) i zadní nohy (0,3 m za ním) pod střechou
      expect(underRoof(layout, world(layout.hayRack, 0, 0.95), 0)).toBe(true);
      expect(underRoof(layout, world(layout.hayRack, -1.2, -0.3), 0)).toBe(true);
      expect(underRoof(layout, world(layout.hayRack, 1.2, -0.3), 0)).toBe(true);
      // žlab: celý uvnitř plotu, mimo střechu, kousek od přístřešku
      for (const [lx, lz] of [
        [-1, -0.38],
        [1, -0.38],
        [1, 0.38],
        [-1, 0.38],
      ] as const) {
        const p = world(layout.trough, lx, lz);
        expect(depthInside(layout, p)).toBeGreaterThan(0.3);
        expect(underRoof(layout, p)).toBe(false);
      }
      expect(
        Math.hypot(layout.trough.x - layout.shelter.x, layout.trough.z - layout.shelter.z),
      ).toBeLessThan(5);
      // osa žlabu podél boční strany (kolmo k brance)
      const ax = { x: Math.cos(layout.trough.rotation), z: -Math.sin(layout.trough.rotation) };
      expect(Math.abs(dot(ax, layout.front))).toBeCloseTo(1, 9);
    }
  });

  it('stoh, rekvizity a zvířata stojí uvnitř plotu a mimo přístřešek a žlab', () => {
    for (const facing of FACINGS) {
      const layout = penLayout(square, facing);
      // stoh má poloměr ≈ 0,9 m
      expect(depthInside(layout, layout.haystack)).toBeGreaterThan(1.1);
      expect(underRoof(layout, layout.haystack, -0.9)).toBe(false);
      for (const prop of PEN_PROPS) {
        const at = layout.props[prop];
        expect(depthInside(layout, at)).toBeGreaterThan(2);
        expect(underRoof(layout, at, -1)).toBe(false);
      }
      expect(layout.animals.map((a) => a.kind).sort()).toEqual(['cow', 'ox', 'ox']);
      for (const animal of layout.animals) {
        expect(depthInside(layout, animal)).toBeGreaterThan(1.2);
        expect(insidePen(layout, animal.x, animal.z, 1)).toBe(true);
      }
      for (let i = 0; i < layout.animals.length; i++) {
        for (let j = i + 1; j < layout.animals.length; j++) {
          const a = layout.animals[i]!;
          const b = layout.animals[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2.5);
        }
      }
      // vůl u žlabu míří hlavou ke žlabu, vůl u jeslí pod střechu
      const drink = layout.animals.find((a) => a.activity === 'drink')!;
      const head = {
        x: drink.x + Math.sin(drink.heading) * 1.3,
        z: drink.z + Math.cos(drink.heading) * 1.3,
      };
      expect(Math.hypot(head.x - layout.trough.x, head.z - layout.trough.z)).toBeLessThan(1.2);
      const hay = layout.animals.find((a) => a.activity === 'hay')!;
      expect(
        underRoof(layout, { x: hay.x + Math.sin(hay.heading), z: hay.z + Math.cos(hay.heading) }),
      ).toBe(true);
    }
  });

  it('kůly plotu nejvýš po metru, zakulacené rohy; vytyčení po obdélníku plotu', () => {
    const layout = penLayout(square, { x: 0, z: -1 });
    const posts = fencePosts(layout.fence);
    for (let i = 0; i + 1 < posts.length; i++) {
      const a = posts[i]!;
      const b = posts[i + 1]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(PEN_FENCE.postStep + 1e-9);
    }
    const r = layout.fenceRect;
    const nearest = Math.min(...posts.map((p) => Math.hypot(p.x - r.minX, p.z - r.minZ)));
    expect(nearest).toBeCloseTo((Math.SQRT2 - 1) * WOVEN_CORNER_RADIUS_M, 1);
    const line = penStakingLine(layout);
    expect(line[0]).toEqual(line[line.length - 1]);
    expect(line).toHaveLength(5);
  });

  it('díly mají své místo: přístřešek, jesle, žlab, branka, rekvizity', () => {
    const layout = penLayout(square, { x: 1, z: 0 });
    expect(penPartPlace(layout, 'shelter')).toBe(layout.shelter);
    expect(penPartPlace(layout, 'thatch-3')).toBe(layout.shelter);
    expect(penPartPlace(layout, 'hay-rack')).toBe(layout.hayRack);
    expect(penPartPlace(layout, 'hay')).toBe(layout.hayRack);
    expect(penPartPlace(layout, 'trough-log')).toBe(layout.trough);
    expect(penPartPlace(layout, 'gate')).toBe(layout.gate);
    expect(penPartPlace(layout, 'straw')).toBe(layout.props.straw);
    expect(PEN_MODEL_PARTS).toEqual(['shelter', 'hay-rack', 'trough', 'gate']);
  });

  it('bláto: venku nic, uvnitř ušlapaná země, u žlabu a v brance souvisle', () => {
    const layout = penLayout(square, { x: 0.9, z: 0.2 });
    const r = layout.fenceRect;
    expect(penMudAt(layout, r.minX - 0.5, square.z)).toBe(0);
    expect(penMudAt(layout, r.minX + 0.05, r.minZ + 0.05)).toBe(0);
    expect(penMudAt(layout, layout.trough.x, layout.trough.z)).toBeGreaterThan(0.95);
    const inner = {
      x: layout.gate.x - layout.front.x * 1.2,
      z: layout.gate.z - layout.front.z * 1.2,
    };
    expect(penMudAt(layout, inner.x, inner.z)).toBeGreaterThan(0.9);
    for (let i = 0; i < 40; i++) {
      const x = r.minX + 2 + ((i * 7) % 10);
      const z = r.minZ + 2 + ((i * 3) % 10);
      const mud = penMudAt(layout, x, z);
      expect(mud).toBeGreaterThanOrEqual(0.39);
      expect(mud).toBeLessThanOrEqual(1);
    }
  });
});

describe('ohrada – fáze stavby', () => {
  it('fáze navazují: vytyčení → kůly → proplétání → sloupy přístřešku → stěna → došky → žlab a seno', () => {
    expect(PEN_PHASES.map((p) => p.id)).toEqual([
      'layout',
      'posts',
      'weave',
      'frame',
      'wall',
      'thatch',
      'finish',
    ]);
    expect(PEN_PHASES[0]!.from).toBe(0);
    expect(PEN_PHASES[PEN_PHASES.length - 1]!.to).toBe(1);
    for (let i = 1; i < PEN_PHASES.length; i++) {
      expect(PEN_PHASES[i]!.from).toBe(PEN_PHASES[i - 1]!.to);
    }
    expect(penPhase(0).id).toBe('layout');
    expect(penPhase(1).id).toBe('finish');
  });

  it('díly staveniště jsou díly z pen-construction.glb a objevují se po fázích', () => {
    const parts = penConstructionParts();
    expect(new Set(parts).size).toBe(parts.length);
    for (let k = 1; k <= PEN_THATCH_COURSES; k++) expect(parts).toContain(`thatch-${k}`);
    const firstAt = (part: string): number => {
      for (let p = 0; p <= 1; p += 0.001) if (penStage(p).parts.includes(part)) return p;
      return Infinity;
    };
    const order = [
      'gate',
      'posts',
      'plates',
      'rafters-1',
      'laths',
      'wattle-1',
      'thatch-1',
      'thatch-9',
      'binding',
      'trough',
      'rack',
      'hay',
    ];
    for (let i = 1; i < order.length; i++) {
      expect(firstAt(order[i]!), order[i]).toBeGreaterThan(firstAt(order[i - 1]!));
    }
    // kmen se vydlabe na žlab – oba současně nestojí
    for (let p = 0; p < 1; p += 0.002) {
      const stage = penStage(p);
      expect(stage.parts.includes('trough-log') && stage.parts.includes('trough')).toBe(false);
    }
  });

  it('plot: nejdřív všechny kůly, pak větve; vytyčení zmizí se zatlučením kůlů', () => {
    const layout = penLayout(square, { x: 0, z: 1 });
    let lastPosts = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      const stage = penStage(p);
      expect(stage.fence.posts).toBeGreaterThanOrEqual(lastPosts);
      lastPosts = stage.fence.posts;
      if (stage.fence.rails > 0) expect(stage.fence.posts).toBe(1);
      const fence = penFenceStage(layout, stage);
      if (fence.rails.length > 0) expect(fence.posts).toHaveLength(fencePosts(layout.fence).length);
    }
    expect(penStage(0.02).staking).toBe(true);
    expect(penStage(0.3).staking).toBe(false);
    const built = penStage(1);
    expect(built.built).toBe(true);
    expect(built.fence).toEqual({ posts: 1, rails: 1 });
    expect(built.mud).toBe(1);
    expect(built.haystack).toBe(1);
    expect(penStage(0.999).built).toBe(false);
  });

  it('rekvizity: hráň ubývá s kůly a sloupy, pruty s výpletem, sláma s došky', () => {
    const scale = (p: number, prop: string): number =>
      penStage(p).props.find((x) => x.prop === prop)?.scale ?? 0;
    expect(scale(0.1, 'timber')).toBeGreaterThan(scale(0.5, 'timber'));
    expect(scale(0.5, 'timber')).toBeGreaterThan(0);
    expect(scale(0.7, 'timber')).toBe(0);
    expect(scale(0.3, 'rods')).toBeGreaterThan(scale(0.65, 'rods'));
    expect(scale(0.7, 'straw')).toBeGreaterThan(scale(0.85, 'straw'));
    expect(penStage(1).props).toEqual([]);
  });
});

describe('ohrada – zvířata', () => {
  it('póza je čistá funkce času: stojí na místě, natáčí se nejvýš o 0,3 rad, hlava 0–1', () => {
    const layout = penLayout(square, { x: 1, z: 0.2 });
    for (const animal of layout.animals) {
      expect(penAnimalPose(animal, 1234.5)).toEqual(penAnimalPose(animal, 1234.5));
      let lowest = 1;
      for (let t = 0; t < 600; t += 0.7) {
        const pose = penAnimalPose(animal, t);
        expect(pose.x).toBe(animal.x);
        expect(pose.z).toBe(animal.z);
        expect(Math.abs(pose.heading - animal.heading)).toBeLessThanOrEqual(0.3 + 1e-9);
        expect(pose.head).toBeGreaterThanOrEqual(0);
        expect(pose.head).toBeLessThanOrEqual(1);
        lowest = Math.min(lowest, pose.head);
      }
      // hlavu občas zvedne
      expect(lowest).toBeLessThan(0.3);
    }
  });
});

describe('penAnimalsFor – skutečná zvířata ohrady (oxen.md)', () => {
  const layout = penLayout(square, { x: 0, z: -1 });

  it('voli spřežení u žlabu a jeslí, pak telata (menší), pak krávy; nejvýš kolik je míst', () => {
    const animals = penAnimalsFor(layout, { oxen: 2, trainees: 2, cows: 3 });
    expect(animals.map((a) => a.kind)).toEqual(['ox', 'ox', 'ox', 'ox', 'cow', 'cow', 'cow']);
    expect(animals[0]!.activity).toBe('drink');
    expect(animals[1]!.activity).toBe('hay');
    expect(animals[0]!.scale).toBeUndefined();
    expect(animals[2]!.scale).toBe(TRAINEE_SCALE);
    expect(penAnimalsFor(layout, { oxen: 0, trainees: 0, cows: 0 })).toEqual([]);
    expect(penAnimalsFor(layout, { oxen: 2, trainees: 2, cows: 50 })).toHaveLength(
      layout.spots.length,
    );
    // ukázka – dva voli a kráva
    expect(layout.animals.map((a) => a.kind)).toEqual(['ox', 'ox', 'cow']);
  });

  it('místa stojí uvnitř plotu, mimo přístřešek a aspoň 2 m od sebe', () => {
    const roof = roofCorners(layout);
    const minX = Math.min(...roof.map((p) => p.x));
    const maxX = Math.max(...roof.map((p) => p.x));
    const minZ = Math.min(...roof.map((p) => p.z));
    const maxZ = Math.max(...roof.map((p) => p.z));
    layout.spots.forEach((spot, i) => {
      expect(insidePen(layout, spot.x, spot.z, 1)).toBe(true);
      // jen místo u jeslí stojí pod střechou přístřešku
      if (i !== 1) {
        const under = spot.x > minX && spot.x < maxX && spot.z > minZ && spot.z < maxZ;
        expect(under).toBe(false);
      }
      for (const other of layout.spots.slice(i + 1)) {
        expect(Math.hypot(other.x - spot.x, other.z - spot.z)).toBeGreaterThan(2);
      }
    });
  });
});

describe('ohrada o víc čtvercích (oxen.md – Ohrady podle druhu)', () => {
  const first = { x: 37.5, z: -22.5, size: 15 };
  const right = { x: 52.5, z: -22.5 };
  const up = { x: 37.5, z: -7.5 };
  const toward = { x: 37.5, z: -80 };

  it('plot obejme oba čtverce, uvnitř je celá plocha bez švu, vytyčení po obrysu', () => {
    const layout = penLayout(first, penFacing(first, toward), [right]);
    expect(layout.squares).toHaveLength(2);
    // obrys plotu odsazený o 1,5 m dovnitř – obdélník 27 × 12 m
    expect(layout.fenceRect).toEqual({ minX: 31.5, maxX: 58.5, minZ: -28.5, maxZ: -16.5 });
    expect(layout.outline).toHaveLength(4);
    for (const p of [
      { x: 38, z: -22 },
      { x: 45, z: -22 },
      { x: 58, z: -18 },
    ]) {
      expect(insidePen(layout, p.x, p.z)).toBe(true);
    }
    expect(insidePen(layout, 61, -22)).toBe(false);
    // na vnitřní hraně čtverců je bláto jako uprostřed (žádný šev)
    expect(penMudAt(layout, 45, -22)).toBeGreaterThan(0);
    expect(penStakingLine(layout)).toHaveLength(5);
    // místa pro zvířata i ve druhém čtverci
    expect(layout.spots.some((s) => s.x > 45)).toBe(true);
    // branka v plotu (z jádra – stejně jako vchod sítě pěšin)
    const posts = fencePosts(layout.fence).filter((p) => p.gate);
    expect(posts).toHaveLength(2);
    expect(Math.min(...posts.map((p) => p.z))).toBeCloseTo(-28.5, 6);
  });

  it('tvar L: plot po obrysu se šesti rohy, přístřešek zády a bokem k vnějšímu plotu', () => {
    const layout = penLayout(first, penFacing(first, toward), [right, up]);
    expect(layout.outline).toHaveLength(6);
    expect(insidePen(layout, 52, -8)).toBe(false);
    expect(insidePen(layout, 38, -10)).toBe(true);
    // přístřešek stojí v prvním čtverci u vnějšího plotu – ne u souseda
    const shelter = rel(layout, layout.shelter);
    expect(Math.abs(shelter.x)).toBeLessThan(7.5);
    expect(Math.abs(shelter.z)).toBeLessThan(7.5);
    const back = { x: -layout.front.x, z: -layout.front.z };
    const neighbours = [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ];
    expect(neighbours.some((n) => dot(n, back) > 0.5)).toBe(false);
    expect(neighbours.some((n) => dot(n, layout.side) > 0.5)).toBe(false);
  });

  it('jeden čtverec beze změny', () => {
    const a = penLayout(first, penFacing(first, toward));
    const b = penLayout(first, penFacing(first, toward), []);
    expect(b).toEqual(a);
    expect(a.fenceRects).toEqual([a.fenceRect]);
  });

  it('ovce, kozy a prasata na noc na místa ohrady (den a noc je zapne)', () => {
    const layout = penLayout(first, penFacing(first, toward), [right]);
    const animals = penAnimalsFor(layout, { oxen: 0, trainees: 0, cows: 0, sheep: 5 });
    expect(animals.map((a) => a.kind)).toEqual(['sheep', 'sheep', 'sheep', 'sheep', 'sheep']);
    expect(layout.spots.length).toBeGreaterThan(12);
  });
});

describe('ohrada koní (horses.md – Ohrada koní, Ve scéně)', () => {
  const facing = { x: 0, z: -1 };
  const horsePen = (extra: { x: number; z: number }[] = []): PenLayout =>
    penLayout(square, facing, extra, 'horse');
  const top = (l: PenLayout): number => Math.max(...l.fenceStyle.rails);

  it('plot je vyšší než plot ostatních ohrad (≈ 1,4 m), jinak stejný styl', () => {
    expect(top(penLayout(square, facing))).toBeCloseTo(0.94, 6);
    expect(top(horsePen())).toBeGreaterThanOrEqual(1.3);
    expect(top(horsePen())).toBeLessThanOrEqual(1.4);
    expect(horsePen().fenceStyle.gateWidth).toBe(PEN_FENCE.gateWidth);
  });

  it('4 místa na čtverec, rozestoupená aspoň 2,5 m', () => {
    expect(horsePen().spots).toHaveLength(4);
    const two = horsePen([{ x: square.x + 15, z: square.z }]);
    expect(two.spots).toHaveLength(8);
    for (const l of [horsePen(), two]) {
      for (const a of l.spots) {
        for (const b of l.spots) {
          if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2.5);
        }
      }
    }
    // ostatní druhy beze změny
    expect(penLayout(square, facing).spots).toHaveLength(12);
  });

  it('hříbě stojí u klisny bez vlastního místa; koně nad místa se nevejdou', () => {
    const layout = horsePen();
    const animals = penAnimalsFor(layout, {
      oxen: 0,
      trainees: 0,
      cows: 0,
      horses: ['mare', 'foal', 'riding'],
    });
    expect(animals.map((a) => a.kind)).toEqual(['horse', 'horse', 'foal']);
    const mare = animals[0]!;
    const foal = animals[2]!;
    expect(Math.hypot(foal.x - mare.x, foal.z - mare.z)).toBeLessThan(2.2);
    expect(foal.scale).toBeUndefined();
    const full = penAnimalsFor(layout, {
      oxen: 0,
      trainees: 0,
      cows: 0,
      horses: ['mare', 'mare', 'mare', 'mare', 'riding', 'foal', 'foal'],
    });
    expect(full.filter((a) => a.kind === 'horse')).toHaveLength(4);
    expect(full.filter((a) => a.kind === 'foal')).toHaveLength(2);
  });

  it('koně se nemíchají s jinými zvířaty ohrady', () => {
    const animals = penAnimalsFor(horsePen(), {
      oxen: 2,
      trainees: 0,
      cows: 1,
      horses: ['mare'],
    });
    expect(animals.map((a) => a.kind)).toEqual(['horse']);
  });

  it('plot staveniště nese styl ohrady (kůly a větve do výšky plotu)', () => {
    const layout = horsePen();
    const stage = penFenceStage(layout, penStage(1));
    expect(stage).toBeDefined();
  });
});
