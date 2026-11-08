import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundVillage } from '../actions';
import { DEMOLITION } from '../rules-buildings';
import { FORTIFICATIONS } from '../rules-fortifications';
import { decideFortRebuilds, rampartMaintenance } from '../fortification/decay';
import { fortGaps, segmentIsGap, segmentMultiplier } from '../fortification/defense';
import { gateChord } from '../fortification/gates';
import { outlinePointAt } from '../fortification/outline';
import { fortSectionSpans } from '../fortification/section-spans';
import { fortBlockingSegments, fortWalls, insideQuad } from '../fortification/walls';
import { squarePoints } from '../fortification/convert';
import { fortSegments } from '../fortification/segments';
import { sectionPieces } from '../fortification/section-spans';
import { sectionOf } from '../fortification/sections';
import { segmentIsOld, segmentTop } from '../fortification/life';
import { cancelConstruction } from '../cancel-construction';
import {
  addGateToFortification,
  dropFortificationWork,
  finishFortification,
  FORT_BUSY,
  FORT_SECTION_GATE_ONLY,
  FORT_SECTION_GONE,
  outlineOf,
  sectionDemolition,
  startFortification,
  startFortificationUpgrade,
  startSectionDemolition,
  villageFortifications,
  workFortification,
} from '../fortifications';
import { advanceVillage } from '../simulate';
import type { Construction, FortKind, Fortification, VillageState } from '../types';
import { woodLogs } from '../wood';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Zboření opevnění po úsecích mezi branami (demolition.md – Opevnění, Čísla). Krajina 16 × 16
// políček po 15 m, hotové opevnění bez simulace stavby (jako fortification-decay.test.ts).

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);
const YEAR = 365;

/**
 * Hotové opevnění `kind` s úseky starými `ageDays` dní; jedna brána u dvorce. Body obvodu podle
 * palisády (plot jde vylepšit – ohyby projdou i pásem palisády).
 */
function built(kind: FortKind, ageDays = 0, logs = 400): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = logs;
  const result = startFortification(s, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, kind === 'fence' ? 'palisade' : kind)!,
    kind,
  });
  if (!result.ok) throw new Error(result.reason);
  const next = result.state;
  next.woodLogs = logs;
  next.constructions = next.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(next)[0]!.segments) {
    seg.builtDay = DAY - ageDays;
    seg.state = 1;
  }
  next.lastDay = DAY;
  return next;
}

