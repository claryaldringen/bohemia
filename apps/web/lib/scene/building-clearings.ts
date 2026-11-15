// Obydlí na poli a v sadu (population.md – Obydlí na poli a v sadu) a pole jako krajina
// (fields.md): obydlí bez pozemku sebere z dílu pole a čtverce sadu svou vyklízenou plochu
// (staveniště s hromadou hlíny, u dílny i kruh milíře), modla a svatyně svůj půdorys, jabloň
// a strom u cesty plochu pod korunou (TAKEN_LAND_TREE_M2) – herní jádro díl o ni zmenší, scéna pod
// ní nekreslí obilí ani obtisk pole (pod obydlím ani jabloně sadu). Stavby po čtvercích
// a pozemek v téže mřížce berou celé políčko, takže díl pod nimi v datech vsi už není; natočený
// pozemek a stavby po čtvercích přes pole v jiné mřížce (fields.md – Natočené stavby) berou jen
// průnik – jejich čtverce scéna pod polem vynechá taky. Čistý modul bez Babylonu, souřadnice
// světa scény v metrech.
import {
  GRID_TURNS,
  TAKEN_LAND_TREE_M2,
  dwellingShape,
  freeDwellingClearings,
  pointInPolygon,
  rotatedSquareCorners,
  rotationTurn,
  sacredFootprint,
  threshingFloorFootprint,
  workshopSideM,
  type Point,
} from '@bohemia/game';
import { scenePenSquares, type SceneVillage } from '../village-view';

type SceneDwelling = SceneVillage['dwellings'][number];

