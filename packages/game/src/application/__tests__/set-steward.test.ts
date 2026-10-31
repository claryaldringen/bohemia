import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { setSteward } from '../set-steward';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

// Přepínač správce (steward.md – Soužití s hráčem): dopočet do dneška, pak změna.

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };

describe('setSteward', () => {
  it('zapne a vypne správce, ves dopočítá do dneška', async () => {
    const villages = new InMemoryVillages();
    const founded = await foundVillageForSettlement(
      { villages, seeds },
      {
        settlementId: 'settlement-1',
        landscape,
        today: TODAY,
        name: 'Libice',
        dwelling: { x: -50, z: -50, rotation: 0 },
      },
    );
    if (!founded.ok) throw new Error(founded.reason);
    const base = { playerId: 'p-1', villageId: founded.village.id, landscape };
    expect(founded.village.state.steward?.on).toBe(false);
    const on = await setSteward({ villages }, { ...base, today: TODAY + 3, on: true });
    expect(on.ok && on.village.state.steward).toEqual({
      on: true,
      sinceDay: TODAY + 3,
      built: [],
    });
    expect(on.ok && on.village.state.lastDay).toBe(TODAY + 3);
    const off = await setSteward({ villages }, { ...base, today: TODAY + 5, on: false });
    expect(off.ok && off.village.state.steward).toMatchObject({ on: false, sinceDay: TODAY + 5 });
  });
});
