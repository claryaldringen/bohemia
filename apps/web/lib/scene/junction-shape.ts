import { junctionArmDirs, junctionEntranceM, roadLandWidthM } from '@bohemia/game';
import type { SceneJunction, SceneRoad } from '../village-view';
import type { RibbonJunction } from './path-ribbon';
import type { JunctionCut } from './road-works-layout';

/** Bod (m). */
export interface Point {
  x: number;
  z: number;
}

// Křižovatky ve scéně bez Babylonu (paths.md – Křižovatky; Martin, #6: „Křižovatka: samostatný
// objekt, který jde označit; buď kříž se 4 vchody, nebo Y se 3 vchody … kulaté plácky zmizí“):
// obrys (pásy ramen v šířce cest a střed mnohoúhelníkem), obtisky podle druhu cest, modely znamení
// (kámen, kůl), výběr a klíč změny. Jádro dodává střed, natočení, rozevření a id úseků v ramenech.

/** Rameno křižovatky: směr od středu (rad), vchod (m) a id úseku, který do něj vede. */
export interface JunctionArm {
  dir: number;
  entrance: Point;
  roadId: number;
}

/** Tvar křižovatky: ramena s cestou, obrys v pořadí proti směru hodin, vzdálenost vchodů a šířka. */
export interface JunctionShapeLayout {
  arms: JunctionArm[];
  outline: Point[];
  /** Vzdálenost vchodů od středu (m): 1,5 × šířka nejširší cesty. */
  entranceM: number;
  /** Šířka nejširší přicházející cesty (m) – šířka ramen. */
  widthM: number;
}

/** Poloměr oblouku ve vnitřním rohu obrysu (násobek půl šířky ramen) a počet úseků oblouku. */
const CORNER_ROUND = 1.2;
const CORNER_ARC_POINTS = 6;
/**
 * Pásy cest končí tolik (m) za vchody (`junctionCuts`), dál je plácek (junction-patch.ts) – tak
 * daleko, aby v řezu nepřidalo krytí sousední rameno a přechod z pásu do plácku nebyl vidět.
 */
export const JUNCTION_CUT_EXTRA_M = 1.5;
/** Model znamení: kámen a kůl mají po dvou podobách (tools/blender/roads.py). */
export type JunctionModel =
  'junction-stone-1' | 'junction-stone-2' | 'junction-post-1' | 'junction-post-2';
export const JUNCTION_MODELS: readonly JunctionModel[] = [
  'junction-stone-1',
  'junction-stone-2',
  'junction-post-1',
  'junction-post-2',
];

/**
 * Obrys z ramen (směr, vchod): u každého ramene dva rohy ve vchodu (± půl šířky kolmo na rameno),
 * mezi sousedními rameny oblouk tečný k okrajům obou pásů (Martin: všude ve hře oblouk místo
 * ostrého rohu; poloměr CORNER_ROUND × půl šířky, tečné body nejvýš ve vchodech); mezera od 180°
 * je oblouk kolem středu. Pořadí proti směru hodin.
 */
function outlineOf(
  center: Point,
  dirs: readonly number[],
  entranceM: number,
  half: number,
): Point[] {
  const sorted = [...dirs].sort((a, b) => a - b);
  const out: Point[] = [];
  const at = (angle: number, r: number, from: Point = center): Point => ({
    x: from.x + Math.cos(angle) * r,
    z: from.z + Math.sin(angle) * r,
  });
  sorted.forEach((dir, k) => {
    const cos = Math.cos(dir);
    const sin = Math.sin(dir);
    const c = { x: center.x + cos * entranceM, z: center.z + sin * entranceM };
    // kolmice vlevo (ve směru rostoucího úhlu)
    out.push({ x: c.x + sin * half, z: c.z - cos * half });
    out.push({ x: c.x - sin * half, z: c.z + cos * half });
    const next = sorted[(k + 1) % sorted.length]!;
    let gap = next - dir;
    if (gap <= 0) gap += Math.PI * 2;
    if (gap >= Math.PI - 1e-6) {
      // mezera od 180°: oblouk kolem středu z levého okraje ramene na pravý okraj dalšího
      for (let i = 0; i <= CORNER_ARC_POINTS; i++) {
        out.push(at(dir + Math.PI / 2 + ((gap - Math.PI) * i) / CORNER_ARC_POINTS, half));
      }
      return;
    }
    // oblouk ve vnitřním rohu: střed na ose mezery, tečný k okrajům obou pásů
    const tan = Math.tan(gap / 2);
    const rho = Math.max(0, Math.min(CORNER_ROUND * half, entranceM * tan - half));
    const mid = dir + gap / 2;
    const hub = at(mid, (half + rho) / Math.sin(gap / 2));
    // z tečného bodu na levém okraji ramene (úhel dir − π/2 od středu oblouku) do tečného bodu
    // na pravém okraji dalšího ramene (next + π/2) – oblouk o úhel π − mezera přes stranu ke středu
    const from = dir - Math.PI / 2;
    const sweep = -(Math.PI - gap);
    for (let i = 0; i <= CORNER_ARC_POINTS; i++) {
      out.push(at(from + (sweep * i) / CORNER_ARC_POINTS, rho, hub));
    }
  });
  return out;
}

