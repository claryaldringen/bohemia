import { describe, expect, it, vi } from 'vitest';
import { foundVillage, type VillageState } from '@bohemia/game';

vi.mock('server-only', () => ({}));
vi.mock('../db', () => ({
  getDatabase: (): object => ({}),
  getPlayerLock: (): object => ({ run: (_id: string, run: () => Promise<unknown>) => run() }),
}));
vi.mock('@bohemia/db', () => ({ createVillageRepository: (): object => ({}) }));
vi.mock('@bohemia/game', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // přehled trhu cizího správce: jen ves `v-2` (soused)
  marketOverview: (): Promise<unknown> => Promise.resolve([{ villageId: 'v-2' }]),
}));
vi.mock('../game', () => ({ gameDeps: (): object => ({}) }));

import { shownToActor } from '../village';

// Pohled pro jednajícího hráče (plán 3, Úloha 11): držitel vidí jména vsí, cizí správce jen vsi
// z přehledu trhu a svou.

function village(): VillageState {
  const s = foundVillage({ seed: 4, day: 0, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.orders = [
    { villageId: 'own-2', name: 'Dolní', good: 'tools', amount: 5, day: 1, status: 'open' },
    { villageId: 'v-2', name: 'Lhota', good: 'pottery', amount: 5, day: 1, status: 'ready' },
  ];
  return s;
}

const ctx = (actorId: string): Parameters<typeof shownToActor>[0] =>
  ({
    ok: true,
    playerId: 'holder',
    actorId,
    villageId: 'h',
    settlementId: 's',
    landscape: {},
    day: 1,
  }) as unknown as Parameters<typeof shownToActor>[0];

describe('shownToActor', () => {
  it('držitel dostane záznam beze změny, jména vidí všechna', async () => {
    const record = { id: 'h', state: village() };
    expect(await shownToActor(ctx('holder'), record)).toBe(record);
  });

  it('cizí správce nevidí jméno druhé vsi držitele, souseda z přehledu ano', async () => {
    const record = { id: 'h', state: village() };
    const shown = await shownToActor(ctx('steward'), record);
    expect(shown.state.orders?.map((o) => o.name)).toEqual(['', 'Lhota']);
    expect(record.state.orders?.map((o) => o.name)).toEqual(['Dolní', 'Lhota']);
  });
});
