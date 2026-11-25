import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { nextMerchantVisit, type MerchantStop, type VillageState } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { updateVillage } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

// Zastávky dálkových stezek (markets.md – Rozhodnutí plánu 4, bod 5): ves je dostane při načtení
// z úložiště – jednou, i prázdné (mapa bez stezky); neznámé sídlo (null) a úložiště bez zastávek ji
// nechá bez nich a nic kvůli nim neukládá.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** První příjezd kupců po 12. 4. 503 – ves vznikne den před ním. */
const VISIT = nextMerchantVisit([STOP], dayIndexOf({ year: 503, month: 4, day: 12 }))!;
const DAY = VISIT.day - 1;
const landscape = makeLandscape({ size: 48 });

/** Ves sídla `settlement-1` den před příjezdem kupců, ostatní převody už má za sebou. */
async function village(): Promise<{ villages: InMemoryVillages; id: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: 'settlement-1',
      landscape,
      today: DAY,
      name: 'Libice',
      dwelling: { x: 0, z: 0, rotation: 0 },
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  const { id } = founded.village;
  await load(villages, id, DAY);
  expect(stored(villages, id)).not.toHaveProperty('merchantStops');
  return { villages, id };
}

/** Úložiště odpovídá na zastávky vždy `answer`; vrací sídla, na která se ves ptala. */
function answering(
  villages: InMemoryVillages,
  answer: readonly MerchantStop[] | null,
): { asked: string[] } {
  const asked: string[] = [];
  villages.merchantStopsOf = async (settlementId) => {
    await Promise.resolve();
    asked.push(settlementId);
    return answer;
  };
  return { asked };
}

/** Načtení vsi bez změny hráče. */
async function load(villages: InMemoryVillages, id: string, day: number): Promise<VillageState> {
  const result = await updateVillage(villages, id, day, landscape, (state) => ({
    ok: true,
    state,
  }));
  if (!result.ok) throw new Error(result.reason);
  return result.village.state;
}

const stored = (villages: InMemoryVillages, id: string): VillageState =>
  structuredClone(villages.records.get(id)!.state);

const arrivals = (state: VillageState): number[] =>
  state.chronicle.filter((e) => e.kind === 'merchants-arrived').map((e) => e.day);

describe('zastávky kupců při načtení vsi', () => {
  it('ves je dostane před dopočtem a uloží – kupci přijedou už v něm, podruhé se neptá', async () => {
    const { villages, id } = await village();
    const { asked } = answering(villages, [STOP]);
    const first = await load(villages, id, VISIT.day);
    expect(first.merchantStops).toEqual([STOP]);
    expect(arrivals(first)).toEqual([VISIT.day]);
    expect(stored(villages, id).merchantStops).toEqual([STOP]);
    expect(asked).toEqual(['settlement-1']);
    const { saves } = villages;
    // druhé načtení téhož dne nic nemění a úložiště se neptá
    expect((await load(villages, id, VISIT.day)).merchantStops).toEqual([STOP]);
    expect(villages.saves).toBe(saves);
    await load(villages, id, VISIT.day + 1);
    expect(asked).toHaveLength(1);
  });

  it('mapu bez stezky si ves uloží taky ([]) – podruhé se neptá a žije bit po bitu stejně', async () => {
    const { villages, id } = await village();
    const { villages: plain, id: plainId } = await village();
    const { asked } = answering(villages, []);
    const dry = await load(villages, id, DAY);
    expect(dry.merchantStops).toEqual([]);
    expect(stored(villages, id).merchantStops).toEqual([]);
    const { saves } = villages;
    await load(villages, id, DAY);
    expect(villages.saves).toBe(saves);
    expect(asked).toHaveLength(1);
    expect(await load(villages, id, VISIT.day + 5)).toStrictEqual({
      ...(await load(plain, plainId, VISIT.day + 5)),
      merchantStops: [],
    });
    expect(asked).toHaveLength(1);
  });

  it('neznámé sídlo (null) ji nechá bez zastávek a neuloží – ptá se při každém načtení znovu', async () => {
    const { villages, id } = await village();
    const before = stored(villages, id);
    const { saves } = villages;
    const { asked } = answering(villages, null);
    expect(await load(villages, id, DAY)).not.toHaveProperty('merchantStops');
    expect(await load(villages, id, DAY)).not.toHaveProperty('merchantStops');
    expect(asked).toHaveLength(2);
    expect(villages.saves).toBe(saves);
    expect(stored(villages, id)).toStrictEqual(before);
  });

  it('úložiště bez portu ji nechá beze změny', async () => {
    const { villages, id } = await village();
    const before = stored(villages, id);
    const { saves } = villages;
    expect(villages.merchantStopsOf).toBeUndefined();
    expect(await load(villages, id, DAY)).toStrictEqual(before);
    expect(villages.saves).toBe(saves);
    expect(await load(villages, id, VISIT.day)).not.toHaveProperty('merchantStops');
  });

  it('ves, která zastávky má, se neptá a nepřepíše je', async () => {
    const { villages, id } = await village();
    const own: MerchantStop = { key: '3,-1,N', seed: 99, index: 4, length: 20 };
    for (const stops of [[own], []]) {
      villages.edit(id, (s) => {
        s.merchantStops = structuredClone(stops);
      });
      const { saves } = villages;
      const { asked } = answering(villages, [STOP]);
      expect((await load(villages, id, DAY)).merchantStops).toEqual(stops);
      expect(asked).toEqual([]);
      expect(villages.saves).toBe(saves);
    }
  });

  it.each([
    ['zastávka', [STOP]],
    ['neznámé sídlo', null],
  ])('při konfliktu verze se ptá jen jednou (%s)', async (_name, answer) => {
    const { villages, id } = await village();
    const { asked } = answering(villages, answer);
    let conflicts = 2;
    villages.beforeSave = (villageId): void => {
      if (conflicts-- > 0) villages.edit(villageId, () => undefined);
    };
    const { finds } = villages;
    const state = await load(villages, id, VISIT.day);
    // dva konflikty – ves se načetla třikrát
    expect(villages.finds - finds).toBe(3);
    expect(asked).toEqual(['settlement-1']);
    expect(state.merchantStops).toEqual(answer ?? undefined);
    expect(arrivals(state)).toEqual(answer ? [VISIT.day] : []);
  });

  it('stav nesdílí zastávky s úložištěm', async () => {
    const { villages, id } = await village();
    const shared: MerchantStop[] = [{ ...STOP }];
    answering(villages, shared);
    const first = await load(villages, id, DAY);
    expect(first.merchantStops).toEqual(shared);
    expect(first.merchantStops).not.toBe(shared);
    expect(first.merchantStops![0]).not.toBe(shared[0]);
  });

  it('spící ves se uloží jednou, kupci do ní nepřijedou', async () => {
    const { villages, id } = await village();
    villages.edit(id, (s) => {
      s.abandonedDay = DAY;
    });
    // ostatní převody spící vsi doběhnou před zastávkami
    await load(villages, id, VISIT.day);
    const before = stored(villages, id);
    const { saves } = villages;
    const { asked } = answering(villages, [STOP]);
    await load(villages, id, VISIT.day);
    await load(villages, id, VISIT.day + 10);
    expect(villages.saves).toBe(saves + 1);
    expect(asked).toHaveLength(1);
    expect(stored(villages, id)).toStrictEqual({ ...before, merchantStops: [STOP] });
  });
});
