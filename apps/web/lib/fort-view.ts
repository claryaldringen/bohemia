// Opevnění pro rozhraní (fortifications.md – Rozhraní): scéna dostane tvar (obrys a pás po
// úsecích) a údaje pro panel výběru – délku, stav, brány, útočiště, násobek, průběh stavby
// a vylepšení s důvodem, proč nejdou. Vše se odvozuje z jádra (`fortification/`), nic se tu
// nepočítá znovu; tvar umí spočítat i prohlížeč (náhled při kreslení) ze stejných funkcí.

import {
  FORTIFICATIONS,
  fortBandPieces,
  fortSegments,
  fortificationCost,
  outlineOf,
  segmentIsOld,
  segmentMultiplier,
  segmentState,
  segmentStands,
  villageFortifications,
  villageStock,
  type FortBuildWork,
  type FortKind,
  type FortOutline,
  type FortSegmentShape,
  type FortTop,
  type Fortification,
  type Landscape,
  type VillageState,
} from '@bohemia/game';

/** Bod světa (x, z) v m. */
export type FortPoint = readonly [number, number];

/** Kolik bodů má oblouk rohu v obrysu (čtvrtkruh). */
const ARC_POINTS = 6;

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
  'id' | 'grid' | 'cells' | 'kind' | 'top' | 'segments' | 'gates'
> {
  building: boolean;
  outline: FortPoint[];
  band: FortPoint[][];
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
}

/** Uzavřený obrys vnějšího okraje – body rovných kusů a oblouků po směru hodin. */
export function fortOutlinePolyline(shapes: readonly FortSegmentShape[]): FortPoint[] {
  const points: FortPoint[] = [];
  for (const s of shapes) {
    points.push([s.line.x, s.line.z]);
    points.push([s.line.x + s.line.dx * s.line.length, s.line.z + s.line.dz * s.line.length]);
    const a = s.arc;
    if (!a) continue;
    for (let i = 1; i <= ARC_POINTS; i++) {
      const t = (i / ARC_POINTS) * (Math.PI / 2);
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      points.push([a.x + a.r * (a.ux * cos + a.vx * sin), a.z + a.r * (a.uz * cos + a.vz * sin)]);
    }
  }
  if (points.length > 0) points.push(points[0]!);
  return points;
}

/** Obrys a pás hotového tvaru `outline`. */
export function fortShape(outline: FortOutline): Pick<SceneFortification, 'outline' | 'band'> {
  return {
    outline: fortOutlinePolyline(fortSegments(outline)),
    band: fortBandPieces(outline).map((p) => p.corners.map(([x, z]): FortPoint => [x, z])),
  };
}

/** Opevnění vsi pro scénu; opevnění s neplatnou plochou se vynechá. */
export function sceneFortifications(
  state: Pick<VillageState, 'fortifications' | 'constructions'>,
  landscape: Landscape,
): SceneFortification[] {
  const result: SceneFortification[] = [];
  for (const fort of villageFortifications(state)) {
    const outline = outlineOf(landscape, fort);
    if (!outline) continue;
    result.push({
      id: fort.id,
      grid: fort.grid,
      cells: fort.cells,
      kind: fort.kind,
      ...(fort.top ? { top: fort.top } : {}),
      segments: fort.segments,
      gates: fort.gates,
      building: state.constructions.some(
        (c) => c.kind === 'fortification' && c.fortificationId === fort.id,
      ),
      ...fortShape(outline),
    });
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
