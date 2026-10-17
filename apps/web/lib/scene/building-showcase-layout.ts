// Rozestavění staveb na vývojové stránce /dev/buildings – bez Babylonu (smí i do stránky).
// Jen pro prohlídku modelů: řemesla zatím nemají herní pravidla ani místo ve hře.
import type { DwellingType } from '@bohemia/game';

/**
 * Milíř stojí „kus od“ uhlířovy zemnice: odstup v souřadnicích modelu ve scéně (x napříč,
 * z k vchodu) ≈ 9,5 m, doporučeně 8–12 m. Totéž je v `tools/blender/crafts.py` jako
 * MILIR_OFFSET v souřadnicích Blenderu (tam s opačnými znaménky, vchod míří do −y).
 */
export const MILIR_OFFSET_M = { x: -9, z: 3 } as const;

export interface ShowcaseModel {
  /** Cesta k modelu v `public/`. */
  url: string;
  /** Jáma, kterou model potřebuje (kreslí ji scéna jako u obydlí), nebo null. */
  pit: DwellingType | null;
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

function building(
  id: string,
  label: string,
  file: string,
  pit: DwellingType,
  x: number,
): ShowcaseBuilding {
  return {
    id,
    label,
    models: [{ url: file, pit, x, z: 0, rotation: FACING }],
    focus: { x, z: -1.5, radius: 18 },
  };
}

const UHLIR_X = 26;
const milir = offset(UHLIR_X, 0, FACING, MILIR_OFFSET_M);

export const SHOWCASE_BUILDINGS: readonly ShowcaseBuilding[] = [
  building('zemnice', 'Zemnice', '/models/dwellings/zemnice.glb', 'zemnice', -27),
  building('polozemnice', 'Polozemnice', '/models/dwellings/polozemnice.glb', 'polozemnice', -14),
  building('hrncir', 'Hrnčíř', '/models/crafts/hrncir.glb', 'polozemnice', -1),
  building('kovar', 'Kovář', '/models/crafts/kovar.glb', 'polozemnice', 12),
  {
    id: 'uhlir',
    label: 'Uhlíř + milíř',
    models: [
      { url: '/models/crafts/uhlir.glb', pit: 'zemnice', x: UHLIR_X, z: 0, rotation: FACING },
      { url: '/models/crafts/milir.glb', pit: null, x: milir.x, z: milir.z, rotation: 0 },
    ],
    focus: { x: (UHLIR_X + milir.x) / 2, z: -1.5, radius: 26 },
  },
];
