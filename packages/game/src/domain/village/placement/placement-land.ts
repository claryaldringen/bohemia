// Společné kontroly volné plochy: branky, les a jeho vyklizení, zabraná půda a varování.

import {
  CEMETERY_DISTANCE_M,
  FOREST_CROWN_MARGIN_M,
  MILIR,
  SACRED_BUILDINGS,
  SURFACE_INCLUDED_OBSTACLES,
} from '../rules';
import {
  type ClearingOptions,
  type ObstacleTally,
  type RatedLand,
  dwellingClearing,
  tallyCost,
} from '../core/obstacles';
import {
  type Craft,
  type DwellingPlot,
  type DwellingType,
  type Position,
  type SacredBuildingKind,
} from '../types';
import {
  type DwellingShape,
  type ShapedDwelling,
  dwellingShape,
} from '../buildings/dwelling-shape';
import { type LandSquare } from './squares';
import { fortificationBand } from '../fortification/band';
import { fortRuns } from '../fortification/runs';
import {
  type Landscape,
  SURFACE_CODES,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
} from '../../landscape';
import {
  type Point,
  coveredArea,
  pointInPolygon,
  polygonsOverlap,
  rectangleCorners,
} from './polygon';
import { type SacredSites, sacredFootprint } from '../people/sacred';
import { type Shape } from './plot-cells';
import { TAKEN_LAND_EPSILON_M2, type TakenLand, landTakenWarning } from '../buildings/land-taken';
import { distanceToSquare } from '../buildings/cemetery';
import { dwellingGatePoint } from '../paths/network';
import { foundingCostPerHa } from '../core/productivity';
import { kilnCircle } from '../crafts/charcoal';
import { pointsBounds, squareCenter, squareKey } from './square-grid';
import { threshingFloorFootprint } from '../fields/threshing-floors';
import { churchyardWorld } from './church-plot';
import {
  M2_PER_HA,
  OK,
  type PlacementCheck,
  type PlacementVillage,
  fail,
  wholeMeters,
} from './placement-types';
import type { SampledGround } from './placement-geometry';
import {
  cellCorners,
  cellsUnderPolygon,
  dwellingPlot,
  freeShape,
  landIndex,
  placedDwelling,
  squaresUnder,
} from './placement-geometry';

/** Strana malého čtverce kolem brány (m) – „brána padne do“ je jeho překryv. */
const GATE_PROBE_M = 0.2;

/** Obydlí, jehož brána se hledá (`dwellingGatePoint` – místo, odkud vychází síť pěšin). */
interface GateOwner {
  readonly type: DwellingType;
  readonly position: Position;
  readonly plot?: DwellingPlot;
  readonly plainShape?: boolean;
  /** Dílna – brána kovárny a hrnčíře leží před dvorem (`WORKSHOP_YARD_PATH_BOX_M`). */
  readonly craft?: Craft;
}

/** Malý čtverec kolem brány obydlí. */
function gateProbe(gate: { x: number; z: number }): Point[] {
  const h = GATE_PROBE_M / 2;
  return [
    [gate.x - h, gate.z - h],
    [gate.x + h, gate.z - h],
    [gate.x + h, gate.z + h],
    [gate.x - h, gate.z + h],
  ];
}

/** Obydlí vsi s branou – hotová i rozestavěná. */
function gateOwners(village: PlacementVillage): GateOwner[] {
  return [
    ...village.dwellings.map(placedDwelling),
    ...village.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null
        ? [
            {
              type: c.dwellingType,
              position: c.position,
              ...(c.plot ? { plot: c.plot } : {}),
              ...(c.craft ? { craft: c.craft } : {}),
              ...(c.plainShape ? { plainShape: true } : {}),
            },
          ]
        : [],
    ),
  ];
}

/**
 * Kam vede branka nového obydlí (population.md – Umístění obydlí; Martin 19. 10. 2026: „Ano,
 * zakaž to“ – na otázku, jestli zakázat umístění domu, jehož branka vede do cizího pozemku): místo
 * před brankou nebo vchodem – brána, odkud vychází síť pěšin (`dwellingGatePoint`; Vlkov: branka
 * polozemnice vedla do pozemku dvorce a domácnost neměla kudy chodit) – nesmí padnout do pozemku
 * nebo půdorysu jiného obydlí (i dvora dvorce, i rozestavěného), do modly či svatyně, do
 * hřbitova, ohrady ani do vody. Pole, sad, les a louka branku neblokují (pole je krajina). Vrátí
 * důvod, nebo null.
 */
