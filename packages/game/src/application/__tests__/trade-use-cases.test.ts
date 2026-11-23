import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { TRAIL_BLOCKED, type Direction8 } from '../../domain/village';
import { LANDSCAPE } from '../../domain/village/__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { UNKNOWN_DIRECTION, buildTrail } from '../build-trail';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
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
    state.crafts = { charcoalKg: 400, potteryKg: 60, ironBarsKg: 20 };
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

describe('starší ves se zbožím zvenku (trade.md – Jen společné suroviny)', () => {
  it('načtení dopočítané vsi zboží zvenku zahodí a uloží', async () => {
    const { villages, villageId } = await settled();
    villages.edit(villageId, (state) => {
      (state as unknown as Record<string, unknown>).goods = {
        saltKg: 5,
        ironKg: 0,
        honeyKg: 10,
        furs: 1,
      };
    });
    const before = (await villages.find(villageId))!;
    expect(before.state.lastDay).toBe(TODAY);
    const loaded = await loadVillage(
      { villages },
      { villageId, today: TODAY, landscape: LANDSCAPE },
    );
    expect(loaded).not.toBeNull();
    expect('goods' in loaded!.state).toBe(false);
    expect(loaded!.version).toBeGreaterThan(before.version);
    const stored = (await villages.find(villageId))!;
    expect('goods' in stored.state).toBe(false);
    // podruhé už se nic neukládá
    const again = await loadVillage(
      { villages },
      { villageId, today: TODAY, landscape: LANDSCAPE },
    );
    expect(again!.version).toBe(stored.version);
  });
});
