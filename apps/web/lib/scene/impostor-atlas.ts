import type { TreeModel } from './tree-placement';

/** Buňka atlasu impostorů: strana čtverce (m) a pata kmene v buňce (u zleva, v odspodu, 0–1). */
export interface ImpostorCell {
  model: TreeModel;
  sideM: number;
  pivotU: number;
  pivotV: number;
}

/**
 * Atlas impostorů – stromy vyrenderované pod náklonem kamery (`tools/blender/impostors.py`).
 * Buňky jdou po řádcích odshora. Po novém renderu sem přepsat hodnoty z vygenerovaného JSON.
 */
export const IMPOSTOR_ATLAS = {
  url: '/models/trees/impostors.webp',
  columns: 4,
  rows: 4,
  /** Náklon kamery nad obzorem (rad), pod kterým jsou stromy vyrenderované. */
  elevation: 0.720796,
  cells: [
    { model: 'spruce-1', sideM: 18.442, pivotU: 0.4918, pivotV: 0.1311 },
    { model: 'spruce-1', sideM: 19.172, pivotU: 0.4845, pivotV: 0.189 },
    { model: 'spruce-2', sideM: 17.338, pivotU: 0.4698, pivotV: 0.1942 },
    { model: 'spruce-2', sideM: 18.085, pivotU: 0.5121, pivotV: 0.22 },
    { model: 'oak-1', sideM: 16.219, pivotU: 0.4671, pivotV: 0.0612 },
    { model: 'oak-1', sideM: 15.454, pivotU: 0.5286, pivotV: 0.0616 },
    { model: 'oak-2', sideM: 15.697, pivotU: 0.5426, pivotV: 0.1167 },
    { model: 'oak-2', sideM: 16.34, pivotU: 0.5417, pivotV: 0.076 },
    { model: 'beech-1', sideM: 16.002, pivotU: 0.4766, pivotV: 0.0424 },
    { model: 'beech-1', sideM: 16.287, pivotU: 0.5271, pivotV: 0.0361 },
    { model: 'beech-2', sideM: 17.34, pivotU: 0.4823, pivotV: 0.0359 },
    { model: 'beech-2', sideM: 16.117, pivotU: 0.5093, pivotV: 0.0357 },
    { model: 'birch-1', sideM: 16.2, pivotU: 0.4969, pivotV: 0.0294 },
    { model: 'birch-1', sideM: 13.595, pivotU: 0.5004, pivotV: 0.0357 },
    { model: 'birch-2', sideM: 12.3, pivotU: 0.537, pivotV: 0.0304 },
    { model: 'birch-2', sideM: 14.103, pivotU: 0.544, pivotV: 0.0307 },
  ] satisfies ImpostorCell[] as readonly ImpostorCell[],
};
