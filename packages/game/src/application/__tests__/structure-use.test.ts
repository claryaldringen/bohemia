import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import {
  ALREADY_DEMOLISHING,
  DEMOLISHING,
  MANOR_STAYS,
  demolitionOf,
  type VillageState,
} from '../../domain/village';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import {
  abandonVillageStructure,
  demolishVillageStructure,
  restoreVillageStructure,
} from '../structure-use';
import { InMemoryVillages } from './in-memory-villages';

// Opustit, zbourat a vrátit stavbu: use-casy nad uloženou vsí (repozitář v paměti).

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();

/** Ves: dvorec zakladatelů, obydlí A s párem, prázdné obydlí B a hotová ohrada bez zvířat. */
async function village(): Promise<{
  villages: InMemoryVillages;
  villageId: string;
  manor: number;
  a: number;
  b: number;
  pen: number;
}> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: 'settlement-1',
      landscape,
      today: TODAY,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  const villageId = founded.village.id;
  const ids = { manor: 0, a: 0, b: 0, pen: 0 };
  villages.edit(villageId, (state) => {
    Object.assign(state, withBuiltFirstDwelling(state));
    ids.manor = state.dwellings[0]!.id;
    const home = (x: number): number => {
      const id = state.nextId++;
      state.dwellings.push({
        id,
        type: 'zemnice',
        // novější než zemnice zakladatelů – dvorcem zůstane ona (nejstarší obydlí)
        builtDay: TODAY,
        condition: 1,
        position: { x, z: -50, rotation: 0 },
      });
      return id;
    };
    ids.a = home(-20);
    ids.b = home(10);
    const born = TODAY - Math.ceil(20 * 365.25);
    state.people.push(
      { id: state.nextId++, bornDay: born, dwellingId: ids.a, sex: 'male' },
      { id: state.nextId++, bornDay: born, dwellingId: ids.a, sex: 'female' },
    );
    ids.pen = state.nextId++;
    state.pens = [
      { id: ids.pen, cell: { x: 4, y: 4 }, x: -82.5, z: -82.5, builtDay: TODAY - 400, team: null },
    ];
    state.storesKg = 1500;
  });
  return { villages, villageId, ...ids };
}

async function saved(villages: InMemoryVillages, villageId: string): Promise<VillageState> {
  return (await villages.find(villageId))!.state;
}

describe('opustit, zbourat a vrátit stavbu', () => {
  it('ohrada: Opustit uloží opuštění, Vrátit ji vrátí do užívání', async () => {
    const { villages, villageId, pen } = await village();
    const input = { villageId, landscape, today: TODAY + 1, structure: 'pen' as const, id: pen };
    expect((await abandonVillageStructure({ villages }, input)).ok).toBe(true);
    expect((await saved(villages, villageId)).pens![0]!.disusedDay).toBe(TODAY + 1);
    expect((await restoreVillageStructure({ villages }, input)).ok).toBe(true);
    expect((await saved(villages, villageId)).pens![0]!.disusedDay).toBeUndefined();
  });

  it('obydlí: Opustit – lidé bydlí v prázdném obydlí; opuštěné pak jde zbourat', async () => {
    const { villages, villageId, a, b } = await village();
    const input = { villageId, landscape, today: TODAY + 1, structure: 'dwelling' as const, id: a };
    expect((await abandonVillageStructure({ villages }, input)).ok).toBe(true);
    const abandoned = await saved(villages, villageId);
    expect(abandoned.people.filter((p) => p.dwellingId === a)).toEqual([]);
    expect(abandoned.people.filter((p) => p.dwellingId === b)).toHaveLength(2);

    expect((await demolishVillageStructure({ villages }, input)).ok).toBe(true);
    const state = await saved(villages, villageId);
    expect(state.constructions.filter((c) => c.kind === 'demolition')).toHaveLength(1);
    expect(demolitionOf(state, { structure: 'dwelling', id: a })).toBeDefined();
  });

  it('dvakrát Zbourat naráz: druhý „Stavba se už bourá.“, ves má jedno bourání', async () => {
    const { villages, villageId, a } = await village();
    const input = { villageId, landscape, today: TODAY + 1, structure: 'dwelling' as const, id: a };
    const results = await Promise.all([
      demolishVillageStructure({ villages }, input),
      demolishVillageStructure({ villages }, input),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: ALREADY_DEMOLISHING });
    const state = await saved(villages, villageId);
    expect(state.constructions.filter((c) => c.kind === 'demolition')).toHaveLength(1);
    // bouranou stavbu Vrátit nejde – nejdřív zrušit bourání
    expect(await restoreVillageStructure({ villages }, input)).toEqual({
      ok: false,
      reason: DEMOLISHING,
    });
  });

  it('dvorec opustit ani zbourat nejde', async () => {
    const { villages, villageId, manor } = await village();
    const input = {
      villageId,
      landscape,
      today: TODAY + 1,
      structure: 'dwelling' as const,
      id: manor,
    };
    expect(await abandonVillageStructure({ villages }, input)).toEqual({
      ok: false,
      reason: MANOR_STAYS,
    });
    expect(await demolishVillageStructure({ villages }, input)).toEqual({
      ok: false,
      reason: MANOR_STAYS,
    });
  });
});
