import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { NO_CONSTRUCTION, cancelUnfinishedConstruction } from '../cancel-construction';
import { placeField } from '../place-field';
import { InMemoryVillages } from './in-memory-villages';

// Zrušení rozestavěné stavby: use-case nad uloženou vsí (repozitář v paměti).

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();

async function withField(): Promise<{ villages: InMemoryVillages; villageId: string; id: number }> {
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
  villages.edit(villageId, (state) => {
    Object.assign(state, withBuiltFirstDwelling(state));
  });
  const placed = await placeField(
    { villages },
    { villageId, landscape, today: TODAY + 1, cells: block(8, 8, 3, 2) },
  );
  if (!placed.ok) throw new Error(placed.reason);
  const c = placed.village.state.constructions.find((x) => x.kind === 'field')!;
  return { villages, villageId, id: c.id };
}

describe('cancelUnfinishedConstruction', () => {
  it('zruší rozestavěné pole i s nehotovými díly, podruhé už není co rušit', async () => {
    const { villages, villageId, id } = await withField();
    const input = { villageId, landscape, today: TODAY + 1, constructionId: id };
    const cancelled = await cancelUnfinishedConstruction({ villages }, input);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    const state = cancelled.village.state;
    expect(state.constructions.some((c) => c.id === id)).toBe(false);
    expect(state.parts.some((p) => p.state === 'founding')).toBe(false);
    expect(await cancelUnfinishedConstruction({ villages }, input)).toEqual({
      ok: false,
      reason: NO_CONSTRUCTION,
    });
  });

  it('neexistující ves odmítne', async () => {
    const { villages } = await withField();
    const missing = await cancelUnfinishedConstruction(
      { villages },
      { villageId: 'nope', landscape, today: TODAY + 1, constructionId: 1 },
    );
    expect(missing.ok).toBe(false);
  });
});
