// Rozestavění staveb na vývojové stránce /dev/buildings – bez Babylonu (smí i do stránky).
// Jen pro prohlídku modelů: řemesla zatím nemají herní pravidla ani místo ve hře.
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
