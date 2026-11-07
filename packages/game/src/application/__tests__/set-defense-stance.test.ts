import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { stanceOf } from '../../domain/war';
import { foundVillageForSettlement } from '../found-village';
import { setDefenseStanceInVillage } from '../set-defense-stance';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

// Postoj vsi před cizím vojskem (war.md – Obránci – postoje a útěk).

const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };
const FOUNDED = dayIndexOf({ year: 503, month: 4, day: 12 });

describe('setDefenseStanceInVillage', () => {
  it('nová ves bez nastavení utíká; nastavený postoj se uloží a přepíše', async () => {
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
    const villageId = founded.village.id;
    expect(stanceOf((await villages.find(villageId))!.state)).toBe('flee');

    const set = await setDefenseStanceInVillage(
      { villages },
      { villageId, stance: 'defend', today: FOUNDED + 1, landscape },
    );
    expect(set.ok).toBe(true);
    expect((await villages.find(villageId))!.state.defense).toEqual({ stance: 'defend' });

    await setDefenseStanceInVillage(
      { villages },
      { villageId, stance: 'surrender', today: FOUNDED + 1, landscape },
    );
    expect(stanceOf((await villages.find(villageId))!.state)).toBe('surrender');
  });
});
