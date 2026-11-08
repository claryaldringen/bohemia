import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import type { Landscape } from '../../domain/landscape';
import {
  FORT_BUSY,
  FORT_GATE_LOW,
  FORT_RAMPART_DONE,
  fortSections,
  squarePoints,
  type FortKind,
} from '../../domain/village';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { addFortificationGate } from '../add-fortification-gate';
import { addFortificationRampart, fillFortificationMoat } from '../fortification-rampart';
import { foundVillageForSettlement } from '../found-village';
import { placeFortification } from '../place-fortification';
import { upgradeFortification } from '../upgrade-fortification';
import { upgradeFortificationGate } from '../upgrade-fortification-gate';
import type { VillageResult } from '../villages';
import { InMemoryVillages } from './in-memory-villages';

// Panel úseku (fortifications.md – Hradby a obrana, Rozhraní a scéna): use-casy tlačítek –
// vylepšit úsek, doplnit val, napustit příkop, klešťová brána – nad uloženou vsí (repozitář
// v paměti); dvojklik pošle akci dvakrát a druhá narazí na běžící stavbu.

const TODAY = dayIndexOf({ year: 600, month: 4, day: 12 });

/** Ves s hotovým opevněním `kind` (všechny díly stojí) a branou na severu. */
async function builtFort(
  kind: FortKind,
  landscape: Landscape,
): Promise<{
  villages: InMemoryVillages;
  base: { villageId: string; landscape: Landscape; today: number; fortificationId: number };
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
    state.woodLogs = 20000;
  });
  const placed = await placeFortification(
    { villages },
    {
      villageId,
      landscape,
      today: TODAY + 1,
      // mírné rohy – ochoz i val chtějí větší ohyb
      points: squarePoints(block(8, 8, 4, 4), null, landscape, 'chamber')!,
      kind,
    },
  );
  if (!placed.ok) throw new Error(placed.reason);
  villages.edit(villageId, (state) => {
    state.constructions = state.constructions.filter((c) => c.kind !== 'fortification');
    for (const seg of state.fortifications![0]!.segments) {
      seg.builtDay = TODAY;
      seg.state = 1;
    }
  });
  const fortificationId = placed.village.state.fortifications![0]!.id;
  const base = { villageId, landscape, today: TODAY + 1, fortificationId };
  // klik na severní okraj plochy (z = 60 m) přidá bránu
  const gate = await addFortificationGate({ villages }, { ...base, position: { x: 37, z: 60 } });
  if (!gate.ok) throw new Error(gate.reason);
  return { villages, base };
}

/** Stavby opevnění vsi po akci (`fortWork`). */
function works(result: VillageResult): (string | undefined)[] {
  if (!result.ok) throw new Error(result.reason);
  return result.village.state.constructions
    .filter((c) => c.kind === 'fortification')
    .map((c) => c.fortWork);
}

/** Díl uvnitř prvního úseku (ne díl s branou). */
async function sectionSegment(villages: InMemoryVillages, villageId: string): Promise<number> {
  const record = await villages.find(villageId);
  const [first] = fortSections(record!.state.fortifications![0]!);
  return first!.segments[1]!;
}

describe('panel úseku – use-casy tlačítek', () => {
  it('úsek palisády na ochoz – staveniště jen v úseku, dvojklik FORT_BUSY', async () => {
    const { villages, base } = await builtFort('palisade', makeLandscape());
    const segment = await sectionSegment(villages, base.villageId);
    const input = { ...base, work: 'upgrade' as const, target: 'walkway' as const, segment };
    const up = await upgradeFortification({ villages }, input);
    expect(works(up)).toEqual(['upgrade']);
    if (!up.ok) return;
    const c = up.village.state.constructions.find((x) => x.kind === 'fortification')!;
    expect(c.fortTarget).toBe('walkway');
    expect(c.fortSegments!.length).toBeLessThan(
      up.village.state.fortifications![0]!.segments.length,
    );
    expect(await upgradeFortification({ villages }, input)).toEqual({
      ok: false,
      reason: FORT_BUSY,
    });
  });

  it('doplnit val pod palisádu úseku, dvojklik – úsek už val má', async () => {
    const { villages, base } = await builtFort('palisade', makeLandscape());
    const segment = await sectionSegment(villages, base.villageId);
    expect(works(await addFortificationRampart({ villages }, { ...base, segment }))).toEqual([
      'rampart',
    ]);
    // val se do dílů zapíše hned (staveniště) – druhý klik úsek s valem nenabídne
    expect(await addFortificationRampart({ villages }, { ...base, segment })).toEqual({
      ok: false,
      reason: FORT_RAMPART_DONE,
    });
  });

  it('napustit příkop valu u potoka, dvojklik FORT_BUSY', async () => {
    // potok ve sloupci 13 – do 30 m od osy příkopu východní strany valu
    const near = makeLandscape({ surface: (x) => (x === 13 ? 'water' : 'meadow') });
    const { villages, base } = await builtFort('rampart', near);
    const record = await villages.find(base.villageId);
    const fort = record!.state.fortifications![0]!;
    // první díl, jehož příkop dosáhne k vodě (východní strana)
    let result: VillageResult | null = null;
    for (const segment of fort.segments.map((s) => s.index)) {
      result = await fillFortificationMoat({ villages }, { ...base, segment });
      if (result.ok) {
        expect(works(result)).toEqual(['moat']);
        expect(await fillFortificationMoat({ villages }, { ...base, segment })).toEqual({
          ok: false,
          reason: FORT_BUSY,
        });
        break;
      }
    }
    expect(result?.ok).toBe(true);
  });

  it('klešťová brána palisády, dvojklik FORT_BUSY; u plotu důvod', async () => {
    const { villages, base } = await builtFort('palisade', makeLandscape());
    const record = await villages.find(base.villageId);
    const gate = record!.state.fortifications![0]!.gates[0]!;
    const input = { ...base, segment: gate.segment, level: 'pincer' as const };
    expect(works(await upgradeFortificationGate({ villages }, input))).toEqual(['gate']);
    expect(await upgradeFortificationGate({ villages }, input)).toEqual({
      ok: false,
      reason: FORT_BUSY,
    });
    const fence = await builtFort('fence', makeLandscape());
    const fenceRecord = await fence.villages.find(fence.base.villageId);
    expect(
      await upgradeFortificationGate(
        { villages: fence.villages },
        {
          ...fence.base,
          segment: fenceRecord!.state.fortifications![0]!.gates[0]!.segment,
          level: 'pincer',
        },
      ),
    ).toEqual({ ok: false, reason: FORT_GATE_LOW });
  });
});
