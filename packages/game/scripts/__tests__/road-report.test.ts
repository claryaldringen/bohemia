import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../src/domain/calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  tileCenterWorld,
} from '../../src/domain/landscape';
import { foundedVillageState } from '../../src/application/found-village';
import { formatReport, networkShape, roadReport } from '../road-report';
import type { Road } from '../../src/domain/village';

const SEED = 1;

function road(id: number, points: [number, number][]): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: 0,
    grade: 'trodden',
    traffic: [],
    spots: [],
  };
}

describe('road-report', () => {
  it('změří křižovatky a pahýly', () => {
    const roads = [
      road(1, [
        [0, 0],
        [100, 0],
      ]),
      road(2, [
        [100, 0],
        [200, 0],
      ]),
      road(3, [
        [100, 0],
        [100, 100],
      ]),
      road(4, [
        [0, 0],
        [0, 10],
      ]),
    ];
    expect(networkShape(roads)).toEqual({ junctions: 1, stubs: 1 });
  });

  it('načte a dopočte syntetickou ves', async () => {
    const landscape = generateLandscape(SEED);
    const today = dayIndexOf({ year: 500, month: 3, day: 1 });
    const founded = foundedVillageState(SEED, {
      landscape,
      today,
      dwelling: {
        ...tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y),
        rotation: 0,
      },
    });
    if (!founded.ok) throw new Error(founded.reason);
    const report = await roadReport(
      {
        state: founded.state,
        landscapeSeed: SEED,
        layerVersions: CURRENT_LAYER_VERSIONS,
      },
      1,
    );
    expect(report.stateKb).toBeGreaterThan(0);
    expect(report.advanceMs).toBeGreaterThan(0);
    expect(formatReport(report)).toContain('dopočet 1 let');
  }, 120_000);
});
