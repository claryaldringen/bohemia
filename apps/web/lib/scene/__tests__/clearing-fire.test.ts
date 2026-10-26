import { FOREST_CLEARING } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneLaborShare, SceneVillage } from '../../village-view';
import {
  HEAP_FIRE_SPRITES,
  MAX_SLASH_PLUMES,
  burningKey,
  burningSquares,
  heapFireShape,
  heapFires,
  slashPlumes,
} from '../clearing-fire';
import { slashHeapSites } from '../clearing-slash-layout';
import { fireSprites, fireSpriteCount } from '../pyre-fire';
import {
  HEARTH_PLUME,
  PYRE_PLUME,
  SLASH_PLUME,
  SMOLDER_SMOKE,
  clearingFireState,
  plumeShape,
  ventSmokeStrength,
} from '../smoke-schedule';
import { burnHeaps } from '../villager-plan-fields';
import { createVillagerPose } from '../villager-motion';
import { planVillagers, type PlannedVillager, type VillagerGround } from '../villager-plan';

const DAY = 4000;

const square = (cx: number, id: number, extra: Partial<SceneFieldPart>): SceneFieldPart => ({
  id,
  cell: { x: cx, y: 0 },
  x: cx * 15 + 7.5,
  z: 7.5,
  size: 15,
  stage: 'founding',
  ...extra,
});

const BURNING: Partial<SceneFieldPart> = { look: 'burnt', before: 'slash', work: 0.5 };

function village(
  parts: SceneFieldPart[],
  shares: SceneLaborShare[] | null = [
    { activity: 'found-field', target: { kind: 'field', id: 7 }, manDays: 8 },
  ],
): SceneVillage {
  return {
    dwellings: [
      {
        id: 1,
        type: 'zemnice',
        position: { x: 0, z: 0, rotation: 0 },
        built: true,
        progress: 1,
        inhabited: true,
      },
    ],
    fields: [{ id: 7, parts }],
    cemeteries: [],
    ...(shares
      ? { labor: { day: DAY, month: 3, people: { children: 0, adults: 8, elders: 0 }, shares } }
      : {}),
  };
}

describe('clearingFireState – kdy hoří a doutná', () => {
  const burn = { burnedDay: DAY };

  it('v den dohoření: ráno nic, přes pracovní den oheň, večer žhnou uhlíky', () => {
    expect(clearingFireState(burn, DAY + 0.2)).toEqual({ fire: 0, glow: 0, smoke: 0 });
    const first = clearingFireState(burn, DAY + 0.35, 0);
    expect(first.fire).toBeGreaterThan(0.9);
    expect(first.smoke).toBe(1);
    // poslední hromada čtverce se zapaluje až odpoledne
    expect(clearingFireState(burn, DAY + 0.35, 1).fire).toBe(0);
    expect(clearingFireState(burn, DAY + 0.7, 1).fire).toBeGreaterThan(0.5);
    const evening = clearingFireState(burn, DAY + 0.9, 1);
    expect(evening.fire).toBe(0);
    expect(evening.glow).toBeGreaterThan(0.3);
    expect(evening.smoke).toBeGreaterThanOrEqual(SMOLDER_SMOKE);
    expect(evening.smoke).toBeLessThan(1);
  });

  it(`doutná ${FOREST_CLEARING.smolderDays} dny od dohoření – jen kouř, pak nic`, () => {
    const next = clearingFireState(burn, DAY + 1.5);
    expect(next).toEqual({ fire: 0, glow: 0, smoke: SMOLDER_SMOKE });
    // na konci doutnání dým mizí
    expect(clearingFireState(burn, DAY + FOREST_CLEARING.smolderDays - 0.02).smoke).toBeLessThan(
      SMOLDER_SMOKE,
    );
    const after = DAY + FOREST_CLEARING.smolderDays;
    expect(clearingFireState(burn, after + 0.5)).toEqual({ fire: 0, glow: 0, smoke: 0 });
    expect(clearingFireState(burn, DAY - 0.5)).toEqual({ fire: 0, glow: 0, smoke: 0 });
  });

  it('rozpracované pálení hoří každý pracovní den stejně, přes noc doutná', () => {
    expect(clearingFireState({}, DAY + 0.4, 0.3)).toEqual(clearingFireState({}, DAY + 9.4, 0.3));
    expect(clearingFireState({}, DAY + 0.4, 0.3).fire).toBeGreaterThan(0);
    expect(clearingFireState({}, DAY + 0.1)).toEqual({ fire: 0, glow: 0, smoke: SMOLDER_SMOKE });
  });

  it('dým paseky je hustší než z dýmníku a menší než z hranice; rozvrh ohně dýmníku nemá', () => {
    expect(plumeShape('slash')).toBe(SLASH_PLUME);
    expect(SLASH_PLUME.puffs).toBeGreaterThan(HEARTH_PLUME.puffs);
    expect(SLASH_PLUME.puffs).toBeLessThan(PYRE_PLUME.puffs);
    expect(SLASH_PLUME.riseM).toBeLessThan(PYRE_PLUME.riseM);
    expect(ventSmokeStrength('slash', 3, DAY + 0.5)).toBe(0);
  });
});

