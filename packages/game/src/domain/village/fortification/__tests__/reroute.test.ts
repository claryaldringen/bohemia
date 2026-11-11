import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import {
  addGateToFortification,
  finishFortification,
  FORT_BUSY,
  outlineCenter,
  outlineOf,
  startFortification,
  startSectionDemolition,
  villageFortifications,
} from '../state/fortifications';
import {
  contestsFortification,
  FORT_UNDER_ATTACK,
  startSectionReroute,
} from '../state/fortification-reroute';
import type { Point } from '../../placement/polygon';
import type { Construction, Fortification, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { squarePoints } from '../convert';
import { FORT_WALKWAY_NEW } from '../cost';
import { fortGaps } from '../defense';
import { outlinePointAt } from '../outline';
import {
  FORT_REROUTE_CROSSING,
  FORT_SECTION_STANDS,
  rerouteFortification,
  rerouteProposal,
  rerouteTarget,
  type FortReroute,
} from '../reroute';
import { FORT_GATE_HALF_M, fortSectionSpans } from '../section-spans';
import { sectionOf } from '../sections';
import { fortSegments, nearestOnPath } from '../segments';

// Nový úsek od brány k bráně – i jinudy (demolition.md – Rozhodnutí; Martin 8. 11. 2026). Palisáda
// se 3 branami (3 úseky), prostřední úsek zbořený a postavený jinudy – 10 m ven. Krajina 16 × 16
// políček po 15 m, hotové opevnění bez simulace stavby.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const shapesOf = (fort: Fortification) => fortSegments(outlineOf(landscape, fort)!);
const work = (s: VillageState): Construction | undefined =>
  s.constructions.find((c) => c.kind === 'fortification');

/** Dokončí stavbu opevnění (všechna práce odvedená) ke dni `day`. */
function finish(s: VillageState, day: number): void {
  const c = work(s)!;
  c.done = c.cost;
  finishFortification(s, c, day);
  s.constructions = s.constructions.filter((x) => x !== c);
}

/** Přidá bránu na díl `segment` (klik na střed dílu). */
function withGate(s: VillageState, segment: number): VillageState {
  const shape = shapesOf(fortOf(s))[segment]!;
  const r = addGateToFortification(s, landscape, fortOf(s).id, {
    x: shape.mid[0],
    z: shape.mid[1],
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/**
 * Hotová palisáda se 3 branami; díly různě staré (den a stav podle pořadí) a prostřední úsek
 * (brána 1) zbořený. Hodně klád na hromadě.
 */
function demolishedMiddle(): VillageState {
  const base = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  base.woodLogs = 20000;
  const r = startFortification(base, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, 'palisade')!,
    kind: 'palisade',
  });
  if (!r.ok) throw new Error(r.reason);
  let s = r.state;
  s.constructions = s.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of fortOf(s).segments) {
    seg.builtDay = DAY - 100 * seg.index;
    seg.state = 1 - seg.index / 100;
  }
  s.woodLogs = 20000;
  s.lastDay = DAY;
  const n = fortOf(s).segments.length;
  const first = fortOf(s).gates[0]!.segment;
  s = withGate(s, (first + Math.floor(n / 3)) % n);
  s = withGate(s, (first + Math.floor((2 * n) / 3)) % n);
  fortOf(s).gates[0]!.towerDay = DAY - 50;
  const d = startSectionDemolition(s, DAY, landscape, {
    fortificationId: fortOf(s).id,
    segment: fortOf(s).gates[1]!.segment + 1,
  });
  if (!d.ok) throw new Error(d.reason);
  finish(d.state, DAY + 1);
  return d.state;
}

/** Body trasy úseku s branou `gateSegment` posunuté od středu opevnění o `outM` (3 body). */
function routeOut(fort: Fortification, gateSegment: number, outM: number): Point[] {
  const outline = outlineOf(landscape, fort)!;
  const span = fortSectionSpans(
    shapesOf(fort).map((x) => x.lengthM),
    fort.gates,
  ).find((x) => x.gateSegment === gateSegment)!;
  const c = outlineCenter(outline);
  return [0.25, 0.5, 0.75].map((t) => {
    const [x, z] = outlinePointAt(outline, span.fromM + t * span.lengthM);
    const len = Math.sqrt((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z));
    return [x + ((x - c.x) / len) * outM, z + ((z - c.z) / len) * outM];
  });
}

function reroute(s: VillageState, points: readonly Point[]): FortReroute {
  const fort = fortOf(s);
  const r = rerouteFortification(
    fort,
    landscape,
    sectionOf(fort, fort.gates[1]!.segment)!,
    points,
    DAY + 2,
  );
  if ('reason' in r) throw new Error(r.reason);
  return r;
}

describe('úsek od brány k bráně jinudy – tvar', () => {
  it('zbořený úsek povede 10 m ven: body hráče na křivce, plocha větší, úsek delší', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const points = routeOut(old, old.gates[1]!.segment, 10);
    const { fort, gateSegment } = reroute(s, points);
    const outline = outlineOf(landscape, fort)!;
    const closed = [...outline.polyline, outline.polyline[0]!];
    for (const p of points) expect(nearestOnPath(closed, p[0], p[1]).distance).toBeLessThan(1e-6);
    expect(outline.areaM2).toBeGreaterThan(outlineOf(landscape, old)!.areaM2 + 500);
    const spanOf = (f: Fortification, gate: number) =>
      fortSectionSpans(
        shapesOf(f).map((x) => x.lengthM),
        f.gates,
      ).find((x) => x.gateSegment === gate)!;
    expect(spanOf(fort, gateSegment).lengthM).toBeGreaterThan(
      spanOf(old, old.gates[1]!.segment).lengthM + 5,
    );
    // vstup se nemění
    expect(fortOf(s)).toBe(old);
  });

  it('úseky A a C drží stav a stáří dílů, díl s branou stav svého dílu, nový úsek je mezera', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const oldShapes = shapesOf(old);
    const oldInner = new Set(sectionOf(old, old.gates[1]!.segment)!.segments.slice(1));
    const { fort, gateSegment } = reroute(s, routeOut(old, old.gates[1]!.segment, 10));
    const shapes = shapesOf(fort);
    const inner = new Set(sectionOf(fort, gateSegment)!.segments.slice(1));
    expect(inner.size).toBeGreaterThan(0);
    // díl s branou ← díl staré brány nejblíž
    const gateSegs = new Map(
      fort.gates.map((g) => {
        const near = old.gates.reduce((a, b) =>
          Math.abs(b.x - g.x) + Math.abs(b.z - g.z) < Math.abs(a.x - g.x) + Math.abs(a.z - g.z)
            ? b
            : a,
        );
        return [g.segment, near.segment];
      }),
    );
    for (const seg of fort.segments) {
      if (inner.has(seg.index)) {
        expect(seg).toEqual({ index: seg.index, builtDay: null, state: 0, demolishedDay: DAY + 2 });
        continue;
      }
      const from = gateSegs.get(seg.index);
      if (from !== undefined) {
        const was = old.segments[from]!;
        expect(seg.builtDay).toBe(was.builtDay);
        expect(seg.state).toBe(was.state);
        continue;
      }
      // střed dílu leží na starém dílu mimo úsek se stejným dnem a stavem
      const mid = shapes[seg.index]!.mid;
      const was = old.segments.find(
        (x) => x.builtDay === seg.builtDay && x.state === seg.state && !oldInner.has(x.index),
      )!;
      expect(was).toBeDefined();
      expect(nearestOnPath(oldShapes[was.index]!.path, mid[0], mid[1]).distance).toBeLessThan(0.5);
      expect(seg.demolishedDay).toBeUndefined();
    }
    // kusy dílů s branou do nového úseku jsou mezera, kusy do úseků A a C stojí
    const gateA = fort.segments[gateSegment]!;
    expect(gateA.demolishedAfterGate).toBeDefined();
    expect(gateA.demolishedBeforeGate).toBeUndefined();
    const endGate = (gateSegment + inner.size + 1) % fort.segments.length;
    expect(fort.segments[endGate]!.demolishedBeforeGate).toBeDefined();
    expect(fort.segments[endGate]!.demolishedAfterGate).toBeUndefined();
  });

  it('kus dílu brány s vlastní hradbou mimo úsek zůstane, kus do úseku se postaví znovu', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const gateSeg = old.segments[old.gates[1]!.segment]!;
    // kus před bránou patří úseku A (vlastní hradba), kus za ní staré trase zbořeného úseku
    gateSeg.beforeGate = { kind: 'fence', builtDay: DAY - 7, state: 0.9 };
    gateSeg.afterGate = { kind: 'fence', builtDay: DAY - 9, state: 0.8 };
    const { fort, gateSegment } = reroute(s, routeOut(old, old.gates[1]!.segment, 10));
    const moved = fort.segments[gateSegment]!;
    expect(moved.beforeGate).toEqual({ kind: 'fence', builtDay: DAY - 7, state: 0.9 });
    expect(moved.afterGate).toBeUndefined();
    expect(moved.demolishedAfterGate).toBeDefined();
    // díly bez brány kusy nemají
    const gates = new Set(fort.gates.map((g) => g.segment));
    for (const seg of fort.segments.filter((x) => !gates.has(x.index))) {
      expect(seg.beforeGate ?? seg.afterGate ?? seg.demolishedBeforeGate).toBeUndefined();
    }
  });

  it('brány zůstanou na místě i s věží', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const { fort } = reroute(s, routeOut(old, old.gates[1]!.segment, 10));
    expect(fort.gates).toHaveLength(3);
    for (const g of old.gates) {
      const moved = fort.gates
        .map((x) => Math.sqrt((x.x - g.x) * (x.x - g.x) + (x.z - g.z) * (x.z - g.z)))
        .reduce((a, b) => Math.min(a, b));
      expect(moved).toBeLessThanOrEqual(FORT_GATE_HALF_M + 1e-6);
    }
    expect(fort.gates.filter((g) => g.towerDay === DAY - 50)).toHaveLength(1);
  });

  it('návrh trasy: okraje bran a body úseku – po původní trase obvod skoro stejný', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const gate = old.gates[1]!.segment;
    const section = sectionOf(old, gate)!;
    const proposal = rerouteProposal(old, landscape, section)!;
    const outline = outlineOf(landscape, old)!;
    const span = fortSectionSpans(
      shapesOf(old).map((x) => x.lengthM),
      old.gates,
    ).find((x) => x.gateSegment === gate)!;
    const near = (p: Point, q: Point): number => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
    expect(near(proposal[0]!, outlinePointAt(outline, span.fromM))).toBeLessThan(1e-9);
    expect(near(proposal.at(-1)!, outlinePointAt(outline, span.fromM + span.lengthM))).toBeLessThan(
      1e-9,
    );
    expect(proposal.length).toBeGreaterThan(2);
    const { fort } = reroute(s, proposal.slice(1, -1));
    expect(Math.abs(outlineOf(landscape, fort)!.lengthM - outline.lengthM)).toBeLessThan(1);
    expect(fort.segments).toHaveLength(old.segments.length);
    // nový úsek naváže na hradbu brány: palisáda
    expect(rerouteTarget(old, gate)).toBe('palisade');
  });

  it('trasa křížící obvod – důvod', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const out = routeOut(old, old.gates[1]!.segment, 10);
    const c = outlineCenter(outlineOf(landscape, old)!);
    // prostřední bod na druhé straně opevnění – trasa přetne zbytek obvodu
    const across: Point = [2 * c.x - out[1]![0], 2 * c.z - out[1]![1]];
    const r = rerouteFortification(
      old,
      landscape,
      sectionOf(old, old.gates[1]!.segment)!,
      [out[0]!, across, out[2]!],
      DAY + 2,
    );
    expect(r).toEqual({ reason: FORT_REROUTE_CROSSING });
  });

  it('úsek, který stojí – důvod', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const r = rerouteFortification(
      old,
      landscape,
      sectionOf(old, old.gates[2]!.segment)!,
      routeOut(old, old.gates[2]!.segment, 10),
      DAY + 2,
    );
    expect(r).toEqual({ reason: FORT_SECTION_STANDS });
  });
});

