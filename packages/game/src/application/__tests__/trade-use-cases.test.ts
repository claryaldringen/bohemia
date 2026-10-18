import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import {
  TRAIL_BLOCKED,
  UNFAIR,
  buyPrice,
  neighbourOf,
  sellPrice,
  villageGoodStock,
  type Direction8,
  type TradeGoods,
} from '../../domain/village';
import { LANDSCAPE } from '../../domain/village/__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { UNKNOWN_DIRECTION, buildTrail } from '../build-trail';
import { foundVillageForSettlement } from '../found-village';
import { OWN_VILLAGE_TRADE, sendExpedition } from '../send-expedition';
import { InMemoryVillages } from './in-memory-villages';

// Zemská stezka a obchod (trade.md) – use-casy nad uloženou vsí (repozitář v paměti).

const TODAY = dayIndexOf({ year: 600, month: 5, day: 1 });

async function settled(): Promise<{ villages: InMemoryVillages; villageId: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 77 } },
    {
      settlementId: 'settlement-1',
      landscape: LANDSCAPE,
      today: TODAY,
      name: 'Libice',
      dwelling: { x: 0, z: 0, rotation: Math.PI },
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  villages.edit(founded.village.id, (state) => {
    Object.assign(state, withBuiltFirstDwelling(state));
    state.storesKg = 4000;
    state.meatKg = 300;
    state.cheeseKg = 300;
    state.legumesKg = 300;
    state.woodLogs = 30;
    state.crafts = { charcoalKg: 400, toolsKg: 20, potteryKg: 60 };
  });
  return { villages, villageId: founded.village.id };
}

describe('buildTrail', () => {
  it('stezka na jih se začne stavět, na sever nevede, neznámý směr odmítne', async () => {
    const { villages, villageId } = await settled();
    const base = { villageId, landscape: LANDSCAPE, today: TODAY };
    expect(await buildTrail({ villages }, { ...base, direction: 'N' })).toEqual({
      ok: false,
      reason: TRAIL_BLOCKED,
    });
    expect(
      await buildTrail({ villages }, { ...base, direction: 'up' as unknown as Direction8 }),
    ).toEqual({ ok: false, reason: UNKNOWN_DIRECTION });
    const result = await buildTrail({ villages }, { ...base, direction: 'S' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.state.trails).toHaveLength(1);
    expect(result.village.state.constructions.some((c) => c.trail !== undefined)).toBe(true);
  });
});

describe('sendExpedition', () => {
  it('server výměnu ověří znovu – nevýhodnou odmítne, výhodnou pošle', async () => {
    const { villages, villageId } = await settled();
    const base = { villageId, landscape: LANDSCAPE, today: TODAY };
    const built = await buildTrail({ villages }, { ...base, direction: 'S' });
    if (!built.ok) throw new Error(built.reason);
    villages.edit(villageId, (state) => {
      state.trails![0]!.builtDay = TODAY;
      state.constructions = state.constructions.filter((c) => c.trail === undefined);
    });
    const state = (await villages.find(villageId))!.state;
    const n = neighbourOf(state.seed, 'S');
    const want = n.offers[0]!;
    const get = { [want]: 1 } as TradeGoods;
    expect(await sendExpedition({ villages }, { ...base, direction: 'S', give: {}, get })).toEqual({
      ok: false,
      reason: UNFAIR,
    });
    const pay = n.demands.find((g) => villageGoodStock(state, g) * sellPrice(g) >= buyPrice(want))!;
    const give = { [pay]: Math.ceil(buyPrice(want) / sellPrice(pay)) } as TradeGoods;
    // tím směrem leží vlastní ves – soused bez simulace tam není (migration.md)
    expect(
      await sendExpedition(
        { villages },
        { ...base, direction: 'S', give, get, ownDirections: ['S'] },
      ),
    ).toEqual({ ok: false, reason: OWN_VILLAGE_TRADE });
    const sent = await sendExpedition({ villages }, { ...base, direction: 'S', give, get });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.village.state.trade!.expeditions).toHaveLength(1);
  });
});
