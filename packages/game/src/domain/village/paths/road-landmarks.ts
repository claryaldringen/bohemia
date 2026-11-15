// Významné místo u křižovatky (D66; Martin 15. 11. 2026: „Podél cesty mezi křižovatkou a rozcestím
// byly vysazeny jabloně – nešly by ty koncové body líp specifikovat? Třeba poblíž kterého
// významného místa se nacházejí?“). Konec cesty, který je křižovatka nebo rozcestí, se popíše
// podle nejbližšího významného místa do LANDMARK_M – dvorec, dílna, kostel, hřbitov, humno, ohrada,
// sad, lom, modla, svatyně, brána, potok či řeka, kraj mapy (soused) –, bez něj podle polohy vůči
// vsi. Kronika si popis uloží (`chronicleRoadEnds`), panel cesty ho počítá ze stavu. Jen čtení
// stavu; vzdálenosti se porovnávají ve čtvercích (soubor hlídá ESLint jako síť pěšin).

import {
  CELL_SIZE_M,
  LANDSCAPE_SIZE,
  heightAtWorld,
  nearestWaterPair,
  riverCenterline,
  streamCenterline,
  watersCenterline,
  type Landscape,
} from '../../landscape';
import { squareCenter } from '../placement/square-grid';
import type {
  ChronicleLandmark,
  Direction8,
  LandmarkRelation,
  RoadPoint,
  VillageState,
} from '../types';
import type { RoadEnd, RoadEndsNetwork } from './road-ends';
import { EDGE_MARGIN_M } from './terrain';

/**
 * Nejdál od křižovatky, kde ještě leží „její“ významné místo (m, návrh Clauda): zhruba dva domy
 * s pozemky – dál už „rozcestí u kovárny“ hráč u kovárny nehledá.
 */
export const LANDMARK_M = 60;
/**
 * O kolik výš či níž musí místo ležet, aby křižovatka byla „pod“ či „nad“ ním (m, návrh Clauda):
 * na LANDMARK_M je to spád přes 8 %, menší rozdíl oko ve svahu nepozná.
 */
export const LANDMARK_RISE_M = 5;
/** Křižovatka dál než tolik od všech obydlí leží mimo zástavbu – „severně od vsi“ (m, návrh Clauda). */
export const IN_VILLAGE_M = 40;
/** Do tolika od středu zástavby (průměr obydlí) je křižovatka „uprostřed vsi“ (m, návrh Clauda). */
export const VILLAGE_MIDDLE_M = 25;

/** Výšky, voda a velikost mapy pro popis křižovatky – z krajiny (`landmarkTerrain`). */
export interface LandmarkTerrain {
  /** Výška terénu (m). */
  heightAt(x: number, z: number): number;
  /** Nejbližší voda do `maxM` od břehu: vzdálenost od břehu, hladina (m), řeka; dál null. */
  waterNear(
    x: number,
    z: number,
    maxM: number,
  ): { distanceM: number; level: number; river: boolean } | null;
  /** Polovina strany mapy (m). */
  halfM: number;
}

/** Výšky a voda krajiny pro popis křižovatky. */
export function landmarkTerrain(landscape: Landscape): LandmarkTerrain {
  // osa potoka jen jednou na síť a jen u mapy s řekou – jako `waterKindAt` (road-anchors)
  let stream: ReturnType<typeof streamCenterline> | null = null;
  const isRiver = (x: number, z: number): boolean => {
    const river = riverCenterline(landscape);
    if (!river) return false;
    stream ??= streamCenterline(landscape);
    return nearestWaterPair(stream, river, x, z).second;
  };
  return {
    heightAt: (x, z) => heightAtWorld(landscape, x, z),
    waterNear: (x, z, maxM) => {
      const near = watersCenterline(landscape).nearest(x, z, maxM);
      if (!Number.isFinite(near.distance) || near.bankDistance > maxM) return null;
      return {
        distanceM: Math.max(0, near.bankDistance),
        level: near.level,
        river: isRiver(x, z),
      };
    },
    halfM: (landscape.size * landscape.cellSizeM) / 2,
  };
}

/** Krajina sídla má pevnou velikost (landscape/world.ts) – středy čtverců sadu. */
const GEOMETRY = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M } as const;
/** tan 22,5° – hranice mezi hlavním a šikmým směrem. */
const TAN_EIGHTH = 0.41421356237309503;

