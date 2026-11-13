import type { GridCell } from '../village/people/world-grid';
import { sacredRuinOvergrowth, structureCondition } from '../village/buildings/abandonment';
import { churchProgress } from '../village/buildings/church-build';
import { cloneData } from '../village/core/clone';
import { buildProgress, kilnSummary } from '../village/core/summary';
import {
  kilnCharcoalShare,
  kilnRemnantOvergrowth,
  workshopKilns,
} from '../village/crafts/charcoal';
import { ruinOvergrowth } from '../village/buildings/ruins';
import { woodFellingCost } from '../village/forest/wood';
import { fortificationOutline } from '../village/fortification/outline';
import type { Fortification } from '../village/fortification/types';
import type {
  ChurchDims,
  ChurchType,
  Construction,
  Craft,
  DwellingPlot,
  DwellingType,
  KilnStage,
  PenSpecies,
  PenSquare,
  Position,
  SacredBuildingKind,
  SquareGrid,
  TileCell,
  VillageState,
} from '../village/types';
import type { MarchGrid, Pos } from './march-grid';
import { JOURNEY, WAR } from './rules-war';
import { inSight } from './sight';

// Objevování za jízdy (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 6): kam muži
// dohlédnou (`inSight` – 150 m, z lesa a do lesa 50 m), tam si rod zapamatuje stavby a opevnění
// tak, jak je viděli naposled („stará zpráva“ – mimo dohled se nic nemění). Stopa míst, odkud se
// muži dívali, je mřížka po `JOURNEY.trailStepM` – mlhu z ní odkryje prohlížeč stejným dohledem.
// Znalost nese jen to, co scéna potřebuje ke kreslení stavby – nikdy lidi, domácnosti, zvířata ani
// zásoby. Jen det-math (`domain/war/**`): objevování počítá worker i web.

/** Co rod o mapě ví: stopa míst, odkud se muži dívali, a naposled viděné stavby. */
export interface SeenCell {
  /** Ves na mapě, ke které patří `parts`; mapa bez vsi ho nemá. */
  villageId?: string;
  /**
   * První den, kdy se do mapy tento záznam díval (`lookAround`) – od té doby je v dohledu své stopy
   * úplný: co tam stálo, zapsal (sloučení s pokrytím – `mergeKnowledge`). Sloučená znalost rodu
   * nese nejmenší z obou. Chybí – záznam se zatím nedíval, nebo je z doby před `since`.
   */
  since?: number;
  /** Body stopy `[x, z]` (m) po `JOURNEY.trailStepM`, seřazené podle x, pak z, bez opakování. */
  trail: [number, number][];
  /** Naposled viděné stavby seřazené podle `key`. */
  parts: SeenPart[];
  /**
   * Stavby, které v dohledu zmizely: `key` a den, kdy to muži zjistili, seřazené podle `key`.
   * Jen když něco zmizelo – bez nich by sloučení (`mergeKnowledge`) vrátilo zničenou stavbu ze
   * starší znalosti rodu.
   */
  gone?: SeenGone[];
}

/** Co muži o mapě `cell` viděli – do úložiště znalosti rodu (`KnowledgeRepository`). */
export interface KnowledgeOut {
  cell: GridCell;
  seen: SeenCell;
}

/** Záznam o zaniklé stavbě – viz `SeenCell.gone`. */
export interface SeenGone {
  key: string;
  day: number;
}

/** Naposled viděná stavba: `key` = druh a id (`dwelling:12`), místo a den, kdy ji muži viděli. */
export interface SeenPart {
  key: string;
  pos: Pos;
  day: number;
  data: SeenData;
}

/** Obydlí – i dvorec vojvody a dílna (scéna: `SceneVillage.dwellings`, hotové obydlí). */
export interface SeenDwelling {
  kind: 'dwelling';
  id: number;
  type: DwellingType;
  /** Poloha a natočení. */
  position: Position;
  /** Stav 0–1 – podle něj dům ve scéně chátrá (`Dwelling.condition`). */
  condition: number;
  /** Pozemek polozemnice – políčko a varianta. */
  plot?: DwellingPlot;
  /** Řemeslná dílna – model dílny. */
  craft?: Craft;
  /** Tvar bez varianty rozměrů. */
  plainShape?: true;
  /** Dům se bourá – průběh bourání 0–1. */
  demolition?: number;
}

