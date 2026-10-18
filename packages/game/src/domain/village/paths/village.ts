import { dateOfDayIndex } from '../../calendar';
import { tileCenterWorld, type Landscape, type ObstacleLayer } from '../../landscape';
import { villageCemeteries } from '../cemetery';
import { HAY_WINTER_MONTHS } from '../hay';
import { grazingDemandHa, villageHerds } from '../livestock';
import { obstacleChangesAt } from '../obstacles';
import { villageOrchards } from '../orchard';
import { grazedPartIds, isGrazeableFallow } from '../overgrowth';
import { villageOxen, villagePens } from '../oxen';
import { ageGroup } from '../people';
import { partStage } from '../summary';
import type { HerdSpecies, Position, TileCell, VillageState } from '../types';
import { villageWoods } from '../woods';
import {
  computePathNetwork,
  pathAgeFactor,
  pastureHerds,
  pathBounds,
  roadsKey,
  type PathNetwork,
  type PathPoint,
  type PathSquare,
  type PathVillage,
} from './network';
import { obstaclePosition, pathTerrainOf, pathWindowFor, withObstacles } from './terrain';
import { walkGraph, walkingDistances } from './walking';

// Pěšiny ze stavu vsi (paths.md – Pěšiny a práce): server skládá ves pro pěšiny stejně jako
// scéna (village-view.ts – SceneVillage), spočítá stejnou síť a z ní vzdálenosti chůze dílů
// pole. Přepočítá se, jen když se změní rozložení vsi (stavby, pole, stadia dílů, obyvatelé
// obydlí, stáří spojení) – den po dni v simulaci, takže výsledek nezávisí na tom, po jakých
// kouscích se ves dopočítá.

const DAYS_PER_YEAR = 365.25;
/** Vzdálenost chůze se ukládá na desetiny metru. */
const WALK_ROUNDING = 10;

/** Čtverec ze středu políčka (díl pole, čtverec sadu a háje). */
function square(landscape: Landscape, cell: TileCell): PathSquare {
  const c = tileCenterWorld(landscape, cell.x, cell.y);
  return { cell: { x: cell.x, y: cell.y }, x: c.x, z: c.z, size: landscape.cellSizeM };
}

/** Stojí dobytek (krávy a voli) v den `day` v ohradě – v zimě, když ves hotovou ohradu má. */
function cattlePenned(state: Pick<VillageState, 'pens'>, day: number): boolean {
  return (
    HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month) &&
    villagePens(state).some((p) => p.builtDay !== null)
  );
}

/**
 * Stáda na pastvě v den `day` jako ve scéně (village-view.ts – `SceneVillage.livestock`): kusy
 * zaokrouhleně, v zimě (listopad–březen) stojí krávy v ohradě, když ves hotovou ohradu má.
 */
export function pastureLivestock(
  state: Pick<VillageState, 'livestock' | 'pens'>,
  day: number,
): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const penned = cattlePenned(state, day);
  return {
    sheep: Math.round(herds.sheep),
    goat: Math.round(herds.goat),
    pig: Math.round(herds.pig),
    cow: penned ? 0 : Math.round(herds.cow),
  };
}

/**
 * Díly přílohu, na kterých se stáda v den `day` pasou (fields.md – Zarůstání, diet.md – Pastva po
 * dílech): stáda na pastvě (`pastureLivestock`) a voli mimo zimní ohradu po dílech přílohu ve
 * fázi louky od nejbližšího – stejné rozdělení (`grazedPartIds`) jako roční krok zarůstání.
 * Podle nich chodí pasáček (síť pěšin) a pasou se stáda ve scéně.
 */
export function pastureGrazedParts(
  state: Pick<VillageState, 'livestock' | 'pens' | 'parts'>,
  day: number,
): Set<number> {
  const oxen = cattlePenned(state, day) ? 0 : villageOxen(state);
  return grazedPartIds(state.parts, grazingDemandHa(pastureLivestock(state, day), oxen));
}

/**
 * Ves pro pěšiny ze stavu vsi v den `day` – stejná data, jaká dostane scéna (village-view.ts):
 * obydlí i staveniště s pozemky, díly polí podle stadia, sady, hřbitovy, posvátná místa,
 * rozdělení práce posledního dne a pevné cesty (roads.md).
 */
