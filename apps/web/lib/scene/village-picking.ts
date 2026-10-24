import {
  roadChainIds,
  MILIR,
  SACRED_BUILDINGS,
  WORKSHOP_PORCH_M,
  threshingFloorFootprint,
  type TileCell,
} from '@bohemia/game';
import { isRotatedSquare, squareContains, type CellSquare } from './field-cells';
import { insideOreSite, oreHeapRadius, oreSiteDiscs } from './ore-site-layout';
import { insideGrainPit } from './grain-pit-layout';
import { scenePenSquares, type SceneVillage } from '../village-view';
import { nearestJunction } from './junction-shape';
import { footprintRect, pointInPolygon, type Point } from './village-layout';

// Výběr obydlí, polí, sadů a hřbitovů kliknutím do scény – čisté funkce bez Babylonu (paprsek
// z kamery dodá scéna jako čísla).

/**
 * Co je ve vsi vybrané: obydlí (hotové i rozestavěné – id ze scény vsi), víc obydlí najednou
 * (Ctrl/Shift + klik, Ctrl + A – migration.md; aspoň dvě), díl pole nebo čtverec sadu (klik –
 * fields.md, Co hráč vidí), celé pole nebo sad (dvojklik), hřbitov, posvátný dub (id stromu),
 * dubový háj (id středového dubu), modla či svatyně (id stavby – hotová i rozestavěná,
 * happiness.md), ohrada (id ohrady – oxen.md), rudiště kováře (id kovárny – crafts.md, Uhlí
 * a ruda kováře), hliniště hrnčíře (id dílny – crafts.md, Hlína hrnčíře), nebo milíř či milířiště
 * uhlíře (id milíře – crafts.md, Milíř u skácených buků), nebo otevřená obilná jáma (id jámy –
 * production-chains.md, Obilné jámy).
 */
export type VillageTarget =
  | { kind: 'dwelling'; id: number }
  /** Víc obydlí najednou – id ze scény vsi v pořadí výběru (aspoň dvě). */
  | { kind: 'dwellings'; ids: readonly number[] }
  | { kind: 'field'; id: number }
  /** Díl pole – id pole a čtverec dílu (v mřížce pole – natočené pole má vlastní). */
  | { kind: 'field-part'; id: number; cell: TileCell }
  | { kind: 'cemetery'; id: number }
  | { kind: 'orchard'; id: number }
  /** Čtverec sadu – id sadu a čtverec (v mřížce sadu). */
  | { kind: 'orchard-square'; id: number; cell: TileCell }
  | { kind: 'sacred-oak'; id: number }
  | { kind: 'grove'; id: number }
  | { kind: 'sacred'; id: number }
  /** Ohrada (id ohrady – hotová i rozestavěná, oxen.md). */
  | { kind: 'pen'; id: number }
  /**
   * Pevná cesta – cesta hráče (roads.md – Cesta pro hráče): řetěz úseků, id = jeho první úsek
   * (`roadChainIds`), ať se klikne na kterýkoli.
   */
  | { kind: 'road'; id: number }
  /**
   * Křižovatka cest (paths.md – Křižovatky; Martin, #6: „samostatný objekt, který jde označit“):
   * id křižovatky; klik do `JUNCTION_PICK_M` od středu.
   */
  | { kind: 'junction'; id: number }
  /** Rudiště kováře – jámy a hromada rudy (id kovárny – crafts.md, Uhlí a ruda kováře). */
  | { kind: 'ore-site'; id: number }
  /** Hliniště hrnčíře – jámy a hromada hlíny (id dílny hrnčíře – crafts.md, Hlína hrnčíře). */
  | { kind: 'clay-site'; id: number }
  /** Milíř nebo milířiště uhlíře (id milíře – crafts.md, Milíř u skácených buků). */
  | { kind: 'kiln'; id: number }
  /**
   * Otevřená obilná jáma (id jámy – production-chains.md, Obilné jámy); zapečetěné nejsou vidět
   * a vybrat nejdou.
   */
  | { kind: 'grain-pit'; id: number }
  /** Humno (id humna = id stavby – production-chains.md, Humno): klik na mlatovou plochu. */
  | { kind: 'threshing-floor'; id: number }
  /**
   * Člověk vsi (id – villagers.md, Výběr postavy): klik na jeho postavu; výběr zůstane, i když
   * postava zmizí (vejde domů, za kraj mapy).
   */
  | { kind: 'person'; id: number }
  /**
   * Spřežení volů s rádlem na poli (oxen.md – Výběr spřežení): pořadí spřežení dne
   * (plough-team-renderer.ts) – klik na voly nebo rádlo.
   */
  | { kind: 'plough-team'; team: number }
  /** Vůz vsi (id vozu – wagons.md, Výběr vozu): klik na vůz nebo jeho voly. */
  | { kind: 'cart'; id: number };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Paprsek z kamery pod kurzorem: počátek a směr (nemusí být jednotkový). */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** Jak vysoko nad zemí ještě kliknutí trefí obydlí (střecha, m). */
