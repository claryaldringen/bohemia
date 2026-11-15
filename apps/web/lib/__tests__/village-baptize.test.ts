import { beforeEach, describe, expect, it, vi } from 'vitest';

// Křest vojvody přes vstupní bod (christianity.md – Křest rodu): `baptizeLordForPlayer` ověří ves
// a právo `ACTION_RIGHTS.baptizeLord` (`actOn`), zavolá use-case s hráčem, vsí a dnem ve frontě
// a odmítnutí use-casu vrátí jako chybu česky.

const state = vi.hoisted(() => ({
  calls: [] as { playerId: string; villageId: string; today: number; landscape: unknown }[],
  rights: [] as string[],
  result: { ok: false, reason: 'Rod křesťanství nezná.' } as
    { ok: true } | { ok: false; reason: string },
}));

vi.mock('server-only', () => ({}));
vi.mock('../db', () => ({
  getDatabase: (): object => ({}),
  getPlayerLock: (): object => ({ run: (_id: string, run: () => Promise<unknown>) => run() }),
}));
vi.mock('@bohemia/db', () => ({
  createVillageRepository: (): object => ({ find: () => Promise.resolve(null) }),
  createSettlementRepository: (): object => ({}),
  createHouseRepository: (): object => ({}),
  createStewardshipRepository: (): object => ({}),
}));
vi.mock('@bohemia/game', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  baptizeLord: (
    _deps: unknown,
    input: { playerId: string; villageId: string; today: number; landscape: unknown },
  ): Promise<unknown> => {
    state.calls.push(input);
    return Promise.resolve(state.result);
  },
}));
vi.mock('../game', () => ({
  lockOwnerOf: (actor: string): Promise<string> => Promise.resolve(actor),
  playerToday: (): Promise<unknown> => Promise.resolve({ ok: true, day: 4321, offsetDays: 0 }),
  playerVillage: (): Promise<unknown> =>
    Promise.resolve({ village: { id: 'v1' }, settlement: { id: 's1', ownerId: 'hrac' } }),
  requireVillageRight: (_player: string, _village: string, right: string): Promise<unknown> => {
    state.rights.push(right);
    return Promise.resolve({ village: { id: 'v1' }, settlement: { id: 's1', ownerId: 'hrac' } });
  },
  landscapeOfSettlement: (): object => ({}),
  dynastyOfPlayerLocked: (): Promise<unknown> => Promise.resolve({ gameOver: false }),
  gameDeps: (): object => ({}),
}));

import { baptizeLordForPlayer } from '../village';

describe('baptizeLordForPlayer', () => {
  beforeEach(() => {
    state.calls = [];
    state.rights = [];
  });

  it('odmítnutí use-casu vrátí důvod česky; use-case dostane hráče, ves a den', async () => {
    state.result = { ok: false, reason: 'Rod křesťanství nezná.' };
    const result = await baptizeLordForPlayer('hrac', 'v1');
    expect(result).toEqual({ error: 'Rod křesťanství nezná.' });
    expect(state.calls).toEqual([
      { playerId: 'hrac', villageId: 'v1', today: 4321, landscape: expect.anything() },
    ]);
    // právo rozhodnutí rodu jako u povýšení – správce ani nesenior nekřtí
    expect(state.rights).toEqual(['ennoble']);
  });
});
