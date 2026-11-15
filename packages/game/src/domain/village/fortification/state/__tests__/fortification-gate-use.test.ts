import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../../calendar';
import { packObstacles } from '../../../../landscape';
import { foundVillage } from '../../../core/actions';
import { DEMOLITION } from '../../../rules/rules-buildings';
import { FORTIFICATIONS } from '../../../rules/rules-fortifications';
import { squarePoints } from '../../convert';
import { fortificationFullCost } from '../../cost';
import { decideFortRebuilds } from '../../decay';
import { fortGaps } from '../../defense';
import { decideTowerRebuilds } from '../fortification-gate';
import {
  dropFortificationWork,
  finishFortification,
  FORT_BUSY,
  startFortification,
  villageFortifications,
} from '../fortifications';
import {
  FORT_GATE_GONE,
  gateDemolition,
  setGateAbandoned,
  startGateDemolition,
} from '../fortification-gate-use';
import type { Construction, Fortification, VillageState } from '../../../types';
import { block, makeLandscape } from '../../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../../__tests__/village-fixtures';

// Opustit a zbořit bránu (demolition.md – Rozhodnutí, Martin 14. 11. 2026): zbořená brána nechá
// mezeru šířky brány, hradba dílu stojí; opuštěná se nepřestaví, shnije a zbyde mezera.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);
/** Rok s rezervou (dny) – stáří dílů přes konec životnosti. */
const YEAR = 366;

/** Hotová palisáda s jednou branou u dvorce, díly staré `ageDays` dní. */
function built(ageDays = 0): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 1200;
  const result = startFortification(s, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, 'palisade')!,
    kind: 'palisade',
  });
  if (!result.ok) throw new Error(result.reason);
  const next = result.state;
  next.woodLogs = 1200;
  next.constructions = next.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(next)[0]!.segments) {
    seg.builtDay = DAY - ageDays;
    seg.state = 1;
  }
  next.lastDay = DAY;
  return next;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const work = (s: VillageState): Construction | undefined =>
  s.constructions.find((c) => c.kind === 'fortification');

describe('zboření brány', () => {
  it('stojí čtvrtinu práce a vrátí polovinu klád kusu hradby šířky brány', () => {
    const s = built();
    const gate = fortOf(s).gates[0]!;
    const cost = fortificationFullCost('palisade', FORTIFICATIONS.gate.widthM);
    expect(gateDemolition(s, { fortificationId: fortOf(s).id, segment: gate.segment })).toEqual({
      laborManDays: DEMOLITION.laborShare * cost.laborManDays,
      logs: Math.floor(DEMOLITION.logShare * cost.logs + 1e-9),
    });
  });

  it('brána zmizí a zbyde mezera, hradba dílu stojí a klády přijdou na hromadu', () => {
    const s = built();
    const fort = fortOf(s);
    const gate = fort.gates[0]!;
    const input = { fortificationId: fort.id, segment: gate.segment };
    const expected = gateDemolition(s, input);
    if ('reason' in expected) throw new Error(expected.reason);
    const r = startGateDemolition(s, DAY, input);
    if (!r.ok) throw new Error(r.reason);
    const next = r.state;
    expect(startGateDemolition(next, DAY, input)).toEqual({ ok: false, reason: FORT_BUSY });
    const c = work(next)!;
    expect(c.fortGate).toEqual({ segment: gate.segment, level: 'demolish' });
    c.done = c.cost;
    const logsBefore = next.woodLogs ?? 0;
    finishFortification(next, c, DAY + 3);
    next.constructions = [];
    const after = fortOf(next);
    expect(after.gates[0]!.demolishedDay).toBe(DAY + 3);
    const seg = after.segments.find((x) => x.index === gate.segment)!;
    expect(seg.demolishedDay).toBeUndefined();
    expect(seg.state).toBe(1);
    expect((next.woodLogs ?? 0) - logsBefore).toBe(expected.logs);
    // mezera šířky brány – zavřít nejde
    const gaps = fortGaps(landscape, after, DAY + 3, new Set([gate.segment]));
    expect(gaps.filter((g) => g.segment === gate.segment)).toEqual([
      expect.objectContaining({ kind: 'gap', widthM: FORTIFICATIONS.gate.widthM }),
    ]);
    expect(gateDemolition(next, input)).toEqual({ reason: FORT_GATE_GONE });
  });

  it('zrušené zboření nechá bránu stát', () => {
    const s = built();
    const fort = fortOf(s);
    const gate = fort.gates[0]!;
    const r = startGateDemolition(s, DAY, { fortificationId: fort.id, segment: gate.segment });
    if (!r.ok) throw new Error(r.reason);
    const next = r.state;
    dropFortificationWork(next, work(next)!);
    expect(fortOf(next).gates[0]!.demolishedDay).toBeUndefined();
  });
});

describe('opuštění brány', () => {
  const life = FORTIFICATIONS.lifeYears.palisade;

  it('opuštěnou bránu obyvatelé nepřestaví, po shnití zbyde mezera', () => {
    const s = built((life + 1) * YEAR);
    const fort = fortOf(s);
    const gate = fort.gates[0]!;
    const input = { fortificationId: fort.id, segment: gate.segment };
    const r = setGateAbandoned(s, DAY, input, true);
    if (!r.ok) throw new Error(r.reason);
    const next = r.state;
    expect(fortOf(next).gates[0]!.abandonedDay).toBe(DAY);
    // dožilé díly se přestaví – díl opuštěné brány ne
    decideFortRebuilds(next, DAY, landscape, EMPTY);
    const rebuild = work(next)!;
    expect(rebuild.fortWork).toBe('rebuild');
    const indexes = (rebuild.fortSegments ?? []).filter((w) => w.part === undefined);
    expect(indexes.map((w) => w.index)).not.toContain(gate.segment);
    expect(indexes.length).toBe(fort.segments.length - 1);
    // shnilý díl: brána zmizí a zbyde mezera
    next.constructions = [];
    const rotten = DAY + (FORTIFICATIONS.decayYears + 1) * YEAR;
    decideFortRebuilds(next, rotten, landscape, EMPTY);
    const after = fortOf(next).gates[0]!;
    expect(after.demolishedDay).toBe(rotten);
    expect(after.abandonedDay).toBeUndefined();
  });

  it('věž opuštěné brány se nepřestaví', () => {
    const s = built();
    const fort = fortOf(s);
    fort.gates[0]!.towerDay = DAY - 100 * YEAR;
    fort.gates[0]!.abandonedDay = DAY;
    expect(decideTowerRebuilds(s, DAY, EMPTY)).toEqual([]);
  });

  it('Vrátit bránu zase udržuje, dvakrát opustit nejde', () => {
    const s = built();
    const fort = fortOf(s);
    const input = { fortificationId: fort.id, segment: fort.gates[0]!.segment };
    const r = setGateAbandoned(s, DAY, input, true);
    if (!r.ok) throw new Error(r.reason);
    expect(setGateAbandoned(r.state, DAY, input, true).ok).toBe(false);
    const back = setGateAbandoned(r.state, DAY + 1, input, false);
    if (!back.ok) throw new Error(back.reason);
    expect(fortOf(back.state).gates[0]!.abandonedDay).toBeUndefined();
  });
});
