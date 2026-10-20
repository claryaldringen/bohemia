// Varianty rozměrů obydlí v instancích (population.md – Varianty rozměrů): model domu (hotový,
// díly staveniště i rozpadu) dostane „kosti“ oblastí zobrazení tvaru (shape-bones.ts) a VAT
// texturu, ve které je jeden snímek na variantu – instance si snímek vybere (stejně jako postavy
// klip, villagers.ts). Model se tak v shaderu natáhne po kouscích: dveře a šíje zůstanou, stěny
// a střecha se změní. Matice instance (poloha, natočení) zůstává, jak byla; stínová mapa VAT zná,
// takže stín sedí s domem. Bez varianty (dnešní tvar) má instance snímek 0 – identitu.
import { BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import {
  PLAIN_FRAME,
  shapeX,
  shapeY,
  shapeZ,
  type DwellingType,
  type ShapeFrame,
} from '@bohemia/game';
import {
  SHAPE_BONES,
  SHAPE_FRAME_FLOATS,
  shapeBoneMatrices,
  shapeFrameKey,
  shapeRegion,
} from './shape-bones';

/** Kreslení variant jednoho meshe: VAT a snímky, které má. */
interface ShapedMesh {
  manager: BakedVertexAnimationManager;
  texture: RawTexture | null;
  /** Klíče snímků textury (0 = dnešní tvar) – nová textura jen při změně. */
  keys: string;
}

const SHAPED = new WeakMap<Mesh, ShapedMesh>();
const PLAIN_KEY = shapeFrameKey(PLAIN_FRAME);

/**
 * Připraví mesh modelu stavby druhu `type` na varianty: každý vrchol dostane kost své oblasti
 * (váha 1), mesh kostru (jen kvůli definicím shaderu – matice čte shader z VAT) a VAT se snímkem
 * dnešního tvaru. Volat jednou po načtení, dřív než mesh dostane instance.
 */
export function makeShapeable(mesh: Mesh, type: DwellingType): void {
  if (SHAPED.has(mesh)) return;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const count = positions.length / 3;
  const indices = new Float32Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    indices[i * 4] = shapeRegion(
      type,
      positions[i * 3]!,
      positions[i * 3 + 1]!,
      positions[i * 3 + 2]!,
    );
    weights[i * 4] = 1;
  }
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, indices, false, 4);
  mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights, false, 4);
  const scene = mesh.getScene();
  const skeleton = new Skeleton(`${mesh.name}-shape`, `${mesh.name}-shape`, scene);
  for (let b = 0; b < SHAPE_BONES; b++) new Bone(`b${b}`, skeleton);
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 1;
  const manager = new BakedVertexAnimationManager(scene);
  mesh.bakedVertexAnimationManager = manager;
  const shaped: ShapedMesh = { manager, texture: null, keys: '' };
  SHAPED.set(mesh, shaped);
  writeFrames(mesh, shaped, [PLAIN_FRAME], PLAIN_KEY);
}

/** Je mesh připravený na varianty (`makeShapeable`)? */
export function isShapeable(mesh: Mesh): boolean {
  return SHAPED.has(mesh);
}

/**
 * Varianty instancí meshe (`frames[i]` patří i-té instanci): snímky VAT po jednom na různou
 * variantu a buffer nastavení snímku na instanci. Mesh bez `makeShapeable` se nemění.
 */
export function setShapeFrames(mesh: Mesh, frames: readonly ShapeFrame[]): void {
  const shaped = SHAPED.get(mesh);
  if (!shaped) return;
  const unique: ShapeFrame[] = [PLAIN_FRAME];
  const index = new Map<string, number>([[PLAIN_KEY, 0]]);
  const settings = new Float32Array(frames.length * 4);
  frames.forEach((frame, i) => {
    const key = shapeFrameKey(frame);
    let f = index.get(key);
    if (f === undefined) {
      f = unique.length;
      unique.push(frame);
      index.set(key, f);
    }
    // snímek od–do stejný, rychlost 0 – instance stojí na své variantě
    settings[i * 4] = f;
    settings[i * 4 + 1] = f;
  });
  writeFrames(mesh, shaped, unique, [...index.keys()].join(';'));
  if (frames.length > 0) {
    mesh.thinInstanceSetBuffer('bakedVertexAnimationSettingsInstanced', settings, 4, true);
  }
}

/** Zapíše snímky variant do VAT (novou texturu jen při změně počtu nebo obsahu). */
function writeFrames(
  mesh: Mesh,
  shaped: ShapedMesh,
  frames: readonly ShapeFrame[],
  keys: string,
): void {
  if (keys === shaped.keys && shaped.texture) return;
  const data = new Float32Array(frames.length * SHAPE_FRAME_FLOATS);
  frames.forEach((frame, f) => shapeBoneMatrices(frame, data, f * SHAPE_FRAME_FLOATS));
  const texture = shaped.texture;
  if (texture && texture.getSize().height === frames.length) {
    texture.update(data);
  } else {
    texture?.dispose();
    const vat = RawTexture.CreateRGBATexture(
      data,
      SHAPE_BONES * 4,
      frames.length,
      mesh.getScene(),
      false,
      false,
      Texture.NEAREST_NEAREST,
      Constants.TEXTURETYPE_FLOAT,
    );
    vat.name = `${mesh.name}-shape-vat`;
    shaped.texture = vat;
    shaped.manager.texture = vat;
  }
  shaped.keys = keys;
}

/** Původní polohy vrcholů ducha (před změnou tvaru). */
const GHOST_POSITIONS = new WeakMap<Mesh, Float32Array>();

/**
 * Duch při umisťování (jeden mesh, ne instance): tvar varianty se zapíše přímo do poloh
 * vrcholů – mění se s kurzorem a stojí jen pár tisíc vrcholů.
 */
export function shapeGhost(mesh: Mesh, frame: ShapeFrame): void {
  const source = GHOST_POSITIONS.get(mesh);
  if (!source) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) return;
    // duch je klon modelu – geometrii má sdílenou s instancemi, tvar jen do vlastní kopie
    mesh.makeGeometryUnique();
    GHOST_POSITIONS.set(mesh, Float32Array.from(positions));
    mesh.setVerticesData(VertexBuffer.PositionKind, shaped(positions, frame), true);
    return;
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, shaped(source, frame), false, false);
}

/** Polohy vrcholů (x, y, z po trojicích) po změně tvaru. */
function shaped(source: ArrayLike<number>, frame: ShapeFrame): Float32Array {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 3) {
    out[i] = shapeX(frame, source[i]!);
    out[i + 1] = shapeY(frame, source[i + 1]!);
    out[i + 2] = shapeZ(frame, source[i + 2]!);
  }
  return out;
}
