// VÝVOJOVÝ NÁSTROJ – ukázka křižovatek na /dev/landscape (paths.md – Křižovatky; Martin, #6, bod 9):
// kříž se stojícím kamenem, Y z upravených cest s dřevěným kůlem a Y s mladým dubem (strom je
// strom u cesty). Tvar, natočení a vchody z jádra (`junctionArmDirs`, `junctionEntranceM`),
// cesty vedou rovně do středu (jako po sloučení jádra – ohyb do vchodu řeší síť, tady jen ukázka).
import {
  junctionArmDirs,
  junctionEntranceM,
  roadLandWidthM,
  tileCenterWorld,
  type JunctionLandmarkKind,
  type JunctionShape,
  type Landscape,
  type RoadGrade,
} from '@bohemia/game';
import type { SceneJunction, SceneRoad, SceneRoadTree } from '@/lib/village-view';

export interface JunctionsDemo {
  roads: SceneRoad[];
  junctions: SceneJunction[];
  roadTrees: SceneRoadTree[];
  /** Kam se podívá kamera – prostřední křižovatka. */
  focus: { x: number; z: number };
}

const ID_BASE = 9_200_000;
const ARM_LENGTH_M = 32;
const SPACING_M = 46;
const OFFSET_M = { x: 70, z: 30 };

interface Spec {
  shape: JunctionShape;
  rotationDeg: number;
  spreadDeg: number;
  grade: RoadGrade;
  landmark: JunctionLandmarkKind;
  look: number;
}

const SPECS: Spec[] = [
  { shape: 'cross', rotationDeg: 20, spreadDeg: 0, grade: 'trodden', landmark: 'stone', look: 1 },
  { shape: 'y', rotationDeg: 100, spreadDeg: 40, grade: 'improved', landmark: 'post', look: 2 },
  { shape: 'y', rotationDeg: 215, spreadDeg: 55, grade: 'trodden', landmark: 'tree', look: 1 },
];

/** Ukázka tří křižovatek vedle vsi. */
export function junctionsDemo(l: Landscape): JunctionsDemo {
  const village = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const roads: SceneRoad[] = [];
  const junctions: SceneJunction[] = [];
  const roadTrees: SceneRoadTree[] = [];
  SPECS.forEach((spec, k) => {
    const x = Math.round((village.x + OFFSET_M.x + k * SPACING_M) * 100) / 100;
    const z = Math.round((village.z + OFFSET_M.z) * 100) / 100;
    const rotation = (spec.rotationDeg * Math.PI) / 180;
    const spread = (spec.spreadDeg * Math.PI) / 180;
    const dirs = junctionArmDirs(spec.shape, rotation, spread);
    const arms = dirs.map((dir, a) => {
      const id = ID_BASE + k * 10 + a;
      roads.push({
        id,
        points: [
          {
            x: Math.round((x + Math.cos(dir) * ARM_LENGTH_M) * 100) / 100,
            z: Math.round((z + Math.sin(dir) * ARM_LENGTH_M) * 100) / 100,
          },
          { x, z },
        ],
        grade: spec.grade,
      });
      return id;
    });
    // znamení v nejširší mezeře mezi rameny, 1,5 m za vchody
    const sorted = [...dirs].sort((p, q) => p - q);
    let best = { gap: 0, mid: 0 };
    sorted.forEach((dir, i) => {
      let gap = sorted[(i + 1) % sorted.length]! - dir;
      if (gap <= 0) gap += Math.PI * 2;
      if (gap > best.gap) best = { gap, mid: dir + gap / 2 };
    });
    const reach = junctionEntranceM([roadLandWidthM({ grade: spec.grade })]) + 1.5;
    const lx = Math.round((x + Math.cos(best.mid) * reach) * 100) / 100;
    const lz = Math.round((z + Math.sin(best.mid) * reach) * 100) / 100;
    const treeId = ID_BASE + 900 + k;
    if (spec.landmark === 'tree') {
      roadTrees.push({ id: treeId, x: lx, z: lz, species: 'oak', stage: 'tree', growth: 1 });
    }
    junctions.push({
      id: ID_BASE + 100 + k,
      x,
      z,
      shape: spec.shape,
      rotation,
      ...(spec.shape === 'y' ? { spread } : {}),
      arms,
      landmark: {
        kind: spec.landmark,
        x: lx,
        z: lz,
        turn: (k * 70 * Math.PI) / 180,
        look: spec.look,
        ...(spec.landmark === 'tree' ? { treeId } : {}),
      },
      bornDay: 0,
    });
  });
  const mid = junctions[1]!;
  return { roads, junctions, roadTrees, focus: { x: mid.x, z: mid.z } };
}