/** Staveniště obydlí nebo přestavby (scéna: `SceneVillage.dwellings`, `built: false`). */
export interface SeenSite {
  kind: 'site';
  id: number;
  type: DwellingType;
  position: Position;
  /** Průběh stavby 0–1 po skácení dřeva (`buildProgress`). */
  progress: number;
  plot?: DwellingPlot;
  craft?: Craft;
  plainShape?: true;
}

/** Ohrada (scéna: `SceneVillage.pens`) – bez zvířat. */
export interface SeenPen {
  kind: 'pen';
  id: number;
  species?: PenSpecies;
  /** První čtverec ohrady (přístřešek a jesle) a další čtverce. */
  cell: TileCell;
  extraSquares?: PenSquare[];
  grid?: SquareGrid;
  x: number;
  z: number;
  built: boolean;
  /** Průběh stavby 0–1 (hotová 1). */
  progress: number;
  /** Stav opuštěné ohrady 0–1 v den, kdy ji muži viděli (`structureCondition`); bez údaje 1. */
  condition?: number;
  demolition?: number;
}

/** Modla nebo svatyně, hotová i rozestavěná (scéna: `SceneSacred.buildings`). */
export interface SeenSacred {
  kind: 'sacred';
  id: number;
  type: SacredBuildingKind;
  position: Position;
  built: boolean;
  progress: number;
  /** Stav opuštěné stavby 0–1 v den, kdy ji muži viděli; bez údaje 1. */
  condition?: number;
  demolition?: number;
}

/** Kostel nebo jeho staveniště (scéna: `SceneChurch`) – bez kněze a hrobů. */
export interface SeenChurch {
  kind: 'church';
  id: number;
  type: ChurchType;
  dims: ChurchDims;
  /** Střed lodi a natočení. */
  position: Position;
  /** Střecha hotová – kostel stojí (výzdoba může ještě běžet). */
  built: boolean;
  decorated: boolean;
  /** Průběh po druzích práce 0–1 (`churchProgress`). */
  progress: { foundation: number; walls: number; roof: number; decor: number };
}

/** Humno hotové i rozestavěné (scéna: `SceneVillage.threshingFloors`) – bez slámy a zrna. */
export interface SeenThreshing {
  kind: 'threshing';
  id: number;
  position: Position;
  built: boolean;
  /** Průběh stavby 0–1 (hotové 1). */
  progress: number;
  demolition?: number;
}

/** Milíř uhlíře (scéna: `SceneVillage.kilns`) – fáze, průběh a uhlí, které v něm zbývá. */
export interface SeenKiln {
  kind: 'kiln';
  id: number;
  /** Dílna uhlíře (id obydlí). */
  burnerId: number;
  x: number;
  z: number;
  stage: KilnStage;
  /** Průběh fáze 0–1. */
  progress: number;
  /** Vypálený milíř: podíl uhlí, které v něm zbývá, 0–1. */
  charcoal?: number;
}

/** Milířiště po rozebraném milíři (scéna: `SceneVillage.kilnRemnants`) – jak zarostlo v den pohledu. */
export interface SeenKilnRemnant {
  kind: 'kilnRemnant';
  id: number;
  burnerId: number;
  x: number;
  z: number;
  overgrowth: number;
}

/** Zbytek jámy po zaniklém obydlí (scéna: `SceneVillage.ruins`) – jak zarostl v den pohledu. */
export interface SeenRuin {
  kind: 'ruin';
  id: number;
  type: DwellingType;
  position: Position;
  /** Den zániku obydlí. */
  since: number;
  overgrowth: number;
  plot?: DwellingPlot;
  craft?: Craft;
  plainShape?: true;
  /** Shořelo – ohořelé trosky. */
  charred?: true;
}

/** Zbytek padlé modly nebo svatyně (scéna: `SceneSacred.ruins`) – jak zarostl v den pohledu. */
export interface SeenSacredRuin {
  kind: 'sacredRuin';
  id: number;
  type: SacredBuildingKind;
  position: Position;
  overgrowth: number;
}

