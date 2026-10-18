import { describe, expect, it } from 'vitest';
import type { LaborShare, SceneLaborShare, SceneVillage } from '../../village-view';
import { chickenBox } from '../livestock-placement';
import { localToWorld } from '../village-layout';
import { createVillagerPose, walkThen, type HerdView, type VillagerPose } from '../villager-motion';
import {
  FIGURE_SCALE,
  MAX_ELDERS,
  MAX_WORKERS,
  crewSplit,
  elderCount,
  figureCounts,
  shareCounts,
  planVillagers,
  walkRoute,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPaths,
} from '../villager-plan';

/** Potok v pásu z ∈ (60, 70) – jinak všude suchá schůdná louka; strom 501 a 502 v lese. */
const GROUND: VillagerGround = {
  walkable: (x, z) => !(z > 60 && z < 70) && Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: (id) => (id === 501 ? { x: -40, z: -30 } : id === 502 ? { x: -44, z: -33 } : null),
  treesIn: () => [],
};

const square = (cx: number, cy: number, stage: 'sown' | 'founding' | 'ready' = 'sown') => ({
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage,
});

const house = (
  id: number,
  x: number,
  z: number,
  rotation = 0,
  built = true,
  type: 'zemnice' | 'polozemnice' = 'zemnice',
) => ({
  id,
  type,
  position: { x, z, rotation },
  built,
  progress: built ? 1 : 0.6,
  inhabited: built,
});

function village(
  shares: LaborShare[],
  month = 7,
  people = { children: 4, adults: 6, elders: 2 },
): SceneVillage {
  return {
    dwellings: [
      house(1, 0, 0),
      house(2, 14, 3, 0.5),
      house(3, -12, 6, Math.PI),
      house(90, 0, 30, 0, false),
    ],
    fields: [{ id: 7, parts: [square(2, 0), square(3, 0), square(2, 1)] }],
    cemeteries: [
      {
        id: 8,
        squares: [{ cell: { x: -3, y: -3 }, x: -37.5, z: -37.5, size: 15 }],
        built: true,
        progress: 1,
        graves: 10,
      },
    ],
    labor: { day: 1000, month, people, shares },
  };
}

const SHARES: LaborShare[] = [
  { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 3 },
  { activity: 'carry', target: { kind: 'field', id: 7 }, manDays: 2 },
  { activity: 'build', target: { kind: 'site', id: 90 }, manDays: 1.5 },
  { activity: 'fell', target: { kind: 'trees', ids: [501, 502] }, manDays: 2 },
  { activity: 'domestic', target: { kind: 'village' }, manDays: 4 },
  { activity: 'thresh', target: { kind: 'village' }, manDays: 0.2 },
  { activity: 'idle', target: { kind: 'village' }, manDays: 1 },
];

const HERDS: HerdView[] = [
  { x: 120, z: 120, radiusM: 6, moving: 0, headingX: 1, headingZ: 0 },
  { x: -150, z: 100, radiusM: 6, moving: 1, headingX: 0, headingZ: 1 },
];

/** Póza postavy v čase t (s). */
const at = (person: PlannedVillager, t: number): VillagerPose =>
  person.pose(t, HERDS, createVillagerPose());

/** Bod v obdélníku domu se šíjí (jako slepice – livestock-placement.chickenBox). */
function inHouse(v: SceneVillage, x: number, z: number): boolean {
  return v.dwellings.some((d) => {
    if (!d.built) return false;
    const box = chickenBox(d.type);
    const c = Math.cos(d.position.rotation);
    const s = Math.sin(d.position.rotation);
    const lx = (x - d.position.x) * c - (z - d.position.z) * s;
    const lz = (x - d.position.x) * s + (z - d.position.z) * c;
    const plot = d.plot;
    const inPlot =
      plot !== undefined &&
      Math.abs(x - plot.x) < plot.size / 2 &&
      Math.abs(z - plot.z) < plot.size / 2;
    return inPlot || (Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ);
  });
}

