import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import {
  finishFortification,
  FORT_SECTION_STANDS,
  fortSectionSpans,
  fortSections,
  fortSegments,
  outlineCenter,
  outlineOf,
  outlinePointAt,
  squarePoints,
  type Fortification,
} from '../../domain/village';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { addFortificationGate } from '../add-fortification-gate';
import { demolishFortificationSection } from '../demolish-fortification-section';
import { foundVillageForSettlement } from '../found-village';
import { placeFortification } from '../place-fortification';
import { rerouteFortificationSection } from '../reroute-fortification-section';
import { InMemoryVillages } from './in-memory-villages';

// Úsek od brány k bráně jinudy (demolition.md – Rozhodnutí) – use-case nad uloženou vsí
// (repozitář v paměti): zbořený úsek dostane novou trasu a stavbu, stojící úsek ne.

const TODAY = dayIndexOf({ year: 603, month: 4, day: 12 });
const landscape = makeLandscape();

/** Body trasy úseku s branou `gateSegment` 10 m od středu opevnění (3 body). */
function routeOut(fort: Fortification, gateSegment: number): [number, number][] {
  const outline = outlineOf(landscape, fort)!;
  const span = fortSectionSpans(
    fortSegments(outline).map((x) => x.lengthM),
    fort.gates,
  ).find((x) => x.gateSegment === gateSegment)!;
  const c = outlineCenter(outline);
  return [0.25, 0.5, 0.75].map((t) => {
    const [x, z] = outlinePointAt(outline, span.fromM + t * span.lengthM);
    const len = Math.sqrt((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z));
    return [x + ((x - c.x) / len) * 10, z + ((z - c.z) / len) * 10];
  });
}

describe('rerouteFortificationSection', () => {
  it('zbořený úsek postaví jinudy, stojící úsek odmítne', async () => {
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
      state.woodLogs = 3000;
    });
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
    // hotová palisáda bez simulace stavby
    villages.edit(villageId, (state) => {
      state.constructions = state.constructions.filter((c) => c.kind !== 'fortification');
      for (const seg of state.fortifications![0]!.segments) {
        seg.builtDay = TODAY;
        seg.state = 1;
      }
    });
    const fortificationId = placed.village.state.fortifications![0]!.id;
    const base = { villageId, landscape, today: TODAY + 1, fortificationId };
    const gate = await addFortificationGate({ villages }, { ...base, position: { x: 52, z: 75 } });
    if (!gate.ok) throw new Error(gate.reason);
    const [first, second] = fortSections(gate.village.state.fortifications![0]!);
    const segment = first!.segments[1]!;
    const demolished = await demolishFortificationSection({ villages }, { ...base, segment });
    if (!demolished.ok) throw new Error(demolished.reason);
    // zboření hotové
    villages.edit(villageId, (state) => {
      const c = state.constructions.find((x) => x.kind === 'fortification')!;
      c.done = c.cost;
      finishFortification(state, c, state.lastDay);
      state.constructions = state.constructions.filter((x) => x !== c);
    });
    const fort = demolished.village.state.fortifications![0]!;
    const standing = await rerouteFortificationSection(
      { villages },
      {
        ...base,
        segment: second!.segments[1]!,
        points: routeOut(fort, second!.gateSegment!),
        target: 'palisade',
      },
    );
    expect(standing).toEqual({ ok: false, reason: FORT_SECTION_STANDS });
    const done = await rerouteFortificationSection(
      { villages },
      { ...base, segment, points: routeOut(fort, first!.gateSegment!), target: 'palisade' },
    );
    if (!done.ok) throw new Error(done.reason);
    const c = done.village.state.constructions.find((x) => x.kind === 'fortification');
    expect(c).toMatchObject({ fortWork: 'upgrade', fortTarget: 'palisade' });
    expect(done.village.state.fortifications![0]!.points).not.toEqual(fort.points);
  });
});
