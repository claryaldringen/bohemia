// Opevnění pro rozhraní (fortifications.md – Rozhraní): scéna dostane tvar (obrys a pás po
// úsecích) a údaje pro panel výběru – délku, stav, brány, útočiště, průběh stavby
// a vylepšení s důvodem, proč nejdou. Vše se odvozuje z jádra (`fortification/`), nic se tu
// nepočítá znovu; tvar umí spočítat i prohlížeč (náhled při kreslení) ze stejných funkcí.

import {
  assaultHours,
  assaultSteps,
  crossingLayers,
  fortDefenders,
  fortOccupancy,
  FORT_MOAT_DONE,
  FORT_MOAT_NO_RAMPART,
  FORT_PINCER_DONE,
  FORT_RAMPART_DONE,
  FORT_TOWER_DONE,
  gateAbandonBlock,
  gateDemolition,
  gateUpgrade,
  obstaclesOf,
  sectionUpgrades,
  startGateUpgrade,
  startMoatFill,
  startRampartAddition,
  villageRoadWalk,
  type AssaultMethod,
  type GateLevel,
  type ObstacleLayer,
  FORTIFICATIONS,
  FORT_DAYS_PER_YEAR,
  fortBandPieces,
  FORT_BUSY,
  fortBlockingSegments,
  fortSections,
  gatePincerStands,
  gateTowerStands,
  pincerAlley,
  pincerArmKind,
  fortSegments,
  gatePartView,
  GATE_PARTS,
  ownGatePart,
  partKey,
  sectionPieces,
  type SectionPiece,
  outlineOf,
  sectionDemolition,
  segmentBuilt,
  segmentIsOld,
  segmentRampart,
  segmentState,
  segmentWall,
  stoneOnHand,
  villageQuarries,
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
  type FortUpgradeOption,
  type Fortification,
  type Landscape,
  type VillageState,
  type WallKind,
} from '@bohemia/game';
import { fortSectionSpans } from './fort-sections';

/** Bod světa (x, z) v m. */
export type FortPoint = readonly [number, number];

/** Kolik bodů má oblouk rohu v obrysu (čtvrtkruh). */

/** Důvody, proč se tlačítko panelu nedá použít (bez čísla). */
export const FORT_BUSY_TEXT = 'Stavba už běží.';

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
  /**
   * Id staveb, které na opevnění běží – nosiči kamene z lomu (podíl `quarry` nese id stavby)
   * podle nich najdou, ke které hradbě kámen nosí; chybí – nic se nestaví.
   */
  constructions?: number[];
  /** Brány zavřené (nájezd – válka, F6); chybí – v míru otevřené. */
  gatesClosed?: true;
  /**
   * Klešťová brána a věž – stejné pořadí jako `gates` (`sceneFortGates`); chybí – žádná brána
   * vylepšení nemá.
   */
  gateLooks?: SceneFortGate[];
  /**
   * Zasypávané kusy vodního příkopu v boji (scene/army.ts – `battleFortifications`): pruh od
   * zasypávajících k hradbě a podíl zasypání 0–1; chybí – žádný.
   */
  moatFills?: readonly {
    from: { x: number; z: number };
    to: { x: number; z: number };
    share: number;
  }[];
}

/**
 * Vylepšení brány ve scéně (fortifications.md – Hradby a obrana, Brány; plán hradeb Úloha 18).
 * Geometrie z jádra (`pincerAlley`), scéna z ní rozmístí ramena, vrata a věž.
 */