describe('figureCounts – člověkodny na postavy', () => {
  it('celkem zaokrouhlený součet, rozdělený největšími zbytky', () => {
    const counts = figureCounts(
      [
        { activity: 'harvest', manDays: 2.6 },
        { activity: 'carry', manDays: 1.7 },
        { activity: 'build', manDays: 0.7 },
      ],
      7,
    );
    expect(counts).toEqual([2, 2, 1]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('domácí práce a nečinní jsou venku jen z části – v zimě méně', () => {
    const shares = [
      { activity: 'domestic' as const, manDays: 4 },
      { activity: 'idle' as const, manDays: 2 },
      { activity: 'thresh' as const, manDays: 2 },
    ];
    expect(figureCounts(shares, 7)).toEqual([2, 2, 2]);
    const winter = figureCounts(shares, 1);
    expect(winter[2]).toBe(2);
    expect(winter[0]! + winter[1]!).toBeLessThan(3);
  });

  it('nejvýš MAX_WORKERS – velká ves se zmenší poměrně', () => {
    const counts = figureCounts(
      [
        { activity: 'harvest', manDays: 90 },
        { activity: 'carry', manDays: 60 },
      ],
      8,
    );
    expect(counts).toEqual([36, 24]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(MAX_WORKERS);
  });

  it('bez práce nikdo', () => {
    expect(figureCounts([], 5)).toEqual([]);
    expect(figureCounts([{ activity: 'dig', manDays: 0.2 }], 5)).toEqual([0]);
  });

  it('lidé pracují pohromadě – po skupinách až čtyř tam, kde je práce nejvíc', () => {
    expect(crewSplit([0.1, 0.1, 0.3, 0.1], 5, 4)).toEqual([1, 0, 4, 0]);
    expect(crewSplit([1, 1], 8, 4)).toEqual([4, 4]);
    expect(crewSplit([1, 2], 0, 4)).toEqual([0, 0]);
    // žeň na 30 malých polích: 3 žnečky na jednom poli, ne každá na jiném
    const fields: LaborShare[] = Array.from({ length: 30 }, (_, i) => ({
      activity: 'harvest',
      target: { kind: 'field', id: i },
      manDays: 0.1 + (i === 7 ? 0.01 : 0),
    }));
    const counts = shareCounts(fields, 7);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts[7]).toBe(3);
  });

  it('starší: na dva jedna postava, nejvýš MAX_ELDERS, v zimě polovina', () => {
    expect(elderCount(0, false)).toBe(0);
    expect(elderCount(3, false)).toBe(2);
    expect(elderCount(40, false)).toBe(MAX_ELDERS);
    expect(elderCount(40, true)).toBe(MAX_ELDERS / 2);
  });
});

describe('planVillagers – kdo kde je', () => {
  const v = village(SHARES);
  const people = planVillagers(v, GROUND, { seed: 3, herds: 2 });
  const keys = people.map((p) => p.key);
  const of = (prefix: string): PlannedVillager[] => people.filter((p) => p.key.startsWith(prefix));

  it('postavy podle práce dne + starší u domů + pasáček u každého stáda', () => {
    expect(of('harvest:').length).toBe(3);
    expect(of('carry:').length).toBe(2);
    expect(of('domestic:').length).toBe(2); // v létě venku polovina
    expect(of('elder:').length).toBe(1);
    expect(of('herder:').length).toBe(2);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('je deterministický – stejná ves, stejný čas = stejní lidé na stejných místech', () => {
    const again = planVillagers(v, GROUND, { seed: 3, herds: 2 });
    expect(again.map((p) => p.key)).toEqual(keys);
    for (let i = 0; i < people.length; i++) {
      expect(at(again[i]!, 12345.6)).toEqual(at(people[i]!, 12345.6));
      expect(again[i]!.look).toEqual(people[i]!.look);
    }
  });

  it('žnou na osévaných čtvercích pole', () => {
    for (const p of of('harvest:')) {
      for (const t of [0, 7, 33, 120]) {
        const pose = at(p, t);
        const on = v.fields[0]!.parts.some(
          (s) => Math.abs(pose.x - s.x) <= s.size / 2 && Math.abs(pose.z - s.z) <= s.size / 2,
        );
        expect(on).toBe(true);
        expect(['reap', 'walk']).toContain(pose.clip);
      }
    }
  });

  it('nikdo nestojí ve vodě, v domě ani na hrobech – ani při chůzi', () => {
    for (const p of people.filter((x) => !x.key.startsWith('herder:'))) {
      for (let t = 0; t < 300; t += 1.7) {
        const { x, z } = at(p, t);
        expect(GROUND.walkable(x, z), `${p.key} ve vodě v ${t}`).toBe(true);
        expect(inHouse(v, x, z), `${p.key} v domě v ${t}`).toBe(false);
        expect(Math.abs(x + 37.5) < 7.3 && Math.abs(z + 37.5) < 7.3, `${p.key} na hrobě`).toBe(
          false,
        );
      }
    }
  });

  it('nosiči chodí mezi obydlím a polem – s nůší zpět', () => {
    const carrier = of('carry:')[0]!;
    const clips = new Set<string>();
    for (let t = 0; t < 200; t += 0.5) clips.add(at(carrier, t).clip);
    expect(clips).toContain('walk');
    expect(clips).toContain('carry');
  });

  it('dřevorubci u vyhrazených stromů čelem ke kmeni, stavitelé kolem staveniště', () => {
    for (const p of of('fell:')) {
      const pose = at(p, 10);
      const tree = [GROUND.tree(501)!, GROUND.tree(502)!].find(
        (t) => Math.hypot(t.x - pose.x, t.z - pose.z) < 2.5,
      );
      expect(tree).toBeDefined();
      if (pose.clip === 'fell') {
        expect(
          pose.headingX * (tree!.x - pose.x) + pose.headingZ * (tree!.z - pose.z),
        ).toBeGreaterThan(0);
      }
    }
    for (const p of of('build:')) {
      const pose = at(p, 10);
      expect(Math.hypot(pose.x - 0, pose.z - 30)).toBeLessThan(10);
      expect(pose.clip).toBe('build');
    }
  });

  it('stavitelé modly stojí kolem jejího půdorysu – ne uvnitř (happiness.md)', () => {
    const shares: LaborShare[] = [
      { activity: 'build', target: { kind: 'site', id: 95 }, manDays: 4 },
    ];
    const withIdol: SceneVillage = {
      ...village(shares),
      sacred: {
        oaks: [],
        groves: [],
        buildings: [
          {
            id: 95,
            kind: 'idol',
            position: { x: 40, z: -40, rotation: 0 },
            built: false,
            progress: 0.4,
          },
        ],
      },
    };
    const builders = planVillagers(withIdol, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('build:'),
    );
    expect(builders.length).toBeGreaterThan(0);
    for (const p of builders) {
      const pose = at(p, 10);
      const d = Math.max(Math.abs(pose.x - 40), Math.abs(pose.z + 40));
      expect(d).toBeGreaterThan(2);
      expect(d).toBeLessThan(8);
    }
  });

  it('pasáček jde za svým stádem; vdané ženy mají šátek, starší šediny', () => {
    const herder = of('herder:')[0]!;
    const pose = at(herder, 50);
    expect(Math.hypot(pose.x - 120, pose.z - 120)).toBeLessThan(12);
    // dítě – menší než dospělí i se stylizovaným zvětšením postav
    expect(herder.scale).toBeLessThan(0.75 * FIGURE_SCALE);
    expect(Math.min(...of('harvest:').map((p) => p.scale))).toBeGreaterThanOrEqual(
      0.95 * FIGURE_SCALE,
    );
    expect(of('elder:').every((p) => p.look.hair === 'grey')).toBe(true);
    expect(
      people
        .filter((p) => p.kind === 'man')
        .every((p) => !['linen', 'madder'].includes(p.look.hair)),
    ).toBe(true);
  });

  it('bez rozdělení práce, bez obydlí nebo bez lidí (vymřelá ves) nikdo', () => {
    expect(planVillagers({ ...v, labor: undefined }, GROUND, { seed: 3, herds: 2 })).toEqual([]);
    expect(planVillagers({ ...v, dwellings: [] }, GROUND, { seed: 3, herds: 2 })).toEqual([]);
    const extinct = village([], 7, { children: 0, adults: 0, elders: 0 });
    expect(planVillagers(extinct, GROUND, { seed: 3, herds: 2 })).toEqual([]);
  });

  it('v zimě je venku méně lidí (domácí práce a nečinní uvnitř)', () => {
    const summer = planVillagers(village(SHARES, 7), GROUND, { seed: 3, herds: 0 });
    const winter = planVillagers(village(SHARES, 1), GROUND, { seed: 3, herds: 0 });
    const outside = (list: PlannedVillager[]): number =>
      list.filter((p) => /^(domestic|idle|elder):/.test(p.key)).length;
    expect(outside(winter)).toBeLessThan(outside(summer));
  });
});

describe('práce na poli po čtvercích – fronta práce', () => {
  /** Pole 4 × 1 čtverce východně od vsi (x 30–90 m). */
  const row = [square(2, 0), square(3, 0), square(4, 0), square(5, 0)];
  const withField = (
    parts: SceneVillage['fields'][number]['parts'],
    shares: SceneLaborShare[],
    day = 1000,
  ): SceneVillage => ({
    ...village([]),
    fields: [{ id: 7, parts }],
    labor: { day, month: 7, people: { children: 0, adults: 8, elders: 0 }, shares },
  });
  const onSquare = (s: { x: number; z: number; size: number }, x: number, z: number): boolean =>
    Math.abs(x - s.x) <= s.size / 2 && Math.abs(z - s.z) <= s.size / 2;

  it('žeň přesně na dílech z fronty od herního jádra', () => {
    const parts = row.map((p, i) => ({ ...p, id: 10 + i }));
    const v = withField(parts, [
      { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 4, parts: [12] },
    ]);
    const reapers = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('harvest:'),
    );
    expect(reapers.length).toBe(4);
    for (const p of reapers) {
      for (const t of [0, 13, 57]) {
        const pose = at(p, t);
        expect(onSquare(parts[2]!, pose.x, pose.z)).toBe(true);
      }
    }
  });

  it('bez fronty: na rozpracovaném čtverci stojí řada hned za čarou práce', () => {
    const parts = row.map((p, i) =>
      i === 1
        ? { ...p, look: 'harvesting' as const, work: 0.5, before: 'ripe' as const }
        : { ...p, look: i === 0 ? ('harvesting' as const) : ('ripe' as const) },
    );
    const v = withField(parts, [
      { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 4 },
    ]);
    const reapers = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('harvest:'),
    );
    expect(reapers.length).toBe(4);
    const frontier = parts[1]!;
    for (const p of reapers) {
      for (const t of [0, 21, 77]) {
        const pose = at(p, t);
        expect(onSquare(frontier, pose.x, pose.z)).toBe(true);
        // pole leží na +x od vsi, řádky podél x → práce jde napříč v z od strany blíž vsi;
        // čára práce je v polovině čtverce, řada stojí do 4 m za ní
        const fromStart = pose.z - (frontier.z - 7.5);
        expect(fromStart).toBeGreaterThanOrEqual(7.5 - 0.5);
        expect(fromStart).toBeLessThanOrEqual(7.5 + 4.6);
      }
    }
  });

  it('zakládání: rozpracovaný čtverec, pak nezačaté od obydlí', () => {
    const parts = row.map((p, i) => ({
      ...p,
      stage: 'founding' as const,
      work: i === 2 ? 0.25 : 0,
    }));
    const v = withField(parts, [
      { activity: 'found-field', target: { kind: 'field', id: 7 }, manDays: 8 },
    ]);
    const crews = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('found-field:'),
    );
    expect(crews.length).toBe(8);
    const first = crews.slice(0, 4).map((p) => at(p, 5));
    for (const pose of first) expect(onSquare(parts[2]!, pose.x, pose.z)).toBe(true);
    const second = crews.slice(4).map((p) => at(p, 5));
    for (const pose of second) expect(onSquare(parts[0]!, pose.x, pose.z)).toBe(true);
  });
});

describe('walkThen – přechod na další čtverec', () => {
  it('jde rovně z původního místa a pak pokračuje podle nové pózy', () => {
    const target = (t: number, _h: readonly HerdView[], out: VillagerPose): VillagerPose => {
      out.x = 30 + t * 0.1;
      out.z = 0;
      out.clip = 'reap';
      return out;
    };
    const pose = walkThen(0, 0, target, 100, 1.5);
    const start = pose(100, [], createVillagerPose());
    expect(start.x).toBeCloseTo(0);
    expect(start.clip).toBe('walk');
    const mid = pose(110, [], createVillagerPose());
    expect(mid.x).toBeCloseTo(15);
    const after = pose(130, [], createVillagerPose());
    expect(after.clip).toBe('reap');
    expect(after.x).toBeCloseTo(43);
  });
});

describe('walkRoute – trasa kolem domů', () => {
  const houses = village([]).dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: d.built,
    progress: d.progress,
    inhabited: d.built,
    box: {
      minX: -chickenBox(d.type).halfX,
      maxX: chickenBox(d.type).halfX,
      minZ: chickenBox(d.type).minZ,
      maxZ: chickenBox(d.type).maxZ,
    },
  }));
  const ctx = { houses, ground: GROUND, graves: [] };

  it('obejde dům, který leží v cestě', () => {
    const [ax, az] = localToWorld(houses[0]!.position, 0, -12);
    const [bx, bz] = localToWorld(houses[0]!.position, 0, 14);
    const route = walkRoute(ctx, { x: ax, z: az }, { x: bx, z: bz })!;
    expect(route).not.toBeNull();
    expect(route.points.length).toBeGreaterThan(2);
    for (let d = 0; d <= route.length; d += 0.25) {
      const pose = createVillagerPose();
      let i = 1;
      while (i < route.points.length - 1 && route.at[i]! < d) i++;
      const [px, pz] = route.points[i - 1]!;
      const [qx, qz] = route.points[i]!;
      const u = Math.min(1, (d - route.at[i - 1]!) / (route.at[i]! - route.at[i - 1]!));
      pose.x = px + (qx - px) * u;
      pose.z = pz + (qz - pz) * u;
      expect(inHouse(village([]), pose.x, pose.z)).toBe(false);
    }
  });

  it('přes vodu cesta nevede', () => {
    expect(walkRoute(ctx, { x: 100, z: 50 }, { x: 100, z: 80 })).toBeNull();
  });
});

