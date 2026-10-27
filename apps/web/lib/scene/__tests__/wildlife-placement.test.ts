import { describe, expect, it } from 'vitest';
import type { SceneWildlife } from '../../village-view-scene-types';
import { SCENE_WILD_SHOWN } from '../../wildlife-view';
import { shownSchools } from '../fauna-placement';
import type { LivestockGround } from '../livestock-placement';
import {
  WILD_MODELS,
  segmentFree,
  planWildlife,
  wantedGroups,
  type WildGroup,
  type WildlifeVillage,
} from '../wildlife-placement';

// Rozmístění divoké zvěře ve scéně (wildlife.md – Ve scéně): deterministické, počty podle
// `shown`, nic ve stavbách ani ve vodě.

/** Les od z = 110 dál (okraj 103–115), voda v pásu x −160…−140, jinak louka. */
const ground: LivestockGround = {
  walkable: (x, z) => !(x > -160 && x < -140) && Math.abs(x) < 400 && Math.abs(z) < 400,
  forestEdge: (x, z) => z >= 103 && z <= 115 && !(x > -160 && x < -140),
  verge: (x, z) => z >= 83 && z <= 97 && !(x > -163 && x < -137),
  pasture: (x, z) => z < 97 && !(x > -163 && x < -137),
};

const shown = (over: Partial<SceneWildlife['shown']> = {}): SceneWildlife['shown'] => ({
  stags: 2,
  hinds: 6,
  calves: 2,
  boars: 6,
  piglets: 4,
  hares: 4,
  foxes: 1,
  wolves: 3,
  bears: 1,
  ...over,
});

function village(wild: Partial<SceneWildlife> = {}): WildlifeVillage {
  return {
    dwellings: [
      { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true },
      { id: 2, type: 'zemnice', position: { x: 24, z: 6, rotation: 0 }, built: true },
    ],
    fields: [
      {
        parts: [
          { id: 7, x: 0, z: 80, size: 20 },
          { id: 8, x: 20, z: 80, size: 20 },
          { id: 9, x: -60, z: 40, size: 20, look: 'stubble' },
        ],
      },
    ],
    wildlife: { shown: shown(), month: 5, crowFlocks: 2, fishShare: 0.5, ...wild },
  };
}

const animalsOf = (groups: readonly WildGroup[], species: string): number =>
  groups.filter((g) => g.species === species).reduce((n, g) => n + g.herd.animals.length, 0);