describe('úsek jinudy – stavba', () => {
  it('nové díly se staví za cenu nové palisády a po dokončení stojí', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const input = {
      fortificationId: old.id,
      segment: old.gates[1]!.segment + 1,
      points: routeOut(old, old.gates[1]!.segment, 10),
      target: 'palisade' as const,
    };
    const r = startSectionReroute(s, DAY + 2, landscape, EMPTY, input);
    if (!r.ok) throw new Error(r.reason);
    const fort = fortOf(r.state);
    const c = work(r.state)!;
    expect(c).toMatchObject({ fortWork: 'upgrade', fortTarget: 'palisade' });
    // nový úsek: díly mezi branami jsou mezera, stavba je staví všechny i s kusy dílů bran
    const section = sectionOf(fort, c.fortSegments!.find((w) => w.part === undefined)!.index)!;
    const built = new Set(section.segments.slice(1));
    expect(built.size).toBeGreaterThan(0);
    for (const i of built) expect(fort.segments[i]!.demolishedDay).toBe(DAY + 2);
    expect(
      new Set(c.fortSegments!.filter((w) => w.part === undefined).map((w) => w.index)),
    ).toEqual(built);
    expect(c.fortSegments!.filter((w) => w.part !== undefined)).toHaveLength(2);
    // na opevnění se staví – druhý úsek jinudy počká
    expect(startSectionReroute(r.state, DAY + 2, landscape, EMPTY, input)).toEqual({
      ok: false,
      reason: FORT_BUSY,
    });
    finish(r.state, DAY + 30);
    const after = fortOf(r.state);
    for (const i of built) {
      expect(after.segments[i]).toMatchObject({ builtDay: DAY + 30, state: 1 });
      expect(after.segments[i]!.demolishedDay).toBeUndefined();
    }
    expect(after.segments[section.gateSegment!]!.demolishedAfterGate).toBeUndefined();
    expect(fortGaps(landscape, after, DAY + 31).filter((g) => g.kind === 'gap')).toEqual([]);
  });

  it('palisáda s ochozem ani stojící úsek jinudy nejdou', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const base = { fortificationId: old.id, points: routeOut(old, old.gates[1]!.segment, 10) };
    expect(
      startSectionReroute(s, DAY + 2, landscape, EMPTY, {
        ...base,
        segment: old.gates[1]!.segment + 1,
        target: 'walkway',
      }),
    ).toEqual({ ok: false, reason: FORT_WALKWAY_NEW });
    expect(
      startSectionReroute(s, DAY + 2, landscape, EMPTY, {
        ...base,
        segment: old.gates[2]!.segment + 1,
        target: 'palisade',
      }),
    ).toEqual({ ok: false, reason: FORT_SECTION_STANDS });
  });

  it('u hradby se bojuje – cizí vojsko dnes na mapě vsi nebo boj podle use-casu', () => {
    const s = demolishedMiddle();
    const old = fortOf(s);
    const input = {
      fortificationId: old.id,
      segment: old.gates[1]!.segment + 1,
      points: routeOut(old, old.gates[1]!.segment, 10),
      target: 'palisade' as const,
    };
    const attacked = { ...s, raidDay: DAY + 2 };
    expect(startSectionReroute(attacked, DAY + 2, landscape, EMPTY, input)).toEqual({
      ok: false,
      reason: FORT_UNDER_ATTACK,
    });
    // včerejší nájezd už nevadí
    expect(startSectionReroute(attacked, DAY + 3, landscape, EMPTY, input).ok).toBe(true);
    expect(
      startSectionReroute(s, DAY + 2, landscape, EMPTY, { ...input, contested: true }),
    ).toEqual({ ok: false, reason: FORT_UNDER_ATTACK });
    // zprávy schránky, které nesou čísla dílů nebo boj u vsi
    expect(contestsFortification({ kind: 'fortification-breach' })).toBe(true);
    expect(contestsFortification({ kind: 'raid-day' })).toBe(true);
    expect(contestsFortification({ kind: 'threat-signal' })).toBe(false);
  });
});
