import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { LODGE, MASON_CRAFTS } from '../../domain/village';
import { foundVillageForSettlement } from '../found-village';
import {
  INVITE_LODGE_REASONS,
  inviteLodgeForVillage,
  inviteMasterForVillage,
} from '../invite-lodge';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

// Pozvání stavební huti (stone-masonry.md – Stavební huť) s in-memory porty.

const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };
const FOUNDED = dayIndexOf({ year: 503, month: 4, day: 12 });

async function setup(
  baptized: boolean,
): Promise<{ villages: InMemoryVillages; villageId: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds },
    {
      settlementId: 'settlement-1',
      landscape,
      today: FOUNDED,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
      lordName: 'Bořivoj',
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  const id = founded.village.id;
  if (baptized) {
    const record = villages.records.get(id)!;
    villages.records.set(id, {
      ...record,
      state: { ...record.state, faith: { rodBaptizedDay: FOUNDED } },
    });
  }
  return { villages, villageId: id };
}

describe('inviteLodgeForVillage', () => {
  it('nepokřtěný rod huť nepozve a nic se neuloží', async () => {
    const { villages, villageId } = await setup(false);
    const saves = villages.saves;
    const result = await inviteLodgeForVillage(
      { villages },
      { villageId, today: FOUNDED + 1, landscape, circle: 'adriatic' },
    );
    expect(result).toEqual({ ok: false, reason: INVITE_LODGE_REASONS['not-baptized'] });
    expect(villages.saves).toBe(saves);
  });

  it('pokřtěný rod pozve huť; podruhé už ne; chybějícího mistra pozve zvlášť', async () => {
    const { villages, villageId } = await setup(true);
    const today = FOUNDED + 1;
    const first = await inviteLodgeForVillage(
      { villages },
      { villageId, today, landscape, circle: 'carolingian' },
    );
    expect(first.ok).toBe(true);
    const state = villages.records.get(villageId)!.state;
    expect(state.lodge?.circle).toBe('carolingian');
    expect(state.lodge?.arriving?.map((a) => a.role)).toEqual(MASON_CRAFTS);
    expect(state.lodge?.arriving?.[0]?.day).toBe(state.lastDay + LODGE.arrivalDays);
    const again = await inviteLodgeForVillage(
      { villages },
      { villageId, today, landscape, circle: 'adriatic' },
    );
    expect(again).toEqual({ ok: false, reason: INVITE_LODGE_REASONS.already });
    const master = await inviteMasterForVillage(
      { villages },
      { villageId, today, landscape, craft: 'mason' },
    );
    expect(master).toEqual({ ok: false, reason: INVITE_LODGE_REASONS.present });
  });

  it('mistra bez huti pozvat nejde', async () => {
    const { villages, villageId } = await setup(true);
    const result = await inviteMasterForVillage(
      { villages },
      { villageId, today: FOUNDED + 1, landscape, craft: 'builder' },
    );
    expect(result).toEqual({ ok: false, reason: INVITE_LODGE_REASONS['no-lodge'] });
  });
});
