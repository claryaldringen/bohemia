// Úsek od brány k bráně (demolition.md – Rozhodnutí; Martin 8. a 14. 11. 2026: „Když bude chtít
// hráč úsek postavit, prostě ho standardně postaví“) – běžná stavba opevnění u mezery: hledání
// mezery u kurzoru (`fortGapNear`) a náhled v editoru trasy s konci v branách: tvar nového obvodu
// z jádra (`rerouteFortification`), kontrola pásu nového úseku (`checkFortificationPlacement` jen
// na jeho dílech), cena hradby podle délky nového úseku a dřevo s kamenem. Server akci ověří znovu
// (`startSectionReroute`).

import {
  checkFortificationPlacement,
  fortificationCost,
  gateChord,
  gateGapFill,
  gateStands,
  FORTIFICATIONS,
  FORT_NO_STONE,
  fortOutlineOf,
  fortSectionSpans,
  fortSegments,
  logsFromClearedTrees,
  obstaclesOf,
  outlinePointAt,
  rerouteFortification,
  rerouteProposal,
  sectionIsGap,
  sectionOf,
  fortSections,
  segmentBand,
  wallYearReason,
  type Fortification,
  type FortKind,
  type Landscape,
  type PlacementVillage,
  type WallKind,
} from '@bohemia/game';
import type { FortEditPoint } from './fort-points';
import { missingLogsText, type FortStoneSupply } from './fort-view';
import { problemMarks } from './problem-marks';
import type { FortPointsPreview } from './scene/village-types';

/** Krok čáry nového úseku v náhledu (m). */
const LINE_STEP_M = 1.5;

/**
 * Jak blízko mezery (m) začne běžná stavba opevnění úsek od brány k bráně místo nového obvodu
 * (návrh Clauda – rozhraní, ne pravidlo hry).
 */
export const FORT_GAP_REACH_M = 40;

/** Val mezeru nezastaví – nový úsek je hradba, val se k ní doplní potom (Doplnit val). */
export const FORT_GAP_RAMPART = 'Mezeru zastaví hradba – val se k ní doplní potom.';

/**
 * Mezera u kurzoru: opevnění, díl brány na začátku úseku a návrh trasy. `gate` – otvor po zbořené
 * bráně mezi stojící hradbou (D45): `segment` je díl zbořené brány, trasa jen konce otvoru (body
 * nejdou přidat – `gateGapFill`).
 */
export interface FortGap {
  fort: Fortification;
  /** Díl brány, kterou úsek začíná (`FortSection.gateSegment`), u otvoru díl brány – pro server. */
  segment: number;
  /** Návrh trasy – okraj brány, body původní trasy a okraj druhé brány (`rerouteProposal`). */
  proposal: [number, number][];
  /** Otvor po zbořené bráně (konce otvoru, zastaví ho `fillFortificationGateGap`). */
  gate?: true;
}