export function pathVillageOf(state: VillageState, day: number, landscape: Landscape): PathVillage {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const plotOf = (
    plot: { cell: TileCell } | undefined,
  ): { plot: { cell: TileCell; x: number; z: number; size: number } } | object =>
    plot ? { plot: square(landscape, plot.cell) } : {};
  const dwellings = [
    ...state.dwellings.map((d) => ({
      id: d.id,
      type: d.type,
      position: d.position,
      built: true,
      inhabited: occupied.has(d.id),
      since: d.builtDay,
      ...plotOf(d.plot),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
    })),
    ...state.constructions.flatMap((c) =>
      c.kind === 'dwelling' && c.dwellingType !== null && c.position !== null
        ? [
            {
              id: c.id,
              type: c.dwellingType,
              position: c.position,
              built: false,
              since: c.startedDay,
              ...plotOf(c.plot),
              ...(c.craft ? { craft: c.craft } : {}),
            },
          ]
        : [],
    ),
  ];
  const grazed = pastureGrazedParts(state, day);
  const fields = state.fields.map((f) => ({
    id: f.id,
    parts: state.parts.flatMap((p) =>
      p.fieldId === f.id && p.cell !== undefined
        ? [
            {
              ...square(landscape, p.cell),
              stage: partStage(p, day),
              ...(isGrazeableFallow(p) ? { grazed: grazed.has(p.id) } : {}),
            },
          ]
        : [],
    ),
  }));
  const woods = villageWoods(state).map((w) => ({
    ...square(landscape, w.cell),
    surface: w.surface,
  }));
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    squares: o.squares.map((s) => square(landscape, s.cell)),
  }));
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
    })),
  }));
  const sites = state.constructions.flatMap((c) =>
    (c.kind === 'idol' || c.kind === 'shrine') && c.position !== null
      ? [{ id: c.id, kind: c.kind, position: c.position, built: false }]
      : [],
  );
  const buildings = [
    ...(state.sacredBuildings ?? []).map((b) => ({
      id: b.id,
      kind: b.kind,
      position: b.position,
      built: true,
    })),
    ...sites,
  ];
  const oaks = (state.sacredOaks ?? []).map((o) => ({ id: o.id, x: o.x, z: o.z }));
  const groves = (state.groves ?? []).map((g) => ({
    id: g.id,
    x: g.x,
    z: g.z,
    squares: g.cells.map((cell) => square(landscape, cell)),
  }));
  const people = { children: 0, adults: 0, elders: 0 };
  for (const person of state.people) {
    const group = ageGroup(person, day);
    if (group === 'child') people.children++;
    else if (group === 'adult') people.adults++;
    else people.elders++;
  }
  const changes = obstacleChangesAt(state, day);
  const roads = state.roads?.roads ?? [];
  // přirozené louky letošní seče (oxen.md – Seno) – k políčkům, kde se dnes seče, vede pěšina
  const hayMeadows = (state.hay?.mowing?.squares ?? []).flatMap((sq) =>
    sq.cell ? [square(landscape, sq.cell)] : [],
  );
  const pens = villagePens(state).map((p) => ({
    id: p.id,
    cell: { x: p.cell.x, y: p.cell.y },
    x: p.x,
    z: p.z,
    size: landscape.cellSizeM,
    built: p.builtDay !== null,
  }));
  return {
    dwellings,
    fields,
    orchards,
    cemeteries,
    ...(oaks.length > 0 || groves.length > 0 || buildings.length > 0
      ? { sacred: { oaks, groves, buildings } }
      : {}),
    ...(state.labor
      ? {
          labor: {
            day: state.labor.day,
            month: dateOfDayIndex(state.labor.day).month,
            people,
            shares: state.labor.shares,
          },
        }
      : {}),
    obstacles: changes,
    ...(roads.length > 0 ? { roads: roads.map((r) => ({ points: r.points })) } : {}),
    ...(pens.length > 0 ? { pens } : {}),
    ...(state.livestock ? { livestock: pastureLivestock(state, day) } : {}),
    ...(woods.length > 0 ? { woods } : {}),
    ...(hayMeadows.length > 0 ? { hayMeadows } : {}),
  };
}

/**
 * Síť pěšin vsi v den `day` (stejná funkce jako ve scéně). Bez obydlí null. Vrstva překážek
 * přidá kmeny, keře a kameny (bez ní jen terén).
 */
export function villagePathNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): PathNetwork | null {
  const village = pathVillageOf(state, day, landscape);
  const bounds = pathBounds(village);
  if (!bounds) return null;
  const base = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  const terrain = obstacles ? withObstacles(base, obstacles, obstacleChangesAt(state, day)) : base;
  return computePathNetwork({
    village,
    terrain,
    ...(obstacles ? { tree: (id: number) => obstaclePosition(obstacles, id) } : {}),
  });
}

/**
 * Klíč rozložení vsi pro vzdálenosti chůze: obydlí a staveniště (poloha, pozemek, obyvatelé,
 * stáří spojení po desetinách), díly polí se stadiem, sady, hřbitovy, posvátná místa, pevné
 * cesty, ohrady a počet stád na pastvě. Práce dne ani pokácené stromy v něm nejsou – síť se kvůli nim každý den nepřepočítává.
 */
