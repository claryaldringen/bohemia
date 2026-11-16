import { describe, expect, it } from 'vitest';
import {
  SURFACE_CODES,
  dayIndexOf,
  foundVillage,
  generateLandscape,
  obstaclesOf,
  summarizeVillage,
  tileCenterWorld,
  villageClearings,
  type VillageState,
} from '@bohemia/game';
import { sceneVillage } from '../../village-view-scene';
import { villageClearedForest } from '../cleared-forest';

// Scéna a hledání cesty vojska musí vidět tytéž paseky: `villageClearedForest` (z pohledu na ves)
// a `villageClearings` (ze stavu vsi) volají společný výpočet jádra (`clearedForestOf`).

const DAY = dayIndexOf({ year: 600, month: 5, day: 5 });

describe('villageClearedForest = villageClearings', () => {
  it('dům s natočeným pozemkem, natočený díl pole a milíř v lese dají tytéž paseky', () => {
    const landscape = generateLandscape(42);
    const layer = obstaclesOf(landscape);
    // střed nějakého lesního políčka uvnitř lesa (soused vlevo i vpravo také les)
    let forest = { x: 0, y: 0 };
    for (let i = 0; i < landscape.surface.length; i++) {
      const x = i % landscape.size;
      const y = Math.floor(i / landscape.size);
      const same = (dx: number, dy: number): boolean =>
        landscape.surface[(y + dy) * landscape.size + x + dx] === SURFACE_CODES.forest;
      if (x > 3 && y > 3 && x < landscape.size - 4 && y < landscape.size - 4) {
        if (same(0, 0) && same(1, 0) && same(-1, 0) && same(0, 1) && same(0, -1)) {
          forest = { x, y };
          break;
        }
      }
    }
    const at = tileCenterWorld(landscape, forest.x, forest.y);
    const state: VillageState = foundVillage({
      seed: 5,
      day: DAY - 10,
      dwellingPosition: { x: at.x, z: at.z, rotation: 0 },
    });
    const rotation = Math.PI / 12;
    state.dwellings = [
      {
        id: 500,
        type: 'zemnice',
        position: { x: at.x, z: at.z, rotation: 0 },
        builtDay: DAY - 100,
        condition: 1,
        plot: {
          cell: { x: forest.x, y: forest.y },
          variant: 'a',
          square: { x: at.x + 3, z: at.z - 2, rotation },
        },
        workshop: {
          craft: 'burner',
          felling: null,
          fuelKg: 0,
          activity: 'empty',
          kilns: [
            {
              id: 90,
              site: { x: at.x + 40, z: at.z + 5 },
              trees: [],
              stage: 'burn',
              prepared: 0,
              done: 0,
            },
          ],
        },
      },
    ] as never;
    const home = state.dwellings[0]!;
    state.kilnRemnants = [{ id: 91, burnerId: home.id, x: at.x - 30, z: at.z + 10, day: 1 }];
    state.fields = [{ id: 7, grid: { x: at.x + 20, z: at.z + 20, rotation } }] as never;
    state.parts = [
      { id: 71, fieldId: 7, cell: { x: 0, y: 0 }, state: 'ready' },
      { id: 72, fieldId: 7, cell: { x: 1, y: 0 }, state: 'ready' },
      { id: 73, fieldId: 7, cell: { x: 1, y: 1 }, state: 'ready' },
    ] as never;
    const view = sceneVillage(state, landscape, DAY, summarizeVillage(state, DAY));
    const fromScene = villageClearedForest(landscape, layer, view);
    const fromState = villageClearings(landscape, layer, state, DAY);
    expect(fromScene.areas.length).toBeGreaterThanOrEqual(3);
    expect(fromScene.tiles.length).toBeGreaterThan(0);
    expect(fromScene.tiles).toEqual(fromState.tiles);
    expect(fromScene.areas).toEqual(fromState.areas);
    expect([...fromScene.share]).toEqual([...fromState.share]);
  });
});