/**
 * Stavba na opevnění – pole stavby, která čte scéna (průběh po úsecích a branách,
 * `fortSegmentProgress`); `done` je hotová práce bez kácení dřeva, které jde napřed (dokud se
 * kácí, je záporná) – průběh úseků vyjde stejně jako ze stavby a znalost nenese dřevo stavby.
 */
export type SeenFortWork = Pick<
  Construction,
  'id' | 'done' | 'fortWork' | 'fortGate' | 'fortSegments'
>;

/** Opevnění celé – body obvodu, druh, nástavba, úseky a brány, a stavby na něm. */
export interface SeenFortification {
  kind: 'fortification';
  fort: Fortification;
  works: SeenFortWork[];
}

/** Co scéna potřebuje, aby viděnou stavbu nakreslila. */
export type SeenData =
  | SeenDwelling
  | SeenSite
  | SeenPen
  | SeenSacred
  | SeenChurch
  | SeenFortification
  | SeenThreshing
  | SeenKiln
  | SeenKilnRemnant
  | SeenRuin
  | SeenSacredRuin;

/** Co je ve vsi vidět: klíč, místo, body, na které muž dohlédnout musí, a data pro scénu. */
export interface Sighting {
  key: string;
  pos: Pos;
  eyesAt: Pos[];
  data: SeenData;
}

/** Obdélník bodů `eyesAt` (m). */
interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Sightings {
  list: readonly Sighting[];
  byKey: ReadonlyMap<string, Sighting>;
  /** Obdélník bodů každé položky `list` – předběžné síto dohledu (obvod opevnění má stovky bodů). */
  boxes: readonly Box[];
}

const NO_SIGHTINGS: Sightings = { list: [], byKey: new Map(), boxes: [] };
/** Nejdelší dohled `inSight` – dál než o tolik od obdélníku bodů muž na žádný nedohlédne. */
const REACH_M = Math.max(WAR.sight.openM, WAR.sight.forestM);

/**
 * Kolik dnů jedné vsi drží paměť – výjezd jde den po dni; víc dnů pokryje dva výjezdy na téže
 * mapě posunuté o pár dnů (jako `MarchGridMemo`).
 */
const MEMO_DAYS = 4;
/**
 * Co je ve vsi vidět, podle identity stavu vsi a dne: stav vsi je neměnný, takže tentýž objekt
 * a den = týž seznam. Jen zrychlení – objevování běží v každém taktu; seznam je zmražený, výsledek
 * na paměti nezávisí. Stav drží slabě (zahozená ves uvolní svůj seznam).
 */
const memo = new WeakMap<VillageState, Map<number, Sightings>>();

/**
 * Stavby vsi, které muži vidí (plán 2026-11-13 – Úloha 6): obydlí včetně dvorce, staveniště obydlí
 * a posvátných staveb, ohrady, modly a svatyně, kostel i jeho staveniště a opevnění. Ne pole,
 * sady, hřbitovy, lomy, stohy, jámy, cesty, lidé, zvířata ani zásoby. Stavební huť nemá ve stavu
 * vsi místo (jsou to mistři – lidé), vidět není. Opevnění se odkryje celé, jakmile muž dohlédne na
 * kterýkoli bod jeho obvodu (`eyesAt` = navzorkovaná křivka obvodu).
 */
export function sightingsOf(village: VillageState, day: number): Sighting[] {
  return [...sightingsFor(village, day).list];
}

/**
 * Pohled mužů `eyes` na mapu (plán 2026-11-13 – Úloha 6): ke stopě přidá body po
 * `JOURNEY.trailStepM`, stavby v dohledu zapíše s dnešním stavem, známé stavby, které ve vsi už
 * nejsou a jejich místo je v dohledu, zapomene; co je mimo dohled, zůstane, jak bylo. Stav vsi pro
 * den je jeden (`CampaignWorld.villageAt`) – co muži dnes už viděli, se znovu nepřepisuje. První
 * pohled do mapy zapíše `since` (záznam se stopou bez `since` je starší – den nezná, nedostane ho).
 * `prev` nemění; nepřibylo-li nic, vrátí ho beze změny (týž objekt).
 */
