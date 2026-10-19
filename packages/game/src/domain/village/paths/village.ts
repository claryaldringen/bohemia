import { dateOfDayIndex } from '../../calendar';
import { stockedPenIds } from '../abandonment';
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
import { gridKey, squareCenter } from '../square-grid';
import { fieldGrids } from '../squares';
import type {
  DwellingPlot,
  HerdSpecies,
  Position,
  SquareGrid,
  TileCell,
  VillageState,
} from '../types';
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
import {
  PATH_FOREST_EDGE,
  obstaclePosition,
  pathTerrainOf,
  pathWindowFor,
  withObstacles,
} from './terrain';
import { walkGraph, walkGroundOf, walkingDistances, type WalkGround } from './walking';

// Pěšiny ze stavu vsi (paths.md – Pěšiny a práce): server skládá ves pro pěšiny stejně jako
// scéna (village-view.ts – SceneVillage), spočítá stejnou síť a z ní vzdálenosti chůze dílů
// pole. Přepočítá se, jen když se změní rozložení vsi (stavby, pole, stadia dílů, obyvatelé
// obydlí, stáří spojení) – den po dni v simulaci, takže výsledek nezávisí na tom, po jakých
// kouscích se ves dopočítá.

const DAYS_PER_YEAR = 365.25;
/** Vzdálenost chůze se ukládá na desetiny metru. */
const WALK_ROUNDING = 10;

/**
 * Čtverec ze středu políčka (díl pole, čtverec sadu a háje) – u natočené stavby (fields.md –
 * Natočené stavby) čtverec její mřížky `grid` se středem a natočením.
 */
function square(landscape: Landscape, cell: TileCell, grid?: SquareGrid): PathSquare {
  if (grid) {
    const c = squareCenter(landscape, grid, cell);
    return {
      cell: { x: cell.x, y: cell.y },
      x: c.x,
      z: c.z,
      size: landscape.cellSizeM,
      rotation: grid.rotation,
    };
  }
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
    plot: DwellingPlot | undefined,
  ):
    | {
        plot: {
          cell: TileCell;
          x: number;
          z: number;
          size: number;
          rotation?: number;
          yard?: { x: number; z: number };
        };
      }
    | object => {
    if (!plot) return {};
    // natočený pozemek (fields.md – Natočené stavby): střed a natočení čtverce
    if (plot.square && !plot.yard) {
      return {
        plot: {
          cell: { x: plot.cell.x, y: plot.cell.y },
          x: plot.square.x,
          z: plot.square.z,
          size: landscape.cellSizeM,
          rotation: plot.square.rotation,
        },
      };
    }
    // dvorec vojvody (trade.md) – pozemek i se dvorem
    const yard = plot.yard ? tileCenterWorld(landscape, plot.yard.x, plot.yard.y) : null;
    return { plot: { ...square(landscape, plot.cell), ...(yard ? { yard } : {}) } };
  };
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
              ...square(landscape, p.cell, f.grid),
              stage: partStage(p, day),
              ...(isGrazeableFallow(p) ? { grazed: grazed.has(p.id) } : {}),
            },
          ]
        : [],
    ),
  }));
  const woods = villageWoods(state).map((w) => ({
    ...square(landscape, w.cell, w.grid),
    surface: w.surface,
  }));
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    squares: o.squares.map((s) => square(landscape, s.cell, o.grid)),
  }));
  // hotový hřbitov a rozšíření ve stavbě (`pending`) jako scéna – branka (paths.md – Vchody)
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
      // natočený hřbitov (fields.md – Natočené stavby)
      ...(c.grid ? { rotation: c.grid.rotation } : {}),
      ...(s.constructionId === undefined ? {} : { pending: true }),
    })),
    built: c.builtDay !== null,
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
  // do ohrady bez zvířat se krmit nechodí (abandonment.md)
  const stocked = stockedPenIds(state);
  const pens = villagePens(state).map((p) => ({
    id: p.id,
    cell: { x: p.cell.x, y: p.cell.y },
    x: p.x,
    z: p.z,
    size: landscape.cellSizeM,
    ...(p.grid ? { rotation: p.grid.rotation } : {}),
    built: p.builtDay !== null,
    ...(p.builtDay !== null && !stocked.has(p.id) ? { stocked: false } : {}),
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
    ...(roads.length > 0
      ? {
          roads: roads.map((r) => ({
            id: r.id,
            points: r.points,
            grade: r.grade,
            // vozová cesta (wagons.md) – ves bez vozových cest beze změny
            ...(r.cart ? { cart: true } : {}),
          })),
        }
      : {}),
    ...(pens.length > 0 ? { pens } : {}),
    ...(state.livestock ? { livestock: pastureLivestock(state, day) } : {}),
    ...(woods.length > 0 ? { woods } : {}),
    ...(hayMeadows.length > 0 ? { hayMeadows } : {}),
  };
}

/**
 * Poslední síť spočítaná ze stavu vsi – po krajinách. Vstup sítě je celý v otisku vsi pro pěšiny
 * (`pathVillageOf` jako JSON – i odstraněné překážky a den), krajina a vrstva překážek se
 * porovnávají přímo. Seč luk (`walkDistancesTo`) tak ve stejný den po přepočtu vzdáleností chůze
 * (`refreshWalkDistances`) síť nepočítá znovu, když se mezi tím ves pro pěšiny nezměnila.
 */
const lastNetworks = new WeakMap<
  Landscape,
  { obstacles: ObstacleLayer | null; input: string; network: PathNetwork | null }
>();

/**
 * Síť pěšin vsi v den `day` (stejná funkce jako ve scéně). Bez obydlí null. Vrstva překážek
 * přidá kmeny, keře a kameny (bez ní jen terén). Stejný vstup jako minule = táž síť (sdílený
 * objekt – volající ji nemění).
 */
export function villagePathNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): PathNetwork | null {
  const village = pathVillageOf(state, day, landscape);
  const input = JSON.stringify(village);
  const last = lastNetworks.get(landscape);
  if (last && last.obstacles === obstacles && last.input === input) return last.network;
  const network = computeVillageNetwork(state, day, landscape, obstacles, village);
  lastNetworks.set(landscape, { obstacles, input, network });
  return network;
}

function computeVillageNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  village: PathVillage,
): PathNetwork | null {
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
 * stáří spojení po desetinách), díly polí (políčka – bez stadia), sady, hřbitovy, posvátná místa,
 * pevné cesty, ohrady, les vsi a počet stád na pastvě. Práce dne ani pokácené stromy v něm nejsou
 * – síť se kvůli nim každý den nepřepočítává. Stadia dílů a pastva úhoru jsou zvlášť
 * (`walkStageKey`) – promítají se nejvýš jednou za měsíc (Martin, 18. 10. 2026).
 */
export function walkLayoutKey(state: VillageState, day: number): string {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const age = (since: number): number =>
    Math.round(pathAgeFactor((day - since) / DAYS_PER_YEAR) * 10);
  const at = (p: Position): string => `${p.x},${p.z},${p.rotation}`;
  const dwellings = state.dwellings.map(
    (d) =>
      `${d.id}:${d.type}${d.workshop ? `/${d.workshop.craft}` : ''}:${at(d.position)}:${d.plot ? `${d.plot.cell.x},${d.plot.cell.y}${d.plot.yard ? `+${d.plot.yard.x},${d.plot.yard.y}` : ''}${d.plot.square ? `@${d.plot.square.x},${d.plot.square.z},${d.plot.square.rotation}` : ''}` : ''}:${occupied.has(d.id) ? 1 : 0}:${age(d.builtDay)}`,
  );
  const sites = state.constructions.flatMap((c) =>
    c.position !== null && (c.kind === 'dwelling' || c.kind === 'idol' || c.kind === 'shrine')
      ? [`${c.id}:${c.kind}${c.craft ? `/${c.craft}` : ''}:${at(c.position)}:${age(c.startedDay)}`]
      : [],
  );
  // natočená pole, sady a les z nich nesou mřížku (fields.md – Natočené stavby) – klíč starých
  // vsí se nemění
  const grids = fieldGrids(state);
  const turned = (grid: SquareGrid | undefined): string => (grid ? `@${gridKey(grid)}` : '');
  const parts = state.parts.map(
    (p) => `${p.id}:${p.cell ? `${p.cell.x},${p.cell.y}${turned(grids.get(p.fieldId))}` : ''}`,
  );
  const woods = villageWoods(state).map((w) => `${w.cell.x},${w.cell.y}${turned(w.grid)}`);
  const orchards = villageOrchards(state).map(
    (o) => `${o.id}${turned(o.grid)}:${o.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';')}`,
  );
  // zakládaný hřbitov a rozšíření ve stavbě – branka se počítá z hotových čtverců (paths.md –
  // Vchody); u hotového hřbitova klíč beze změny
  const cemeteries = villageCemeteries(state).map(
    (c) =>
      `${c.id}${turned(c.grid)}:${c.squares.map((s) => `${s.cell.x},${s.cell.y}${s.constructionId === undefined ? '' : 'p'}`).join(';')}${c.builtDay === null ? ':-' : ''}`,
  );
  const sacred = [
    (state.sacredOaks ?? []).map((o) => o.id).join(','),
    (state.groves ?? []).map((g) => g.id).join(','),
    (state.sacredBuildings ?? []).map((b) => b.id).join(','),
  ].join('|');
  const roads = state.roads?.roads ?? [];
  const stocked = stockedPenIds(state);
  const pens = villagePens(state).map(
    (p) =>
      `${p.id}:${p.cell.x},${p.cell.y}${turned(p.grid)}:${p.builtDay === null ? 0 : 1}${p.builtDay !== null && !stocked.has(p.id) ? ':-' : ''}`,
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

/**
 * Stadia dílů pole pro vzdálenosti chůze (paths.md, fields.md – Vzdálenost): stadium a jestli se
 * na úhoru pase. Osev a zakládání postupují po dílech den po dni – síť by se jinak přepočítávala
 * každých pár dní; do klíče chůze se proto promítají jen 1. dne v měsíci (`refreshWalkDistances`).
 */
export function walkStageKey(state: VillageState, day: number): string {
  const grazed = pastureGrazedParts(state, day);
  return state.parts
    .map(
      (p) => `${p.id}:${partStage(p, day)}${isGrazeableFallow(p) && !grazed.has(p.id) ? ':-' : ''}`,
    )
    .join(';');
}

/**
 * Otisk klíče rozložení (`walkLayoutKey`) – ve stavu vsi se drží jen on (16 šestnáctkových
 * číslic, dvě nezávislé 32bitové FNV-1a), ne celý klíč (u Vlkova 37 kB). Shoda otisků = shoda
 * klíčů (náhodná shoda 1 : 2^64).
 */
export function walkLayoutHash(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
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
 * Vzdálenosti chůze z obydlí vsi k bodům `targets` (m, paths.md – Pěšiny a práce) – stejná síť
 * a stejné měření jako u dílů pole: po pěšinách a pevných cestách podle stupně, rovně s mokřinou
 * a brody (`walking.ts`). Bez sítě (ves bez obydlí) null. Seč přirozených luk (hay.ts –
 * `planMowing`) podle ní řadí louky.
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
  const ground = walkGroundOf(landscape);
  const graph = walkGraph(network.lines, { roads: state.roads?.roads ?? [], ground });
  return walkingDistances(graph, dwellingOrigins(state), targets, ground).map(
    (walk) => Math.floor(walk * WALK_ROUNDING) / WALK_ROUNDING,
  );
}

/**
 * Vzdálenosti chůze po pěšinách a pevných cestách (mutuje stav – paths.md, roads.md – Rychlejší
 * chůze): díly pole (`FieldPart.walkDistanceM`) a čtverce sadů (`OrchardSquare.walkDistanceM`)
 * z nejbližšího obydlí, palivo z obydlí k nejbližšímu okraji lesa (`Dwelling.forestWalkM`).
 * Přepočítá je, jen když se od posledního výpočtu změnilo rozložení vsi (`walkLayoutKey` – i pevné
 * cesty a jejich stupeň, takže i po dokončení vylepšení) nebo stadia dílů (`walkStageKey`), ta ale
 * jen 1. dne v měsíci (Martin – chůze se přepočítává měsíčně; otisk stadií z posledního 1. dne je
 * ve stavu `walkStages`, ve stavu jen otisky `walkLayoutHash`). Chůze rovně počítá mokřinu a brody
 * (`walkGroundOf`) – pole za potokem bez cesty zdraží, s hatí a lávkou zlevní.
 */
export function refreshWalkDistances(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  // stadia dílů jen 1. dne v měsíci (a poprvé) – jinak platí otisk z posledního 1. dne
  if (state.walkStages === undefined || dateOfDayIndex(day).day === 1) {
    state.walkStages = walkLayoutHash(walkStageKey(state, day));
  }
  const key = walkLayoutHash(`${walkLayoutKey(state, day)}|${state.walkStages}`);
  const unchanged = state.walkLayoutKey === key;
  state.walkLayoutKey = key;
  if (unchanged) return;
  const network = villagePathNetwork(state, day, landscape, obstacles);
  if (!network) {
    for (const p of state.parts) delete p.walkDistanceM;
    for (const o of villageOrchards(state)) for (const s of o.squares) delete s.walkDistanceM;
    for (const d of state.dwellings) delete d.forestWalkM;
    return;
  }
  const ground = walkGroundOf(landscape);
  const graph = walkGraph(network.lines, { roads: state.roads?.roads ?? [], ground });
  const origins = dwellingOrigins(state);
  const rounded = (walk: number): number => Math.floor(walk * WALK_ROUNDING) / WALK_ROUNDING;
  const parts = state.parts.filter((p) => p.cell !== undefined);
  const grids = fieldGrids(state);
  const orchards = villageOrchards(state);
  const squares = orchards.flatMap((o) => o.squares);
  // středy čtverců – natočená pole a sady ve své mřížce (fields.md – Natočené stavby)
  const targets = [
    ...parts.map((p) => squareCenter(landscape, grids.get(p.fieldId), p.cell!)),
    ...orchards.flatMap((o) => o.squares.map((s) => squareCenter(landscape, o.grid, s.cell))),
  ];
  const walks = targets.length > 0 ? walkingDistances(graph, origins, targets, ground) : [];
  parts.forEach((p, k) => {
    p.walkDistanceM = rounded(walks[k]!);
  });
  squares.forEach((s, k) => {
    s.walkDistanceM = rounded(walks[parts.length + k]!);
  });
  // palivo: z každého obydlí k nejbližšímu okraji lesa (vzdušnou čarou) chůzí
  const edges = forestEdges(ground);
  for (const d of state.dwellings) {
    const edge = nearestPoint(edges, d.position);
    if (!edge) {
      delete d.forestWalkM;
      continue;
    }
    d.forestWalkM = rounded(walkingDistances(graph, [d.position], [edge], ground)[0]!);
  }
}

const edgesCache = new WeakMap<WalkGround, { x: number; z: number }[]>();

/** Body okraje lesa (kam se chodí pro dřevo – PATH_FOREST_EDGE) v okně půdy pro chůzi. */
function forestEdges(ground: WalkGround): { x: number; z: number }[] {
  const cached = edgesCache.get(ground);
  if (cached) return cached;
  const t = ground.terrain;
  const out: { x: number; z: number }[] = [];
  for (let j = 0; j < t.height; j++) {
    for (let i = 0; i < t.width; i++) {
      if (t.flags[j * t.width + i]! & PATH_FOREST_EDGE) {
        out.push({ x: t.originX + i * t.cellM, z: t.originZ + j * t.cellM });
      }
    }
  }
  edgesCache.set(ground, out);
  return out;
}

/** Nejbližší bod vzdušnou čarou (při shodě první); bez bodů null. */
function nearestPoint(
  points: readonly { x: number; z: number }[],
  from: { x: number; z: number },
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - from.x) * (p.x - from.x) + (p.z - from.z) * (p.z - from.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