export function walkLayoutKey(state: VillageState, day: number): string {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const age = (since: number): number =>
    Math.round(pathAgeFactor((day - since) / DAYS_PER_YEAR) * 10);
  const at = (p: Position): string => `${p.x},${p.z},${p.rotation}`;
  const dwellings = state.dwellings.map(
    (d) =>
      `${d.id}:${d.type}${d.workshop ? `/${d.workshop.craft}` : ''}:${at(d.position)}:${d.plot ? `${d.plot.cell.x},${d.plot.cell.y}` : ''}:${occupied.has(d.id) ? 1 : 0}:${age(d.builtDay)}`,
  );
  const sites = state.constructions.flatMap((c) =>
    c.position !== null && (c.kind === 'dwelling' || c.kind === 'idol' || c.kind === 'shrine')
      ? [`${c.id}:${c.kind}${c.craft ? `/${c.craft}` : ''}:${at(c.position)}:${age(c.startedDay)}`]
      : [],
  );
  const grazed = pastureGrazedParts(state, day);
  const parts = state.parts.map(
    (p) =>
      `${p.id}:${p.cell ? `${p.cell.x},${p.cell.y}` : ''}:${partStage(p, day)}${isGrazeableFallow(p) && !grazed.has(p.id) ? ':-' : ''}`,
  );
  const woods = villageWoods(state).map((w) => `${w.cell.x},${w.cell.y}`);
  const orchards = villageOrchards(state).map(
    (o) => `${o.id}:${o.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';')}`,
  );
  const cemeteries = villageCemeteries(state).map(
    (c) => `${c.id}:${c.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';')}`,
  );
  const sacred = [
    (state.sacredOaks ?? []).map((o) => o.id).join(','),
    (state.groves ?? []).map((g) => g.id).join(','),
    (state.sacredBuildings ?? []).map((b) => b.id).join(','),
  ].join('|');
  const roads = state.roads?.roads ?? [];
  const pens = villagePens(state).map(
    (p) => `${p.id}:${p.cell.x},${p.cell.y}:${p.builtDay === null ? 0 : 1}`,
  );
  const herds = state.livestock ? pastureHerds(pastureLivestock(state, day)) : 0;
  return JSON.stringify([
    dwellings,
    sites,
    parts,
    orchards,
    cemeteries,
    sacred,
    // bez pevných cest, ohrad a stád prázdné – klíč starších vsí zůstane stejný
    ...(roads.length > 0 ? [roadsKey(roads)] : []),
    ...(pens.length > 0 ? [pens] : []),
    ...(herds > 0 ? [herds] : []),
    ...(woods.length > 0 ? [woods] : []),
  ]);
}

/** Polohy obydlí vsi včetně rozestavěných – od nich se měří vzdálenost dílů pole. */
function dwellingOrigins(state: VillageState): Position[] {
  return [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null ? [c.position] : [],
    ),
  ];
}

/**
 * Vzdálenosti chůze z obydlí vsi po pěšinách k bodům `targets` (m, paths.md – Pěšiny a práce) –
 * stejná síť a stejné měření jako u dílů pole, nejvýš přímá vzdálenost. Bez sítě (ves bez obydlí)
 * null. Seč přirozených luk (hay.ts – `planMowing`) podle ní řadí louky.
 */
export function walkDistancesTo(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  targets: readonly PathPoint[],
): number[] | null {
  const network = villagePathNetwork(state, day, landscape, obstacles);
  if (!network) return null;
  const origins = dwellingOrigins(state);
  return walkingDistances(walkGraph(network.lines), origins, targets).map(
    (walk) => Math.floor(walk * WALK_ROUNDING) / WALK_ROUNDING,
  );
}

/**
 * Vzdálenosti chůze dílů pole po pěšinách (`FieldPart.walkDistanceM`, mutuje stav): přepočítá
 * je, jen když se od posledního výpočtu změnilo rozložení vsi (`walkLayoutKey`). Vzdálenost
 * dílu je nejvýš jeho přímá vzdálenost (`distanceM`) – pěšina práci jen zlevní.
 */
export function refreshWalkDistances(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  const key = walkLayoutKey(state, day);
  if (state.walkLayoutKey === key) return;
  state.walkLayoutKey = key;
  const parts = state.parts.filter((p) => p.cell !== undefined);
  const network = parts.length > 0 ? villagePathNetwork(state, day, landscape, obstacles) : null;
  if (!network) {
    for (const p of state.parts) delete p.walkDistanceM;
    return;
  }
  const origins = dwellingOrigins(state);
  const targets = parts.map((p) => tileCenterWorld(landscape, p.cell!.x, p.cell!.y));
  const walks = walkingDistances(walkGraph(network.lines), origins, targets);
  parts.forEach((p, k) => {
    // dolů na desetiny – zaokrouhlení nesmí vzdálenost prodloužit nad přímou
    const walk = Math.min(p.distanceM, walks[k]!);
    p.walkDistanceM = Math.floor(walk * WALK_ROUNDING) / WALK_ROUNDING;
  });
}
