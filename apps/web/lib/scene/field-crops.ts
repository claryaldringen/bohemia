// Jak se vzhled dílů pole kreslí (bez Babylonu): obtisky po dílech a jejich rozpracovaných
// částech, trsy obilí a hrachu v řádcích, panáky snopů (u luštěnin hromádky vytrhaného hrachu)
// na sklizené části, plevel v úhoru a kolíky s provázkem kolem vytyčeného pole. Všechno deterministicky podle políčka – stejné pole se
// při překreslení nezmění. Vzhled dílů rozhoduje field-look.ts.
import { createNoise2D } from 'simplex-noise';
import { cellsBoundary, cellsCoverage, type CellSquare, type CornerRounding } from './field-cells';
import {
  workAt,
  workFrame,
  workSteps,
  type FieldLook,
  type PartView,
  type WorkFrame,
} from './field-look';
import { hayOnSquares, hayPhase } from './hay-meadows';
import { seededRandom, smoothstep, type Bounds, type Point } from './village-layout';

export type Rgb = readonly [number, number, number];

/**
 * Textury obtisků pole: z 0 A.D. (apps/web/public/textures/fields/ – zorané pole, osetá zem,
 * strniště, porost shora) a z terénu (tráva, tráva s hlínou, bahno).
 */
export type FieldTexture =
  'farmland' | 'sown' | 'stubble' | 'crop' | 'grass' | 'grass-flowers' | 'grass-dirt' | 'mud';

/**
 * Trsy (uzly crops.glb – `crop-<druh>`): obilí zelené s klasy, zralé, vzcházející, strniště;
 * hrách zelený kvetoucí a zralý (luštěniny – fields.md, Luštěniny).
 */
export type CropKind = 'green' | 'ripe' | 'sprout' | 'stubble' | 'pea-green' | 'pea-ripe';
export const CROP_KINDS: readonly CropKind[] = [
  'green',
  'ripe',
  'sprout',
  'stubble',
  'pea-green',
  'pea-ripe',
];

/** Plodina dílu, která vypadá jinak než obilí (`SceneFieldPart.crop`). */
export type FieldCrop = 'legume';

/** Textura obtisku: soubor, délka opakování (m) a jestli brázdy vedou podél řádků pole. */
export const FIELD_TEXTURES: Record<FieldTexture, { url: string; repeatM: number; rows: boolean }> =
  {
    farmland: { url: '/textures/fields/farmland.jpg', repeatM: 12, rows: true },
    sown: { url: '/textures/fields/sown.jpg', repeatM: 10, rows: true },
    stubble: { url: '/textures/fields/stubble.jpg', repeatM: 10, rows: true },
    crop: { url: '/textures/fields/crop.jpg', repeatM: 22, rows: true },
    grass: { url: '/textures/terrain/grass.jpg', repeatM: 65, rows: false },
    'grass-flowers': { url: '/textures/terrain/grass-flowers.jpg', repeatM: 65, rows: false },
    'grass-dirt': { url: '/textures/terrain/grass-dirt.jpg', repeatM: 20, rows: false },
    mud: { url: '/textures/terrain/mud.jpg', repeatM: 14, rows: false },
  };

export interface LookStyle {
  texture: FieldTexture;
  /** Násobek barvy textury. */
  tint: Rgb;
  /** Krytí obtisku – pastvina prosvítá loukou. */
  alpha: number;
  /**
   * Druhá vrstva ve skvrnách (plevel v úhoru, prošlapaná místa pastviny) – s `even` rovnoměrně
   * přes celý díl (zelené řádky vzcházejícího obilí), nebo null.
   */
  patches: { texture: FieldTexture; tint: Rgb; alpha: number; even?: boolean } | null;
  /** Trsy obilí: druh, výška a šířka trsu (m), podíl míst v řádcích; null = bez trsů. */
  crop: { kind: CropKind; height: number; width: number; density: number } | null;
  /** Panáky snopů na sklizené části. */
  stooks: boolean;
  /** Seno: řádky, kupky a stohy podle dne (hay-meadows.ts) – posečená louka na seno. */
  hay: boolean;
  /** Trsy plevele na m². */
  weeds: number;
}

