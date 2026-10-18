// Rozestavění staveb na vývojové stránce /dev/buildings – bez Babylonu (smí i do stránky).
// Jen pro prohlídku modelů: řemesla zatím nemají herní pravidla ani místo ve hře. Za řadou
// staveb pole, hřbitov a sad po čtvercích – jejich fáze podle průběhu stavby (showcaseGrounds).
import { CEMETERY, PLOT_VARIANTS, type PlotVariant, type TileCell } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { CEMETERY_PHASES } from './cemetery-layout';
import { plotHouse } from './homestead-layout';
import { TREE_GROWTH_YEARS, treeGrowth } from './orchard-layout';
import type { ConstructionKind } from './village-construction';

/**
 * Milíř stojí „kus od“ uhlířovy zemnice: odstup v souřadnicích modelu ve scéně (x napříč,
 * z k vchodu) ≈ 9,5 m, doporučeně 8–12 m. Totéž je v `tools/blender/crafts.py` jako
 * MILIR_OFFSET v souřadnicích Blenderu (tam s opačnými znaménky, vchod míří do −y).
 */
export const MILIR_OFFSET_M = { x: -9, z: 3 } as const;

export interface ShowcaseModel {
  /** Druh stavby – fáze staveniště a jáma (village-construction.ts). */
  kind: ConstructionKind;
  /** Cesta k hotovému modelu v `public/`. */
  url: string;
  x: number;
  z: number;
  /** Natočení kolem svislé osy (rad) – jako `Position.rotation`. */
  rotation: number;
  /** Pozemek polozemnice – políčko (střed, strana) a varianta, kde na něm dům stojí. */
  plot?: { x: number; z: number; size: number; variant: PlotVariant };
}

export interface ShowcaseBuilding {
  id: string;
  label: string;
  models: ShowcaseModel[];
  /** Kam se po výběru podívá kamera (cíl a vzdálenost). */
  focus: { x: number; z: number; radius: number };
}

/** Vchod (+z modelu) ke kameře, která na začátku stojí na −z. */
const FACING = Math.PI;

/** Bod v souřadnicích modelu → svět (jako `localToWorld` ve village-layout.ts). */
function offset(
  x: number,
  z: number,
  rotation: number,
  local: { x: number; z: number },
): { x: number; z: number } {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return { x: x + local.x * c + local.z * s, z: z - local.x * s + local.z * c };
}

function building(id: string, label: string, kind: ConstructionKind, x: number): ShowcaseBuilding {
  const folder = kind === 'zemnice' || kind === 'polozemnice' ? 'dwellings' : 'crafts';
  return {
    id,
    label,
    models: [{ kind, url: `/models/${folder}/${kind}.glb`, x, z: 0, rotation: FACING }],
    focus: { x, z: -1.5, radius: 18 },
  };
}

/** Polozemnice na pozemku 15 × 15 m (jako políčko pole) – dům podle varianty. */
function plotModel(x: number, z: number, variant: PlotVariant): ShowcaseModel {
  const plot = { x, z, size: 15, variant };
  const house = plotHouse(plot, variant);
  return {
    kind: 'polozemnice',
    url: '/models/dwellings/polozemnice.glb',
    x: house.x,
    z: house.z,
    rotation: house.rotation,
    plot,
  };
}

const UHLIR_X = 26;
const milir = offset(UHLIR_X, 0, FACING, MILIR_OFFSET_M);
/** Řada pěti variant pozemku polozemnice před stavbami (z) a rozestup středů (m). */
const VARIANTS_Z = -26;
const VARIANTS_STEP = 17;

export const SHOWCASE_BUILDINGS: readonly ShowcaseBuilding[] = [
  building('zemnice', 'Zemnice', 'zemnice', -27),
  {
    id: 'polozemnice',
    label: 'Polozemnice',
    models: [plotModel(-14, 0, 'center')],
    focus: { x: -14, z: -1.5, radius: 24 },
  },
  building('hrncir', 'Hrnčíř', 'hrncir', -1),
  building('kovar', 'Kovář', 'kovar', 12),
  {
    id: 'uhlir',
    label: 'Uhlíř + milíř',
    models: [
      { kind: 'uhlir', url: '/models/crafts/uhlir.glb', x: UHLIR_X, z: 0, rotation: FACING },
      { kind: 'milir', url: '/models/crafts/milir.glb', x: milir.x, z: milir.z, rotation: 0 },
    ],
    focus: { x: (UHLIR_X + milir.x) / 2, z: -1.5, radius: 26 },
  },
  {
    id: 'pozemky',
    label: 'Pozemky (5 variant)',
    models: PLOT_VARIANTS.map((variant, i) =>
      plotModel((i - (PLOT_VARIANTS.length - 1) / 2) * VARIANTS_STEP, VARIANTS_Z, variant),
    ),
    focus: { x: 0, z: VARIANTS_Z, radius: 62 },
  },
];

