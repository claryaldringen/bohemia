import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { generateLandscape, tileCenterWorld } from '../../domain/landscape';
import { decodeWear } from '../../domain/village/paths/wear';
import type { LegacyRoadFields, VillageRoads, VillageState } from '../../domain/village';
import { foundedVillageState } from '../found-village';
import { updateVillage } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

const SEED = 1;

/** Stará ves z doby před novým systémem cest: s loňskými kandidáty, bez vyšlapanosti a příznaku. */
function oldVillage(): { state: VillageState; today: number } {
  const landscape = generateLandscape(SEED);
  const today = dayIndexOf({ year: 500, month: 3, day: 1 });
  const at = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  const founded = foundedVillageState(SEED, {
    landscape,
    today,
    dwelling: { ...at, rotation: 0 },
  });
  if (!founded.ok) throw new Error(founded.reason);
  const state = structuredClone(founded.state);
  const roads: VillageRoads & LegacyRoadFields = {
    nextId: 1,
    roads: [],
    trees: [],
    labor: { from: today, days: 0, shares: [] },
    candidates: [
      [
        { x: at.x, z: at.z },
        { x: at.x + 40, z: at.z },
      ],
    ],
  };
  state.roads = roads;
  delete state.routes;
  return { state, today };
}

describe('updateVillage – převod staré vsi na nový systém cest', () => {
  it('kandidáti dají vyšlapanost, zmizí a ves dostane příznak roads.v2', async () => {
    const landscape = generateLandscape(SEED);
    const { state } = oldVillage();
    expect(state.roads!.wear).toBeUndefined();
    expect(state.roads!.v2).toBeUndefined();
    const villages = new InMemoryVillages();
    const record = await villages.add('settlement-1', 'Ves', state);
    const result = await updateVillage(villages, record.id, state.lastDay, landscape, (s) => ({
      ok: true,
      state: s,
    }));
    if (!result.ok) throw new Error(result.reason);
    const roads = result.village.state.roads!;
    expect(roads.v2).toBe(true);
    expect((roads as VillageRoads & LegacyRoadFields).candidates).toBeUndefined();
    expect(roads.wear).toBeDefined();
    expect(decodeWear(roads.wear!.cells).size).toBeGreaterThan(0);
    // druhé načtení nic nepřevádí znovu
    const again = await updateVillage(villages, record.id, state.lastDay, landscape, (s) => ({
      ok: true,
      state: s,
    }));
    if (!again.ok) throw new Error(again.reason);
    expect(again.village.state.roads!.wear).toEqual(roads.wear);
    expect(again.village.state.roads!.v2).toBe(true);
  }, 120_000);
});