/** Směr (sever = +z, východ = +x) – nejbližší z osmi. */
function directionOf(dx: number, dz: number): Direction8 {
  const ns = dz >= 0 ? 'N' : 'S';
  const ew = dx >= 0 ? 'E' : 'W';
  if (Math.abs(dx) <= Math.abs(dz) * TAN_EIGHTH) return ns;
  if (Math.abs(dz) <= Math.abs(dx) * TAN_EIGHTH) return ew;
  return `${ns}${ew}` as Direction8;
}

/**
 * Totožnost místa na konci cesty pro `junctionLandmark` (`exclude`) – „rozcestí u kovárny“ na
 * cestě, která u té kovárny končí, by nic neřeklo: obydlí `d:<id>`, humno `threshing-floor:<id>`,
 * modla a svatyně `sacred:<id>`, voda `water`, kraj mapy `edge:<směr>`, jinak klíč trasy.
 */
export function roadEndKey(state: VillageState, end: RoadEnd): string | null {
  if (end.kind === 'edge') return `edge:${end.direction}`;
  if (end.kind !== 'place') return null;
  const [prefix = '', rest] = end.place.split(':');
  if (prefix === 'water') return 'water';
  const id = Number(rest);
  if (prefix === 'd' || prefix === 'dwelling' || prefix === 'site') {
    if (state.dwellings.some((d) => d.id === id)) return `d:${id}`;
    return prefix === 'site' ? `threshing-floor:${id}` : null;
  }
  if (prefix === 'idol' || prefix === 'shrine' || prefix === 'sacred') return `sacred:${id}`;
  return end.place;
}

/** Kandidát na významné místo: čtverec vzdálenosti, totožnost, výška (bez ní vždy „u“). */
interface Candidate {
  d2: number;
  key: string;
  height: number | null;
  make: (at: LandmarkRelation) => ChronicleLandmark;
}

/**
 * Nejbližší významné místo u křižovatky v bodě `at` (do LANDMARK_M, mimo místo `exclude` – druhý
 * konec cesty), „pod“ / „nad“ podle výšky (LANDMARK_RISE_M; brána a kraj mapy vždy „u“, voda nikdy
 * „pod“). Bez takového místa poloha vůči vsi: uprostřed, na některé straně, nebo mimo zástavbu
 * směrem od jejího středu; ves bez obydlí null. Bez krajiny (`terrain`) jen stavby a vždy „u“.
 */
