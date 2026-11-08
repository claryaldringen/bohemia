// Opevnění pro rozhraní (fortifications.md – Rozhraní): scéna dostane tvar (obrys a pás po
// úsecích) a údaje pro panel výběru – délku, stav, brány, útočiště, násobek, průběh stavby
// a vylepšení s důvodem, proč nejdou. Vše se odvozuje z jádra (`fortification/`), nic se tu
// nepočítá znovu; tvar umí spočítat i prohlížeč (náhled při kreslení) ze stejných funkcí.

import {
  FORTIFICATIONS,
  FORT_DAYS_PER_YEAR,
  fortBandPieces,
  FORT_BUSY,
  fortSections,
  fortSegments,
  fortificationCost,
  outlineOf,
  sectionDemolition,
  segmentIsOld,
  segmentMultiplier,
  segmentState,
  segmentStands,
  villageFortifications,
  villageStock,
  woodFellingCost,
  type Construction,
  type FortBuildWork,
  type FortKind,
  type FortOutline,
  type FortSegmentShape,
  type FortTop,
  type Fortification,
  type Landscape,
  type VillageState,
} from '@bohemia/game';
import { fortSectionSpans } from './fort-sections';

/** Bod světa (x, z) v m. */
export type FortPoint = readonly [number, number];

/** Kolik bodů má oblouk rohu v obrysu (čtvrtkruh). */

/** Důvody, proč se tlačítko panelu nedá použít (bez čísla). */
export const FORT_BUSY_TEXT = 'Stavba už běží.';
export const FORT_UNFINISHED_TEXT = 'Na valu se staví až na hotovém.';
export const FORT_TOP_DONE_TEXT = 'Val už nástavbu má.';

/** Text „Chybí N klád.“ – chybějící klády stavby (zaokrouhleno nahoru). */
export function missingLogsText(missing: number): string {
  return `Chybí ${Math.ceil(missing)} klád.`;
}

/**
 * Opevnění ve scéně – jádro bez stavu dne plus hotový tvar: uzavřený obrys vnějšího okraje
 * (minimapa, zvýraznění výběru) a obdélníky pásu (výběr kliknutím). `building` – na opevnění běží
 * stavba (celý obvod zabírá místo, i nedostavěné úseky).
 */
export interface SceneFortification extends Pick<
  Fortification,
  'id' | 'points' | 'grid' | 'cells' | 'kind' | 'top' | 'segments' | 'gates' | 'rampartHeight'
> {
  building: boolean;
  outline: FortPoint[];
  band: FortPoint[][];
  /** Díl (`FortSegmentShape.index`) každého kusu `band` – stejné pořadí; chybí – neznámo. */
  bandSegments?: number[];
  /** Tvar úseků v pořadí obvodu (jádro – `fortSegments`): lomená čára křivky a délka. */
  shapes: Pick<FortSegmentShape, 'index' | 'path' | 'lengthM'>[];
  /** Poloměry rohů obvodu (jádro – `FortOutline.corners`): vnější a vnitřní roh, zmenšené. */
  corners: FortOutline['corners'];
  /** Stáří a stavba úseků ve scéně – stejné pořadí jako `shapes` (fortification-layout.ts). */
  looks: SceneFortSegment[];
  /** Co stavba na opevnění dělá (`Construction.fortWork`); chybí – nic se nestaví. */
  work?: FortBuildWork;
  /** Brány zavřené (nájezd – válka, F6); chybí – v míru otevřené. */
  gatesClosed?: true;
}

/** Úsek opevnění ve scéně: stáří (roky) a průběh jeho práce ve stavbě. */
export interface SceneFortSegment {
  /** Roky od dokončení úseku; null – úsek ještě nestojí. */
  age: number | null;
  /** Roky od dokončení nástavby valu; null – nástavba nestojí; chybí – val bez nástavby. */
  topAge?: number | null;
  /** Podíl práce úseku ve stavbě 0–1 (`Construction.fortSegments`); chybí – úsek se nestaví. */
  progress?: number;
}

