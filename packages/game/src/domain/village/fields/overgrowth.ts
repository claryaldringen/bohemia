import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { isOvergrown, overgrowthStage, partOvergrowthYears } from './fields';
import { mownPartIds } from '../livestock/hay';
import { herdingCoverage } from '../livestock/herding';
import { grazingDemandHa, naturalPastureHa, villageHerds } from '../livestock/livestock';
import { partsByIdOf } from '../core/parts-by-id';
import { pastureGrazing } from './pasture';
import { keepSwathsClearOfWoods } from '../roads/road-swath';
import { villageOxen } from '../livestock/oxen';
import { horsesInPlaces, villageHorses } from '../livestock/horses';
import { OVERGROWTH } from '../rules';
import { copyGrid, squareCenter } from '../placement/square-grid';
import { fieldGridOf } from '../placement/squares';
import type { ChronicleEvent, FieldPart, VillageState, VillageWood } from '../types';

// Zarůstání přílohu (fields.md – Zarůstání; Martin, 18. 10. 2026: „Ano udělej to tak“ –
// nepasený a nesečený příloh zarůstá, les z pole vypadne). Stáda se pasou na pastvinách vsi
// (`pastureGrazing` v pasture.ts – tutéž funkci používá síť pěšin a scéna, kam stáda chodí),
// ves seče na seno díly úhoru (hay.ts). Díl, který se za vegetační období nespásl ani
// neposekl, zarůstá: roky bez pastvy a seče přibývají 1. 11., ve fázi louky je pastva nebo seč
// vynuluje, od křovin už ne. Díl v lese (30 let) z pole vypadne a zůstane lesem vsi (woods.ts).

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Je díl přílohem, na kterém se dá pást (mladý příloh, louka – ne křoviny ani mladý les)? */
export function isGrazeableFallow(part: Pick<FieldPart, 'state' | 'overgrowthYears'>): boolean {
  return part.state === 'fallow' && !isOvergrown(part);
}

/**
 * Díly přílohu, které stáda spásají (fields.md – Zarůstání, diet.md – Pastva): potřeba pastvy
 * `demandHa` se rozdělí po pastvinách (`pastureGrazing` – louka mimo seč od nejbližšího,
 * přirozené louky, mladý příloh, otava) a spásl se díl, na který připadla aspoň polovina jeho
 * plochy (OVERGROWTH.grazedMinShare).
 */
export function grazedPartIds(state: VillageState, day: number, demandHa: number): Set<number> {
  // plocha dílu z mapy dílů z paměti (`partsByIdOf` – při dvojím id platí poslední jako dřív
  // u nové mapy ploch; jen zrychlení)
  const byId = partsByIdOf(state.parts);
  const grazed = new Set<number>();
  for (const [id, ha] of pastureGrazing(state, day, demandHa, naturalPastureHa(state))) {
    const part = byId.get(id);
    const area = part ? part.areaM2 / M2_PER_HA : 0;
    if (area > 0 && ha >= OVERGROWTH.grazedMinShare * area - EPSILON) grazed.add(id);
  }
  return grazed;
}

/** Je den `day` dnem ročního kroku zarůstání (1. 11.)? */
export function isOvergrowthDay(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === OVERGROWTH.yearDay.month && date.day === OVERGROWTH.yearDay.day;
}

/** Mřížka krajiny pro střed políčka lesa vsi – vrstva překážek i krajina ji mají. */
export interface CellGeometry {
  readonly size: number;
  readonly cellSizeM: number;
}

/**
 * Roční krok zarůstání (1. 11., před porážkou – stáda jsou letní; mutuje stav): díly přílohu,
 * které ležely ladem celé vegetační období (od 1. 4.), se nespásly (`grazedPartIds` se stády
 * a voly vsi) ani neposekly (`mownPartIds`), přidají rok bez pastvy a seče; ve fázi louky se jim
 * pastvou nebo sečí počet vynuluje, od křovin přibývá i se pastvou. Díly v lese (OVERGROWTH_STAGES)
 * z pole vypadnou do lesa vsi (`geometry` – střed políčka pro stromy lesa; bez ní les stromy
 * nemá). Jiný den nic nedělá. Vrátí události kroniky.
 */
