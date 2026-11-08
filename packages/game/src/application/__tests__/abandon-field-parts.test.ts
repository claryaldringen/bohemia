import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { ABANDON_FOUNDING, RETURN_NOT_ABANDONED } from '../../domain/village';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { abandonVillageFieldParts } from '../abandon-field-parts';
import { foundVillageForSettlement } from '../found-village';
import { placeField } from '../place-field';
import { InMemoryVillages } from './in-memory-villages';

// Opuštění dílu pole: use-case nad uloženou vsí (repozitář v paměti).

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();

async function withField(): Promise<{
  villages: InMemoryVillages;
  villageId: string;
  partId: number;
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
  villages.edit(villageId, (state) => {
    Object.assign(state, withBuiltFirstDwelling(state));
  });
  const placed = await placeField(
    { villages },
    { villageId, landscape, today: TODAY + 1, cells: block(8, 8, 3, 2) },
  );
  if (!placed.ok) throw new Error(placed.reason);
  const partId = placed.village.state.parts.find((p) => p.state === 'founding')!.id;
  return { villages, villageId, partId };
}

describe('abandonVillageFieldParts', () => {
  it('nezaložený díl odmítne, založený opustí a vrátí', async () => {
    const { villages, villageId, partId } = await withField();
    const input = { villageId, landscape, today: TODAY + 1 };
    expect(
      await abandonVillageFieldParts({ villages }, { ...input, partIds: [partId], abandon: true }),
    ).toEqual({ ok: false, reason: ABANDON_FOUNDING });

    villages.edit(villageId, (state) => {
      for (const p of state.parts) {
        p.foundingDone = p.foundingCost;
        p.state = 'ready';
      }
      state.constructions = state.constructions.filter((c) => c.kind !== 'field');
    });
    const abandoned = await abandonVillageFieldParts(
      { villages },
      { ...input, partIds: [partId], abandon: true },
    );
    expect(abandoned.ok).toBe(true);
    if (!abandoned.ok) return;
    const part = abandoned.village.state.parts.find((p) => p.id === partId)!;
    expect(part).toMatchObject({ abandoned: true, state: 'fallow' });
    expect(abandoned.village.state.chronicle.at(-1)).toMatchObject({
      kind: 'parts-abandoned',
      parts: 1,
    });

    const back = await abandonVillageFieldParts(
      { villages },
      { ...input, partIds: [partId], abandon: false },
    );
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.village.state.parts.find((p) => p.id === partId)!.abandoned).toBeUndefined();
    expect(
      await abandonVillageFieldParts({ villages }, { ...input, partIds: [partId], abandon: false }),
    ).toEqual({ ok: false, reason: RETURN_NOT_ABANDONED });
  });

  it('neexistující ves odmítne', async () => {
    const { villages } = await withField();
    const missing = await abandonVillageFieldParts(
      { villages },
      { villageId: 'nope', landscape, today: TODAY + 1, partIds: [1], abandon: true },
    );
    expect(missing.ok).toBe(false);
  });
});