/**
 * Vzhled dílů podle 0 A.D.: zem s měkkými brázdami místo tvrdých pruhů, obilí jako 3D trsy
 * v řádcích (pod nimi porost shora – z dálky, kde trsy řídnou, pole nese obtisk), panáky
 * na žni, strniště, úhor se strništěm a plevelem, spasená pastvina splývá s loukou.
 */
export const LOOK_STYLES: Record<FieldLook, LookStyle> = {
  bare: {
    texture: 'grass-dirt',
    tint: [0.82, 0.68, 0.54],
    alpha: 1,
    patches: { texture: 'mud', tint: [0.9, 0.76, 0.6], alpha: 0.75 },
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0,
  },
  plowed: {
    texture: 'farmland',
    tint: [0.84, 0.74, 0.62],
    alpha: 1,
    patches: null,
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0,
  },
  sown: {
    texture: 'sown',
    tint: [1, 0.94, 0.86],
    alpha: 1,
    patches: null,
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0,
  },
  sprouted: {
    texture: 'sown',
    tint: [0.95, 0.98, 0.82],
    alpha: 1,
    patches: { texture: 'crop', tint: [0.42, 0.62, 0.3], alpha: 0.5, even: true },
    crop: { kind: 'sprout', height: 0.3, width: 0.95, density: 0.85 },
    stooks: false,
    hay: false,
    weeds: 0,
  },
  green: {
    texture: 'crop',
    tint: [0.44, 0.6, 0.32],
    alpha: 1,
    patches: null,
    crop: { kind: 'green', height: 0.85, width: 0.75, density: 1 },
    stooks: false,
    hay: false,
    weeds: 0,
  },
  ripe: {
    texture: 'crop',
    tint: [1.1, 0.94, 0.52],
    alpha: 1,
    patches: null,
    crop: { kind: 'ripe', height: 1.15, width: 0.95, density: 1 },
    stooks: false,
    hay: false,
    weeds: 0,
  },
  harvesting: {
    texture: 'stubble',
    tint: [1.14, 1.08, 0.96],
    alpha: 1,
    patches: null,
    crop: { kind: 'stubble', height: 0.16, width: 0.55, density: 0.5 },
    stooks: true,
    hay: false,
    weeds: 0,
  },
  stubble: {
    texture: 'stubble',
    tint: [1.12, 1.06, 0.95],
    alpha: 1,
    patches: null,
    crop: { kind: 'stubble', height: 0.15, width: 0.55, density: 0.5 },
    stooks: false,
    hay: false,
    weeds: 0,
  },
  'young-fallow': {
    texture: 'stubble',
    tint: [0.86, 0.86, 0.74],
    alpha: 1,
    patches: { texture: 'grass', tint: [0.95, 1, 0.82], alpha: 0.85 },
    crop: { kind: 'stubble', height: 0.12, width: 0.5, density: 0.18 },
    stooks: false,
    hay: false,
    weeds: 0.09,
  },
  pasture: {
    texture: 'grass',
    tint: [0.98, 1, 0.86],
    alpha: 0.9,
    patches: { texture: 'grass-dirt', tint: [0.98, 0.94, 0.84], alpha: 0.45 },
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0,
  },
  // louka na seno: vysoká kvetoucí tráva s trsy, pak posečená (kratší, světlejší) s řádky sena
  // a kupkami, nakonec otava se stohy
  meadow: {
    texture: 'grass-flowers',
    tint: [1, 1.04, 0.9],
    alpha: 0.95,
    patches: null,
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0.16,
  },
  mown: {
    texture: 'grass',
    tint: [1.2, 1.12, 0.74],
    alpha: 0.92,
    patches: null,
    crop: null,
    stooks: false,
    hay: true,
    weeds: 0,
  },
  haystacks: {
    texture: 'grass',
    tint: [1.06, 1.06, 0.86],
    alpha: 0.85,
    patches: null,
    crop: null,
    stooks: false,
    hay: true,
    weeds: 0,
  },
  // zarůstající příloh (fields.md – Zarůstání): obtisk pole zmizí (alfa 0 – nekreslí se), zůstane
  // tráva louky z terénu; keře a stromky kreslí wild-growth-renderer.ts
  shrubs: {
    texture: 'grass',
    tint: [1, 1, 1],
    alpha: 0,
    patches: null,
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0,
  },
  'young-forest': {
    texture: 'grass',
    tint: [1, 1, 1],
    alpha: 0,
    patches: null,
    crop: null,
    stooks: false,
    hay: false,
    weeds: 0,
  },
};