export function overgrowthDay(
  state: VillageState,
  day: number,
  geometry: CellGeometry | null,
): ChronicleEvent[] {
  if (!isOvergrowthDay(day)) return [];
  const fallow = state.parts.filter((p) => p.state === 'fallow');
  if (fallow.length === 0) return [];
  const { year } = dateOfDayIndex(day);
  const seasonStart = dayIndexOf({ year, ...OVERGROWTH.seasonStart });
  // jen co pasáci uhlídali – stádo bez pasáka se nepase (diet.md – Pasáci)
  // i koně (horses.md – Krmení: pasou se se stády)
  const horses = horsesInPlaces(villageHorses(state), day);
  const demand =
    grazingDemandHa(villageHerds(state), villageOxen(state), horses) * herdingCoverage(state);
  const grazed = grazedPartIds(state, day, demand);
  const mown = mownPartIds(state);
  for (const part of fallow) {
    if (part.fallowSinceDay === null || part.fallowSinceDay > seasonStart) continue;
    const years = partOvergrowthYears(part);
    const kept = overgrowthStage(years) === 'meadow' && (grazed.has(part.id) || mown.has(part.id));
    if (kept) delete part.overgrowthYears;
    else part.overgrowthYears = years + 1;
  }
  return dropForestParts(state, day, geometry);
}

/** Střed políčka ve světě (m) – jako `tileCenterWorld` krajiny. */
function cellCenter(geometry: CellGeometry, x: number, y: number): { x: number; z: number } {
  const half = (geometry.size * geometry.cellSizeM) / 2;
  return { x: -half + (x + 0.5) * geometry.cellSizeM, z: -half + (y + 0.5) * geometry.cellSizeM };
}

/**
 * Díly v lese vypadnou z pole (mutuje stav – fields.md, Zarůstání): díl zmizí z pole, ze seče
 * i z rozdělení práce dne a na jeho čtverci zůstane les vsi; pole bez dílů zanikne i se svou
 * stavbou. Kronika: jedna událost na pole.
 */
function dropForestParts(
  state: VillageState,
  day: number,
  geometry: CellGeometry | null,
): ChronicleEvent[] {
  const forest = state.parts.filter(
    (p) => p.state === 'fallow' && overgrowthStage(partOvergrowthYears(p)) === 'forest',
  );
  if (forest.length === 0) return [];
  const removed = new Set(forest.map((p) => p.id));
  const woods: VillageWood[] = [...(state.woods ?? [])];
  const before = woods.length;
  for (const part of forest) {
    if (!part.cell) continue;
    // les z natočeného pole leží v jeho mřížce (fields.md – Natočené stavby)
    const grid = fieldGridOf(state, part.fieldId);
    const center = geometry
      ? grid
        ? squareCenter(geometry, grid, part.cell)
        : cellCenter(geometry, part.cell.x, part.cell.y)
      : null;
    woods.push({
      cell: { x: part.cell.x, y: part.cell.y },
      ...(grid ? { grid: copyGrid(grid) } : {}),
      ...(center ? { x: center.x, z: center.z } : {}),
      areaM2: part.areaM2,
      surface: part.surface,
      day,
    });
  }
  if (woods.length > 0) state.woods = woods;
  // les vsi do průseku lesem nevstoupí (roads.md – Průsek lesem)
  keepSwathsClearOfWoods(state, woods.slice(before), day);
  state.parts = state.parts.filter((p) => !removed.has(p.id));
  const hay = state.hay;
  const mowing = hay?.mowing;
  if (hay && mowing) {
    mowing.partIds = mowing.partIds.filter((id) => !removed.has(id));
    if (mowing.squares) {
      mowing.squares = mowing.squares.filter(
        (sq) => sq.partId === undefined || !removed.has(sq.partId),
      );
    }
    if (mowing.partIds.length === 0 && (mowing.squares?.length ?? 0) === 0) hay.mowing = null;
  }
  for (const share of state.labor?.shares ?? []) {
    if (share.target.kind !== 'field' || !share.target.parts) continue;
    share.target.parts = share.target.parts.filter((id) => !removed.has(id));
  }
  const byField = new Map<number, FieldPart[]>();
  for (const part of forest)
    byField.set(part.fieldId, [...(byField.get(part.fieldId) ?? []), part]);
  const events: ChronicleEvent[] = [];
  for (const [fieldId, parts] of [...byField].sort((a, b) => a[0] - b[0])) {
    const gone = !state.parts.some((p) => p.fieldId === fieldId);
    if (gone) {
      state.fields = state.fields.filter((f) => f.id !== fieldId);
      state.constructions = state.constructions.filter(
        (c) => !(c.kind === 'field' && c.fieldId === fieldId),
      );
    }
    events.push({
      day,
      kind: 'part-became-forest',
      partId: Math.min(...parts.map((p) => p.id)),
      fieldId,
      parts: parts.length,
      gone,
    });
  }
  return events;
}