export function lookAround(
  prev: SeenCell | undefined,
  input: {
    village: VillageState | null;
    eyes: readonly Pos[];
    grid: MarchGrid | null;
    day: number;
  },
): SeenCell {
  const trail = extendTrail(prev?.trail ?? [], input.eyes);
  const { parts, gone } = refreshParts(prev?.parts ?? [], prev?.gone, input);
  const first = input.eyes.length > 0 && (prev?.trail.length ?? 0) === 0;
  const since = prev?.since ?? (first ? input.day : undefined);
  if (
    prev &&
    trail === prev.trail &&
    parts === prev.parts &&
    gone === prev.gone &&
    since === prev.since
  ) {
    return prev;
  }
  return {
    ...(prev?.villageId === undefined ? {} : { villageId: prev.villageId }),
    ...(since === undefined ? {} : { since }),
    trail,
    parts,
    ...(gone === undefined ? {} : { gone }),
  };
}

/**
 * Pohled mužů na mapu, na které je ves `villageId` (žádná – undefined), pro výjezd i tažení
 * (`lookAround`): jiná ves na mapě než ve znalosti `prev` (stará zanikla, novou založil nováček) –
 * stavby staré vsi k ní nepatří, zůstane stopa a její `since`; výsledek nese `villageId` vsi na
 * mapě. Nepřibylo-li nic, vrátí `prev` (týž objekt).
 */
export function lookOnMap(
  prev: SeenCell | undefined,
  input: {
    villageId: string | undefined;
    village: VillageState | null;
    eyes: readonly Pos[];
    grid: MarchGrid | null;
    day: number;
  },
): SeenCell {
  const { villageId, ...look } = input;
  const other =
    prev?.villageId !== undefined && villageId !== undefined && prev.villageId !== villageId;
  const known: SeenCell | undefined =
    prev && other
      ? { ...(prev.since === undefined ? {} : { since: prev.since }), trail: prev.trail, parts: [] }
      : prev;
  const looked = lookAround(known, look);
  return villageId === undefined || looked.villageId === villageId
    ? looked
    : { ...looked, villageId };
}

/**
 * Sloučení znalosti rodu o jedné mapě (plán 2026-11-13 – Úloha 10): `fresh` je, co muži viděli
 * teď, `old` je, co rod věděl dřív (`null` – nic). Stopy se sjednotí; ze dvou záznamů téže stavby
 * platí z novějšího dne; stavba, která má v `gone` (ve staré i nové znalosti) záznam se stejným
 * nebo pozdějším dnem, se odstraní – kdo ji viděl zmizet, ten ji starou zprávou nevrátí; ostatní
 * stavby ze `old` zůstanou, i když je ve `fresh` není (muži je neviděli). Jiná ves na mapě než ve
 * staré znalosti – staré stavby i zánik se zahodí, zůstane jen stopa. Výsledek je seřazený, nezávisí
 * na pořadí `parts` a sloučit totéž podruhé nic nezmění (opakované doručení po pádu je bezpečné).
 * Vstupy nemění.
 *
 * Pokrytí (kolo oprav Úlohy 11): čerstvý záznam je od svého `since` v dohledu stopy úplný – co tam
 * stálo, `lookAround` zapsal. Stavba ze `old`, kterou `fresh` nemá, viděná před `fresh.since`
 * a jistě v dohledu stopy (`surelySeen`), proto už nestojí a odstraní se – i dům, o jehož zániku
 * záznam neví (viděl ho jen dřívější výjezd). Dál od stopy zůstane jako stará zpráva. `since`
 * výsledku je nejmenší z obou.
 */
