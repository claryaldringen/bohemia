import { dateOfDayIndex } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import { startedPartIds, taskPosition, taskSpans } from './field-progress';
import { partWalkDistance } from './fields';
import { bandLengthM, bandPartWeight, furrowEfficiency, ploughLayout } from './plough-blocks';
import { roadCapsules, roadFreeRuns, type RoadCapsule } from './paths/road-land';
import { villageCartRoutes } from './paths/roads';
import { TEAM_TRAVEL } from './rules';
import { fieldGridOf } from './squares';
import { rotationCosSin, squareCenter } from './square-grid';
import type { Crop, CropWork, FieldPart, PloughBand, PloughWork, VillageState } from './types';
import { cropTaskWindows, cropTaskRemaining, seasonCrops, windowEndOf } from './year-plan';

// Výkon spřežení za den (oxen.md – Co nejdelší brázda): kromě sazby orby ho ubírají obraty na
// souvrati (krátká brázda – `furrowEfficiency` pásu, který se právě orá) a cesta k bloku
// (Martin, 19. 10. 2026: „na místo se dostane ideálně po nějaké už hotové cestě a pak už
// jen co nejvíce oře“; „pokud to bude rychlejší než po cestě, ať jede napříč přes pole, pokud už
// nebude oseté“ – vozová síť, dvoukolák bez nákladu: pevná cesta rychleji podle druhu – vyježděná
// a upravená víc než vyšlapaná (CART_SPEED), louka a úhor jako louka, strniště, zoraný díl
// a mokřina pomaleji, osetý nikdy). Spřežení zůstane na poli, dokud nezorá, co okno potřebuje
// (oxen.md – Spřežení zůstane na poli; Martin, 24. 10. 2026) – cesta jen při výjezdu z ohrady
// a přesunu k dalšímu bloku, návrat jde po poslední brázdě.

const EPS = 1e-9;

/** Vůz dojede k dílu, když je od jeho středu nejvýš tak daleko (m) – kraj čtverce. */
const BLOCK_REACH_M = 9;

/** Pás, na kterém orba plodiny právě je (první nedokončený), a díl, kde v něm začíná. */
export function ploughFrontBand(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
): PloughBand | null {
  const bands = work.plough?.bands;
  if (!bands || bands.length === 0) return null;
  const position = taskPosition(work, 'plough');
  const front = taskSpans(work, partsById, 'plough', day).find((s) => s.end > position + 1e-9);
  if (!front) return null;
  return bands.find((band) => band.partIds.includes(front.id)) ?? null;
}

/**
 * Pásy nezačatých dílů rozvrhne znovu (oxen.md – Co nejdelší brázda; fields.md – Osevní postup po
 * dílech; mutuje `work`): díly přibývají po dávkách (čelo práce), dávka s vlastními bloky by
 * brázdu zkrátila. Pásy za posledním pásem, na kterém začala některá úloha (i vracení přílohu),
 * se s přidanou dávkou rozvrhnou spolu (`ploughLayout`) – hotová práce, čelo i rozpracovaný pás
 * zůstanou, nové bloky dostanou čísla za všemi dosavadními (spřežení k nim jede jako k dalšímu
 * bloku). Volat po přidání dávky (`addToCropWork`).
 */
export function relayUntouchedBands(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
): void {
  const plough = work.plough;
  const bands = plough?.bands;
  if (!plough || !bands || bands.length < 2) return;
  const started = startedPartIds(work, partsById, day);
  let cut = -1;
  bands.forEach((band, i) => {
    if (band.partIds.some((id) => started.has(id))) cut = i;
  });
  const tail = bands.slice(cut + 1);
  if (tail.length < 2) return;
  const tailIds = new Set(tail.flatMap((band) => band.partIds));
  const parts = [...tailIds].flatMap((id) => {
    const part = partsById.get(id);
    return part ? [part] : [];
  });
  if (parts.length !== tailIds.size) return;
  const layout = ploughLayout(parts);
  const next = bands.reduce((max, band) => Math.max(max, band.block + 1), 0);
  plough.bands = [
    ...bands.slice(0, cut + 1),
    ...layout.bands.map((band) => ({ ...band, block: band.block + next })),
  ];
  const order = layout.order.map((p) => p.id);
  plough.partIds = [...plough.partIds.filter((id) => !tailIds.has(id)), ...order];
  work.partIds = [...work.partIds.filter((id) => !tailIds.has(id)), ...order];
}

