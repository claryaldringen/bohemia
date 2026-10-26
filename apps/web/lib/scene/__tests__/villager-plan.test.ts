import { describe, expect, it } from 'vitest';
import type { LaborShare, SceneLaborShare, SceneVillage } from '../../village-view';
import { chickenBox } from '../livestock-placement';
import { localToWorld, sceneFrame } from '../village-layout';
import { worldToLocal } from '../dwelling-pit';
import { MILIR_SHAPE_M, milirPlace } from '../workshop-layout';
import {
  createVillagerPose,
  villagerSeconds,
  walkThen,
  type HerdView,
  type VillagerPose,
} from '../villager-motion';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import {
  FIGURE_SCALE,
  MAX_ELDERS,
  MAX_WORKERS,
  crewSplit,
  elderCount,
  figureCounts,
  figureSexes,
  herderKinds,
  houseBox,
  womenChance,
  shareCounts,
  planFunerals,
  planWeddings,
  planVillagers,
  walkRoute,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPaths,
} from '../villager-plan';
import { orePitRadius } from '../ore-site-layout';
import { context } from '../villager-plan-cast';
import { WOMEN } from '../villager-plan-types';

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

  it('opravu hotové svatyně dělají lidé kolem jejího půdorysu (abandonment.md – Oprava)', () => {
    const shares: LaborShare[] = [
      { activity: 'repair', target: { kind: 'sacred', id: 95 }, manDays: 3, construction: 120 },
    ];
    const withShrine: SceneVillage = {
      ...village(shares),
      sacred: {
        oaks: [],
        groves: [],
        buildings: [
          {
            id: 95,
            kind: 'shrine',
            position: { x: 40, z: -60, rotation: 0 },
            built: true,
            progress: 1,
            condition: 0.5,
            repairing: true,
          },
        ],
      },
    };
    const repairers = planVillagers(withShrine, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('repair:'),
    );
    expect(repairers.length).toBeGreaterThan(0);
    for (const p of repairers) {
      const pose = at(p, 10);
      const d = Math.max(Math.abs(pose.x - 40), Math.abs(pose.z + 60));
      expect(d).toBeGreaterThan(14);
      expect(d).toBeLessThan(22);
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

  it('koňák je ráno a večer u plotu ohrady koní (horses.md – Péče)', () => {
    const shares: LaborShare[] = [
      { activity: 'horse-care', target: { kind: 'pen', id: 61 }, manDays: 1 },
    ];
    const v: SceneVillage = {
      ...village(shares),
      pens: [
        {
          id: 61,
          species: 'horse',
          cell: { x: -4, y: 1 },
          x: -52.5,
          z: 22.5,
          size: 15,
          built: true,
          progress: 1,
          oxen: 0,
          trainees: 0,
          cows: 0,
        },
      ],
    };
    const carers = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('horse-care:'),
    );
    expect(carers.length).toBe(1);
    const pose = at(carers[0]!, 10);
    const d = Math.max(Math.abs(pose.x + 52.5), Math.abs(pose.z - 22.5));
    expect(d).toBeGreaterThan(7.5);
    expect(d).toBeLessThan(11);
  });

  it('koně kuje muž (kovář s dospělým synem), ne žena z vsi (horses.md – Kování)', () => {
    const pen = {
      id: 61,
      species: 'horse' as const,
      cell: { x: -4, y: 1 },
      x: -52.5,
      z: 22.5,
      size: 15,
      built: true,
      progress: 1,
      oxen: 0,
      trainees: 0,
      cows: 0,
    };
    const base = village([
      { activity: 'horse-shoeing', target: { kind: 'pen', id: 61 }, manDays: 2 },
    ]);
    const v: SceneVillage = {
      ...base,
      pens: [pen],
      dwellings: [
        ...base.dwellings,
        { ...house(31, 40, -20, 0, true, 'polozemnice'), craft: 'smith' as const },
      ],
    };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const smiths = planVillagers(v, GROUND, { seed, herds: 0 }).filter((p) =>
        p.key.startsWith('horse-shoeing:'),
      );
      expect(smiths.length).toBeGreaterThan(0);
      expect(smiths.every((p) => p.kind === 'man')).toBe(true);
    }
    expect(WOMEN['horse-shoeing']).toBe(0);
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

describe('walkRoute – ploty ohrad (paths.md – Ploty jsou neprůchodné)', () => {
  const pen = (id: number, x: number): NonNullable<SceneVillage['pens']>[number] => ({
    id,
    cell: { x: id, y: 0 },
    x,
    z: 0,
    size: 15,
    built: true,
    progress: 1,
    oxen: 0,
    trainees: 0,
    cows: 0,
  });
  // dvě ohrady vedle sebe, mezi nimi ulička 3 m (plot stojí 1,5 m uvnitř čtverce)
  const ctx = context({ ...village([]), pens: [pen(1, 100), pen(2, 118)] }, GROUND, 5, 10, null);

  it('krátký pohyb neprotne plot ohrady, obejde ho', () => {
    const r = walkRoute(ctx, { x: 100, z: -20 }, { x: 100, z: 20 })!;
    expect(r).not.toBeNull();
    expect(r.points.length).toBeGreaterThan(2);
  });

  it('uličkou mezi ohradami projde rovně', () => {
    const r = walkRoute(ctx, { x: 109, z: -20 }, { x: 109, z: 20 })!;
    expect(r).not.toBeNull();
    expect(r.points).toHaveLength(2);
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
    route: (a, b) => ({
      points: [
        [a.x, a.z],
        [30, -20],
        [b.x, b.z],
      ],
      pace: [1, 1.33],
    }),
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
    // po pěšině (druhý úsek) se jde rychleji – trasa je „kratší“ chůzí než délkou
    expect(route.walkLength!).toBeLessThan(route.length);
  });

  it('pěšina přes vodu neprojde – jde se rovnou', () => {
    const wet: VillagerPaths = {
      ...paths,
      route: (a, b) => ({
        points: [
          [a.x, a.z],
          [100, 65],
          [b.x, b.z],
        ],
        pace: [1, 1],
      }),
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

  it('lidé pro vodu a dřevo dojdou na konec pěšiny domácnosti (provoz na cestách)', () => {
    const shares: LaborShare[] = [
      { activity: 'domestic', target: { kind: 'village' }, manDays: 12 },
    ];
    const people = planVillagers(village(shares), GROUND, { seed: 7, herds: 0, paths });
    const without = planVillagers(village(shares), GROUND, { seed: 7, herds: 0 });
    const far = (list: PlannedVillager[], prefix: string): number =>
      Math.max(
        0,
        ...list
          .filter((p) => p.key.startsWith(prefix))
          .flatMap((p) =>
            Array.from({ length: 120 }, (_, k) => {
              const pose = at(p, k * 2);
              return pose.hidden ? 0 : Math.hypot(pose.x, pose.z);
            }),
          ),
      );
    expect(far(people, 'traffic:water:')).toBeGreaterThan(55);
    // pro dřevo se chodí hlavně v zimě (síť pěšin – léto 0,5, zima 1,2 cesty na domácnost)
    const winter = planVillagers(village(shares, 12), GROUND, { seed: 7, herds: 0, paths });
    expect(far(winter, 'traffic:wood:')).toBeGreaterThan(40);
    // bez pěšin nikdo pro vodu nechodí a domácí práce zůstane u domů
    expect(without.some((p) => p.key.startsWith('traffic:'))).toBe(false);
    expect(far(people, 'domestic:')).toBeLessThan(40);
  });

  it('pro vodu jdou i daleko – mimo rastr schůdné země, pro dřevo ne (paths.md – Pochůzky pro vodu)', () => {
    const shares: LaborShare[] = [
      { activity: 'domestic', target: { kind: 'village' }, manDays: 12 },
    ];
    // voda i dřevo 450 m od vsi – za okrajem rastru schůdné země (|z| < 400)
    const distant = (kind: 'water' | 'wood'): VillagerPaths => ({
      route: (a, b) => ({
        points: [
          [a.x, a.z],
          [0, -30],
          [b.x, b.z],
        ],
        pace: [1, 1.3],
      }),
      errand: (_id, k) => (k === kind ? { x: 0, z: -450 } : null),
    });
    const reach = (kind: 'water' | 'wood'): number => {
      const people = planVillagers(village(shares), GROUND, {
        seed: 7,
        herds: 0,
        paths: distant(kind),
      });
      return Math.max(
        0,
        ...people
          .filter((p) => p.key.startsWith('traffic:'))
          .flatMap((p) =>
            Array.from({ length: 300 }, (_, k) => {
              const pose = at(p, k * 5);
              return pose.hidden ? 0 : Math.hypot(pose.x, pose.z);
            }),
          ),
      );
    };
    expect(reach('water')).toBeGreaterThan(440);
    expect(reach('wood')).toBeLessThan(100);
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

describe('jabloně podél cesty – sklizeň, péče a výsadba (roads.md)', () => {
  it('česáči u plodících jabloní úseku, sazeči u míst, která čekají na výsadbu', () => {
    const base = village([
      { activity: 'orchard-harvest', target: { kind: 'road', id: 4 }, manDays: 3 },
      { activity: 'orchard-plant', target: { kind: 'road', id: 4 }, manDays: 2, construction: 70 },
    ]);
    const apple = (id: number, x: number, z: number, stage: 'tree' | 'planting') => ({
      id,
      roadId: 4,
      x,
      z,
      stage,
      growth: stage === 'tree' ? 1 : 0,
      fruit: stage === 'tree',
    });
    const v: SceneVillage = {
      ...base,
      roads: [
        {
          id: 4,
          points: [
            { x: -100, z: 100 },
            { x: 100, z: 100 },
          ],
          grade: 'trodden',
        },
      ],
      roadApples: [
        apple(1, -60, 103, 'tree'),
        apple(2, -50, 97, 'tree'),
        apple(3, -40, 103, 'tree'),
        apple(4, 40, 97, 'planting'),
        apple(5, 50, 103, 'planting'),
      ],
    };
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 });
    const near = (x: number, z: number, stage: 'tree' | 'planting'): number =>
      Math.min(
        ...v.roadApples!.filter((a) => a.stage === stage).map((a) => Math.hypot(a.x - x, a.z - z)),
      );
    const pickers = people.filter((p) => p.key.startsWith('orchard-harvest:'));
    const planters = people.filter((p) => p.key.startsWith('orchard-plant:'));
    expect(pickers.length).toBe(3);
    expect(planters.length).toBe(2);
    for (const p of pickers) {
      const { x, z } = at(p, 20);
      expect(near(x, z, 'tree')).toBeLessThan(2);
    }
    for (const p of planters) {
      const { x, z } = at(p, 20);
      expect(near(x, z, 'planting')).toBeLessThan(2);
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

// Postavy podle skutečného pohlaví lidí vsi (kinship.md – Co hráč vidí).
describe('pohlaví postav podle vsi', () => {
  it('podíl činnosti se posune podle podílu žen ve vsi – půl na půl beze změny', () => {
    expect(womenChance(0.7, 0.5)).toBeCloseTo(0.7, 12);
    expect(womenChance(0.7, null)).toBe(0.7);
    expect(womenChance(0.7, 0)).toBe(0);
    expect(womenChance(0.3, 1)).toBe(1);
    expect(womenChance(0.5, 0.25)).toBeCloseTo(0.25, 12);
    expect(womenChance(0, 0.9)).toBe(0); // orba – jen muži
  });

  it('podíly ze souhrnu vsi: ženy mezi muži a ženami, starší, dívky a vdané', () => {
    expect(
      figureSexes({
        children: 3,
        adults: 4,
        elders: 2,
        men: 3,
        women: 1,
        boys: 1,
        girls: 2,
        elderMen: 0,
        elderWomen: 2,
        couples: 1,
      }),
    ).toEqual({ women: 0.25, elderWomen: 1, girls: 2 / 3, married: 1 / 3 });
    expect(figureSexes({ children: 1, adults: 2, elders: 0 })).toEqual({
      women: null,
      elderWomen: null,
      girls: null,
      married: null,
    });
  });
});

describe('uhlíř – milíř v lese a sázení buků (crafts.md – Uhlíř)', () => {
  const KILN = { x: -42, z: -60 };
  function forestVillage(shares: LaborShare[]): SceneVillage {
    const base = village(shares);
    return {
      ...base,
      dwellings: [...base.dwellings, { ...house(21, -60, 20, 0.4), craft: 'burner' as const }],
      kilns: [{ id: 21, burnerId: 21, x: KILN.x, z: KILN.z, stage: 'build', progress: 0.5 }],
    };
  }

  it('u lesního milíře stojí uhlíř kolem kupy, ne u dílny', () => {
    const people = planVillagers(
      forestVillage([
        { activity: 'craft', target: { kind: 'kiln', id: 21, x: KILN.x, z: KILN.z }, manDays: 2 },
      ]),
      GROUND,
      { seed: 5, herds: 0 },
    );
    const burners = people.filter((p) => p.key.startsWith('craft:kiln-21:'));
    expect(burners.length).toBe(2);
    for (const p of burners) {
      const pose = at(p, 5);
      const d = Math.hypot(pose.x - KILN.x, pose.z - KILN.z);
      expect(d).toBeGreaterThan(MILIR_SHAPE_M.radius);
      expect(d).toBeLessThan(MILIR_SHAPE_M.radius + 3);
    }
  });

  it('mladé buky sází u pařezů motykou', () => {
    const people = planVillagers(
      forestVillage([
        { activity: 'plant', target: { kind: 'trees', ids: [501, 502] }, manDays: 1 },
      ]),
      GROUND,
      { seed: 5, herds: 0 },
    );
    const planters = people.filter((p) => p.key.startsWith('plant:'));
    expect(planters.length).toBeGreaterThan(0);
    for (const p of planters) {
      const pose = at(p, 5);
      const stump = Math.min(
        Math.hypot(pose.x + 40, pose.z + 30),
        Math.hypot(pose.x + 44, pose.z + 33),
      );
      expect(stump).toBeLessThan(3);
      expect(pose.clip).toBe('hoe');
    }
  });

  it('kácení buků u lesního milíře nosí polena k milíři', () => {
    const people = planVillagers(
      forestVillage([{ activity: 'fell', target: { kind: 'trees', ids: [501] }, manDays: 4 }]),
      GROUND,
      { seed: 3, herds: 0 },
    );
    const carriers = people.filter((p) => p.key.startsWith('fell:')).slice(2);
    expect(carriers.length).toBeGreaterThan(0);
    // nosiči chodí mezi bukem a milířem – nikdy daleko od nich (dílna je ≈ 85 m od lesa)
    for (const p of carriers) {
      for (let t = 0; t < 60; t += 2.3) {
        const { x, z } = at(p, t);
        expect(Math.hypot(x - KILN.x, z - KILN.z)).toBeLessThan(45);
      }
    }
  });
});

describe('kovář – rudiště a nošení (crafts.md – Uhlí a ruda kováře)', () => {
  const PIT = { x: 50, z: 40 };
  const KILN = { x: -30, z: -20 };
  function smithVillage(shares: LaborShare[]): SceneVillage {
    const base = village(shares);
    return {
      ...base,
      dwellings: [
        ...base.dwellings,
        { ...house(31, 40, -20, 0, true, 'polozemnice'), craft: 'smith' as const },
      ],
      orePits: [{ x: PIT.x, z: PIT.z, kg: 200, overgrowth: 0 }],
      oreSites: [{ dwellingId: 31, x: PIT.x - 2, z: PIT.z - 2, heapKg: 0, digging: true }],
    };
  }

  it('kopáči stojí na valu jámy čelem do ní s motykou – syn od 14 let i kovář', () => {
    const people = planVillagers(
      smithVillage([
        {
          activity: 'ore',
          target: { kind: 'ore', id: 31, x: PIT.x - 2, z: PIT.z - 2 },
          manDays: 2,
          ages: [36, 15],
        },
      ]),
      GROUND,
      { seed: 5, herds: 0 },
    );
    const diggers = people.filter((p) => p.key.startsWith('ore:'));
    expect(diggers.length).toBe(2);
    const radius = orePitRadius(200);
    for (const p of diggers) {
      const pose = at(p, 5);
      expect(pose.clip).toBe('hoe');
      const d = Math.hypot(pose.x - PIT.x, pose.z - PIT.z);
      expect(d).toBeGreaterThan(radius - 0.5);
      expect(d).toBeLessThan(radius + 2);
      // dospělí – syn od 14 let není dítě
      expect(p.scale).toBeGreaterThan(1);
    }
  });

  it('syn 11 let nosí uhlí od milíře – menší postava mezi kovárnou a milířem, tam a zpět', () => {
    const people = planVillagers(
      smithVillage([
        {
          activity: 'fetch',
          target: { kind: 'kiln', id: 21, x: KILN.x, z: KILN.z, from: 31 },
          manDays: 0.23,
          ages: [11],
        },
        {
          activity: 'fetch',
          target: { kind: 'kiln', id: 21, x: KILN.x, z: KILN.z, from: 31 },
          manDays: 0.1,
          ages: [36],
        },
      ]),
      GROUND,
      { seed: 5, herds: 0 },
    );
    const carriers = people.filter((p) => p.key.startsWith('fetch:'));
    expect(carriers.length).toBe(2);
    const son = carriers.find((p) => p.key.includes(':11:'))!;
    const father = carriers.find((p) => p.key.includes(':36:'))!;
    expect(son.scale).toBeLessThan(father.scale);
    expect(son.kind).toBe('man');
    // chodí mezi kovárnou (40, −20) a milířem – s košem zpátky
    const clips = new Set<string>();
    let nearKiln = false;
    for (let t = 0; t < 400; t += 1.7) {
      const pose = at(son, t);
      clips.add(pose.clip);
      if (Math.hypot(pose.x - KILN.x, pose.z - KILN.z) < 6) nearKiln = true;
      expect(pose.z).toBeGreaterThan(-35);
      expect(pose.z).toBeLessThan(0);
    }
    expect(nearKiln).toBe(true);
    expect(clips.has('carry')).toBe(true);
    // s vozem jede kovář vozem – pěšky nikdo
    const riding = planVillagers(
      smithVillage([
        {
          activity: 'fetch',
          target: { kind: 'ore', id: 31, x: PIT.x, z: PIT.z },
          manDays: 0.1,
          ages: [36],
          carts: 1,
        },
      ]),
      GROUND,
      { seed: 5, herds: 0 },
    );
    expect(riding.some((p) => p.key.startsWith('fetch:'))).toBe(false);
  });
});

describe('nosiči výpravy po zemské stezce (trade.md)', () => {
  it('s nákladem jdou po stezce od dvorce ke kraji mapy a zpět', () => {
    const base = village([{ activity: 'trade', target: { kind: 'trail', id: 5 }, manDays: 4 }]);
    const v: SceneVillage = {
      ...base,
      trails: [
        {
          id: 5,
          direction: 'S',
          points: [
            { x: 0, z: -8 },
            { x: 0, z: -300 },
          ],
          built: true,
        },
      ],
    };
    const porters = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('trade:'),
    );
    expect(porters.length).toBe(4);
    for (const p of porters) {
      for (const t of [0, 40, 200]) {
        const pose = at(p, t);
        expect(Math.abs(pose.x)).toBeLessThan(0.5);
        expect(pose.z).toBeLessThanOrEqual(-7.9);
        expect(pose.z).toBeGreaterThanOrEqual(-300.1);
      }
    }
    // bez stezky nikdo
    expect(
      planVillagers(base, GROUND, { seed: 3, herds: 0 }).some((p) => p.key.startsWith('trade:')),
    ).toBe(false);
  });
});

describe('pasáci u stád (diet.md – Pasáci)', () => {
  const people = { children: 4, adults: 3, elders: 2 };
  const herding = (manDays: number): SceneLaborShare => ({
    activity: 'herding',
    target: { kind: 'village' },
    manDays,
  });

  it('děti a starší z jádra, pak dospělí (člověkoden = pasák), nejvýš jeden u stáda', () => {
    const labor = { people, shares: [herding(1.3)], herders: { children: 2, elders: 1 } };
    expect(herderKinds(labor, 9)).toEqual(['child', 'child', 'elder', 'adult', 'adult']);
    expect(herderKinds(labor, 2)).toEqual(['child', 'child']);
    // rozdělení práce z doby před pasáky – děti jako dřív
    expect(herderKinds({ people, shares: [] }, 3)).toEqual(['child', 'child', 'child']);
  });
});

describe('provoz na cestách – pro vodu, k lesu a na pole (villagers.md)', () => {
  /** Voda 450 m od vsi (za rastrem schůdné země); pěšina od domu stranou kolem vsi a k jihu. */
  const far: VillagerPaths = {
    route: (a, b) => ({
      points: [
        [a.x, a.z],
        [a.x + 25, a.z + 10],
        [40, -40],
        [b.x, b.z],
      ],
      pace: [1, 1.3, 1.3, 1],
    }),
    errand: (_id, kind) => (kind === 'water' ? { x: 0, z: -450 } : null),
  };
  const DOMESTIC: LaborShare[] = [
    { activity: 'domestic', target: { kind: 'village' }, manDays: 3 },
  ];
  /** Ves s lidmi po obydlích (`homes`) a s vozem s vodou (`cartWater`). */
  const peopled = (people: number, cartWater?: number, shares = DOMESTIC): SceneVillage => {
    const v = village(shares);
    return {
      ...v,
      labor: {
        ...v.labor!,
        homes: [1, 2, 3].map((id) => ({
          id,
          people,
          ...(cartWater === undefined ? {} : { cartWater }),
        })),
      },
    };
  };
  const traffic = (list: PlannedVillager[], prefix = 'traffic:water:'): PlannedVillager[] =>
    list.filter((p) => p.key.startsWith(prefix));
  const plan = (v: SceneVillage, maxTraffic?: number): PlannedVillager[] =>
    planVillagers(v, GROUND, {
      seed: 7,
      herds: 0,
      paths: far,
      ...(maxTraffic === undefined ? {} : { maxTraffic }),
    });

  it('pro vodu chodí úměrně lidem v domácnostech (cesty pro vodu v simulaci)', () => {
    const few = traffic(plan(peopled(4))).length;
    const many = traffic(plan(peopled(12))).length;
    expect(few).toBeGreaterThanOrEqual(1);
    expect(many).toBeGreaterThanOrEqual(few * 2.5);
    expect(many).toBeLessThanOrEqual(few * 3.5);
  });

  it('ve dny, kdy vodu veze vůz v sudech, pěšky nikdo – s polovinou vody polovina', () => {
    const all = traffic(plan(peopled(12))).length;
    expect(traffic(plan(peopled(12, 1)))).toEqual([]);
    const half = traffic(plan(peopled(12, 0.5))).length;
    expect(half).toBeGreaterThanOrEqual(Math.floor(all / 2) - 1);
    expect(half).toBeLessThanOrEqual(Math.ceil(all / 2) + 1);
  });

  it('strop postav na cestách', () => {
    expect(traffic(plan(peopled(30), 3), 'traffic:').length).toBeLessThanOrEqual(3);
    expect(traffic(plan(peopled(30)), 'traffic:').length).toBeGreaterThan(3);
  });

  it('stejný okamžik = stejná póza, v čase jdou po cestě', () => {
    const a = traffic(plan(peopled(12)));
    const b = traffic(plan(peopled(12)));
    expect(a.map((p) => p.key)).toEqual(b.map((p) => p.key));
    a.forEach((p, i) => {
      for (const t of [0, 123.4, 5000]) expect(at(p, t)).toEqual(at(b[i]!, t));
    });
    const moved = a.some((p) => {
      const p0 = at(p, 100);
      const p1 = at(p, 120);
      return Math.hypot(p1.x - p0.x, p1.z - p0.z) > 5;
    });
    expect(moved).toBe(true);
  });

  it('s vahadlem a vědry tam i zpět, u vody stojí, doma na chvíli zmizí', () => {
    const [p] = traffic(plan(peopled(12)));
    const clips = new Set<string>();
    let hidden = 0;
    let atWater = 0;
    for (let t = 0; t < 2000; t += 1) {
      const pose = at(p!, t);
      if (pose.hidden) {
        hidden++;
        continue;
      }
      clips.add(pose.clip);
      if (Math.hypot(pose.x, pose.z + 450) < 5) atWater++;
    }
    expect([...clips].sort()).toEqual(['carry-water', 'water-idle']);
    expect(hidden).toBeGreaterThan(0);
    expect(atWater).toBeGreaterThan(0);
  });

  it('na pole a zpět chodí od domu ke dílu dnešní práce, nikdy přes dům', () => {
    const shares: LaborShare[] = [
      { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 12 },
    ];
    const v = peopled(5, undefined, shares);
    const walkers = traffic(plan(v), 'traffic:field:');
    expect(walkers.length).toBeGreaterThan(0);
    const field = v.fields[0]!.parts;
    let nearField = 0;
    let nearHome = 0;
    for (const p of walkers) {
      for (let t = 0; t < 600; t += 2) {
        const pose = at(p, t);
        if (pose.hidden) continue;
        expect(inHouse(v, pose.x, pose.z)).toBe(false);
        if (field.some((q) => Math.abs(pose.x - q.x) < 9 && Math.abs(pose.z - q.z) < 9)) {
          nearField++;
        }
        if (Math.hypot(pose.x, pose.z) < 20) nearHome++;
      }
    }
    expect(nearField).toBeGreaterThan(0);
    expect(nearHome).toBeGreaterThan(0);
  });
});

describe('porážka – parta o 2 postavy nebere lidi jiným činnostem (diet.md – Porážka ve scéně)', () => {
  const START = LIVESTOCK_EPOCH_MS + 5_000_000;
  const dayWindow = (day: number): { startMs: number; endMs: number } => ({
    startMs: START + (day - 1000) * 86_000,
    endMs: START + (day - 1000 + 1) * 86_000,
  });
  it('počet postav celkem se oproti dni bez porážky nezmění', () => {
    const shares: LaborShare[] = [
      { activity: 'slaughter', target: { kind: 'village' }, manDays: 0.4 },
      { activity: 'idle', target: { kind: 'village' }, manDays: 5 },
      { activity: 'milking', target: { kind: 'village' }, manDays: 1 },
    ];
    const base = village(shares, 11, { children: 2, adults: 3, elders: 0 });
    const plain = planVillagers(base, GROUND, { seed: 3, herds: 0, dayWindow });
    const withHeads: SceneVillage = {
      ...base,
      labor: { ...base.labor!, slaughter: { pig: 1 } },
    };
    const people = planVillagers(withHeads, GROUND, { seed: 3, herds: 0, dayWindow });
    expect(people.some((p) => p.key.startsWith('slaughter-crew:'))).toBe(true);
    expect(people.length).toBe(plain.length);
  });
});

describe('pohřeb – průvod mimo rozpočet pracujících (cemetery.md – Pohřeb ve scéně)', () => {
  const DAY = 1000;
  const START = LIVESTOCK_EPOCH_MS + 5_000_000;
  const dayWindow = (day: number): { startMs: number; endMs: number } => ({
    startMs: START + (day - DAY) * 86_000,
    endMs: START + (day - DAY + 1) * 86_000,
  });
  const v: SceneVillage = {
    ...village(SHARES),
    funerals: [
      {
        key: '8:-3:-3:3:4',
        cemeteryId: 8,
        cell: { x: -3, y: -3 },
        column: 3,
        row: 4,
        size: 'normal',
        rank: 'adult',
        day: DAY,
        x: -37,
        z: -36,
        from: 2,
        mourners: Array.from({ length: 10 }, (_, i) => ({
          sex: i % 2 ? ('female' as const) : ('male' as const),
          age: 8 + i * 6,
          home: 1 + (i % 3),
        })),
      },
    ],
  };
  const plans = planFunerals(v, GROUND, { seed: 3, dayWindow });
  const work = (list: PlannedVillager[]): number =>
    list.filter((p) => !/^(funeral|elder|herder|traffic):/.test(p.key)).length;

  it('průvod: 4 nosiči a lidé za márami; o ně méně pracujících postav', () => {
    expect(plans).toHaveLength(1);
    const without = planVillagers(v, GROUND, { seed: 3, herds: 0, maxWorkers: 20, dayWindow });
    const people = planVillagers(v, GROUND, {
      seed: 3,
      herds: 0,
      maxWorkers: 20,
      dayWindow,
      funerals: plans,
    });
    const funeral = people.filter((p) => p.key.startsWith('funeral:'));
    expect(funeral).toHaveLength(14);
    expect(funeral.filter((p) => p.key.includes(':bearer:')).every((p) => p.kind === 'man')).toBe(
      true,
    );
    // dvě stavby (stavba a kácení) mají vždy někoho
    expect(work(people)).toBeLessThanOrEqual(Math.max(2, 20 - 14));
    expect(work(people)).toBeLessThan(work(without));
  });

  it('průvod vychází od vchodu domu zemřelého; mimo dny obřadu nikdo', () => {
    const plan = plans[0]!;
    const door = plan.path.points[0]!;
    expect(Math.hypot(door[0] - 14, door[1] - 3)).toBeLessThan(16);
    const bearer = planVillagers(v, GROUND, { seed: 3, herds: 0, dayWindow, funerals: plans }).find(
      (p) => p.key.endsWith(':bearer:0'),
    )!;
    const pose = bearer.pose(
      villagerSeconds(plan.timeline.departMs + 4000),
      [],
      createVillagerPose(),
    );
    expect(pose.hidden).toBe(false);
    const later = planVillagers({ ...v, labor: { ...v.labor!, day: DAY + 6 } }, GROUND, {
      seed: 3,
      herds: 0,
      dayWindow,
      funerals: plans,
    });
    expect(later.some((p) => p.key.startsWith('funeral:'))).toBe(false);
  });
});

describe('vchody domů podle varianty rozměrů (population.md – Varianty rozměrů)', () => {
  const DAY = 1000;
  const START = LIVESTOCK_EPOCH_MS + 5_000_000;
  const dayWindow = (day: number): { startMs: number; endMs: number } => ({
    startMs: START + (day - DAY) * 86_000,
    endMs: START + (day - DAY + 1) * 86_000,
  });
  const base = village(SHARES);
  const plain: SceneVillage = {
    ...base,
    dwellings: base.dwellings.map((d) => ({ ...d, plainShape: true as const })),
  };
  const funerals = (v: SceneVillage): SceneVillage => ({
    ...v,
    funerals: [
      {
        key: '8:-3:-3:3:4',
        cemeteryId: 8,
        cell: { x: -3, y: -3 },
        column: 3,
        row: 4,
        size: 'normal',
        rank: 'adult',
        day: DAY,
        x: -37,
        z: -36,
        from: 2,
        mourners: [{ sex: 'male', age: 30, home: 2 }],
      },
    ],
  });
  const weddings = (v: SceneVillage): SceneVillage => ({
    ...v,
    sacred: { oaks: [{ id: 77, x: 10, z: 60 }], groves: [], buildings: [] },
    weddings: [
      {
        key: `${DAY}:0`,
        day: DAY,
        bride: { id: 50, age: 19, from: 2 },
        groom: { id: 51, age: 23, from: 2 },
        home: 2,
        guests: [],
      },
    ],
  });
  /** Vchod průvodu (první bod cesty) v osách domu 2 a přední okraj jeho obdélníku. */
  const doorOf = (
    points: readonly (readonly [number, number])[],
    v: SceneVillage,
  ): [number, number] => {
    const home = v.dwellings.find((d) => d.id === 2)!;
    const [, lz] = worldToLocal(home.position, points[0]![0], points[0]![1]);
    return [lz, houseBox(home.type, sceneFrame(home)).maxZ];
  };

  it('pohřeb i svatba vycházejí před šíjí domu v jeho variantě – vchod se posune s domem', () => {
    const [plainDoor, plainFront] = doorOf(
      planFunerals(funerals(plain), GROUND, { seed: 3, dayWindow })[0]!.path.points,
      plain,
    );
    const [door, front] = doorOf(
      planFunerals(funerals(base), GROUND, { seed: 3, dayWindow })[0]!.path.points,
      base,
    );
    expect(front).not.toBeCloseTo(plainFront, 3);
    expect(door - front).toBeCloseTo(plainDoor - plainFront, 6);
    const wedding = planWeddings(weddings(base), GROUND, { seed: 3, dayWindow })[0]!;
    const plainWedding = planWeddings(weddings(plain), GROUND, { seed: 3, dayWindow })[0]!;
    const [wDoor, wFront] = doorOf(wedding.village.path.points, base);
    const [pDoor, pFront] = doorOf(plainWedding.village.path.points, plain);
    expect(wDoor - wFront).toBeCloseTo(pDoor - pFront, 6);
  });
});

describe('svatba – průvod nepřejde plot ohrady (paths.md – Ploty jsou neprůchodné)', () => {
  const DAY = 1000;
  const START = LIVESTOCK_EPOCH_MS + 5_000_000;
  const dayWindow = (day: number): { startMs: number; endMs: number } => ({
    startMs: START + (day - DAY) * 86_000,
    endMs: START + (day - DAY + 1) * 86_000,
  });
  const base: SceneVillage = {
    ...village([]),
    sacred: { oaks: [{ id: 77, x: 10, z: 60 }], groves: [], buildings: [] },
    weddings: [
      {
        key: `${DAY}:0`,
        day: DAY,
        bride: { id: 50, age: 19, from: 2 },
        groom: { id: 51, age: 23, from: 2 },
        home: 2,
        guests: [],
      },
    ],
  };

  it('úsek bez uložené trasy vede kolem plotu, ne skrz něj', () => {
    const free = planWeddings(base, GROUND, { seed: 3, dayWindow })[0]!.village.path.points;
    const a = free[0]!;
    const b = free[free.length - 1]!;
    // ohrada napříč cestou, o kus vpravo: obejít ji jde jen z té strany (vlevo stojí domy)
    const mid = { x: (a[0] + b[0]) / 2 + 4, z: (a[1] + b[1]) / 2 };
    const penned: SceneVillage = {
      ...base,
      pens: [
        {
          id: 1,
          cell: { x: 1, y: 0 },
          x: mid.x,
          z: mid.z,
          size: 15,
          built: true,
          progress: 1,
          oxen: 0,
          trainees: 0,
          cows: 0,
        },
      ],
    };
    const points = planWeddings(penned, GROUND, { seed: 3, dayWindow })[0]!.village.path.points;
    // plot stojí 1,5 m uvnitř čtverce 15 m; žádný bod úseku nesmí ležet na plotu
    const half = 6;
    for (let i = 1; i < points.length; i++) {
      const [px, pz] = points[i - 1]!;
      const [qx, qz] = points[i]!;
      for (let s = 0; s <= 40; s++) {
        const x = px + ((qx - px) * s) / 40;
        const z = pz + ((qz - pz) * s) / 40;
        const inside = Math.abs(x - mid.x) < half - 0.3 && Math.abs(z - mid.z) < half - 0.3;
        expect(inside).toBe(false);
      }
    }
  });
});

describe('svatba – průvod mimo rozpočet pracujících (kinship.md – Svatba ve scéně)', () => {
  const DAY = 1000;
  const START = LIVESTOCK_EPOCH_MS + 5_000_000;
  const dayWindow = (day: number): { startMs: number; endMs: number } => ({
    startMs: START + (day - DAY) * 86_000,
    endMs: START + (day - DAY + 1) * 86_000,
  });
  const base = village(SHARES);
  const v: SceneVillage = {
    ...base,
    sacred: { oaks: [{ id: 77, x: 10, z: 60 }], groves: [], buildings: [] },
    weddings: [
      {
        key: `${DAY}:0`,
        day: DAY,
        bride: { id: 50, age: 19, from: 1 },
        groom: { id: 51, age: 23, from: 2 },
        home: 2,
        guests: Array.from({ length: 8 }, (_, i) => ({
          sex: i % 2 ? ('female' as const) : ('male' as const),
          age: 10 + i * 6,
          home: 1 + (i % 3),
        })),
      },
    ],
  };
  const weddings = planWeddings(v, GROUND, { seed: 3, dayWindow });
  const work = (list: PlannedVillager[]): number =>
    list.filter((p) => !/^(funeral|wedding|elder|herder|traffic):/.test(p.key)).length;

  it('pár a svatebčané k posvátnému dubu; nevěsta s věncem v běleném lnu; o ně méně pracujících', () => {
    expect(weddings).toHaveLength(1);
    expect(weddings[0]!.site.kind).toBe('oak');
    const without = planVillagers(v, GROUND, { seed: 3, herds: 0, maxWorkers: 20, dayWindow });
    const people = planVillagers(v, GROUND, {
      seed: 3,
      herds: 0,
      maxWorkers: 20,
      dayWindow,
      weddings,
    });
    const wedding = people.filter((p) => p.key.startsWith('wedding:'));
    expect(wedding).toHaveLength(10);
    const bride = wedding.find((p) => p.look.hair === 'wreath')!;
    expect(bride.kind).toBe('woman');
    expect(wedding.filter((p) => p.look.hair === 'wreath')).toHaveLength(1);
    expect(work(people)).toBeLessThanOrEqual(Math.max(2, 20 - 10));
    expect(work(people)).toBeLessThan(work(without));
    // mimo dny svatby nikdo
    const later = planVillagers({ ...v, labor: { ...v.labor!, day: DAY + 40 } }, GROUND, {
      seed: 3,
      herds: 0,
      dayWindow,
      weddings,
    });
    expect(later.some((p) => p.key.startsWith('wedding:'))).toBe(false);
  });

  it('pohřeb beze změny – se svatbou stejní lidé průvodu a stejné pózy', () => {
    const withFuneral: SceneVillage = {
      ...v,
      funerals: [
        {
          key: '8:-3:-3:3:4',
          cemeteryId: 8,
          cell: { x: -3, y: -3 },
          column: 3,
          row: 4,
          size: 'normal',
          rank: 'adult',
          day: DAY,
          x: -37,
          z: -36,
          from: 2,
          mourners: Array.from({ length: 6 }, (_, i) => ({
            sex: i % 2 ? ('female' as const) : ('male' as const),
            age: 8 + i * 6,
            home: 1 + (i % 3),
          })),
        },
      ],
    };
    const funerals = planFunerals(withFuneral, GROUND, { seed: 3, dayWindow });
    const options = { seed: 3, herds: 0, dayWindow, funerals };
    const alone = planVillagers(withFuneral, GROUND, options).filter((p) =>
      p.key.startsWith('funeral:'),
    );
    const both = planVillagers(withFuneral, GROUND, { ...options, weddings }).filter((p) =>
      p.key.startsWith('funeral:'),
    );
    expect(both.map((p) => p.key)).toEqual(alone.map((p) => p.key));
    const t = villagerSeconds(funerals[0]!.timeline.departMs + 9000);
    for (let i = 0; i < alone.length; i++) {
      expect(both[i]!.pose(t, [], createVillagerPose())).toEqual(
        alone[i]!.pose(t, [], createVillagerPose()),
      );
      expect(both[i]!.look).toEqual(alone[i]!.look);
    }
  });
});

describe('výmlat na humně (production-chains.md – Humno; issue #3)', () => {
  const FLOOR = { x: 60, z: -50 };
  const withFloor = (target: SceneLaborShare['target']): SceneVillage => ({
    ...village([{ activity: 'thresh', target, manDays: 3 }]),
    threshingFloors: [{ id: 40, position: { ...FLOOR, rotation: 0 }, built: true, progress: 1 }],
  });
  const threshers = (v: SceneVillage): PlannedVillager[] =>
    planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) => p.key.startsWith('thresh:'));

  it('podíl na hotovém humnu mlátí lidé na humně, ne jinde u vsi', () => {
    const people = threshers(withFloor({ kind: 'threshing-floor', id: 40 }));
    expect(people.length).toBe(3);
    for (const p of people) {
      for (const t of [5, 20, 60]) {
        const pose = at(p, t);
        expect(Math.hypot(pose.x - FLOOR.x, pose.z - FLOOR.z)).toBeLessThan(5);
      }
    }
  });

  it('nouzový výmlat (cíl ves) zůstává u vsi', () => {
    const people = threshers(withFloor({ kind: 'village' }));
    expect(people.length).toBe(3);
    const pose = at(people[0]!, 20);
    expect(Math.hypot(pose.x - FLOOR.x, pose.z - FLOOR.z)).toBeGreaterThan(20);
  });
});

describe('lidé při práci na cestě (roads.md – Lidé při práci na cestě)', () => {
  const line = (z: number, from: number, to: number): { x: number; z: number }[] => {
    const out = [];
    for (let x = from; x <= to; x += 10) out.push({ x, z });
    return out;
  };

  it('úprava víc úseků: postavy stojí u čela na úseku, kde se pracuje', () => {
    const base = village([{ activity: 'build', target: { kind: 'road', id: 2 }, manDays: 4 }]);
    const v: SceneVillage = {
      ...base,
      roads: [
        { id: 1, points: line(100, -100, 0), grade: 'improved' },
        {
          id: 2,
          points: line(100, 0, 100),
          grade: 'trodden',
          upgrade: { grade: 'improved', progress: 0.5 },
        },
        { id: 3, points: line(100, 100, 200), grade: 'trodden' },
      ],
    };
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('build:'),
    );
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      const { x, z } = at(p, 5);
      expect(Math.abs(x - 50)).toBeLessThan(25);
      expect(Math.abs(z - 100)).toBeLessThan(4);
    }
  });

  it('vozová cesta ve stavbě: kopáči v úvozu u čela a nosiči, kteří chodí s koši', () => {
    const base = village([
      { activity: 'build', target: { kind: 'wagon', id: 5, x: 60, z: 100 }, manDays: 8 },
    ]);
    const v: SceneVillage = {
      ...base,
      earthworks: [
        {
          id: 1,
          profile: line(100, 0, 120).map((p) => ({ ...p, y: 0 })),
          reachedM: 60,
          shownM: 60,
          pieces: [{ toM: 120, ageYears: null }],
          building: true,
          constructionId: 5,
        },
      ],
    };
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('build:'),
    );
    expect(people.length).toBeGreaterThanOrEqual(3);
    const clips = new Set<string>();
    for (const p of people) {
      for (let t = 0; t < 120; t += 3) {
        const pose = at(p, t);
        clips.add(pose.clip);
        expect(Math.hypot(pose.x - 60, pose.z - 100)).toBeLessThan(14);
      }
    }
    expect(clips.has('hoe')).toBe(true);
    expect(clips.has('carry')).toBe(true);
  });

  it('víc vozových cest: dělníci se natočí podle osy své stavby, ne první v seznamu', () => {
    const base = village([
      { activity: 'build', target: { kind: 'wagon', id: 7, x: 60, z: 100 }, manDays: 8 },
    ]);
    const prof = (pts: { x: number; z: number }[]): SceneVillage['earthworks'] => [
      {
        id: 1,
        profile: pts.map((p) => ({ ...p, y: 0 })),
        reachedM: 60,
        shownM: 60,
        pieces: [{ toM: 120, ageYears: null }],
        building: true,
        constructionId: 9,
      },
    ];
    const other = prof(line(100, 0, 120))![0]!;
    // vlastní osa stavby 7 vede ve směru z (kolmo k cizí)
    const own = {
      ...other,
      id: 2,
      constructionId: 7,
      profile: Array.from({ length: 13 }, (_, k) => ({ x: 60, z: 40 + k * 10, y: 0 })),
    };
    const v: SceneVillage = { ...base, earthworks: [other, own] };
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0 }).filter((p) =>
      p.key.startsWith('build:'),
    );
    // stojící kopáči (nosiči chodí) hledí po ose své stavby (z), ne cizí (x)
    const diggers = people
      .filter((p) => at(p, 0).clip === 'hoe' && at(p, 40).x === at(p, 0).x)
      .map((p) => at(p, 0));
    expect(diggers.length).toBeGreaterThan(0);
    for (const d of diggers) expect(Math.abs(d.headingX)).toBeLessThan(0.2);
  });
});

describe('pletí hlavně ženy a děti, seč hlavně muži (fields.md – Pletí jednou a rychle)', () => {
  it('pletí dospělých podle podílu žen z jádra – ženy vsi plejí napřed', () => {
    let weeders = 0;
    let weedWomen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const people = planVillagers(
        village([{ activity: 'weed', target: { kind: 'field', id: 7 }, manDays: 4, women: 1 }], 5),
        GROUND,
        { seed, herds: 0 },
      );
      for (const p of people) {
        if (!p.key.startsWith('weed:')) continue;
        weeders++;
        if (p.kind === 'woman') weedWomen++;
      }
    }
    expect(weeders).toBeGreaterThan(0);
    expect(weedWomen).toBe(weeders);
  });

  it('bez údaje jádra: pletí hlavně ženy, seč hlavně muži (podíl činnosti)', () => {
    expect(WOMEN.weed).toBeGreaterThanOrEqual(0.85);
    expect(WOMEN.mow).toBeLessThanOrEqual(0.15);
  });
});
