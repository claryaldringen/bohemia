import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushCartTrips } from '../cart-jobs';
import type { CartTripLog, FieldPart, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';

// Jízdy vozů za den na jednom místě (wagons.md – Vůz přes zaseté pole): uhlí, ruda, svoz i voda
// pošlapají úrodu stejně; voda, která metry přes díl zná, se nepočítá dvakrát.

const routes = vi.hoisted(() => ({ sown: [] as { partId: number; m: number }[], calls: 0 }));
vi.mock('../paths/roads', async (orig) => ({
  ...(await orig<typeof import('../paths/roads')>()),
  villageCartRoutes: (...args: unknown[]): unknown[] => {
    routes.calls++;
    const targets = args[5] as unknown[];
    return targets.map(() => ({
      reached: true,
      cost: 0,
      lengthM: 0,
      points: [],
      cells: [],
      sown: routes.sown,
    }));
  },
}));

const stateOf = (): VillageState =>
  ({
    parts: [{ id: 3, areaM2: 1000, state: 'sown' } as FieldPart],
    roads: null,
  }) as unknown as VillageState;

beforeEach(() => {
  routes.sown = [{ partId: 3, m: 10 }];
  routes.calls = 0;
});

describe('flushCartTrips', () => {
  it('jízda pro uhlí a rudu přes osetý díl pošlape úrodu', () => {
    const s = stateOf();
    const log: CartTripLog = [
      { x: 1, z: 2, kind: 'two-wheel', trips: 2 },
      { x: 5, z: 6, kind: 'two-wheel', trips: 1 },
    ];
    // trasa pokaždé přes 10 m dílu; stopa 2 m × 2 průjezdy × 10 m × (2 + 1) jízdy = 120 m2
    flushCartTrips(s, log, 0, LANDSCAPE, null);
    expect(s.parts[0]!.trampledM2).toBe(120);
  });

  it('voda s uloženými metry se nepočítá dvakrát', () => {
    const s = stateOf();
    flushCartTrips(
      s,
      [{ x: 1, z: 2, kind: 'two-wheel', trips: 3, sown: [{ partId: 3, m: 10 }] }],
      0,
      LANDSCAPE,
      null,
    );
    expect(s.parts[0]!.trampledM2).toBe(120);
    expect(routes.calls).toBe(0);
  });

  it('díl, který vůz právě sklízí nebo seje, nepošlapá (svoz, osivo)', () => {
    const s = stateOf();
    flushCartTrips(
      s,
      [{ x: 1, z: 2, kind: 'two-wheel', trips: 2, spare: [3] }],
      0,
      LANDSCAPE,
      null,
    );
    expect(s.parts[0]!.trampledM2).toBeUndefined();
  });

  it('voda bez dílu na trase nese prázdné metry a trasa se nehledá znovu', () => {
    const s = stateOf();
    flushCartTrips(s, [{ x: 1, z: 2, kind: 'two-wheel', trips: 1, sown: [] }], 0, LANDSCAPE, null);
    expect(routes.calls).toBe(0);
  });

  it('díl, který už není osetý, a ves bez krajiny nepošlapává', () => {
    const s = stateOf();
    s.parts[0]!.state = 'ready';
    flushCartTrips(s, [{ x: 1, z: 2, kind: 'two-wheel', trips: 1 }], 0, LANDSCAPE, null);
    expect(s.parts[0]!.trampledM2).toBeUndefined();
    s.parts[0]!.state = 'sown';
    flushCartTrips(s, [{ x: 1, z: 2, kind: 'two-wheel', trips: 1 }], 0, null, null);
    expect(s.parts[0]!.trampledM2).toBeUndefined();
  });
});