/**
 * Cena cesty spřežení k dílu (m jízdy po louce): vozovou sítí z ohrady se spřežením (s krajinou),
 * jinak chůze z obydlí k dílu.
 */
function tripCost(
  state: VillageState,
  day: number,
  part: FieldPart,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): number {
  if (landscape && part.cell) {
    const center = squareCenter(landscape, fieldGridOf(state, part.fieldId), part.cell);
    const routes = villageCartRoutes(state, day, landscape, obstacles, 'two-wheel', [
      { x: center.x, z: center.z, reachM: BLOCK_REACH_M },
    ]);
    const route = routes?.[0];
    if (route?.reached) return route.cost;
  }
  return partWalkDistance(part);
}

/** Kratší kus brázdy mezi cestami (m) se neorá – spřežení se do něj nevejde (obrat). */
const MIN_FURROW_PIECE_M = 2;

/**
 * Délka brázdy pásu (m): pás přes pevnou cestu se na ní láme (Martin, 19. 10. 2026: „pokud oráč
 * narazí na cestu, tak spřežení otočí“) – kusy mezi cestami se orají zvlášť, každý s vlastními
 * obraty, takže výkon počítá s průměrnou délkou kusu (podíl času, kdy rádlo ryje, je
 * ΣL / (ΣL + n·v·t) – jako u n brázd průměrné délky). Osa pásu jeho středem, cesty jako
 * v `roadLand` (pás a plácky rozcestí – `capsules`, jinak z cest vsi). Bez krajiny nebo cest
 * délka pásu.
 */
export function bandFurrowM(
  state: Pick<VillageState, 'fields' | 'roads'>,
  band: PloughBand,
  partsById: ReadonlyMap<number, FieldPart>,
  landscape: Landscape | null,
  capsules: readonly RoadCapsule[] | null = null,
): number {
  const length = bandLengthM(band, partsById);
  const roads = state.roads?.roads ?? [];
  const first = partsById.get(band.partIds[0]!);
  const last = partsById.get(band.partIds[band.partIds.length - 1]!);
  if (!landscape || roads.length === 0 || !first?.cell || !last?.cell) return length;
  const grid = fieldGridOf(state, first.fieldId);
  const a = squareCenter(landscape, grid, first.cell);
  const b = squareCenter(landscape, grid, last.cell);
  // podél brázdy – osa mřížky pole (jako `squareCenter`: x → (c, −s), y → (s, c))
  const [c, s] = grid ? rotationCosSin(grid.rotation) : [1, 0];
  const [dx, dz] = band.axis === 'x' ? [c, -s] : [s, c];
  const span = (b.x - a.x) * dx + (b.z - a.z) * dz;
  const half = landscape.cellSizeM / 2;
  const runs = roadFreeRuns(
    capsules ?? roadCapsules(roads),
    a.x,
    a.z,
    dx,
    dz,
    Math.min(0, span) - half,
    Math.max(0, span) + half,
    MIN_FURROW_PIECE_M,
  );
  if (runs.length === 0) return MIN_FURROW_PIECE_M;
  const free = runs.reduce((sum, r) => sum + (r.to - r.from), 0);
  // cesta pás nekříží – délka pásu jako bez cest
  if (runs.length === 1 && free >= Math.abs(span) + 2 * half - 1e-6) return length;
  return free / runs.length;
}

/**
 * Podíl dne, který spřežení orá, když cesta k bloku stojí `costM` (m jízdy po louce) – jen cesta
 * k bloku (výjezd nebo přesun), večerní návrat je zadarmo (návrh Clauda).
 */
export function travelShare(costM: number): number {
  const seconds = costM / TEAM_TRAVEL.speedMps;
  return 1 - Math.min(TEAM_TRAVEL.maxShare, seconds / TEAM_TRAVEL.dayS);
}