export function gateProblem(
  landscape: Landscape,
  village: PlacementVillage | null,
  owner: GateOwner,
): string | null {
  const gate = dwellingGatePoint(landscape, owner);
  const probe = gateProbe(gate);
  const what = owner.plot ? 'Branka by vedla' : 'Vchod by vedl';
  const tile = tileOfWorldPoint(landscape, gate.x, gate.z);
  if (!tile) return `${what} ven z krajiny sídla.`;
  if (surfaceAt(landscape, tile.x, tile.y) === 'water') return `${what} do vody.`;
  if (village === null) return null;
  const hits = (polygons: readonly (readonly Point[])[]): boolean =>
    polygons.some((polygon) => polygonsOverlap(probe, polygon));
  for (const d of gateOwners(village)) {
    if (!hits(dwellingPlot(landscape, d))) continue;
    return d.plot && !d.craft ? `${what} do cizího pozemku.` : `${what} do jiného obydlí.`;
  }
  const sacred = village.sacredBuildings ?? [];
  for (const b of sacred) {
    if (!hits([sacredFootprint(b.kind, b.position)])) continue;
    return b.kind === 'idol' ? `${what} na modlu.` : `${what} do svatyně.`;
  }
  const floors = village.threshingFloors ?? [];
  if (floors.some((f) => hits([threshingFloorFootprint(f.position)]))) return `${what} na humno.`;
  const under = new Set(squaresUnder(landscape, village, freeShape(probe)).map((q) => q.kind));
  if (under.has('cemetery')) return `${what} do hřbitova.`;
  if (under.has('pen')) return `${what} do ohrady.`;
  return null;
}

/** Důvod, když stavba zatarasí branku nebo vchod obydlí vsi (opačná strana `gateProblem`). */
export const BLOCKS_GATE = 'Zatarasí sousedům branku.';

/**
 * Zatarasí stavba (mnohoúhelníky `polygons`) branku nebo vchod obydlí vsi – i rozestavěného a jiné
 * vsi na mapě? Opačná strana `gateProblem`: ve Vlkově přibyl pozemek dvorce před brankou starší
 * polozemnice. Domy postavené dřív se nemění – kontroluje se jen nová stavba.
 */
export function blocksGate(
  landscape: Landscape,
  village: PlacementVillage | null,
  polygons: readonly (readonly Point[])[],
): boolean {
  if (village === null) return false;
  return gateOwners(village).some((d) => {
    const probe = gateProbe(dwellingGatePoint(landscape, d));
    return polygons.some((polygon) => polygonsOverlap(probe, polygon));
  });
}

/**
 * Branky (`dwellingGatePoint`) hotových i rozestavěných obydlí, které stavba (mnohoúhelníky
 * `polygons`) zatarasí – totéž co `blocksGate`, ale s místy (rozhraní je ukáže červeně).
 */
export function blockedGates(
  landscape: Landscape,
  village: PlacementVillage | null,
  polygons: readonly (readonly Point[])[],
): { x: number; z: number }[] {
  if (village === null) return [];
  const found: { x: number; z: number }[] = [];
  for (const d of gateOwners(village)) {
    const gate = dwellingGatePoint(landscape, d);
    const probe = gateProbe(gate);
    if (polygons.some((polygon) => polygonsOverlap(probe, polygon))) {
      found.push({ x: gate.x, z: gate.z });
    }
  }
  return found;
}

/**
 * Co smí stavba zabrat: `fields` – čtverce polí (fields.md – Pole jako krajina: na pole smí
 * cokoli kromě pole), `orchards` – čtverce sadu (jen obydlí – population.md, Obydlí na poli
 * a v sadu), `woods` – čtverce lesa vsi (fields.md – Les vsi: les osadníci vyklučí jako les
 * krajiny – `ForestUse`). Bez údaje ani jedno.
 */
interface LandUse {
  fields?: boolean;
  orchards?: boolean;
  woods?: boolean;
}
/** Obydlí smí na pole, do sadu i do lesa vsi. */
export const DWELLING_LAND: LandUse = { fields: true, orchards: true, woods: true };
/** Ostatní stavby na pole (Martin – pole jako krajina) a do lesa vsi. */
export const FIELD_LAND: LandUse = { fields: true, woods: true };

