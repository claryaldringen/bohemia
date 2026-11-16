import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignMap } from '../../domain/war';
import type { VillageState } from '../../domain/village/types';
import { mapTrailContinuations } from '../neighbour-trails';

// Osy pokračování stezek na mapě políčka (plán 2026-11-16-dense-forest – Rozhodnutí 13): ves se
// bez vstupu dostavěného před dnem nenačítá a předaný stav má přednost před `find`.

const continuationsOf = vi.hoisted(() => vi.fn());
vi.mock('../../domain/war', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../domain/war')>()),
  continuationsOf,
}));

const CELL = { x: 0, y: 0 };
const AXES = [[{ x: 1, z: 2 }]];

function deps(builtDays: number[]): {
  cells: { mapOf: ReturnType<typeof vi.fn> };
  villages: { find: ReturnType<typeof vi.fn> };
} {
  const map = {
    villageIds: ['v1'],
    trailEntries: builtDays.map((builtDay) => ({ point: { x: 0, z: 960 }, builtDay })),
  } as unknown as CampaignMap;
  return {
    cells: { mapOf: vi.fn(async () => map) },
    villages: { find: vi.fn(async () => ({ state: { id: 'found' } })) },
  };
}

describe('mapTrailContinuations', () => {
  beforeEach(() => {
    continuationsOf.mockReset().mockReturnValue(AXES);
  });

  it('bez vstupu s builtDay < day se ves nenačítá', async () => {
    const d = deps([10, 12]);
    const result = await mapTrailContinuations(d as never, CELL, 10);
    expect(d.villages.find).not.toHaveBeenCalled();
    expect(continuationsOf).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('předaný state má přednost před find', async () => {
    const d = deps([5]);
    const state = { id: 'given' } as unknown as VillageState;
    expect(await mapTrailContinuations(d as never, CELL, 10, state)).toBe(AXES);
    expect(d.villages.find).not.toHaveBeenCalled();
    expect(continuationsOf.mock.calls[0]![1]).toBe(state);
  });

  it('bez stavu se první ves mapy načte přes find', async () => {
    const d = deps([5]);
    await mapTrailContinuations(d as never, CELL, 10);
    expect(d.villages.find).toHaveBeenCalledWith('v1');
    expect(continuationsOf.mock.calls[0]![1]).toEqual({ id: 'found' });
  });
});