export function mergeKnowledge(old: SeenCell | null, fresh: SeenCell): SeenCell {
  const sameVillage =
    old !== null &&
    (old.villageId === undefined ||
      fresh.villageId === undefined ||
      old.villageId === fresh.villageId);
  const base = old !== null && sameVillage ? old : null;
  const villageId = fresh.villageId ?? base?.villageId;

  const goneAt = new Map<string, number>();
  for (const g of [...(base?.gone ?? []), ...(fresh.gone ?? [])]) {
    goneAt.set(g.key, Math.max(goneAt.get(g.key) ?? g.day, g.day));
  }
  const seenNow = new Set(fresh.parts.map((p) => p.key));
  const from = fresh.since;
  const outdated = (p: SeenPart): boolean =>
    from !== undefined && p.day < from && !seenNow.has(p.key) && surelySeen(fresh.trail, p.pos);
  const best = new Map<string, SeenPart>();
  // nejdřív stará znalost, pak čerstvá – při stejném dni platí čerstvá
  for (const p of base?.parts ?? []) {
    if ((goneAt.get(p.key) ?? -Infinity) >= p.day || outdated(p)) continue;
    const had = best.get(p.key);
    if (!had || p.day >= had.day) best.set(p.key, p);
  }
  for (const p of fresh.parts) {
    if ((goneAt.get(p.key) ?? -Infinity) >= p.day) continue;
    const had = best.get(p.key);
    if (!had || p.day >= had.day) best.set(p.key, p);
  }
  // zánik, který přebila novější stavba téhož klíče, už nic neodstraňuje
  for (const [key, day] of goneAt) if ((best.get(key)?.day ?? -Infinity) > day) goneAt.delete(key);

  const gone = [...goneAt].map(([key, day]) => ({ key, day })).sort(byKey);
  const since =
    old?.since === undefined || fresh.since === undefined
      ? (old?.since ?? fresh.since)
      : Math.min(old.since, fresh.since);
  return {
    ...(villageId === undefined ? {} : { villageId }),
    ...(since === undefined ? {} : { since }),
    trail: unionTrail(old?.trail ?? [], fresh.trail),
    parts: [...best.values()].sort(byKey),
    ...(gone.length === 0 ? {} : { gone }),
  };
}

/** Polovina kroku stopy – nejvíc, o kolik stál muž v každé ose od bodu stopy (zaokrouhlení). */
const TRAIL_SNAP_M = JOURNEY.trailStepM / 2;

/**
 * Viděli muži místo `at` jistě (pokrytí – `mergeKnowledge`)? Sloučení nemá mřížku, takže bere
 * nejkratší dohled `inSight` – lesní (`WAR.sight.forestM`, 50 m) – a body stopy jsou zaokrouhlené
 * po `JOURNEY.trailStepM`: místo musí být v lesním dohledu odkudkoli z okolí bodu, kde muž mohl stát
 * (nejvzdálenější roh čtverce ± půl kroku). Návrh Clauda – s 50 m od bodu stopy by sloučení mohlo
 * smazat dům v lese, na který muž nedohlédl.
 */
function surelySeen(trail: readonly [number, number][], at: Pos): boolean {
  const r = WAR.sight.forestM;
  return trail.some(([x, z]) => {
    const dx = Math.abs(at.x - x) + TRAIL_SNAP_M;
    const dz = Math.abs(at.z - z) + TRAIL_SNAP_M;
    return dx * dx + dz * dz <= r * r;
  });
}

/** Sjednocení dvou seřazených stop (x, pak z) bez opakování. */
function unionTrail(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const p = a[i];
    const q = b[j];
    const order = p === undefined ? 1 : q === undefined ? -1 : p[0] - q[0] || p[1] - q[1];
    const take = order <= 0 ? p! : q!;
    if (order <= 0) i++;
    if (order >= 0) j++;
    out.push([take[0], take[1]]);
  }
  return out;
}

/**
 * Body stopy v místech mužů po `JOURNEY.trailStepM` – seřazené, bez opakování; beze změny týž
 * seznam, jinak nový (vstup nemění). Bere ji i stopa tažení (`campaign-knowledge.ts`).
 */
export function extendTrail(trail: [number, number][], eyes: readonly Pos[]): [number, number][] {
  let out: [number, number][] | null = null;
  for (const e of eyes) {
    const point: [number, number] = [onTrailGrid(e.x), onTrailGrid(e.z)];
    const slot = trailSlot(out ?? trail, point);
    if (slot < 0) continue;
    out ??= trail.slice();
    out.splice(slot, 0, point);
  }
  return out ?? trail;
}

/** Souřadnice na mřížce stopy (násobek `JOURNEY.trailStepM`, bez −0). */
function onTrailGrid(v: number): number {
  const snapped = Math.round(v / JOURNEY.trailStepM) * JOURNEY.trailStepM;
  return snapped === 0 ? 0 : snapped;
}