const DWELLING_PICK_HEIGHT_M = 3.5;
const DWELLING_PICK_STEP_M = 0.5;
/** Kolik metrů kolem půdorysu se ještě počítá jako zásah (okap střechy, nepřesná ruka). */
const DWELLING_PICK_MARGIN_M = 1;
/** Výška modly a svatyně pro výběr paprskem (m) – modla ≈ 2,9 m, svatyně s modlou ≈ 4,4 m. */
const SACRED_PICK_HEIGHT_M = { idol: 3, shrine: 4.5 } as const;
/** Úsek pevné cesty: zásah do tolika metrů od osy (pás cesty a kousek vedle). */
export const ROAD_PICK_M = 2.5;
/** Křižovatka: zásah do tolika metrů od středu (vchody jsou od středu 2,85–5,25 m). */
export const JUNCTION_PICK_M = 3;
/** Rudiště: krok výšky paprsku přes hromadu rudy (m). */
const ORE_SITE_PICK_STEP_M = 0.25;
/** Milíř: zásah do poloměru kupy s kouskem kolem, od země do výšky kupy (m). */
export const KILN_PICK = { radiusM: MILIR.footprintM / 2 + 0.5, heightM: 2.4, stepM: 0.4 } as const;
/** Milířiště: zásah na zemi do poloměru černé země (m). */
const KILN_REMNANT_PICK_M = 3.5;
/** Posvátný dub: zásah do `radius` od kmene, od země do koruny (m). */
export const SACRED_OAK_PICK = { radiusM: 4, heightM: 12, stepM: 1 } as const;

/** Bod paprsku ve výšce `y` (x, z) a jeho parametr t; null, když paprsek výšku neprotne vpřed. */
export function rayAtHeight(ray: Ray, y: number): { x: number; z: number; t: number } | null {
  const dy = ray.direction.y;
  if (Math.abs(dy) < 1e-9) return null;
  const t = (y - ray.origin.y) / dy;
  if (t < 0) return null;
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t, t };
}

/**
 * Leží bod (x, z) v půdorysu obydlí (natočeném o `rotation`) zvětšeném o `margin`? Řemeslná
 * dílna i s přístřeškem vpředu (milíř uhlíře je samostatná stavba – `kind: 'kiln'`).
 */
export function insideFootprint(
  point: { x: number; z: number },
  dwelling: SceneVillage['dwellings'][number],
  margin = DWELLING_PICK_MARGIN_M,
): boolean {
  // půdorys podle varianty rozměrů domu (population.md – Varianty rozměrů), dílna s přístřeškem
  const rect = footprintRect(dwelling, dwelling.craft ? WORKSHOP_PORCH_M[dwelling.craft] : 0);
  const dx = point.x - dwelling.position.x;
  const dz = point.z - dwelling.position.z;
  // do místních os obydlí: vchod míří do (sin r, cos r) – to je místní +z
  const r = dwelling.position.rotation;
  const localX = dx * Math.cos(r) - dz * Math.sin(r);
  const localZ = dx * Math.sin(r) + dz * Math.cos(r);
  return (
    localX >= rect.minX - margin &&
    localX <= rect.maxX + margin &&
    localZ >= rect.minZ - margin &&
    localZ <= rect.maxZ + margin
  );
}

/** Leží bod (x, z) v půdorysu modly nebo svatyně (natočeném) zvětšeném o `margin`? */
export function insideSacredFootprint(
  point: { x: number; z: number },
  building: NonNullable<SceneVillage['sacred']>['buildings'][number],
  margin = DWELLING_PICK_MARGIN_M,
): boolean {
  const half = SACRED_BUILDINGS[building.kind].footprintM / 2 + margin;
  const dx = point.x - building.position.x;
  const dz = point.z - building.position.z;
  const r = building.position.rotation;
  const localX = dx * Math.cos(r) - dz * Math.sin(r);
  const localZ = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(localX) <= half && Math.abs(localZ) <= half;
}

