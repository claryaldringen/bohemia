import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { SLAVES_BAD_COUNT, type VillageState } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { ACTION_RIGHTS } from '../rights';
import { offerSlaves } from '../slaves';
import {
  updateVillage,
  VILLAGE_ABANDONED,
  VILLAGE_EXTINCT,
  VILLAGE_TRAVELLING,
} from '../update-village';
import type { VillageResult } from '../villages';
import { InMemoryVillages } from './in-memory-villages';

// Nabídka otroků na trhu vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8; vzor objednávky zbroje):
// hráč zadá počet, ves nabízí min(počet, prodejní otroci) – use-case jen zapíše `slavesForSale`.

const landscape = makeLandscape({ size: 48 });
const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });

async function village(
  change: (state: VillageState) => void = () => {},
): Promise<{ villages: InMemoryVillages; id: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: 'settlement-1',
      landscape,
      today: TODAY,
      name: 'Libice',
      dwelling: { x: 0, z: 0, rotation: 0 },
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  const { id } = founded.village;
  const loaded = await updateVillage(villages, id, TODAY, landscape, (s) => ({
    ok: true,
    state: s,
  }));
  if (!loaded.ok) throw new Error(loaded.reason);
  change(villages.records.get(id)!.state);
  return { villages, id };
}

const stored = (villages: InMemoryVillages, id: string): VillageState =>
  structuredClone(villages.records.get(id)!.state);

function offer(
  world: { villages: InMemoryVillages; id: string },
  count: number,
): Promise<VillageResult> {
  return offerSlaves(
    { villages: world.villages },
    { villageId: world.id, count, today: TODAY, landscape },
  );
}

describe('nabídka otroků (offerSlaves)', () => {
  it('3 otroci: zapíše se nabídka, nic jiného se nezmění', async () => {
    const w = await village();
    const before = stored(w.villages, w.id);
    const result = await offer(w, 3);
    if (!result.ok) throw new Error(result.reason);
    expect(result.village.state).toStrictEqual({ ...before, slavesForSale: 3 });
    expect(stored(w.villages, w.id)).toStrictEqual({ ...before, slavesForSale: 3 });
  });

  it('0 pole smaže', async () => {
    const w = await village();
    const before = stored(w.villages, w.id);
    await offer(w, 3);
    expect((await offer(w, 0)).ok).toBe(true);
    expect(stored(w.villages, w.id)).toStrictEqual(before);
    expect(stored(w.villages, w.id)).not.toHaveProperty('slavesForSale');
  });

  it.each([2.5, -1, NaN, Infinity])('%s otroků odmítne a stav nezmění', async (count) => {
    const w = await village((s) => (s.slavesForSale = 1));
    const before = stored(w.villages, w.id);
    expect(await offer(w, count)).toEqual({ ok: false, reason: SLAVES_BAD_COUNT });
    expect(stored(w.villages, w.id)).toStrictEqual(before);
  });

  it.each([
    ['vymřelá', { extinctDay: TODAY - 5 }, VILLAGE_EXTINCT],
    ['opuštěná', { abandonedDay: TODAY - 5 }, VILLAGE_ABANDONED],
    [
      'na cestě',
      { journey: { direction: 'E', departedDay: TODAY - 5, arrivalDay: TODAY + 500 } as const },
      VILLAGE_TRAVELLING,
    ],
  ])('%s ves nenabídne nic', async (_name, fields, reason) => {
    const w = await village((s) => Object.assign(s, fields));
    expect(await offer(w, 2)).toEqual({ ok: false, reason });
    expect(stored(w.villages, w.id)).not.toHaveProperty('slavesForSale');
  });

  it('právo je obchod vsi', () => {
    expect(ACTION_RIGHTS.offerSlaves).toBe('trade');
  });
});