export interface SceneFortGate {
  /**
   * Klešťová brána: ulička mezi rameny (`pincerAlley` – čtyřúhelník od vnitřního okraje pásu `inM`
   * dovnitř: dva body u pásu, pak dva na vnitřním konci), druh ramen (`pincerArmKind`), stáří
   * (roky; null – staví se) a průběh stavby 0–1.
   */
  pincer?: {
    alley: FortPoint[];
    inM: number;
    kind: WallKind;
    age: number | null;
    progress?: number;
  };
  /** Stojící věž nad vraty – stáří v letech (i navíc za nedodělanou údržbu). */
  tower?: { age: number };
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
  /** Kámen předem (m³); chybí – bez kamene. */
  stoneM3?: number;
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

/** Ikona postupu útočníka v panelu (fortifications.md – Rozhraní a scéna): žebřík, sekera, oheň, rýč. */
export type FortAssaultIcon = 'ladder' | 'cut' | 'burn' | 'dig';

/** Pořadí ikon postupů v panelu. */
export const FORT_ASSAULT_ICONS: readonly FortAssaultIcon[] = ['ladder', 'cut', 'burn', 'dig'];

/**
 * Postup útočníka přes úsek či bránu (Přechod hradby): nejrychlejší místo se 4 muži v herních
 * hodinách (otepi do 100 m – návrh Clauda); `method` – postup jádra pod ikonou (žebřík či
 * přelezení plotu, odkopání či podkop); null – postup tu nejde (ikona zašedlá).
 */
export interface FortAssaultView {
  icon: FortAssaultIcon;
  method: AssaultMethod | null;
  hours4: number | null;
}

/**
 * Obsazení hradby (Hradby a obrana – Správce, obsazenost): muži 16–44 let (`fortDefenders`) na délku
 * obvodu a podíl obsazených 5 m ochozu (`fortOccupancy`, nejvýš 1).
 */
export interface FortOccupancyView {
  men: number;
  lengthM: number;
  share: number;
}

/** Vylepšení na hradbu `target` v nabídce Vylepšit – cena a důvod, proč nejde. */
export interface FortUpgradeView {
  target: WallKind;
  option: FortWorkOption;
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
  /** Nabídka Vylepšit – vyšší stupně úseku (`sectionUpgrades`). */
  upgrades: FortUpgradeView[];
  /** Postupy útočníka přes úsek (ikony v pořadí `FORT_ASSAULT_ICONS`). */
  assault: FortAssaultView[];
  /** Doplnit val s příkopem pod hradbu úseku; null – úsek val už má. */
  rampartAdd: FortWorkOption | null;
  /** Napustit příkop úseku; null – úsek nemá val, nebo je příkop napuštěný. */
  moat: FortWorkOption | null;
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
  /** Klešťová brána (Hradby a obrana – Brány); null – brána už je klešťová. */
  pincer: FortWorkOption | null;
  /** Věž nad branou; null – brána věž už má. */
  tower: FortWorkOption | null;
  /** Postupy útočníka přes bránu. */
  assault: FortAssaultView[];
  /** Opuštěná brána (demolition.md – Rozhodnutí) – v panelu Vrátit místo Opustit. */
  abandoned: boolean;
  /** Proč bránu nejde opustit ani vrátit (díl brány nestojí); null – jde. */
  abandonBlocked: string | null;
  /** Zboření brány: práce a klády zpět na hromadu, nebo důvod, proč nejde. */
  demolish: FortDemolishOption;
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
  /** „Vylepšit vše“ – vyšší stupně všech úseků (`sectionUpgrades` bez úseku). */
  upgrades: FortUpgradeView[];
  /** Doplnit val pod celé opevnění; null – val už mají všechny úseky. */
  rampartAdd: FortWorkOption | null;
  /** Obsazení hradby muži vsi. */
  occupancy: FortOccupancyView;
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

/**
 * Klešťové brány a věže opevnění ke dni `day` (`SceneFortification.gateLooks`): ulička z jádra
 * (`pincerAlley` od vnitřního okraje pásu blokujícího dílu – jako stěny a místo za branou),
 * průběh rozestavěné brány či věže z `progress` (díl brány, úroveň). Bez vylepšení undefined.
 */
export function sceneFortGates(
  fort: Fortification,
  outline: FortOutline,
  day: number,
  progress: (segment: number, level: 'pincer' | 'tower') => number | undefined = () => undefined,
): SceneFortGate[] | undefined {
  if (!fort.gates.some((g) => g.pincerDay !== undefined || g.towerDay != null)) return undefined;
  const shapes = fortSegments(outline);
  const blocking = fortBlockingSegments(fort, null);
  return fort.gates.map((gate): SceneFortGate => {
    const look: SceneFortGate = {};
    const shape = shapes[gate.segment];
    const block = blocking.find((s) => s.index === gate.segment);
    const seg = fort.segments.find((s) => s.index === gate.segment);
    if (gate.pincerDay !== undefined && shape && block && seg) {
      const inM = block.outside?.inM ?? FORTIFICATIONS.bandM[block.kind];
      const alley = pincerAlley(outline, shape, gate, inM);
      const p = progress(gate.segment, 'pincer');
      if (alley)
        look.pincer = {
          alley: alley.map(([x, z]): FortPoint => [x, z]),
          inM,
          kind: pincerArmKind(segmentWall(fort, seg)?.kind ?? 'palisade'),
          age: gatePincerStands(gate, day) ? yearsSince(gate.pincerDay, day) : null,
          ...(p !== undefined ? { progress: p } : {}),
        };
    }
    if (gate.towerDay != null && gateTowerStands(gate, day))
      look.tower = {
        age: (day - gate.towerDay + (gate.towerExtraAgeDays ?? 0)) / FORT_DAYS_PER_YEAR,
      };
    return look;
  });
}

/** Opevnění pro scénu z jádra: tvar obvodu `outline`, vzhled úseků a co se na něm děje. */
export function sceneFortification(
  fort: Fortification,
  outline: FortOutline,
  looks: SceneFortSegment[],
  extra: Pick<
    SceneFortification,
    'building' | 'work' | 'constructions' | 'gatesClosed' | 'gateLooks'
  >,
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
      // zboření brány nebourá díl – hradba dílu stojí, brána zmizí až s koncem stavby
      if (c.fortGate?.level === 'demolish') continue;
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
    // rozestavěná klešťová brána či věž – průběh dílu brány (`Construction.fortGate`)
    const gateWork = new Map<string, number>();
    for (const c of sites) {
      if (c.fortWork !== 'gate' || !c.fortGate) continue;
      const p = fortSegmentProgress(c).get(c.fortGate.segment);
      if (p !== undefined) gateWork.set(`${c.fortGate.segment}:${c.fortGate.level}`, p);
    }
    const gateLooks = sceneFortGates(fort, outline, day, (segment, level) =>
      gateWork.get(`${segment}:${level}`),
    );
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
        ...(sites.length > 0 ? { constructions: sites.map((c) => c.id) } : {}),
        ...(gateLooks ? { gateLooks } : {}),
      }),
    );
  }
  return result;
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