/**
 * Cesta spřežení plodiny dnes (oxen.md – Spřežení zůstane na poli): k bloku `block` z ohrady
 * (`from` null) nebo od bloku `from`, cena m jízdy po louce.
 */
export interface PloughTravel {
  block: number;
  from: number | null;
  costM: number;
}

/**
 * Cesty spřežení dne po plodinách: cesta (null – spřežení už u bloku) a orba plodiny ráno.
 * Spočítá se jednou za den (`ploughDayFactor`), zapíše se večer (`settlePloughTeams`).
 */
export type PloughTravels = Map<CropWork, { travel: PloughTravel | null; done: number }>;

/** Je spřežení plodiny na poli (`PloughWork.trip` bez návratu)? */
function afield(plough: PloughWork | undefined): boolean {
  return plough?.trip !== undefined && plough.trip.home === undefined;
}

/**
 * Je ráno některé spřežení vsi na poli (oxen.md – Spřežení zůstane na poli)? S `day` se starší
 * `trip` bez příjezdu (`arrived`) mimo okno orby nepočítá: spřežení by večer šlo domů, ale jeho
 * první ráno by jinak odečetlo vozům všechny páry a zrušilo vodu.
 */
export function ploughTeamsAfield(state: Pick<VillageState, 'season'>, day?: number): boolean {
  if (!state.season) return false;
  const month = day === undefined ? null : dateOfDayIndex(day).month;
  return seasonCrops(state.season).some(({ crop, work }) => {
    if (!afield(work.plough)) return false;
    // starší ves bez příjezdu: mimo okno orby (ani dnes se neoře) je spřežení už doma
    if (month !== null && !work.plough?.trip?.arrived)
      return windowEndOf(cropTaskWindows(crop, 'plough'), month) !== null;
    return true;
  });
}

/** Díl, u kterého spřežení blok `block` dooralo – první díl posledního pásu bloku. */
export function ploughBlockEndPart(
  plough: PloughWork,
  block: number,
  partsById: ReadonlyMap<number, FieldPart>,
): FieldPart | null {
  const bands = (plough.bands ?? []).filter((b) => b.block === block);
  const last = bands[bands.length - 1];
  return last ? (partsById.get(last.partIds[0]!) ?? null) : null;
}

/**
 * Cena přesunu spřežení od dílu `from` k dílu `to` (m jízdy po louce): vozovou sítí odtud
 * (s krajinou), jinak rozdíl chůze dílů od obydlí.
 */
function moveCost(
  state: VillageState,
  day: number,
  from: FieldPart,
  to: FieldPart,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): number {
  if (landscape && from.cell && to.cell) {
    const a = squareCenter(landscape, fieldGridOf(state, from.fieldId), from.cell);
    const b = squareCenter(landscape, fieldGridOf(state, to.fieldId), to.cell);
    const route = villageCartRoutes(
      state,
      day,
      landscape,
      obstacles,
      'two-wheel',
      [{ x: b.x, z: b.z, reachM: BLOCK_REACH_M }],
      { x: a.x, z: a.z },
    )?.[0];
    if (route?.reached) return route.cost;
  }
  return Math.abs(partWalkDistance(to) - partWalkDistance(from));
}

/** Cesta spřežení plodiny k pásu `band` dnes – null, když už u jeho bloku je. */
function travelToday(
  state: VillageState,
  day: number,
  plough: PloughWork,
  band: PloughBand,
  partsById: ReadonlyMap<number, FieldPart>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): PloughTravel | null {
  const trip = plough.trip;
  const there = afield(plough);
  if (there && trip!.block === band.block) return null;
  const first = partsById.get(band.partIds[0]!);
  if (!first) return { block: band.block, from: there ? trip!.block : null, costM: 0 };
  if (!there) {
    return {
      block: band.block,
      from: null,
      costM: tripCost(state, day, first, landscape, obstacles),
    };
  }
  const end = ploughBlockEndPart(plough, trip!.block, partsById);
  return {
    block: band.block,
    from: trip!.block,
    costM: end ? moveCost(state, day, end, first, landscape, obstacles) : 0,
  };
}