describe('ohně hromad větví', () => {
  it('sprity jsou deterministické a hromada má menší oheň než hranice', () => {
    const shape = heapFireShape(1);
    const state = { fire: 0.8, stack: 0.9, glow: 0.2 };
    const a = fireSprites(42, 123.4, state, { x: 1, z: 0 }, [], shape);
    const b = fireSprites(42, 123.4, state, { x: 1, z: 0 }, [], shape);
    expect(a).toEqual(b);
    expect(a.length).toBe(HEAP_FIRE_SPRITES);
    expect(fireSpriteCount(shape)).toBe(HEAP_FIRE_SPRITES);
    expect(a.some((f) => f.intensity > 0)).toBe(true);
    // plameny zůstávají u hromady
    for (const f of a.slice(0, shape.flames)) expect(Math.abs(f.dx)).toBeLessThan(4);
  });

  it('čtverce, které se dnes pálí nebo doutnají – podle práce a dne dohoření', () => {
    const parts = [
      square(2, 12, BURNING),
      square(3, 11, { look: 'slash' }),
      square(4, 13, { stage: 'ready', look: 'burnt', burnedDay: DAY - 1 }),
      square(5, 14, { stage: 'ready', look: 'burnt', burnedDay: DAY - 2 }),
      square(6, 10, { stage: 'ready', look: 'burnt', burnedDay: DAY }),
    ];
    const squares = burningSquares(village(parts), DAY);
    expect(squares.map((s) => s.part.id)).toEqual([10, 12, 13]);
    expect(squares.find((s) => s.part.id === 12)!.burn).toEqual({});
    // pole dnes bez práce zakládání – rozpracované pálení nehoří, dohořelé doutná dál
    const idle = burningSquares(village(parts, []), DAY);
    expect(idle.map((s) => s.part.id)).toEqual([10, 13]);
    // bez rozdělení práce se předpokládá, že se pálí
    expect(burningSquares(village(parts, null), DAY).map((s) => s.part.id)).toEqual([10, 12, 13]);
    expect(burningKey(squares, DAY)).not.toBe(burningKey(idle, DAY));
  });

  it('hromady hoří na spálené části rozpracovaného čtverce, na dohořelém všechny', () => {
    const burning = square(2, 12, BURNING);
    const done = square(3, 10, { stage: 'ready', look: 'burnt', burnedDay: DAY });
    const smolder = square(4, 13, { stage: 'ready', look: 'burnt', burnedDay: DAY - 1 });
    const v = village([burning, done, smolder]);
    const fires = heapFires(v, burningSquares(v, DAY), DAY, () => []);
    const of = (p: SceneFieldPart): typeof fires => fires.filter((f) => f.square === String(p.id));
    expect(of(done).length).toBe(slashHeapSites(done, []).length);
    expect(of(burning).length).toBeLessThanOrEqual(slashHeapSites(burning, []).length);
    expect(of(smolder)).toEqual([]);
    for (const f of fires) {
      expect(f.order).toBeGreaterThanOrEqual(0);
      expect(f.order).toBeLessThan(1);
    }
    // stejná ves, stejné ohně
    expect(heapFires(v, burningSquares(v, DAY), DAY, () => [])).toEqual(fires);
  });

  it(`dým nejvýš z ${MAX_SLASH_PLUMES} čtverců podle id dílu`, () => {
    const parts = Array.from({ length: MAX_SLASH_PLUMES + 5 }, (_, i) =>
      square(i + 2, 100 - i, { stage: 'ready', look: 'burnt', burnedDay: DAY }),
    );
    const plumes = slashPlumes(burningSquares(village(parts), DAY));
    expect(plumes.length).toBe(MAX_SLASH_PLUMES);
    expect(plumes[0]!.seed).toBe(100 - (MAX_SLASH_PLUMES + 4));
    expect(plumes.every((p) => p.burn.burnedDay === DAY)).toBe(true);
  });

  it('při přebytku dýmu mají přednost hořící čtverce před doutnajícími', () => {
    const smoldering = Array.from({ length: MAX_SLASH_PLUMES }, (_, i) =>
      square(i + 2, 10 + i, { stage: 'ready', look: 'burnt', burnedDay: DAY }),
    );
    const burning = square(40, 900, BURNING);
    const plumes = slashPlumes(burningSquares(village([...smoldering, burning]), DAY));
    expect(plumes.length).toBe(MAX_SLASH_PLUMES);
    expect(plumes[0]!.seed).toBe(900);
  });
});