/** Důvod z jádra pro tlačítko panelu – běžící stavba stejným textem jako ostatní tlačítka. */
function reasonText(reason: string): string {
  return reason === FORT_BUSY ? FORT_BUSY_TEXT : reason;
}

const NO_COST: FortWorkCost = { laborManDays: 0, logs: 0 };

/** Cena v panelu z ceny jádra (práce, klády, kámen – kámen jen nenulový). */
function workCostOf(cost: { laborManDays: number; logs: number; stoneM3: number }): FortWorkCost {
  return {
    laborManDays: cost.laborManDays,
    logs: cost.logs,
    ...(cost.stoneM3 > 0 ? { stoneM3: cost.stoneM3 } : {}),
  };
}

/**
 * Tlačítko akce nad úsekem (doplnit val, napustit příkop) z výsledku akce jádra na klonu stavu:
 * cena přidané stavby (práce), nebo důvod; důvody `hidden` (už hotové, nedává smysl) – null, tlačítko
 * se neukáže.
 */
function actionOption(
  state: VillageState,
  result: { ok: true; state: VillageState } | { ok: false; reason: string },
  hidden: readonly string[],
): FortWorkOption | null {
  if (!result.ok) {
    return hidden.includes(result.reason)
      ? null
      : { cost: NO_COST, blocked: reasonText(result.reason) };
  }
  const added = result.state.constructions[state.constructions.length];
  return { cost: { laborManDays: added?.cost ?? 0, logs: 0 }, blocked: null };
}

