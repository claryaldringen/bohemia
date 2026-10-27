// Povodeň ve scéně (disasters.md – Povodeň potoka, Ve scéně): plocha vody nad zatopenými políčky
// a bahno s naplaveninou. Zatopená políčka bere scéna ze stejné funkce jako jádro
// (`streamHeights` – výška políčka nad potokem), ať se voda ve scéně shoduje se škodami. Čisté
// funkce bez Babylonu (testy); kreslí storm-renderer.ts.
import { FLOOD, tileCenterWorld, tileIndex, type Landscape } from '@bohemia/game';
import { FLOOD_MUD_DAYS, FLOOD_RECEDE_DAYS } from '../weather-view';
import { HEIGHT_SCALE } from './constants';

const STEPS = 10;

function stepped(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * STEPS) / STEPS;
}

/**
 * Podíl výšky vody 0–1 v okamžiku `t` = den světa − den povodně: voda stojí `FLOOD.standDays`
 * dní, pak za `FLOOD_RECEDE_DAYS` ustoupí (po desetinách); před povodní a po ústupu 0.
 */
export function floodLevel(t: number): number {
  if (!(t >= 0)) return 0;
  if (t < FLOOD.standDays) return 1;
  return stepped(1 - (t - FLOOD.standDays) / FLOOD_RECEDE_DAYS);
}

/** Bahno a naplavenina 0–1: od povodně, po ústupu vody za `FLOOD_MUD_DAYS` zarostou. */
export function floodMud(t: number): number {
  if (!(t >= 0)) return 0;
  const dry = FLOOD.standDays + FLOOD_RECEDE_DAYS;
  if (t < dry) return 1;
  return stepped(1 - (t - dry) / FLOOD_MUD_DAYS);
}

/** Síla bahna podle hloubky vody nad políčkem (m): mělká voda nechá tenkou vrstvu, hluboká plnou. */
export function mudWeight(depthM: number): number {
  if (!(depthM > 0)) return 0;
  return 0.5 + 0.5 * Math.min(1, depthM / 1.5);
}

/** Plocha vody povodně: vrcholy ve středech políček (x, y, z) a trojúhelníky. */
export interface FloodSurface {
  positions: Float32Array;
  /** Krytí vody ve vrcholu podle hloubky – u břehu průzračnější. */
  alphas: Float32Array;
  indices: Uint32Array;
  /** Počet zatopených políček (i koryto potoka). */
  flooded: number;
}

/**
 * Plocha vody povodně výšky `heightM` nad potokem: zatopená políčka (výška nad potokem < výška
 * vody – jako jádro) a jejich sousedé. Hladina v políčku = dno nejbližšího potoka + výška vody
 * (× převýšení scény) – plocha se u sousedů zařízne do vyššího terénu, břeh je průsečík s ním.
 * Bez zatopených políček null.
 */
export function floodSurface(
  landscape: Landscape,
  above: Float32Array,
  heightM: number,
): FloodSurface | null {
  const size = landscape.size;
  const wet = (t: number): boolean => above[t]! < heightM;
  let flooded = 0;
  for (let t = 0; t < above.length; t++) if (wet(t)) flooded++;
  if (flooded === 0) return null;
  const vertex = new Int32Array(size * size).fill(-1);
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  const at = (tx: number, ty: number): number => {
    const t = ty * size + tx;
    if (vertex[t]! >= 0) return vertex[t]!;
    const { x, z } = tileCenterWorld(landscape, tx, ty);
    const bed = landscape.heights[t]! - above[t]!;
    positions.push(x, (bed + heightM) * HEIGHT_SCALE, z);
    alphas.push(floodAlpha(heightM - above[t]!));
    vertex[t] = positions.length / 3 - 1;
    return vertex[t]!;
  };
  for (let ty = 0; ty < size - 1; ty++) {
    for (let tx = 0; tx < size - 1; tx++) {
      const a = ty * size + tx;
      if (!wet(a) && !wet(a + 1) && !wet(a + size) && !wet(a + size + 1)) continue;
      const va = at(tx, ty);
      const vb = at(tx + 1, ty);
      const vc = at(tx, ty + 1);
      const vd = at(tx + 1, ty + 1);
      indices.push(va, vb, vc, vb, vd, vc);
    }
  }
  return {
    positions: new Float32Array(positions),
    alphas: new Float32Array(alphas),
    indices: new Uint32Array(indices),
    flooded,
  };
}

