import {
  detCos,
  detSin,
  length2,
  obstaclesNear,
  obstaclesOf,
  type Landscape,
  type ObstacleLayer,
} from '../landscape';
import { workshopKilns } from './charcoal';
import { GRAIN_PITS, MILIR, WAGON_ROAD } from './rules';
import { FLOOD } from './rules-disasters';
import { villageManor } from './manor';
import { obstacleChangesAt, obstacleStatus } from './obstacles';
import { editedHeight, naturalHeightAt, profileLength, terrainEditsFrom } from './paths/earthworks';
import { threshingFloorEntrance } from './paths/entrances';
import { heightAboveStreamAt } from './part-protection';
import { PATH_FOREST, PATH_FORD, PATH_WATER, PATH_WATER_SPOT, PATH_WETLAND } from './paths/terrain';
import { walkGroundOf } from './paths/walking';
import { moveGrainFromPits } from './grain-pits';
import { polygonsOverlap, rectangleCorners, type Point } from './polygon';
import { structureShapes } from './ruins';
import { PolygonIndex, villageLandSquares, type LandSquare } from './squares';
import { builtThreshingFloors, villageThreshingFloors } from './threshing-floors';
import type { GrainPit, VillageState } from './types';

// Místo obilných jam (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „na příhodném
// místě obilné jámy po sklizni vykopou“; podrobnosti návrh Clauda): jámy kopou vesničané sami
// u humna (bez humna u dvorce vojvody) – suché místo mimo vodu, mokřinu a les, mimo pole, sady,
// hřbitovy, ohrady a les vsi, mimo obydlí, pozemky, stavby, humna i jejich vstup, milíře a pevné
// cesty, mimo zemní práce vozových cest (pláň i svahy úvozu a náspu celé plánované osy), bez stromu, keře či kamene na místě, aspoň
// GRAIN_PITS.spacingM od ostatních jam. Hledá se od humna po kružnicích (GRAIN_PITS.stepM) do
// GRAIN_PITS.siteM, když tam nic není, dál až do FAR_SEARCH × siteM – nejbližší vhodné místo, takže
// se jámy drží pohromadě; ani tam nic – jámu nevykopou a zrno zůstane mimo jámy. Místo vybírá jen
// server (simulace) a scéna dostane polohy jam (`SceneVillage.grainPits`) – výsledek nezávisí na
// prohlížeči. Deterministicky (det-math).
//
// Hráč zavřenou jámu nevidí, stavbu na ní proto nezakazuje: jáma pod stavbou nebo zemními pracemi
// vozové cesty zmizí a vesničané zrno přendají (`withoutBuiltOverGrainPits` po akci hráče,
// `moveGrainFromCoveredPits` v simulaci).

/** Poloměr jámy i s okrajem (m) – kolik místa zabere a od čeho drží odstup. */
const PIT_RADIUS_M = 1.2;
/** Odstup jámy od stavby, čtverce či pozemku (m – čtverec jámy zvětšený o tolik). */
const STRUCTURE_MARGIN_M = 1;
/** Odstup středu jámy od osy pevné cesty (m) – pás cesty a kousek vedle. */
const ROAD_CLEAR_M = 3;
/** Odstup od vstupu humna (m) – před vstupem se nosí snopy a zrno. */
const ENTRANCE_CLEAR_M = 5;
/** Kolem jámy nesmí stát strom, keř ani kámen (m). */
const OBSTACLE_CLEAR_M = 1.5;
/** Jámy ani nehledá blíž ke kraji krajiny (m). */
const EDGE_M = 10;
/** Nejbližší kružnice hledání (m od humna) – humno 8 × 10 m má poloviční úhlopříčku ≈ 6,4 m. */
const FIRST_RING_M = 7.5;
/** Když do GRAIN_PITS.siteM nic není, hledá se dál až do tolikanásobku (180 m). */
const FAR_SEARCH = 3;
/** Zemní práce mění terén v bodě, když se liší od původního víc než tolik (m) – svah úvozu či náspu. */
const EARTHWORK_CHANGE_M = 0.05;
/** Body po obvodu jámy, ve kterých se hledají zemní práce. */
const RIM_POINTS = 8;
/** Bez krajiny (testy, kalibrace na syntetické louce): řada jam kus od humna. */
const FLAT = { offsetM: 12, perRow: 5 } as const;