/** Důvod u kurzoru – stavba přes obydlí (i s pozemkem). */
export const OVERLAPS_DWELLING = 'Překrývá se s jiným obydlím.';
/** Důvod u kurzoru – stavba přes rozestavěné obydlí. */
export const OVERLAPS_DWELLING_SITE = 'Překrývá se s rozestavěným obydlím.';
/** Důvod u kurzoru – stavba přes pás opevnění (fortifications.md – Obvod). */
const OVERLAPS_FORTIFICATION = 'Stojí tu opevnění.';

/**
 * Půdorys nebo pozemek (tvary `shapes`) se nepřekrývá s obydlím či rozestavěným obydlím (i jejich
 * pozemky), modlou, svatyní, humnem, ohradou ani se čtvercem pohřebiště – a podle `land` ani se
 * čtvercem pole, sadu či lesa vsi. Čtverce staveb i natočené (fields.md – Natočené stavby).
 */
export function checkFootprintFree(
  landscape: Landscape,
  village: PlacementVillage | null,
  shapes: readonly Shape[],
  land: LandUse = {},
): PlacementCheck {
  if (village === null) return OK;
  const overlaps = (other: readonly Point[][]): boolean =>
    shapes.some((a) => other.some((b) => polygonsOverlap(a.corners, b)));
  /** Obrysy z `other`, které se překrývají se stavbou – místo problému. */
  const hitting = (other: readonly Point[][]): { footprints: Point[][] } => ({
    footprints: other.filter((b) => shapes.some((a) => polygonsOverlap(a.corners, b))),
  });
  for (const d of village.dwellings) {
    const plot = dwellingPlot(landscape, placedDwelling(d));
    if (overlaps(plot)) return fail(OVERLAPS_DWELLING, hitting(plot));
  }
  for (const c of village.constructions) {
    if (c.dwellingType === null || c.position === null) continue;
    const site = {
      type: c.dwellingType,
      position: c.position,
      ...(c.plot ? { plot: c.plot } : {}),
      ...(c.craft ? { craft: c.craft } : {}),
      ...(c.plainShape ? { plainShape: true } : {}),
    };
    const plot = dwellingPlot(landscape, site);
    if (overlaps(plot)) return fail(OVERLAPS_DWELLING_SITE, hitting(plot));
  }
  for (const b of village.sacredBuildings ?? []) {
    if (overlaps([sacredFootprint(b.kind, b.position)])) {
      return fail(b.kind === 'idol' ? 'Překrývá se s modlou.' : 'Překrývá se se svatyní.');
    }
  }
  // humno – mlatová plocha s přístřeškem (production-chains.md – Humno)
  for (const f of village.threshingFloors ?? []) {
    if (overlaps([threshingFloorFootprint(f.position)])) return fail('Překrývá se s humnem.');
  }
  // kostel s hřbitůvkem i rozestavěný (churches.md – Stavba)
  for (const c of village.churches ?? []) {
    if (overlaps([churchyardWorld(c.type, c.dims, c.position)]))
      return fail('Překrývá se s kostelem.');
  }
  // pás opevnění (fortifications.md – Obvod): hotové úseky a díly, na kterých běží stavba
  for (const f of village.fortifications ?? []) {
    const building = fortRuns(village.constructions, f.id);
    if (overlaps(fortificationBand(landscape, f, building))) return fail(OVERLAPS_FORTIFICATION);
  }
  // milíř uhlíře je samostatná stavba (crafts.md – Milíř u skácených buků)
  for (const k of village.kilns ?? []) {
    if (overlaps([kilnCircle(k, MILIR.clearingRadiusM)])) return fail('Stojí tu milíř.');
  }
  // místo před brankou sousedního obydlí (population.md – Umístění obydlí)
  const gates = blockedGates(
    landscape,
    village,
    shapes.map((shape) => shape.corners),
  );
  if (gates.length > 0) return fail(BLOCKS_GATE, { points: gates });
  const under = new Set(
    shapes.flatMap((shape) => squaresUnder(landscape, village, shape)).map((q) => q.kind),
  );
  if (!land.fields && under.has('field')) return fail('Překrývá se s polem.');
  if (under.has('cemetery')) return fail('Překrývá se s hřbitovem.');
  if (!land.orchards && under.has('orchard')) return fail('Překrývá se se sadem.');
  if (under.has('pen')) return fail('Překrývá se s ohradou.');
  if (!land.woods && under.has('wood')) return fail('Roste tu les vsi.');
  return OK;
}