/** Kam do seřazené stopy (x, pak z) bod patří; −1 – bod už ve stopě je. */
function trailSlot(trail: readonly [number, number][], p: readonly [number, number]): number {
  let lo = 0;
  let hi = trail.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const q = trail[mid]!;
    const order = q[0] - p[0] || q[1] - p[1];
    if (order === 0) return -1;
    if (order < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Stavby po pohledu mužů – seřazené podle klíče; beze změny týž seznam. */
function refreshParts(
  known: SeenPart[],
  knownGone: SeenGone[] | undefined,
  input: {
    village: VillageState | null;
    eyes: readonly Pos[];
    grid: MarchGrid | null;
    day: number;
  },
): { parts: SeenPart[]; gone: SeenGone[] | undefined } {
  const { village, eyes, grid, day } = input;
  if (eyes.length === 0) return { parts: known, gone: knownGone };
  const sightings = village === null ? NO_SIGHTINGS : sightingsFor(village, day);
  const sees = (at: Pos): boolean => eyes.some((e) => inSight(grid, e, at));
  // síto: muž dál než nejdelší dohled od obdélníku bodů nevidí žádný z nich (výsledek stejný)
  const near = (b: Box): boolean =>
    eyes.some(
      (e) =>
        e.x >= b.minX - REACH_M &&
        e.x <= b.maxX + REACH_M &&
        e.z >= b.minZ - REACH_M &&
        e.z <= b.maxZ + REACH_M,
    );
  // zmizelé: ve vsi dnes nejsou a jejich místo je v dohledu (viděné dnes ve vsi dnes stojí)
  let gone: Set<string> | null = null;
  for (const p of known) {
    if (p.day === day || sightings.byKey.has(p.key)) continue;
    if (sees(p.pos)) (gone ??= new Set()).add(p.key);
  }
  let fresh: Map<string, SeenPart> | null = null;
  const { list, boxes } = sightings;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    if (!near(boxes[i]!) || partOf(known, s.key)?.day === day || !s.eyesAt.some(sees)) continue;
    (fresh ??= new Map()).set(s.key, { key: s.key, pos: s.pos, day, data: s.data });
  }
  if (gone === null && fresh === null) return { parts: known, gone: knownGone };
  const next = known.filter((p) => !gone?.has(p.key) && !fresh?.has(p.key));
  if (fresh) next.push(...fresh.values());
  if (gone === null) return { parts: next.sort(byKey), gone: knownGone };
  // zánik si rod pamatuje s dnem (`SeenCell.gone`) – staré záznamy téhož klíče přebije nový
  const records = (knownGone ?? []).filter((g) => !gone.has(g.key));
  for (const key of gone) records.push({ key, day });
  return { parts: next.sort(byKey), gone: records.sort(byKey) };
}

function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Známá stavba podle klíče (seznam je seřazený podle `byKey`). */
function partOf(parts: readonly SeenPart[], key: string): SeenPart | undefined {
  let lo = 0;
  let hi = parts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const k = parts[mid]!.key;
    if (k === key) return parts[mid];
    if (k < key) lo = mid + 1;
    else hi = mid;
  }
  return undefined;
}

/** Seznam viditelného z paměti, nebo nově spočtený (`memo`). */
function sightingsFor(village: VillageState, day: number): Sightings {
  let byDay = memo.get(village);
  if (!byDay) {
    byDay = new Map();
    memo.set(village, byDay);
  }
  const known = byDay.get(day);
  if (known) {
    // použitý den na konec pořadí vkládání – první v pořadí je pak nejdéle nepoužitý
    byDay.delete(day);
    byDay.set(day, known);
    return known;
  }
  const list = buildSightings(village, day);
  const entry: Sightings = {
    list,
    byKey: new Map(list.map((s) => [s.key, s])),
    boxes: list.map((s) => boxOf(s.eyesAt)),
  };
  byDay.set(day, entry);
  if (byDay.size > MEMO_DAYS) {
    const unused = byDay.keys().next();
    if (!unused.done) byDay.delete(unused.value);
  }
  return entry;
}

