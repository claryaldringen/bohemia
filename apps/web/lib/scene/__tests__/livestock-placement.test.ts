import { describe, it, expect } from 'vitest';
import { buildForestField, buildRelief, generateLandscape } from '@bohemia/game';
import {
  chickenBox,
  chickenPoint,
  chickensFor,
  householdCount,
  livestockGround,
  planLivestock,
  type Herd,
  type LivestockGround,
  type LivestockVillage,
} from '../livestock-placement';
import { GROUND, VILLAGE, dwelling, inSquares } from './livestock-fixtures';
import { buildRenderSurface } from '../render-surface';
import { tileCenter } from '../tile-at';

const species = (herds: Herd[], kind: Herd['kind'], name: string): number =>
  herds
    .filter((h) => h.kind === kind)
    .reduce((sum, h) => sum + h.animals.filter((a) => a.species === name).length, 0);

describe('planLivestock – kolik zvířat', () => {
  it('slepice: 2 u zemnice, 3 u polozemnice, jen u hotových obydlí', () => {
    expect(chickensFor('zemnice')).toBe(2);
    expect(chickensFor('polozemnice')).toBe(3);
    const village: LivestockVillage = {
      dwellings: [
        dwelling(1, 'zemnice', 0, 0),
        dwelling(2, 'polozemnice', 20, 0),
        dwelling(3, 'polozemnice', -20, 0, { built: false }),
      ],
      fields: [],
    };
    const plan = planLivestock(village, GROUND, 7);
    expect(plan.chickens.map((f) => f.chickens.length).sort()).toEqual([2, 3]);
  });

  it('na domácnost 3 ovce, koza a 2 prasata, kráva na dvě domácnosti', () => {
    const plan = planLivestock(VILLAGE, GROUND, 7);
    expect(householdCount(VILLAGE)).toBe(4);
    expect(species(plan.herds, 'flock', 'sheep')).toBe(12);
    expect(species(plan.herds, 'flock', 'goat')).toBe(4);
    expect(species(plan.herds, 'cattle', 'cow')).toBe(2);
    expect(species(plan.herds, 'swine', 'pig')).toBe(8);
  });

  it('neobývané obydlí nemá dobytek (slepice ano), víc domácností = víc stád', () => {
    const village: LivestockVillage = {
      dwellings: [
        ...Array.from({ length: 7 }, (_, i) => dwelling(i + 1, 'zemnice', i * 13 - 40, 0)),
        dwelling(9, 'zemnice', 0, 20, { inhabited: false }),
      ],
      fields: [],
    };
    const plan = planLivestock(village, GROUND, 3);
    expect(plan.chickens).toHaveLength(8);
    expect(plan.herds.filter((h) => h.kind === 'flock')).toHaveLength(2);
    expect(species(plan.herds, 'flock', 'sheep')).toBe(21);
    expect(species(plan.herds, 'flock', 'goat')).toBe(7);
    expect(species(plan.herds, 'cattle', 'cow')).toBe(4);
    expect(species(plan.herds, 'swine', 'pig')).toBe(14);
  });

  it('bez obydlí nic, rozmístění je deterministické', () => {
    expect(planLivestock({ dwellings: [], fields: [] }, GROUND, 1)).toEqual({
      chickens: [],
      herds: [],
    });
    expect(planLivestock(VILLAGE, GROUND, 11)).toEqual(planLivestock(VILLAGE, GROUND, 11));
  });
});

