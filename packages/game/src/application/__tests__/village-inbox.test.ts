import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import type { NewVillageEvent, VillageState } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import { setSteward } from '../set-steward';
import type { SeedSource } from '../settlements';
import type { Pause } from '../villages';
import { InMemoryVillages } from './in-memory-villages';

// Schránka vsi v dopočtu (village-core.md – Schránka vsi): událost se použije v nejbližším
// nespočítaném dni, nikdy se neztratí ani nezdvojí – ani když přijde uprostřed dopočtu.

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };

async function founded(): Promise<{ villages: InMemoryVillages; villageId: string }> {
  const villages = new InMemoryVillages();
  const result = await foundVillageForSettlement(
    { villages, seeds },
    {
      settlementId: 'settlement-1',
      landscape,
      today: TODAY,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
    },
  );
  if (!result.ok) throw new Error(result.reason);
  return { villages, villageId: result.village.id };
}

function message(villageId: string, day: number, ref: string, name = 'Posel'): NewVillageEvent {
  return {
    villageId,
    day,
    ref,
    body: { kind: 'chronicle', event: { day, kind: 'line-named', name } },
  };
}

/** Zápisy schránky v kronice vsi. */
function messages(state: VillageState): { day: number; name: string }[] {
  return state.chronicle.flatMap((e) =>
    e.kind === 'line-named' ? [{ day: e.day, name: e.name }] : [],
  );
}

async function load(
  villages: InMemoryVillages,
  villageId: string,
  today: number,
  pause?: Pause,
): Promise<VillageState> {
  const record = await loadVillage(
    { villages, ...(pause ? { pause } : {}) },
    { villageId, today, landscape },
  );
  if (!record) throw new Error('Ves chybí.');
  return record.state;
}

describe('schránka vsi v dopočtu', () => {
  it('událost zapsaná před uložením dopočtu: konflikt verze, nový pokus ji použije jednou', async () => {
    const { villages, villageId } = await founded();
    let posted = false;
    villages.beforeSave = (): void => {
      if (posted) return;
      posted = true;
      void villages.inbox.post(message(villageId, TODAY + 2, 'r-1'));
    };
    const state = await load(villages, villageId, TODAY + 5);
    expect(messages(state)).toEqual([{ day: TODAY + 2, name: 'Posel' }]);
    expect(villages.saves).toBe(1);
    expect(state.lastDay).toBe(TODAY + 5);
  });

  it('událost zapsaná uprostřed dopočtu do už prošlého dne: výsledek jako s událostí předem', async () => {
    const reference = await founded();
    await reference.villages.inbox.post(message(reference.villageId, TODAY + 1, 'r-1'));
    const expected = await load(reference.villages, reference.villageId, TODAY + 6);

    const { villages, villageId } = await founded();
    let posted = false;
    // přestávka po dni TODAY + 3 – dopočet už den TODAY + 1 prošel bez události
    const pause: Pause = (day) => {
      if (day === TODAY + 3 && !posted) {
        posted = true;
        void villages.inbox.post(message(villageId, TODAY + 1, 'r-1'));
      }
      return null;
    };
    const state = await load(villages, villageId, TODAY + 6, pause);
    expect(posted).toBe(true);
    expect(messages(state)).toEqual([{ day: TODAY + 1, name: 'Posel' }]);
    expect(JSON.stringify(state)).toBe(JSON.stringify(expected));
  });

  it('zápis se dnem ≤ lastDay dostane lastDay + 1; týž ref podruhé → null', async () => {
    const { villages, villageId } = await founded();
    await load(villages, villageId, TODAY + 5);
    const stored = await villages.inbox.post(message(villageId, TODAY + 2, 'r-1'));
    expect(stored?.day).toBe(TODAY + 6);
    expect(await villages.inbox.post(message(villageId, TODAY + 9, 'r-1', 'Jiný'))).toBeNull();
    expect(villages.inbox.events).toHaveLength(1);
    const state = await load(villages, villageId, TODAY + 8);
    expect(messages(state)).toEqual([{ day: TODAY + 6, name: 'Posel' }]);
    // další dopočet událost znovu nepoužije
    expect(messages(await load(villages, villageId, TODAY + 12))).toHaveLength(1);
  });

  it('zápis zvedne verzi vsi', async () => {
    const { villages, villageId } = await founded();
    const before = (await villages.find(villageId))?.version ?? 0;
    await villages.inbox.post(message(villageId, TODAY + 3, 'r-1'));
    expect((await villages.find(villageId))?.version).toBe(before + 1);
  });

  it('události použije i akce hráče (dopočet před změnou)', async () => {
    const { villages, villageId } = await founded();
    await villages.inbox.post(message(villageId, TODAY + 2, 'r-1'));
    await villages.inbox.post(message(villageId, TODAY + 2, 'r-2', 'Druhý'));
    await villages.inbox.post(message(villageId, TODAY + 9, 'r-3', 'Pozdější'));
    const result = await setSteward(
      { villages },
      { playerId: 'p-1', villageId, landscape, today: TODAY + 4, on: true },
    );
    expect(result.ok && messages(result.village.state)).toEqual([
      { day: TODAY + 2, name: 'Posel' },
      { day: TODAY + 2, name: 'Druhý' },
    ]);
    const later = await load(villages, villageId, TODAY + 10);
    expect(messages(later).map((m) => m.name)).toEqual(['Posel', 'Druhý', 'Pozdější']);
  });
});
