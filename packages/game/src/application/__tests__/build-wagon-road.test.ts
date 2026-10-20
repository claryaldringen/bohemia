import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { WAGON_BUILDING, WAGON_EXISTS, WAGON_LOOP } from '../../domain/village';
import { LANDSCAPE } from '../../domain/village/__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { buildWagonRoad } from '../build-wagon-road';
import { foundVillageForSettlement } from '../found-village';
import { InMemoryVillages } from './in-memory-villages';

// Vozová cesta (roads.md – Vozová cesta) – use-case nad uloženou vsí (repozitář v paměti).

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
    state.roads = {
      nextId: 3,
      roads: [
        {
          id: 1,
          points: [
            { x: 0, z: -10 },
            { x: 40, z: -60 },
            { x: 0, z: -120 },
          ],
          bornDay: TODAY - 800,
          grade: 'trodden',
          traffic: [],
          spots: [],
        },
        {
          id: 2,
          points: [
            { x: 60, z: 0 },
            { x: 90, z: 0 },
            { x: 90, z: 30 },
            { x: 60, z: 0 },
          ],
          bornDay: TODAY - 800,
          grade: 'trodden',
          traffic: [],
          spots: [],
        },
      ],
      trees: [],
      candidates: [],
      labor: { from: TODAY - 100, days: 0, shares: [] },
    };
  });
  return { villages, villageId: founded.village.id };
}

describe('buildWagonRoad', () => {
  it('server trasu najde znovu a zahájí stavbu; okruh a hotovou vozovou cestu odmítne', async () => {
    const { villages, villageId } = await settled();
    const base = { villageId, landscape: LANDSCAPE, today: TODAY };
    expect(await buildWagonRoad({ villages }, { ...base, roadId: 2 })).toEqual({
      ok: false,
      reason: WAGON_LOOP,
    });
    const result = await buildWagonRoad({ villages }, { ...base, roadId: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.village.state;
    expect(state.roads!.earthworks).toHaveLength(1);
    const c = state.constructions.find((x) => x.earthwork !== undefined)!;
    expect(c.kind).toBe('road');
    expect(c.cost).toBeGreaterThan(0);
    // stará cesta zůstává
    expect(state.roads!.roads.find((r) => r.id === 1)?.grade).toBe('trodden');
    // přímější než klikatá stará cesta
    const profile = state.roads!.earthworks![0]!.profile;
    const length = profile
      .slice(1)
      .reduce((sum, p, k) => sum + Math.hypot(p.x - profile[k]!.x, p.z - profile[k]!.z), 0);
    expect(length).toBeLessThan(125);
    // podruhé: stavba už běží
    expect(await buildWagonRoad({ villages }, { ...base, roadId: 1 })).toEqual({
      ok: false,
      reason: WAGON_BUILDING,
    });
    // hotová vozová cesta (bez stavby) se znovu nenabízí
    villages.edit(villageId, (s) => {
      s.roads!.roads[0]!.grade = 'wagon';
      s.constructions = s.constructions.filter((x) => x.earthwork === undefined);
      for (const e of s.roads!.earthworks ?? []) delete e.constructionId;
    });
    expect(await buildWagonRoad({ villages }, { ...base, roadId: 1 })).toEqual({
      ok: false,
      reason: WAGON_EXISTS,
    });
  });
});
