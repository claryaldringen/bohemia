import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { sowingGroup, sowingOrder, type SowingGroup } from './fields';
import type { FieldPart, TileCell, VillageState } from './types';
import { nearestFirst, type WorkOrder } from './year-plan';

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

/** Díl pro rozdělení: id, políčko (bez něj díl k hospodářství nepatří) a vzdálenost (staré díly). */
export interface HoldingPartInput {
  id: number;
  cell?: TileCell;
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
const EPSILON = 1e-9;
/** Úrodnost se v klíčích porovnává na miliontiny (přičítání po 0,025 nese chyby). */
const SHARE_PRECISION = 1e6;

/** Střed políčka ve světě (m) – krajina sídla má pevnou velikost (landscape/world.ts). */
function cellCenter(cell: TileCell): { x: number; z: number } {
  const half = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;
  return { x: -half + (cell.x + 0.5) * CELL_SIZE_M, z: -half + (cell.y + 0.5) * CELL_SIZE_M };
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

/** Hospodářství a úseky vsi (viz hlavička souboru). */
export function villageHoldings(state: VillageState): FieldHoldings {
  return fieldHoldings(holdingHouses(state), state.parts);
}

interface PlacedCell {
  id: number;
  cell: TileCell;
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
    const c = cellCenter(part.cell);
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
    list.push({ id: part.id, cell: part.cell, r: bestR, theta });
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
  const index = new Map(cells.map((c, i) => [`${c.cell.x},${c.cell.y}`, i]));
  const keep = new Set(fixed);
  return cells.map((c, i) => {
    const own = lanes[i]!;
    if (keep.has(i)) return own;
    const votes = new Map<number, number>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const j = index.get(`${c.cell.x + dx},${c.cell.y + dy}`);
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

/** Blok osevu – díly jednoho úseku ve stejné skupině přílohové soustavy, od domu ven. */
interface SowingBlock {
  parts: FieldPart[];
  group: SowingGroup;
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
 * - přílohy 70–95 %: nejvíc zotavené, pak bez přílohu před sebou, rozběhnuté úseky, nejblíž domu.
 * Mezi hospodářstvími se bloky střídají tak, aby každé mělo vybraný stejný podíl své plochy –
 * všechna hospodářství tak obíhají stejně rychle. Ves bez hospodářství (bez domů nebo jen
 * s díly bez políčka) bere díly po jednom v dřívějším pořadí `sowingOrder`. `onlyGroup` – jen
 * bloky jedné skupiny (hotové díly během roku). Díly nemění.
 */
export function sowingBlocks(
  parts: readonly FieldPart[],
  holdings: FieldHoldings,
  onlyGroup?: SowingGroup,
): FieldPart[][] {
  if (!holdings.active) {
    const candidates = onlyGroup ? parts.filter((p) => sowingGroup(p) === onlyGroup) : [...parts];
    return sowingOrder(candidates).map((p) => [p]);
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
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
    const distance = new Map(sector.partIds.map((id, i) => [id, sector.distances[i]!]));
    for (const group of [1, 2, 3, 4] as const) {
      const first = list.findIndex((p) => sowingGroup(p) === group);
      if (first < 0) continue;
      const members = list.filter((p) => sowingGroup(p) === group);
      // před blokem v úseku neleží příloh – sedlák k němu nemusí přes úhor
      const clear = list.slice(0, first).every((p) => p.state !== 'fallow') ? 0 : 1;
      const share =
        Math.round(Math.min(...members.map((p) => p.fertilityShare)) * SHARE_PRECISION) /
        SHARE_PRECISION;
      const start = distance.get(members[0]!.id) ?? 0;
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
  for (const group of [1, 2, 3, 4] as const) {
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