/** Zarůstá díl křovinami nebo mladým lesem – bez obtisku pole (fields.md – Zarůstání)? */
export function isWildStage(stage: string): boolean {
  return stage === 'shrubs' || stage === 'young-forest';
}

/**
 * Luštěniny (hrách a čočka – fields.md, Luštěniny) vypadají jinak než obilí: nízké polehlé
 * trsy hrachu (zelené kvetou, zralé žlutohnědé), porost shora do modrozelené a zralý do hněda,
 * po sklizni (rostliny se vytrhají) skoro holá zem s pár zbytky a místo panáků hromádky.
 */
const LEGUME_STYLES: Partial<Record<FieldLook, Partial<LookStyle>>> = {
  sprouted: { crop: { kind: 'sprout', height: 0.2, width: 0.75, density: 0.7 } },
  green: {
    tint: [0.36, 0.55, 0.36],
    crop: { kind: 'pea-green', height: 0.6, width: 1.25, density: 1 },
  },
  ripe: {
    tint: [0.66, 0.56, 0.36],
    crop: { kind: 'pea-ripe', height: 0.52, width: 1.2, density: 1 },
  },
  harvesting: {
    tint: [0.96, 0.86, 0.72],
    crop: { kind: 'stubble', height: 0.07, width: 0.4, density: 0.12 },
  },
  stubble: {
    tint: [0.94, 0.84, 0.7],
    crop: { kind: 'stubble', height: 0.07, width: 0.4, density: 0.12 },
  },
};

/** Vzhled dílu podle plodiny – luštěniny mají vlastní trsy a tón, jinak LOOK_STYLES. */
export function lookStyle(look: FieldLook, crop?: FieldCrop): LookStyle {
  const base = LOOK_STYLES[look];
  const legume = crop === 'legume' ? LEGUME_STYLES[look] : undefined;
  return legume ? { ...base, ...legume } : base;
}

/** Čtverec dílu s plodinou (`SceneFieldPart.crop`). */
export type CropSquare = CellSquare & { readonly crop?: FieldCrop };

/**
 * Část klíče změn pole (field-renderer.ts) za vzhled dílů: vzhled, rozpracovanost po pruzích,
 * vzhled zbytku, vytyčení, plodina a orba rádlem (kulaté rohy) – pole se přestaví, jen když se
 * některé z nich změní.
 */
export function partViewsKey(views: readonly PartView[]): unknown[] {
  return views.map((v) => [
    v.look,
    v.work === null ? null : workSteps(v.work),
    v.before,
    v.staked,
    v.part.crop ?? null,
    v.part.ploughed ?? false,
  ]);
}

/** Kus obtisku: obdélník ve světě se vzhledem (celý díl, nebo jeho hotová či nehotová část). */
export interface DecalPiece {
  part: CropSquare;
  bounds: Bounds;
  look: FieldLook;
}

/** Rozteč řádků obilí (m) a trsů v řádku (m), odstup trsů od meze (krytí obtisku). */
export const ROW_M = 0.8;
export const STEP_M = 0.7;
/** Rozestup panáků podél řádků a napříč (m); hromádky hrachu jsou menší a hustší. */
const STOOK_SPACING_M = { along: 6, across: 4.8 } as const;
const HEAP_SPACING_M = { along: 4.2, across: 3.6 } as const;

/** Rozsah `w` (0–1) jako obdélník ve světě – díl je čtverec v osách. */
function workRect(part: CellSquare, frame: WorkFrame, from: number, to: number): Bounds {
  const { across, along, half } = frame;
  const corners: Point[] = [];
  for (const w of [from, to]) {
    const v = -half + w * 2 * half;
    for (const u of [-half, half]) {
      corners.push([part.x + across[0] * v + along[0] * u, part.z + across[1] * v + along[1] * u]);
    }
  }
  return {
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minZ: Math.min(...corners.map((c) => c[1])),
    maxZ: Math.max(...corners.map((c) => c[1])),
  };
}

