import { describe, expect, it, vi } from 'vitest';
import { flushCartTrips, withoutTrampledParts } from '../cart-jobs';
import type { CartTripLog, FieldPart, VillageState } from '../../types';

// Jízdy vozů za den na jednom místě (wagons.md – Vyjeté cesty): jen provoz cest – vůz úrodu
// nepošlape (paths.md – Stálé trasy; Martin 25. 10. 2026: „Pokud vůz pojede přes pole, tak žádnou
// úrodu nepošlape – je to přiměřené herní zjednodušení.“), trasy vozů se kvůli tomu nehledají.

const routes = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../paths/roads', async (orig) => ({
  ...(await orig<typeof import('../../paths/roads')>()),
  villageCartRoutes: (): unknown[] => {
    routes.calls++;
    return [];
  },
}));

const stateOf = (part: Partial<FieldPart> & Record<string, unknown> = {}): VillageState =>
  ({
    parts: [{ id: 3, areaM2: 1000, state: 'sown', ...part } as FieldPart],
    roads: null,
  }) as unknown as VillageState;

describe('flushCartTrips', () => {
  it('jízdy přes osetý díl úrodu nepošlapou a trasy vozů se nehledají', () => {
    const s = stateOf();
    const log: CartTripLog = [
      { x: 1, z: 2, kind: 'two-wheel', trips: 2 },
      { x: 5, z: 6, kind: 'four-wheel', trips: 1 },
    ];
    flushCartTrips(s, log);
    expect(s.parts[0]).toEqual({ id: 3, areaM2: 1000, state: 'sown' });
    expect(routes.calls).toBe(0);
  });
});

describe('withoutTrampledParts (převod starší vsi)', () => {
  it('pošlapaná plocha z doby, kdy ji vozy šlapaly, zmizí – jednou a idempotentně', () => {
    const old = stateOf({ trampledM2: 120 });
    const once = withoutTrampledParts(old);
    expect(once.parts[0]).toEqual({ id: 3, areaM2: 1000, state: 'sown' });
    expect('trampledM2' in old.parts[0]!).toBe(true); // vstupní stav se nemění
    expect(withoutTrampledParts(once)).toBe(once);
  });
});