/** Val s nástavbou `top` hotovou na všech dílech. */
function toppedRampart(top: 'fence' | 'palisade' = 'fence'): VillageState {
  const s = built('rampart');
  const fort = fortOf(s);
  fort.top = top;
  for (const seg of fort.segments) seg.topBuiltDay = DAY;
  return s;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const lengths = (s: VillageState): number[] =>
  fortSegments(outlineOf(landscape, fortOf(s))!).map((x) => x.lengthM);
const work = (s: VillageState): Construction | undefined =>
  s.constructions.find((c) => c.kind === 'fortification');

/** Přidá bránu na díl `segment` (klik na střed dílu). */
function withGate(s: VillageState, segment: number): VillageState {
  const shape = fortSegments(outlineOf(landscape, fortOf(s))!)[segment]!;
  const r = addGateToFortification(s, landscape, fortOf(s).id, {
    x: shape.mid[0],
    z: shape.mid[1],
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Dokončí stavbu opevnění (všechna práce odvedená) a vrátí událost kroniky. */
function finish(s: VillageState): ReturnType<typeof finishFortification> {
  const c = work(s)!;
  c.done = c.cost;
  const event = finishFortification(s, c, DAY + 10);
  s.constructions = s.constructions.filter((x) => x !== c);
  return event;
}

/** Opevnění se 3 branami (díl 0 brána u dvorce + dvě další) – 3 úseky. */
function threeSections(kind: FortKind): VillageState {
  let s = built(kind);
  const n = fortOf(s).segments.length;
  const first = fortOf(s).gates[0]!.segment;
  s = withGate(s, (first + Math.floor(n / 3)) % n);
  s = withGate(s, (first + Math.floor((2 * n) / 3)) % n);
  return s;
}

describe('zboření plotu a palisády', () => {
  it('palisáda – úsek bez dílu s branou, cena podle pravidla, po dokončení mezera a klády', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const section = sectionOf(fort, gateSeg + 1)!;
    expect(section.gateSegment).toBe(gateSeg);
    const len = lengths(s);
    // celé díly mezi branami a kusy dílů bran u okraje brány (přesně zvýrazněná hradba)
    const pieces = sectionPieces(len, fort.gates, gateSeg);
    const full = pieces.filter((x) => x.part === undefined).map((x) => x.index);
    const parts = pieces.map((x) => x.index);
    expect(pieces[0]).toMatchObject({ index: gateSeg, part: 'after' });
    expect(pieces.at(-1)).toMatchObject({ index: fort.gates[2]!.segment, part: 'before' });
    // díl s poloviční palisádou (shnilá) vrátí polovinu klád
    fort.segments[full[0]!]!.state = 0.5;
    const per = FORTIFICATIONS.costPer100M.palisade;
    const labor = pieces.reduce(
      (sum, x) => sum + DEMOLITION.laborShare * per.laborManDays * (x.lengthM / 100),
      0,
    );
    const logs = Math.floor(
      pieces.reduce(
        (sum, x) =>
          sum + DEMOLITION.logShare * per.wood * (x.lengthM / 100) * fort.segments[x.index]!.state,
        0,
      ) + 1e-9,
    );
    const input = { fortificationId: fort.id, segment: gateSeg + 1 };
    const preview = sectionDemolition(s, landscape, input);
    expect(preview).toEqual({ work: 'demolish', laborManDays: expect.any(Number), logs });
    expect('laborManDays' in preview && preview.laborManDays).toBeCloseTo(labor, 9);

    const r = startSectionDemolition(s, DAY, landscape, input);
    if (!r.ok) throw new Error(r.reason);
    expect(fortOf(s).segments.every((x) => x.demolishedDay === undefined)).toBe(true);
    const c = work(r.state)!;
    expect(c.fortWork).toBe('demolish');
    expect(c.fortSegments!.map((w) => w.index)).toEqual(parts);
    expect(c.cost).toBeCloseTo(labor, 9);
    expect(c.wood).toBeUndefined();

    const before = woodLogs(r.state);
    const event = finish(r.state);
    expect(event).toMatchObject({ kind: 'fortification-demolished', logs });
    expect(woodLogs(r.state) - before).toBe(logs);
    const after = fortOf(r.state);
    for (const seg of after.segments) {
      if (full.includes(seg.index))
        expect(seg).toMatchObject({ demolishedDay: DAY + 10, state: 0 });
      else expect(seg.demolishedDay).toBeUndefined();
    }
    // díl brány drží bránu a zbytek dílu, zbořená je jen hradba úseku od okraje brány
    const lastGate = fort.gates[2]!.segment;
    expect(after.segments[gateSeg]).toMatchObject({ demolishedAfterGate: DAY + 10, state: 1 });
    expect(after.segments[gateSeg]!.demolishedBeforeGate).toBeUndefined();
    expect(after.segments[lastGate]).toMatchObject({ demolishedBeforeGate: DAY + 10, state: 1 });
    expect(after.segments[lastGate]!.demolishedAfterGate).toBeUndefined();
    // zbořený díl je mezera: nebrání, neblokuje cesty, obrana ho počítá jako průchod
    const blocking = new Set(fortBlockingSegments(after, null).map((x) => x.index));
    for (const i of full) {
      expect(blocking.has(i)).toBe(false);
      expect(segmentIsGap(after, after.segments[i]!, DAY + 11)).toBe(true);
      expect(segmentMultiplier(after, after.segments[i]!, DAY + 11)).toBe(1);
    }
    expect(blocking.has(gateSeg)).toBe(true);
    const gaps = fortGaps(landscape, after, DAY + 11).filter((g) => g.kind === 'gap');
    expect(gaps.map((g) => g.segment).sort((a, b) => a - b)).toEqual(
      [...parts].sort((a, b) => a - b),
    );
    // mezera u brány má délku zbořeného kusu dílu
    const bit = gaps.find((g) => g.segment === gateSeg)!;
    expect(bit.widthM).toBeCloseTo(pieces[0]!.lengthM, 1);
    // druhé Zbořit: úsek už je zbořený
    expect(sectionDemolition(r.state, landscape, input)).toEqual({ reason: FORT_SECTION_GONE });
  });

  it('dožilá palisáda – obyvatelé zbořený díl nepřestaví, vylepšení ho vynechá', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    finish(r.state);
    const gone = new Set(
      fortOf(r.state)
        .segments.filter((x) => x.demolishedDay !== undefined)
        .map((x) => x.index),
    );
    expect(gone.size).toBeGreaterThan(0);
    for (const seg of fortOf(r.state).segments) seg.builtDay = DAY - 20 * YEAR;
    const started = decideFortRebuilds(r.state, DAY + 20, landscape, EMPTY);
    expect(started).toHaveLength(1);
    for (const w of started[0]!.fortSegments!) expect(gone.has(w.index)).toBe(false);
    // zbořený díl nechátrá dál (stav 0 drží)
    for (const i of gone) expect(fortOf(r.state).segments[i]!.state).toBe(0);
  });

  it('plot – vylepšení na palisádu zbořený díl vynechá a po dokončení je opevnění palisáda', () => {
    const s = threeSections('fence');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    finish(r.state);
    const gone = fortOf(r.state)
      .segments.filter((x) => x.demolishedDay !== undefined)
      .map((x) => x.index);
    const up = startFortificationUpgrade(r.state, DAY + 20, landscape, EMPTY, {
      fortificationId: fort.id,
      work: 'upgrade',
    });
    if (!up.ok) throw new Error(up.reason);
    const c = work(up.state)!;
    for (const i of gone) expect(c.fortSegments!.some((w) => w.index === i)).toBe(false);
    finish(up.state);
    expect(fortOf(up.state).kind).toBe('palisade');
    for (const i of gone) expect(fortOf(up.state).segments[i]!.demolishedDay).toBeDefined();
  });

  it('obvod bez brány je jeden úsek – zbořený celý opevnění zmizí', () => {
    const s = built('fence');
    fortOf(s).gates = [];
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fortOf(s).id,
      segment: 2,
    });
    if (!r.ok) throw new Error(r.reason);
    expect(work(r.state)!.fortSegments).toHaveLength(fortOf(s).segments.length);
    const before = woodLogs(r.state);
    const event = finish(r.state);
    expect(villageFortifications(r.state)).toHaveLength(0);
    expect(event && 'logs' in event ? event.logs : -1).toBe(woodLogs(r.state) - before);
  });
});

