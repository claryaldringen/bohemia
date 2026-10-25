import { describe, expect, it } from 'vitest';
import { abandonLooseWagons } from '../paths/roads-repair';
import { ROAD_LOOSE_WAGON } from '../rules';
import type { Road, RoadEarthwork, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';

// Opuštění nenapojené vozové cesty v jednorázové opravě (paths.md – Jednorázová oprava sítě):
// čerstvě dostavěná vozová cesta (zatím po ní nikdo nejel) a vozová cesta na hotových zemních
// pracích napojená na síť se pro nulový provoz neopouštějí.

const DAY = 10_000;

function wagon(id: number, x: number, bornDay: number, end = 40): Road {
  return {
    id,
    points: [
      { x, z: 0 },
      { x, z: end },
    ],
    bornDay,
    grade: 'wagon',
    traffic: [0],
    spots: [],
  };
}

function earthwork(id: number, x: number, builtDay: number, abandonedDay?: number): RoadEarthwork {
  return {
    id,
    profile: [
      { x, z: 0, y: 0 },
      { x, z: 40, y: 0 },
    ],
    pieces: [{ toM: 40, manDays: 10, builtDay }],
    startedDay: builtDay - 100,
    ...(abandonedDay === undefined ? {} : { abandonedDay }),
  };
}

describe('abandonLooseWagons – nová a napojená vozová cesta se neopouští', () => {
  it('opustí jen starou vozovou cestu bez napojení nebo bez hotových zemních prací', () => {
    const old = DAY - ROAD_LOOSE_WAGON.freshDays - 10;
    const fresh = DAY - ROAD_LOOSE_WAGON.freshDays + 10;
    // napojení: pěšina od konce vozové cesty dál (sdílený bod)
    const link = (id: number, x: number): Road => ({
      ...wagon(id, x, old),
      grade: 'trodden',
      points: [
        { x, z: 40 },
        { x: x + 30, z: 40 },
      ],
    });
    const roads: Road[] = [
      wagon(1, -100, old), // stará, bez napojení, bez zemních prací – opustí se
      wagon(2, -60, fresh), // čerstvá bez zemních prací – zůstane
      wagon(3, -20, old), // stará, zemní práce dostavěné nedávno – zůstane
      wagon(4, 20, old), // napojená, hotové zemní práce – zůstane
      link(5, 20),
      wagon(6, 60, old), // napojená, ale zemní práce opuštěné (přestavba) – opustí se
      link(7, 60),
      wagon(8, 100, old), // bez napojení, hotové staré zemní práce – opustí se
    ];
    const state = {
      roads: {
        nextId: 9,
        roads,
        trees: [],
        labor: { from: 0, days: 0, shares: [] },
        earthworks: [
          earthwork(1, -20, fresh),
          earthwork(2, 20, old),
          earthwork(3, 60, old, old + 5),
          earthwork(4, 100, old),
        ],
      },
      routes: { day: DAY, key: '', list: [] },
      constructions: [],
      trails: [],
      lastDay: DAY,
    } as unknown as VillageState;
    const report = { joined: [], abandoned: [] as number[], failed: [] };
    abandonLooseWagons(state, DAY, LANDSCAPE, report);
    expect(report.abandoned).toEqual([1, 6, 8]);
    expect(roads.filter((r) => r.abandoned).map((r) => r.id)).toEqual([1, 6, 8]);
  });
});