export function junctionLandmark(
  state: VillageState,
  at: RoadPoint,
  terrain?: LandmarkTerrain | null,
  exclude?: string | null,
): ChronicleLandmark | null {
  const reach2 = LANDMARK_M * LANDMARK_M;
  let best: Candidate | null = null;
  // při shodě vzdálenosti vyhrává dřívější kandidát (pevné pořadí – stavby, voda, kraj mapy)
  const better = (d2: number, key: string): boolean =>
    d2 <= reach2 && key !== exclude && (best === null || d2 < best.d2);
  const offer = (d2: number, key: string, height: number | null, make: Candidate['make']): void => {
    if (better(d2, key)) best = { d2, key, height, make };
  };
  /** Stavba v bodě (x, z); `flat` – bez „pod“ a „nad“ (brána). */
  const consider = (
    key: string,
    x: number,
    z: number,
    make: Candidate['make'],
    flat = false,
  ): void => {
    const dx = x - at.x;
    const dz = z - at.z;
    const d2 = dx * dx + dz * dz;
    if (!better(d2, key)) return;
    offer(d2, key, flat || !terrain ? null : terrain.heightAt(x, z), make);
  };
  const place =
    (name: string) =>
    (rel: LandmarkRelation): ChronicleLandmark => ({ kind: 'place', place: name, at: rel });
  for (const d of state.dwellings) {
    const craft = d.workshop?.craft;
    if (!craft && d.type !== 'dvorec' && d.type !== 'dvorec-srub') continue;
    consider(`d:${d.id}`, d.position.x, d.position.z, (rel) => ({
      kind: 'dwelling',
      type: d.type,
      ...(craft ? { craft } : {}),
      at: rel,
    }));
  }
  for (const c of state.churches ?? []) {
    consider(`church:${c.id}`, c.position.x, c.position.z, place('church'));
  }
  for (const c of state.cemeteries ?? []) {
    for (const s of c.squares) consider(`cemetery:${c.id}`, s.x, s.z, place('cemetery'));
  }
  for (const f of state.threshingFloors ?? []) {
    consider(`threshing-floor:${f.id}`, f.position.x, f.position.z, place('threshing-floor'));
  }
  for (const p of state.pens ?? []) consider(`pen:${p.id}`, p.x, p.z, place('pen'));
  for (const o of state.orchards ?? []) {
    for (const s of o.squares) {
      const c = squareCenter(GEOMETRY, o.grid, s.cell);
      consider(`orchard:${o.id}`, c.x, c.z, place('orchard'));
    }
  }
  for (const q of state.quarries ?? []) {
    consider(`quarry:${q.outcropId}`, q.x, q.z, place('quarry'));
  }
  for (const b of state.sacredBuildings ?? []) {
    consider(`sacred:${b.id}`, b.position.x, b.position.z, place(b.kind));
  }
  (state.fortifications ?? []).forEach((fort, k) => {
    for (const g of fort.gates) {
      // zbořená brána už není (`gateStands`)
      if (g.demolishedDay !== undefined) continue;
      consider(`gate:${k}:${g.x},${g.z}`, g.x, g.z, place('gate'), true);
    }
  });
  if (terrain) {
    // voda – vzdálenost od břehu, výška hladiny
    const water = terrain.waterNear(at.x, at.z, LANDMARK_M);
    if (water) {
      const d = water.distanceM;
      offer(d * d, 'water', water.level, place(water.river ? 'water:river' : 'water'));
    }
    // kraj mapy – kde končí terén pěšin (`EDGE_MARGIN_M`)
    const fromEdge = terrain.halfM - EDGE_MARGIN_M;
    const sides: [Direction8, number][] = [
      ['N', fromEdge - at.z],
      ['S', fromEdge + at.z],
      ['E', fromEdge - at.x],
      ['W', fromEdge + at.x],
    ];
    for (const [direction, d] of sides) {
      const near = Math.max(0, d);
      offer(near * near, `edge:${direction}`, null, () => ({ kind: 'edge', direction }));
    }
  }
  const found = best as Candidate | null;
  if (found) {
    if (found.height === null || !terrain) return found.make('at');
    const here = terrain.heightAt(at.x, at.z);
    const water = found.key === 'water';
    const rel: LandmarkRelation =
      here >= found.height + LANDMARK_RISE_M
        ? 'above'
        : !water && here <= found.height - LANDMARK_RISE_M
          ? 'below'
          : 'at';
    return found.make(rel);
  }
  return villagePosition(state, at);
}

/** Poloha křižovatky vůči vsi (bez významného místa blízko); ves bez obydlí null. */
function villagePosition(state: VillageState, at: RoadPoint): ChronicleLandmark | null {
  const dwellings = state.dwellings;
  if (dwellings.length === 0) return null;
  let cx = 0;
  let cz = 0;
  let near2 = Infinity;
  for (const d of dwellings) {
    cx += d.position.x;
    cz += d.position.z;
    const dx = d.position.x - at.x;
    const dz = d.position.z - at.z;
    near2 = Math.min(near2, dx * dx + dz * dz);
  }
  cx /= dwellings.length;
  cz /= dwellings.length;
  const dx = at.x - cx;
  const dz = at.z - cz;
  const outside = near2 > IN_VILLAGE_M * IN_VILLAGE_M;
  if (!outside && dx * dx + dz * dz <= VILLAGE_MIDDLE_M * VILLAGE_MIDDLE_M) {
    return { kind: 'village' };
  }
  return { kind: 'village', direction: directionOf(dx, dz), ...(outside ? { outside: true } : {}) };
}

/**
 * Významná místa u konců cesty hráče (`chainEnds`): u křižovatky `junctionLandmark` bez místa na
 * druhém konci, jiný konec null. Kronika i panel cesty.
 */
export function roadEndLandmarks(
  state: VillageState,
  net: RoadEndsNetwork,
  ends: readonly [RoadEnd, RoadEnd],
): [ChronicleLandmark | null, ChronicleLandmark | null] {
  const near = (end: RoadEnd, other: RoadEnd): ChronicleLandmark | null => {
    if (end.kind !== 'junction') return null;
    const junction = net.junctions.find((j) => j.id === end.id);
    if (!junction) return null;
    return junctionLandmark(state, junction, net.terrain, roadEndKey(state, other));
  };
  return [near(ends[0], ends[1]), near(ends[1], ends[0])];
}