describe('zboření valu', () => {
  it('val s plotem: 1. Zbořit jen nástavbu, 2. Zbořit srovná val (čtvrtina práce, bez klád)', () => {
    let s = toppedRampart('fence');
    const fort = fortOf(s);
    const gateSeg = fort.gates[0]!.segment;
    const n = fort.segments.length;
    const input = { fortificationId: fort.id, segment: (gateSeg + 2) % n };
    const len = lengths(s);
    const pieces = sectionPieces(len, fort.gates, gateSeg);
    // nástavbu zbourají celé díly, kusy dílu brány se srovnají až se valem
    const parts = pieces.filter((x) => x.part === undefined).map((x) => x.index);
    const first = sectionDemolition(s, landscape, input);
    const fence = FORTIFICATIONS.costPer100M.fence;
    expect(first).toMatchObject({
      work: 'demolish',
      logs: Math.floor(
        parts.reduce((sum, i) => sum + DEMOLITION.logShare * fence.wood * (len[i]! / 100), 0) +
          1e-9,
      ),
    });
    let r = startSectionDemolition(s, DAY, landscape, input);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    expect(work(s)!.cost).toBeCloseTo(
      parts.reduce(
        (sum, i) => sum + DEMOLITION.laborShare * fence.laborManDays * (len[i]! / 100),
        0,
      ),
      9,
    );
    finish(s);
    let after = fortOf(s);
    expect(after.top).toBe('fence');
    for (const i of parts) {
      const seg = after.segments[i]!;
      expect(seg).toMatchObject({ top: 'none', state: 1 });
      expect(seg.demolishedDay).toBeUndefined();
      expect(seg.topBuiltDay).toBeUndefined();
      expect(segmentTop(after, seg)).toBeNull();
      // val bez nástavby: násobek jen podle výšky, nestárne
      expect(segmentMultiplier(after, seg, DAY + 11)).toBe(1 + FORTIFICATIONS.rampartHeightBonus);
      expect(segmentIsOld(after, seg, DAY + 100 * YEAR)).toBe(false);
    }
    // díl s branou nástavbu drží
    expect(segmentTop(after, after.segments[gateSeg]!)).toBe('fence');

    const second = sectionDemolition(s, landscape, input);
    const rampart = FORTIFICATIONS.costPer100M.rampart;
    const level = pieces.reduce(
      (sum, x) => sum + DEMOLITION.rampartLaborShare * rampart.laborManDays * (x.lengthM / 100),
      0,
    );
    expect(second).toMatchObject({ work: 'level', logs: 0 });
    expect('laborManDays' in second && second.laborManDays).toBeCloseTo(level, 9);
    r = startSectionDemolition(s, DAY + 11, landscape, input);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    const before = woodLogs(s);
    expect(finish(s)).toEqual({
      day: DAY + 10,
      kind: 'fortification-demolished',
      logs: 0,
      level: true,
    });
    expect(woodLogs(s)).toBe(before);
    after = fortOf(s);
    for (const i of parts) {
      expect(after.segments[i]!.demolishedDay).toBe(DAY + 10);
      expect(segmentIsGap(after, after.segments[i]!, DAY + 11)).toBe(true);
    }
    // jediná brána: její díl má zbořený kus před bránou i za ní
    expect(after.segments[gateSeg]).toMatchObject({
      demolishedBeforeGate: DAY + 10,
      demolishedAfterGate: DAY + 10,
    });
    // srovnaný val se neudržuje – jen díl s branou
    const need = rampartMaintenance(structuredClone(s), 1000, landscape);
    expect(need).toBeCloseTo(((len[gateSeg]! / 100) * 2) / YEAR, 9);
    expect(sectionDemolition(s, landscape, input)).toEqual({ reason: FORT_SECTION_GONE });
  });

  it('val, kde už žádná nástavba nestojí, je val bez nástavby', () => {
    const s = toppedRampart('palisade');
    const fort = fortOf(s);
    fort.gates = [];
    const r = startSectionDemolition(s, DAY, landscape, { fortificationId: fort.id, segment: 0 });
    if (!r.ok) throw new Error(r.reason);
    finish(r.state);
    const after = fortOf(r.state);
    expect(after.top).toBeUndefined();
    for (const seg of after.segments) {
      expect(seg.top).toBeUndefined();
      expect(seg.topBuiltDay).toBeUndefined();
    }
  });
});

