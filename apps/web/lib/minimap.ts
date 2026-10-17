import { buildRelief, SURFACE_CODES, type Landscape, type PartStage } from '@bohemia/game';
import { SUN_DIRECTION } from './scene/constants';
import { sampleTiles } from './scene/tile-at';

// Minimapa krajiny sídla (jako v 0 A.D.): pohled shora, sever (+z) nahoře. Čisté funkce –
// převod souřadnic a obrázek krajiny jako RGBA pixely, kreslí je komponenta Minimap.

type Rgb = readonly [number, number, number];

const COLORS = {
  water: [62, 104, 138],
  deepWater: [44, 78, 112],
  forest: [44, 76, 38],
  meadow: [118, 140, 72],
  rock: [138, 130, 116],
} as const satisfies Record<string, Rgb>;

/** Barvy dílů pole podle stadia – zakládané hnědé, oseté žlutozelené, přílohy zarůstají. */
export const PART_COLORS: Record<PartStage, Rgb> = {
  founding: [150, 112, 70],
  ready: [128, 92, 56],
  sown: [196, 176, 84],
  'young-fallow': [150, 150, 84],
  meadow: [134, 150, 82],
  'young-growth': [104, 128, 66],
  shrub: [84, 108, 56],
  forest: [56, 86, 46],
};

/** Hřbitov na minimapě – šedavá zeleň (mohylky v trávě, plot). */
export const CEMETERY_COLOR: Rgb = [150, 146, 112];

/** Strana krajiny v metrech. */
function extentM(l: Landscape): number {
  return l.size * l.cellSizeM;
}

/** Bod krajiny (m) → pixel minimapy o straně `sizePx` (sever nahoře). */
export function worldToMinimap(
  l: Landscape,
  x: number,
  z: number,
  sizePx: number,
): { x: number; y: number } {
  const extent = extentM(l);
  const half = extent / 2;
  return { x: ((x + half) / extent) * sizePx, y: (1 - (z + half) / extent) * sizePx };
}

/** Pixel minimapy → bod krajiny (m), oříznutý do krajiny. */
export function minimapToWorld(
  l: Landscape,
  px: number,
  py: number,
  sizePx: number,
): { x: number; z: number } {
  const extent = extentM(l);
  const half = extent / 2;
  const clamp = (v: number): number => Math.min(half, Math.max(-half, v));
  return {
    x: clamp((px / sizePx) * extent - half),
    z: clamp((1 - py / sizePx) * extent - half),
  };
}

function mix(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Obrázek krajiny pro minimapu (`sizePx` × `sizePx`, RGBA po řádcích shora): voda, les, louka,
 * skála podle sklonu a hřbetů jako ve scéně, stínování svahů podle slunce scény.
 */
export function minimapImage(l: Landscape, sizePx: number): Uint8ClampedArray {
  const relief = buildRelief(l);
  const extent = extentM(l);
  const half = extent / 2;
  const sunLength = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
  const data = new Uint8ClampedArray(sizePx * sizePx * 4);
  const surface = new Float32Array(l.size * l.size);
  for (let i = 0; i < surface.length; i++)
    surface[i] = l.surface[i] === SURFACE_CODES.water ? 1 : 0;
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      const x = ((px + 0.5) / sizePx) * extent - half;
      const z = (1 - (py + 0.5) / sizePx) * extent - half;
      const tx = Math.min(l.size - 1, Math.floor((x + half) / l.cellSizeM));
      const ty = Math.min(l.size - 1, Math.floor((z + half) / l.cellSizeM));
      const code = l.surface[ty * l.size + tx];
      let color: [number, number, number];
      if (code === SURFACE_CODES.water) {
        // u břehu světlejší voda, uprostřed tmavší
        const wet = sampleTiles(l, surface, x, z);
        color = mix(COLORS.water, COLORS.deepWater, Math.min(1, Math.max(0, wet * 2 - 1)));
      } else {
        const base = code === SURFACE_CODES.forest ? COLORS.forest : COLORS.meadow;
        color = mix(base, COLORS.rock, relief.rockinessAt(x, z) * 0.85);
        // svah ke slunci světlejší, odvrácený tmavší
        const light = 1 + Math.max(-0.35, Math.min(0.35, relief.sunwardAt(x, z) * 3 * sunLength));
        color = [color[0] * light, color[1] * light, color[2] * light];
      }
      const o = (py * sizePx + px) * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = 255;
    }
  }
  return data;
}
