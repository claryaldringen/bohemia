import { Constants } from '@babylonjs/core/Engines/constants';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { SACRED_BUILDINGS, roadChain, threshingFloorFootprint } from '@bohemia/game';
import type { SceneFortification } from '../fort-view';
import {
  FORT_GATE_HALF_M,
  alongFrom,
  fortPerimeter,
  fortSectionSpans,
  gateCenterM,
} from '../fort-sections';
import { perimeterSamples, type FortEdges, type PerimeterSample } from './fortification-layout';
import { scenePenSquares, type SceneVillage } from '../village-view';
import { cellsBoundary, type CellSquare } from './field-cells';
import { junctionShape } from './junction-shape';
import { oreSiteDiscs, oreSiteOutline } from './ore-site-layout';
import { GRAIN_PIT_RING_M } from './grain-pit-layout';
import {
  footprintCorners,
  footprintRect,
  rectCorners,
  stripSegments,
  type Point,
} from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';
import { setE2EHook } from '../e2e-hooks';
import {
  dugSiteOf,
  selectedFieldPart,
  selectedOrchardSquare,
  type VillageTarget,
} from './village-picking';

/** Barva výběru – světlá zlatavá, jako prstenec vybrané jednotky v 0 A.D. */
const SELECTION_COLOR = new Color3(1, 0.86, 0.45);
/** O kolik je rámeček kolem obydlí větší než půdorys (m). */
const DWELLING_RING_MARGIN_M = 1.2;
/** Kroužek kolem posvátného dubu – kolem kruhu kamenů obětin (m). */
const OAK_RING_RADIUS_M = 2.6;
/** Čáry výběru úseku cesty od osy (m) – kousek za okrajem pásu vyšlapané a upravené cesty. */
/** Obrys označené křižovatky leží tolik metrů za okrajem plácku. */
const JUNCTION_RING_M = 0.35;
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
  'fields',
  'orchard',
  'orchard-square',
  'cemetery',
  'grove',
  'pen',
  // jámy rudiště a hliniště zakrývá val a rákos u vody
  'ore-site',
  'clay-site',
  // milířiště zarůstá trávou, kupu milíře zakrývají stromy kolem
  'kiln',
  // hrdlo obilné jámy je nízko u země za valem
  'grain-pit',
  // obvod opevnění prosvítá přes stromy v pásu
  'fortification',
  'fortification-section',
  'fortification-gate',
]);
/** Poloměr obrysu milíře a milířiště (m) – kousek za kupou (MILIR_SHAPE_M.radius 2,3 m). */
const KILN_RING_M = 3.6;

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

/** Krok bodů obrysu pásu opevnění po obvodu (m) – oblouky křivky hladce. */
const FORT_RING_STEP_M = 0.5;
/** Obrys brány kousek za pásem a za okraji brány (m). */
const FORT_GATE_RING_M = 0.5;

/** Opevnění pro obrys pásu: tvar obvodu, druh (šířka pásu), zbořené díly a brány. */
export type FortRingSource = FortEdges & Pick<SceneFortification, 'segments' | 'gates'>;

/** Bod vzorků pásu v poloze `s` obvodu délky `total` (mezi sousedními vzorky lineárně). */
function sampleAt(samples: readonly PerimeterSample[], s: number, total: number): PerimeterSample {
  const at = alongFrom(0, s, total);
  const n = samples.length;
  let i = n - 1;
  while (i > 0 && samples[i]!.s > at) i--;
  const a = samples[i]!;
  const b = samples[(i + 1) % n]!;
  const span = alongFrom(a.s, b.s, total) || total;
  const t = Math.min(1, Math.max(0, alongFrom(a.s, at, total) / span));
  const mix = (p: number, q: number): number => p + (q - p) * t;
  return {
    x: mix(a.x, b.x),
    z: mix(a.z, b.z),
    nx: mix(a.nx, b.nx),
    nz: mix(a.nz, b.nz),
    s: at,
    segment: a.segment,
    ix: mix(a.ix, b.ix),
    iz: mix(a.iz, b.iz),
  };
}

