import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pozvání stavební huti přes vstupní bod (stone-masonry.md – Stavební huť): `inviteLodgeForPlayer`
// a `inviteMasterForPlayer` ověří ves a právo `ACTION_RIGHTS` (`actOn`, rozhodnutí rodu = `ennoble`)
// a zavolají use-case s vsí, dnem, krajinou a vstupem.

const state = vi.hoisted(() => ({
  calls: [] as { kind: string; input: Record<string, unknown> }[],
  rights: [] as string[],
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
  inviteLodgeForVillage: (_deps: unknown, input: Record<string, unknown>): Promise<unknown> => {
    state.calls.push({ kind: 'lodge', input });
    return Promise.resolve({ ok: false, reason: 'Stavební huť pozve jen pokřtěný rod.' });
  },
  inviteMasterForVillage: (_deps: unknown, input: Record<string, unknown>): Promise<unknown> => {
    state.calls.push({ kind: 'master', input });
    return Promise.resolve({ ok: false, reason: 'Nejdřív je třeba pozvat stavební huť.' });
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
  landscapeOfSettlement: (): object => ({ marker: 'krajina' }),
  dynastyOfPlayerLocked: (): Promise<unknown> => Promise.resolve({ gameOver: false }),
  gameDeps: (): object => ({}),
}));

import { inviteLodgeForPlayer, inviteMasterForPlayer } from '../village';

describe('pozvání stavební huti', () => {
  beforeEach(() => {
    state.calls = [];
    state.rights = [];
  });

  it('huť: use-case dostane ves, den, krajinu a okruh; odmítnutí je chyba česky', async () => {
    const result = await inviteLodgeForPlayer('hrac', 'v1', { circle: 'adriatic' });
    expect(result).toEqual({ error: 'Stavební huť pozve jen pokřtěný rod.' });
    expect(state.calls).toEqual([
      {
        kind: 'lodge',
        input: {
          villageId: 'v1',
          landscape: { marker: 'krajina' },
          today: 4321,
          circle: 'adriatic',
        },
      },
    ]);
    expect(state.rights).toEqual(['ennoble']);
  });

  it('mistr: use-case dostane obor; právo je rozhodnutí rodu', async () => {
    const result = await inviteMasterForPlayer('hrac', 'v1', { craft: 'mason' });
    expect(result).toEqual({ error: 'Nejdřív je třeba pozvat stavební huť.' });
    expect(state.calls[0]).toMatchObject({
      kind: 'master',
      input: { craft: 'mason', today: 4321 },
    });
    expect(state.rights).toEqual(['ennoble']);
  });
});
