import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { generateLandscape, tileCenterWorld } from '../../domain/landscape';
import { foundedVillageState, foundVillageForSettlement } from '../found-village';
import { updateVillage } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

// Seed počasí kraje (disasters.md – Kraj a ochrana nové vsi): ves dostane kopii seedu své mapy
// z úložiště při založení i při načtení starší vsi; úložiště bez počasí ji nechá bez něj.

const SEED = 1;
const TODAY = dayIndexOf({ year: 500, month: 3, day: 1 });

describe('seed počasí mapy ve vsi', () => {
  const landscape = generateLandscape(SEED);
  const at = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  const input = { landscape, today: TODAY, dwelling: { ...at, rotation: 0 } };

  it('starší ves ho dostane při načtení – jednou, druhé načtení nic nemění', async () => {
    const founded = foundedVillageState(SEED, input);
    if (!founded.ok) throw new Error(founded.reason);
    expect(founded.state.weatherSeed).toBeUndefined();
    const villages = new InMemoryVillages();
    villages.weatherSeeds.set('settlement-1', 4242);
    const record = await villages.add('settlement-1', 'Ves', founded.state);
    const keep = (s: typeof founded.state): { ok: true; state: typeof s } => ({
      ok: true,
      state: s,
    });
    const first = await updateVillage(villages, record.id, TODAY, landscape, keep);
    if (!first.ok) throw new Error(first.reason);
    expect(first.village.state.weatherSeed).toBe(4242);
    const saves = villages.saves;
    const second = await updateVillage(villages, record.id, TODAY, landscape, keep);
    if (!second.ok) throw new Error(second.reason);
    expect(second.village.state.weatherSeed).toBe(4242);
    expect(villages.saves).toBe(saves);
  }, 60_000);

  it('nová ves ho má od založení; sídlo bez počasí nechá ves bez něj', async () => {
    const villages = new InMemoryVillages();
    villages.weatherSeeds.set('settlement-1', 77);
    const seeds = { nextSeed: (): number => SEED };
    const created = await foundVillageForSettlement(
      { villages, seeds },
      { ...input, settlementId: 'settlement-1', name: 'Lhota' },
    );
    if (!created.ok) throw new Error(created.reason);
    expect(created.village.state.weatherSeed).toBe(77);
    const bare = await foundVillageForSettlement(
      { villages, seeds },
      { ...input, settlementId: 'settlement-2', name: 'Lhota' },
    );
    if (!bare.ok) throw new Error(bare.reason);
    expect(bare.village.state.weatherSeed).toBeUndefined();
  }, 60_000);
});
