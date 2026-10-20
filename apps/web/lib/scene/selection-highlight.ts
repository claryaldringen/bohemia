import { Constants } from '@babylonjs/core/Engines/constants';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { DWELLING_FOOTPRINT_M, SACRED_BUILDINGS, roadChain } from '@bohemia/game';
import { scenePenSquares, type SceneVillage } from '../village-view';
import { cellsBoundary, type CellSquare } from './field-cells';
import { oreSiteDiscs, oreSiteOutline } from './ore-site-layout';
import { footprintCorners, stripSegments, type Point } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';
import { selectedFieldPart, selectedOrchardSquare, type VillageTarget } from './village-picking';

/** Barva výběru – světlá zlatavá, jako prstenec vybrané jednotky v 0 A.D. */
const SELECTION_COLOR = new Color3(1, 0.86, 0.45);
/** O kolik je rámeček kolem obydlí větší než půdorys (m). */
const DWELLING_RING_MARGIN_M = 1.2;
/** Kroužek kolem posvátného dubu – kolem kruhu kamenů obětin (m). */
const OAK_RING_RADIUS_M = 2.6;
/** Čáry výběru úseku cesty od osy (m) – kousek za okrajem pásu vyšlapané a upravené cesty. */
const ROAD_RING_M = { trodden: 1.6, improved: 2.2 } as const;
/**
 * Obrys čtverců (díl pole, pole, čtverec sadu, sad, hřbitov, háj, ohrada) prosvítá přes obilí,
 * stromy a ploty – druhý obrys bez testu hloubky, průsvitný (jako obrys malování – field-painting.ts).
 * Uprostřed pole by jinak obrys dílu zakryla koruna vystouplého obilí (fields.md – Co hráč vidí).
 */
const XRAY_ALPHA = 0.55;
const SEE_THROUGH: ReadonlySet<VillageTarget['kind']> = new Set([
  'field',
  'field-part',
  'orchard',
  'orchard-square',
  'cemetery',
  'grove',
  'pen',
  // jámy rudiště zakrývá val a rákos u vody
  'ore-site',
]);

/** Lomená čára posunutá o `d` m kolmo (vlevo kladně) – v bodech zlomu podle průměru směrů. */
export function offsetLine(points: readonly { x: number; z: number }[], d: number): Point[] {
  return points.map((p, k) => {
    const a = points[Math.max(0, k - 1)]!;
    const b = points[Math.min(points.length - 1, k + 1)]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [p.x - (dz / l) * d, p.z + (dx / l) * d];
  });
}

/** Zvýraznění vybraného obydlí, pole nebo hřbitova – rámeček na zemi (obtisk). */
export class SelectionHighlight {
  private readonly material: StandardMaterial;
  private readonly xrayMaterial: StandardMaterial;
  private meshes: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly height: HeightFn,
  ) {
    this.material = createDecalMaterial(scene, 'selection-ring', {
      emissive: SELECTION_COLOR,
      zOffset: -6,
    });
    this.xrayMaterial = createDecalMaterial(scene, 'selection-ring-xray', {
      emissive: SELECTION_COLOR,
    });
    this.xrayMaterial.alpha = XRAY_ALPHA;
    this.xrayMaterial.depthFunction = Constants.ALWAYS;
    this.xrayMaterial.disableDepthWrite = true;
  }

  /** Překreslí rámeček podle vybraného cíle ve vsi (null nebo zaniklý cíl = nic). */
  show(village: SceneVillage | null, target: VillageTarget | null): void {
    this.clear();
    if (!village || !target) return;
    const lines = targetOutline(village, target);
    if (lines.length === 0) return;
    const segments = lines.flatMap((line) => stripSegments(line, false, 0.35, 1.5));
    const mesh = createStripMesh(this.scene, 'selection-ring', segments, this.height, 0.15);
    mesh.material = this.material;
    mesh.receiveShadows = false;
    this.meshes.push(mesh);
    if (SEE_THROUGH.has(target.kind)) {
      const xray = createStripMesh(this.scene, 'selection-ring-xray', segments, this.height, 0.15);
      xray.material = this.xrayMaterial;
      xray.receiveShadows = false;
      xray.alphaIndex = 12;
      this.meshes.push(xray);
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.xrayMaterial.dispose();
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
  }
}

/**
 * Obrys cíle jako lomené čáry: celý pozemek obydlí (polozemnice – políčko), rámeček kolem
 * půdorysu volného obydlí (u víc vybraných obydlí kolem každého), modly nebo svatyně, kroužek kolem posvátného dubu, nebo mez kolem
 * čtverců pole, hřbitova, sadu, háje či ohrady; vybraný díl pole a čtverec sadu jen jeho čtverec
 * (i natočený); rudiště kováře obrys kolem jam a hromady rudy (`oreSiteOutline`).
 */
