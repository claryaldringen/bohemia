import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  fortificationArea,
  fortificationOutline,
  fortSegments,
  foundVillage,
  generateLandscape,
  pathVillageOf,
  summarizeVillage,
  tileCenterWorld,
  type TileCell,
} from '@bohemia/game';
import { sceneVillage } from '../village-view-scene';

// Opevnění ve scéně (fortifications.md – Brány): náhled vozové cesty (`planWagonRoad` nad vsí
// scény) a trasy vozů prohlížeče musí vidět tytéž stěny a brány jako síť serveru – scéna je bere
// z téže funkce jádra (`pathFortificationsOf`), ne z vlastního výpočtu.

const DAY = dayIndexOf({ year: 600, month: 5, day: 5 });

describe('stěny opevnění ve scéně jako na serveru', () => {
  it('scéna nese tytéž stěny a brány jako ves pro pěšiny serveru', () => {
    const landscape = generateLandscape(42);
    const site = landscape.villageSite;
    const home = tileCenterWorld(landscape, site.x, site.y);
    const state = foundVillage({
      seed: 5,
      day: DAY - 10,
      dwellingPosition: { x: home.x, z: home.z, rotation: 0 },
    });
    const cells: TileCell[] = [];
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) cells.push({ x: site.x + i, y: site.y + j });
    }
    const area = fortificationArea(cells, null, landscape);
    if ('error' in area) throw new Error('plocha opevnění testu');
    const shapes = fortSegments(fortificationOutline(area, 'fence'));
    state.fortifications = [
      {
        id: 50,
        grid: null,
        cells,
        kind: 'fence',
        segments: shapes.map((s) => ({
          index: s.index,
          builtDay: s.index < 6 ? DAY - 5 : null,
          state: 1,
        })),
        gates: [],
      },
    ];
    const scene = sceneVillage(state, landscape, DAY, summarizeVillage(state, DAY));
    const server = pathVillageOf(state, DAY, landscape).fortifications;
    expect(server).toHaveLength(1);
    expect(server![0]!.walls.length).toBeGreaterThan(0);
    expect(scene.fortifications).toEqual(server);
  });
});