/**
 * Kusy obtisku pole: celý díl podle vzhledu, rozpracovaný díl rozdělený napříč řádky na hotovou
 * a nehotovou část (po pruzích sítě obtisku). Díl bez vzhledu (vytyčený) a nehotová část bez
 * vzhledu (louka před zakládáním) se nekreslí.
 */
export function decalPieces(
  views: readonly PartView[],
  rows: readonly [number, number],
  center: { x: number; z: number },
): DecalPiece[] {
  const pieces: DecalPiece[] = [];
  for (const view of views) {
    const part = view.part;
    const half = part.size / 2;
    const whole: Bounds = {
      minX: part.x - half,
      maxX: part.x + half,
      minZ: part.z - half,
      maxZ: part.z + half,
    };
    if (view.work === null) {
      if (view.look) pieces.push({ part, bounds: whole, look: view.look });
      continue;
    }
    const frame = workFrame(part, rows, center);
    const done = workSteps(view.work);
    if (view.look && done > 0) {
      pieces.push({ part, bounds: workRect(part, frame, 0, done), look: view.look });
    }
    if (view.before && done < 1) {
      pieces.push({ part, bounds: workRect(part, frame, done, 1), look: view.before });
    }
  }
  return pieces;
}

/** Rostlina nebo rekvizita v instanci: poloha, natočení, šířka a výška (m), odstín, pořadí. */
export interface PlantInstance {
  x: number;
  z: number;
  rotation: number;
  width: number;
  height: number;
  /** Násobek jasu 0,85–1,1 – trs od trsu trochu jiný. */
  shade: number;
  /** Náhodné pořadí 0–1 – z dálky se kreslí jen trsy s nižším pořadím (řídnou rovnoměrně). */
  rank: number;
}

export interface FieldPlants {
  crops: Record<CropKind, PlantInstance[]>;
  stooks: PlantInstance[];
  /** Hromádky vytrhaného hrachu na sklizené části luštěnin (uzel pea-heap v crops.glb). */
  heaps: PlantInstance[];
  weeds: PlantInstance[];
  /** Kupky a stohy sena (model stohu, velikost ve `width`). */
  hay: PlantInstance[];
}

/** Prázdné instance trsů po druzích. */
export function emptyCrops(): Record<CropKind, PlantInstance[]> {
  return {
    green: [],
    ripe: [],
    sprout: [],
    stubble: [],
    'pea-green': [],
    'pea-ripe': [],
  };
}

/** Semínko náhody pro políčko (a druh věci na něm). */
function cellSeed(part: CellSquare, salt: number): number {
  return (Math.imul(part.cell.x, 73856093) ^ Math.imul(part.cell.y, 19349663) ^ salt) >>> 0;
}

/**
 * Trsy obilí, panáky, plevel a seno všech dílů pole. Trsy stojí v řádcích podél `rows` (ROW_M od
 * sebe, v řádku po STEP_M s rozptylem), u meze řídnou podle krytí obtisku `coverage`. Na
 * rozpracovaném dílu má hotová část (po pruzích jako obtisk) trsy podle `look`, zbytek podle
 * `before`; panáky stojí jen na sklizené části, kus za čarou žně.
 */
export function fieldPlants(
  views: readonly PartView[],
  rows: readonly [number, number],
  center: { x: number; z: number },
  coverage: (x: number, z: number) => number,
  dayOfYear = 196,
): FieldPlants {
  const plants: FieldPlants = {
    crops: emptyCrops(),
    stooks: [],
    heaps: [],
    weeds: [],
    hay: [],
  };
  // seno jen na celých posečených dílech (na rozpracovaném se ještě seče)
  const hayParts = views.filter((v) => v.look && LOOK_STYLES[v.look].hay && v.work === null);
  plants.hay.push(
    ...hayOnSquares(
      hayParts.map((v) => v.part),
      hayPhase(dayOfYear),
      dayOfYear,
    ),
  );
  for (const view of views) {
    if (!view.look && !view.before) continue;
    const part = view.part;
    const frame = workFrame(part, rows, center);
    const done = view.work === null ? 1 : workSteps(view.work);
    const lookAt = (w: number): FieldLook | null =>
      view.work === null ? view.look : w < done ? view.look : view.before;
    addCrops(plants, part, frame, lookAt, coverage);
    addStooks(plants, part, frame, lookAt, done, view.work !== null, coverage);
    addWeeds(plants, part, frame, lookAt, coverage);
  }
  return plants;
}