/** Nabídka Vylepšit z jádra (`sectionUpgrades`) pro panel. */
function upgradeViews(options: readonly FortUpgradeOption[]): FortUpgradeView[] {
  return options.map((o) => ({
    target: o.target,
    option: { cost: workCostOf(o), blocked: o.block === null ? null : reasonText(o.block) },
  }));
}

/**
 * Vylepšení brány v dílu `segment` na úroveň `level`: cena (`gateUpgrade`) a důvod včetně dřeva
 * a kamene (`startGateUpgrade` na klonu); hotové (`done`) – null.
 */
function gateOption(
  ctx: FortViewContext,
  fortificationId: number,
  segment: number,
  level: GateLevel,
  done: string,
): FortWorkOption | null {
  const input = { fortificationId, segment, level };
  const cost = gateUpgrade(ctx.state, ctx.landscape, input);
  if ('reason' in cost) {
    return cost.reason === done ? null : { cost: NO_COST, blocked: reasonText(cost.reason) };
  }
  const started = startGateUpgrade(
    ctx.state,
    ctx.day,
    ctx.landscape,
    ctx.obstacles,
    input,
    ctx.walk(),
  );
  return { cost: workCostOf(cost), blocked: started.ok ? null : reasonText(started.reason) };
}

/** Ikona postupu jádra; mezera (`open`) ikonu nemá. */
const ASSAULT_ICON: Record<AssaultMethod, FortAssaultIcon | null> = {
  open: null,
  climb: 'ladder',
  ladder: 'ladder',
  cut: 'cut',
  burn: 'burn',
  dig: 'dig',
  mine: 'dig',
};

/**
 * Postupy útočníka přes díly `parts` ke dni `day` (Přechod hradby – `assaultSteps`): u každé ikony
 * nejrychlejší místo se 4 muži (`assaultHours`, otepi do 100 m); postup, který nikde nejde, null.
 */
function assaultViews(
  fort: Fortification,
  parts: readonly FortSegment[],
  day: number,
  atGate: boolean,
): FortAssaultView[] {
  const A = FORTIFICATIONS.assault;
  const best = new Map<FortAssaultIcon, { method: AssaultMethod; hours: number }>();
  for (const seg of parts) {
    for (const step of assaultSteps(crossingLayers(fort, seg, day, atGate))) {
      const icon = ASSAULT_ICON[step.method];
      if (icon === null) continue;
      const hours = assaultHours(step, A.maxMen, A.burn.fuelM);
      const prev = best.get(icon);
      if (!prev || hours < prev.hours) best.set(icon, { method: step.method, hours });
    }
  }
  return FORT_ASSAULT_ICONS.map((icon) => {
    const b = best.get(icon);
    return { icon, method: b?.method ?? null, hours4: b ? b.hours : null };
  });
}

/** Společné vstupy panelu opevnění – stav, krajina, den, překážky a síť cest (líně, jednou). */
interface FortViewContext {
  state: VillageState;
  landscape: Landscape;
  day: number;
  obstacles: ObstacleLayer;
  walk: () => ReturnType<typeof villageRoadWalk>;
}

