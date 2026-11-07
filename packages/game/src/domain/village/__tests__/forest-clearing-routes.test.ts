import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { obstacleChangesAt } from '../obstacles';
import { routeMapKey, routeObstacleChanges } from '../paths/village';
import { fieldPartsFromCells, placementVillageOf } from '../placement';
import { advanceVillage } from '../simulate';
import type { Person, Position, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Paseka v trasách jako les (forest.md – Klučení lesa pro pole – trasy; Martin 27. 10. 2026):
// kácení, schnutí a pálení pole v lese mapu tras nemění, dokud nedohoří celé pole.

const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
const HOME: Position = { x: -60, z: 0, rotation: 0 };
const JUNE = dayIndexOf({ year: 601, month: 6, day: 1 });
const CELLS = block(8, 8, 5, 1);

const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
  id,
  kind: 'tree',
  look: 'beech-1',
  x,
  z,
  rotation: 0,
  scale: 1,
});

// čtverce (8–12, 8) = svět x 0–75 m, z 0–15 m: na každém dva dospělé stromy
const layer: ObstacleLayer = packObstacles(
  Array.from({ length: 5 }, (_, i) => [
    tree(10 + 2 * i, 15 * i + 4, 5),
    tree(11 + 2 * i, 15 * i + 10, 10),
  ]).flat(),
  16,
  15,
);
const TREES = Array.from({ length: 10 }, (_, i) => 10 + i);

function withForestField(day: number): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 11, day, dwellingPosition: HOME }));
  const adult = (id: number): Person => ({ id, bornDay: day - 30 * 366, dwellingId: 1 });
  s.people = [adult(2), adult(3)];
  s.constructions = [];
  s.storesKg = 5000;
  s.woodLogs = 0;
  s.lastDay = day;
  const preview = fieldPartsFromCells(landscape, placementVillageOf(s, day), CELLS, [HOME], layer);
  return foundField(s, day, { parts: preview.parts });
}

const fieldOpen = (s: VillageState): boolean => s.constructions.some((c) => c.kind === 'field');

describe('paseka v trasách jako les (forest.md – Klučení – trasy)', () => {
  it('pole v lese s 5 čtverci: klíč mapy tras se za klučení nezmění, po dohoření pole jednou', () => {
    const start = withForestField(JUNE);
    expect(start.parts.filter((p) => p.clearing)).toHaveLength(5);
    let s = start;
    let key = routeMapKey(s, JUNE);
    const changes: number[] = [];
    const burnt = new Set<number>();
    let done = -1;
    for (let day = JUNE + 1; day <= JUNE + 150 && done < 0; day++) {
      s = advanceVillage(s, day, layer);
      for (const p of s.parts) if (p.burnedDay !== undefined) burnt.add(p.id);
      const next = routeMapKey(s, day);
      if (next !== key) changes.push(day);
      key = next;
      if (fieldOpen(s)) {
        // paseka je ve scéně hned (pařezy, vyklučené), v trasách stojí les
        const route = routeObstacleChanges(s, day);
        for (const id of TREES) {
          expect(route.removed).not.toContain(id);
          expect(route.stumps).not.toContain(id);
        }
      } else done = day;
    }
    expect(done).toBeGreaterThan(0);
    // díly dohořívaly postupně (víc dní), klíč se změnil jen jednou – v den dohoření pole
    expect(burnt.size).toBe(5);
    expect(new Set(s.parts.map((p) => p.burnedDay)).size).toBeGreaterThan(1);
    expect(changes).toEqual([done]);
    const scene = obstacleChangesAt(s, done);
    const route = routeObstacleChanges(s, done);
    for (const id of TREES) {
      expect(scene.removed).toContain(id);
      expect(route.removed).toContain(id);
    }
  });

  it('během pálení scéna dohořelý díl ukazuje hned, trasy ne', () => {
    let s = withForestField(JUNE);
    let day = JUNE;
    while (!s.parts.some((p) => p.burnedDay !== undefined) && day < JUNE + 150) {
      s = advanceVillage(s, ++day, layer);
    }
    expect(fieldOpen(s)).toBe(true);
    const site = s.constructions.find((c) => c.kind === 'field')!;
    expect(site.burntObstacles?.length).toBeGreaterThan(0);
    const scene = obstacleChangesAt(s, day).removed;
    const route = routeObstacleChanges(s, day).removed;
    for (const id of site.burntObstacles!) {
      expect(scene).toContain(id);
      expect(route).not.toContain(id);
    }
  });

  it('dopočet vcelku = po dnech = po 7 dnech', () => {
    const start = withForestField(JUNE);
    const to = JUNE + 120;
    const whole = advanceVillage(start, to, layer);
    let daily = start;
    for (let day = JUNE + 1; day <= to; day++) daily = advanceVillage(daily, day, layer);
    let weekly = start;
    for (let day = JUNE + 7; day < to; day += 7) weekly = advanceVillage(weekly, day, layer);
    weekly = advanceVillage(weekly, to, layer);
    expect(fieldOpen(whole)).toBe(false);
    expect(JSON.stringify(daily)).toBe(JSON.stringify(whole));
    expect(JSON.stringify(weekly)).toBe(JSON.stringify(whole));
  });
});