/** Kde vesničané jámy kopou – střed hledání: humno (hotové napřed), dvorec, první obydlí. */
export function grainPitCenter(state: VillageState): { x: number; z: number } {
  const floor = builtThreshingFloors(state)[0] ?? villageThreshingFloors(state)[0];
  if (floor) return { x: floor.position.x, z: floor.position.z };
  const manor = villageManor(state) ?? state.dwellings[0];
  if (manor) return { x: manor.position.x, z: manor.position.z };
  const site = state.constructions.find((c) => c.position !== null);
  return site?.position ? { x: site.position.x, z: site.position.z } : { x: 0, z: 0 };
}

/** Místa jam vsi – i nové, kterou vesničané kopou (`GrainPitWork.site`). */
function takenSpots(state: VillageState): { x: number; z: number }[] {
  const site = state.grainPitWork?.site;
  return [...(state.grainPits ?? []), ...(site ? [site] : [])];
}

/** Čtverec jámy zvětšený o `margin` (m) – pro průnik se stavbami a čtverci. */
function pitSquare(p: { x: number; z: number }, margin: number): Point[] {
  const side = 2 * (PIT_RADIUS_M + margin);
  return rectangleCorners(p.x, p.z, side, side, 0);
}

/** Půdorysy milířů (čtverce kolem kruhu milířiště). */
function kilnShapes(state: VillageState): Point[][] {
  const side = 2 * MILIR.clearingRadiusM;
  return state.dwellings.flatMap((d) =>
    workshopKilns(d.workshop).flatMap((k) =>
      k.site ? [rectangleCorners(k.site.x, k.site.z, side, side, 0)] : [],
    ),
  );
}

