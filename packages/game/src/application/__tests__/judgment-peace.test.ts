import { describe, expect, it } from 'vitest';
import { declareWar, type WarDeps } from '../declare-war';
import type { NegotiateDeps } from '../negotiate';
import { InMemoryDisputes } from './in-memory-disputes';
import { NOW, setup } from './negotiation-fixture';

// Rozsudek „mír“ válku nezakáže, jen ji zapíše jako neposlušnost (vassalage.md – Mír a spory).

describe('rozsudek „mír“ a válka', () => {
  it('válka přes platný mír vznikne a agresorovi se zapíše neposlušnost', async () => {
    const s = await setup();
    // a je pán b i c
    const since = {
      sinceAt: NOW,
      sinceDay: 10,
      origin: 'negotiation' as const,
      terms: {} as never,
    };
    const vb = await s.vassalages.create({
      lordHouseId: s.ids.a!,
      vassalHouseId: s.ids.b!,
      ...since,
    });
    await s.vassalages.create({ lordHouseId: s.ids.a!, vassalHouseId: s.ids.c!, ...since });
    const disputes = new InMemoryDisputes();
    const filed = await disputes.file({
      lordHouseId: s.ids.a!,
      plaintiffHouseId: s.ids.c!,
      defendantHouseId: s.ids.b!,
      message: 'Spor.',
      filedAt: NOW,
      filedDay: 5,
    });
    await disputes.judge(filed!.id, { kind: 'peace' }, 6, 6 + 1826);
    const deps: NegotiateDeps & WarDeps = {
      ...s.deps,
      wars: s.wars,
      notices: s.notices,
      disputes,
      vassalages: s.vassalages,
    };
    // b (po týdnu bez ochrany) opoví válku c
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    const r = await declareWar(deps, {
      playerId: 'player-b',
      target: s.ids.c!,
      demand: [],
      message: null,
      now: later,
      today: 10,
    });
    expect(r.ok).toBe(true);
    expect(s.vassalages.breachLog).toMatchObject([{ id: vb.id, kind: 'judgment', day: 10 }]);
    const events = s.posts.map((p) => JSON.stringify(p.body));
    expect(events.some((e) => e.includes('"kind":"disobeyed"') && e.includes('Ctibor'))).toBe(true);
    expect(disputes.rows[0]!.brokenBy).toEqual([s.ids.b]);
  });

  it('bez rozsudku válka nic nezapíše', async () => {
    const s = await setup();
    const deps: NegotiateDeps & WarDeps = {
      ...s.deps,
      wars: s.wars,
      notices: s.notices,
      disputes: new InMemoryDisputes(),
      vassalages: s.vassalages,
    };
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    const r = await declareWar(deps, {
      playerId: 'player-b',
      target: s.ids.c!,
      demand: [],
      message: null,
      now: later,
      today: 10,
    });
    expect(r.ok).toBe(true);
    expect(s.vassalages.breachLog).toHaveLength(0);
  });
});
