import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { isEmergencyFallow, sowingGroup, sowingOrder, type SowingGroup } from './fields';
import { gridKey, squareCenter } from './square-grid';
import { fieldGrids } from './squares';
import type { FieldPart, SquareGrid, TileCell, VillageState } from './types';
import { nearestFirst, type WorkOrder } from './year-plan';
import { partsByIdOf } from './parts-by-id';

// Hospodaření podle polohy domů (fields.md – Hospodaření podle polohy domů; Martin, 18. 10. 2026:
// „Spíš ať to vesničané odvodí od polohy domů.“). Jen organizace práce – jídlo zůstává společné.
// - Hospodářství: každý díl pole patří k obydlí, ke kterému má nejblíž (vzdušnou čarou od domu ke
//   středu čtverce – chůze po mřížce s vodou a svahy dá jiný dům jen u 4,6 % čtverců, skoro vše
//   na hranici mezi dvěma domy; simulace navíc krajinu nemá).
// - Úseky: hospodářství se dělí na úseky, které vycházejí od domu. Čtverce se rozdělí na prstence
//   po 15 m od nejbližšího čtverce hospodářství a každý prstenec po směru kolem domu na stejný
//   počet dílů, kolik čtverců má první prstenec u domu (úsek je u domu široký ≈ 1 čtverec). Dům
//   obklopený poli tak má úseky jako výseče, dům na kraji pole dlouhé souběžné pásy (lány).
//   Hranice úseků se mezi prstenci posunou nejvýš o MAX_SHIFT_CELLS čtverce – kde hospodářství
//   na jedné straně skončí, úseky z té strany skončí taky a nepřeskočí jinam – a jeden průchod
//   vyhladí zuby mřížky (`smoothLanes`).
// - Osev (sowingBlocks): ves bere díly po blocích – díly jednoho úseku ve stejné skupině přílohové
//   soustavy, od domu ven –, takže úsek osetý najednou se najednou vyčerpá a najednou jde do
//   přílohu. Mezi hospodářstvími se osev dělí podle jejich velikosti.
// - Postup práce (workOrder): po úsecích, v úseku od domu ven.
// Čisté funkce bez I/O; geometrie se neukládá – vždy se odvodí z polohy domů a čtverců.

/** Dům, od kterého se hospodaří – id obydlí a poloha domu ve světě (m). */
export interface HoldingHouse {
  id: number;
  position: { x: number; z: number };
}

/**
 * Díl pro rozdělení: id, políčko (bez něj díl k hospodářství nepatří), mřížka natočeného pole
 * (`grid` – fields.md, Natočené stavby; políčko je pak čtverec v ní) a vzdálenost (staré díly).
 */
export interface HoldingPartInput {
  id: number;
  cell?: TileCell;
  grid?: SquareGrid;
  distanceM?: number;
}

/** Úsek hospodářství – díly od domu ven. */
export interface FieldSector {
  /** Pořadí úseku ve vsi (index v `FieldHoldings.sectors`). */
  index: number;
  /** Obydlí hospodářství; null = díly bez políčka (staré pole z obrysu) – každý svůj úsek. */
  dwellingId: number | null;
  /** Úsek v hospodářství 0 … n − 1 po směru kolem domu. */
  lane: number;
  /** Díly od domu ven (při shodě vzdálenosti podle id). */
  partIds: number[];
  /** Vzdálenost dílů od domu (m), ve stejném pořadí. */
  distances: number[];
}

export interface FieldHoldings {
  /** Úseky: hospodářství podle id obydlí, v něm po směru; pak díly bez políčka. */
  sectors: FieldSector[];
  /** Díl → úsek (index) a vzdálenost od domu hospodářství (m). */
  byPart: ReadonlyMap<number, { sector: number; distanceM: number }>;
  /** Ves hospodaří podle domů – aspoň jeden díl patří k obydlí. Jinak platí dřívější pořadí. */
  active: boolean;
}

/** O kolik čtverců (oblouk na poloměru prstence) se smí hranice úseku posunout mezi prstenci. */
export const MAX_SHIFT_CELLS = 1;
const TAU = 2 * Math.PI;
/** Číselný klíč políčka (y · krok + x) – krok větší než strana krajiny i se sousedy za okrajem. */
const CELL_KEY_STRIDE = 4096;
const EPSILON = 1e-9;
/** Úrodnost se v klíčích porovnává na miliontiny (přičítání po 0,025 nese chyby). */
const SHARE_PRECISION = 1e6;

