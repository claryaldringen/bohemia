// Konce cesty a roky chůze pro kroniku (roads.md – kronika; Martin 14. 11. 2026: „Po 12 letech
// chůze lidé vyšlapali cestu mezi dvorcem a studnou.“, „Podél cesty mezi dvorcem a kovárnou byly
// vysazeny jabloně.“). Co leží na koncích cesty hráče (`roadChainEnds` – jako panel cesty), se
// uloží do zápisu, ať popis sedí i po pozdější přestavbě sítě. Jen čtení stavu a celá čísla dnů.

import type { Landscape } from '../../landscape';
import type { ChronicleLandmark, ChronicleRoadEnd, VillageState } from '../types';
import { roadChain } from './road-chains';
import {
  chainEnds,
  roadChainEnds,
  roadEndsNetwork,
  type RoadEnd,
  type RoadEndsNetwork,
} from './road-ends';
import { roadEndLandmarks } from './road-landmarks';
import { ROAD_WALKED } from '../rules';
import { DAYS_PER_YEAR, resample, toSegment } from './roads-geometry';
import { routePoints } from './routes';

/** Přírodní cíle tras – chodí se k nim od založení vsi (předpona klíče trasy). */
const NATURAL_PLACES: ReadonlySet<string> = new Set([
  'water',
  'wood',
  'pasture',
  'meadow',
  'oak',
  'grove',
]);

function placeParts(place: string): { prefix: string; id: number } {
  const [prefix = '', rest] = place.split(':');
  return { prefix, id: Number(rest) };
}

/** Místo na konci cesty pro kroniku: obydlí (druh, dílna), jinak předpona klíče trasy. */
function placeNote(state: VillageState, place: string): ChronicleRoadEnd {
  const { prefix, id } = placeParts(place);
  if (prefix === 'd' || prefix === 'dwelling' || prefix === 'site') {
    const dwelling = state.dwellings.find((d) => d.id === id);
    if (dwelling) {
      return {
        kind: 'dwelling',
        type: dwelling.type,
        ...(dwelling.workshop ? { craft: dwelling.workshop.craft } : {}),
      };
    }
    // staveniště, které není obydlí, je humno (network-targets – `site:<id humna>`)
    if (prefix === 'site') return { kind: 'place', place: 'threshing-floor' };
  }
  if (prefix === 'sacred') {
    const building = state.sacredBuildings?.find((b) => b.id === id);
    return { kind: 'place', place: building?.kind ?? 'idol' };
  }
  // voda u řeky nese `water:river` (road-anchors – `waterKindAt`), potok jen `water`
  if (prefix === 'water' && place === 'water:river') return { kind: 'place', place };
  return { kind: 'place', place: prefix };
}

/**
 * Konec cesty pro kroniku; konec nikam (porušení pravidla 11) null. Křižovatka s významným místem
 * u ní (`near` – D66, `roadEndLandmarks`).
 */
function endNote(
  state: VillageState,
  end: RoadEnd,
  near: ChronicleLandmark | null,
): ChronicleRoadEnd | null {
  switch (end.kind) {
    case 'place':
      return placeNote(state, end.place);
    case 'junction': {
      const junction = (state.roads?.junctions ?? []).find((j) => j.id === end.id);
      return { kind: 'junction', shape: junction?.shape ?? 'cross', ...(near ? { near } : {}) };
    }
    case 'edge':
      return { kind: 'edge', direction: end.direction };
    case 'road':
      return { kind: 'road' };
    case 'none':
      return null;
  }
}

/**
 * Odkdy se ke konci cesty chodí (herní den, návrh Clauda): den dostavění stavby (obydlí, hřbitov,
 * ohrada, humno, modla, svatyně), vykopání jámy, první výsadby sadu; přírodní cíl a kraj mapy od
 * založení vsi. Křižovatka a jiná cesta nic neurčují (null) – chodí se po nich k místu na druhém
 * konci. Místo, jehož stáří stav nezná (pole, milíř, rudiště…), undefined – roky chůze nejdou určit.
 */