/** Kusy obvodu [od, do] (m, `do` smí přesáhnout délku obvodu) bez zbořených dílů. */
function standingPieces(fort: FortRingSource, fromM: number, lengthM: number): [number, number][] {
  const { starts, total } = fortPerimeter(fort.shapes.map((x) => x.lengthM));
  const gaps: [number, number][] = [];
  /** Mezera [od, do] (m od začátku dílu 0); po směru obvodu od začátku kusu, i přes začátek dílu 0. */
  const addGap = (a: number, b: number): void => {
    const from = alongFrom(fromM, a, total);
    gaps.push(
      [fromM + from, fromM + from + (b - a)],
      [fromM + from - total, fromM + from + b - a - total],
    );
  };
  for (const seg of fort.segments) {
    const a = starts[seg.index];
    const len = fort.shapes[seg.index]?.lengthM;
    if (a === undefined || len === undefined) continue;
    if (seg.demolishedDay !== undefined) {
      addGap(a, a + len);
      continue;
    }
    // část dílu s branou zbořená se sousedním úsekem – od okraje dílu po okraj brány
    const gate = fort.gates.find((g) => g.segment === seg.index);
    if (!gate) continue;
    const center = a + gate.offsetM;
    if (seg.demolishedBeforeGate !== undefined) addGap(a, center - FORT_GATE_HALF_M);
    if (seg.demolishedAfterGate !== undefined) addGap(center + FORT_GATE_HALF_M, a + len);
  }
  gaps.sort((p, q) => p[0] - q[0]);
  const pieces: [number, number][] = [];
  let at = fromM;
  const end = fromM + lengthM;
  for (const [a, b] of gaps) {
    if (b <= at || a >= end) continue;
    if (a > at) pieces.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < end) pieces.push([at, end]);
  return pieces.filter(([a, b]) => b - a > 1e-6);
}

/**
 * Obrysy pásu opevnění na kusu obvodu od `fromM` délky `lengthM` (m po obvodu od začátku dílu 0):
 * vnější okraj – křivka obvodu – tam, vnitřní okraj pásu zpět, uzavřené. Pás je tentýž, podle
 * kterého scéna staví kůly, plot i val (`perimeterSamples` – šířka pásu druhu, v ostrém ohybu
 * vnitřní okraj do rohu); `margin` m ho rozšíří ven, dovnitř i za konce (brána). Zbořené díly
 * obrys dělí; celý obvod bez mezer jsou dva uzavřené okraje.
 */
export function fortBandRings(
  fort: FortRingSource,
  fromM: number,
  lengthM: number,
  margin = 0,
): Point[][] {
  const samples = perimeterSamples(fort, FORT_RING_STEP_M);
  const { total } = fortPerimeter(fort.shapes.map((x) => x.lengthM));
  if (samples.length < 3 || total <= 0) return [];
  const outerOf = (p: PerimeterSample): Point => [p.x - p.nx * margin, p.z - p.nz * margin];
  const innerOf = (p: PerimeterSample): Point => [p.ix + p.nx * margin, p.iz + p.nz * margin];
  const whole = lengthM >= total - 1e-6;
  const gone = fort.segments.some(
    (x) =>
      x.demolishedDay !== undefined ||
      x.demolishedBeforeGate !== undefined ||
      x.demolishedAfterGate !== undefined,
  );
  if (whole && !gone) {
    const outer = samples.map(outerOf);
    const inner = samples.map(innerOf);
    return [
      [...outer, outer[0]!],
      [...inner, inner[0]!],
    ];
  }
  // celý obvod s mezerami začne za první mezerou, ať se kus přes začátek dílu 0 nerozdělí
  let from = fromM - margin;
  const first = fort.segments.find((x) => x.demolishedDay !== undefined);
  if (whole && first) {
    const { starts } = fortPerimeter(fort.shapes.map((x) => x.lengthM));
    from = (starts[first.index] ?? 0) + (fort.shapes[first.index]?.lengthM ?? 0);
  }
  const span = whole ? total : lengthM + 2 * margin;
  return standingPieces(fort, from, span).map(([a, b]) => {
    const inside = samples
      .flatMap((p) => [p.s, p.s + total, p.s - total].map((s) => ({ p, s })))
      .filter(({ s }) => s > a + 1e-6 && s < b - 1e-6)
      .sort((p, q) => p.s - q.s)
      .map(({ p }) => p);
    const points = [sampleAt(samples, a, total), ...inside, sampleAt(samples, b, total)];
    const outer = points.map(outerOf);
    const inner = points.map(innerOf).reverse();
    return [...outer, ...inner, outer[0]!];
  });
}