/** Krajina sídla má pevnou velikost (landscape/world.ts). */
const GEOMETRY = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M } as const;

/** Střed čtverce dílu ve světě (m) – políčko krajiny, u natočeného pole čtverec v jeho mřížce. */
function cellCenter(cell: TileCell, grid?: SquareGrid): { x: number; z: number } {
  return squareCenter(GEOMETRY, grid, cell);
}

/**
 * Domy hospodářství vsi: hotová obydlí; dokud žádné nestojí, rozestavěná (první zemnice – osadníci
 * bydlí na staveništi).
 */
export function holdingHouses(
  state: Pick<VillageState, 'dwellings' | 'constructions'>,
): HoldingHouse[] {
  if (state.dwellings.length > 0) {
    return state.dwellings.map((d) => ({ id: d.id, position: d.position }));
  }
  return state.constructions.flatMap((c) =>
    c.kind === 'dwelling' && c.position !== null
      ? [{ id: c.dwellingId ?? c.id, position: c.position }]
      : [],
  );
}

/**
 * Hospodářství podle pole dílů vsi – simulace se ptá každý den (hotové díly během roku), geometrie
 * se přitom mění jen s novými díly (pole dílů v simulaci jen roste) a s domy. Napřed paměť podle
 * totožného pole dílů (klíč: počet dílů a domy), pak podle obsahu (`holdingsContentKey`) – ta
 * přežije kopii stavu na začátku každého dopočtu (`cloneState`), jinak by se při dopočtu po dnech
 * geometrie počítala každý den znovu. Výsledek na paměti nezávisí.
 */
const holdingsCache = new WeakMap<readonly FieldPart[], { key: string; holdings: FieldHoldings }>();
/** Paměť podle obsahu – posledních pár vsí (worker dopočítává víc vsí za sebou). */
const holdingsByContent = new Map<string, FieldHoldings>();
const HOLDINGS_BY_CONTENT_MAX = 8;

/**
 * Klíč obsahu všeho, co `fieldHoldings` čte: domy (id, poloha), díly v pořadí (id, políčko, jinak
 * vzdálenost) a přesná mřížka pole dílu (natočená pole).
 */
function holdingsContentKey(
  houses: readonly HoldingHouse[],
  parts: readonly FieldPart[],
  grids: ReadonlyMap<number, SquareGrid>,
): string {
  const gridText = new Map<number, string>();
  for (const [id, g] of grids) gridText.set(id, `${g.x}:${g.z}:${g.rotation}`);
  const out = [houses.map((h) => `${h.id}:${h.position.x}:${h.position.z}`).join(',')];
  for (const p of parts) {
    const where = p.cell ? `${p.cell.x},${p.cell.y}` : `d${p.distanceM}`;
    out.push(`${p.id}:${where}:${gridText.get(p.fieldId) ?? ''}`);
  }
  return out.join(';');
}

/** Hospodářství a úseky vsi (viz hlavička souboru). */
export function villageHoldings(state: VillageState): FieldHoldings {
  const houses = holdingHouses(state);
  const key = `${state.parts.length}|${houses.map((h) => `${h.id}:${h.position.x}:${h.position.z}`).join(',')}`;
  const cached = holdingsCache.get(state.parts);
  if (cached?.key === key) return cached.holdings;
  // díly natočených polí nesou mřížku pole (fields.md – Natočené stavby)
  const grids = fieldGrids(state);
  const content = holdingsContentKey(houses, state.parts, grids);
  let holdings = holdingsByContent.get(content);
  if (!holdings) {
    const parts =
      grids.size === 0
        ? state.parts
        : state.parts.map((p) => {
            const grid = grids.get(p.fieldId);
            return grid ? { ...p, grid } : p;
          });
    holdings = fieldHoldings(houses, parts);
    if (holdingsByContent.size >= HOLDINGS_BY_CONTENT_MAX) {
      holdingsByContent.delete(holdingsByContent.keys().next().value!);
    }
  } else {
    holdingsByContent.delete(content);
  }
  holdingsByContent.set(content, holdings);
  holdingsCache.set(state.parts, { key, holdings });
  return holdings;
}

