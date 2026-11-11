import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  CHURCH_EAST_ROTATION,
  CHURCH_NO_LODGE,
  CHURCH_WRONG_TYPE,
  MASON_CRAFTS,
  defaultChurchDims,
  type Person,
} from '../../domain/village';
import { foundVillageForSettlement } from '../found-village';
import { placeChurchForVillage } from '../place-church';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

// Stavba kostela (churches.md – Stavba) s in-memory porty.

const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };
const FOUNDED = dayIndexOf({ year: 503, month: 4, day: 12 });
const AT = { x: 40, z: 40, rotation: CHURCH_EAST_ROTATION };

async function setup(
  withLodge: boolean,
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
  const record = villages.records.get(id)!;
  const state = record.state;
  let next = state.nextId;
  const masters: Person[] = withLodge
    ? MASON_CRAFTS.map((mason) => ({
        id: next++,
        bornDay: FOUNDED - 30 * 365,
        dwellingId: state.people[0]!.dwellingId,
        sex: 'male',
        faith: 'christian',
        mason,
      }))
    : [];
  villages.records.set(id, {
    ...record,
    state: {
      ...state,
      nextId: next,
      people: [...state.people, ...masters],
      faith: { rodBaptizedDay: FOUNDED },
      lodge: { circle: 'carolingian', invitedDay: FOUNDED },
      quarries: [{ outcropId: 1, x: 90, z: -90, rotation: 0, builtDay: FOUNDED }],
    },
  });
  return { villages, villageId: id };
}

const rotunda = { type: 'rotunda' as const, dims: defaultChurchDims('rotunda') };

describe('placeChurchForVillage', () => {
  it('bez stavbyvedoucího nic, cizí typ okruhu nic', async () => {
    const empty = await setup(false);
    const input = { villageId: empty.villageId, landscape, today: FOUNDED + 1, position: AT };
    expect(await placeChurchForVillage(empty, { ...input, ...rotunda })).toEqual({
      ok: false,
      reason: CHURCH_NO_LODGE,
    });
    const lodge = await setup(true);
    const basilica = { type: 'basilica' as const, dims: defaultChurchDims('basilica') };
    const result = await placeChurchForVillage(lodge, {
      ...input,
      villageId: lodge.villageId,
      ...basilica,
    });
    expect(result).toEqual({ ok: false, reason: CHURCH_WRONG_TYPE });
  });

  it('kostel se založí bez ceny předem; druhý přes hřbitůvek prvního nejde', async () => {
    const { villages, villageId } = await setup(true);
    const input = { villageId, landscape, today: FOUNDED + 1, position: AT, ...rotunda };
    const first = await placeChurchForVillage({ villages }, input);
    if (!first.ok) throw new Error(first.reason);
    const site = first.village.state.constructions.find((c) => c.kind === 'church');
    expect(site?.church?.type).toBe('rotunda');
    expect(site?.position?.rotation).toBe(CHURCH_EAST_ROTATION);
    const second = await placeChurchForVillage({ villages }, { ...input, today: FOUNDED + 2 });
    expect(second).toEqual({ ok: false, reason: 'Překrývá se s kostelem.' });
  });
});