/** Cena práce pro tlačítko panelu – člověkodny a klády. */
export interface FortWorkCost {
  laborManDays: number;
  logs: number;
}

/** Jedno tlačítko vylepšení v panelu: cena a důvod, proč nejde (null = jde). */
export interface FortWorkOption {
  cost: FortWorkCost;
  blocked: string | null;
}

/**
 * Zboření úseku v panelu (demolition.md – Opevnění): co se boří (`demolish` – plot, palisáda či
 * nástavba valu; `level` – srovnat val), práce a klády zpět na hromadu, nebo důvod, proč nejde.
 */
export interface FortDemolishOption {
  work: 'demolish' | 'level';
  cost: FortWorkCost;
  blocked: string | null;
}

/** Stav dílů pro panel: hotové a všechny, nejslabší, za životností a stáří nejstaršího. */
export interface FortPartsState {
  /** Díly (≈ 15 m) – hotové a všechny. */
  builtParts: number;
  parts: number;
  /** Stav nejslabšího hotového dílu 0–1 (nic hotového 1). */
  weakest: number;
  /** Díly za životností (oranžově) – stav pod 100 %. */
  oldParts: number;
  /** Stáří nejstaršího hotového dílu v celých letech; null – nic hotového. */
  ageYears: number | null;
}

/**
 * Úsek opevnění mezi branami pro panel (fortifications.md – Rozhraní, Úseky): hradba mezi okraji
 * bran (`fortSectionSpans`) – délka a stav dílů, kterých se dotkne – a zboření úseku jádra
 * (`fortSections` – díly od dílu s branou po další díl s branou).
 */
export interface VillageFortSection extends FortPartsState {
  /** Díly úseku jádra po směru hodin (zboření); první je díl s branou. */
  segments: number[];
  gateSegment: number | null;
  /** Délka hradby úseku mezi okraji bran (m). */
  lengthM: number;
  demolish: FortDemolishOption;
}

/** Brána opevnění pro panel (fortifications.md – Brány): díl, ve kterém stojí, a jeho stav. */
export interface VillageFortGate {
  /** Díl s branou (`FortGate.segment`) – podle něj se brána vybírá. */
  segment: number;
  /** Stav dílu brány 0–1; nehotový díl 1. */
  state: number;
  /** Díl brány je za životností (oranžově). */
  old: boolean;
  /** Stáří dílu brány v celých letech; null – díl ještě nestojí. */
  ageYears: number | null;
}

/** Opevnění pro panel výběru (fortifications.md – Rozhraní). */
export interface VillageFortification {
  id: number;
  /** Druh opevnění (plot, palisáda, val) – `fortKind`, aby nekolidoval s druhem výběru v panelu. */
  fortKind: FortKind;
  /** Nástavba na valu (plot / palisáda); chybí – bez nástavby. */
  top?: FortTop;
  /** Délka obvodu (m). */
  lengthM: number;
  /** Stav nejslabšího hotového úseku 0–1 (nic hotového 1). */
  weakest: number;
  /** Úseky za životností (oranžově) – stav pod 100 %. */
  oldSegments: number;
  /** Hotové a všechny úseky. */
  builtSegments: number;
  segments: number;
  /** Počet bran. */
  gates: number;
  /** Útočiště – lidé a dobytek (kusy skotu) podle plochy uvnitř (fortifications.md – Útočiště). */
  refugePeople: number;
  refugeCattle: number;
  /** Násobek obrany nejslabšího stojícího úseku (1 = žádná obrana). */
  multiplier: number;
  /** Průběh stavby 0–1 a co se staví; chybí – nic se nestaví. */
  progress?: number;
  work?: FortBuildWork;
  /** Id stavby (zrušení rozestavěného). */
  constructionId?: number;
  /** Plot na palisádu (jen plot). */
  upgrade?: FortWorkOption;
  /** Nástavby na valu (jen val): plot a palisáda. */
  tops?: { top: FortTop; option: FortWorkOption }[];
  /** Úseky mezi branami se zbořením – panel úseku ukáže vybraný úsek. */
  sections: VillageFortSection[];
  /** Brány v pořadí dílů – panel brány. */
  gateViews: VillageFortGate[];
}

