// Stavění meshů obydlí, staveniště, milířiště a materiálů obtisků (z VillageRenderer).
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { DECAY_LOOKS } from './dwelling-decay';
import { EARTH_LAYERS, earthPatch } from './dwelling-decor';
import {
  PIT_SHAPES,
  pitMeshData,
  pitOutline,
  pitShapeOf,
  spoilHeapData,
  worldToLocal,
} from './dwelling-pit';
import { plotInward, plotStakingLine } from './homestead-layout';
import { applyPitCut } from './pit-cut';
import { ROUND_SITE_M, sitePropPlace, type ConstructionState } from './village-construction';
import {
  decalGrid,
  localToWorld,
  polygonBounds,
  sceneFrame,
  shapedToWorld,
  smoothstep,
  softCoverage,
  stripSegments,
  type Point,
  type ShapedSceneDwelling,
} from './village-layout';
import { createDecalMaterial, createDecalMesh, createStripMesh } from './village-meshes';
import { createStringMaterial, createStringMesh } from './staking';
import { closedLine } from './staking-layout';
import { applySeasonGround } from './season-materials';
import type { SceneDwelling } from './village-types';
import { milirCircle } from './workshop-layout';
import {
  ABANDONED_EARTH_ALPHA,
  LIFT,
  SPOIL_HEAP_M,
  TRAMPLED_SOFT_M,
  TURF_MARGIN_M,
  VILLAGE_SNOW,
  VillageContext,
  dwellingDecay,
  trampledArea,
} from './village-renderer-shared';

/** Co stavitelé meshů potřebují od VillageRenderer. */
export interface MeshHost {
  readonly scene: Scene;
  readonly context: VillageContext;
  readonly materials: Map<string, Material>;
  baseHeight(d: ShapedSceneDwelling & Pick<SceneDwelling, 'position'>): number;
}

/** Vyšlapaná hlína před vchodem: širší prošlapaná tráva, uvnitř holá udusaná hlína. */
export function dwellingGround(h: MeshHost, d: SceneDwelling): Mesh[] {
  // opuštěné obydlí (nikdo v něm nebydlí – vymřelá ves, prázdné obydlí) zarůstá trávou:
  // vyšlapaná a udusaná hlína se nikdo neobnovuje; s rozpadem domu zarůstá dál
  const look = DECAY_LOOKS[dwellingDecay(d)];
  const alpha = (d.inhabited === false ? ABANDONED_EARTH_ALPHA : 1) * look.earth;
  const worn = createDecalMesh(
    h.scene,
    `village-worn-${d.id}`,
    earthPatch(d.type, d.position, d.id, EARTH_LAYERS.worn, sceneFrame(d)),
    {
      height: h.context.decalHeight,
      smoothHeight: h.context.groundHeight,
      lift: LIFT.worn,
      color: [1, 0.96, 0.88],
      alpha,
      uv: 20,
    },
  );
  worn.material = decalMaterial(h, 'grass-dirt');
  worn.alphaIndex = 1;
  const earth = createDecalMesh(
    h.scene,
    `village-earth-${d.id}`,
    earthPatch(d.type, d.position, d.id, EARTH_LAYERS.earth, sceneFrame(d)),
    {
      height: h.context.decalHeight,
      smoothHeight: h.context.groundHeight,
      lift: LIFT.earth,
      // šedavá hlína z terénu do teplejší hnědé (udusaná hlína u dveří)
      color: [1.05, 0.9, 0.74],
      alpha,
      uv: 14,
    },
  );
  earth.material = decalMaterial(h, 'mud', -3);
  earth.alphaIndex = 2;
  const { depth } = PIT_SHAPES[d.type];
  // nadzemní srub jámu nemá (log-house.md – Scéna)
  if (depth <= 0) return [worn, earth];
  // děravou a zřícenou střechou do jámy svítí slunce
  return [worn, earth, pitMesh(h, d, depth, look.roofCover, false)];
}