function addCrops(
  plants: FieldPlants,
  part: CropSquare,
  frame: WorkFrame,
  lookAt: (w: number) => FieldLook | null,
  coverage: (x: number, z: number) => number,
): void {
  const random = seededRandom(cellSeed(part, 0x9e37));
  const { along, across, half } = frame;
  const rowCount = Math.floor((2 * half) / ROW_M);
  const stepCount = Math.floor((2 * half) / STEP_M);
  // řádky začínají půl rozteče od kraje – sousední díly na sebe navazují bez mezery
  for (let r = 0; r < rowCount; r++) {
    const v = -half + (r + 0.5) * ((2 * half) / rowCount);
    for (let s = 0; s < stepCount; s++) {
      const jitterU = (random() - 0.5) * STEP_M * 0.6;
      const jitterV = (random() - 0.5) * ROW_M * 0.25;
      const u = -half + (s + 0.5) * ((2 * half) / stepCount) + jitterU;
      const x = part.x + along[0] * u + across[0] * (v + jitterV);
      const z = part.z + along[1] * u + across[1] * (v + jitterV);
      const pick = random();
      const rotation = random() * Math.PI * 2;
      const size = 0.88 + random() * 0.24;
      const shade = 0.86 + random() * 0.22;
      const rank = random();
      const look = lookAt(workAt(frame, part, x, z));
      const crop = look ? lookStyle(look, part.crop).crop : null;
      if (!crop) continue;
      // u meze trsy řídnou s obtiskem – okraj pole je měkký
      const edge = smoothstep(0.15, 0.85, coverage(x, z));
      if (pick >= crop.density * edge) continue;
      plants.crops[crop.kind].push({
        x,
        z,
        rotation,
        width: crop.width * size,
        height: crop.height * size,
        shade,
        rank,
      });
    }
  }
}

function addStooks(
  plants: FieldPlants,
  part: CropSquare,
  frame: WorkFrame,
  lookAt: (w: number) => FieldLook | null,
  done: number,
  split: boolean,
  coverage: (x: number, z: number) => number,
): void {
  const random = seededRandom(cellSeed(part, 0x51ed));
  const { along, across, half } = frame;
  const size = 2 * half;
  // luštěniny se vytrhají a suší v hromádkách, obilí se váže do snopů a staví do panáků
  const legume = part.crop === 'legume';
  const spacing = legume ? HEAP_SPACING_M : STOOK_SPACING_M;
  const target = legume ? plants.heaps : plants.stooks;
  const rowsAcross = Math.max(1, Math.round(size / spacing.across));
  const perRow = Math.max(1, Math.round(size / spacing.along));
  for (let r = 0; r < rowsAcross; r++) {
    const w = (r + 0.5) / rowsAcross;
    // panák stojí až kus za čarou žně – snopy se vážou za ženci
    if (split && w > done - 0.08) continue;
    for (let s = 0; s < perRow; s++) {
      const u = -half + ((s + 0.5) / perRow) * size + (random() - 0.5) * 1.6;
      const v = -half + w * size + (random() - 0.5) * 1.2;
      const x = part.x + along[0] * u + across[0] * v;
      const z = part.z + along[1] * u + across[1] * v;
      const rotation = random() * Math.PI * 2;
      // panák stylizovaně o čtvrtinu větší (jako postavy) – z kamery je pak vidět
      const scale = (0.92 + random() * 0.16) * 1.25;
      const rank = random();
      const look = lookAt(workAt(frame, part, x, z));
      if (!look || !LOOK_STYLES[look].stooks || coverage(x, z) < 0.6) continue;
      target.push({ x, z, rotation, width: scale, height: scale, shade: 1, rank });
    }
  }
}

