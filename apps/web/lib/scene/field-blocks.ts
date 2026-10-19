import {
  CROP_KINDS,
  decalPieces,
  emptyCrops,
  fieldPlants,
  lookStyle,
  patchNoise,
  type FieldPlants,
  type FieldTexture,
} from './field-crops';
import { emptyCanopy, fieldCanopy, mergeCanopies, type CanopyMesh } from './field-canopy';
import type { PartView } from './field-look';
import { hayPhase } from './hay-meadows';
import { decalGrid, type DecalGrid } from './village-layout';

/**
 * Pole po blocích dílů (field-renderer.ts) – čisté funkce bez Babylonu. Obtisky a trsy dílu
 * závisí jen na dílu, krytí okraje a směru řádků (rozmístění je deterministické po políčkách),
 * takže pole jde přestavět jen v blocích, které se změnily (postup práce, žeň po čtvercích),
 * a hotové bloky jen znovu spojit – výsledek je stejný jako při přestavbě celého pole.
 */

/** Strana bloku v dílech (políčkách krajiny): 8 × 8 dílů = 120 × 120 m. */
export const FIELD_BLOCK = 8;
/** Bodů sítě obtisku na stranu čtverce – 8 na 15 m sedí na síť terénu (village-renderer.ts). */
export const GRID_PER_CELL = 8;

/** Obtisky jedné textury (podklad nebo skvrny) – sítě kusů dílů s barvou a průhledností. */
export interface DecalLayer {
  texture: FieldTexture;
  patches: boolean;
  grids: DecalGrid[];
  colors: (readonly [number, number, number])[];
  alphas: number[];
}

/** Obtisky a rostliny bloku dílů. */
export interface FieldBlockContent {
  /** Obtisky po texturách (klíč `textura|skvrny`). */
  layers: Map<string, DecalLayer>;
  /** Řádky posečeného sena (jen v době sušení). */
  swaths: DecalGrid[];
  /** Rostliny po dílech (klíč políčka – `cellKey`). */
  plants: Map<string, FieldPlants>;
  /** Koruna porostu zeleného a zralého obilí (field-canopy.ts). */
  canopy: CanopyMesh;
}

/** Obtisky a rostliny celého pole. */
export interface FieldContent {
  layers: Map<string, DecalLayer>;
  swaths: DecalGrid[];
  plants: FieldPlants;
  canopy: CanopyMesh;
}

/**
 * Přidá všechny prvky `source` na konec `target` (mutuje `target`). Ne `push(...source)` – velké
 * pole (desítky tisíc trsů obilí na poli) by přeteklo zásobník.
 */
export function appendAll<T>(target: T[], source: readonly T[]): void {
  for (const item of source) target.push(item);
}

/** Klíč bloku dílu podle políčka. */
export function fieldBlockOf(cell: { x: number; y: number }): string {
  return `${Math.floor(cell.x / FIELD_BLOCK)},${Math.floor(cell.y / FIELD_BLOCK)}`;
}

/** Klíč políčka dílu. */
export function cellKey(cell: { x: number; y: number }): string {
  return `${cell.x},${cell.y}`;
}

/** Vzhledy dílů po blocích – bloky v pořadí prvního dílu, díly v bloku v pořadí `views`. */
export function groupFieldBlocks(views: readonly PartView[]): Map<string, PartView[]> {
  const blocks = new Map<string, PartView[]>();
  for (const view of views) {
    const key = fieldBlockOf(view.part.cell);
    const block = blocks.get(key);
    if (block) block.push(view);
    else blocks.set(key, [view]);
  }
  return blocks;
}