interface PlacedCell {
  id: number;
  cell: TileCell;
  /** Klíč mřížky pole – sousedí jen čtverce téže mřížky (prázdný = mřížka krajiny). */
  grid: string;
  r: number;
  theta: number;
}

/**
 * Rozdělí díly na hospodářství a úseky. Dům bez dílů úseky nemá; díly bez políčka dostanou každý
 * vlastní úsek bez hospodářství, seřazený podle `distanceM`. Ves bez domů nebo bez dílů
 * s políčkem hospodářství nemá (`active: false`, žádné úseky).
 */
export function fieldHoldings(
  houses: readonly HoldingHouse[],
  parts: readonly HoldingPartInput[],
): FieldHoldings {
  if (houses.length === 0 || !parts.some((p) => p.cell)) {
    // ves bez hospodářství – úseky nepotřebuje (dřívější pořadí), rychle i pro velká pole
    return { sectors: [], byPart: new Map(), active: false };
  }
  const sortedHouses = [...houses].sort((a, b) => a.id - b.id);
  const byHouse = new Map<number, PlacedCell[]>();
  const loose: HoldingPartInput[] = [];
  for (const part of parts) {
    if (!part.cell) {
      loose.push(part);
      continue;
    }
    const c = cellCenter(part.cell, part.grid);
    let best: HoldingHouse = sortedHouses[0]!;
    let bestR = Infinity;
    for (const house of sortedHouses) {
      const r = Math.hypot(c.x - house.position.x, c.z - house.position.z);
      if (r < bestR - EPSILON) {
        best = house;
        bestR = r;
      }
    }
    const theta = Math.atan2(c.z - best.position.z, c.x - best.position.x);
    const list = byHouse.get(best.id) ?? [];
    list.push({ id: part.id, cell: part.cell, grid: gridKey(part.grid), r: bestR, theta });
    byHouse.set(best.id, list);
  }

  const sectors: FieldSector[] = [];
  const byPart = new Map<number, { sector: number; distanceM: number }>();
  for (const house of sortedHouses) {
    const cells = byHouse.get(house.id);
    if (!cells) continue;
    const lanes = laneOf(cells);
    const count = Math.max(...lanes) + 1;
    const members: PlacedCell[][] = Array.from({ length: count }, () => []);
    cells.forEach((cell, i) => members[lanes[i]!]!.push(cell));
    for (let lane = 0; lane < count; lane++) {
      const list = members[lane]!.sort((a, b) => a.r - b.r || a.id - b.id);
      if (list.length === 0) continue;
      const index = sectors.length;
      sectors.push({
        index,
        dwellingId: house.id,
        lane,
        partIds: list.map((c) => c.id),
        distances: list.map((c) => c.r),
      });
      for (const c of list) byPart.set(c.id, { sector: index, distanceM: c.r });
    }
  }
  const looseSorted = [...loose].sort(
    (a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0) || a.id - b.id,
  );
  for (const part of looseSorted) {
    const index = sectors.length;
    const distanceM = part.distanceM ?? 0;
    sectors.push({ index, dwellingId: null, lane: 0, partIds: [part.id], distances: [distanceM] });
    byPart.set(part.id, { sector: index, distanceM });
  }
  return { sectors, byPart, active: true };
}

/** Úhel v rozsahu [0, 2π). */
function wrap(angle: number): number {
  const a = angle % TAU;
  return a < 0 ? a + TAU : a;
}

/** Úhel na pozici `q` (v čtvercích, 0 … m) mezi středy seřazených čtverců – lineárně. */
function quantileAngle(sorted: readonly number[], q: number): number {
  const p = q - 0.5;
  const i = Math.floor(p);
  if (i < 0) return sorted[0]!;
  if (i >= sorted.length - 1) return sorted[sorted.length - 1]!;
  return sorted[i]! + (p - i) * (sorted[i + 1]! - sorted[i]!);
}

/** Kolik hranic leží pod úhlem – úsek čtverce. */
function laneAt(bounds: readonly number[], alpha: number): number {
  let lane = 0;
  while (lane < bounds.length && bounds[lane]! < alpha) lane++;
  return lane;
}

