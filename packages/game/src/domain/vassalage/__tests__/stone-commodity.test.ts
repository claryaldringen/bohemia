import { describe, expect, it } from 'vitest';
import { addStone, stoneOnHand } from '../../village/fortification/state/stone';
import { addGood, sellPrice, villageGoodStock } from '../../village/trade/trade';
import { dispatchShipment, receiveShipment } from '../shipment';
import { noMacroGoods, stoneOf } from '../macro';
import { VASSALAGE } from '../rules-vassalage';
import { villageSpare } from '../spare';
import { checkBundle } from '../terms';
import { transportLimit } from '../transport';
import { DAY, bundle, receiver, sender } from './shipment-fixtures';

// Kámen jako makrokomodita (vassalage.md – Makrokomodity; Martin 8. 11. 2026: „kámen může být
// komoditou v obchodě nebo ve vazalském tributu“).

describe('kámen jako makrokomodita', () => {
  it('výhled: celé m³ na hromadách kamení', () => {
    const s = sender();
    expect(villageSpare(s, DAY).stoneM3).toBe(0);
    addStone(s, 12.6, null);
    expect(villageSpare(s, DAY).stoneM3).toBe(12);
  });

  it('doprava: jen vozem, celé m³ z nákladu vozů (2 500 kg na m³)', () => {
    const limit = transportLimit(sender(), DAY, 1);
    expect(limit.stoneM3).toBeGreaterThanOrEqual(0);
    expect(limit.stoneM3).toBe(
      Math.floor(
        (limit.stoneM3 * VASSALAGE.transport.stoneKgPerM3 + 1) / VASSALAGE.transport.stoneKgPerM3,
      ),
    );
  });

  it('podmínky: kámen v mezích projde, prázdný svazek ne, záporný ne', () => {
    expect(
      checkBundle({
        ...noMacroGoods(),
        stoneM3: 5,
        people: { families: 0, men: 0, women: 0 },
        laborDays: 0,
      }),
    ).toBeNull();
    expect(
      checkBundle({
        ...noMacroGoods(),
        stoneM3: -1,
        people: { families: 0, men: 0, women: 0 },
        laborDays: 0,
      }),
    ).not.toBeNull();
    expect(stoneOf({} as never)).toBe(0);
  });

  it('zásilka: bez kamene odmítnuta, s kamenem bilance odesílatel + příjemce', () => {
    const from = sender();
    const to = receiver();
    const b = bundle({ stoneM3: 3 });
    expect(dispatchShipment(from, DAY, { bundle: b, cells: 1, firstStep: 'E' })).toEqual({
      ok: false,
      reason: 'Ves tolik kamene nemá.',
    });
    addStone(from, 10, null);
    const limit = transportLimit(from, DAY, 1).stoneM3;
    const sent = dispatchShipment(from, DAY, {
      bundle: bundle({ stoneM3: Math.max(1, limit) }),
      cells: 1,
      firstStep: 'E',
    });
    if (limit < 1) {
      expect(sent).toEqual({ ok: false, reason: 'Kamene je víc, než ves odveze.' });
      return;
    }
    if (!sent.ok) throw new Error(sent.reason);
    expect(stoneOnHand(sent.state)).toBeCloseTo(10 - limit, 9);
    receiveShipment(to, DAY + 2, sent.body);
    expect(stoneOnHand(to)).toBe(limit);
  });

  it('obchod: kámen se koupí na hromadu a prodá z hromad, cena 60 kg obilí za m³', () => {
    const s = sender();
    expect(villageGoodStock(s, 'stone')).toBe(0);
    addGood(s, 'stone', 7, DAY);
    expect(villageGoodStock(s, 'stone')).toBe(7);
    addGood(s, 'stone', -3, DAY);
    expect(stoneOnHand(s)).toBeCloseTo(4, 9);
    expect(sellPrice('stone')).toBeCloseTo(60, 9);
  });
});