/** Tvar křižovatky pro cesty vsi; null, když do ní vede méně než dvě ramena. */
export function junctionShape(
  junction: SceneJunction,
  roads: readonly SceneRoad[],
): JunctionShapeLayout | null {
  const dirs = junctionArmDirs(junction.shape, junction.rotation, junction.spread ?? 0);
  const arms: JunctionArm[] = [];
  const widths: number[] = [];
  dirs.forEach((dir, k) => {
    const id = junction.arms[k];
    const road = id === null || id === undefined ? undefined : roads.find((r) => r.id === id);
    if (!road || id === null || id === undefined) return;
    widths.push(roadLandWidthM(road));
    arms.push({ dir, entrance: { x: 0, z: 0 }, roadId: id });
  });
  if (arms.length < 2) return null;
  const widthM = Math.max(...widths);
  const entranceM = junctionEntranceM(widths);
  const center = { x: junction.x, z: junction.z };
  for (const arm of arms) {
    arm.entrance = {
      x: center.x + Math.cos(arm.dir) * entranceM,
      z: center.z + Math.sin(arm.dir) * entranceM,
    };
  }
  const outline = outlineOf(
    center,
    arms.map((a) => a.dir),
    entranceM,
    widthM / 2,
  );
  return { arms, outline, entranceM, widthM };
}

/**
 * Křižovatky pro obtisk cest: střed a řez pásů (vchody + JUNCTION_CUT_EXTRA_M) – pásy cest
 * končí v řezu, ramena dovnitř a střed kreslí plácek (junction-patch.ts). Pořadí jako `junctions`
 * (bez křižovatek s méně než dvěma rameny).
 */
export function junctionCuts(
  junctions: readonly SceneJunction[],
  roads: readonly SceneRoad[],
): JunctionCut[] {
  return junctions.flatMap((junction) => {
    const shape = junctionShape(junction, roads);
    return shape
      ? [{ x: junction.x, z: junction.z, radius: shape.entranceM + JUNCTION_CUT_EXTRA_M }]
      : [];
  });
}

/**
 * Plácky křižovatek pro masku polí (`roadTrack` – pod pláckem obilí neroste) po vrstvách
 * obtisku cest: upravená (je-li v ní upravená či vozová cesta), jinak vyjetá vozová, jinak
 * vyšlapaná. Plácek nese obrys (`RibbonJunction.outline`).
 */
export function junctionRibbons(
  junctions: readonly SceneJunction[],
  roads: readonly SceneRoad[],
): { trodden: RibbonJunction[]; improved: RibbonJunction[]; cart: RibbonJunction[] } {
  const out = {
    trodden: [] as RibbonJunction[],
    improved: [] as RibbonJunction[],
    cart: [] as RibbonJunction[],
  };
  for (const junction of junctions) {
    const shape = junctionShape(junction, roads);
    if (!shape) continue;
    const arms = shape.arms.map((a) => roads.find((r) => r.id === a.roadId)!);
    const improved = arms.some((r) => r.grade !== 'trodden');
    const cart = arms.some((r) => r.cart === true);
    const list = improved ? out.improved : cart ? out.cart : out.trodden;
    list.push({
      x: junction.x,
      z: junction.z,
      strength: 1,
      outline: shape.outline,
      widthM: shape.widthM,
    });
  }
  return out;
}

/** Model znamení ve scéně: kámen a kůl (strom je mezi stromy u cest). */
export interface JunctionLandmarkPiece {
  model: JunctionModel;
  x: number;
  z: number;
  rotationY: number;
}

export function junctionLandmarkPieces(
  junctions: readonly SceneJunction[],
): JunctionLandmarkPiece[] {
  const out: JunctionLandmarkPiece[] = [];
  for (const { landmark } of junctions) {
    if (landmark.kind === 'tree') continue;
    const look = Math.min(2, Math.max(1, landmark.look));
    out.push({
      model: `junction-${landmark.kind === 'stone' ? 'stone' : 'post'}-${look}` as JunctionModel,
      x: landmark.x,
      z: landmark.z,
      rotationY: landmark.turn,
    });
  }
  return out;
}

/** Křižovatka nejblíž bodu do `reach` m od středu (id), jinak null. */
export function nearestJunction(
  junctions: readonly SceneJunction[] | undefined,
  point: { x: number; z: number },
  reach: number,
): number | null {
  let best: { id: number; d: number } | null = null;
  for (const j of junctions ?? []) {
    const d = Math.hypot(point.x - j.x, point.z - j.z);
    if (d <= reach && (best === null || d < best.d)) best = { id: j.id, d };
  }
  return best?.id ?? null;
}

/** Klíč křižovatek – obtisky a modely se přestaví, jen když se změní tvar nebo znamení. */
export function junctionsKey(junctions: readonly SceneJunction[] | undefined): string {
  return (junctions ?? [])
    .map(
      (j) =>
        `${j.id}:${j.x},${j.z}:${j.shape}:${j.rotation}:${j.spread ?? 0}:${j.arms.join('.')}:${j.landmark.kind}${j.landmark.look}@${j.landmark.x},${j.landmark.z}:${j.landmark.turn}`,
    )
    .join(';');
}