/** Uzavřený obrys vnějšího okraje – lomená čára křivky po směru hodin, první bod i na konci. */
export function fortOutlinePolyline(outline: FortOutline): FortPoint[] {
  const points = outline.polyline.map(([x, z]): FortPoint => [x, z]);
  if (points.length > 0) points.push(points[0]!);
  return points;
}

/** Obrys a pás hotového tvaru `outline`. */
export function fortShape(
  outline: FortOutline,
): Pick<SceneFortification, 'outline' | 'band' | 'bandSegments'> {
  const pieces = fortBandPieces(outline);
  return {
    outline: fortOutlinePolyline(outline),
    band: pieces.map((p) => p.corners.map(([x, z]): FortPoint => [x, z])),
    bandSegments: pieces.map((p) => p.index),
  };
}

/** Roky mezi dnem dokončení a dnem `day`; null – nedokončeno. */
function yearsSince(builtDay: number | null | undefined, day: number): number | null {
  if (builtDay === null || builtDay === undefined) return null;
  return Math.max(0, day - builtDay) / FORT_DAYS_PER_YEAR;
}

/**
 * Podíl práce každého úseku stavby `c` 0–1 – práce jde napřed do kácení, pak do úseků jeden po
 * druhém (`workFortification`).
 */
export function fortSegmentProgress(
  c: Pick<Construction, 'done' | 'wood' | 'fortSegments'>,
): Map<number, number> {
  const progress = new Map<number, number>();
  let start = woodFellingCost(c.wood);
  for (const w of c.fortSegments ?? []) {
    const p = w.cost > 0 ? (c.done - start) / w.cost : c.done >= start ? 1 : 0;
    progress.set(w.index, Math.min(1, Math.max(0, p)));
    start += w.cost;
  }
  return progress;
}

/** Opevnění pro scénu z jádra: tvar obvodu `outline`, vzhled úseků a co se na něm děje. */
export function sceneFortification(
  fort: Fortification,
  outline: FortOutline,
  looks: SceneFortSegment[],
  extra: Pick<SceneFortification, 'building' | 'work' | 'gatesClosed'>,
): SceneFortification {
  const shapes = fortSegments(outline);
  return {
    id: fort.id,
    ...(fort.points ? { points: fort.points } : {}),
    ...(fort.grid !== undefined ? { grid: fort.grid } : {}),
    ...(fort.cells ? { cells: fort.cells } : {}),
    kind: fort.kind,
    ...(fort.top ? { top: fort.top } : {}),
    segments: fort.segments,
    gates: fort.gates,
    ...(fort.rampartHeight !== undefined ? { rampartHeight: fort.rampartHeight } : {}),
    ...fortShape(outline),
    shapes: shapes.map(({ index, path, lengthM }) => ({ index, path, lengthM })),
    corners: outline.corners,
    looks,
    ...extra,
  };
}

/** Opevnění vsi pro scénu ke dni `day`; opevnění s neplatnou plochou se vynechá. */
export function sceneFortifications(
  state: Pick<VillageState, 'fortifications' | 'constructions'>,
  landscape: Landscape,
  day: number,
): SceneFortification[] {
  const result: SceneFortification[] = [];
  for (const fort of villageFortifications(state)) {
    const outline = outlineOf(landscape, fort);
    if (!outline) continue;
    const site = state.constructions.find(
      (c) => c.kind === 'fortification' && c.fortificationId === fort.id,
    );
    const progress = site ? fortSegmentProgress(site) : null;
    const looks = fortSegments(outline).map((shape): SceneFortSegment => {
      const s = fort.segments.find((x) => x.index === shape.index);
      const p = progress?.get(shape.index);
      return {
        age: yearsSince(s?.builtDay, day),
        ...(s && 'topBuiltDay' in s ? { topAge: yearsSince(s.topBuiltDay, day) } : {}),
        ...(p !== undefined ? { progress: p } : {}),
      };
    });
    result.push(
      sceneFortification(fort, outline, looks, {
        building: site !== undefined,
        ...(site?.fortWork ? { work: site.fortWork } : {}),
      }),
    );
  }
  return result;
}