/**
 * Úseky čtverců jednoho hospodářství (index úseku pro každý čtverec ve vstupním pořadí): prstence
 * po 15 m od nejbližšího čtverce, každý prstenec po směru na tolik dílů, kolik čtverců má první
 * prstenec (rovným dílem podle počtu čtverců), hranice se mezi prstenci posunou nejvýš
 * o MAX_SHIFT_CELLS. Směr se měří od řezu uprostřed největší mezery mezi směry čtverců – úseky
 * hospodářství z jedné strany domu tak nepřetečou přes záda domu.
 */
function laneOf(cells: readonly PlacedCell[]): number[] {
  const byAngle = [...cells].sort((a, b) => a.theta - b.theta || a.id - b.id);
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < byAngle.length; i++) {
    const here = byAngle[i]!.theta;
    const next = i + 1 < byAngle.length ? byAngle[i + 1]!.theta : byAngle[0]!.theta + TAU;
    if (next - here > widest + EPSILON) {
      widest = next - here;
      cut = here + (next - here) / 2;
    }
  }
  const rMin = Math.min(...cells.map((c) => c.r));
  const rings = new Map<number, { index: number; alpha: number; id: number }[]>();
  cells.forEach((c, index) => {
    const ring = Math.floor((c.r - rMin) / CELL_SIZE_M + EPSILON);
    const list = rings.get(ring) ?? [];
    list.push({ index, alpha: wrap(c.theta - cut), id: c.id });
    rings.set(ring, list);
  });
  const order = [...rings.keys()].sort((a, b) => a - b);
  const lanes = new Array<number>(cells.length).fill(0);
  let bounds: number[] = [];
  let n = 1;
  order.forEach((ring, k) => {
    const list = rings.get(ring)!.sort((a, b) => a.alpha - b.alpha || a.id - b.id);
    const alphas = list.map((c) => c.alpha);
    if (k === 0) {
      // první prstenec u domu: každý čtverec svůj úsek, hranice uprostřed mezi nimi
      n = list.length;
      bounds = alphas.slice(1).map((a, j) => (alphas[j]! + a) / 2);
    } else if (list.length >= n && n > 1) {
      const radius = rMin / CELL_SIZE_M + ring + 0.5;
      const shift = MAX_SHIFT_CELLS / radius;
      bounds = bounds.map((previous, j) => {
        const wanted = quantileAngle(alphas, ((j + 1) * list.length) / n);
        return Math.min(previous + shift, Math.max(previous - shift, wanted));
      });
    }
    for (const c of list) lanes[c.index] = laneAt(bounds, c.alpha);
  });
  return smoothLanes(
    cells,
    lanes,
    rings.get(order[0]!)!.map((c) => c.index),
  );
}

/**
 * Vyhladí hranice úseků: čtverec (mimo první prstenec u domu) převezme úsek, který má většina
 * z něj a jeho osmi sousedů v hospodářství; při shodě zůstane, jak je. Jeden průchod nad původním
 * rozdělením – mřížka jinak u domu dělá zuby (prstenec po 15 m bere čtverce ze dvou řad).
 */
function smoothLanes(
  cells: readonly PlacedCell[],
  lanes: readonly number[],
  fixed: readonly number[],
): number[] {
  const cellKey = (x: number, y: number, grid: string): string =>
    `${grid}|${y * CELL_KEY_STRIDE + x}`;
  const index = new Map(cells.map((c, i) => [cellKey(c.cell.x, c.cell.y, c.grid), i]));
  const keep = new Set(fixed);
  return cells.map((c, i) => {
    const own = lanes[i]!;
    if (keep.has(i)) return own;
    const votes = new Map<number, number>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const j = index.get(cellKey(c.cell.x + dx, c.cell.y + dy, c.grid));
        if (j === undefined) continue;
        votes.set(lanes[j]!, (votes.get(lanes[j]!) ?? 0) + 1);
      }
    }
    let best = own;
    let most = votes.get(own) ?? 0;
    for (const [lane, count] of [...votes].sort((a, b) => a[0] - b[0])) {
      if (count > most) {
        best = lane;
        most = count;
      }
    }
    return best;
  });
}