function addWeeds(
  plants: FieldPlants,
  part: CellSquare,
  frame: WorkFrame,
  lookAt: (w: number) => FieldLook | null,
  coverage: (x: number, z: number) => number,
): void {
  const random = seededRandom(cellSeed(part, 0x7f4a));
  const area = part.size * part.size;
  const most = Math.max(...Object.values(LOOK_STYLES).map((s) => s.weeds));
  const count = Math.round(area * most);
  for (let i = 0; i < count; i++) {
    const x = part.x + (random() - 0.5) * part.size;
    const z = part.z + (random() - 0.5) * part.size;
    const pick = random();
    const rotation = random() * Math.PI * 2;
    const scale = 0.7 + random() * 0.6;
    const rank = random();
    const look = lookAt(workAt(frame, part, x, z));
    if (!look || coverage(x, z) < 0.5) continue;
    if (pick >= LOOK_STYLES[look].weeds / most) continue;
    plants.weeds.push({ x, z, rotation, width: scale, height: scale, shade: 1, rank });
  }
}

/** Kolík vytyčení: poloha a velikost (1 roh, menší po stranách a uvnitř). */
export interface Peg {
  x: number;
  z: number;
  scale: number;
}

/** Kolíky v rozích a po stranách obrysu, uvnitř drobnější na rozích nezačatých čtverců. */
const PEG_SCALE = { corner: 1, edge: 0.85, inner: 0.55 } as const;

/**
 * Vytyčení zakládaného pole (Martin: hned po zadání, aby bylo vidět, kde pole bude): provázek
 * po obrysu dílů, které se ještě zakládají, kolíky v jeho rozích a po každém čtverci a drobné
 * kolíky na rozích čtverců, na kterých se ještě nezačalo. Hotové díly vytyčení ztratí.
 */
export function fieldStaking(views: readonly PartView[]): { pegs: Peg[]; lines: Point[][] } {
  const staked = views.filter((v) => v.staked).map((v) => v.part);
  if (staked.length === 0) return { pegs: [], lines: [] };
  const lines = cellsBoundary(staked);
  const pegs = new Map<string, Peg>();
  const add = (x: number, z: number, scale: number): void => {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    const current = pegs.get(key);
    if (!current || current.scale < scale) pegs.set(key, { x, z, scale });
  };
  const size = staked[0]!.size;
  for (const line of lines) {
    const [a, b] = [line[0]!, line[line.length - 1]!];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(length / size));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const corner = k === 0 || k === steps;
      add(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        corner ? PEG_SCALE.corner : PEG_SCALE.edge,
      );
    }
  }
  for (const view of views) {
    if (!view.staked || view.look) continue;
    const { x, z, size: s } = view.part;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      add(x + (dx * s) / 2, z + (dz * s) / 2, PEG_SCALE.inner);
    }
  }
  return { pegs: [...pegs.values()], lines };
}

// Pevný šum skvrn a okraje pole (krajiny se liší polohou polí, ne šumem).
const noise = createNoise2D(seededRandom(0xf1e1d));

/** Skvrny 0–1 (≈ 7 m a ≈ 2,5 m) – plevel v úhoru, prošlapaná místa na pastvině. */
export function patchNoise(x: number, z: number): number {
  return 0.5 + 0.5 * (0.7 * noise(x / 7, z / 7) + 0.3 * noise(x / 2.5 + 17.3, z / 2.5 - 4.1));
}

/**
 * Krytí pole s měkkým a nepravidelným okrajem: uvnitř 1, k hranici čtverců klesá na 0 (venku 0);
 * v pásu okraje ho šum zvlní, ať mez není rovná čára jako pravítkem. S `rounding` mají díly orané
 * rádlem kulaté vnější rohy (field-cells.ts – `cellsCoverage`).
 */
export function raggedCoverage(
  squares: readonly CellSquare[],
  softM: number,
  rounding?: CornerRounding,
): (x: number, z: number) => number {
  const coverage = cellsCoverage(squares, softM, rounding);
  return (x, z) => {
    const c = coverage(x, z);
    if (c <= 0 || c >= 1) return c;
    const n = 0.5 + 0.5 * noise(x / 2.2 + 40.1, z / 2.2 - 7.7);
    return Math.min(1, Math.max(0, c + c * (1 - c) * (n - 0.5) * 1.8));
  };
}