/**
 * Co je pod kurzorem: obydlí, které paprsek protne od země do výšky střechy (nejbližší ke
 * kameře), pak modla nebo svatyně (paprsek přes půdorys do výšky modly), posvátný dub (paprsek
 * do 4 m od kmene od země do koruny), rudiště kováře či hliniště hrnčíře (paprsek přes jámy
 * a hromadu do její výšky – `oreSiteDiscs`), jinak obydlí, jehož pozemek (políčko) nebo ohrada leží pod
 * bodem terénu `ground`, úsek pevné cesty do ROAD_PICK_M od osy, pak díl pole, hřbitov, čtverec
 * sadu nebo dubový háj pod bodem (celé pole a sad vybere dvojklik – `wholeTarget`); null =
 * prázdná zem.
 */
export function pickVillageTarget(
  village: SceneVillage,
  ray: Ray,
  options: {
    /** Bod terénu pod kurzorem, nebo null (mimo krajinu). */
    ground: { x: number; z: number } | null;
    groundHeight(x: number, z: number): number;
    cellOf(x: number, z: number): TileCell | null;
  },
): VillageTarget | null {
  let best: { id: number; t: number } | null = null;
  for (const dwelling of village.dwellings) {
    const base = options.groundHeight(dwelling.position.x, dwelling.position.z);
    for (let h = 0; h <= DWELLING_PICK_HEIGHT_M; h += DWELLING_PICK_STEP_M) {
      const point = rayAtHeight(ray, base + h);
      if (!point || !insideFootprint(point, dwelling)) continue;
      if (best === null || point.t < best.t) best = { id: dwelling.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'dwelling', id: best.id };
  const sacred = village.sacred;
  for (const building of sacred?.buildings ?? []) {
    const base = options.groundHeight(building.position.x, building.position.z);
    const top = SACRED_PICK_HEIGHT_M[building.kind];
    for (let h = 0; h <= top; h += DWELLING_PICK_STEP_M) {
      const point = rayAtHeight(ray, base + h);
      if (!point || !insideSacredFootprint(point, building, 0.5)) continue;
      if (best === null || point.t < best.t) best = { id: building.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'sacred', id: best.id };
  const { radiusM, heightM, stepM } = SACRED_OAK_PICK;
  for (const oak of sacred?.oaks ?? []) {
    const base = options.groundHeight(oak.x, oak.z);
    for (let h = 0; h <= heightM; h += stepM) {
      const point = rayAtHeight(ray, base + h);
      if (!point || Math.hypot(point.x - oak.x, point.z - oak.z) > radiusM) continue;
      if (best === null || point.t < best.t) best = { id: oak.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'sacred-oak', id: best.id };
  // rudiště kovářů a hliniště hrnčířů (crafts.md – Hlína hrnčíře) – stejné tvary
  let dug: { id: number; t: number; clay: boolean } | null = null;
  for (const site of village.oreSites ?? []) {
    const discs = oreSiteDiscs(site, village.orePits);
    const base = options.groundHeight(site.x, site.z);
    // jámy leží na zemi, hromada rudy je vysoká ≈ 0,55 poloměru
    const top = oreHeapRadius(site) * 0.55;
    for (let h = 0; h <= top + 1e-9; h += ORE_SITE_PICK_STEP_M) {
      const point = rayAtHeight(ray, base + h);
      if (!point || !insideOreSite(point, discs)) continue;
      if (dug === null || point.t < dug.t) {
        dug = { id: site.dwellingId, t: point.t, clay: site.clay === true };
      }
      break;
    }
  }
  if (dug) return { kind: dug.clay ? 'clay-site' : 'ore-site', id: dug.id };
  // milíř uhlíře – kupa od země do výšky (crafts.md – Milíř u skácených buků)
  const kiln = KILN_PICK;
  for (const k of village.kilns ?? []) {
    const base = options.groundHeight(k.x, k.z);
    for (let h = 0; h <= kiln.heightM + 1e-9; h += kiln.stepM) {
      const point = rayAtHeight(ray, base + h);
      if (!point || Math.hypot(point.x - k.x, point.z - k.z) > kiln.radiusM) continue;
      if (best === null || point.t < best.t) best = { id: k.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'kiln', id: best.id };
  if (!options.ground) return null;
  const ground = options.ground;
  // milířiště – černá zem na zemi
  for (const r of village.kilnRemnants ?? []) {
    if (Math.hypot(ground.x - r.x, ground.z - r.z) <= KILN_REMNANT_PICK_M) {
      return { kind: 'kiln', id: r.id };
    }
  }
  // otevřená obilná jáma na zemi (production-chains.md – Obilné jámy) – zapečetěné scéna nemá
  const pit = (village.grainPits ?? []).find((p) => insideGrainPit(ground, p));
  if (pit) return { kind: 'grain-pit', id: pit.id };
  // humno – klik na udusanou plochu mlatu (hotové i staveniště)
  const floor = (village.threshingFloors ?? []).find((f) =>
    pointInPolygon(
      threshingFloorFootprint(f.position).map(([x, z]): Point => [x, z]),
      ground.x,
      ground.z,
    ),
  );
  if (floor) return { kind: 'threshing-floor', id: floor.id };
  const cell = options.cellOf(ground.x, ground.z);
  if (!cell) return null;
  // čtverec v mřížce krajiny podle políčka, natočený čtverec (fields.md – Natočené stavby)
  // podle bodu terénu v jeho osách
  const hit = (square: CellSquare): boolean =>
    isRotatedSquare(square)
      ? squareContains(square, ground.x, ground.z)
      : square.cell.x === cell.x && square.cell.y === cell.y;
  const owner = village.dwellings.find(
    (d) =>
      (d.plot !== undefined && hit(d.plot)) ||
      // dvůr dvorce vojvody patří k pozemku (trade.md)
      (d.plot?.yard?.cell.x === cell.x && d.plot.yard.cell.y === cell.y),
  );
  if (owner) return { kind: 'dwelling', id: owner.id };
  // ohrada o víc čtvercích (oxen.md – Ohrady podle druhu) – kterýkoli její čtverec
  const pen = (village.pens ?? []).find((p) => scenePenSquares(p).some(hit));
  if (pen) return { kind: 'pen', id: pen.id };
  // křižovatka přebíjí cesty, které do ní vbíhají (je to samostatný objekt)
  const junction = nearestJunction(village.junctions, ground, JUNCTION_PICK_M);
  if (junction !== null) return { kind: 'junction', id: junction };
  const road = nearestRoad(village, ground, ROAD_PICK_M);
  // celá cesta hráče – navazující úseky různého stupně jsou jedna cesta (Martin)
  if (road !== null)
    return { kind: 'road', id: roadChainIds(village.roads ?? [], road)[0] ?? road };
  for (const field of village.fields) {
    const part = field.parts.find(hit);
    if (part) return { kind: 'field-part', id: field.id, cell: copyCell(part.cell) };
  }
  const cemetery = (village.cemeteries ?? []).find((c) => c.squares.some(hit));
  if (cemetery) return { kind: 'cemetery', id: cemetery.id };
  for (const orchard of village.orchards ?? []) {
    const square = orchard.squares.find(hit);
    if (square) return { kind: 'orchard-square', id: orchard.id, cell: copyCell(square.cell) };
  }
  const grove = (sacred?.groves ?? []).find((g) => g.squares.some(hit));
  return grove ? { kind: 'grove', id: grove.id } : null;
}

function copyCell(cell: TileCell): TileCell {
  return { x: cell.x, y: cell.y };
}

/**
 * Celá stavba, ke které vybraný kus patří (dvojklik – fields.md, Co hráč vidí): díl pole → pole,
 * čtverec sadu → sad; ostatní cíle beze změny (tentýž objekt).
 */
export function wholeTarget(target: VillageTarget): VillageTarget {
  if (target.kind === 'field-part') return { kind: 'field', id: target.id };
  if (target.kind === 'orchard-square') return { kind: 'orchard', id: target.id };
  return target;
}

/** Díl pole vybraný ve scéně (čtverec v mřížce pole), nebo undefined. */
export function selectedFieldPart(
  village: SceneVillage,
  target: Extract<VillageTarget, { kind: 'field-part' }>,
): SceneVillage['fields'][number]['parts'][number] | undefined {
  return village.fields
    .find((f) => f.id === target.id)
    ?.parts.find((p) => p.cell.x === target.cell.x && p.cell.y === target.cell.y);
}

/** Čtverec sadu vybraný ve scéně (v mřížce sadu), nebo undefined. */
export function selectedOrchardSquare(
  village: SceneVillage,
  target: Extract<VillageTarget, { kind: 'orchard-square' }>,
): NonNullable<SceneVillage['orchards']>[number]['squares'][number] | undefined {
  return village.orchards
    ?.find((o) => o.id === target.id)
    ?.squares.find((s) => s.cell.x === target.cell.x && s.cell.y === target.cell.y);
}

/** Vzdálenost bodu od lomené čáry (m). */
export function distanceToPolyline(
  point: { x: number; z: number },
  points: readonly { x: number; z: number }[],
): number {
  let best = Infinity;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t =
      l2 > 0 ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.z - a.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)));
  }
  return best;
}

/** Úsek pevné cesty nejblíž bodu do `reach` m od osy (id), jinak null. */
export function nearestRoad(
  village: SceneVillage,
  point: { x: number; z: number },
  reach: number,
): number | null {
  let best: { id: number; d: number } | null = null;
  for (const road of village.roads ?? []) {
    // opuštěný kus pod stavbou nejde vybrat (paths.md – Stavba přes cestu)
    if (road.abandoned) continue;
    const d = distanceToPolyline(point, road.points);
    if (d <= reach && (best === null || d < best.d)) best = { id: road.id, d };
  }
  return best?.id ?? null;
}

/** Existuje vybraný cíl ve vsi (po obnovení stavu mohl zaniknout)? Víc obydlí – aspoň jedno. */
export function targetExists(village: SceneVillage, target: VillageTarget): boolean {
  if (target.kind === 'dwelling') return village.dwellings.some((d) => d.id === target.id);
  if (target.kind === 'dwellings') {
    return target.ids.some((id) => village.dwellings.some((d) => d.id === id));
  }
  if (target.kind === 'cemetery') {
    return (village.cemeteries ?? []).some((c) => c.id === target.id);
  }
  if (target.kind === 'orchard') return (village.orchards ?? []).some((o) => o.id === target.id);
  if (target.kind === 'field-part') return selectedFieldPart(village, target) !== undefined;
  if (target.kind === 'orchard-square') return selectedOrchardSquare(village, target) !== undefined;
  if (target.kind === 'sacred-oak') {
    return (village.sacred?.oaks ?? []).some((o) => o.id === target.id);
  }
  if (target.kind === 'grove')
    return (village.sacred?.groves ?? []).some((g) => g.id === target.id);
  if (target.kind === 'sacred') {
    return (village.sacred?.buildings ?? []).some((b) => b.id === target.id);
  }
  if (target.kind === 'pen') return (village.pens ?? []).some((p) => p.id === target.id);
  if (target.kind === 'road') return (village.roads ?? []).some((r) => r.id === target.id);
  if (target.kind === 'junction') return (village.junctions ?? []).some((j) => j.id === target.id);
  if (target.kind === 'ore-site' || target.kind === 'clay-site') {
    return dugSiteOf(village, target) !== undefined;
  }
  if (target.kind === 'kiln') {
    return (
      (village.kilns ?? []).some((k) => k.id === target.id) ||
      (village.kilnRemnants ?? []).some((r) => r.id === target.id)
    );
  }
  if (target.kind === 'threshing-floor') {
    return (village.threshingFloors ?? []).some((f) => f.id === target.id);
  }
  if (target.kind === 'grain-pit') {
    return (village.grainPits ?? []).some((p) => p.id === target.id);
  }
  if (target.kind === 'person') return personExists(village, target.id);
  if (target.kind === 'plough-team') return ploughsToday(village);
  if (target.kind === 'cart') return (village.carts ?? []).some((c) => c.id === target.id);
  return village.fields.some((f) => f.id === target.id);
}

/** Spřežení dnes orá (rozdělení práce dne má orbu – jako `ploughingToday` v plough-front.ts)? */
function ploughsToday(village: Pick<SceneVillage, 'labor'>): boolean {
  return (village.labor?.shares ?? []).some((s) => s.activity === 'plough' && s.manDays > 0);
}

/** Žije člověk ve vsi (`labor.persons`)? Bez lidí ve scéně ano – nejde to poznat. */
export function personExists(village: SceneVillage, id: number): boolean {
  const persons = village.labor?.persons;
  return !persons || persons.some((p) => p.id === id);
}

/** Rudiště (`ore-site`) nebo hliniště (`clay-site`) vybrané ve scéně, nebo undefined. */
export function dugSiteOf(
  village: SceneVillage,
  target: Extract<VillageTarget, { kind: 'ore-site' | 'clay-site' }>,
): NonNullable<SceneVillage['oreSites']>[number] | undefined {
  const clay = target.kind === 'clay-site';
  return village.oreSites?.find((s) => s.dwellingId === target.id && (s.clay === true) === clay);
}
