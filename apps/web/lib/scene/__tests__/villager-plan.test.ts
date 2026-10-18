import { describe, expect, it } from 'vitest';
import type { LaborShare, SceneLaborShare, SceneVillage } from '../../village-view';
import { chickenBox } from '../livestock-placement';
import { localToWorld } from '../village-layout';
import { MILIR_SHAPE_M, milirPlace } from '../workshop-layout';
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

  it('stavitelé ohrady stojí za plotem čelem dovnitř, porážka u vsi (oxen.md, diet.md)', () => {
    const shares: LaborShare[] = [
      { activity: 'pen', target: { kind: 'pen', id: 60 }, manDays: 3, construction: 61 },
      { activity: 'slaughter', target: { kind: 'village' }, manDays: 2 },
    ];
    const withPen: SceneVillage = {
      ...village(shares),
      pens: [
        {
          id: 60,
          cell: { x: -4, y: 1 },
          x: -52.5,
          z: 22.5,
          size: 15,
          built: false,
          progress: 0.3,
          oxen: 0,
          trainees: 0,
          cows: 0,
        },
      ],
    };
    const people = planVillagers(withPen, GROUND, { seed: 3, herds: 0 });
    const builders = people.filter((p) => p.key.startsWith('pen:'));
    expect(builders.length).toBeGreaterThan(0);
    for (const p of builders) {
      const pose = at(p, 10);
      const d = Math.max(Math.abs(pose.x + 52.5), Math.abs(pose.z - 22.5));
      expect(d).toBeGreaterThan(7.5);
      expect(d).toBeLessThan(11);
    }
    expect(people.filter((p) => p.key.startsWith('slaughter:')).length).toBe(2);
  });

  it('dojí ženy u domů, v zimě se o krávy a voly stará někdo u ohrady (diet.md)', () => {
    const shares: LaborShare[] = [
      { activity: 'milking', target: { kind: 'village' }, manDays: 2 },
      { activity: 'animal-care', target: { kind: 'pen', id: 60 }, manDays: 1 },
    ];
    const v: SceneVillage = {
      ...village(shares),
      pens: [
        {
          id: 60,
          cell: { x: -4, y: 1 },
          x: -52.5,
          z: 22.5,
          size: 15,
          built: true,
          progress: 1,
          oxen: 2,
          trainees: 0,
          cows: 1,
        },
      ],
    };
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 });
    const milkers = people.filter((p) => p.key.startsWith('milking:'));
    expect(milkers.length).toBe(2);
    for (const p of milkers) {
      const pose = at(p, 10);
      expect(inHouse(v, pose.x, pose.z)).toBe(false);
      // u některého domu
      const near = v.dwellings.some(
        (d) => d.built && Math.hypot(pose.x - d.position.x, pose.z - d.position.z) < 9,
      );
      expect(near).toBe(true);
    }
    const carers = people.filter((p) => p.key.startsWith('animal-care:'));
    expect(carers.length).toBe(1);
    const pose = at(carers[0]!, 10);
    const d = Math.max(Math.abs(pose.x + 52.5), Math.abs(pose.z - 22.5));
    expect(d).toBeGreaterThan(7.5);
    expect(d).toBeLessThan(11);
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

  it('seč sena na dílech z fronty, orbu dělá spřežení (žádné postavy navíc)', () => {
    const parts = row.map((p, i) => ({ ...p, id: 10 + i, stage: 'meadow' as const }));
    const v = withField(parts, [
      { activity: 'mow', target: { kind: 'field', id: 7 }, manDays: 4, parts: [11] },
      { activity: 'plough', target: { kind: 'field', id: 7 }, manDays: 2, parts: [13] },
    ]);
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 });
    const mowers = people.filter((p) => p.key.startsWith('mow:'));
    expect(mowers.length).toBe(4);
    for (const p of mowers) {
      const pose = at(p, 20);
      expect(onSquare(parts[1]!, pose.x, pose.z)).toBe(true);
    }
    expect(people.some((p) => p.key.startsWith('plough:'))).toBe(false);
  });

  it('seč přirozené louky: řady sekáčů na políčkách louky z fronty od jádra (oxen.md)', () => {
    const meadow = (cx: number, cy: number, look: 'meadow' | 'mown', work?: number) => ({
      cell: { x: cx, y: cy },
      x: cx * 15 + 7.5,
      z: cy * 15 + 7.5,
      size: 15,
      look,
      ...(work === undefined ? {} : { work, before: 'meadow' as const }),
    });
    const v: SceneVillage = {
      ...withField(row, [
        { activity: 'mow', target: { kind: 'meadow', cells: [{ x: -6, y: -1 }] }, manDays: 4 },
      ]),
      hayMeadows: [meadow(-6, -1, 'mown', 0.5), meadow(-5, -1, 'meadow')],
    };
    const mowers = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('mow:'),
    );
    expect(mowers.length).toBe(4);
    for (const p of mowers) {
      const pose = at(p, 20);
      expect(onSquare(v.hayMeadows![0]!, pose.x, pose.z)).toBe(true);
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

describe('stavitelé – stavba neroste sama od sebe (Martin)', () => {
  /** Ves se všemi druhy staveb, na kterých se dnes pracuje, a jedním staveništěm bez práce. */
  function busyVillage(shares: SceneLaborShare[]): SceneVillage {
    const base = village(shares);
    return {
      ...base,
      dwellings: [
        ...base.dwellings,
        house(4, -30, 10, 0.3),
        house(91, 40, 30, 0, false),
        {
          ...house(92, 60, -10, 0, false, 'polozemnice'),
          progress: 0.5,
          plot: { cell: { x: 4, y: -1 }, x: 62, z: -8, size: 15, variant: 'center' as const },
        },
      ],
      fields: [
        ...base.fields,
        { id: 11, parts: [square(-4, 2, 'founding'), square(-3, 2, 'founding')] },
      ],
      orchards: [
        {
          id: 9,
          squares: [
            {
              cell: { x: 5, y: 3 },
              x: 82.5,
              z: 52.5,
              size: 15,
              planting: 0.4,
              growth: 0,
              fruit: false,
            },
          ],
        },
      ],
      cemeteries: [
        {
          id: 8,
          squares: [
            { cell: { x: -3, y: -3 }, x: -37.5, z: -37.5, size: 15 },
            { cell: { x: -2, y: -3 }, x: -22.5, z: -37.5, size: 15, pending: true },
          ],
          built: true,
          progress: 0.3,
          graves: 10,
        },
      ],
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
  }

  /** Drobná práce na každé stavbě vedle velké žně (přes MAX_WORKERS). */
  const TINY = 0.05;
  const BUSY: SceneLaborShare[] = [
    { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 70 },
    { activity: 'carry', target: { kind: 'field', id: 7 }, manDays: 40 },
    { activity: 'domestic', target: { kind: 'village' }, manDays: 6 },
    { activity: 'fell', target: { kind: 'trees', ids: [501] }, manDays: TINY, construction: 90 },
    { activity: 'build', target: { kind: 'site', id: 90 }, manDays: TINY, construction: 90 },
    { activity: 'build', target: { kind: 'site', id: 92 }, manDays: TINY, construction: 92 },
    { activity: 'build', target: { kind: 'dwelling', id: 4 }, manDays: TINY, construction: 96 },
    { activity: 'build', target: { kind: 'site', id: 95 }, manDays: TINY, construction: 95 },
    {
      activity: 'found-field',
      target: { kind: 'field', id: 11 },
      manDays: TINY,
      construction: 97,
    },
    {
      activity: 'orchard-plant',
      target: { kind: 'orchard', id: 9 },
      manDays: TINY,
      construction: 98,
    },
    { activity: 'cemetery', target: { kind: 'cemetery', id: 8 }, manDays: TINY, construction: 99 },
  ];
  /** Kde se na stavbě pracuje (střed) a jak daleko od něj stavitel stojí nejvýš (m). */
  const PLACES: Record<string, { x: number; z: number; reach: number }> = {
    'build:site-90': { x: 0, z: 30, reach: 14 },
    'fell:trees-501': { x: -40, z: -30, reach: 4 },
    'build:site-92': { x: 60, z: -10, reach: 12 },
    'build:dwelling-4': { x: -30, z: 10, reach: 10 },
    'build:site-95': { x: 40, z: -40, reach: 10 },
    'found-field:field-11': { x: -45, z: 37.5, reach: 16 },
    'orchard-plant:orchard-9': { x: 82.5, z: 52.5, reach: 12 },
    'cemetery:cemetery-8': { x: -22.5, z: -37.5, reach: 12 },
  };

  it('každá stavba s dnešní prací má aspoň jednoho člověka u sebe – i nad limitem postav', () => {
    const v = busyVillage(BUSY);
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 });
    const workers = people.filter((p) => !/^(elder|herder):/.test(p.key));
    expect(workers.length).toBeLessThanOrEqual(MAX_WORKERS);
    const byConstruction = new Map<number, number>();
    for (const share of BUSY) {
      if (share.construction === undefined) continue;
      const key = `${share.activity}:${share.target.kind === 'trees' ? `trees-${share.target.ids[0]}` : `${share.target.kind}-${'id' in share.target ? share.target.id : ''}`}`;
      const here = workers.filter((p) => p.key.startsWith(`${key}:`));
      byConstruction.set(
        share.construction,
        (byConstruction.get(share.construction) ?? 0) + here.length,
      );
      const place = PLACES[key]!;
      for (const p of here) {
        const pose = at(p, 20);
        expect(Math.hypot(pose.x - place.x, pose.z - place.z), key).toBeLessThan(place.reach);
        expect(inHouse(v, pose.x, pose.z), `${key} v domě`).toBe(false);
      }
    }
    for (const id of [90, 92, 96, 95, 97, 98, 99]) {
      expect(byConstruction.get(id), `stavba ${id}`).toBeGreaterThanOrEqual(1);
    }
    // staveniště bez práce: nikdo
    expect(workers.some((p) => p.key.includes('site-91'))).toBe(false);
  });

  it('stavitelé na hrobech nestojí – rozšíření hřbitova jen po obvodu', () => {
    const people = planVillagers(busyVillage(BUSY), GROUND, { seed: 3, herds: 0 });
    for (const p of people.filter((x) => x.key.startsWith('cemetery:'))) {
      const { x, z } = at(p, 20);
      for (const sq of [
        { x: -37.5, z: -37.5 },
        { x: -22.5, z: -37.5 },
      ]) {
        expect(Math.abs(x - sq.x) < 7.3 && Math.abs(z - sq.z) < 7.3).toBe(false);
      }
    }
  });

  it('i starší rozdělení bez id stavby: každé místo stavby dostane člověka', () => {
    const old: SceneLaborShare[] = BUSY.map((share) => {
      const copy = { ...share };
      delete copy.construction;
      return copy;
    });
    const counts = shareCounts(old, 7);
    old.forEach((share, i) => {
      if (['build', 'fell', 'found-field', 'orchard-plant', 'cemetery'].includes(share.activity)) {
        expect(counts[i], share.activity).toBeGreaterThanOrEqual(1);
      }
    });
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_WORKERS);
  });

  it('kácení a stavba téže stavby stačí jeden člověk – u stavby, kde je práce víc', () => {
    const counts = shareCounts(
      [
        { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 100 },
        { activity: 'fell', target: { kind: 'trees', ids: [501] }, manDays: 0.1, construction: 5 },
        { activity: 'build', target: { kind: 'site', id: 5 }, manDays: 0.2, construction: 5 },
      ],
      7,
    );
    expect(counts).toEqual([MAX_WORKERS - 1, 0, 1]);
  });

  it('polozemnice na pozemku: stavitelé u domu uvnitř pozemku, plot na konci u plotu', () => {
    const v = busyVillage([
      { activity: 'build', target: { kind: 'site', id: 92 }, manDays: 3, construction: 92 },
    ]);
    const inPlot = (x: number, z: number): boolean =>
      Math.abs(x - 62) < 7.5 && Math.abs(z + 8) < 7.5;
    const builders = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('build:'),
    );
    expect(builders.length).toBe(3);
    for (const p of builders) expect(inPlot(at(p, 5).x, at(p, 5).z)).toBe(true);
    const fencing = {
      ...v,
      dwellings: v.dwellings.map((d) => (d.id === 92 ? { ...d, progress: 0.9 } : d)),
    };
    for (const p of planVillagers(fencing, GROUND, { seed: 3, herds: 0 }).filter((x) =>
      x.key.startsWith('build:'),
    )) {
      const { x, z } = at(p, 5);
      expect(inPlot(x, z)).toBe(true);
      // u plotu – blíž okraji pozemku než 2,5 m
      expect(7.5 - Math.max(Math.abs(x - 62), Math.abs(z + 8))).toBeLessThan(2.5);
    }
  });
});