/**
 * Obrysy vybraného úseku mezi branami (fortifications.md – Rozhraní, Úseky): pás hradby od
 * okraje brány na začátku úseku jádra s dílem `segment` po okraj další brány (`fortSectionSpans`).
 */
export function fortSectionRings(
  fort: FortRingSource & Pick<SceneFortification, 'gates'>,
  segment: number,
): Point[][] {
  const spans = fortSectionSpans(
    fort.shapes.map((x) => x.lengthM),
    fort.gates,
  );
  const gateSegments = [...new Set(fort.gates.map((g) => g.segment))].sort((a, b) => a - b);
  // úsek jádra s dílem `segment` začíná dílem brány před ním (bez brány celý obvod)
  const start =
    [...gateSegments].reverse().find((g) => g <= segment) ?? gateSegments[gateSegments.length - 1];
  const span = spans.find((x) => x.gateSegment === (start ?? null));
  return span && span.lengthM > 0 ? fortBandRings(fort, span.fromM, span.lengthM) : [];
}

/** Obrys brány v dílu `segment` – pás brány kousek za okraji (`FORT_GATE_RING_M`). */
export function fortGateRings(
  fort: FortRingSource & Pick<SceneFortification, 'gates'>,
  segment: number,
): Point[][] {
  const gate = fort.gates.find((g) => g.segment === segment);
  if (!gate) return [];
  const perimeter = fortPerimeter(fort.shapes.map((x) => x.lengthM));
  const center = gateCenterM(perimeter, gate);
  return fortBandRings(fort, center - FORT_GATE_HALF_M, 2 * FORT_GATE_HALF_M, FORT_GATE_RING_M);
}

/** Zvýraznění vybraného obydlí, pole nebo hřbitova – rámeček na zemi (obtisk). */
export class SelectionHighlight {
  private readonly material: StandardMaterial;
  private readonly xrayMaterial: StandardMaterial;
  private meshes: Mesh[] = [];
  /** Čáry právě kreslené (háček pro e2e – `selectionOutline`). */
  private lines: Point[][] = [];