/**
 * Stavba v lese (Martin, 19. 10. 2026: „obydlí může jít postavit i v lese – les se prostě
 * vyklučí“; cena návrh Clauda – fields.md, Krajina sídla a scéna): les krajiny i les vsi pod
 * stavbou osadníci vyklučí jako díl pole v lese – za plochu lesa sazba lesa za hektar
 * (`foundingCostPerHa('forest')`, s řemesly levněji), stromy, mladé stromky, souše, padlé kmeny,
 * pařezy i podrost s patou v lese jsou v ní (SURFACE_INCLUDED_OBSTACLES.forest), kameny a balvany
 * se platí po kusech. Odstraní se všechno, dospělé stromy dají klády. Kolem volně stojící stavby
 * (obydlí, dílna, modla, svatyně) osadníci v lese vyklučí i pruh pod korunami okolních stromů
 * (FOREST_CROWN_MARGIN_M – jen les, ne louku ani pole). Půda, která patří jiné stavbě (pole, sad,
 * hřbitov, ohrada), a háje se nepočítají. `clearForest: false` – stavba jen na louku (obyvatelé si
 * les sami nevyklučí – přestavba na novém pozemku, převod starých vsí, místo nové vsi).
 */
export interface ForestUse {
  clearForest?: boolean;
}

/**
 * Co osadníci u volně stojící stavby vyklidí: překážky v mnohoúhelnících `polygons` (v lese
 * vyklízená plocha s pruhem pod korunami) podle `options` (v pruhu jen les, druhy v sazbě lesa)
 * a práce `cost` za plochu lesa.
 */
interface ForestClearing {
  polygons: readonly (readonly Point[])[];
  options: ClearingOptions;
  cost: number;
}

/** Krok vzorkování plochy lesa pod volnou stavbou na políčku se čtverci staveb či lesa vsi (m). */
const FOREST_SAMPLE_M = 0.5;

/**
 * Leží bod na lese – políčku lesa krajiny nebo čtverci lesa vsi – mimo půdu, která patří jiné
 * stavbě (`owned` – index políčka y × size + x jako u překážek)?
 */
function forestLandAt(
  landscape: Landscape,
  village: PlacementVillage | null,
  owned: (x: number, z: number, tile: number) => boolean,
): (x: number, z: number) => boolean {
  const index = landIndex(landscape, village);
  const half = (landscape.size * landscape.cellSizeM) / 2;
  return (x, z) => {
    const tx = Math.floor((x + half) / landscape.cellSizeM);
    const ty = Math.floor((z + half) / landscape.cellSizeM);
    if (tx < 0 || ty < 0 || tx >= landscape.size || ty >= landscape.size) return false;
    if (owned(x, z, ty * landscape.size + tx)) return false;
    if (surfaceAt(landscape, tx, ty) === 'forest') return true;
    return !index.empty && index.containing(x, z).some((square) => square.kind === 'wood');
  };
}

/** Je pod obdélníkem bodů `points` vůbec les (políčko lesa krajiny, nebo čtverec lesa vsi)? */
function forestNear(
  landscape: Landscape,
  village: PlacementVillage | null,
  points: readonly Point[],
): boolean {
  const [minX, minZ, maxX, maxZ] = pointsBounds(points);
  const box: Point[] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  const forest = SURFACE_CODES.forest;
  if (cellsUnderPolygon(landscape, box).some((tile) => landscape.surface[tile] === forest)) {
    return true;
  }
  return squaresUnder(landscape, village, freeShape(box)).some((square) => square.kind === 'wood');
}

/**
 * Plocha lesa (m²) pod sjednocením konvexních mnohoúhelníků `polygons`: na políčku lesa krajiny
 * bez čtverců staveb a lesa vsi přesně (průnik ploch), na políčku se čtverci body ve středech buněk
 * mřížky po FOREST_SAMPLE_M zarovnané s políčkem (`forestAt`).
 */