describe('řemeslníci – práce v dílně (crafts.md)', () => {
  const POTTER = { x: 30, z: -30, rotation: 0 };
  const BURNER = { x: -60, z: 20, rotation: 0.4 };
  function craftVillage(shares: LaborShare[]): SceneVillage {
    const base = village(shares);
    return {
      ...base,
      dwellings: [
        ...base.dwellings,
        { ...house(20, POTTER.x, POTTER.z, 0, true, 'polozemnice'), craft: 'potter' as const },
        { ...house(21, BURNER.x, BURNER.z, BURNER.rotation), craft: 'burner' as const },
      ],
    };
  }
  const shares: LaborShare[] = [
    { activity: 'craft', target: { kind: 'dwelling', id: 20 }, manDays: 2 },
    { activity: 'craft', target: { kind: 'dwelling', id: 21 }, manDays: 2 },
    { activity: 'fell', target: { kind: 'trees', ids: [501] }, manDays: 1 },
  ];
  const v = craftVillage(shares);
  const people = planVillagers(v, GROUND, { seed: 5, herds: 0 });

  it('hrnčíř pracuje u své dílny, uhlíř kolem milíře čelem k němu', () => {
    const potters = people.filter((p) => p.key.startsWith('craft:dwelling-20:'));
    expect(potters.length).toBe(2);
    for (const p of potters) {
      const pose = at(p, 5);
      expect(Math.hypot(pose.x - POTTER.x, pose.z - POTTER.z)).toBeLessThan(7);
    }
    const milir = milirPlace(BURNER);
    const burners = people.filter((p) => p.key.startsWith('craft:dwelling-21:'));
    expect(burners.length).toBe(2);
    for (const p of burners) {
      const pose = at(p, 5);
      const d = Math.hypot(pose.x - milir.x, pose.z - milir.z);
      expect(d).toBeGreaterThan(MILIR_SHAPE_M.radius);
      expect(d).toBeLessThan(MILIR_SHAPE_M.radius + 3);
      expect(
        pose.headingX * (milir.x - pose.x) + pose.headingZ * (milir.z - pose.z),
      ).toBeGreaterThan(0);
    }
  });

  it('kácení dílny (bez stavby) – u vyhrazeného stromu', () => {
    const fellers = people.filter((p) => p.key.startsWith('fell:'));
    expect(fellers.length).toBeGreaterThan(0);
    const pose = at(fellers[0]!, 5);
    expect(Math.hypot(pose.x + 40, pose.z + 30)).toBeLessThan(3);
  });

  it('do kupy milíře nikdo nevstoupí', () => {
    const milir = milirPlace(BURNER);
    const all = planVillagers(
      craftVillage([
        ...SHARES,
        ...shares,
        { activity: 'idle', target: { kind: 'village' }, manDays: 6 },
      ]),
      GROUND,
      { seed: 9, herds: 0 },
    );
    for (const p of all.filter((x) => !x.key.startsWith('herder:'))) {
      for (let t = 0; t < 120; t += 3.1) {
        const { x, z } = at(p, t);
        expect(Math.hypot(x - milir.x, z - milir.z), p.key).toBeGreaterThan(
          MILIR_SHAPE_M.radius - 0.3,
        );
      }
    }
  });
});