/** Jáma se šíjí a schody (stěny po okraj terénu, dno, stupně) – terén v ní prořízne pit-cut. */
export function pitMesh(
  h: MeshHost,
  d: SceneDwelling,
  depth: number,
  roofCover: number,
  fresh: boolean,
): Mesh {
  const data = pitMeshData(pitShapeOf(d), d.position, {
    depth,
    base: h.baseHeight(d),
    rim: h.context.decalHeight,
    roofCover,
    fresh,
    sun: h.context.sunDirection,
  });
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.normals = data.normals;
  vertexData.uvs = data.uvs;
  vertexData.colors = data.colors;
  vertexData.indices = data.indices;
  const mesh = new Mesh(`village-pit-${d.id}`, h.scene);
  vertexData.applyToMesh(mesh);
  mesh.material = pitMaterial(h);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/**
 * Čára vytyčení s kolíky a provázkem: kolem celého pozemku (po budoucím plotu), u volného
 * obydlí kolem jámy se šíjí.
 */
export function stakingLine(h: MeshHost, d: SceneDwelling): Point[] {
  return d.plot ? plotStakingLine(d.plot) : closedLine(pitOutlineWorld(h, d, 0));
}

/** Obvod jámy se šíjí ve světě (rozšířený o `margin`). */
export function pitOutlineWorld(h: MeshHost, d: SceneDwelling, margin: number): Point[] {
  return pitOutline(pitShapeOf(d), margin).map(([x, z]) => localToWorld(d.position, x, z));
}

/**
 * Staveniště podle fáze (village-construction.ts): ušlapaná tráva kolem, světlá čára
 * vytyčení, sejmutý drn (tmavá hlína od zadní stěny k šíji), od kopání jáma, která se
 * prohlubuje. Díly konstrukce a rekvizity kreslí `updateConstruction` v instancích.
 */
export function constructionSite(h: MeshHost, d: SceneDwelling, state: ConstructionState): Mesh[] {
  const meshes: Mesh[] = [];
  if (state.trampled > 0) {
    const area = trampledArea(d);
    const b = polygonBounds(area);
    const pad = TRAMPLED_SOFT_M;
    const trampled = createDecalMesh(
      h.scene,
      `village-trampled-${d.id}`,
      decalGrid(
        { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
        0.6,
        softCoverage(area, TRAMPLED_SOFT_M),
      ),
      {
        height: h.context.decalHeight,
        smoothHeight: h.context.groundHeight,
        lift: LIFT.worn,
        color: [1, 0.95, 0.86],
        alpha: state.trampled,
        uv: 20,
      },
    );
    trampled.material = decalMaterial(h, 'grass-dirt');
    trampled.alphaIndex = 1;
    meshes.push(trampled);
  }
  if (state.turf > 0) {
    // drn se snímá od zadní stěny (−z) k šíji
    const shape = pitShapeOf(d);
    const outline = pitOutlineWorld(h, d, TURF_MARGIN_M);
    const b = polygonBounds(outline);
    const coverage = softCoverage(outline, 0.35);
    const start = -shape.halfZ - TURF_MARGIN_M;
    const front = start + state.turf * (shape.rampEndZ + TURF_MARGIN_M - start + 0.3);
    const turf = createDecalMesh(
      h.scene,
      `village-turf-${d.id}`,
      decalGrid(
        { minX: b.minX - 0.5, maxX: b.maxX + 0.5, minZ: b.minZ - 0.5, maxZ: b.maxZ + 0.5 },
        0.3,
        (x, z) =>
          coverage(x, z) * (1 - smoothstep(front - 0.4, front, worldToLocal(d.position, x, z)[1])),
      ),
      {
        height: h.context.decalHeight,
        smoothHeight: h.context.groundHeight,
        lift: LIFT.turf,
        color: [0.72, 0.58, 0.46],
        uv: 10,
      },
    );
    turf.material = decalMaterial(h, 'mud', -3);
    turf.alphaIndex = 2;
    meshes.push(turf);
  }
  if (state.outline > 0) {
    const line = createStripMesh(
      h.scene,
      `village-layout-${d.id}`,
      stripSegments(pitOutlineWorld(h, d, 0), true, 0.09, 0.5),
      h.context.decalHeight,
      LIFT.outline,
    );
    line.material = layoutMaterial(h);
    meshes.push(line);
    // kolíky v rozích a po obvodu a mezi nimi napnutý provázek – vidět hned po zadání stavby
    let string = h.materials.get('string');
    if (!string) {
      string = createStringMaterial(h.scene);
      h.materials.set('string', string);
    }
    meshes.push(
      createStringMesh(
        h.scene,
        `village-string-${d.id}`,
        [stakingLine(h, d)],
        h.context.groundHeight,
        string,
      ),
    );
  }
  if (state.pitDepth > 0) meshes.push(pitMesh(h, d, state.pitDepth, state.roofCover, true));
  const spoil = state.props.find((p) => p.prop === 'spoil');
  if (spoil) meshes.push(spoilHeap(h, d, spoil.scale));
  return meshes;
}

/** Hromada vykopané hlíny vedle jámy – roste s kopáním, ubývá na valy. */
export function spoilHeap(h: MeshHost, d: SceneDwelling, scale: number): Mesh {
  const place = sitePropPlace(d.type, 'spoil', d.plot ? plotInward(d.plot.variant) : undefined);
  const [x, z] = shapedToWorld(d.position, sceneFrame(d), place.x, place.z);
  const data = spoilHeapData({
    seed: d.id,
    x,
    z,
    rotation: d.position.rotation + place.rotation,
    rx: SPOIL_HEAP_M.rx * Math.sqrt(scale),
    rz: SPOIL_HEAP_M.rz * Math.sqrt(scale),
    height: SPOIL_HEAP_M.height * scale,
    ground: h.context.decalHeight,
  });
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.uvs = data.uvs;
  vertexData.colors = data.colors;
  vertexData.indices = data.indices;
  const normals = new Float32Array(data.positions.length);
  VertexData.ComputeNormals(data.positions, data.indices, normals);
  vertexData.normals = normals;
  const mesh = new Mesh(`village-spoil-${d.id}`, h.scene);
  vertexData.applyToMesh(mesh);
  mesh.material = pitMaterial(h);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  h.context.addShadowCaster(mesh);
  return mesh;
}

/**
 * Staveniště milíře (kruhové, bez jámy – village-construction.ts): ušlapaná tráva kolem
 * a světlá čára vytyčeného kruhu, dokud se neskládá věnec polen. Díly a rekvizity kreslí
 * `updateConstruction` v instancích.
 */
export function milirSite(h: MeshHost, d: SceneDwelling, state: ConstructionState): Mesh[] {
  const meshes: Mesh[] = [];
  const site = ROUND_SITE_M.milir;
  if (state.trampled > 0) {
    meshes.push(milirTrampled(h, d, site.trampled - TRAMPLED_SOFT_M / 2, state.trampled));
  }
  if (state.outline > 0) meshes.push(milirOutline(h, d));
  return meshes;
}

/** Provázek vytyčení kruhu milíře (nový milíř na milířišti i v lese). */
export function milirOutline(h: MeshHost, d: SceneDwelling): Mesh {
  const line = createStripMesh(
    h.scene,
    `village-milir-layout-${d.id}`,
    stripSegments(milirCircle(d.position, ROUND_SITE_M.milir.outline), true, 0.09, 0.5),
    h.context.decalHeight,
    LIFT.outline,
  );
  line.material = layoutMaterial(h);
  return line;
}

/** Hotový milíř: kolem vyšlapaná zem (uhlíř u něj pracuje), u opuštěného zarůstá. */
export function milirGround(h: MeshHost, d: SceneDwelling): Mesh {
  const alpha = d.inhabited === false ? ABANDONED_EARTH_ALPHA : 0.85;
  return milirTrampled(h, d, ROUND_SITE_M.milir.trampled - TRAMPLED_SOFT_M / 2, alpha);
}

/** Ušlapaná tráva v kruhu kolem milíře (poloměr `radius`, měkký okraj). */
export function milirTrampled(h: MeshHost, d: SceneDwelling, radius: number, alpha: number): Mesh {
  const area = milirCircle(d.position, radius);
  const b = polygonBounds(area);
  const pad = TRAMPLED_SOFT_M;
  const mesh = createDecalMesh(
    h.scene,
    `village-milir-trampled-${d.id}`,
    decalGrid(
      { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
      0.6,
      softCoverage(area, TRAMPLED_SOFT_M),
    ),
    {
      height: h.context.decalHeight,
      smoothHeight: h.context.groundHeight,
      lift: LIFT.worn,
      color: [0.95, 0.88, 0.78],
      alpha,
      uv: 20,
    },
  );
  mesh.material = decalMaterial(h, 'grass-dirt');
  mesh.alphaIndex = 1;
  return mesh;
}

export function decalMaterial(
  h: MeshHost,
  texture: 'grass-dirt' | 'mud' | 'gravel',
  zOffset = -2,
): Material {
  const key = `decal-${texture}-${zOffset}`;
  let material = h.materials.get(key);
  if (!material) {
    const decal = createDecalMaterial(h.scene, `village-${key}`, { texture, zOffset });
    // obtisky (vyšlapaná hlína, sejmutý drn) nesmí viset nad jámou
    applyPitCut(decal, h.context.pitCuts);
    // tráva v nich usychá jako na terénu, v zimě je zasype sníh – pole a cesty jen prosvítají
    applySeasonGround(decal, VILLAGE_SNOW);
    const loaded = decal.diffuseTexture;
    if (loaded instanceof Texture && !loaded.isReady()) {
      loaded.onLoadObservable.addOnce(() => h.context.requestRender());
    }
    material = decal;
    h.materials.set(key, material);
  }
  return material;
}

/** Hlína jámy: textura bahna z terénu, barvy (ornice, podloží, stín) nesou vrcholy. */
export function pitMaterial(h: MeshHost): Material {
  let material = h.materials.get('pit');
  if (!material) {
    const standard = new StandardMaterial('village-pit', h.scene);
    standard.specularColor = Color3.Black();
    // stěnu vidět zevnitř i tam, kde na svahu okraj klesne pod dno
    standard.backFaceCulling = false;
    standard.twoSidedLighting = true;
    const texture = new Texture('/textures/terrain/mud.jpg', h.scene);
    texture.anisotropicFilteringLevel = 8;
    if (!texture.isReady()) texture.onLoadObservable.addOnce(() => h.context.requestRender());
    standard.diffuseTexture = texture;
    material = standard;
    h.materials.set('pit', material);
  }
  return material;
}

/**
 * Tráva zarostlé prohlubně: textura trávy z terénu, barvy nesou vrcholy; usychá a v zimě ji
 * zasype sníh jako terén. Leží v řezu terénu – sama se neprořezává.
 */
export function ruinMaterial(h: MeshHost): Material {
  let material = h.materials.get('ruin');
  if (!material) {
    const standard = new StandardMaterial('village-ruin', h.scene);
    standard.specularColor = Color3.Black();
    const texture = new Texture('/textures/terrain/grass.jpg', h.scene);
    texture.anisotropicFilteringLevel = 8;
    if (!texture.isReady()) texture.onLoadObservable.addOnce(() => h.context.requestRender());
    standard.diffuseTexture = texture;
    applySeasonGround(standard);
    material = standard;
    h.materials.set('ruin', material);
  }
  return material;
}

/** Světlá čára vytyčení (vápno / naražená tráva po provázku). */
export function layoutMaterial(h: MeshHost): Material {
  let material = h.materials.get('layout');
  if (!material) {
    const standard = new StandardMaterial('village-layout', h.scene);
    standard.diffuseColor = new Color3(0.8, 0.76, 0.64);
    standard.specularColor = Color3.Black();
    standard.zOffset = -4;
    standard.backFaceCulling = false;
    material = standard;
    h.materials.set('layout', material);
  }
  return material;
}
