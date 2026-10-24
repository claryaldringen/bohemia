import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import { cloneState } from '../clone';
import { roadLengthM } from '../paths/roads';
import { mergeParallelRoads } from '../paths/roads-tidy';
import { withRoadsV2 } from '../paths/roads-v2';
import type { LegacyRoadFields, Road, RoadGrade, VillageRoads, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';
import vlkov from './vlkov-roads.json';

// Převod starší vsi na nový systém cest (paths.md – Převod starých vsí; Martin 23. 10. 2026:
// jednou a idempotentně).

const DAY = 200_000;

/** Ves s cestami z fixtury Vlkova (23 úseků) a se starými poli ze staré vsi. */
function oldVillage(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = DAY;
  const roads: VillageRoads & LegacyRoadFields = {
    nextId: 1000,
    roads: vlkov.roads.map((r): Road => ({
      id: r.id,
      points: r.points.map(([x, z]) => ({ x: x!, z: z! })),
      bornDay: r.bornDay,
      grade: r.grade as RoadGrade,
      traffic: r.traffic,
      spots: r.spots.map(([id, x, z]) => ({ id: id!, x: x!, z: z! })),
      ground: { wet: r.ground.wet as [number, number][], fords: r.ground.fords },
    })),
    trees: [],
    candidates: [
      [
        { x: 0, z: 0 },
        { x: 30, z: 0 },
      ],
    ],
    endsChecked: true,
    labor: { from: DAY - 30, days: 30, shares: [] },
  };
  s.roads = roads;
  return s;
}

const gradeLength = (roads: VillageRoads, grade: RoadGrade): number =>
  roads.roads.filter((r) => r.grade === grade).reduce((sum, r) => sum + roadLengthM(r), 0);

describe('withRoadsV2 – převod starých cest', () => {
  it('Vlkov bez souběžných cest, upravené zůstanou, stará pole zmizí, příznak', () => {
    const s = oldVillage();
    const improved = gradeLength(s.roads!, 'improved');
    const next = withRoadsV2(s, LANDSCAPE, null);
    expect(next).not.toBe(s);
    // vstup se nemění
    expect(s.roads!.v2).toBeUndefined();
    expect(s.roads!.roads).toHaveLength(23);
    const roads = next.roads! as VillageRoads & LegacyRoadFields;
    expect(roads.v2).toBe(true);
    expect(roads.candidates).toBeUndefined();
    expect(roads.endsChecked).toBeUndefined();
    expect(roads.parallelsChecked).toBeUndefined();
    // souběžné cesty už není co slučovat
    const again = cloneState(next).roads!;
    expect(mergeParallelRoads(again, next.constructions)).toBe(false);
    // upravené cesty zůstaly (nic se neztratilo, nejvýš se napojily)
    expect(gradeLength(roads, 'improved')).toBeGreaterThanOrEqual(improved - 1);
    expect(roads.roads.length).toBeLessThanOrEqual(23);
  }, 60_000);

  it('druhé načtení je týž objekt (idempotence), dvojí převod = jeden', () => {
    const once = withRoadsV2(oldVillage(), LANDSCAPE, null);
    expect(withRoadsV2(once, LANDSCAPE, null)).toBe(once);
    const twice = withRoadsV2(cloneState(once), LANDSCAPE, null);
    expect(JSON.stringify(twice.roads)).toBe(JSON.stringify(once.roads));
  }, 60_000);

  it('ves bez cest vrátí týž objekt', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    delete s.roads;
    expect(withRoadsV2(s, LANDSCAPE, null)).toBe(s);
  });

  it('ves z doby před vším (jen povinná pole cest) se převede bez chyby', () => {
    const s = oldVillage();
    s.roads = { nextId: 1, roads: [], trees: [], labor: { from: DAY, days: 0, shares: [] } };
    const next = withRoadsV2(s, LANDSCAPE, null);
    expect(next.roads!.v2).toBe(true);
    expect(withRoadsV2(next, LANDSCAPE, null)).toBe(next);
  });
});