// --- Pole, hřbitov a sad (stavby po čtvercích) ---

/** Strana čtverce (m) – jako políčko krajiny. */
const SQUARE_M = 15;
/** Roh čtverce (0, 0) – za řadou staveb, aby pole, hřbitov a sad nic nezakrývaly. */
const GROUND_ORIGIN = { x: -55, z: 18 };

export type ShowcaseGroundId = 'field' | 'cemetery' | 'orchard';

export interface ShowcaseGround {
  id: ShowcaseGroundId;
  label: string;
  /** Čtverce jako políčka (x, y) se středem ve světě a stranou – jako SceneVillage. */
  squares: { cell: TileCell; x: number; z: number; size: number }[];
  focus: { x: number; z: number; radius: number };
}

function ground(
  id: ShowcaseGroundId,
  label: string,
  x0: number,
  y0: number,
  width: number,
  height: number,
): ShowcaseGround {
  const squares = Array.from({ length: width * height }, (_, i) => {
    const cell = { x: x0 + (i % width), y: y0 + Math.floor(i / width) };
    return {
      cell,
      x: GROUND_ORIGIN.x + (cell.x + 0.5) * SQUARE_M,
      z: GROUND_ORIGIN.z + (cell.y + 0.5) * SQUARE_M,
      size: SQUARE_M,
    };
  });
  return {
    id,
    label,
    squares,
    focus: {
      x: GROUND_ORIGIN.x + (x0 + width / 2) * SQUARE_M,
      z: GROUND_ORIGIN.z + (y0 + height / 2) * SQUARE_M - 4,
      radius: Math.max(width, height) * SQUARE_M + 18,
    },
  };
}

export const SHOWCASE_GROUNDS: readonly ShowcaseGround[] = [
  ground('field', 'Pole', 0, 0, 3, 2),
  ground('cemetery', 'Hřbitov', 4, 0, 2, 1),
  ground('orchard', 'Sad', 7, 0, 2, 2),
];

/** Fáze stavby po čtvercích pro lištu (průběh 0–1, navazují na sebe). */
export interface ShowcasePhase {
  label: string;
  from: number;
  to: number;
}

/**
 * Pole: zakládání (drn se rozrývá, hotové čtverce se zbarví), připravené pole s brázdami, osev
 * po čtvercích – to je ve hře; pak růst obilí, zralé obilí a strniště jen jako náhled (`CropLook`).
 */
export const FIELD_SHOWCASE_PHASES: readonly ShowcasePhase[] = [
  { label: 'zakládání – drn se rozrývá po čtvercích', from: 0, to: 0.34 },
  { label: 'připravené pole – brázdy', from: 0.34, to: 0.46 },
  { label: 'osev po čtvercích – vzchází obilí', from: 0.46, to: 0.6 },
  { label: 'zelené obilí (ve hře zatím ne)', from: 0.6, to: 0.76 },
  { label: 'zralé obilí (ve hře zatím ne)', from: 0.76, to: 0.9 },
  { label: 'strniště po sklizni (ve hře zatím ne)', from: 0.9, to: 1 },
];
/** Hřbitov: do poloviny založení (fáze `CEMETERY_PHASES`), pak přibývají hroby. */
const CEMETERY_FOUNDED_AT = 0.5;
/** Sad: vytyčení, kůly, sazenice (výsadba jako ve hře), mladé stromky rostou, plodící sad. */
export const ORCHARD_SHOWCASE_PHASES: readonly ShowcasePhase[] = [
  { label: 'vytyčení – čára kolem sadu', from: 0, to: 0.06 },
  { label: 'zatloukání kůlů', from: 0.06, to: 0.26 },
  { label: 'sázení stromků ke kůlům', from: 0.26, to: 0.45 },
  { label: 'mladé stromky rostou', from: 0.45, to: 0.9 },
  { label: 'dospělý sad s jablky', from: 0.9, to: 1 },
];

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

