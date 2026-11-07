import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { generateLandscape, obstaclesOf, tileCenterWorld } from '../../domain/landscape';
import { advanceVillage } from '../../domain/village';
import { foundedVillageState } from '../found-village';
import { updateVillage } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

// Deník vsí: dopočet přes přelom roku zapíše řádek za každý dokončený rok, stav je týž jako bez
// dělení kousků a opakovaný dopočet řádek nepřidá.

const SEED = 1;
const START = dayIndexOf({ year: 500, month: 1, day: 1 });
const TODAY = dayIndexOf({ year: 502, month: 3, day: 1 });

describe('deník vsí při dopočtu', () => {
  it('řádek za každý dokončený rok, stav beze změny oproti jednomu kousku', async () => {
    const landscape = generateLandscape(SEED);
    const at = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
    const founded = foundedVillageState(SEED, {
      landscape,
      today: START,
      dwelling: { ...at, rotation: 0 },
    });
    if (!founded.ok) throw new Error(founded.reason);
    const villages = new InMemoryVillages();
    const record = await villages.add('settlement-1', 'Ves', founded.state);
    const keep = (s: typeof founded.state): { ok: true; state: typeof s } => ({
      ok: true,
      state: s,
    });
    const result = await updateVillage(villages, record.id, TODAY, landscape, keep);
    if (!result.ok) throw new Error(result.reason);
    const log = villages.yearLog.get(record.id);
    expect([...(log?.keys() ?? [])]).toEqual([500, 501]);
    const row = log?.get(500);
    expect(row?.day).toBe(dayIndexOf({ year: 500, month: 12, day: 31 }));
    expect((row?.adults ?? 0) + (row?.children ?? 0)).toBeGreaterThan(0);
    // stejný stav jako jeden velký kousek
    const whole = advanceVillage(founded.state, TODAY, obstaclesOf(landscape), landscape);
    expect(result.village.state.lastDay).toBe(TODAY);
    expect(result.village.state.storesKg).toBe(whole.storesKg);
    expect(result.village.state.people.length).toBe(whole.people.length);
    const again = await updateVillage(villages, record.id, TODAY, landscape, keep);
    if (!again.ok) throw new Error(again.reason);
    expect(villages.yearLog.get(record.id)?.size).toBe(2);
  }, 120_000);
});