/** Obtisky, řádky sena a rostliny dílů `views` (celé pole nebo jeho blok). */
export function fieldBlockContent(
  views: readonly PartView[],
  rows: readonly [number, number],
  center: { x: number; z: number },
  coverage: (x: number, z: number) => number,
  day: number,
): FieldBlockContent {
  const layers = new Map<string, DecalLayer>();
  const layer = (texture: FieldTexture, patches: boolean): DecalLayer => {
    const key = `${texture}|${patches ? 1 : 0}`;
    let entry = layers.get(key);
    if (!entry) {
      entry = { texture, patches, grids: [], colors: [], alphas: [] };
      layers.set(key, entry);
    }
    return entry;
  };
  const pieces = decalPieces(views, rows, center);
  for (const piece of pieces) {
    const style = lookStyle(piece.look, piece.part.crop);
    // zarůstající příloh obtisk nemá – zůstane tráva louky (fields.md – Zarůstání)
    if (style.alpha <= 0) continue;
    const step = piece.part.size / GRID_PER_CELL;
    const grid = decalGrid(piece.bounds, step, coverage);
    if (grid.indices.length === 0) continue;
    const base = layer(style.texture, false);
    base.grids.push(grid);
    base.colors.push(style.tint);
    base.alphas.push(style.alpha);
    if (style.patches) {
      // skvrny jemnější sítí – šum je menší než krok obtisku
      const even = style.patches.even ?? false;
      const fine = decalGrid(piece.bounds, even ? step : step / 2, (x, z) => {
        if (even) return coverage(x, z);
        const n = patchNoise(x, z);
        return coverage(x, z) * Math.min(1, Math.max(0, (n - 0.45) / 0.2));
      });
      if (fine.indices.length > 0) {
        const patches = layer(style.patches.texture, true);
        patches.grids.push(fine);
        patches.colors.push(style.patches.tint);
        patches.alphas.push(style.patches.alpha);
      }
    }
  }
  // posečená louka na seno: řádky sena na posečené části (v době sušení)
  const swaths =
    hayPhase(day)?.hay === 'swaths'
      ? pieces
          .filter((piece) => piece.look === 'mown')
          .map((piece) =>
            decalGrid(piece.bounds, piece.part.size / GRID_PER_CELL / 2, (x, z) => {
              const n = patchNoise(x * 1.7, z * 1.7);
              return coverage(x, z) * (0.55 + 0.45 * n);
            }),
          )
          .filter((grid) => grid.indices.length > 0)
      : [];
  // rostliny po dílech – pole je pak spojí v pořadí dílů jako fieldPlants celého pole (plevel
  // se dělí do dvou modelů trsů podle pořadí)
  const plants = new Map<string, FieldPlants>();
  for (const view of views) {
    plants.set(cellKey(view.part.cell), fieldPlants([view], rows, center, coverage, day));
  }
  // koruna porostu po síti obtisku (stejné body jako okraj obtisku)
  const first = views[0];
  const canopy = first
    ? fieldCanopy(views, rows, center, coverage, first.part.size / GRID_PER_CELL)
    : emptyCanopy();
  return { layers, swaths, plants, canopy };
}

/**
 * Spojí obsah bloků do obsahu celého pole: obtisky a řádky sena po blocích, rostliny v pořadí
 * dílů `views` (stejné pořadí jako `fieldPlants` celého pole).
 */
export function mergeFieldBlocks(
  views: readonly PartView[],
  blocks: readonly FieldBlockContent[],
): FieldContent {
  const layers = new Map<string, DecalLayer>();
  const swaths: DecalGrid[] = [];
  const plants: FieldPlants = { crops: emptyCrops(), stooks: [], heaps: [], weeds: [], hay: [] };
  const byCell = new Map<string, FieldPlants>();
  for (const block of blocks) {
    for (const [key, layer] of block.layers) {
      let entry = layers.get(key);
      if (!entry) {
        entry = {
          texture: layer.texture,
          patches: layer.patches,
          grids: [],
          colors: [],
          alphas: [],
        };
        layers.set(key, entry);
      }
      appendAll(entry.grids, layer.grids);
      appendAll(entry.colors, layer.colors);
      appendAll(entry.alphas, layer.alphas);
    }
    appendAll(swaths, block.swaths);
    for (const [cell, part] of block.plants) byCell.set(cell, part);
  }
  for (const view of views) {
    const part = byCell.get(cellKey(view.part.cell));
    if (!part) continue;
    for (const kind of CROP_KINDS) appendAll(plants.crops[kind], part.crops[kind]);
    appendAll(plants.stooks, part.stooks);
    appendAll(plants.heaps, part.heaps);
    appendAll(plants.weeds, part.weeds);
    appendAll(plants.hay, part.hay);
  }
  return { layers, swaths, plants, canopy: mergeCanopies(blocks.map((b) => b.canopy)) };
}
