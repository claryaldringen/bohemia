import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePlaceChurchInput } from '../village-input';

// Stavba kostela přes vstupní bod (churches.md – Stavba): `placeChurchForPlayer` ověří ves a právo
// `ACTION_RIGHTS` (`actOn`, stavba = `build`) a zavolá use-case s vsí, dnem, krajinou a vstupem.

const state = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
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
  placeChurchForVillage: (_deps: unknown, input: Record<string, unknown>): Promise<unknown> => {
    state.calls.push(input);
    return Promise.resolve({
      ok: false,
      reason: 'Bez stavbyvedoucího huti se kostel stavět nedá.',
    });
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

import { placeChurchForPlayer } from '../village';

const ROUND = { kind: 'round', diameter: 6.5, height: 6 } as const;
const AT = { x: 10, z: -5, rotation: 0 };

describe('stavba kostela', () => {
  beforeEach(() => {
    state.calls = [];
    state.rights = [];
  });

  it('use-case dostane ves, den, krajinu, typ, rozměry a místo; právo je stavba', async () => {
    const result = await placeChurchForPlayer('hrac', 'v1', {
      type: 'rotunda',
      dims: ROUND,
      position: AT,
    });
    expect(result).toEqual({ error: 'Bez stavbyvedoucího huti se kostel stavět nedá.' });
    expect(state.calls).toEqual([
      {
        villageId: 'v1',
        landscape: { marker: 'krajina' },
        today: 4321,
        type: 'rotunda',
        dims: ROUND,
        position: AT,
      },
    ]);
    expect(state.rights).toEqual(['build']);
  });

  it('vstup: typ, kruhové i obdélné rozměry, poloha; jinak null', () => {
    expect(parsePlaceChurchInput({ type: 'rotunda', dims: ROUND, position: AT })).toEqual({
      type: 'rotunda',
      dims: ROUND,
      position: AT,
    });
    const long = { kind: 'long', width: 5, length: 8, height: 7 };
    expect(parsePlaceChurchInput({ type: 'apse', dims: long, position: AT })?.dims).toEqual(long);
    expect(parsePlaceChurchInput({ type: 'tower', dims: ROUND, position: AT })).toBeNull();
    expect(
      parsePlaceChurchInput({ type: 'apse', dims: { ...long, width: -1 }, position: AT }),
    ).toBeNull();
    expect(parsePlaceChurchInput({ type: 'apse', dims: long })).toBeNull();
  });
});