export function targetOutline(village: SceneVillage, target: VillageTarget): Point[][] {
  if (target.kind === 'field-part') {
    const part = selectedFieldPart(village, target);
    return part ? cellsBoundary([cellSquare(part)]) : [];
  }
  if (target.kind === 'orchard-square') {
    const square = selectedOrchardSquare(village, target);
    return square ? cellsBoundary([cellSquare(square)]) : [];
  }
  if (target.kind === 'sacred') {
    const building = village.sacred?.buildings.find((b) => b.id === target.id);
    if (!building) return [];
    const size = SACRED_BUILDINGS[building.kind].footprintM + DWELLING_RING_MARGIN_M * 2;
    const corners = footprintCorners(building.position, size, size);
    return [[...corners, corners[0]!]];
  }
  if (target.kind === 'sacred-oak') {
    const oak = village.sacred?.oaks.find((o) => o.id === target.id);
    if (!oak) return [];
    const ring = Array.from({ length: 25 }, (_, k): Point => {
      const a = (k / 24) * Math.PI * 2;
      return [oak.x + Math.cos(a) * OAK_RING_RADIUS_M, oak.z + Math.sin(a) * OAK_RING_RADIUS_M];
    });
    return [ring];
  }
  if (target.kind === 'grove') {
    const grove = village.sacred?.groves.find((g) => g.id === target.id);
    return grove ? cellsBoundary(grove.squares) : [];
  }
  if (target.kind === 'dwellings') {
    // víc vybraných obydlí – rámeček kolem každého (migration.md)
    return target.ids.flatMap((id) => targetOutline(village, { kind: 'dwelling', id }));
  }
  if (target.kind === 'dwelling') {
    const dwelling = village.dwellings.find((d) => d.id === target.id);
    if (!dwelling) return [];
    // Martin: vybrané obydlí na pozemku označí celý pozemek, ne jen stavbu
    if (dwelling.plot) {
      // dvorec vojvody – celý pozemek i se dvorem (trade.md)
      const { yard } = dwelling.plot;
      return cellsBoundary(yard ? [dwelling.plot, { ...dwelling.plot, ...yard }] : [dwelling.plot]);
    }
    const { width, depth } = DWELLING_FOOTPRINT_M[dwelling.type];
    const corners = footprintCorners(
      dwelling.position,
      width + DWELLING_RING_MARGIN_M * 2,
      depth + DWELLING_RING_MARGIN_M * 2,
    );
    return [[...corners, corners[0]!]];
  }
  if (target.kind === 'cemetery') {
    const cemetery = village.cemeteries?.find((c) => c.id === target.id);
    return cemetery ? cellsBoundary(cemetery.squares) : [];
  }
  if (target.kind === 'orchard') {
    const orchard = village.orchards?.find((o) => o.id === target.id);
    return orchard ? cellsBoundary(orchard.squares) : [];
  }
  if (target.kind === 'pen') {
    const pen = village.pens?.find((p) => p.id === target.id);
    return pen ? cellsBoundary(scenePenSquares(pen)) : [];
  }
  if (target.kind === 'ore-site') {
    const site = village.oreSites?.find((s) => s.dwellingId === target.id);
    const pits = village.orePits?.filter((p) => !p.clay);
    return site ? [oreSiteOutline(oreSiteDiscs(site, pits))] : [];
  }
  if (target.kind === 'road') {
    // celá cesta hráče (roads.md – Cesta pro hráče): čáry po obou stranách pásu přes všechny
    // úseky řetězu za sebou, na šířku nejširšího
    const chain = roadChain(village.roads ?? [], target.id);
    if (chain.length === 0) return [];
    const line: { x: number; z: number }[] = [];
    for (const { road, reversed } of chain) {
      const axis = reversed ? [...road.points].reverse() : road.points;
      line.push(...axis.slice(line.length > 0 ? 1 : 0));
    }
    const half = chain.some((l) => l.road.grade !== 'trodden')
      ? ROAD_RING_M.improved
      : ROAD_RING_M.trodden;
    return [offsetLine(line, half), offsetLine(line, -half)];
  }
  const field = village.fields.find((f) => f.id === target.id);
  if (!field || field.parts.length === 0) return [];
  return cellsBoundary(field.parts.map(cellSquare));
}

/** Čtverec stavby (díl pole, čtverec sadu) pro obrys – bez ostatních údajů. */
function cellSquare(square: CellSquare): CellSquare {
  return {
    cell: square.cell,
    x: square.x,
    z: square.z,
    size: square.size,
    ...(square.rotation !== undefined ? { rotation: square.rotation } : {}),
  };
}
