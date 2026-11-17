import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SURFACE_CODES, type Landscape } from '../../domain/landscape';
import type { VassalEdge } from '../../domain/vassalage/tree';
import type { AlarmOwner, CampaignMap, SeenCell } from '../../domain/war';
import type { House } from '../houses';
import {
  axesInSight,
  foreignMapTrails,
  seenOnCell,
  type ForeignMapTrailsDeps,
} from '../neighbour-trails';

// Pokračování stezek na cizí mapě (Martin 16. 11. 2026: mapa rodu nebo vazala celá, nepřítel
// a neutrál pod mlhou; ořez na objevené – návrh Clauda podle D62): porty v paměti.

const continuationsOf = vi.hoisted(() => vi.fn());
vi.mock('../../domain/war', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../domain/war')>()),
  continuationsOf,
}));

const CELL = { x: 1, y: 0 };
/** Osa přes mapu po ose x od −400 do 400 m. */
const AXES = [
  [
    { x: -400, z: 0 },
    { x: 400, z: 0 },
  ],
];

function landscape(surface: number): Landscape {
  const size = 128;
  return {
    size,
    cellSizeM: 15,
    heights: new Float32Array(size * size),
    surface: new Uint8Array(size * size).fill(surface),
    fertility: new Uint8Array(size * size),
    villageSite: { x: 64, y: 64 },
    stream: [],
    obstacleLayer: null,
  };
}

function mapOf(villageId: string | undefined, surface: number = SURFACE_CODES.meadow): CampaignMap {
  return {
    villageIds: villageId === undefined ? [] : [villageId],
    landscape: landscape(surface),
    obstacles: null,
    trailEntries: [{ point: { x: -960, z: 0 }, builtDay: 1 }],
  } as unknown as CampaignMap;
}

/** Ves → vlastník: hráč p1 (rod h1) má vazala h2 a ten vazala h3; h4 neutrál, h5 NPC. */
const OWNERS: Record<string, AlarmOwner> = {
  own: { playerId: 'p1', npc: false, houseId: 'h1' },
  vassal: { playerId: 'p2', npc: false, houseId: 'h2' },
  vassalOfVassal: { playerId: 'p3', npc: false, houseId: 'h3' },
  neutral: { playerId: 'p4', npc: false, houseId: 'h4' },
  npc: { playerId: null, npc: true, houseId: 'h5' },
  // hráč bez živého rodu – jeho ves není ničí vazal
  lordless: { playerId: 'p6', npc: false, houseId: null },
};
const EDGES: VassalEdge[] = [
  { lordHouseId: 'h1', vassalHouseId: 'h2' },
  { lordHouseId: 'h2', vassalHouseId: 'h3' },
];
const HOUSES: Record<string, string> = { p1: 'h1', p2: 'h2', p3: 'h3', p4: 'h4' };

function deps(knowledge: Record<string, SeenCell> = {}): ForeignMapTrailsDeps {
  return {
    villages: { find: async () => null },
    alarmOwners: { ownerOf: async (id) => OWNERS[id] ?? null },
    houses: {
      activeOf: async (playerId) =>
        HOUSES[playerId] ? ({ id: HOUSES[playerId] } as unknown as House) : null,
    },
    vassalages: { edgesNear: async () => EDGES },
    knowledge: { of: async (houseId) => knowledge[houseId] ?? null },
  };
}

const seen = (trail: [number, number][]): SeenCell => ({ trail, parts: [] });

describe('foreignMapTrails', () => {
  beforeEach(() => {
    continuationsOf.mockReset().mockReturnValue(AXES);
  });

  const run = (
    playerId: string,
    villageId: string | undefined,
    d: ForeignMapTrailsDeps = deps(),
  ): ReturnType<typeof foreignMapTrails> =>
    foreignMapTrails(d, { playerId, cell: CELL, map: mapOf(villageId), day: 5 });

  it('mapa vlastní vsi, vazala i vazala vazala – osy celé', async () => {
    for (const village of ['own', 'vassal', 'vassalOfVassal']) {
      const result = await run('p1', village);
      expect(result.friendly).toBe(true);
      expect(result.axes).toBe(AXES);
    }
  });

  it('neutrál, NPC, ves bez rodu, pán z pohledu vazala a mapa bez vsi – pod mlhou, bez znalosti nic', async () => {
    for (const [player, village] of [
      ['p1', 'neutral'],
      ['p1', 'npc'],
      ['p1', 'lordless'],
      ['p2', 'own'],
      ['p1', undefined],
    ] as const) {
      const result = await run(player, village);
      expect(result.friendly).toBe(false);
      expect(result.axes).toEqual([]);
    }
  });

  it('hráč bez rodu: vlastní ves ano, jinak nic', async () => {
    expect((await run('p6', 'lordless')).friendly).toBe(true);
    expect((await run('p6', 'vassal')).friendly).toBe(false);
  });

  it('bez os se vlastník ani znalost nečtou', async () => {
    continuationsOf.mockReturnValue([]);
    const d = deps();
    const ownerOf = vi.spyOn(d.alarmOwners, 'ownerOf');
    const of = vi.spyOn(d.knowledge, 'of');
    expect(await run('p1', 'own', d)).toEqual({ axes: [], friendly: false });
    expect(ownerOf).not.toHaveBeenCalled();
    expect(of).not.toHaveBeenCalled();
  });

  it('cizí mapa: jen části os v dohledu stopy znalosti rodu a stop skupin', async () => {
    const d = deps({ h1: seen([[-300, 20]]) });
    const result = await foreignMapTrails(d, {
      playerId: 'p1',
      cell: CELL,
      map: mapOf('neutral'),
      day: 5,
      seen: [seen([[300, 0]])],
    });
    expect(result.friendly).toBe(false);
    expect(result.axes).toHaveLength(2);
    const [west, east] = result.axes;
    // louka: dohled 150 m – od bodu (−300, 20) po ose x do ±148,7 m, od (300, 0) ±150 m;
    // vzorky po 5 m od −400
    expect(west![0]).toEqual({ x: -400, z: 0 });
    expect(west!.at(-1)).toEqual({ x: -155, z: 0 });
    expect(east![0]).toEqual({ x: 150, z: 0 });
    expect(east!.at(-1)).toEqual({ x: 400, z: 0 });
    // průchodnost se nemění – jádro dostalo celou mapu a vrátilo celé osy
    expect(continuationsOf).toHaveBeenCalledTimes(1);
  });
});

describe('axesInSight', () => {
  it('v lese dohled 50 m, bez stopy nic, běh o jednom vzorku se zahodí', () => {
    const forest = (): boolean => true;
    const parts = axesInSight(AXES, [[0, 0]], forest);
    expect(parts).toHaveLength(1);
    expect(parts[0]![0]).toEqual({ x: -50, z: 0 });
    expect(parts[0]!.at(-1)).toEqual({ x: 50, z: 0 });
    expect(axesInSight(AXES, [], forest)).toEqual([]);
    expect(axesInSight(AXES, [[0, 45]], forest)).toHaveLength(1);
    // bod stopy 49,9 m od osy dohlédne jen na vzorek x = 0 – osa z jednoho bodu nevznikne
    expect(axesInSight(AXES, [[0, 49.9]], forest)).toEqual([]);
  });

  it('stopy skupin výprav na políčku', () => {
    const a = seen([[1, 2]]);
    const views: { seen: Record<string, SeenCell> }[] = [
      { seen: { '1,0': a } },
      { seen: {} },
      { seen: { '0,0': seen([[3, 4]]) } },
    ];
    expect(seenOnCell(views, CELL)).toEqual([a]);
  });
});