/** Co je ve vsi vidět – data jsou kopie (stav vsi se se znalostí nesdílí), zmražené. */
function buildSightings(village: VillageState, day: number): Sighting[] {
  const out: Sighting[] = [];
  const add = (key: string, eyesAt: Pos[], data: SeenData): void => {
    const first = eyesAt[0];
    if (first) out.push(frozen({ key, pos: first, eyesAt, data: cloneData(data) }));
  };
  const demolitions = new Map<string, number>();
  const penSites = new Map<number, Construction>();
  const fortWorks = new Map<number, SeenFortWork[]>();
  const floorSites = new Map<number, Construction>();
  for (const c of village.constructions) {
    if (c.kind === 'demolition' && c.demolition) {
      demolitions.set(`${c.demolition.structure}:${c.demolition.id}`, buildProgress(c));
    } else if (c.kind === 'pen' && typeof c.penId === 'number' && !penSites.has(c.penId)) {
      penSites.set(c.penId, c);
    } else if (c.kind === 'threshing-floor' && !floorSites.has(c.id)) {
      floorSites.set(c.id, c);
    } else if (c.kind === 'fortification' && c.fortificationId !== undefined) {
      const works = fortWorks.get(c.fortificationId) ?? [];
      works.push(fortWorkOf(c));
      fortWorks.set(c.fortificationId, works);
    }
  }
  const demolition = (structure: string, id: number): { demolition?: number } => {
    const progress = demolitions.get(`${structure}:${id}`);
    return progress === undefined ? {} : { demolition: progress };
  };
  for (const d of village.dwellings) {
    add(`dwelling:${d.id}`, [at(d.position)], {
      kind: 'dwelling',
      id: d.id,
      type: d.type,
      position: d.position,
      condition: d.condition,
      ...(d.plot ? { plot: d.plot } : {}),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      ...(d.plainShape ? { plainShape: true as const } : {}),
      ...demolition('dwelling', d.id),
    });
  }
  const churchSites = new Set<number>();
  for (const c of village.constructions) {
    if (c.position === null) continue;
    if ((c.kind === 'dwelling' || c.kind === 'rebuild') && c.dwellingType !== null) {
      add(`site:${c.id}`, [at(c.position)], {
        kind: 'site',
        id: c.id,
        type: c.dwellingType,
        position: c.position,
        progress: buildProgress(c),
        ...(c.plot ? { plot: c.plot } : {}),
        ...(c.craft ? { craft: c.craft } : {}),
        ...(c.plainShape ? { plainShape: true as const } : {}),
      });
    } else if (c.kind === 'idol' || c.kind === 'shrine') {
      add(`site:${c.id}`, [at(c.position)], {
        kind: 'sacred',
        id: c.id,
        type: c.kind,
        position: c.position,
        built: false,
        progress: buildProgress(c),
      });
    } else if (c.kind === 'church' && c.church) {
      // po střeše má kostel id staveniště výzdoby – kreslí se jednou, podle staveniště
      churchSites.add(c.id);
      add(`church:${c.id}`, [at(c.position)], {
        kind: 'church',
        id: c.id,
        type: c.church.type,
        dims: c.church.dims,
        position: c.position,
        built: (village.churches ?? []).some((x) => x.id === c.id),
        decorated: false,
        progress: churchProgress(c.church),
      });
    }
  }
  for (const ch of village.churches ?? []) {
    if (churchSites.has(ch.id)) continue;
    const decorated = ch.decoratedDay !== undefined;
    add(`church:${ch.id}`, [at(ch.position)], {
      kind: 'church',
      id: ch.id,
      type: ch.type,
      dims: ch.dims,
      position: ch.position,
      built: true,
      decorated,
      progress: { foundation: 1, walls: 1, roof: 1, decor: decorated ? 1 : 0 },
    });
  }
  for (const p of village.pens ?? []) {
    const built = p.builtDay !== null;
    const site = built ? undefined : penSites.get(p.id);
    const condition = structureCondition(p.wear, 'pen', day);
    const squares = (p.extraSquares ?? []).map((s) => ({ x: s.x, z: s.z }));
    add(`pen:${p.id}`, [{ x: p.x, z: p.z }, ...squares], {
      kind: 'pen',
      id: p.id,
      ...(p.species ? { species: p.species } : {}),
      cell: p.cell,
      ...(p.extraSquares ? { extraSquares: p.extraSquares } : {}),
      ...(p.grid ? { grid: p.grid } : {}),
      x: p.x,
      z: p.z,
      built,
      progress: built ? 1 : site ? buildProgress(site) : 0,
      ...(condition < 1 ? { condition } : {}),
      ...demolition('pen', p.id),
    });
  }
  for (const b of village.sacredBuildings ?? []) {
    const condition = structureCondition(b.wear, b.kind, day);
    add(`sacred:${b.id}`, [at(b.position)], {
      kind: 'sacred',
      id: b.id,
      type: b.kind,
      position: b.position,
      built: true,
      progress: 1,
      ...(condition < 1 ? { condition } : {}),
      ...demolition(b.kind, b.id),
    });
  }
  for (const f of village.threshingFloors ?? []) {
    const built = f.builtDay !== null;
    const site = built ? undefined : floorSites.get(f.id);
    add(`threshing:${f.id}`, [at(f.position)], {
      kind: 'threshing',
      id: f.id,
      position: f.position,
      built,
      progress: built ? 1 : site ? buildProgress(site) : 0,
      ...demolition('threshing-floor', f.id),
    });
  }
  for (const d of village.dwellings) {
    for (const kiln of workshopKilns(d.workshop)) {
      if (!kiln.site || kiln.id === undefined) continue;
      add(`kiln:${kiln.id}`, [at(kiln.site)], {
        kind: 'kiln',
        id: kiln.id,
        burnerId: d.id,
        x: kiln.site.x,
        z: kiln.site.z,
        stage: kiln.stage,
        progress: kilnSummary(d, kiln).progress,
        ...(kiln.stage === 'draw' ? { charcoal: kilnCharcoalShare(kiln) } : {}),
      });
    }
  }
  for (const r of village.kilnRemnants ?? []) {
    add(`kilnRemnant:${r.id}`, [at(r)], {
      kind: 'kilnRemnant',
      id: r.id,
      burnerId: r.burnerId,
      x: r.x,
      z: r.z,
      overgrowth: kilnRemnantOvergrowth(r, day),
    });
  }
  for (const r of village.ruins ?? []) {
    add(`ruin:${r.id}`, [at(r.position)], {
      kind: 'ruin',
      id: r.id,
      type: r.type,
      position: r.position,
      since: r.day,
      overgrowth: ruinOvergrowth(r, day),
      ...(r.plot ? { plot: r.plot } : {}),
      ...(r.craft ? { craft: r.craft } : {}),
      ...(r.plainShape ? { plainShape: true as const } : {}),
      ...(r.charred ? { charred: true as const } : {}),
    });
  }
  for (const r of village.sacredRuins ?? []) {
    add(`sacredRuin:${r.id}`, [at(r.position)], {
      kind: 'sacredRuin',
      id: r.id,
      type: r.kind,
      position: r.position,
      overgrowth: sacredRuinOvergrowth(r, day),
    });
  }
  for (const f of village.fortifications ?? []) {
    // obvod z uložených bodů (starší opevnění po čtvercích převede načtení vsi – `fort-points`)
    const ring = f.points ? (fortificationOutline(f.points, f.kind)?.polyline ?? []) : [];
    add(
      `fortification:${f.id}`,
      ring.map(([x, z]) => ({ x, z })),
      { kind: 'fortification', fort: f, works: fortWorks.get(f.id) ?? [] },
    );
  }
  return out;
}

/** Stavba na opevnění bez dřeva – hotová práce na úsecích (kácení jde napřed). */
function fortWorkOf(c: Construction): SeenFortWork {
  return {
    id: c.id,
    done: c.done - woodFellingCost(c.wood),
    ...(c.fortWork ? { fortWork: c.fortWork } : {}),
    ...(c.fortGate ? { fortGate: c.fortGate } : {}),
    ...(c.fortSegments ? { fortSegments: c.fortSegments } : {}),
  };
}

function boxOf(points: readonly Pos[]): Box {
  const box: Box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of points) {
    box.minX = Math.min(box.minX, p.x);
    box.maxX = Math.max(box.maxX, p.x);
    box.minZ = Math.min(box.minZ, p.z);
    box.maxZ = Math.max(box.maxZ, p.z);
  }
  return box;
}

function at(p: { x: number; z: number }): Pos {
  return { x: p.x, z: p.z };
}

/** Zmrazí hodnotu do hloubky – seznam z paměti nikdo nezmění. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) frozen(v);
  }
  return value;
}
