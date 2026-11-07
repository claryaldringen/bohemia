import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { FORT_NOT_FENCE, FORT_GATE_OFF, squarePoints } from '../../domain/village';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { addFortificationGate } from '../add-fortification-gate';
import { foundVillageForSettlement } from '../found-village';
import { placeFortification } from '../place-fortification';
import { upgradeFortification } from '../upgrade-fortification';
import { InMemoryVillages } from './in-memory-villages';

// Opevnění – use-casy nad uloženou vsí (repozitář v paměti): stavba, vylepšení a brána.

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();

async function settled(): Promise<{ villages: InMemoryVillages; villageId: string }> {
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
    state.woodLogs = 300;
  });
  return { villages, villageId };
}

describe('opevnění – use-casy', () => {
  it('placeFortification uloží opevnění se stavbou po úsecích', async () => {
    const { villages, villageId } = await settled();
    const placed = await placeFortification(
      { villages },
      {
        villageId,
        landscape,
        today: TODAY + 1,
        points: squarePoints(block(9, 9, 4, 4), null, landscape, 'palisade')!,
        kind: 'palisade',
      },
    );
    if (!placed.ok) throw new Error(placed.reason);
    const state = placed.village.state;
    expect(state.fortifications).toHaveLength(1);
    const c = state.constructions.find((x) => x.kind === 'fortification');
    expect(c?.fortWork).toBe('build');
    expect(c?.fortSegments).toHaveLength(16);
  });

  it('upgradeFortification odmítne vylepšit val, addFortificationGate klik mimo obvod', async () => {
    const { villages, villageId } = await settled();
    const placed = await placeFortification(
      { villages },
      {
        villageId,
        landscape,
        today: TODAY + 1,
        points: squarePoints(block(9, 9, 4, 4), null, landscape, 'rampart')!,
        kind: 'rampart',
      },
    );
    if (!placed.ok) throw new Error(placed.reason);
    const fortificationId = placed.village.state.fortifications![0]!.id;
    const base = { villageId, landscape, today: TODAY + 1, fortificationId };
    expect(await upgradeFortification({ villages }, { ...base, work: 'upgrade' })).toEqual({
      ok: false,
      reason: FORT_NOT_FENCE,
    });
    expect(
      await addFortificationGate({ villages }, { ...base, position: { x: 45, z: 45 } }),
    ).toEqual({ ok: false, reason: FORT_GATE_OFF });
    // klik na severní okraj plochy (z = 75 m) přidá bránu
    const gate = await addFortificationGate({ villages }, { ...base, position: { x: 52, z: 75 } });
    if (!gate.ok) throw new Error(gate.reason);
    expect(gate.village.state.fortifications![0]!.gates.length).toBeGreaterThan(1);
  });
});