describe('planLivestock – kde', () => {
  const plan = planLivestock(VILLAGE, GROUND, 7);

  it('slepice chodí kolem domu, ne v něm ani v šíji, a ne do jiného domu', () => {
    for (const flock of plan.chickens) {
      const box = chickenBox(VILLAGE.dwellings.find((d) => d.position === flock.position)!.type);
      for (let i = 0; i < 64; i++) {
        const theta = flock.arc
          ? flock.arc.from + ((flock.arc.to - flock.arc.from) * i) / 63
          : (i / 64) * Math.PI * 2;
        for (const d of [flock.reachM.from, flock.reachM.to]) {
          const [x, z] = chickenPoint(flock, theta, d);
          const c = Math.cos(flock.position.rotation);
          const s = Math.sin(flock.position.rotation);
          const lx = (x - flock.position.x) * c - (z - flock.position.z) * s;
          const lz = (x - flock.position.x) * s + (z - flock.position.z) * c;
          const inside = Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('slepice se vyhnou sousednímu domu – u těsně postavených domů jen v oblouku', () => {
    const village: LivestockVillage = {
      dwellings: [dwelling(1, 'zemnice', 0, 0), dwelling(2, 'zemnice', 8, 0)],
      fields: [],
    };
    const tight = planLivestock(village, GROUND, 5);
    for (const flock of tight.chickens) {
      expect(flock.arc).not.toBeNull();
      const other = village.dwellings.find((d) => d.position !== flock.position)!;
      const box = chickenBox('zemnice');
      for (let i = 0; i <= 20; i++) {
        const theta = flock.arc!.from + ((flock.arc!.to - flock.arc!.from) * i) / 20;
        for (const d of [flock.reachM.from, flock.reachM.to]) {
          const [x, z] = chickenPoint(flock, theta, d);
          const lx = x - other.position.x;
          const lz = z - other.position.z;
          expect(Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ).toBe(false);
        }
      }
    }
  });

  it('stáda se pasou na louce, dál od obydlí, mimo pole, hřbitov a vodu', () => {
    for (const herd of plan.herds.filter((h) => h.kind !== 'swine')) {
      expect(herd.route.length).toBeGreaterThan(20);
      for (const spot of herd.route) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = spot.x + Math.cos(a) * herd.radiusM;
          const z = spot.z + Math.sin(a) * herd.radiusM;
          expect(GROUND.pasture(x, z)).toBe(true);
          expect(inSquares(VILLAGE, x, z)).toBe(false);
        }
        for (const d of VILLAGE.dwellings) {
          expect(Math.hypot(spot.x - d.position.x, spot.z - d.position.z)).toBeGreaterThan(12);
        }
        expect(Math.hypot(spot.x, spot.z)).toBeLessThanOrEqual(300);
      }
    }
  });

  it('trasa vede po sousedních pastvinách (krok 6–22 m)', () => {
    for (const herd of plan.herds) {
      for (let i = 1; i < herd.route.length; i++) {
        const a = herd.route[i - 1]!;
        const b = herd.route[i]!;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        expect(d).toBeGreaterThanOrEqual(6);
        expect(d).toBeLessThanOrEqual(22);
      }
    }
  });

  it('prasata jsou v lese u okraje do 150 m od vsi', () => {
    const swine = plan.herds.filter((h) => h.kind === 'swine');
    expect(swine.length).toBeGreaterThan(0);
    for (const herd of swine) {
      for (const spot of herd.route) {
        expect(GROUND.forestEdge(spot.x, spot.z)).toBe(true);
        expect(Math.hypot(spot.x - 1.25, spot.z + 1.5)).toBeLessThanOrEqual(155);
      }
    }
  });

  it('bez louky a lesa stáda nejsou (slepice ano)', () => {
    const bare: LivestockGround = {
      pasture: () => false,
      forestEdge: () => false,
      walkable: () => true,
    };
    const empty = planLivestock(VILLAGE, bare, 7);
    expect(empty.herds).toEqual([]);
    expect(empty.chickens.length).toBe(4);
  });
});

describe('livestockGround na skutečné krajině', () => {
  const landscape = generateLandscape(42);
  const surface = buildRenderSurface(landscape);
  const field = buildForestField(landscape);
  const relief = buildRelief(landscape);
  const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
  const ground = livestockGround(
    landscape,
    { field, stream: surface.stream, relief },
    { x: site.worldX, z: site.worldZ },
  );
  const village: LivestockVillage = {
    dwellings: [0, 1, 2, 3].map((i) =>
      dwelling(i + 1, 'zemnice', site.worldX + (i % 2) * 12, site.worldZ + Math.floor(i / 2) * 12),
    ),
    fields: [],
  };

  it('pastva jen na louce dál od lesa a vody, prasata v lese u okraje', () => {
    const plan = planLivestock(village, ground, 42);
    const flock = plan.herds.find((h) => h.kind === 'flock');
    expect(flock).toBeDefined();
    for (const herd of plan.herds) {
      for (const spot of herd.route) {
        const forest = field.distanceAt(spot.x, spot.z);
        const bank = surface.stream.nearest(spot.x, spot.z).bankDistance;
        if (herd.kind === 'swine') {
          expect(forest).toBeGreaterThanOrEqual(-8);
          expect(forest).toBeLessThanOrEqual(6);
        } else {
          expect(forest).toBeLessThan(-5);
        }
        expect(bank).toBeGreaterThan(2);
        expect(relief.slopeAt(spot.x, spot.z)).toBeLessThan(0.17);
      }
    }
  });
});
