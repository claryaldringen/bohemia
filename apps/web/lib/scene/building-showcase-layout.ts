// Rozestavění staveb na vývojové stránce /dev/buildings – bez Babylonu (smí i do stránky).
// Jen pro prohlídku modelů: řemesla zatím nemají herní pravidla ani místo ve hře. Za řadou
// staveb pole, hřbitov, sad a louka na seno po čtvercích – jejich fáze podle průběhu stavby
// (showcaseGrounds).
import { CEMETERY, type TileCell } from '@bohemia/game';
import type { FieldLook, SceneFieldPart, SceneVillage } from '../village-view';
import { CEMETERY_PHASES } from './cemetery-layout';
import { hayPhase, meadowLook, type HayMeadow } from './hay-meadows';
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

const UHLIR_X = 26;
const milir = offset(UHLIR_X, 0, FACING, MILIR_OFFSET_M);

export const SHOWCASE_BUILDINGS: readonly ShowcaseBuilding[] = [
  building('zemnice', 'Zemnice', 'zemnice', -27),
  building('polozemnice', 'Polozemnice', 'polozemnice', -14),
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
];

// --- Pole, hřbitov a sad (stavby po čtvercích) ---

/** Strana čtverce (m) – jako políčko krajiny. */
const SQUARE_M = 15;
/** Roh čtverce (0, 0) – za řadou staveb, aby pole, hřbitov a sad nic nezakrývaly. */
const GROUND_ORIGIN = { x: -55, z: 18 };

export type ShowcaseGroundId = 'field' | 'cemetery' | 'orchard' | 'meadow';

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
  ground('meadow', 'Louka na seno', 10, 0, 3, 2),
];

/** Fáze stavby po čtvercích pro lištu (průběh 0–1, navazují na sebe). */
export interface ShowcasePhase {
  label: string;
  from: number;
  to: number;
}

/**
 * Pole přes všechny vzhledy (fields.md – Co hráč vidí): vytyčení kolíky a provázkem, zakládání,
 * orba a setí po čtvercích (práce jde po dílech, rozpracovaný je vždy jen jeden), vzcházející,
 * zelené a zralé obilí, žeň s panáky, strniště, mladý úhor a spasená pastvina.
 */
export const FIELD_SHOWCASE_PHASES: readonly (ShowcasePhase & {
  look: FieldLook | null;
  before?: FieldLook;
  /** Práce jde po čtvercích (rozpracovaný jeden), jinak celé pole naráz. */
  frontier?: boolean;
})[] = [
  { label: 'vytyčení – kolíky a provázek', from: 0, to: 0.05, look: null },
  {
    label: 'zakládání – drn se rozrývá po čtvercích',
    from: 0.05,
    to: 0.16,
    look: 'bare',
    frontier: true,
  },
  {
    label: 'kopání – brázdy po čtvercích',
    from: 0.16,
    to: 0.26,
    look: 'plowed',
    before: 'bare',
    frontier: true,
  },
  {
    label: 'setí po čtvercích',
    from: 0.26,
    to: 0.34,
    look: 'sown',
    before: 'plowed',
    frontier: true,
  },
  { label: 'vzchází obilí', from: 0.34, to: 0.41, look: 'sprouted' },
  { label: 'zelené obilí', from: 0.41, to: 0.48, look: 'green' },
  { label: 'zralé obilí', from: 0.48, to: 0.54, look: 'ripe' },
  {
    label: 'žeň po čtvercích – panáky',
    from: 0.54,
    to: 0.65,
    look: 'harvesting',
    before: 'ripe',
    frontier: true,
  },
  { label: 'strniště', from: 0.65, to: 0.71, look: 'stubble' },
  { label: 'mladý úhor – strniště a plevel, pase se', from: 0.71, to: 0.77, look: 'young-fallow' },
  { label: 'úhor se pase – pastvina', from: 0.77, to: 0.82, look: 'pasture' },
  { label: 'úhor – louka, roste tráva', from: 0.82, to: 0.86, look: 'meadow' },
  {
    label: 'seč po čtvercích – řádky sena',
    from: 0.86,
    to: 0.92,
    look: 'mown',
    before: 'meadow',
    frontier: true,
  },
  { label: 'seno v kupkách', from: 0.92, to: 0.95, look: 'mown' },
  { label: 'stohy – přes zimu se zkrmí', from: 0.95, to: 1, look: 'haystacks' },
]; /** Hřbitov: do poloviny založení (fáze `CEMETERY_PHASES`), pak přibývají hroby. */
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