describe('stavba zboření', () => {
  it('na opevnění běží jen jedna stavba; úsek jen s branou nejde zbořit', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    expect(
      startSectionDemolition(r.state, DAY, landscape, {
        fortificationId: fort.id,
        segment: fort.gates[2]!.segment,
      }),
    ).toEqual({ ok: false, reason: FORT_BUSY });
    // brána hned za branou: úsek jen z kusů dílů bran, od okraje po okraj brány
    const adjacent = withGate(s, (gateSeg + 1) % fort.segments.length);
    const between = sectionDemolition(adjacent, landscape, {
      fortificationId: fort.id,
      segment: gateSeg,
    });
    expect(between).toMatchObject({ work: 'demolish' });
    const next = fortOf(adjacent).gates.find(
      (g) => g.segment === (gateSeg + 1) % lengths(s).length,
    )!;
    const gate = fortOf(adjacent).gates.find((g) => g.segment === gateSeg)!;
    // brány na sobě – mezi okraji není co zbořit
    gate.offsetM = lengths(s)[gateSeg]!;
    next.offsetM = 0;
    expect(
      sectionDemolition(adjacent, landscape, { fortificationId: fort.id, segment: gateSeg }),
    ).toEqual({ reason: FORT_SECTION_GATE_ONLY });
  });

  it('brána přidaná během zboření úsek rozdělí, práce pokračuje po dílech, které měla', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    const planned = work(r.state)!.fortSegments!.map((w) => w.index);
    // první a poslední kus jsou části dílů bran, celé díly jsou mezi nimi
    const inner = planned.slice(1, -1);
    expect(inner.length).toBeGreaterThan(2);
    const split = withGate(r.state, inner[1]!);
    expect(fortOf(split).gates).toHaveLength(4);
    expect(work(split)!.fortSegments!.map((w) => w.index)).toEqual(planned);
    finish(split);
    const gone = fortOf(split)
      .segments.filter((x) => x.demolishedDay !== undefined)
      .map((x) => x.index);
    expect(gone).toEqual([...inner].sort((a, b) => a - b));
  });

  it('zrušené zboření: zbořené díly zůstanou a jejich klády přijdou na hromadu', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    const c = work(r.state)!;
    // první kus je část dílu brány, druhý a třetí jsou celé díly
    const [first, a, b] = c.fortSegments!;
    expect(first!.part).toBe('after');
    // práce došla přes konec prvního kusu a celého dílu
    c.done = first!.cost + a!.cost + b!.cost / 2;
    workFortification(r.state, c, DAY + 3);
    expect(fortOf(r.state).segments[first!.index]!.demolishedAfterGate).toBe(DAY + 3);
    expect(fortOf(r.state).segments[a!.index]!.demolishedDay).toBe(DAY + 3);
    expect(fortOf(r.state).segments[b!.index]!.demolishedDay).toBeUndefined();
    const before = woodLogs(r.state);
    const cancelled = cancelConstruction(r.state, r.state.lastDay, c.id);
    expect(woodLogs(cancelled) - before).toBe(Math.floor(first!.logs! + a!.logs! + 1e-9));
    expect(fortOf(cancelled).segments[a!.index]!.demolishedDay).toBe(DAY + 3);
    expect(fortOf(cancelled).segments[b!.index]!.demolishedDay).toBeUndefined();
    expect(work(cancelled)).toBeUndefined();
    // dropFortificationWork sám bez dokončených dílů nic nezboří
    const fresh = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg + 1,
    });
    if (!fresh.ok) throw new Error(fresh.reason);
    dropFortificationWork(fresh.state, work(fresh.state)!);
    expect(fortOf(fresh.state).segments.every((x) => x.demolishedDay === undefined)).toBe(true);
  });

  it('simulace: zboření ze společné práce, kronika „fortification-demolished“, po kouscích stejně', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: fort.gates[1]!.segment + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    let whole = structuredClone(r.state);
    for (let i = 0; i < 40 && work(whole); i++) {
      whole = advanceVillage(whole, whole.lastDay + 5, EMPTY, landscape);
    }
    expect(work(whole)).toBeUndefined();
    const event = whole.chronicle.find((e) => e.kind === 'fortification-demolished');
    expect(event).toBeDefined();
    expect(whole.chronicle.some((e) => e.kind === 'construction-finished')).toBe(false);
    const end = whole.lastDay;
    let pieces = structuredClone(r.state);
    while (pieces.lastDay < end) {
      pieces = advanceVillage(pieces, Math.min(end, pieces.lastDay + 3), EMPTY, landscape);
    }
    const direct = advanceVillage(structuredClone(r.state), end, EMPTY, landscape);
    expect(JSON.stringify(pieces.fortifications)).toBe(JSON.stringify(direct.fortifications));
    expect(woodLogs(pieces)).toBe(woodLogs(direct));
    // kusy dílů bran jsou zbořené v obou případech
    const gone = fortOf(direct).segments.filter(
      (x) => x.demolishedBeforeGate !== undefined || x.demolishedAfterGate !== undefined,
    );
    expect(gone.map((x) => x.index)).toEqual([fort.gates[1]!.segment, fort.gates[2]!.segment]);
  });
});