function forestAreaUnder(
  landscape: Landscape,
  village: PlacementVillage | null,
  polygons: readonly (readonly Point[])[],
  owned: (x: number, z: number, tile: number) => boolean,
  forestAt: (x: number, z: number) => boolean,
): number {
  const index = landIndex(landscape, village);
  const { size, cellSizeM } = landscape;
  const half = (size * cellSizeM) / 2;
  const [minX, minZ, maxX, maxZ] = pointsBounds(polygons.flat());
  const toTile = (v: number): number =>
    Math.min(size - 1, Math.max(0, Math.floor((v + half) / cellSizeM)));
  const n = Math.max(1, Math.floor(cellSizeM / FOREST_SAMPLE_M));
  const step = cellSizeM / n;
  let area = 0;
  for (let ty = toTile(minZ); ty <= toTile(maxZ); ty++) {
    for (let tx = toTile(minX); tx <= toTile(maxX); tx++) {
      const tile = ty * size + tx;
      const corners = cellCorners(landscape, { x: tx, y: ty });
      if (!polygons.some((polygon) => polygonsOverlap(polygon, corners))) continue;
      if (index.overlapping(corners, tile).length === 0) {
        // jen krajina (háj patří celému políčku)
        const center = tileCenterWorld(landscape, tx, ty);
        if (landscape.surface[tile] !== SURFACE_CODES.forest) continue;
        if (owned(center.x, center.z, tile)) continue;
        area += Math.min(cellSizeM * cellSizeM, coveredArea(polygons, corners));
        continue;
      }
      const x0 = -half + tx * cellSizeM;
      const z0 = -half + ty * cellSizeM;
      let count = 0;
      for (let j = 0; j < n; j++) {
        const z = z0 + (j + 0.5) * step;
        if (z < minZ || z > maxZ) continue;
        for (let i = 0; i < n; i++) {
          const x = x0 + (i + 0.5) * step;
          if (x < minX || x > maxX) continue;
          if (!polygons.some((polygon) => pointInPolygon([x, z], polygon))) continue;
          if (forestAt(x, z)) count++;
        }
      }
      area += count * step * step;
    }
  }
  return area;
}

/** Práce za vyklučení `areaM2` lesa – sazba lesa jako u dílu pole (podle pokrytí nástroji). */
function forestClearingCost(village: PlacementVillage | null, areaM2: number): number {
  if (areaM2 <= 0) return 0;
  return (foundingCostPerHa('forest', village?.toolCoverage ?? 0) * areaM2) / M2_PER_HA;
}

/** Druhy překážek v sazbě lesa s patou tam, kde platí `at`. */
function forestRated(at: (x: number, z: number) => boolean): RatedLand {
  return { at, kinds: SURFACE_INCLUDED_OBSTACLES.forest };
}

/**
 * Vyklízená plocha volně stojící stavby (obydlí, dílna, modla, svatyně – `clearings`) a v lese
 * i s pruhem pod korunami (`crowned` – tytéž plochy rozšířené o FOREST_CROWN_MARGIN_M): překážky
 * na vyklízené ploše všude, v pruhu jen na lese; za plochu lesa sazba lesa a druhy v ní se neplatí
 * po kusech. Bez lesa (nebo bez `clearForest`) jen vyklízená plocha jako dřív.
 */
export function freeForestClearing(
  landscape: Landscape,
  village: PlacementVillage | null,
  clearings: readonly (readonly Point[])[],
  crowned: readonly (readonly Point[])[],
  owned: (x: number, z: number, tile: number) => boolean,
  clearForest = true,
): ForestClearing {
  if (!clearForest || !forestNear(landscape, village, crowned.flat())) {
    return { polygons: clearings, options: {}, cost: 0 };
  }
  const at = forestLandAt(landscape, village, owned);
  const inClearing = (x: number, z: number): boolean =>
    clearings.some((polygon) => pointInPolygon([x, z], polygon));
  return {
    polygons: crowned,
    options: { rated: forestRated(at), only: (x, z) => inClearing(x, z) || at(x, z) },
    cost: forestClearingCost(village, forestAreaUnder(landscape, village, crowned, owned, at)),
  };
}