/**
 * Krytí kalné vody podle hloubky (m): mělká u břehu průzračná (0,25 – prosvítá tráva a bahno,
 * břeh není ostrá hrana), od 1 m skoro neprůhledná.
 */
export function floodAlpha(depthM: number): number {
  return Math.min(0.92, Math.max(0.25, 0.25 + 0.67 * depthM));
}

/** Hloubka vody povodně (m) nad políčkem pod bodem světa; mimo mapu a nad vodou 0. */
export function floodDepthAt(
  landscape: Landscape,
  above: Float32Array,
  heightM: number,
  x: number,
  z: number,
): number {
  const tile = tileIndex(landscape, x, z);
  return tile < 0 ? 0 : Math.max(0, heightM - above[tile]!);
}

/** Obdélník světa (m). */
export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Obal zatopených políček (m) – kde má smysl kreslit bahno; bez zatopení null. */
export function floodBox(landscape: Landscape, above: Float32Array, heightM: number): Box | null {
  let box: Box | null = null;
  const half = landscape.cellSizeM / 2;
  for (let t = 0; t < above.length; t++) {
    if (!(above[t]! < heightM)) continue;
    const { x, z } = tileCenterWorld(landscape, t % landscape.size, Math.floor(t / landscape.size));
    box ??= { minX: x, minZ: z, maxX: x, maxZ: z };
    box.minX = Math.min(box.minX, x - half);
    box.minZ = Math.min(box.minZ, z - half);
    box.maxX = Math.max(box.maxX, x + half);
    box.maxZ = Math.max(box.maxZ, z + half);
  }
  return box;
}

/** Síť obtisku na zemi: vrcholy (x, y, z), barvy (r, g, b, a – a = váha) a trojúhelníky. */
export interface OverlayGrid {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/**
 * Obtisk na terénu (bílý pás krup, bahno povodně) v mřížce po `step` m nad obdélníkem `box`:
 * váha vrcholu `weight` (0–1) jde do krytí, výška terénu `height` + `lift`. Jen čtverce, kde má
 * aspoň jeden roh váhu – okraj obtisku se k nule prolne. Bez vah null.
 */
export function overlayGrid(
  box: Box,
  step: number,
  weight: (x: number, z: number) => number,
  height: (x: number, z: number) => number,
  lift: number,
): OverlayGrid | null {
  const nx = Math.max(1, Math.ceil((box.maxX - box.minX) / step)) + 1;
  const nz = Math.max(1, Math.ceil((box.maxZ - box.minZ) / step)) + 1;
  const weights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      weights[j * nx + i] = weight(box.minX + i * step, box.minZ + j * step);
    }
  }
  const vertex = new Int32Array(nx * nz).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const at = (i: number, j: number): number => {
    const v = j * nx + i;
    if (vertex[v]! >= 0) return vertex[v]!;
    const x = box.minX + i * step;
    const z = box.minZ + j * step;
    positions.push(x, height(x, z) + lift, z);
    colors.push(1, 1, 1, weights[v]!);
    vertex[v] = positions.length / 3 - 1;
    return vertex[v]!;
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      if (!weights[a] && !weights[a + 1] && !weights[a + nx] && !weights[a + nx + 1]) continue;
      const va = at(i, j);
      const vb = at(i + 1, j);
      const vc = at(i, j + 1);
      const vd = at(i + 1, j + 1);
      indices.push(va, vb, vc, vb, vd, vc);
    }
  }
  if (indices.length === 0) return null;
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