/** Vzdálenost bodu od lomené čáry (m). */
function polylineDistance(
  p: { x: number; z: number },
  points: readonly { x: number; z: number }[],
): number {
  let best = Infinity;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
    best = Math.min(best, length2(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}

/**
 * Zasahuje jáma (střed, poloměr `radius`) do zemních prací vozových cest vsi (roads.md – Vozová
 * cesta) – celé plánované osy, hotové i rozestavěné: pláň do WAGON_ROAD.flatHalfM od osy (i přes
 * brod), nebo s krajinou svah úvozu či náspu – terén se ve středu nebo na obvodu jámy mění víc než
 * EARTHWORK_CHANGE_M. Bez zemních prací null.
 */
function earthworkCheck(
  state: VillageState,
  landscape: Landscape | null,
): ((p: { x: number; z: number }, radius: number) => boolean) | null {
  const earthworks = state.roads?.earthworks ?? [];
  if (earthworks.length === 0) return null;
  const edits = terrainEditsFrom(
    earthworks.map((e) => ({
      profile: e.profile,
      ...(e.fords ? { fords: e.fords } : {}),
      reachedM: profileLength(e.profile),
    })),
  );
  return (p, radius) => {
    if (earthworks.some((e) => polylineDistance(p, e.profile) <= WAGON_ROAD.flatHalfM + radius)) {
      return true;
    }
    if (!landscape) return false;
    for (let k = 0; k <= RIM_POINTS; k++) {
      const a = (2 * Math.PI * k) / RIM_POINTS;
      const q = k === 0 ? p : { x: p.x + radius * detCos(a), z: p.z + radius * detSin(a) };
      const natural = naturalHeightAt(landscape, q.x, q.z);
      if (Math.abs(editedHeight(edits, q.x, q.z, natural) - natural) > EARTHWORK_CHANGE_M) {
        return true;
      }
    }
    return false;
  };
}

/** Bod na cm. */
function round(p: { x: number; z: number }): { x: number; z: number } {
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}

/**
 * Kontrola místa jámy nad krajinou a stavem vsi – jednou postavené dotazy (terén, čtverce, stavby,
 * cesty, překážky); `taken` = místa jam, od kterých jáma drží odstup (doplňuje se).
 */
function siteCheck(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  taken: { x: number; z: number }[],
): (p: { x: number; z: number }) => boolean {
  const terrain = walkGroundOf(landscape).terrain;
  const land = new PolygonIndex(landscape, villageLandSquares(landscape, state));
  const shapes = [...structureShapes(state, landscape), ...kilnShapes(state)];
  const roads = state.roads?.roads ?? [];
  const orePits = state.orePits ?? [];
  const entrances = villageThreshingFloors(state).map((f) => threshingFloorEntrance(f.position));
  const status = obstacleStatus(obstacleChangesAt(state, day));
  const earthwork = earthworkCheck(state, landscape);
  const half = (landscape.size * landscape.cellSizeM) / 2 - EDGE_M;
  // kde hrozí povodeň (ves s počasím kraje), jáma se nekope níž než dvacetiletá voda
  // (disasters.md – Povodeň potoka)
  const floodSafe = (p: { x: number; z: number }): boolean =>
    state.weatherSeed === undefined ||
    heightAboveStreamAt(landscape, p.x, p.z) >= FLOOD.pitMinHeightM;
  const wet = PATH_WATER | PATH_WATER_SPOT | PATH_FORD | PATH_WETLAND | PATH_FOREST;
  return (p) => {
    if (Math.abs(p.x) > half || Math.abs(p.z) > half) return false;
    // suché místo mimo vodu, mokřinu a les
    const i = Math.round((p.x - terrain.originX) / terrain.cellM);
    const j = Math.round((p.z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return false;
    if (terrain.flags[j * terrain.width + i]! & wet) return false;
    if (!floodSafe(p)) return false;
    if (taken.some((t) => length2(t.x - p.x, t.z - p.z) < GRAIN_PITS.spacingM)) return false;
    if (entrances.some((e) => length2(e.x - p.x, e.z - p.z) < ENTRANCE_CLEAR_M)) return false;
    if (orePits.some((o) => length2(o.x - p.x, o.z - p.z) < GRAIN_PITS.orePitClearM)) return false;
    if (roads.some((r) => polylineDistance(p, r.points) < ROAD_CLEAR_M)) return false;
    const square = pitSquare(p, STRUCTURE_MARGIN_M);
    if (land.overlapping(square).length > 0) return false;
    if (shapes.some((shape) => polygonsOverlap(shape, square))) return false;
    // zemní práce vozových cest (pláň i svahy)
    if (earthwork?.(p, PIT_RADIUS_M + STRUCTURE_MARGIN_M)) return false;
    // strom, keř ani kámen na místě (i stromy, které přidala ves – u cest, les vsi)
    const r = OBSTACLE_CLEAR_M;
    for (const k of obstaclesNear(obstacles, p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (length2(obstacles.x[k]! - p.x, obstacles.z[k]! - p.z) >= r) continue;
      if (status.kindOf(obstacles, k) !== null) return false;
    }
    return status
      .addedIn(p.x - r, p.z - r, p.x + r, p.z + r)
      .every((o) => length2(o.x - p.x, o.z - p.z) >= r);
  };
}

/**
 * Místa `count` nových jam (production-chains.md – Obilné jámy): každé nejbližší vhodné místo od
 * humna (`grainPitCenter`) po kružnicích do GRAIN_PITS.siteM, dál od jam vsi i od míst vybraných
 * před ním. Bez vhodného místa se hledá dál (až FAR_SEARCH × siteM); ani tam nic – null (jáma se
 * nevykope). Bez krajiny (testy, kalibrace) řada jam kus od humna.
 */
export function grainPitSites(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null = null,
  count = 1,
): ({ x: number; z: number } | null)[] {
  const center = grainPitCenter(state);
  const taken = takenSpots(state);
  const out: ({ x: number; z: number } | null)[] = [];
  if (!landscape) {
    for (let n = 0; n < count; n++) {
      const k = taken.length + n;
      out.push(
        round({
          x: center.x + FLAT.offsetM + (k % FLAT.perRow) * GRAIN_PITS.spacingM,
          z: center.z + Math.floor(k / FLAT.perRow) * GRAIN_PITS.spacingM,
        }),
      );
    }
    return out;
  }
  const ok = siteCheck(state, day, landscape, obstacles ?? obstaclesOf(landscape), taken);
  for (let n = 0; n < count; n++) {
    const site = nearestSite(center, ok);
    out.push(site);
    // bez místa pro tuto jámu ho nemají ani další (přibyla by jen další omezení)
    if (!site) return [...out, ...Array.from({ length: count - n - 1 }, () => null)];
    taken.push(site);
  }
  return out;
}

/** Nejbližší místo od středu po kružnicích, které projde kontrolou; null – žádné. */
function nearestSite(
  center: { x: number; z: number },
  ok: (p: { x: number; z: number }) => boolean,
): { x: number; z: number } | null {
  const step = GRAIN_PITS.stepM;
  for (let r = FIRST_RING_M; r <= GRAIN_PITS.siteM * FAR_SEARCH + 1e-9; r += step) {
    const count = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const p = round({ x: center.x + r * detCos(angle), z: center.z + r * detSin(angle) });
      if (ok(p)) return p;
    }
  }
  return null;
}

/** Místo jedné nové jámy (`grainPitSites`); null – vhodné místo do 180 m není. */
export function chooseGrainPitSite(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null = null,
): { x: number; z: number } | null {
  return grainPitSites(state, day, landscape, obstacles, 1)[0] ?? null;
}

/**
 * Jámy (i nová, kterou kopou), přes které stojí nebo se staví stavba – obydlí, pozemek, dílna,
 * modla, svatyně, humno, milíř, čtverec pole, sadu, hřbitova či ohrady, nebo zemní práce vozové
 * cesty (pláň a svahy celé plánované osy). Bez krajiny jen půdorysy staveb a pláň vozové cesty.
 */
export function coveredGrainPitIds(state: VillageState, landscape: Landscape | null): Set<number> {
  const covered = new Set<number>();
  const site = state.grainPitWork?.site;
  const pits: { id: number; x: number; z: number }[] = [
    ...(state.grainPits ?? []),
    ...(site ? [site] : []),
  ];
  if (pits.length === 0) return covered;
  const shapes = [...structureShapes(state, landscape), ...kilnShapes(state)];
  const earthwork = earthworkCheck(state, landscape);
  let squares: PolygonIndex<LandSquare> | null = null;
  for (const pit of pits) {
    const square = pitSquare(pit, 0);
    if (shapes.some((shape) => polygonsOverlap(shape, square)) || earthwork?.(pit, PIT_RADIUS_M)) {
      covered.add(pit.id);
      continue;
    }
    if (!landscape) continue;
    squares ??= new PolygonIndex(
      landscape,
      villageLandSquares(landscape, state, ['field', 'orchard', 'cemetery', 'pen']),
    );
    if (squares.overlapping(square).length > 0) covered.add(pit.id);
  }
  return covered;
}

/**
 * Krok simulace (mutuje stav): jámy pod novou stavbou zmizí, vesničané zrno přendají bez ztráty
 * (`moveGrainFromPits`).
 */
export function moveGrainFromCoveredPits(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): void {
  const covered = coveredGrainPitIds(state, landscape);
  if (covered.size > 0) moveGrainFromPits(state, day, covered);
}

/**
 * Po akci hráče: jámy pod novou stavbou zmizí a zrno se přendá (production-chains.md – Obilné
 * jámy; návrh Clauda – hráč zavřenou jámu nevidí, stavbu nezakazuje). Vrátí nový stav, beze změny
 * týž objekt.
 */
export function withoutBuiltOverGrainPits(state: VillageState, landscape: Landscape): VillageState {
  if ((state.grainPits ?? []).length === 0 && !state.grainPitWork?.site) return state;
  const covered = coveredGrainPitIds(state, landscape);
  if (covered.size === 0) return state;
  const next: VillageState = {
    ...state,
    grainPits: (state.grainPits ?? []).map((p) => ({ ...p })),
    ...(state.grainPitWork ? { grainPitWork: { ...state.grainPitWork } } : {}),
  };
  moveGrainFromPits(next, Math.max(state.lastDay, 0), covered);
  return next;
}

/**
 * Převod starší vsi (production-chains.md – Obilné jámy; Ruling návrh Clauda): ves uložená před
 * jamami (`grainPits` chybí) uloží zásoby obilí do jam u humna (bez humna u dvorce) – bez práce,
 * po plných jamách, všechny zapečetěné kromě poslední (neúplné), ze které se jí. Co se pro
 * chybějící místo do jam nevejde, zůstane mimo jámy. Zásoby se nemění. Jednou – ves s jamami
 * (i nová ves s prázdnými) se nemění.
 */
export function withGrainPits(
  state: VillageState,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null = null,
): VillageState {
  if (state.grainPits !== undefined) return state;
  const day = state.lastDay;
  const amounts: number[] = [];
  let left = Math.max(0, state.storesKg);
  while (left > 1) {
    const kg = Math.min(GRAIN_PITS.capacityKg, left);
    amounts.push(kg);
    left -= kg;
  }
  const pits: GrainPit[] = [];
  const next: VillageState = { ...state, grainPits: pits };
  const sites = grainPitSites(next, day, landscape, obstacles, amounts.length);
  amounts.forEach((kg, k) => {
    const site = sites[k];
    if (!site) return;
    pits.push({
      id: next.nextId++,
      ...site,
      capacityKg: GRAIN_PITS.capacityKg,
      grainKg: kg,
      state: 'sealed',
      dugDay: day,
      filledDay: day,
    });
  });
  // jí se z poslední (neúplné) jámy
  const last = pits[pits.length - 1];
  if (last) {
    last.state = 'open';
    delete last.filledDay;
  }
  return next;
}