/** Cena práce nad úseky `indices` obvodu opevnění. */
function workCost(
  shapes: readonly FortSegmentShape[],
  indices: readonly number[],
  kind: FortKind,
  work: 'upgrade' | 'top',
): FortWorkCost {
  let laborManDays = 0;
  let logs = 0;
  for (const i of indices) {
    const cost = fortificationCost(kind, shapes[i]!.lengthM, work);
    laborManDays += cost.laborManDays;
    logs += cost.upfront.wood ?? 0;
  }
  return { laborManDays, logs };
}

/** Důvod, proč tlačítko nejde – dřevo, které chybí, nebo null. */
function woodBlocked(cost: FortWorkCost, woodSupply: number): string | null {
  const missing = Math.ceil(cost.logs - 1e-9) - woodSupply;
  return missing > 0 ? missingLogsText(missing) : null;
}

/**
 * Zboření úseku s dílem `segment` (jádro – `sectionDemolition`): cena, nebo důvod z jádra (běžící
 * stavba stejným textem jako ostatní tlačítka panelu).
 */
function demolishOption(
  state: VillageState,
  landscape: Landscape,
  fortificationId: number,
  segment: number,
): FortDemolishOption {
  const plan = sectionDemolition(state, landscape, { fortificationId, segment });
  if ('reason' in plan) {
    return {
      work: 'demolish',
      cost: { laborManDays: 0, logs: 0 },
      blocked: plan.reason === FORT_BUSY ? FORT_BUSY_TEXT : plan.reason,
    };
  }
  return {
    work: plan.work,
    cost: { laborManDays: plan.laborManDays, logs: plan.logs },
    blocked: null,
  };
}

/** Stav dílů `indices` opevnění ke dni `day` pro panel úseku. */
function partsState(fort: Fortification, indices: readonly number[], day: number): FortPartsState {
  const parts = fort.segments.filter((s) => indices.includes(s.index));
  const built = parts.filter((s) => s.builtDay !== null && s.demolishedDay === undefined);
  const oldest = Math.min(...built.map((s) => s.builtDay ?? day));
  return {
    builtParts: built.length,
    parts: parts.length,
    weakest: built.length === 0 ? 1 : Math.min(...built.map((s) => segmentState(fort, s, day))),
    oldParts: built.filter((s) => segmentIsOld(fort, s, day)).length,
    ageYears:
      built.length === 0 ? null : Math.floor(Math.max(0, day - oldest) / FORT_DAYS_PER_YEAR),
  };
}

/** Útočiště: lidé a skot podle plochy uvnitř (m² na člověka a na kus). */
export function refugePlaces(innerAreaM2: number): { people: number; cattle: number } {
  const r = FORTIFICATIONS.refuge;
  return {
    people: Math.floor(innerAreaM2 / r.m2PerPerson),
    cattle: Math.floor(innerAreaM2 / r.m2PerHead),
  };
}

/**
 * Opevnění vsi pro panel výběru (`VillageView.fortifications`): délka, stav, brány, útočiště,
 * násobek, průběh stavby a vylepšení s cenou a důvodem, proč nejdou (fortifications.md –
 * Rozhraní). Bez opevnění nic.
 */