function phaseAt<T extends ShowcasePhase>(phases: readonly T[], p: number): T {
  return phases.find((phase) => p < phase.to) ?? phases[phases.length - 1]!;
}

/**
 * Díl pole při průběhu: v rámci fáze jdou čtverce po řadě – hotové mají vzhled fáze,
 * rozpracovaný (jen jeden) i předchozí vzhled se svou rozpracovaností, ostatní čekají.
 */
function fieldPart(
  index: number,
  count: number,
  p: number,
): Omit<SceneFieldPart, 'cell' | 'x' | 'z' | 'size'> {
  const phase = phaseAt(FIELD_SHOWCASE_PHASES, p);
  const founding = phase.look === null || phase.look === 'bare';
  const stage = founding
    ? 'founding'
    : phase.look === 'young-fallow'
      ? 'young-fallow'
      : phase.look === 'pasture' ||
          phase.look === 'meadow' ||
          phase.look === 'mown' ||
          phase.look === 'haystacks'
        ? 'meadow'
        : 'sown';
  if (phase.look === null) return { id: index + 1, stage, look: 'bare', work: 0 };
  if (!phase.frontier) return { id: index + 1, stage, look: phase.look };
  const done = ramp(p, phase.from, phase.to) * count;
  const work = Math.min(1, Math.max(0, done - index));
  if (founding)
    return { id: index + 1, stage: work >= 1 ? 'ready' : 'founding', look: 'bare', work };
  return {
    id: index + 1,
    stage,
    look: phase.look,
    work,
    ...(phase.before ? { before: phase.before } : {}),
  };
}

/**
 * Den v roce pro seno na vývojové stránce (`VillageRenderer.setSeason`) – souběžně s fázemi
 * louky na poli: do jara tráva, pak seč (řádky sena), kupky a stohy přes podzim a zimu až do
 * března (zkrmují se). Louka na seno vedle pole jde stejně.
 */
export function showcaseMeadowDay(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const stops: [number, number][] = [
    [0.82, 120],
    [0.86, 150],
    [0.865, 156],
    [0.92, 178],
    [0.925, 181],
    [0.95, 192],
    [0.955, 194],
    [1, 430],
  ];
  if (p <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, d1] = stops[i]!;
    const [p0, d0] = stops[i - 1]!;
    if (p <= p1) {
      const day = Math.round(d0 + ((p - p0) / (p1 - p0)) * (d1 - d0));
      return day > 365 ? day - 365 : day;
    }
  }
  return 430 - 365;
}

/** Louka na seno vývojové stránky (čtverce ze SHOWCASE_GROUNDS). */
export function showcaseHayMeadows(): HayMeadow[] {
  const meadow = SHOWCASE_GROUNDS.find((g) => g.id === 'meadow')!;
  return [{ id: 1, squares: meadow.squares, rows: [1, 0] }];
}

/**
 * Pole, hřbitov, sad a louka na seno na vývojové stránce při průběhu `progress` (0–1): ves pro
 * scénu (`VillageRenderer` – kreslí je stejně jako ve hře) a popisek fáze každého z nich.
 */
export function showcaseGrounds(progress: number): {
  village: SceneVillage;
  labels: Record<ShowcaseGroundId, string>;
} {
  const p = Math.min(1, Math.max(0, progress));
  const of = (id: ShowcaseGroundId): ShowcaseGround => SHOWCASE_GROUNDS.find((g) => g.id === id)!;

  const field = of('field').squares;
  const parts = field.map((square, i) => ({ ...square, ...fieldPart(i, field.length, p) }));
  const hay = hayPhase(showcaseMeadowDay(p));
  const hayLabel = !hay
    ? 'louka (seče se v červnu)'
    : meadowLook(hay) === 'haystacks'
      ? 'stohy na otavě – přes zimu se zkrmí'
      : hay.hay === 'heaps'
        ? 'seno v kupkách'
        : `seč – řádky sena (${Math.round(hay.mown * 100)} %)`;

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
      meadow: hayLabel,
    },
  };
}
