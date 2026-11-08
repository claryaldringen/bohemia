import { describe, expect, it } from 'vitest';
import { placeCluster, type PlacementRequest } from '../placement';
import { placeClusterReference } from './placement-reference';
import { makeRng, randomCluster, randomWorld } from './placement-fixtures';

describe('placeCluster – shoda s referenční (lineární) verzí', () => {
  it('stejná poloha pro náhodné světy, shluky i žádosti', () => {
    const rng = makeRng(12345);
    for (let w = 0; w < 40; w++) {
      const count = [0, 1, 5, 30, 150, 400][w % 6] as number;
      const world = randomWorld(count, 1000 + w, 1 + (w % 4));
      for (let q = 0; q < 8; q++) {
        const cluster = randomCluster(rng, 1 + Math.floor(rng() * 7));
        const pick = (): { x: number; y: number } => ({
          x: Math.floor(rng() * 40) - 20,
          y: Math.floor(rng() * 40) - 20,
        });
        const requests: PlacementRequest[] = [
          { kind: 'independent' },
          { kind: 'independent', sameLanguage: [] },
          { kind: 'independent', sameLanguage: [pick(), pick(), pick()] },
          { kind: 'invited', lordSeat: pick() },
        ];
        for (const request of requests) {
          expect(placeCluster(world, cluster, request)).toEqual(
            placeClusterReference(world, cluster, request),
          );
        }
      }
    }
  });
});