function phaseAt(phases: readonly ShowcasePhase[], p: number): ShowcasePhase {
  return phases.find((phase) => p < phase.to) ?? phases[phases.length - 1]!;
}

type ScenePart = SceneVillage['fields'][number]['parts'][number];

/** Díl pole při průběhu: čtverce se zakládají, osévají a dozrávají po řadě. */
function fieldPart(index: number, count: number, p: number): Pick<ScenePart, 'stage' | 'crop'> {
  const [founding, ready, sowing, growing, ripe] = FIELD_SHOWCASE_PHASES as [
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
  ];
  if (p < ready.from) {
    const done = founding.from + ((founding.to - founding.from) * (index + 1)) / (count + 1);
    return { stage: p >= done ? 'ready' : 'founding' };
  }
  if (p < sowing.from) return { stage: 'ready' };
  if (p < sowing.to) {
    const sown = sowing.from + ((sowing.to - sowing.from) * index) / count;
    return { stage: p >= sown ? 'sown' : 'ready' };
  }
  if (p < growing.to) return { stage: 'sown', crop: 'growing' };
  if (p < ripe.to) return { stage: 'sown', crop: 'ripe' };
  return { stage: 'sown', crop: 'stubble' };
}

/**
 * Pole, hřbitov a sad na vývojové stránce při průběhu `progress` (0–1): ves pro scénu
 * (`VillageRenderer` – kreslí je stejně jako ve hře) a popisek fáze každého z nich.
 */
export function showcaseGrounds(progress: number): {
  village: SceneVillage;
  labels: Record<ShowcaseGroundId, string>;
} {
  const p = Math.min(1, Math.max(0, progress));
  const of = (id: ShowcaseGroundId): ShowcaseGround => SHOWCASE_GROUNDS.find((g) => g.id === id)!;

  const field = of('field').squares;
  const parts = field.map((square, i) => ({ ...square, ...fieldPart(i, field.length, p) }));

  const cemetery = of('cemetery').squares;
  const capacity = cemetery.length * CEMETERY.gravesPerSquare;
  const founding = ramp(p, 0, CEMETERY_FOUNDED_AT);
  const built = p >= CEMETERY_FOUNDED_AT;
  const graves = built ? Math.round(capacity * ramp(p, CEMETERY_FOUNDED_AT, 1)) : 0;
  const cemeteryLabel = built
    ? p >= 1
      ? `plný hřbitov – ${capacity} hrobů`
      : `pohřby – mohylky přibývají (${graves} z ${capacity})`
    : (CEMETERY_PHASES.find((phase) => founding < phase.to)?.label ?? '');

  const [, staking, planting, growing, bearing] = ORCHARD_SHOWCASE_PHASES as [
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
  ];
  const plantingShare =
    0.5 * ramp(p, staking.from, staking.to) + 0.5 * ramp(p, planting.from, planting.to);
  const age = TREE_GROWTH_YEARS * ramp(p, growing.from, growing.to);
  const planted = p >= growing.from;
  const growth = planted ? Math.round(treeGrowth(age) * 100) / 100 : 0;
  const fruit = p >= bearing.from;
  const orchardPhase = phaseAt(ORCHARD_SHOWCASE_PHASES, p);
  const orchardLabel =
    orchardPhase === growing
      ? `${growing.label} – ${Math.min(TREE_GROWTH_YEARS, Math.floor(age) + 1)}. rok`
      : orchardPhase.label;

  return {
    village: {
      dwellings: [],
      fields: [{ id: 1, parts }],
      cemeteries: [{ id: 1, squares: cemetery, built, progress: built ? 1 : founding, graves }],
      orchards: [
        {
          id: 1,
          squares: of('orchard').squares.map((square) => ({
            ...square,
            planting: planted ? 1 : plantingShare,
            growth,
            fruit,
          })),
        },
      ],
    },
    labels: {
      field: phaseAt(FIELD_SHOWCASE_PHASES, p).label,
      cemetery: cemeteryLabel,
      orchard: orchardLabel,
    },
  };
}