/** Políčka hájů pod mnohoúhelníky (index y × size + x). */
export function groveTilesUnder(
  landscape: Landscape,
  sites: SacredSites,
  polygons: readonly (readonly Point[])[],
): number[] {
  return polygons
    .flatMap((polygon) => cellsUnderPolygon(landscape, polygon))
    .filter((tile) => sites.groveByTile.has(tile));
}

/**
 * Leží čtverec stavby (pozemek, ohrada, sad, hřbitov) v lese – jako díl pole (`buildSquares`):
 * políčko lesa krajiny, natočený čtverec většinou bodů v lese, nebo zasahuje do lesa vsi.
 */
export function squareInForest(
  landscape: Landscape,
  village: PlacementVillage | null,
  shape: Shape,
  ground: Pick<SampledGround, 'forest'>,
): boolean {
  return ground.forest || squaresUnder(landscape, village, shape).some((q) => q.kind === 'wood');
}

/**
 * Cena překážek a lesa na čtverci stavby: v lese sazba lesa za plochu `forestAreaM2` (čtverec bez
 * půdy, kterou bere poli či sadu) a po kusech jen druhy mimo ni, jinak všechno po kusech.
 */
export function squareObstacleCost(
  village: PlacementVillage | null,
  tally: ObstacleTally,
  forest: boolean,
  forestAreaM2: number,
): number {
  if (!forest) return tally.cost;
  return (
    tallyCost(tally, SURFACE_INCLUDED_OBSTACLES.forest) + forestClearingCost(village, forestAreaM2)
  );
}

/**
 * Plocha čtverce (políčka) bez kusů, které stavba bere polím a sadům (`taken`); zbytek pod
 * TAKEN_LAND_EPSILON_M2 (zaokrouhlení průniků natočených čtverců) je 0.
 */
export function squareFreeArea(landscape: Landscape, taken: readonly TakenLand[]): number {
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const free = cellArea - taken.reduce((sum, t) => sum + t.areaM2, 0);
  return free > TAKEN_LAND_EPSILON_M2 ? free : 0;
}

/**
 * Vyklízená plocha obydlí bez pozemku (`DWELLING_CLEARING_M` – staveniště s hromadou hlíny
 * a střechou předsazenou před štíty); dílna stejně (milíř uhlíře je samostatná stavba – crafts.md,
 * Milíř u skácených buků). Tolik obydlí sebere z polí a sadů; podle ní scéna pod domem nekreslí
 * obilí ani jabloně. `margin` (m) plochy rozšíří – v lese pruh pod korunami
 * (FOREST_CROWN_MARGIN_M).
 */
export function freeDwellingClearings(
  type: DwellingType,
  position: Position,
  shape: DwellingShape,
  margin = 0,
): Point[][] {
  return [dwellingClearing(type, position, shape, margin)];
}

/**
 * Plochy, ze kterých v lese zmizí les pod volně stojící stavbou (vyklízená plocha s pruhem pod
 * korunami – FOREST_CROWN_MARGIN_M): obydlí a dílny (`freeDwellingClearings`), modly a svatyně
 * (půdorys). Scéna podle nich zanoří plochu korun nad pasekou.
 */
export function forestClearingsOf(
  building:
    (ShapedDwelling & { position: Position }) | { sacred: SacredBuildingKind; position: Position },
): Point[][] {
  if ('sacred' in building) return [sacredCrowned(building.sacred, building.position)];
  return freeDwellingClearings(
    building.type,
    building.position,
    dwellingShape(building),
    FOREST_CROWN_MARGIN_M,
  );
}

/** Půdorys modly či svatyně rozšířený o pruh pod korunami (FOREST_CROWN_MARGIN_M). */
export function sacredCrowned(kind: SacredBuildingKind, position: Position): Point[] {
  const size = SACRED_BUILDINGS[kind].footprintM + 2 * FOREST_CROWN_MARGIN_M;
  return rectangleCorners(position.x, position.z, size, size, position.rotation);
}

/** Zabraný kus čtverce pole či sadu `square` – s mřížkou natočené stavby. */
function takenOf(square: LandSquare, areaM2: number, cellAreaM2: number): TakenLand {
  return {
    cell: { x: square.cell.x, y: square.cell.y },
    ...(square.grid ? { grid: square.grid } : {}),
    areaM2,
    cellAreaM2,
  };
}

