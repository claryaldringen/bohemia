import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../../calendar';
import { packObstacles } from '../../../../landscape';
import { foundVillage } from '../../../core/actions';
import { FORTIFICATIONS } from '../../../rules/rules-fortifications';
import { squarePoints } from '../../convert';
import { fortificationCost } from '../../cost';
import { fortGaps } from '../../defense';
import { removeGate } from '../../gates';
import { fortSections } from '../../sections';
import {
  addGateToFortification,
  finishFortification,
  FORT_BUSY,
  FORT_GATE_TAKEN,
  startFortification,
  villageFortifications,
} from '../fortifications';
import {
  addGateOrRebuild,
  FORT_GAP_KIND,
  FORT_GAP_MIXED,
  FORT_GAP_NO_GATE,
  FORT_GAP_SIDES,
  gateGapFill,
  startGateGapFill,
} from '../fortification-gate-gap';
import { FORT_GATE_NO_DECAY, gateAbandonBlock, setGateAbandoned } from '../fortification-gate-use';
import type { Construction, FortKind, Fortification, VillageState } from '../../../types';
import { block, makeLandscape } from '../../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../../__tests__/village-fixtures';

// Otvor po zbořené bráně (demolition.md – Rozhodnutí, D45): mezi stojící hradbou ho zastaví běžná
// stavba hradbou kolem, do dílu se zbořenou branou jde postavit bránu znovu; brána v holém valu
// nechátrá, takže ji nejde opustit.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

/** Hotové opevnění druhu `kind` s branou u dvorce a dost klád na hromadě. */
function built(kind: FortKind = 'palisade'): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 1200;
  const result = startFortification(s, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, kind)!,
    kind,
  });
  if (!result.ok) throw new Error(result.reason);
  const next = result.state;
  next.woodLogs = 1200;
  next.constructions = next.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(next)[0]!.segments) {
    seg.builtDay = DAY;
    seg.state = 1;
  }
  next.lastDay = DAY;
  return next;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const work = (s: VillageState): Construction | undefined =>
  s.constructions.find((c) => c.kind === 'fortification');

/** Palisáda se dvěma branami, první zbořená (otvor mezi stojící hradbou). */
function withGap(): { s: VillageState; segment: number } {
  const s = built();
  const fort = fortOf(s);
  const first = fort.gates[0]!;
  // druhá brána v rohu obvodu – dva úseky, zbořená brána je mezi nimi
  const far = fort.points![2]!;
  const added = addGateToFortification(s, landscape, fort.id, { x: far[0], z: far[1] });
  if (!added.ok) throw new Error(added.reason);
  const gate = fortOf(added.state).gates.find((g) => g.segment === first.segment)!;
  removeGate(gate, DAY);
  return { s: added.state, segment: first.segment };
}

