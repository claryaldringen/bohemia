import { describe, expect, it } from 'vitest';
import { MARKET, foundVillage, type PlacedOrder } from '@bohemia/game';
import { productOrder } from '../village-view-crafts';

// Zakázka výrobku u řemeslníka jiné vsi ve dvorci (markets.md – Rozhodnutí plánu 3, bod 6).

const order = (fields: Partial<PlacedOrder>): PlacedOrder => ({
  villageId: 'v-2',
  name: 'Lhota',
  good: 'tools',
  amount: 40,
  day: 100,
  status: 'open',
  ...fields,
});

describe('productOrder', () => {
  const state = foundVillage({ seed: 3, day: 0, dwellingPosition: { x: 0, z: 0, rotation: 0 } });

  it('otevřená a hotová zakázka nese jméno vsi, odmítnutá a cizí zboží nic', () => {
    state.orders = [
      order({ status: 'refused', day: 120 }),
      order({ day: 90 }),
      order({ good: 'pottery', name: 'Hrušov', status: 'ready' }),
    ];
    expect(productOrder(state, 'toolsKg', 120)).toEqual({ name: 'Lhota', ready: false });
    expect(productOrder(state, 'potteryKg', 120)).toEqual({ name: 'Hrušov', ready: true });
    expect(productOrder(state, 'woodToolsKg', 120)).toBeUndefined();
  });

  it('nejnovější zakázka vyhrává', () => {
    state.orders = [
      order({ day: 90, status: 'ready' }),
      order({ day: 110, name: 'Dolany', villageId: 'v-3' }),
    ];
    expect(productOrder(state, 'toolsKg', 120)).toEqual({ name: 'Dolany', ready: false });
  });

  it('vypršelá zakázka (MARKET.orderDays) se neukazuje', () => {
    state.orders = [order({ day: 100, status: 'ready' })];
    expect(productOrder(state, 'toolsKg', 100 + MARKET.orderDays)).toEqual({
      name: 'Lhota',
      ready: true,
    });
    expect(productOrder(state, 'toolsKg', 101 + MARKET.orderDays)).toBeUndefined();
  });
});