export function fortificationViews(
  state: VillageState,
  landscape: Landscape,
  day: number,
  woodSupply: number,
): VillageFortification[] {
  const result: VillageFortification[] = [];
  for (const fort of villageFortifications(state)) {
    const outline = outlineOf(landscape, fort);
    if (!outline) continue;
    const shapes = fortSegments(outline);
    const spans = fortSectionSpans(
      shapes.map((x) => x.lengthM),
      fort.gates,
    );
    const work = state.constructions.find(
      (c) => c.kind === 'fortification' && c.fortificationId === fort.id,
    );
    const built = fort.segments.filter((s) => s.builtDay !== null);
    const standing = fort.segments.filter((s) => segmentStands(fort, s));
    const weakest =
      built.length === 0 ? 1 : Math.min(...built.map((s) => segmentState(fort, s, day)));
    const places = refugePlaces(outline.innerAreaM2);
    const view: VillageFortification = {
      id: fort.id,
      fortKind: fort.kind,
      ...(fort.top ? { top: fort.top } : {}),
      lengthM: outline.lengthM,
      weakest,
      oldSegments: built.filter((s) => segmentIsOld(fort, s, day)).length,
      builtSegments: built.length,
      segments: fort.segments.length,
      gates: fort.gates.length,
      refugePeople: places.people,
      refugeCattle: places.cattle,
      sections: fortSections(fort).map((section) => {
        const span = spans.find((x) => x.gateSegment === section.gateSegment);
        return {
          segments: [...section.segments],
          gateSegment: section.gateSegment,
          lengthM: span?.lengthM ?? 0,
          ...partsState(fort, span?.segments ?? section.segments, day),
          demolish: demolishOption(state, landscape, fort.id, section.segments[0]!),
        };
      }),
      gateViews: [...fort.gates]
        .sort((a, b) => a.segment - b.segment)
        .map((gate) => {
          const seg = fort.segments.find((x) => x.index === gate.segment);
          const stands = seg !== undefined && seg.builtDay !== null;
          return {
            segment: gate.segment,
            state: stands ? segmentState(fort, seg, day) : 1,
            old: stands && segmentIsOld(fort, seg, day),
            ageYears: stands
              ? Math.floor(Math.max(0, day - (seg.builtDay ?? day)) / FORT_DAYS_PER_YEAR)
              : null,
          };
        }),
      multiplier:
        standing.length === 0
          ? 1
          : Math.min(...standing.map((s) => segmentMultiplier(fort, s, day))),
      ...(work
        ? {
            progress: work.cost > 0 ? Math.min(1, work.done / work.cost) : 1,
            work: work.fortWork ?? 'build',
            constructionId: work.id,
          }
        : {}),
    };
    const busy = work !== undefined;
    if (fort.kind === 'fence') {
      const todo = fort.segments.filter((s) => s.kind !== 'palisade').map((s) => s.index);
      const cost = workCost(shapes, todo, 'palisade', 'upgrade');
      view.upgrade = {
        cost,
        blocked: busy ? FORT_BUSY_TEXT : woodBlocked(cost, woodSupply),
      };
    } else if (fort.kind === 'rampart') {
      const unfinished = fort.segments.some((s) => s.builtDay === null);
      const todo = fort.segments
        .filter((s) => s.topBuiltDay === undefined || s.topBuiltDay === null)
        .map((s) => s.index);
      view.tops = (['fence', 'palisade'] as const).map((top) => {
        const cost = workCost(shapes, todo, top, 'top');
        const taken = todo.length === 0 || (fort.top !== undefined && fort.top !== top);
        return {
          top,
          option: {
            cost,
            blocked: busy
              ? FORT_BUSY_TEXT
              : unfinished
                ? FORT_UNFINISHED_TEXT
                : taken
                  ? FORT_TOP_DONE_TEXT
                  : woodBlocked(cost, woodSupply),
          },
        };
      });
    }
    result.push(view);
  }
  return result;
}

/** Dřevo vsi pro cenu opevnění – klády a stromy ke kácení (`villageStock`). */
export function fortWoodSupply(
  state: VillageState,
  obstacles: Parameters<typeof villageStock>[1],
): number {
  return villageStock(state, obstacles).wood;
}