function walkedSince(state: VillageState, end: RoadEnd): number | null | undefined {
  if (end.kind === 'junction' || end.kind === 'road') return null;
  if (end.kind === 'edge') return state.foundedDay;
  if (end.kind === 'none') return undefined;
  const { prefix, id } = placeParts(end.place);
  if (NATURAL_PLACES.has(prefix)) return state.foundedDay;
  const built = (day: number | null | undefined): number | undefined => day ?? undefined;
  switch (prefix) {
    case 'd':
    case 'dwelling':
    case 'site': {
      const dwelling = state.dwellings.find((d) => d.id === id);
      if (dwelling) return dwelling.builtDay;
      return prefix === 'site'
        ? built(state.threshingFloors?.find((f) => f.id === id)?.builtDay)
        : undefined;
    }
    case 'cemetery':
      return built(state.cemeteries?.find((c) => c.id === id)?.builtDay);
    case 'pen':
      return built(state.pens?.find((p) => p.id === id)?.builtDay);
    case 'threshing-floor':
      return built(state.threshingFloors?.find((f) => f.id === id)?.builtDay);
    case 'idol':
    case 'shrine':
    case 'sacred':
      return state.sacredBuildings?.find((b) => b.id === id)?.builtDay;
    case 'grain-pit':
      return state.grainPits?.find((p) => p.id === id)?.dugDay;
    case 'orchard': {
      let first: number | undefined;
      for (const square of state.orchards?.find((o) => o.id === id)?.squares ?? []) {
        if (square.plantedDay !== null && (first === undefined || square.plantedDay < first)) {
          first = square.plantedDay;
        }
      }
      return first;
    }
    default:
      return undefined;
  }
}

/** Oba konce cesty pro kroniku; s koncem nikam null. */
function endNotes(
  state: VillageState,
  net: RoadEndsNetwork,
  ends: readonly [RoadEnd, RoadEnd],
): [ChronicleRoadEnd, ChronicleRoadEnd] | null {
  if (ends[0].kind === 'none' || ends[1].kind === 'none') return null;
  const near = roadEndLandmarks(state, net, ends);
  const a = endNote(state, ends[0], near[0]);
  const b = endNote(state, ends[1], near[1]);
  return a && b ? [a, b] : null;
}

/** Konce cesty hráče s úsekem `roadId` pro kroniku; bez úseku nebo s koncem nikam null. */
export function chronicleRoadEnds(
  state: VillageState,
  net: RoadEndsNetwork,
  roadId: number,
): [ChronicleRoadEnd, ChronicleRoadEnd] | null {
  const ends = roadChainEnds(net, roadId);
  return ends ? endNotes(state, net, ends) : null;
}

/**
 * Zarůstající úsek `roadId` pro kroniku (D67; Martin 15. 11. 2026: „Nepoužívaná cesta zarostla. –
 * tohle také neříká nic o tom, která to byla cesta.“): konce cesty hráče, do které patří, ještě
 * před zánikem (`cutDeadRoads` je bere napřed) a id úseků té cesty – zarostla-li jen část.
 * Opuštěný kus (pod stavbou) do cesty hráče nepatří – nese konce cesty z řezu (`Road.formerEnds`).
 */
export function overgrownRoadNote(
  state: VillageState,
  net: RoadEndsNetwork,
  roadId: number,
): { ends?: [ChronicleRoadEnd, ChronicleRoadEnd]; chain: number[]; part?: true } {
  const chain = roadChain(net.roads, roadId);
  if (chain.length === 0) {
    // opuštěný kus pod stavbou – konce cesty, ze které se vyřízl (`Road.formerEnds`)
    const former = net.roads.find((r) => r.id === roadId)?.formerEnds;
    return former ? { chain: [], ends: former, part: true } : { chain: [] };
  }
  const found = chainEnds(net, chain);
  const ends = found ? endNotes(state, net, found) : null;
  return { chain: chain.map((link) => link.road.id), ...(ends ? { ends } : {}) };
}