/**
 * Nouzový osev (fields.md – Přílohová soustava, Nouzový osev): přílohy pod 70 % přirozené
 * úrodnosti (aspoň na 40 %) – „pátá skupina“ pořadí, jen pro `sowingBlocks(…, EMERGENCY_GROUP)`.
 */
export const EMERGENCY_GROUP = 5;
type BlockGroup = SowingGroup | typeof EMERGENCY_GROUP;

/** Skupina dílu v pořadí bloků – i nouzový příloh pod 70 %. */
function blockGroup(p: FieldPart): BlockGroup | null {
  return sowingGroup(p) ?? (isEmergencyFallow(p) ? EMERGENCY_GROUP : null);
}

/** Blok osevu – díly jednoho úseku ve stejné skupině přílohové soustavy, od domu ven. */
interface SowingBlock {
  parts: FieldPart[];
  group: BlockGroup;
  sector: FieldSector;
  /** Hospodářství (id obydlí; díly bez políčka mají společné null). */
  holding: number | null;
  areaM2: number;
  /** Klíč pořadí v hospodářství (menší první). */
  key: number[];
}

/** Porovná klíče pořadí po složkách. */
function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Bloky osevu v pořadí, ve kterém je ves bere (fields.md – Hospodaření podle polohy domů): skupiny
 * přílohové soustavy jako dřív (osévané díly, které smějí dál; čerstvě založené; přílohy ≥ 95 %;
 * přílohy 70–95 %), v každé skupině po blocích – dílech jednoho úseku od domu ven. Pořadí bloků
 * v hospodářství:
 * - osévané díly: od úseku nejblíž domu,
 * - čerstvě založené: nejdřív bloky, před kterými v úseku neleží příloh, pak nejblíž domu,
 * - přílohy ≥ 95 %: nejdřív bez přílohu před sebou, pak úseky, které se už osévají (ves úsek
 *   dokončí), pak nejvíc odpočaté a nejblíž domu,
 * - přílohy 70–95 %: nejvíc zotavené, pak bez přílohu před sebou, rozběhnuté úseky, nejblíž domu,
 * - jen s `onlyGroup` = `EMERGENCY_GROUP` přílohy 40–70 % (nouzový osev) – stejně jako 70–95 %.
 * Mezi hospodářstvími se bloky střídají tak, aby každé mělo vybraný stejný podíl své plochy –
 * všechna hospodářství tak obíhají stejně rychle. Ves bez hospodářství (bez domů nebo jen
 * s díly bez políčka) bere díly po jednom v dřívějším pořadí `sowingOrder`. `onlyGroup` – jen
 * bloky jedné skupiny (hotové díly během roku). Díly nemění.
 */
