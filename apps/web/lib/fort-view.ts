// Opevnění pro rozhraní (fortifications.md – Rozhraní): scéna dostane tvar (obrys a pás po
// úsecích) a údaje pro panel výběru – délku, stav, brány, útočiště, průběh stavby
// a vylepšení s důvodem, proč nejdou. Vše se odvozuje z jádra (`fortification/`), nic se tu
// nepočítá znovu; tvar umí spočítat i prohlížeč (náhled při kreslení) ze stejných funkcí.

import {
  FORTIFICATIONS,
  FORT_DAYS_PER_YEAR,
  fortBandPieces,
  FORT_BUSY,
  fortSections,
  fortSegments,
  gatePartView,
  GATE_PARTS,
  ownGatePart,
  partKey,
  sectionPieces,
  type SectionPiece,
  fortificationCost,
  layerBuilt,
  outlineOf,
  quarryNear,
  sectionDemolition,
  segmentBuilt,
  segmentIsOld,
  segmentRampart,
  segmentState,
  segmentWall,
  stoneOnHand,
  villageFortifications,
  villageStock,
  woodFellingCost,
  type Construction,
  type FortBuildWork,
  type FortKind,
  type FortOutline,
  type FortSegment,
  type FortSegmentShape,
  type FortTop,
  type Fortification,
  type Landscape,
  type ObstacleLayer,
  type VillageState,
  type WallKind,
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
  /**
   * Práce stavby, která na úseku běží (na opevnění smí běžet víc staveb, každá na svých dílech –
   * Martin 8. 11. 2026); chybí – úsek se nestaví, platí `SceneFortification.work`.
   */
  work?: FortBuildWork;
  /**
   * Vzhled kusu dílu s branou před bránou, má-li kus vlastní hradbu (`FortSegment.beforeGate`)
   * nebo vlastní stavbu; chybí – kus vypadá jako díl.
   */
  before?: SceneFortSegment;
  /** Totéž pro kus za bránou. */
  after?: SceneFortSegment;
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
  /** Stavba, která na dílech úseku běží (průběh, práce, id pro zrušení); chybí – žádná. */
  progress?: number;
  work?: FortBuildWork;
  constructionId?: number;
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
  c: Pick<Construction, 'done' | 'wood' | 'fortSegments' | 'fortWork'>,
  parts?: Map<string, number>,
): Map<number, number> {
  const progress = new Map<number, number>();
  let start = woodFellingCost(c.wood);
  for (const w of c.fortSegments ?? []) {
    const p = w.cost > 0 ? (c.done - start) / w.cost : c.done >= start ? 1 : 0;
    start += w.cost;
    // kus dílu s branou: zboření bez průběhu – zbytek dílu stojí celý (demolition.md); stavba
    // na kusu (vylepšení po okraj brány) průběh kusu do `parts`
    if (w.part !== undefined) {
      const down = c.fortWork === 'demolish' || c.fortWork === 'level';
      if (parts && !down) parts.set(partKey(w.index, w.part), Math.min(1, Math.max(0, p)));
      continue;
    }
    progress.set(w.index, Math.min(1, Math.max(0, p)));
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
    // na opevnění smí běžet víc staveb, každá na svých dílech (Martin 8. 11. 2026 – „B“)
    const sites = state.constructions.filter(
      (c) => c.kind === 'fortification' && c.fortificationId === fort.id,
    );
    const site = sites[0];
    const bySegment = new Map<number, { progress: number; work: FortBuildWork }>();
    const byPart = new Map<string, { progress: number; work: FortBuildWork }>();
    for (const c of sites) {
      const parts = new Map<string, number>();
      for (const [index, p] of fortSegmentProgress(c, parts)) {
        if (!bySegment.has(index))
          bySegment.set(index, { progress: p, work: c.fortWork ?? 'build' });
      }
      for (const [k, p] of parts) {
        if (!byPart.has(k)) byPart.set(k, { progress: p, work: c.fortWork ?? 'build' });
      }
    }
    const lookOf = (
      s: FortSegment | undefined,
      p: { progress: number; work: FortBuildWork } | undefined,
    ): SceneFortSegment => ({
      age: yearsSince(s?.builtDay, day),
      ...(s && 'topBuiltDay' in s ? { topAge: yearsSince(s.topBuiltDay, day) } : {}),
      ...(p !== undefined ? { progress: p.progress } : {}),
      ...(p !== undefined && sites.length > 1 ? { work: p.work } : {}),
    });
    const looks = fortSegments(outline).map((shape): SceneFortSegment => {
      const s = fort.segments.find((x) => x.index === shape.index);
      const look = lookOf(s, bySegment.get(shape.index));
      // kus dílu s branou s vlastní hradbou nebo stavbou – vlastní vzhled (stáří, průběh)
      for (const part of GATE_PARTS) {
        const p = byPart.get(partKey(shape.index, part));
        if (!s || (ownGatePart(s, part) === undefined && p === undefined)) continue;
        look[part] = lookOf(gatePartView(s, part), p);
      }
      return look;
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

/**
 * Cena práce nad úseky `indices` obvodu opevnění na hradbu `kind` z hradby `from` (null = hradba
 * na valu) – práce bez kácení a klády (`fortificationCost`, ceny komplet).
 */
function workCost(
  shapes: readonly FortSegmentShape[],
  indices: readonly number[],
  kind: FortKind,
  from: WallKind | null,
): FortWorkCost {
  let laborManDays = 0;
  let logs = 0;
  for (const i of indices) {
    const cost = fortificationCost(kind, shapes[i]!.lengthM, from);
    laborManDays += cost.laborManDays;
    logs += cost.logs;
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

/** Den dokončení dílu – val, bez dostavěného valu hradba; nic nestojí – null. */
function partBuiltDay(fort: Fortification, s: FortSegment): number | null {
  return segmentRampart(fort, s)?.builtDay ?? segmentWall(fort, s)?.builtDay ?? null;
}

/**
 * Stav kusů úseku ke dni `day` pro panel úseku – celé díly a z dílů s branou jen kus úseku
 * (`sectionPieces`, `gatePartView`; hradba je hradba, brána je brána).
 */
function partsState(
  fort: Fortification,
  pieces: readonly SectionPiece[],
  day: number,
): FortPartsState {
  const parts = pieces.flatMap((p) => {
    const s = fort.segments.find((x) => x.index === p.index);
    if (!s) return [];
    return [p.part === undefined ? s : gatePartView(s, p.part)];
  });
  const built = parts.filter((s) => segmentBuilt(s) && s.demolishedDay === undefined);
  const oldest = Math.min(...built.map((s) => partBuiltDay(fort, s) ?? day));
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
 * průběh stavby a vylepšení s cenou a důvodem, proč nejdou (fortifications.md – Rozhraní). Bez
 * opevnění nic.
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
    const built = fort.segments.filter((s) => segmentBuilt(s));
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
        const found = sectionPieces(
          shapes.map((x) => x.lengthM),
          fort.gates,
          section.gateSegment,
        );
        const pieces: SectionPiece[] =
          found.length > 0
            ? found
            : (span?.segments ?? section.segments).map((index) => ({ index, lengthM: 0 }));
        // stavba na kusech úseku (každý úsek zvlášť – Martin 8. 11. 2026; kus dílu s branou zvlášť)
        const own = state.constructions.find(
          (c) =>
            c.kind === 'fortification' &&
            c.fortificationId === fort.id &&
            (c.fortSegments ?? []).some((w) =>
              pieces.some(
                (p) =>
                  p.index === w.index &&
                  (p.part === undefined || w.part === undefined || p.part === w.part),
              ),
            ),
        );
        return {
          segments: [...section.segments],
          gateSegment: section.gateSegment,
          lengthM: span?.lengthM ?? 0,
          ...partsState(fort, pieces, day),
          demolish: demolishOption(state, landscape, fort.id, section.segments[0]!),
          ...(own
            ? {
                progress: own.cost > 0 ? Math.min(1, own.done / own.cost) : 1,
                work: own.fortWork ?? 'build',
                constructionId: own.id,
              }
            : {}),
        };
      }),
      gateViews: [...fort.gates]
        .sort((a, b) => a.segment - b.segment)
        .map((gate) => {
          const seg = fort.segments.find((x) => x.index === gate.segment);
          const stands = seg !== undefined && segmentBuilt(seg);
          return {
            segment: gate.segment,
            state: stands ? segmentState(fort, seg, day) : 1,
            old: stands && segmentIsOld(fort, seg, day),
            ageYears: stands
              ? Math.floor(Math.max(0, day - (partBuiltDay(fort, seg) ?? day)) / FORT_DAYS_PER_YEAR)
              : null,
          };
        }),
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
      const todo = fort.segments
        .filter((s) => segmentWall(fort, s)?.kind !== 'palisade')
        .map((s) => s.index);
      const cost = workCost(shapes, todo, 'palisade', 'fence');
      view.upgrade = {
        cost,
        blocked: busy ? FORT_BUSY_TEXT : woodBlocked(cost, woodSupply),
      };
    } else if (fort.kind === 'rampart') {
      const unfinished = fort.segments.some((s) => segmentRampart(fort, s)?.builtDay === null);
      const todo = fort.segments
        .filter((s) => !layerBuilt(segmentWall(fort, s)))
        .map((s) => s.index);
      view.tops = (['fence', 'palisade'] as const).map((top) => {
        const cost = workCost(shapes, todo, top, null);
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

/** Kámen vsi pro cenu opevnění (Hradby a obrana – Cena): m³ na hromadách a lom ve skále. */
export interface FortStoneSupply {
  m3: number;
  /** Na mapě sídla je skalní výchoz – kamene z lomu je kolik je třeba. */
  quarry: boolean;
}

/**
 * Kámen vsi pro cenu opevnění u kurzoru – hromady (`stoneOnHand`) a lom: stačí, že na mapě sídla
 * nějaký výchoz je (`quarryNear` – výchoz se neodstraňuje).
 */
export function fortStoneSupply(state: VillageState, obstacles: ObstacleLayer): FortStoneSupply {
  return { m3: stoneOnHand(state), quarry: quarryNear(obstacles, { x: 0, z: 0 }) !== null };
}