/** Pořadí zabraných kusů: mřížka krajiny první, pak po řádcích (y, pak x) jako dřív po políčkách. */
function byTakenOrder(a: LandSquare, b: LandSquare): number {
  if ((a.tile === null) !== (b.tile === null)) return a.tile === null ? 1 : -1;
  if (a.tile !== null && b.tile !== null) return a.tile - b.tile;
  const ka = squareKey(a.grid, a.cell);
  const kb = squareKey(b.grid, b.cell);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Kusy čtverců polí a sadů pod vyklízenými plochami `clearings` (konvexní mnohoúhelníky jedné
 * stavby) – průnik s každým čtvercem (i natočeným), dotyk hranou se nepočítá. Po řádcích políček,
 * natočené čtverce nakonec.
 */
export function takenLandUnder(
  landscape: Landscape,
  village: PlacementVillage | null,
  clearings: readonly Point[][],
): TakenLand[] {
  const crops = new Map<string, LandSquare>();
  for (const clearing of clearings) {
    for (const square of squaresUnder(landscape, village, freeShape(clearing))) {
      if (square.kind !== 'field' && square.kind !== 'orchard') continue;
      crops.set(squareKey(square.grid, square.cell), square);
    }
  }
  if (crops.size === 0) return [];
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  return [...crops.values()].sort(byTakenOrder).flatMap((square) => {
    const areaM2 = Math.min(cellAreaM2, coveredArea(clearings, square.corners));
    return areaM2 > TAKEN_LAND_EPSILON_M2 ? [takenOf(square, areaM2, cellAreaM2)] : [];
  });
}

/**
 * Kusy čtverců polí (a sadů – `kinds`) pod čtvercem stavby `shape` (pozemek, čtverec sadu,
 * hřbitova, ohrady): čtverec, který tvar přesně zabírá, celý (jako dřív po políčkách), jinak
 * průnik ploch (natočené stavby – fields.md, Natočené stavby).
 */
export function takenSquareLand(
  landscape: Landscape,
  village: PlacementVillage | null,
  shape: Shape,
  kinds: readonly ('field' | 'orchard')[] = ['field', 'orchard'],
): TakenLand[] {
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  return squaresUnder(landscape, village, shape)
    .filter((square) => (kinds as readonly string[]).includes(square.kind))
    .sort(byTakenOrder)
    .flatMap((square) => {
      const whole = shape.tile !== null && square.tile === shape.tile;
      const areaM2 = whole
        ? cellAreaM2
        : Math.min(cellAreaM2, coveredArea([shape.corners], square.corners));
      return areaM2 > TAKEN_LAND_EPSILON_M2 ? [takenOf(square, areaM2, cellAreaM2)] : [];
    });
}

/** Varování u kurzoru, že stavba sebere půdu poli nebo sadu (`landTakenWarning`). */
export function takenLandWarning(
  landscape: Landscape,
  village: PlacementVillage | null,
  taken: readonly TakenLand[],
): string | undefined {
  return village === null
    ? undefined
    : landTakenWarning(village, taken, landscape.cellSizeM * landscape.cellSizeM);
}

/** Varování oddělená řádky (prázdná vynechá); žádné → undefined. */
export function joinWarnings(...warnings: (string | undefined)[]): string | undefined {
  const text = warnings.filter(Boolean).join('\n');
  return text || undefined;
}

/** Varování, když obydlí stojí blíž hřbitovu, než je pro hygienu v pořádku (neblokuje). */
export function nearCemeteryWarning(
  landscape: Landscape,
  village: PlacementVillage | null,
  position: Position,
): PlacementCheck {
  let nearest = Infinity;
  for (const cemetery of village?.cemeteries ?? []) {
    const grid = cemetery.grid;
    for (const { cell } of cemetery.squares) {
      // natočený hřbitov (fields.md – Natočené stavby) – střed a osy čtverce v jeho mřížce
      const center = grid
        ? squareCenter(landscape, grid, cell)
        : tileCenterWorld(landscape, cell.x, cell.y);
      nearest = Math.min(
        nearest,
        distanceToSquare(position.x, position.z, center, landscape.cellSizeM, grid?.rotation),
      );
    }
  }
  if (nearest >= CEMETERY_DISTANCE_M.dwelling.ok) return OK;
  return { ok: true, reason: null, warning: `Blízko hřbitova (${wholeMeters(nearest)})` };
}