export function sowingBlocks(
  parts: readonly FieldPart[],
  holdings: FieldHoldings,
  onlyGroup?: BlockGroup,
): FieldPart[][] {
  if (!holdings.active) {
    if (onlyGroup === EMERGENCY_GROUP) {
      // nejvíc zotavené první, při shodě nejbližší – jako přílohy 70–95 % (sowingOrder)
      return parts
        .filter(isEmergencyFallow)
        .sort((a, b) => b.fertilityShare - a.fertilityShare || a.distanceM - b.distanceM)
        .map((p) => [p]);
    }
    const candidates = onlyGroup ? parts.filter((p) => sowingGroup(p) === onlyGroup) : [...parts];
    return sowingOrder(candidates).map((p) => [p]);
  }
  // nouzový osev jen na vyžádání – běžné pořadí bere skupiny 1–4
  const groups: readonly BlockGroup[] =
    onlyGroup === EMERGENCY_GROUP ? [EMERGENCY_GROUP] : [1, 2, 3, 4];
  const byId = partsByIdOf(parts);
  const area = new Map<number | null, number>();
  const blocks: SowingBlock[] = [];
  for (const sector of holdings.sectors) {
    const list = sector.partIds.flatMap((id) => {
      const part = byId.get(id);
      return part ? [part] : [];
    });
    const holding = sector.dwellingId;
    area.set(holding, (area.get(holding) ?? 0) + list.reduce((sum, p) => sum + p.areaM2, 0));
    const inUse = list.some((p) => sowingGroup(p) === 1);
    // skupina každého dílu jednou (ne pro každou skupinu znovu) – tytéž bloky
    const groupOf = list.map(blockGroup);
    for (const group of groups) {
      const first = groupOf.indexOf(group);
      if (first < 0) continue;
      const members = list.filter((_, i) => groupOf[i] === group);
      // před blokem v úseku neleží příloh – sedlák k němu nemusí přes úhor
      const clear = list.slice(0, first).every((p) => p.state !== 'fallow') ? 0 : 1;
      const share =
        Math.round(Math.min(...members.map((p) => p.fertilityShare)) * SHARE_PRECISION) /
        SHARE_PRECISION;
      // vzdálenost od domu z úseku – jako mapa id → vzdálenost (při dvojím id platí poslední)
      const at = sector.partIds.lastIndexOf(members[0]!.id);
      const start = (at >= 0 ? sector.distances[at] : undefined) ?? 0;
      const using = inUse ? 0 : 1;
      const key =
        group === 1
          ? [start, sector.index]
          : group === 2
            ? [clear, start, sector.index]
            : group === 3
              ? [clear, using, -share, start, sector.index]
              : [-share, clear, using, start, sector.index];
      blocks.push({
        parts: members,
        group,
        sector,
        holding,
        areaM2: members.reduce((sum, p) => sum + p.areaM2, 0),
        key,
      });
    }
  }
  const taken = new Map<number | null, number>();
  const result: FieldPart[][] = [];
  for (const group of groups) {
    if (onlyGroup !== undefined && group !== onlyGroup) continue;
    const queues = new Map<number | null, SowingBlock[]>();
    for (const block of blocks) {
      if (block.group !== group) continue;
      const queue = queues.get(block.holding) ?? [];
      queue.push(block);
      queues.set(block.holding, queue);
    }
    for (const queue of queues.values()) queue.sort((a, b) => compareKeys(a.key, b.key));
    const heads = new Map([...queues].map(([holding]) => [holding, 0]));
    for (;;) {
      let pick: number | null | undefined;
      let pickShare = Infinity;
      let pickBlock: SowingBlock | null = null;
      for (const [holding, queue] of queues) {
        const block = queue[heads.get(holding)!];
        if (!block) continue;
        const share = (taken.get(holding) ?? 0) / (area.get(holding) || 1);
        const better =
          share < pickShare - EPSILON ||
          (Math.abs(share - pickShare) <= EPSILON &&
            pickBlock !== null &&
            compareKeys(block.key, pickBlock.key) < 0);
        if (pickBlock === null || better) {
          pick = holding;
          pickShare = share;
          pickBlock = block;
        }
      }
      if (pickBlock === null || pick === undefined) break;
      heads.set(pick, heads.get(pick)! + 1);
      taken.set(pick, (taken.get(pick) ?? 0) + pickBlock.areaM2);
      result.push(pickBlock.parts);
    }
  }
  return result;
}

/**
 * Pořadí, ve kterém k dílům plodiny postupuje práce (fields.md – Postup práce po čtvercích):
 * po úsecích – úsek s dílem nejblíž svému domu první, při shodě v pořadí úseků –, v úseku od domu
 * ven. Ves bez hospodářství: nejblíž obydlím první (`distanceM`), při shodě podle id.
 */
export function workOrder(holdings: FieldHoldings): WorkOrder {
  if (!holdings.active) return nearestFirst;
  return (parts) => {
    // díl bez úseku (nemá nastat – úseky se počítají ze stejných dílů) jde na konec
    const place = (p: FieldPart): { sector: number; distanceM: number } =>
      holdings.byPart.get(p.id) ?? { sector: holdings.sectors.length, distanceM: p.distanceM };
    const nearest = new Map<number, number>();
    for (const p of parts) {
      const { sector, distanceM } = place(p);
      nearest.set(sector, Math.min(nearest.get(sector) ?? distanceM, distanceM));
    }
    return [...parts].sort((a, b) => {
      const pa = place(a);
      const pb = place(b);
      return (
        nearest.get(pa.sector)! - nearest.get(pb.sector)! ||
        pa.sector - pb.sector ||
        pa.distanceM - pb.distanceM ||
        a.id - b.id
      );
    });
  };
}