  constructor(
    private readonly scene: Scene,
    private readonly height: HeightFn,
  ) {
    setE2EHook('selectionOutline', () => this.lines);
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
  show(
    village: SceneVillage | null,
    target: VillageTarget | null,
    logPiles: readonly { id: number; corners: readonly (readonly [number, number])[] }[] = [],
  ): void {
    this.clear();
    if (!village || !target) return;
    const lines = targetOutline(village, target, logPiles);
    this.lines = lines;
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
    setE2EHook('selectionOutline', undefined);
    this.material.dispose();
    this.xrayMaterial.dispose();
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
    this.lines = [];
  }
}

/**
 * Obrys cíle jako lomené čáry: celý pozemek obydlí (polozemnice – políčko), rámeček kolem
 * půdorysu volného obydlí (u víc vybraných obydlí kolem každého), modly nebo svatyně, kroužek kolem posvátného dubu, nebo mez kolem
 * čtverců pole, hřbitova, sadu, háje či ohrady; vybraný díl pole a čtverec sadu jen jeho čtverec
 * (i natočený); rudiště kováře a hliniště hrnčíře obrys kolem jam a hromady (`oreSiteOutline`).
 */
export function targetOutline(
  village: SceneVillage,
  target: VillageTarget,
  logPiles: readonly { id: number; corners: readonly (readonly [number, number])[] }[] = [],
): Point[][] {
  // vybraná postava, spřežení a vůz mají žlutý kroužek, který je sleduje (villagers.ts,
  // plough-team-renderer.ts, cart-renderer.ts) – rámeček na zemi ne
  if (target.kind === 'person' || target.kind === 'plough-team' || target.kind === 'cart') {
    return [];
  }
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
  if (target.kind === 'fields') {
    // všechna pole najednou – mez kolem každého
    return target.ids.flatMap((id) => targetOutline(village, { kind: 'field', id }));
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
    // půdorys podle varianty rozměrů domu (population.md – Varianty rozměrů)
    const corners = rectCorners(dwelling.position, footprintRect(dwelling), DWELLING_RING_MARGIN_M);
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
  if (target.kind === 'ore-site' || target.kind === 'clay-site') {
    const site = dugSiteOf(village, target);
    return site ? [oreSiteOutline(oreSiteDiscs(site, village.orePits))] : [];
  }
  if (target.kind === 'kiln') {
    // milíř nebo milířiště (crafts.md – Milíř u skácených buků) – kruh kolem kupy
    const at =
      village.kilns?.find((k) => k.id === target.id) ??
      village.kilnRemnants?.find((r) => r.id === target.id);
    if (!at) return [];
    const n = 24;
    const ring: Point[] = Array.from({ length: n + 1 }, (_, i) => {
      const a = (2 * Math.PI * (i % n)) / n;
      return [at.x + KILN_RING_M * Math.cos(a), at.z + KILN_RING_M * Math.sin(a)];
    });
    return [ring];
  }
  if (target.kind === 'threshing-floor') {
    // půdorys humna (production-chains.md – Humno) – obdélník mlatu
    const floor = village.threshingFloors?.find((f) => f.id === target.id);
    if (!floor) return [];
    const corners = threshingFloorFootprint(floor.position).map(([x, z]): Point => [x, z]);
    return [[...corners, corners[0]!]];
  }
  if (
    target.kind === 'fortification' ||
    target.kind === 'fortification-section' ||
    target.kind === 'fortification-gate'
  ) {
    // pás opevnění, jak ho kreslí scéna (fortifications.md – Rozhraní): celé opevnění včetně
    // bran (dvojklik), úsek mezi okraji bran, nebo brána
    const fort = village.forts?.find((f) => f.id === target.id);
    if (!fort) return [];
    if (target.kind === 'fortification-gate') return fortGateRings(fort, target.segment);
    if (target.kind === 'fortification-section') return fortSectionRings(fort, target.segment);
    const total = fort.shapes.reduce((sum, x) => sum + x.lengthM, 0);
    const rings = fortBandRings(fort, 0, total);
    return rings.length > 0 ? rings : [fort.outline.map(([x, z]): Point => [x, z])];
  }
  if (target.kind === 'log-pile') {
    // půdorys hromady, jak leží ve scéně (místo hledá scéna – log-pile-layout.ts)
    const pile = logPiles.find((l) => l.id === target.id);
    if (!pile) return [];
    return [
      [...pile.corners.map((c): Point => [c[0], c[1]]), [pile.corners[0]![0], pile.corners[0]![1]]],
    ];
  }
  if (target.kind === 'grain-pit') {
    // otevřená obilná jáma (production-chains.md – Obilné jámy) – kruh kolem hrdla a hrud pečeti
    const pit = village.grainPits?.find((p) => p.id === target.id);
    if (!pit) return [];
    const n = 24;
    const ring: Point[] = Array.from({ length: n + 1 }, (_, i) => {
      const a = (2 * Math.PI * (i % n)) / n;
      return [pit.x + GRAIN_PIT_RING_M * Math.cos(a), pit.z + GRAIN_PIT_RING_M * Math.sin(a)];
    });
    return [ring];
  }
  if (target.kind === 'junction') {
    // obrys křižovatky (kříž nebo Y) kousek za okrajem plácku
    const junction = village.junctions?.find((j) => j.id === target.id);
    const shape = junction ? junctionShape(junction, village.roads ?? []) : null;
    if (!junction || !shape) return [];
    const ring: Point[] = shape.outline.map((p): Point => {
      const dx = p.x - junction.x;
      const dz = p.z - junction.z;
      const len = Math.max(1e-6, Math.hypot(dx, dz));
      return [p.x + (dx / len) * JUNCTION_RING_M, p.z + (dz / len) * JUNCTION_RING_M];
    });
    return [[...ring, ring[0]!]];
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
  // zvíře nemá obrys (zvýrazní ho scéna ve W10)
  if (target.kind === 'wildlife' || target.kind === 'visitor') return [];
  // prvek prémiové krajiny – obrys má v obtiscích krajiny (premium-sites.ts), druhý se nekreslí
  if (target.kind === 'premium-site') return [];
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
