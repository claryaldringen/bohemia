import {
  buildRelief,
  DWELLING_FOOTPRINT_M,
  SACRED_BUILDINGS,
  SURFACE_CODES,
  type FieldSurface,
  type Landscape,
  type PartStage,
} from '@bohemia/game';
import type { SceneSacred, SceneVillage } from './village-view';
import { CLEARED_SHARE, type ClearedForest } from './scene/cleared-forest';
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
  /** Paseka – vykácený les s pařezy, o něco tmavší a hnědší než louka. */
  clearing: [112, 124, 66],
  rock: [138, 130, 116],
} as const satisfies Record<string, Rgb>;

/**
 * Barvy dílů pole podle stadia – zakládané hnědé, oseté žlutozelené, příloh jako pastvina,
 * zarůstající příloh tmavne ke křovinám a k lesu (fields.md – Zarůstání).
 */
export const PART_COLORS: Record<PartStage, Rgb> = {
  founding: [150, 112, 70],
  ready: [128, 92, 56],
  sown: [196, 176, 84],
  'young-fallow': [150, 150, 84],
  meadow: [134, 150, 82],
  shrubs: [96, 116, 60],
  'young-forest': [66, 96, 48],
};

/** Les vsi na minimapě – jako les krajiny (fields.md – Les vsi). */
export const WOOD_COLOR: Rgb = COLORS.forest;

/** Povrch, na kterém se díl pole zakládal (panel pole) – louka, křoviny, les jako na minimapě. */
export const SURFACE_COLORS: Record<FieldSurface, Rgb> = {
  meadow: COLORS.meadow,
  shrub: [84, 108, 56],
  forest: COLORS.forest,
};

/** Hřbitov na minimapě – šedavá zeleň (mohylky v trávě, plot). */
export const CEMETERY_COLOR: Rgb = [150, 146, 112];

/** Sad na minimapě – sytá zeleň korun jabloní, tmavší než louka a světlejší než les. */
export const ORCHARD_COLOR: Rgb = [78, 118, 52];

/** Posvátná místa na minimapě – teplá okrová (obětiny, oheň), dobře odlišená od zeleně. */
export const SACRED_COLOR: Rgb = [232, 164, 64];

/** Značka posvátného místa na minimapě v px: čtverec háje, bod dubu, půdorys modly a svatyně. */
export type SacredMark =
  | { kind: 'square'; x: number; y: number; size: number }
  | { kind: 'dot'; x: number; y: number; radius: number }
  | { kind: 'footprint'; x: number; y: number; size: number; built: boolean };

/**
 * Značky posvátných míst pro minimapu o straně `sizePx`: čtverce hájů (průsvitně), posvátné duby
 * jako tečky a modly a svatyně jako čtverečky podle půdorysu (aspoň 3,5 px).
 */
export function sacredMinimapMarks(
  l: Landscape,
  sacred: SceneSacred | undefined,
  sizePx: number,
): SacredMark[] {
  if (!sacred) return [];
  const pxPerM = sizePx / (l.size * l.cellSizeM);
  const marks: SacredMark[] = [];
  for (const grove of sacred.groves) {
    for (const square of grove.squares) {
      const p = worldToMinimap(l, square.x, square.z, sizePx);
      marks.push({ kind: 'square', x: p.x, y: p.y, size: square.size * pxPerM });
    }
  }
  for (const oak of sacred.oaks) {
    const p = worldToMinimap(l, oak.x, oak.z, sizePx);
    marks.push({ kind: 'dot', x: p.x, y: p.y, radius: 1.8 });
  }
  for (const b of sacred.buildings) {
    const p = worldToMinimap(l, b.position.x, b.position.z, sizePx);
    const size = Math.max(3.5, SACRED_BUILDINGS[b.kind].footprintM * pxPerM);
    marks.push({ kind: 'footprint', x: p.x, y: p.y, size, built: b.built });
  }
  return marks;
}

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
 * skála podle sklonu a hřbetů jako ve scéně, stínování svahů podle slunce scény. Les, který ves
 * vykácela nebo vymýtila (`cleared`), řídne do barvy paseky – vymýcené políčko je celé paseka.
 */