describe('pěšiny – postavy chodí po vyšlapaných pěšinách (paths.md)', () => {
  const houses = village([]).dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: d.built,
    progress: d.progress,
    inhabited: d.built,
    box: {
      minX: -chickenBox(d.type).halfX,
      maxX: chickenBox(d.type).halfX,
      minZ: chickenBox(d.type).minZ,
      maxZ: chickenBox(d.type).maxZ,
    },
  }));
  /** Pěšina oklikou přes bod (30, −20); voda je u (40, 55), dřevo u (−40, −30). */
  const paths: VillagerPaths = {
    route: (a, b) => [
      [a.x, a.z],
      [30, -20],
      [b.x, b.z],
    ],
    errand: (_id, kind) => (kind === 'water' ? { x: 40, z: 55 } : { x: -40, z: -26 }),
  };

  it('trasa vede po pěšině, když jde po suchu mimo domy', () => {
    const route = walkRoute(
      { houses, ground: GROUND, graves: [], paths },
      { x: 20, z: -30 },
      {
        x: 40,
        z: -10,
      },
    )!;
    expect(route.points).toEqual([
      [20, -30],
      [30, -20],
      [40, -10],
    ]);
  });

  it('pěšina přes vodu neprojde – jde se rovnou', () => {
    const wet: VillagerPaths = {
      ...paths,
      route: (a, b) => [
        [a.x, a.z],
        [100, 65],
        [b.x, b.z],
      ],
    };
    const route = walkRoute(
      { houses, ground: GROUND, graves: [], paths: wet },
      { x: 20, z: -30 },
      {
        x: 40,
        z: -10,
      },
    )!;
    expect(route.points.length).toBe(2);
  });

  it('ženy pro vodu a dřevo dojdou na konec pěšiny domácnosti', () => {
    const shares: LaborShare[] = [
      { activity: 'domestic', target: { kind: 'village' }, manDays: 12 },
    ];
    const people = planVillagers(village(shares), GROUND, { seed: 7, herds: 0, paths });
    const without = planVillagers(village(shares), GROUND, { seed: 7, herds: 0 });
    const far = (list: PlannedVillager[]): number =>
      Math.max(
        ...list
          .filter((p) => p.key.startsWith('domestic:'))
          .flatMap((p) =>
            [0, 10, 20, 30, 40, 60, 80, 100].map((t) => {
              const pose = at(p, t);
              return Math.hypot(pose.x, pose.z);
            }),
          ),
      );
    expect(far(people)).toBeGreaterThan(35);
    expect(far(without)).toBeLessThan(35);
  });
});