/**
 * Násobek denní kapacity orby plodiny: výkon podle délky brázdy pásu, který se orá, krát podíl dne
 * bez cesty k bloku – jen v den výjezdu z ohrady nebo přesunu k dalšímu bloku (oxen.md – Spřežení
 * zůstane na poli). Cestu dne určí první volání (`travels`), stav nemění – zapíše ho večer
 * `settlePloughTeams`. Plodina bez pásů (plán starší vsi) 1.
 */
export function ploughDayFactor(
  state: VillageState,
  day: number,
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  travels: PloughTravels = new Map(),
): number {
  const plough = work.plough;
  const band = plough ? ploughFrontBand(work, partsById, day) : null;
  if (!plough || !band) return 1;
  let today = travels.get(work);
  if (!today) {
    today = {
      travel: travelToday(state, day, plough, band, partsById, landscape, obstacles),
      done: plough.done,
    };
    travels.set(work, today);
  }
  return (
    furrowEfficiency(bandFurrowM(state, band, partsById, landscape)) *
    (today.travel ? travelShare(today.travel.costM) : 1)
  );
}

/**
 * Večer dne (oxen.md – Spřežení zůstane na poli; mutuje `PloughWork.trip`): spřežení plodiny,
 * které dnes vyjelo nebo se přesunulo a oralo, je u nového bloku; spřežení na poli se vrátí do
 * ohrady, když je zoráno vše, co okno potřebuje, okno zítra už neběží nebo ves páry s rádlem
 * nemá (`noTeams`). Dny bez orby zůstává na poli – i když má plodina zoráno, ale nutné díly
 * plodiny čekají na čelo práce (`waiting` – přibudou, až lidé dosejí; Martin 24. 10. 2026).
 */
export function settlePloughTeams(
  state: VillageState,
  day: number,
  travels: PloughTravels,
  noTeams: boolean,
  waiting: ReadonlySet<Crop> = new Set(),
): void {
  if (!state.season) return;
  const tomorrow = dateOfDayIndex(day + 1).month;
  for (const { crop, work } of seasonCrops(state.season)) {
    const plough = work.plough;
    if (!plough) continue;
    const today = travels.get(work);
    if (today?.travel && plough.done > today.done + EPS) {
      const { block, from, costM } = today.travel;
      plough.trip = { block, costM, arrived: { day, from } };
    }
    if (!afield(plough)) continue;
    const more = !work.surplus && waiting.has(crop);
    if (
      noTeams ||
      (cropTaskRemaining(work, 'plough') <= EPS && !more) ||
      windowEndOf(cropTaskWindows(crop, 'plough'), tomorrow) === null
    ) {
      plough.trip!.home = day;
    }
  }
}

/**
 * Očekávaný výkon orby pro plán osevu (podíl výkonu u referenční brázdy): průměr výkonu podle
 * délky brázdy přes pásy, na které by se díly polí `parts` rozpadly (váhou dílů); s krajinou se
 * brázda láme na pevných cestách vsi (`bandFurrowM`). Bez dílů 1.
 */
export function plannedFurrowEfficiency(
  parts: readonly FieldPart[],
  state: Pick<VillageState, 'fields' | 'roads'> | null = null,
  landscape: Landscape | null = null,
): number {
  const { bands } = ploughLayout(parts);
  const byId = new Map(parts.map((p) => [p.id, p]));
  // pásy cest jednou pro všechny pásy orby
  const capsules = state && landscape ? roadCapsules(state.roads?.roads ?? []) : null;
  let weight = 0;
  let sum = 0;
  for (const band of bands) {
    const w = band.partIds.reduce((s, id) => s + bandPartWeight(byId.get(id)!), 0);
    weight += w;
    const length =
      state && landscape
        ? bandFurrowM(state, band, byId, landscape, capsules)
        : bandLengthM(band, byId);
    sum += w * furrowEfficiency(length);
  }
  return weight > 0 ? sum / weight : 1;
}
