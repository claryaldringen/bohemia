// Obydlí na poli a v sadu (population.md – Obydlí na poli a v sadu) a pole jako krajina
// (fields.md): obydlí bez pozemku sebere z dílu pole a čtverce sadu svou vyklízenou plochu
// (staveniště s hromadou hlíny, u dílny i kruh milíře), modla a svatyně svůj půdorys, jabloň
// a strom u cesty plochu pod korunou (TAKEN_LAND_TREE_M2) – herní jádro díl o ni zmenší, scéna pod
// ní nekreslí obilí ani obtisk pole (pod obydlím ani jabloně sadu). Stavby po čtvercích
// a pozemek berou celé políčko, takže díl pod nimi v datech vsi už není. Čistý modul bez
// Babylonu, souřadnice světa scény v metrech.
import {
  TAKEN_LAND_TREE_M2,
  freeDwellingClearings,
  pointInPolygon,
  sacredFootprint,
  type Point,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';

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

/** Vyklízené plochy hotových i rozestavěných obydlí bez pozemku (stejné jako v jádru). */
export function buildingClearings(dwellings: readonly SceneDwelling[]): Clearing[] {
  return dwellings.flatMap((d) =>
    d.plot ? [] : freeDwellingClearings(d.type, d.position, d.craft).map(clearingOf),
  );
}

/** Poloměr plochy pod korunou stromu (m) – kruh o ploše TAKEN_LAND_TREE_M2. */
export const TREE_LAND_RADIUS_M = Math.sqrt(TAKEN_LAND_TREE_M2 / Math.PI);
/** Kruh pod korunou jako pravidelný mnohoúhelník (stran). */
const TREE_SIDES = 12;

/** Plocha pod korunou stromu – mnohoúhelník kolem kmene. */
function treeLand(x: number, z: number): Clearing {
  return clearingOf(
    Array.from({ length: TREE_SIDES }, (_, i): Point => {
      const angle = (2 * Math.PI * i) / TREE_SIDES;
      return [x + TREE_LAND_RADIUS_M * Math.cos(angle), z + TREE_LAND_RADIUS_M * Math.sin(angle)];
    }),
  );
}

/**
 * Co pole pod sebou nekreslí (fields.md – Pole jako krajina): vyklízené plochy obydlí, půdorysy
 * model a svatyní a plocha pod korunou jabloní a stromů u cest (i čekajících na výsadbu), které
 * stojí na poli (`onField` – kmen na čtverci pole; strom vedle pole poli nic nebere).
 */
export function fieldClearings(
  village: Pick<SceneVillage, 'dwellings' | 'sacred' | 'roadTrees' | 'roadApples'>,
  onField: (x: number, z: number) => boolean,
): Clearing[] {
  const trees = [...(village.roadTrees ?? []), ...(village.roadApples ?? [])];
  return [
    ...buildingClearings(village.dwellings),
    ...(village.sacred?.buildings ?? []).map((b) =>
      clearingOf(sacredFootprint(b.kind, b.position)),
    ),
    ...trees.filter((t) => onField(t.x, t.z)).map((t) => treeLand(t.x, t.z)),
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
  return (x, z) => {
    let mask = 1;
    for (const c of clearings) {
      if (x < c.minX - softM || x > c.maxX + softM || z < c.minZ - softM || z > c.maxZ + softM) {
        continue;
      }
      const d = distanceTo(c, x, z);
      if (d <= 0) return 0;
      if (d < softM) mask = Math.min(mask, d / softM);
    }
    return mask;
  };
}

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