describe('planWildlife', () => {
  it('je deterministické – stejná ves a seed, stejné skupiny; jiný seed jinde', () => {
    const a = planWildlife(village(), ground, 42).groups;
    const b = planWildlife(village(), ground, 42).groups;
    const c = planWildlife(village(), ground, 43).groups;
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(c.map((g) => g.herd.route[0])).not.toEqual(a.map((g) => g.herd.route[0]));
  });

  it('kusů je tolik, kolik scéna ukazuje (mimo zimu bez vlků)', () => {
    const groups = planWildlife(village(), ground, 42).groups;
    expect(animalsOf(groups, 'deer')).toBe(10);
    expect(animalsOf(groups, 'boar')).toBe(10);
    expect(animalsOf(groups, 'hare')).toBe(4);
    expect(animalsOf(groups, 'fox')).toBe(1);
    expect(animalsOf(groups, 'bear')).toBe(1);
    expect(animalsOf(groups, 'wolf')).toBe(0);
    // každý kus má model, modely jsou jen ty z W8
    for (const g of groups) {
      expect(g.models).toHaveLength(g.herd.animals.length);
      for (const m of g.models) expect(WILD_MODELS).toContain(m);
    }
  });

  it('vlci jen v zimě, medvěd duben–listopad, v říji jeleni u laní', () => {
    const winter = planWildlife(village({ month: 1 }), ground, 42).groups;
    expect(animalsOf(winter, 'wolf')).toBe(3);
    expect(animalsOf(winter, 'bear')).toBe(0);
    const rut = wantedGroups({ ...village().wildlife!, month: 9 }, false);
    expect(rut.filter((g) => g.species === 'deer')).toHaveLength(1);
    const spring = wantedGroups(village().wildlife!, false);
    expect(spring.filter((g) => g.species === 'deer')).toHaveLength(2);
  });

  it('vzácní znají směr do lesa (vycházejí z něj a odcházejí do něj), stálá zvěř ne', () => {
    // les od z = 110 dál – nejhlouběji po +z
    const forest: LivestockGround = { ...ground, forestDepth: (_x, z) => z - 110 };
    const winter = planWildlife(village({ month: 1 }), forest, 42).groups;
    const wolves = winter.find((g) => g.species === 'wolf');
    expect(wolves?.retreat).toBeDefined();
    expect(wolves!.retreat!.z).toBeCloseTo(1, 5);
    expect(Math.hypot(wolves!.retreat!.x, wolves!.retreat!.z)).toBeCloseTo(1, 5);
    for (const g of winter) if (g.presence >= 1) expect(g.retreat).toBeUndefined();
    // bez hloubky lesa pryč od vsi – jednotkový směr, deterministicky
    const plain = planWildlife(village({ month: 1 }), ground, 42).groups;
    const r = plain.find((g) => g.species === 'wolf')!.retreat!;
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 5);
    expect(planWildlife(village({ month: 1 }), ground, 42).groups).toEqual(plain);
  });

  it('mez scény: nejvýš 12 jelení, 10 prasat, 4 zajíci, 5 vlků', () => {
    expect(Math.max(...SCENE_WILD_SHOWN.deer)).toBe(12);
    expect(Math.max(...SCENE_WILD_SHOWN.boar)).toBe(10);
    expect(Math.max(...SCENE_WILD_SHOWN.hare)).toBe(4);
    expect(Math.max(...SCENE_WILD_SHOWN.wolf)).toBe(5);
  });

  it('nic ve stavbách, na polích ani ve vodě; zvěř na okraji lesa a loukách', () => {
    const v = village({ month: 1 });
    const groups = planWildlife(v, ground, 7).groups;
    const parts = v.fields.flatMap((f) => f.parts).filter((p) => p.look !== 'stubble');
    for (const g of groups) {
      for (const spot of g.herd.route) {
        if (g.zone === 'edge') expect(ground.forestEdge(spot.x, spot.z)).toBe(true);
        if (g.zone === 'verge') expect(ground.verge?.(spot.x, spot.z)).toBe(true);
        if (g.species === 'deer') expect(ground.forestEdge(spot.x, spot.z)).toBe(false);
        if (g.zone === 'meadow') {
          const stubble = Math.hypot(spot.x + 60, spot.z - 40) < 1;
          expect(stubble || ground.pasture(spot.x, spot.z)).toBe(true);
        }
        for (const a of g.herd.animals) {
          const x = spot.x + a.homeX;
          const z = spot.z + a.homeZ;
          expect(ground.walkable(x, z), `${g.species} ve vodě`).toBe(true);
          for (const d of v.dwellings) {
            expect(Math.hypot(x - d.position.x, z - d.position.z)).toBeGreaterThan(12);
          }
          for (const p of parts) {
            expect(Math.hypot(x - p.x, z - p.z)).toBeGreaterThan(p.size * Math.SQRT1_2 - 1e-6);
          }
        }
      }
    }
  });

  it('v létě prasata na dílu s největší škodou', () => {
    const groups = planWildlife(village({ month: 7, topPartId: 7 }), ground, 42).groups;
    const boar = groups.find((g) => g.species === 'boar')!;
    expect(boar.zone).toBe('field');
    for (const spot of boar.herd.route) {
      expect(Math.abs(spot.x - 0)).toBeLessThanOrEqual(10);
      expect(Math.abs(spot.z - 80)).toBeLessThanOrEqual(10);
    }
    // mimo léto díl se škodou nehraje roli
    const may = planWildlife(village({ month: 5, topPartId: 7 }), ground, 42).groups;
    expect(may.find((g) => g.species === 'boar')!.zone).toBe('edge');
  });

  it('bez zvěře nebo bez hotového obydlí nic', () => {
    const v = village();
    expect(planWildlife({ ...v, wildlife: undefined }, ground, 1).groups).toEqual([]);
    expect(
      planWildlife({ ...v, dwellings: v.dwellings.map((d) => ({ ...d, built: false })) }, ground, 1)
        .groups,
    ).toEqual([]);
  });
});

describe('shownSchools – hejna ryb podle biomasy', () => {
  it('počet × biomasa ÷ strop, aspoň jedno, bez ryb žádné', () => {
    expect(shownSchools(6, 1)).toBe(6);
    expect(shownSchools(6, 0.5)).toBe(3);
    expect(shownSchools(6, 0.01)).toBe(1);
    expect(shownSchools(6, 0)).toBe(0);
    expect(shownSchools(0, 1)).toBe(0);
  });
});

describe('planWildlife – trasy a toulání mimo překážky', () => {
  it('úsečky mezi body trasy neprocházejí vodou ani stavbou', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const plan = planWildlife(village(), ground, seed);
      for (const g of plan.groups) {
        const r = g.herd.route;
        for (let i = 1; i < r.length; i++) {
          expect(segmentFree(plan.free, r[i - 1]!, r[i]!)).toBe(true);
        }
        for (const p of r) expect(plan.free(p.x, p.z)).toBe(true);
      }
    }
  });

  it('segmentFree najde i překážku mezi konci', () => {
    const wall = (x: number): boolean => !(x > 7 && x < 13);
    expect(segmentFree(wall, { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
    expect(segmentFree(wall, { x: 0, z: 0 }, { x: 6, z: 0 })).toBe(true);
  });

  it('okruh toulání kolem bodu trasy leží na volné zemi', () => {
    // voda x −160…−140 – žádná skupina nemá okruh ve vodě
    for (let seed = 1; seed <= 12; seed++) {
      for (const g of planWildlife(village(), ground, seed).groups) {
        for (const p of g.herd.route) {
          expect(ground.walkable(p.x + g.herd.radiusM, p.z)).toBe(true);
          expect(ground.walkable(p.x - g.herd.radiusM, p.z)).toBe(true);
        }
      }
    }
  });
});