describe('zboření přesně zvýrazněné hradby (od okraje brány po okraj brány)', () => {
  it('délky zbořených kusů dají přesně délku zvýrazněného úseku', () => {
    for (const s of [threeSections('palisade'), threeSections('fence'), built('palisade')]) {
      const fort = fortOf(s);
      const len = lengths(s);
      const spans = fortSectionSpans(len, fort.gates);
      expect(spans.length).toBeGreaterThan(0);
      for (const span of spans) {
        const pieces = sectionPieces(len, fort.gates, span.gateSegment);
        const sum = pieces.reduce((a, x) => a + x.lengthM, 0);
        expect(sum).toBeCloseTo(span.lengthM, 6);
      }
    }
  });

  it('zbořený kus dílu brány je průchozí mezera, brána a zbytek dílu blokují', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    const gateSeg = fort.gates[1]!.segment;
    const r = startSectionDemolition(s, DAY, landscape, {
      fortificationId: fort.id,
      segment: gateSeg,
    });
    if (!r.ok) throw new Error(r.reason);
    const before = fortWalls(landscape, fortOf(r.state), null);
    finish(r.state);
    const after = fortOf(r.state);
    const walls = fortWalls(landscape, after, null);
    expect(walls.walls.length).toBeLessThan(before.walls.length);
    const outline = outlineOf(landscape, after)!;
    const shape = fortSegments(outline)[gateSeg]!;
    const chord = gateChord(
      outline,
      shape,
      after.gates.find((g) => g.segment === gateSeg)!,
    );
    const blocked = (m: number): boolean => {
      const [x, z] = outlinePointAt(outline, m);
      return walls.walls.some((w) => insideQuad(w, x, z));
    };
    // za bránou (v úseku) mezera, před bránou (v sousedním úseku) hradba stojí
    expect(blocked((chord.toM + shape.startM + shape.lengthM) / 2)).toBe(false);
    expect(blocked((shape.startM + chord.fromM) / 2)).toBe(true);
    // brána je otvor ve stěně
    expect(walls.gates.length).toBeGreaterThan(0);
    // obrana: mezera vedle brány je průchod
    const bit = fortGaps(landscape, after, DAY + 11).find(
      (g) => g.segment === gateSeg && g.kind === 'gap',
    );
    expect(bit).toBeDefined();
  });

  it('starší opevnění beze zboření kusů dílů má stěny jako dřív', () => {
    const s = threeSections('palisade');
    const fort = fortOf(s);
    expect(
      fort.segments.every(
        (x) => x.demolishedBeforeGate === undefined && x.demolishedAfterGate === undefined,
      ),
    ).toBe(true);
    expect(fortBlockingSegments(fort, null).every((x) => x.gone === undefined)).toBe(true);
  });
});