/** Kusy úseku jako díly – celé díly a z dílů s branou pohled na kus (`gatePartView`). */
function pieceParts(fort: Fortification, pieces: readonly SectionPiece[]): FortSegment[] {
  return pieces.flatMap((p) => {
    const s = fort.segments.find((x) => x.index === p.index);
    if (!s) return [];
    return [p.part === undefined ? s : gatePartView(s, p.part)];
  });
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
  const parts = pieceParts(fort, pieces);
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
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): VillageFortification[] {
  const result: VillageFortification[] = [];
  let walk: ReturnType<typeof villageRoadWalk> | undefined;
  const ctx: FortViewContext = {
    state,
    landscape,
    day,
    obstacles,
    walk: () => (walk ??= villageRoadWalk(state, landscape)),
  };
  const men = fortDefenders(state, day);
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
      occupancy: { men, lengthM: outline.lengthM, share: fortOccupancy(men, outline.lengthM) },
      // „Vylepšit vše“ a val pod celé opevnění (fortifications.md – Druhy a postup vylepšení)
      upgrades: upgradeViews(
        sectionUpgrades(
          state,
          day,
          landscape,
          obstacles,
          { fortificationId: fort.id, segment: null },
          ctx.walk(),
        ),
      ),
      rampartAdd: actionOption(
        state,
        startRampartAddition(
          state,
          day,
          landscape,
          obstacles,
          { fortificationId: fort.id, segment: null },
          ctx.walk(),
        ),
        [FORT_RAMPART_DONE],
      ),
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
        const segment = section.segments[0]!;
        const sectionInput = { fortificationId: fort.id, segment };
        return {
          segments: [...section.segments],
          gateSegment: section.gateSegment,
          lengthM: span?.lengthM ?? 0,
          ...partsState(fort, pieces, day),
          demolish: demolishOption(state, landscape, fort.id, segment),
          upgrades: upgradeViews(
            sectionUpgrades(state, day, landscape, obstacles, sectionInput, ctx.walk()),
          ),
          assault: assaultViews(fort, pieceParts(fort, pieces), day, false),
          rampartAdd: actionOption(
            state,
            startRampartAddition(state, day, landscape, obstacles, sectionInput, ctx.walk()),
            [FORT_RAMPART_DONE],
          ),
          moat: actionOption(state, startMoatFill(state, day, landscape, sectionInput), [
            FORT_MOAT_NO_RAMPART,
            FORT_MOAT_DONE,
          ]),
          ...(own
            ? {
                progress: own.cost > 0 ? Math.min(1, own.done / own.cost) : 1,
                work: own.fortWork ?? 'build',
                constructionId: own.id,
              }
            : {}),
        };
      }),
      // zbořená brána je mezera – panel nemá (klik ji nevybere)
      gateViews: fort.gates
        .filter((gate) => gate.demolishedDay === undefined)
        .sort((a, b) => a.segment - b.segment)
        .map((gate) => {
          const seg = fort.segments.find((x) => x.index === gate.segment);
          const stands = seg !== undefined && segmentBuilt(seg);
          const demolition = gateDemolition(state, {
            fortificationId: fort.id,
            segment: gate.segment,
          });
          const blocked = 'reason' in demolition ? demolition.reason : null;
          return {
            segment: gate.segment,
            state: stands ? segmentState(fort, seg, day) : 1,
            old: stands && segmentIsOld(fort, seg, day),
            ageYears: stands
              ? Math.floor(Math.max(0, day - (partBuiltDay(fort, seg) ?? day)) / FORT_DAYS_PER_YEAR)
              : null,
            pincer: gateOption(ctx, fort.id, gate.segment, 'pincer', FORT_PINCER_DONE),
            tower: gateOption(ctx, fort.id, gate.segment, 'tower', FORT_TOWER_DONE),
            assault: seg ? assaultViews(fort, [seg], day, true) : [],
            abandoned: gate.abandonedDay !== undefined,
            // brána v holém valu nechátrá – Opustit nejde, Vrátit ano (D45)
            abandonBlocked:
              blocked === FORT_BUSY
                ? null
                : (blocked ??
                  (gate.abandonedDay === undefined && seg ? gateAbandonBlock(fort, seg) : null)),
            demolish:
              'reason' in demolition
                ? {
                    work: 'demolish' as const,
                    cost: { laborManDays: 0, logs: 0 },
                    blocked: blocked === FORT_BUSY ? FORT_BUSY_TEXT : blocked,
                  }
                : {
                    work: 'demolish' as const,
                    cost: { laborManDays: demolition.laborManDays, logs: demolition.logs },
                    blocked: null,
                  },
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

/** Kámen vsi pro cenu opevnění (Hradby a obrana – Cena): m³ na hromadách a lom vsi. */
export interface FortStoneSupply {
  m3: number;
  /** Ves má dostavěný lom – kamene na zakázku je kolik je třeba (fortifications.md – Kámen). */
  quarry: boolean;
}

/** Kámen vsi pro cenu opevnění u kurzoru – hromady (`stoneOnHand`) a dostavěný lom. */
export function fortStoneSupply(state: VillageState): FortStoneSupply {
  return { m3: stoneOnHand(state), quarry: villageQuarries(state).length > 0 };
}
