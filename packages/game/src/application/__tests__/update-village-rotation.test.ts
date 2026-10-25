import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceVillage } from '../../domain/village';
import { dayIndexOf } from '../../domain/calendar';
import { generateLandscape, tileCenterWorld } from '../../domain/landscape';
import { foundedVillageState } from '../found-village';
import { updateVillage } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

// Chyba převodu na osevní postup (fields.md – Osevní postup po dílech, bod 7) se zapíše a ves
// se načte a dopočítá dál.

const SEED = 1;
const SEPTEMBER = dayIndexOf({ year: 500, month: 9, day: 2 });

afterEach(() => vi.restoreAllMocks());

describe('updateVillage – chyba převodu na osevní postup', () => {
  it('zapíše chybu s id vsi, ves se načte a dopočítá bez výjimky', async () => {
    const landscape = generateLandscape(SEED);
    const today = dayIndexOf({ year: 500, month: 3, day: 1 });
    const at = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
    const founded = foundedVillageState(SEED, {
      landscape,
      today,
      dwelling: { ...at, rotation: 0 },
    });
    if (!founded.ok) throw new Error(founded.reason);
    // ves s hospodářským rokem (dopočtená do září), pak stav v tvaru, který převod nezvládne
    const state = structuredClone(advanceVillage(founded.state, SEPTEMBER, null));
    if (!state.season) throw new Error('Ves nemá hospodářský rok.');
    delete state.sowingRotation;
    (state.season as unknown as { extra: unknown }).extra = 5; // `extra` není seznam
    const villages = new InMemoryVillages();
    const record = await villages.add('settlement-1', 'Ves', state);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await updateVillage(villages, record.id, SEPTEMBER + 3, landscape, (s) => ({
      ok: true,
      state: s,
    }));
    if (!result.ok) throw new Error(result.reason);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain(record.id);
    expect(result.village.state.sowingRotation).toBe(true);
    expect(result.village.state.sowingRotationFailed).toEqual(expect.any(String));
    expect(result.village.state.lastDay).toBe(SEPTEMBER + 3);
    // podruhé se nezapisuje
    await updateVillage(villages, record.id, SEPTEMBER + 4, landscape, (s) => ({
      ok: true,
      state: s,
    }));
    expect(error).toHaveBeenCalledTimes(1);
  }, 60_000);
});
