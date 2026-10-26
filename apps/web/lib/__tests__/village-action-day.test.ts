import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ day: 10, settleDays: [] as number[] }));

vi.mock('server-only', () => ({}));
vi.mock('../db', () => ({ getDatabase: (): object => ({}) }));
vi.mock('@bohemia/db', () => ({ createVillageRepository: (): object => ({}) }));
vi.mock('@bohemia/game', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  settleJourney: (_deps: unknown, input: { today: number }): Promise<unknown> => {
    state.settleDays.push(input.today);
    return Promise.resolve({ ok: false, reason: 'test' });
  },
}));
vi.mock('../game', () => ({
  playerToday: (): Promise<unknown> => Promise.resolve({ ok: true, day: state.day, offsetDays: 0 }),
  playerVillage: (): Promise<unknown> =>
    Promise.resolve({ village: { id: 'v1' }, settlement: { id: 's1' } }),
  landscapeOfSettlement: (): object => ({}),
  dynastyOfPlayerLocked: (): Promise<unknown> => Promise.resolve({ gameOver: false }),
  gameDeps: (): object => ({}),
}));

import { exclusive, playerLockKey } from '../exclusive';
import { settleJourneyForPlayer } from '../village';

describe('den akce se načítá až ve frontě', () => {
  beforeEach(() => {
    state.day = 10;
    state.settleDays = [];
  });

  it('akce zařazená během skoku v čase dostane den po skoku', async () => {
    let finishSkip: () => void = () => undefined;
    const skip = exclusive(
      playerLockKey('hrac'),
      () =>
        new Promise<void>((resolve) => {
          finishSkip = (): void => {
            state.day = 3650; // skok o deset let
            resolve();
          };
        }),
    );
    const action = settleJourneyForPlayer('hrac', 'v1', { dwelling: { x: 0, z: 0, rotation: 0 } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(state.settleDays).toEqual([]); // čeká za skokem
    finishSkip();
    await skip;
    await action;
    expect(state.settleDays).toEqual([3650]);
  });
});