/** Vzdálenost bodu od lomené čáry (m). */
function distanceToLine(
  line: readonly (readonly [number, number])[],
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/**
 * Mezera od brány k bráně nejblíž bodu `at` do `FORT_GAP_REACH_M` (demolition.md – Rozhodnutí):
 * úsek mezi branami, ve kterém nic nestojí (`sectionIsGap` – zbořený či nedostavěný). Běžná stavba
 * opevnění ji zastaví novým úsekem s konci v branách; jinak null (nový obvod). Opevnění, na kterém
 * se staví (`building`), mezeru od brány k bráně nenabídne – nový tvar by přečísloval díly
 * (`FORT_BUSY` serveru); otvor po zbořené bráně ano (stavba otvoru tvar nemění, běžící stavbu na
 * dílu brány odmítne server).
 */
export function fortGapNear(
  forts: readonly (Fortification & { readonly building?: boolean })[],
  landscape: Landscape,
  at: readonly [number, number],
): FortGap | null {
  let best: (FortGap & { d: number }) | null = null;
  for (const fort of forts) {
    // úsek jinudy přečísluje díly – na opevnění se stavbou ne; otvor po bráně tvar nemění
    for (const section of fort.building === true ? [] : fortSections(fort)) {
      if (section.gateSegment === null || !sectionIsGap(fort, landscape, section)) continue;
      const proposal = rerouteProposal(fort, landscape, section);
      if (!proposal) continue;
      const d = distanceToLine(proposal, at[0], at[1]);
      if (d > FORT_GAP_REACH_M || (best && d >= best.d)) continue;
      best = {
        fort,
        segment: section.gateSegment,
        proposal: proposal.map(([x, z]): [number, number] => [x, z]),
        d,
      };
    }
    // otvor po zbořené bráně mezi stojící hradbou – konce otvoru (D45)
    const outline = fortOutlineOf(landscape, fort);
    const shapes = outline ? fortSegments(outline) : [];
    for (const gate of fort.gates) {
      const shape = shapes[gate.segment];
      if (!outline || !shape || gateStands(gate)) continue;
      if ('reason' in gateGapFill(fort, landscape, gate.segment, null)) continue;
      const chord = gateChord(outline, shape, gate);
      const proposal: [number, number][] = [
        [chord.a[0], chord.a[1]],
        [chord.b[0], chord.b[1]],
      ];
      const d = distanceToLine(proposal, at[0], at[1]);
      if (d > FORT_GAP_REACH_M || (best && d >= best.d)) continue;
      best = { fort, segment: gate.segment, proposal, gate: true, d };
    }
  }
  if (!best) return null;
  return {
    fort: best.fort,
    segment: best.segment,
    proposal: best.proposal,
    ...(best.gate ? { gate: true as const } : {}),
  };
}

/** Co náhled otvoru po bráně potřebuje: opevnění, díl zbořené brány, druh a zásoby. */
export type FortGateGapContext = Omit<FortRerouteContext, 'day'>;

/**
 * Náhled otvoru po zbořené bráně (D45): čára po křivce mezi konci otvoru, důvod u kurzoru
 * (`gateGapFill` – hradba kolem, kusy po stranách) a cena hradby šířky brány s dřevem a kamenem.
 */
export function fortGateGapPreview(
  landscape: Landscape,
  context: FortGateGapContext,
): FortPointsPreview {
  const { fort, segment } = context;
  const outline = fortOutlineOf(landscape, fort);
  const shape = outline ? fortSegments(outline)[segment] : undefined;
  const gate = fort.gates.find((g) => g.segment === segment);
  const line: [number, number][] = [];
  if (outline && shape && gate) {
    const chord = gateChord(outline, shape, gate);
    const steps = Math.max(1, Math.ceil((chord.toM - chord.fromM) / LINE_STEP_M));
    for (let k = 0; k <= steps; k++) {
      const [x, z] = outlinePointAt(outline, chord.fromM + ((chord.toM - chord.fromM) * k) / steps);
      line.push([x, z]);
    }
  }
  const fail = (reason: string): FortPointsPreview => ({
    check: { ok: false, reason },
    label: '',
    cost: null,
    outline: [line],
    problem: [],
  });
  const check = gateGapFill(fort, landscape, segment, context.target);
  if ('reason' in check) return fail(check.reason);
  const logs = Math.max(0, Math.ceil(check.cost.logs - 1e-9));
  const missing = logs - context.woodSupply;
  if (missing > 0) return fail(missingLogsText(missing));
  const stone = context.stoneSupply ?? { m3: 0, quarry: false };
  const missingStone = stone.quarry ? 0 : check.cost.stoneM3 - stone.m3;
  if (missingStone > 1e-9) return fail(FORT_NO_STONE(missingStone));
  return {
    check: { ok: true, reason: null },
    label: '',
    cost: {
      laborManDays: check.cost.laborManDays,
      trees: 0,
      logs,
      ...(check.cost.stoneM3 > 0 ? { stoneM3: Math.ceil(check.cost.stoneM3 - 1e-9) } : {}),
    },
    outline: [line],
    problem: [],
  };
}

/** Co náhled o úseku potřebuje: opevnění (tvar a díly), díl v úseku, hradba a den. */
export interface FortRerouteContext {
  fort: Fortification;
  /** Díl ve zbořeném úseku (`sectionOf`). */
  segment: number;
  /** Druh z rozcestníku – val mezeru nezastaví (`FORT_GAP_RAMPART`). */
  target: FortKind;
  /** Dnešní herní den – rok roštové a komorové hradby. */
  day: number;
  woodSupply: number;
  stoneSupply?: FortStoneSupply;
}

/**
 * Náhled trasy `route` (konce v okrajích bran, mezi nimi body hráče): čára nového úseku po křivce
 * (neprošlý tvar – lomená čára přes body), důvod u kurzoru a cena (práce, klády, kámen).
 */
export function fortReroutePreview(
  landscape: Landscape,
  village: PlacementVillage,
  route: readonly FortEditPoint[],
  context: FortRerouteContext,
): FortPointsPreview {
  const { fort, day } = context;
  const straight = route.map(([x, z]): [number, number] => [x, z]);
  const fail = (reason: string, where?: Parameters<typeof problemMarks>[0]): FortPointsPreview => ({
    check: { ok: false, reason },
    label: '',
    cost: null,
    outline: [straight],
    problem: problemMarks(where),
  });
  if (context.target === 'rampart') return fail(FORT_GAP_RAMPART);
  const target: WallKind = context.target;
  const section = sectionOf(fort, context.segment);
  if (!section) return fail('Takové opevnění ves nemá.');
  const rerouted = rerouteFortification(
    fort,
    landscape,
    section,
    route.slice(1, -1).map(([x, z]): [number, number] => [x, z]),
    day,
  );
  if ('reason' in rerouted) return fail(rerouted.reason);
  const next = rerouted.fort;
  const outline = fortOutlineOf(landscape, next);
  if (!outline) return fail('Takové opevnění ves nemá.');
  const shapes = fortSegments(outline);
  const span = fortSectionSpans(
    shapes.map((s) => s.lengthM),
    next.gates,
  ).find((s) => s.gateSegment === rerouted.gateSegment);
  if (!span) return fail('Takové opevnění ves nemá.');
  const steps = Math.max(1, Math.ceil(span.lengthM / LINE_STEP_M));
  const line = Array.from({ length: steps + 1 }, (_, k) =>
    outlinePointAt(outline, span.fromM + (span.lengthM * k) / steps),
  ).map(([x, z]): [number, number] => [x, z]);
  const year = wallYearReason(target, day);
  if (year) return { ...fail(year), outline: [line] };
  // pás jen dílů nového úseku – mezery cílovou hradbou, díly bran svou šířkou (kus do úseku)
  const inner = sectionOf(next, rerouted.gateSegment)?.segments.slice(1) ?? [];
  const only = new Map<number, number>(inner.map((i) => [i, FORTIFICATIONS.bandM[target]]));
  for (const seg of next.segments) {
    if (seg.demolishedAfterGate !== undefined || seg.demolishedBeforeGate !== undefined) {
      if (!only.has(seg.index)) only.set(seg.index, segmentBand(next, seg).inM);
    }
  }
  const check = checkFortificationPlacement(
    landscape,
    { ...village, fortifications: (village.fortifications ?? []).filter((f) => f.id !== fort.id) },
    obstaclesOf(landscape),
    next.points ?? [],
    target,
    only,
  );
  if (!check.ok)
    return { ...fail(check.reason ?? 'Sem taková hradba nepatří.', check.where), outline: [line] };
  const cost = fortificationCost(target, span.lengthM);
  const logs = Math.max(0, Math.ceil(cost.logs - 1e-9));
  const missing = logs - context.woodSupply - logsFromClearedTrees(check.clearedTrees);
  if (missing > 0) return { ...fail(missingLogsText(missing)), outline: [line] };
  const stone = context.stoneSupply ?? { m3: 0, quarry: false };
  const missingStone = stone.quarry ? 0 : cost.stoneM3 - stone.m3;
  if (missingStone > 1e-9) return { ...fail(FORT_NO_STONE(missingStone)), outline: [line] };
  return {
    check: check.warning
      ? { ok: true, reason: null, warning: check.warning }
      : { ok: true, reason: null },
    label: '',
    cost: {
      laborManDays: cost.laborManDays,
      trees: 0,
      logs,
      ...(cost.stoneM3 > 0 ? { stoneM3: Math.ceil(cost.stoneM3 - 1e-9) } : {}),
    },
    outline: [line],
    problem: [],
  };
}
