// Konce cesty a roky chůze pro kroniku (roads.md – kronika; Martin 14. 11. 2026: „Po 12 letech
// chůze lidé vyšlapali cestu mezi dvorcem a studnou.“, „Podél cesty mezi dvorcem a kovárnou byly
// vysazeny jabloně.“). Co leží na koncích cesty hráče (`roadChainEnds` – jako panel cesty), se
// uloží do zápisu, ať popis sedí i po pozdější přestavbě sítě. Jen čtení stavu a celá čísla dnů.

import type { Landscape } from '../../landscape';
import type { ChronicleRoadEnd, VillageState } from '../types';
import { roadChainEnds, roadEndsNetwork, type RoadEnd, type RoadEndsNetwork } from './road-ends';
import { DAYS_PER_YEAR } from './roads-geometry';

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

/** Konec cesty pro kroniku; konec nikam (porušení pravidla 11) null. */
function endNote(state: VillageState, end: RoadEnd): ChronicleRoadEnd | null {
  switch (end.kind) {
    case 'place':
      return placeNote(state, end.place);
    case 'junction': {
      const junction = (state.roads?.junctions ?? []).find((j) => j.id === end.id);
      return { kind: 'junction', shape: junction?.shape ?? 'cross' };
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

/** Konce cesty hráče s úsekem `roadId` pro kroniku; bez úseku nebo s koncem nikam null. */
export function chronicleRoadEnds(
  state: VillageState,
  net: RoadEndsNetwork,
  roadId: number,
): [ChronicleRoadEnd, ChronicleRoadEnd] | null {
  const ends = roadChainEnds(net, roadId);
  if (!ends) return null;
  const a = endNote(state, ends[0]);
  const b = endNote(state, ends[1]);
  return a && b ? [a, b] : null;
}

/**
 * Zápis vzniklé cesty (`road-formed`): konce cesty hráče a roky chůze od vzniku pěšiny do dne
 * `day` – pěšina vzniká, když stojí obě místa na koncích (`walkedSince`, nejpozdější z nich); bez
 * známého stáří obou konců roky chybí.
 */
export function roadFormedNote(
  state: VillageState,
  net: RoadEndsNetwork,
  roadId: number,
  day: number,
): { ends?: [ChronicleRoadEnd, ChronicleRoadEnd]; years?: number } {
  const ends = roadChainEnds(net, roadId);
  if (!ends) return {};
  const a = endNote(state, ends[0]);
  const b = endNote(state, ends[1]);
  const note: { ends?: [ChronicleRoadEnd, ChronicleRoadEnd]; years?: number } =
    a && b ? { ends: [a, b] } : {};
  const since = ends.map((end) => walkedSince(state, end));
  if (since.some((s) => s === undefined)) return note;
  const known = since.filter((s): s is number => s !== null);
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