/**
 * Odkdy se po úseku opravdu chodí (D89, návrh Clauda): nejstarší den, kdy mohla začít chodit
 * některá z uložených tras, které po úseku vedou (`ROAD_WALKED.share` bodů osy do buňky od čáry
 * trasy) – trasa začne, až když stojí obě její místa. Trasy s neznámým stářím konce se přeskočí;
 * bez tras (nebo bez `net.cellM`) undefined.
 */
function routeWalkedSince(
  state: VillageState,
  net: RoadEndsNetwork,
  roadId: number,
): number | undefined {
  const axis = net.roads.find((r) => r.id === roadId)?.points;
  const cellM = net.cellM;
  if (!axis || axis.length < 2 || cellM === undefined) return undefined;
  const samples = resample(axis, null, 1).points;
  let earliest: number | undefined;
  for (const route of state.routes?.list ?? []) {
    const from = walkedSince(state, { kind: 'place', place: route.from, anchor: 'goal' });
    const to = walkedSince(state, { kind: 'place', place: route.to, anchor: 'goal' });
    if (typeof from !== 'number' || typeof to !== 'number') continue;
    const since = Math.max(from, to);
    if (earliest !== undefined && since >= earliest) continue;
    const line = routePoints(route, cellM);
    if (line.length === 0) continue;
    const near = samples.filter((p) => {
      for (let k = 1; k < line.length; k++) {
        if (toSegment(p.x, p.z, line[k - 1]!, line[k]!).distance <= cellM) return true;
      }
      return line.length === 1 && toSegment(p.x, p.z, line[0]!, line[0]!).distance <= cellM;
    });
    if (near.length >= samples.length * ROAD_WALKED.share) earliest = since;
  }
  return earliest;
}

/**
 * Zápis vzniklé cesty (`road-formed`): konce cesty hráče a roky chůze od vzniku pěšiny do dne
 * `day` – pěšina vzniká, když stojí obě místa na koncích (`walkedSince`, nejpozdější z nich);
 * křižovatka na konci stáří neurčí, tam rozhodují trasy po cestě (`routeWalkedSince`); bez známého
 * stáří obou konců roky chybí.
 */
export function roadFormedNote(
  state: VillageState,
  net: RoadEndsNetwork,
  roadId: number,
  day: number,
): { ends?: [ChronicleRoadEnd, ChronicleRoadEnd]; years?: number } {
  const ends = roadChainEnds(net, roadId);
  if (!ends) return {};
  const notes = endNotes(state, net, ends);
  const note: { ends?: [ChronicleRoadEnd, ChronicleRoadEnd]; years?: number } = notes
    ? { ends: notes }
    : {};
  const since = ends.map((end) => walkedSince(state, end));
  if (since.some((s) => s === undefined)) return note;
  const known = since.filter((s): s is number => s !== null);
  // k místu přes křižovatku se chodí od chvíle, kdy stojí obě místa nějaké trasy po cestě (D89)
  if (since.includes(null)) {
    const walked = routeWalkedSince(state, net, roadId);
    // bez určitelné trasy stáří neznáme – roky chybí (ne stáří druhého konce); trasy s neznámým
    // stářím konce se přeskakují, takže roky mohou vyjít spíš nižší než skutečné
    if (walked === undefined) return note;
    known.push(walked);
  }
  if (known.length === 0) return note;
  const from = Math.max(state.foundedDay, ...known);
  return { ...note, years: Math.max(0, Math.round((day - from) / DAYS_PER_YEAR)) };
}

/**
 * Doplní zápisy vzniklých cest od indexu `from` kroniky (měsíční vznik a úklid sítě – `roadsMonth`)
 * o konce a roky chůze; síť konců se staví jednou, jen když nějaký zápis přibyl.
 */
export function noteFormedRoads(
  state: VillageState,
  landscape: Landscape,
  from: number,
  day: number,
): void {
  let net: RoadEndsNetwork | null = null;
  for (let i = from; i < state.chronicle.length; i++) {
    const event = state.chronicle[i]!;
    if (event.kind !== 'road-formed') continue;
    net ??= roadEndsNetwork(state, landscape);
    Object.assign(event, roadFormedNote(state, net, event.roadId, day));
  }
}
