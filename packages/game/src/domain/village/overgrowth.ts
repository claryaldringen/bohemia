import { dateOfDayIndex, dayIndexOf } from '../calendar';
import { isOvergrown, overgrowthStage, partOvergrowthYears } from './fields';
import { mownPartIds } from './hay';
import { grazingDemandHa, villageHerds } from './livestock';
import { villageOxen } from './oxen';
import { OVERGROWTH } from './rules';
import type { ChronicleEvent, FieldPart, VillageState, VillageWood } from './types';

// Zarůstání přílohu (fields.md – Zarůstání; Martin, 18. 10. 2026: „Ano udělej to tak“ –
// nepasený a nesečený příloh zarůstá, les z pole vypadne). Stáda se pasou napřed na nejbližším
// přílohu ve fázi louky (`fallowGrazing` – tutéž funkci používá síť pěšin a scéna, kam stáda
// chodí), ves seče na seno díly úhoru (hay.ts). Díl, který se za vegetační období nespásl ani
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
 * Pastva stád po dílech přílohu (fields.md – Zarůstání, diet.md – Pastva po dílech): potřeba
 * pastvy `demandHa` (`grazingDemandHa` – ≈ 1 ha na krávu a vola, 0,2 ha na ovci a kozu) se
 * rozdělí po dílech přílohu ve fázi louky od nejbližšího k obydlí (přímá vzdálenost dílu, při
 * shodě id), každému nejvýš jeho plocha; zbytek se pase na loukách krajiny. Vrátí id dílu →
 * spasené ha (jen díly, na které něco připadlo). Díly nemění.
 */
export function fallowGrazing(parts: readonly FieldPart[], demandHa: number): Map<number, number> {
  const grazing = new Map<number, number>();
  let left = demandHa;
  if (left <= EPSILON) return grazing;
  const pasture = parts
    .filter(isGrazeableFallow)
    .sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
  for (const part of pasture) {
    if (left <= EPSILON) break;
    const ha = Math.min(left, part.areaM2 / M2_PER_HA);
    grazing.set(part.id, ha);
    left -= ha;
  }
  return grazing;
}

/**
 * Díly přílohu, které stáda spásají – připadla na ně aspoň polovina jejich plochy potřeby pastvy
 * (OVERGROWTH.grazedMinShare, `fallowGrazing`).
 */
export function grazedPartIds(parts: readonly FieldPart[], demandHa: number): Set<number> {
  const areas = new Map(parts.map((p) => [p.id, p.areaM2 / M2_PER_HA]));
  const grazed = new Set<number>();
  for (const [id, ha] of fallowGrazing(parts, demandHa)) {
    const area = areas.get(id) ?? 0;
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
  const demand = grazingDemandHa(villageHerds(state), villageOxen(state));
  const grazed = grazedPartIds(state.parts, demand);
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
  for (const part of forest) {
    if (!part.cell) continue;
    const center = geometry ? cellCenter(geometry, part.cell.x, part.cell.y) : null;
    woods.push({
      cell: { x: part.cell.x, y: part.cell.y },
      ...(center ? { x: center.x, z: center.z } : {}),
      areaM2: part.areaM2,
      surface: part.surface,
      day,
    });
  }
  if (woods.length > 0) state.woods = woods;
  state.parts = state.parts.filter((p) => !removed.has(p.id));
  const mowing = state.hay?.mowing;
  if (mowing) {
    mowing.partIds = mowing.partIds.filter((id) => !removed.has(id));
    if (mowing.partIds.length === 0) state.hay!.mowing = null;
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
