// Ploty vsi pro pěšiny a osy cest (paths.md – Odstup od plotu): hotový hřbitov, hotová ohrada
// a pozemek obydlí mají pletený plot se zakulacenými rohy. Mřížka chodců (`villageGrid`) z nich
// bere neprůchodný pruh a dražší buňky u plotu, osa trasy (`routeLine`) odstup. Stojící úseky
// opevnění (fortifications.md – Brány) jsou plot s pásem šířky druhu a branami. Čisté
// deterministické funkce (soubor hlídá ESLint jako síť pěšin).

import { length2 } from '../../landscape';
import { insideQuad, type FortWalls } from '../fortification/walls';
import type { Point } from '../polygon';
import { CEMETERY_FENCE_INSET_M, PEN_FENCE_INSET_M } from '../rules';
import {
  cemeteryEntrance,
  FENCE_INSET_M,
  fenceDistance,
  fenceOutline,
  penGateToward,
  penSquaresEntrance,
  type Entrance,
  type EntranceSquare,
  type FenceOutline,
  type FenceSegment,
} from './entrances';
import { penPathSquares } from './network-keys';
import type { PathVillage } from './network-types';

/**
 * Plot stavby vsi a jeho branka (pozemek obydlí – branka u brány domu, tady null). Opevnění nese
 * stěny a brány (`wall`) – obrys je pás stěn, vnitřek opevnění zůstává průchozí.
 */
export interface VillageFence {
  outline: FenceOutline;
  gate: Entrance | null;
  wall?: FortWalls;
}

/**
 * Obrys stěn opevnění pro odstup osy trasy (`fenceClearance`): hrany čtyřúhelníků stěn jako rovné
 * úseky, uvnitř = uvnitř některé stěny. Bez stěn null.
 */
export function wallOutline(walls: readonly (readonly Point[])[]): FenceOutline | null {
  if (walls.length === 0) return null;
  const segments: FenceSegment[] = [];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const quad of walls) {
    for (let k = 0; k < quad.length; k++) {
      const [ax, az] = quad[k]!;
      const [bx, bz] = quad[(k + 1) % quad.length]!;
      const length = length2(bx - ax, bz - az);
      minX = Math.min(minX, ax);
      minZ = Math.min(minZ, az);
      maxX = Math.max(maxX, ax);
      maxZ = Math.max(maxZ, az);
      if (length > 0) {
        segments.push({ x: ax, z: az, dx: (bx - ax) / length, dz: (bz - az) / length, length });
      }
    }
  }
  const inside = (x: number, z: number): boolean => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    return walls.some((quad) => insideQuad(quad, x, z));
  };
  return { segments, arcs: [], minX, minZ, maxX, maxZ, inside };
}

/**
 * Ploty vsi: hotový hřbitov (bez rozšíření ve stavbě), hotová ohrada, stojící úseky opevnění
 * (stěny bez otvorů bran – `PathVillage.fortifications`) a s `plots` i pozemky obydlí
 * (plot `FENCE_INSET_M` uvnitř políčka, u dvorce i kolem dvora). Pozemek mřížka chodců nebere –
 * je celý neprůchodný jako stavba (`dwellingBox`); ploty bere jen osa trasy.
 */
export function villageFences(
  v: Pick<PathVillage, 'cemeteries' | 'pens' | 'dwellings' | 'fortifications'>,
  plots: boolean,
): VillageFence[] {
  const out: VillageFence[] = [];
  for (const cemetery of v.cemeteries ?? []) {
    const done = cemetery.built === false ? [] : cemetery.squares.filter((q) => !q.pending);
    const outline = fenceOutline(done, CEMETERY_FENCE_INSET_M);
    if (outline) out.push({ outline, gate: cemeteryEntrance(cemetery, v.dwellings) });
  }
  for (const pen of v.pens ?? []) {
    if (!pen.built) continue;
    const squares = penPathSquares(pen);
    const outline = fenceOutline(squares, PEN_FENCE_INSET_M);
    if (!outline) continue;
    out.push({ outline, gate: penSquaresEntrance(squares, penGateToward(squares, v.dwellings)) });
  }
  // stojící úseky opevnění – stěny a brány (fortifications.md – Brány); bez opevnění nic
  for (const fort of v.fortifications ?? []) {
    const outline = wallOutline(fort.walls);
    if (outline)
      out.push({
        outline,
        gate: null,
        wall: { walls: fort.walls, gates: fort.gates, detour: fort.detour },
      });
  }
  if (!plots) return out;
  for (const d of v.dwellings) {
    const plot = d.plot;
    // plot stojí jen u hotového obydlí – staveniště ho nemá (osa se ho nedrží)
    if (!plot || d.built === false) continue;
    const squares: EntranceSquare[] = [
      {
        cell: plot.cell,
        x: plot.x,
        z: plot.z,
        size: plot.size,
        ...(plot.rotation !== undefined && !plot.yard ? { rotation: plot.rotation } : {}),
      },
    ];
    if (plot.yard) {
      // dvůr dvorce – sousední políčko (strana `size`)
      const cell = {
        x: plot.cell.x + Math.round((plot.yard.x - plot.x) / plot.size),
        y: plot.cell.y + Math.round((plot.yard.z - plot.z) / plot.size),
      };
      squares.push({ cell, x: plot.yard.x, z: plot.yard.z, size: plot.size });
    }
    const outline = fenceOutline(squares, FENCE_INSET_M);
    if (outline) out.push({ outline, gate: null });
  }
  return out;
}

/** Odstup bodu od nejbližšího plotu (m) – uvnitř plotu 0; bez plotu v dosahu `reach` Infinity. */
export function fenceClearance(
  fences: readonly FenceOutline[],
  x: number,
  z: number,
  reach: number,
): number {
  let best = Infinity;
  for (const f of fences) {
    if (x < f.minX - reach || x > f.maxX + reach || z < f.minZ - reach || z > f.maxZ + reach) {
      continue;
    }
    if (f.inside(x, z)) return 0;
    const d = fenceDistance(f, x, z);
    if (d < best) best = d;
  }
  return best;
}