/** Vyklízená plocha s obdélníkem, který ji obepíná (rychlé vyřazení vzdálených bodů). */
export interface Clearing {
  polygon: readonly Point[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function clearingOf(polygon: readonly Point[]): Clearing {
  return {
    polygon,
    minX: Math.min(...polygon.map((p) => p[0])),
    maxX: Math.max(...polygon.map((p) => p[0])),
    minZ: Math.min(...polygon.map((p) => p[1])),
    maxZ: Math.max(...polygon.map((p) => p[1])),
  };
}

/** Je čtverec natočený mimo osy krajiny (ne o násobek 90°)? */
function turned(rotation: number | undefined): boolean {
  if (rotation === undefined) return false;
  return (rotationTurn(rotation) ?? 1) % GRID_TURNS !== 0;
}

/** Čtverec stavby (střed, strana, natočení) jako vyklízená plocha. */
function squareClearing(square: {
  x: number;
  z: number;
  size: number;
  rotation?: number;
}): Clearing {
  return clearingOf(
    rotatedSquareCorners(square.x, square.z, square.size, square.rotation ?? 0).map(
      ([x, z]): Point => [x, z],
    ),
  );
}

/**
 * Vyklízené plochy hotových i rozestavěných obydlí bez pozemku (stejné jako v jádru) a natočené
 * pozemky (fields.md – Natočené stavby) – zabírají díly polí a čtverce sadů jen zčásti.
 */
export function buildingClearings(dwellings: readonly SceneDwelling[]): Clearing[] {
  return dwellings.flatMap((d) =>
    d.plot
      ? turned(d.plot.rotation)
        ? [squareClearing(d.plot)]
        : []
      : freeDwellingClearings(
          d.type,
          d.position,
          dwellingShape(d),
          0,
          d.craft ? workshopSideM(d.craft, d.type) : 0,
        ).map(clearingOf),
  );
}

/** Poloměr plochy pod korunou stromu (m) – kruh o ploše TAKEN_LAND_TREE_M2. */
export const TREE_LAND_RADIUS_M = Math.sqrt(TAKEN_LAND_TREE_M2 / Math.PI);
/** Kruh pod korunou jako pravidelný mnohoúhelník (stran). */
const TREE_SIDES = 12;

/** Kruh o poloměru `radius` jako mnohoúhelník kolem středu. */
function circleClearing(x: number, z: number, radius: number): Clearing {
  return clearingOf(
    Array.from({ length: TREE_SIDES }, (_, i): Point => {
      const angle = (2 * Math.PI * i) / TREE_SIDES;
      return [x + radius * Math.cos(angle), z + radius * Math.sin(angle)];
    }),
  );
}

/** Plocha pod korunou stromu – mnohoúhelník kolem kmene. */
function treeLand(x: number, z: number): Clearing {
  return circleClearing(x, z, TREE_LAND_RADIUS_M);
}

/** Poloměr jámy, milíře a rudiště, kam seno nepatří (m). */
const WORKSITE_RADIUS_M = 3;

/**
 * Kam se seno z louky nesmí dostat (issue #3, Martin 22. 10. 2026: „nesmí tyto snopy být na
 * cestě, na budovách (včetně zahrádek), v ohradách (sežrala by je zvířata), ani na humně“):
 * obydlí a dílny s pozemkem i dvorkem, ruiny, ohrady, hřbitovy a sady po celých čtvercích (plot
 * ohrady je odsazený dovnitř), humna, obilné jámy, milíře, rudiště a jámy, posvátná místa.
 * Cesty a pěšiny řeší maska pásů (`TrackMask`) zvlášť.
 */
export function hayBlockers(village: SceneVillage): Clearing[] {
  const plotSquares = (plot: SceneDwelling['plot']): Clearing[] =>
    plot
      ? [
          squareClearing(plot),
          ...(plot.yard ? [squareClearing({ ...plot, x: plot.yard.x, z: plot.yard.z })] : []),
        ]
      : [];
  return [
    ...village.dwellings.flatMap((d) => [
      ...freeDwellingClearings(
        d.type,
        d.position,
        dwellingShape(d),
        0,
        d.craft ? workshopSideM(d.craft, d.type) : 0,
      ).map(clearingOf),
      circleClearing(d.position.x, d.position.z, WORKSITE_RADIUS_M),
      ...plotSquares(d.plot),
    ]),
    ...(village.ruins ?? []).flatMap((r) => [
      circleClearing(r.position.x, r.position.z, WORKSITE_RADIUS_M),
      ...plotSquares(r.plot),
    ]),
    ...(village.pens ?? []).flatMap((p) => scenePenSquares(p).map(squareClearing)),
    ...(village.cemeteries ?? []).flatMap((c) => c.squares.map(squareClearing)),
    ...(village.orchards ?? []).flatMap((o) => o.squares.map(squareClearing)),
    ...(village.threshingFloors ?? []).map((f) =>
      clearingOf(threshingFloorFootprint(f.position).map(([x, z]): Point => [x, z])),
    ),
    ...(village.grainPits ?? []).map((g) => circleClearing(g.x, g.z, WORKSITE_RADIUS_M)),
    ...(village.kilns ?? []).map((k) => circleClearing(k.x, k.z, WORKSITE_RADIUS_M)),
    ...(village.kilnRemnants ?? []).map((k) => circleClearing(k.x, k.z, WORKSITE_RADIUS_M)),
    ...(village.oreSites ?? []).map((o) => circleClearing(o.x, o.z, WORKSITE_RADIUS_M)),
    ...(village.orePits ?? []).map((o) => circleClearing(o.x, o.z, WORKSITE_RADIUS_M)),
    ...(village.sacred?.buildings ?? []).map((b) =>
      clearingOf(sacredFootprint(b.kind, b.position)),
    ),
  ];
}

/**
 * Levný podpis všeho, z čeho `hayBlockers` skládá plochy (poloha, druh, natočení, varianta
 * pozemku) – bez geometrie. Klíč sena: plochy a maska se staví jen při jeho změně.
 */
export function hayBlockersKey(village: SceneVillage): string {
  const pos = (p: { x: number; z: number }): number[] => [p.x, p.z];
  return JSON.stringify([
    village.dwellings.map((d) => [d.type, pos(d.position), d.plainShape ?? false, d.plot ?? null]),
    (village.ruins ?? []).map((r) => [pos(r.position), r.plot ?? null]),
    (village.pens ?? []).map((p) => scenePenSquares(p).map((q) => [q.x, q.z, q.size, q.rotation])),
    (village.cemeteries ?? []).map((c) => c.squares.map((q) => [q.x, q.z, q.size, q.rotation])),
    (village.orchards ?? []).map((o) => o.squares.map((q) => [q.x, q.z, q.size, q.rotation])),
    (village.threshingFloors ?? []).map((f) => pos(f.position)),
    (village.grainPits ?? []).map(pos),
    (village.kilns ?? []).map(pos),
    (village.kilnRemnants ?? []).map(pos),
    (village.oreSites ?? []).map(pos),
    (village.orePits ?? []).map(pos),
    (village.sacred?.buildings ?? []).map((b) => [b.kind, pos(b.position)]),
  ]);
}

/**
 * Co pole pod sebou nekreslí (fields.md – Pole jako krajina): vyklízené plochy obydlí, půdorysy
 * model a svatyní a plocha pod korunou jabloní a stromů u cest (i čekajících na výsadbu), které
 * stojí na poli (`onField` – kmen na čtverci pole; strom vedle pole poli nic nebere).
 */
export function fieldClearings(
  village: Pick<SceneVillage, 'dwellings' | 'sacred' | 'roadTrees' | 'roadApples'> &
    Partial<Pick<SceneVillage, 'fields' | 'orchards' | 'cemeteries' | 'pens'>>,
  onField: (x: number, z: number) => boolean,
): Clearing[] {
  const trees = [...(village.roadTrees ?? []), ...(village.roadApples ?? [])];
  // stavby po čtvercích přes pole v jiné mřížce (natočené – fields.md) zabírají díly jen zčásti:
  // natočený sad, hřbitov a ohrada vždy, při natočeném poli i ty v mřížce krajiny a pozemky
  const turnedFields = (village.fields ?? []).some((f) => f.parts.some((p) => turned(p.rotation)));
  const partly = <T extends { rotation?: number }>(squares: readonly T[]): readonly T[] =>
    turnedFields || squares.some((sq) => turned(sq.rotation)) ? squares : [];
  const squares = [
    ...(village.orchards ?? []).flatMap((o) => partly(o.squares)),
    ...(village.cemeteries ?? []).flatMap((c) => partly(c.squares)),
    ...(village.pens ?? []).flatMap((p) => partly(scenePenSquares(p))),
    ...(turnedFields
      ? village.dwellings.flatMap((d) => (d.plot && !turned(d.plot.rotation) ? [d.plot] : []))
      : []),
  ];
  return [
    ...buildingClearings(village.dwellings),
    ...(village.sacred?.buildings ?? []).map((b) =>
      clearingOf(sacredFootprint(b.kind, b.position)),
    ),
    ...trees.filter((t) => onField(t.x, t.z)).map((t) => treeLand(t.x, t.z)),
    ...squares.map(squareClearing),
  ];
}

/** Plochy, které zasahují do obdélníku (i do `marginM` od něj). */
export function clearingsNear(
  clearings: readonly Clearing[],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  marginM = 0,
): Clearing[] {
  return clearings.filter(
    (c) =>
      c.maxX >= bounds.minX - marginM &&
      c.minX <= bounds.maxX + marginM &&
      c.maxZ >= bounds.minZ - marginM &&
      c.minZ <= bounds.maxZ + marginM,
  );
}

/** Vzdálenost bodu od úsečky a–b. */
function segmentDistance(x: number, z: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

/** Vzdálenost bodu od vyklízené plochy – uvnitř 0. */
function distanceTo(clearing: Clearing, x: number, z: number): number {
  const { polygon } = clearing;
  if (pointInPolygon([x, z], polygon)) return 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, segmentDistance(x, z, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  }
  return best;
}

/**
 * Násobek krytí pole (obtisk a trsy) nebo hustoty sadu u obydlí: ve vyklízené ploše 0, do
 * `softM` za jejím okrajem plynule zpět k 1 (okraj pole u domu je měkký jako mez pole).
 */
export function clearingMask(
  clearings: readonly Clearing[],
  softM: number,
): (x: number, z: number) => number {
  if (clearings.length === 0) return () => 1;
  const at = (list: readonly Clearing[], x: number, z: number): number => {
    let mask = 1;
    for (const c of list) {
      if (x < c.minX - softM || x > c.maxX + softM || z < c.minZ - softM || z > c.maxZ + softM) {
        continue;
      }
      const d = distanceTo(c, x, z);
      if (d <= 0) return 0;
      if (d < softM) mask = Math.min(mask, d / softM);
    }
    return mask;
  };
  if (clearings.length <= MASK_BIN_MIN) return (x, z) => at(clearings, x, z);
  // prostorový rejstřík – velké pole (Vlkov) má pod sebou stovky ploch (stromy u cest, obydlí)
  // a krytí se ptá pro statisíce bodů; bod projde jen plochy své přihrádky (výsledek stejný –
  // přihrádka má všechny plochy, jejichž obdélník s okrajem do ní zasahuje)
  const binOf = (v: number): number => Math.floor(v / MASK_BIN_M);
  const binKey = (i: number, j: number): number =>
    (i + MASK_BIN_OFFSET) * MASK_BIN_SPAN + (j + MASK_BIN_OFFSET);
  const bins = new Map<number, Clearing[]>();
  for (const c of clearings) {
    for (let i = binOf(c.minX - softM); i <= binOf(c.maxX + softM); i++) {
      for (let j = binOf(c.minZ - softM); j <= binOf(c.maxZ + softM); j++) {
        const key = binKey(i, j);
        const list = bins.get(key);
        if (list) list.push(c);
        else bins.set(key, [c]);
      }
    }
  }
  return (x, z) => {
    const list = bins.get(binKey(binOf(x), binOf(z)));
    return list ? at(list, x, z) : 1;
  };
}

/** Od kolika ploch má `clearingMask` prostorový rejstřík; strana přihrádky (m) a číselný klíč. */
const MASK_BIN_MIN = 8;
const MASK_BIN_M = 16;
const MASK_BIN_OFFSET = 2 ** 20;
const MASK_BIN_SPAN = 2 ** 21;

/** Kmen jabloně stojí aspoň tolik (m) od vyklízené plochy obydlí – jinak tam strom není. */
export const TREE_CLEARANCE_M = 1.5;

/** Leží bod ve vyklízené ploše obydlí, nebo blíž než `marginM` od ní (strom tam nestojí)? */
export function insideClearings(
  clearings: readonly Clearing[],
  marginM: number,
): (x: number, z: number) => boolean {
  const mask = clearingMask(clearings, marginM);
  return (x, z) => mask(x, z) < 1;
}

/** Klíč ploch pro mezipaměť scény – na centimetry. */
export function clearingsKey(clearings: readonly Clearing[]): string {
  return clearings
    .map((c) =>
      c.polygon.map(([x, z]) => `${Math.round(x * 100)},${Math.round(z * 100)}`).join(' '),
    )
    .join(';');
}