describe('otvor po zbořené bráně mezi stojící hradbou', () => {
  it('běžná stavba hradbou kolem otvor zastaví – brána zmizí a úseky kolem splynou', () => {
    const { s, segment } = withGap();
    const fort = fortOf(s);
    expect(fortSections(fort)).toHaveLength(2);
    const cost = fortificationCost('palisade', FORTIFICATIONS.gate.widthM);
    expect(gateGapFill(fort, landscape, segment, 'palisade')).toEqual({ kind: 'palisade', cost });
    expect(gateGapFill(fort, landscape, segment, 'fence')).toEqual({
      reason: FORT_GAP_KIND('palisade'),
    });
    const input = { fortificationId: fort.id, segment, target: 'palisade' as const };
    const r = startGateGapFill(s, DAY, landscape, EMPTY, input);
    if (!r.ok) throw new Error(r.reason);
    const next = r.state;
    expect(startGateGapFill(next, DAY, landscape, EMPTY, input)).toEqual({
      ok: false,
      reason: FORT_BUSY,
    });
    const c = work(next)!;
    expect(c.fortWork).toBe('gate');
    expect(c.fortGate).toEqual({ segment, level: 'fill' });
    expect((s.woodLogs ?? 0) - (next.woodLogs ?? 0)).toBe(Math.ceil(cost.logs - 1e-9));
    // otvor je otvorem, dokud stavba neskončí
    const gapsOf = (f: Fortification): unknown[] =>
      fortGaps(landscape, f, DAY + 3, new Set()).filter((g) => g.segment === segment);
    expect(gapsOf(fortOf(next))).toHaveLength(1);
    c.done = c.cost;
    finishFortification(next, c, DAY + 3);
    next.constructions = [];
    const after = fortOf(next);
    expect(after.gates.some((g) => g.segment === segment)).toBe(false);
    expect(fortSections(after)).toHaveLength(1);
    expect(gapsOf(after)).toEqual([]);
    const seg = after.segments.find((x) => x.index === segment)!;
    expect(seg.state).toBe(1);
    expect(seg.demolishedDay).toBeUndefined();
  });

  it('zbořený kus vedle otvoru – zastaví ho až úsek od brány k bráně', () => {
    const { s, segment } = withGap();
    const fort = fortOf(s);
    fort.segments.find((x) => x.index === segment)!.demolishedAfterGate = DAY;
    expect(gateGapFill(fort, landscape, segment, 'palisade')).toEqual({ reason: FORT_GAP_SIDES });
  });

  it('různá hradba po stranách otvoru – napřed vylepšit nižší', () => {
    const { s, segment } = withGap();
    const fort = fortOf(s);
    fort.segments.find((x) => x.index === segment)!.afterGate = {
      kind: 'fence',
      builtDay: DAY,
      state: 1,
    };
    expect(gateGapFill(fort, landscape, segment, 'palisade')).toEqual({ reason: FORT_GAP_MIXED });
  });

  it('stojící brána otvor nemá', () => {
    const s = built();
    const fort = fortOf(s);
    const segment = fort.gates[0]!.segment;
    expect(gateGapFill(fort, landscape, segment, 'palisade')).toEqual({
      reason: FORT_GAP_NO_GATE,
    });
  });
});

describe('nová brána do dílu se zbořenou branou', () => {
  it('Přidat bránu ji postaví znovu do otvoru za cenu hradby šířky brány', () => {
    const { s, segment } = withGap();
    const fort = fortOf(s);
    const old = fort.gates.find((g) => g.segment === segment)!;
    const position = { x: old.x, z: old.z };
    // dřív: díl bránu má
    expect(addGateToFortification(s, landscape, fort.id, position)).toEqual({
      ok: false,
      reason: FORT_GATE_TAKEN,
    });
    const r = addGateOrRebuild(s, DAY, landscape, EMPTY, { fortificationId: fort.id, position });
    if (!r.ok) throw new Error(r.reason);
    const next = r.state;
    const c = work(next)!;
    expect(c.fortGate).toEqual({ segment, level: 'rebuild' });
    const cost = fortificationCost('palisade', FORTIFICATIONS.gate.widthM);
    expect((s.woodLogs ?? 0) - (next.woodLogs ?? 0)).toBe(Math.ceil(cost.logs - 1e-9));
    c.done = c.cost;
    finishFortification(next, c, DAY + 3);
    const gate = fortOf(next).gates.find((g) => g.segment === segment)!;
    expect(gate.demolishedDay).toBeUndefined();
    expect(gate.offsetM).toBe(old.offsetM);
    expect(fortSections(fortOf(next))).toHaveLength(2);
  });
});

describe('brána v holém valu', () => {
  it('nechátrá – Opustit nejde, Zbořit ano', () => {
    const s = built('rampart');
    const fort = fortOf(s);
    const gate = fort.gates[0]!;
    const seg = fort.segments.find((x) => x.index === gate.segment)!;
    expect(gateAbandonBlock(fort, seg)).toBe(FORT_GATE_NO_DECAY);
    expect(
      setGateAbandoned(s, DAY, { fortificationId: fort.id, segment: gate.segment }, true),
    ).toEqual({ ok: false, reason: FORT_GATE_NO_DECAY });
  });

  it('palisáda opustit jde', () => {
    const s = built();
    const fort = fortOf(s);
    const gate = fort.gates[0]!;
    const seg = fort.segments.find((x) => x.index === gate.segment)!;
    expect(gateAbandonBlock(fort, seg)).toBeNull();
  });
});
