import { describe, expect, it } from 'vitest';
import { cartGrid, cartPartSpeed, cartRoutes } from '../paths/cart';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { villageGrid } from '../paths/network-grid';
import { isCropPart, partWalkSpeed } from '../paths/walk-speed';
import { withFieldWalk, walkGroundOf } from '../paths/walking';
import { CART_SPEED, FIELD_WALK } from '../rules';
import type { PartStage } from '../summary';
import { house, LANDSCAPE, part, pathTestTerrain } from './paths-fixtures';

// paths.md – Stálé trasy (25. 10. 2026): pole má stálou cenu bez ohledu na stadium dílu, trasa
// míří na pole jako celek a remízy rozhoduje pevné pravidlo (nižší index předchůdce)

const terrain = pathTestTerrain();
const FIELD_STAGES: PartStage[] = ['founding', 'ready', 'sown', 'young-fallow', 'meadow'];
const OVERGROWN: PartStage[] = ['shrubs', 'young-forest'];

/** Pole 3 × 3 políček se středem (x, z) – všechny díly ve stadiu `stage`. */
function field(x: number, z: number, stage: PartStage, reversed = false): PathVillage['fields'] {
  const parts = [];
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) parts.push(part(x + a * 15, z + b * 15, stage));
  }
  return [{ id: 1, parts: reversed ? parts.reverse() : parts }];
}

function fieldRoute(fields: PathVillage['fields']): number[] {
  const network = computePathNetwork({
    village: { dwellings: [house(1, -67.5, -52.5)], fields },
    terrain,
    keepRoutes: true,
  });
  const route = (network.routes ?? []).find((r) => r.to === 'field:1');
  expect(route).toBeDefined();
  return route!.cells;
}

describe('stálá cena pole (paths.md – Stálé trasy, pravidlo 1)', () => {
  it('chůze: všechna stadia i vzhledy dílu 0,6 louky, zarostlý díl jako dosud', () => {
    expect(FIELD_WALK.field).toBe(0.6);
    for (const stage of FIELD_STAGES) {
      expect(partWalkSpeed({ stage })).toBe(FIELD_WALK.field);
      expect(isCropPart({ stage })).toBe(true);
    }
    for (const look of ['plowed', 'green', 'stubble'] as const) {
      expect(partWalkSpeed({ stage: 'ready', look })).toBe(FIELD_WALK.field);
    }
    for (const stage of OVERGROWN) {
      expect(partWalkSpeed({ stage })).toBe(1);
      expect(isCropPart({ stage })).toBe(false);
    }
  });

  it('vůz: všechna stadia cena 4, křoviny a mladý les neprojede', () => {
    expect(CART_SPEED.field).toBe(0.25);
    for (const stage of FIELD_STAGES) expect(cartPartSpeed(stage)).toBe(CART_SPEED.field);
    for (const stage of OVERGROWN) expect(cartPartSpeed(stage)).toBe(0);
  });

  it('mřížka chodců, chůze i vozu – buňka pole stejná v každém stadiu', () => {
    const at = (g: { originX: number; originZ: number; cellM: number; width: number }): number =>
      Math.round((15 - g.originZ) / g.cellM) * g.width + Math.round((15 - g.originX) / g.cellM);
    const walkCosts = new Set<number>();
    const groundSpeeds = new Set<number>();
    const cartCosts = new Set<number>();
    for (const stage of FIELD_STAGES) {
      const fields = field(15, 15, stage);
      const grid = villageGrid({ village: { dwellings: [], fields }, terrain }, []);
      walkCosts.add(grid.base[at(grid)]!);
      const ground = withFieldWalk(walkGroundOf(LANDSCAPE), fields);
      for (const v of ground.fields!.speed) if (v < 1) groundSpeeds.add(v);
      const cart = cartGrid({ village: { dwellings: [], fields }, terrain });
      cartCosts.add(cart.cost[at(cart)]!);
    }
    expect([...groundSpeeds]).toEqual([Math.fround(FIELD_WALK.field)]);
    expect(walkCosts.size).toBe(1);
    expect([...walkCosts][0]).toBeCloseTo(1 / FIELD_WALK.field, 5);
    expect(cartCosts.size).toBe(1);
    expect([...cartCosts][0]).toBeCloseTo(1 / CART_SPEED.field, 5);
  });
});

describe('trasa na pole jako celek (paths.md – Stálé trasy, pravidlo 2)', () => {
  it('trasa k poli je táž v osevu i ve strništi; při zakládání i na úhoru končí na téže buňce', () => {
    const sown = fieldRoute(field(15, 15, 'sown'));
    expect(sown.length).toBeGreaterThan(5);
    expect(fieldRoute(field(15, 15, 'ready'))).toEqual(sown);
    // jiné cesty za den (zakládání, úhor – do A2b) mohou trasu jinde slít, konec je týž
    for (const stage of ['founding', 'young-fallow'] as const) {
      expect(fieldRoute(field(15, 15, stage)).at(-1)).toBe(sown.at(-1));
    }
  });
});

describe('pevné remízy (paths.md – Stálé trasy, pravidlo 3)', () => {
  it('chůze: jiné pořadí dílů pole (cílů) – táž trasa', () => {
    expect(fieldRoute(field(15, 15, 'sown', true))).toEqual(fieldRoute(field(15, 15, 'sown')));
  });

  it('vůz: jiné pořadí cílů a vzdálená překážka – tytéž trasy, cena po 1/1024', () => {
    const a = { x: 60, z: 22.5, reachM: 2 };
    const b = { x: -52.5, z: 45, reachM: 2 };
    const run = (targets: (typeof a)[], blocked?: Uint8Array): number[][] =>
      cartRoutes({
        village: { dwellings: [], fields: [] },
        terrain,
        kind: 'two-wheel',
        depots: [{ x: 0, z: 0 }],
        targets,
        ...(blocked ? { blocked } : {}),
      }).routes.map((r) => {
        expect(r.reached).toBe(true);
        expect(Number.isInteger(r.cost * 1024)).toBe(true);
        return r.cells;
      });
    const [ra, rb] = run([a, b]);
    const [rb2, ra2] = run([b, a]);
    expect(ra2).toEqual(ra);
    expect(rb2).toEqual(rb);
    const far = new Uint8Array(terrain.width * terrain.height);
    far[terrain.width * 2 + 2] = 1; // roh okna – daleko od obou tras
    expect(run([a, b], far)).toEqual([ra, rb]);
  });
});