describe('postavy při klučení', () => {
  const GROUND: VillagerGround = {
    walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
    tree: () => null,
    treesIn: () => [],
    squareObstacles: () => [],
  };
  const at = (p: PlannedVillager, t: number): ReturnType<PlannedVillager['pose']> =>
    p.pose(t, [], createVillagerPose());
  const founders = (v: SceneVillage, ground = GROUND): PlannedVillager[] =>
    planVillagers(v, ground, { seed: 3, herds: 0 }).filter((p) => p.key.startsWith('found-field:'));

  it('u hořících hromad stojí lidé s motykou čelem k ohni', () => {
    const burning = square(2, 12, BURNING);
    const v = village([square(3, 11, { look: 'slash' }), burning]);
    const sites = slashHeapSites(burning, []);
    const crew = founders(v);
    expect(crew.length).toBeGreaterThan(0);
    for (const p of crew) {
      const pose = at(p, 7);
      expect(pose.clip).toBe('hoe');
      const near = Math.min(...sites.map((s) => Math.hypot(s.x - pose.x, s.z - pose.z)));
      expect(near).toBeLessThan(1.5 * 1.25 + 1.5);
    }
  });

  it('burnCrew se hlásí jen k hromadám, které už hoří (před čarou práce)', () => {
    const early = square(2, 11, BURNING);
    const late = { ...early, work: 0.05 };
    const full = { ...early, work: 1 };
    const sites = (part: SceneFieldPart): number =>
      burnHeaps(
        { day: DAY, ground: { squareObstacles: () => [] } } as unknown as Parameters<
          typeof burnHeaps
        >[0],
        part,
        { rows: [1, 0], center: { x: 0, z: 0 } } as unknown as Parameters<typeof burnHeaps>[2],
      ).length;
    expect(sites(full)).toBe(slashHeapSites(full, []).length);
    expect(sites(late)).toBeLessThan(sites(full));
    expect(sites({ ...early, work: 0 })).toBe(0);
  });

  it('na schnoucí pasece nikdo nepracuje – jen na kácené', () => {
    const drying = square(2, 11, { look: 'slash' });
    const felling = square(3, 12, { look: 'slash', work: 0.5 });
    const v = village([drying, felling]);
    const ground = {
      ...GROUND,
      treesIn: (x: number) => (x === felling.x ? [{ x: felling.x + 3, z: 6 }] : []),
    };
    const crew = founders(v, ground);
    expect(crew.length).toBeGreaterThan(0);
    for (const p of crew) {
      const pose = at(p, 7);
      expect(Math.abs(pose.x - drying.x) <= 7.5 && Math.abs(pose.z - drying.z) <= 7.5).toBe(false);
    }
  });

  it('na kácené pasece půlka kácí a půlka nosí kmeny k hromadě klád u lesa', () => {
    const felling = square(2, 12, { look: 'slash', work: 0.5 });
    const trees = [
      { x: 34, z: 5 },
      { x: 40, z: 10 },
    ];
    const v = { ...village([felling]), logStacks: [{ id: 1, x: 70, z: 8, logs: 6 }] };
    const crew = founders(v, { ...GROUND, treesIn: () => trees });
    const clips = new Set(
      crew.flatMap((p) => Array.from({ length: 40 }, (_, k) => at(p, k * 3).clip)),
    );
    expect(clips.has('fell')).toBe(true);
    expect(clips.has('carry-wood')).toBe(true);
  });
});