export function minimapImage(
  l: Landscape,
  sizePx: number,
  cleared: ClearedForest | null = null,
): Uint8ClampedArray {
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
      const tile = ty * l.size + tx;
      const code = l.surface[tile];
      let color: [number, number, number];
      if (code === SURFACE_CODES.water) {
        // u břehu světlejší voda, uprostřed tmavší
        const wet = sampleTiles(l, surface, x, z);
        color = mix(COLORS.water, COLORS.deepWater, Math.min(1, Math.max(0, wet * 2 - 1)));
      } else {
        const thinned = cleared ? Math.min(1, cleared.share[tile]! / CLEARED_SHARE) : 0;
        const base =
          code !== SURFACE_CODES.forest
            ? COLORS.meadow
            : thinned > 0
              ? mix(COLORS.forest, COLORS.clearing, thinned)
              : COLORS.forest;
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

/** Co minimapa kreslí na plátno (podmnožina CanvasRenderingContext2D – testy). */
export type MinimapContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'arc'
  | 'fill'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'stroke'
>;

/**
 * Ves na minimapě (strana `sizePx`): les vsi, pole po čtvercích podle stadia, hřbitovy, sady,
 * posvátná místa a obydlí. Kreslí se jednou do vrstvy pod záběrem kamery – při pohybu kamery se
 * nepřekresluje (Minimap.tsx), jen při změně vsi.
 */
export function drawMinimapVillage(
  context: MinimapContext,
  landscape: Landscape,
  village: Pick<
    SceneVillage,
    'woods' | 'fields' | 'cemeteries' | 'orchards' | 'sacred' | 'dwellings'
  >,
  sizePx: number,
): void {
  const at = (x: number, z: number): { x: number; y: number } =>
    worldToMinimap(landscape, x, z, sizePx);
  const cellPx = (landscape.cellSizeM / (landscape.size * landscape.cellSizeM)) * sizePx;

  // les vsi – čtverce polí zarostlé lesem (fields.md – Les vsi)
  {
    const [r, g, b] = WOOD_COLOR;
    context.fillStyle = `rgb(${r} ${g} ${b})`;
    for (const wood of village.woods ?? []) {
      const p = at(wood.x, wood.z);
      context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
    }
  }
  // pole po čtvercích podle stadia dílů
  for (const field of village.fields) {
    for (const part of field.parts) {
      const [r, g, b] = PART_COLORS[part.stage];
      context.fillStyle = `rgb(${r} ${g} ${b})`;
      const p = at(part.x, part.z);
      context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
    }
  }
  // hřbitovy po čtvercích (zakládané průsvitné)
  for (const cemetery of village.cemeteries ?? []) {
    const [r, g, b] = CEMETERY_COLOR;
    context.fillStyle = `rgb(${r} ${g} ${b} / ${cemetery.built ? 1 : 0.55})`;
    for (const square of cemetery.squares) {
      const p = at(square.x, square.z);
      context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
    }
  }
  // sady po čtvercích (čtverce, které se ještě sázejí, průsvitné)
  for (const orchard of village.orchards ?? []) {
    const [r, g, b] = ORCHARD_COLOR;
    for (const square of orchard.squares) {
      context.fillStyle = `rgb(${r} ${g} ${b} / ${square.planting >= 1 ? 1 : 0.55})`;
      const p = at(square.x, square.z);
      context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
    }
  }
  // posvátná místa – okrové: háje průsvitně po čtvercích, duby tečkou, modly a svatyně půdorysem
  {
    const [r, g, b] = SACRED_COLOR;
    for (const mark of sacredMinimapMarks(landscape, village.sacred, sizePx)) {
      if (mark.kind === 'square') {
        context.fillStyle = `rgb(${r} ${g} ${b} / 0.45)`;
        const half = mark.size / 2;
        context.fillRect(mark.x - half, mark.y - half, mark.size + 0.3, mark.size + 0.3);
      } else if (mark.kind === 'dot') {
        context.fillStyle = `rgb(${r} ${g} ${b})`;
        context.beginPath();
        context.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = mark.built ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / 0.55)`;
        context.strokeStyle = '#2a1d10';
        context.lineWidth = 1;
        const half = mark.size / 2;
        context.fillRect(mark.x - half, mark.y - half, mark.size, mark.size);
        context.strokeRect(mark.x - half, mark.y - half, mark.size, mark.size);
      }
    }
  }
  // obydlí – světlé čtverečky (rozestavěná průsvitná), jako budovy hráče v 0 A.D.
  for (const dwelling of village.dwellings) {
    const p = at(dwelling.position.x, dwelling.position.z);
    const side = Math.max(
      3.5,
      (DWELLING_FOOTPRINT_M[dwelling.type].width / landscape.cellSizeM) * cellPx * 1.6,
    );
    context.fillStyle = dwelling.built ? '#f6e3b0' : 'rgb(246 227 176 / 0.55)';
    context.strokeStyle = '#2a1d10';
    context.lineWidth = 1;
    context.fillRect(p.x - side / 2, p.y - side / 2, side, side);
    context.strokeRect(p.x - side / 2, p.y - side / 2, side, side);
  }
}

/** Obrys záběru kamery na minimapě (4 rohy na zemi); bez záběru nic. */
export function drawMinimapView(
  context: MinimapContext,
  landscape: Landscape,
  view: { corners: readonly (readonly [number, number])[] } | null,
  sizePx: number,
): void {
  const at = (x: number, z: number): { x: number; y: number } =>
    worldToMinimap(landscape, x, z, sizePx);
  // záběr kamery
  if (view) {
    context.beginPath();
    view.corners.forEach(([x, z], i) => {
      const p = at(x, z);
      if (i === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.closePath();
    context.strokeStyle = 'rgb(255 255 255 / 0.9)';
    context.lineWidth = 1.25;
    context.stroke();
  }
}
