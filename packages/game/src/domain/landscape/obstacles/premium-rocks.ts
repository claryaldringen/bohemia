import { length2 } from '../det-math';
import {
  axisCoordinatesOfWorld,
  axisWorld,
  GOLD_VEIN,
  QUARRY,
  quarryPlan,
  veinPlan,
  type AxisPlan,
} from '../premium/deposits';
import { planInputOf } from '../premium/relief';
import { CELL_SIZE_M } from '../types';
import { hashFor, onLandAwayFromVillage, type ScatterContext } from './context';
import { obstacleId, type DecorObstacleLook, type ObstaclePlacement } from './types';

// Skály prémiových nalezišť (premium-landscapes.md – Typy krajin, návrh Clauda): skalní výchozy
// na čele lomu a suť pod ním (stavební kámen), rudné výchozy podél žíly na hřebeni (hluboká
// ložiska). Kde stěna a žíla leží, je čistá funkce vody a místa vsi (`quarryPlan`, `veinPlan` –
// stejně jako při generování terénu), takže skály vyjdou stejně na serveru i v prohlížeči.
// Krajina bez typu (i jiný typ) je nemá.

/** Výchoz podle losu: skalní hřbet, věž, nebo skalní blok. */
function outcropLook(r: number): DecorObstacleLook {
  return r < 0.4 ? 'rock-ridge' : r < 0.75 ? 'rock-tower' : 'rock-boulder';
}

/** Lom stavební krajiny (null u jiného typu). */
function quarryOf(ctx: ScatterContext): AxisPlan | null {
  return ctx.landscape.premium === 'building-stone' ? quarryPlan(planInputOf(ctx.landscape)) : null;
}

/** Hřbet se žílou (null u jiného typu). */
function veinOf(ctx: ScatterContext): AxisPlan | null {
  return ctx.landscape.premium === 'deep-gold' ? veinPlan(planInputOf(ctx.landscape)) : null;
}

/**
 * Lom (prémiová krajina „Stavební kámen a vápenec“): na čele stěny skalní výchozy po
 * `QUARRY.rockStepM`, pod čelem suť – balvany a kameny.
 */
export function quarryRockPlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const plan = quarryOf(ctx);
  if (!plan) return [];
  const hash = hashFor(ctx, 'quarry-rocks');
  const half = QUARRY.halfLengthM / CELL_SIZE_M;
  const step = QUARRY.rockStepM / CELL_SIZE_M;
  const count = Math.floor((2 * half) / step) + 1;
  const rocks: ObstaclePlacement[] = [];
  const l = ctx.landscape;
  for (let k = 0; k < count; k++) {
    const v = -half + k * step;
    const [x, z] = axisWorld(l, plan, 0.2 + hash(k, 0, 1) * 0.2, v + (hash(k, 0, 2) - 0.5) * 0.2);
    if (onLandAwayFromVillage(l, x, z)) {
      rocks.push({
        id: obstacleId('quarryRock', k, 0),
        kind: 'outcrop',
        look: outcropLook(hash(k, 0, 3)),
        x,
        z,
        rotation: hash(k, 0, 4) * Math.PI * 2,
        scale: 1.1 + hash(k, 0, 5) * 0.6,
      });
    }
    // Suť pod čelem.
    if (hash(k, 1, 1) < 0.7) {
      const [tx, tz] = axisWorld(l, plan, 1 + hash(k, 1, 2) * 0.5, v + (hash(k, 1, 3) - 0.5) * 0.4);
      if (onLandAwayFromVillage(l, tx, tz)) {
        const r = hash(k, 1, 4);
        const look: DecorObstacleLook = r < 0.5 ? 'boulder' : r < 0.75 ? 'stone-1' : 'stone-2';
        rocks.push({
          id: obstacleId('quarryRock', k, 1),
          kind: look === 'boulder' ? 'boulder' : 'stone',
          look,
          x: tx,
          z: tz,
          rotation: hash(k, 1, 5) * Math.PI * 2,
          scale: 0.7 + hash(k, 1, 6) * 0.6,
        });
      }
    }
  }
  return rocks;
}

/**
 * Žíla (prémiová krajina „Hluboká ložiska drahých kovů“): rudné výchozy po
 * `GOLD_VEIN.outcropStepM` podél hřebene (kousek vedle osy) a rudné balvany na svazích pod nimi.
 */
export function oreRockPlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const plan = veinOf(ctx);
  if (!plan) return [];
  const hash = hashFor(ctx, 'ore-rocks');
  const half = GOLD_VEIN.halfLengthM / CELL_SIZE_M;
  const step = GOLD_VEIN.outcropStepM / CELL_SIZE_M;
  const count = Math.floor((2 * half) / step) + 1;
  const rocks: ObstaclePlacement[] = [];
  const l = ctx.landscape;
  for (let k = 0; k < count; k++) {
    const v = -half + k * step;
    const [x, z] = axisWorld(l, plan, (hash(k, 0, 1) - 0.5) * 0.5, v);
    if (onLandAwayFromVillage(l, x, z)) {
      rocks.push({
        id: obstacleId('oreRock', k, 0),
        kind: 'outcrop',
        look: outcropLook(hash(k, 0, 2)),
        x,
        z,
        rotation: hash(k, 0, 3) * Math.PI * 2,
        scale: 1 + hash(k, 0, 4) * 0.6,
      });
    }
    if (hash(k, 1, 1) < 0.5) {
      const side = hash(k, 1, 2) < 0.5 ? -1 : 1;
      const [bx, bz] = axisWorld(l, plan, side * (0.8 + hash(k, 1, 3) * 0.6), v);
      if (onLandAwayFromVillage(l, bx, bz)) {
        rocks.push({
          id: obstacleId('oreRock', k, 1),
          kind: 'boulder',
          look: 'boulder',
          x: bx,
          z: bz,
          rotation: hash(k, 1, 4) * Math.PI * 2,
          scale: 0.8 + hash(k, 1, 5) * 0.5,
        });
      }
    }
  }
  return rocks;
}

/** Kolem skal lomu a žíly nic jiného nestojí (m). */
const ROCK_CLEARANCE_M = 2.5;
/** Hřeben se žílou bez stromů a keřů – do 9 m od osy (políčka). */
const VEIN_CLEAR_CELLS = 0.6;

/**
 * Výběr překážek mimo čelo lomu (pás `QUARRY.stripM` podél stěny) a hřeben se žílou
 * (`VEIN_CLEAR_CELLS` od osy) a dál než `ROCK_CLEARANCE_M` od skal – na stěně a na hřebeni
 * nerostou stromy ani keře.
 */
export function premiumRockClearing(
  ctx: ScatterContext,
  rocks: readonly ObstaclePlacement[],
): (placements: ObstaclePlacement[]) => ObstaclePlacement[] {
  const quarry = quarryOf(ctx);
  const vein = veinOf(ctx);
  const strip = QUARRY.stripM.map((m) => m / CELL_SIZE_M) as [number, number];
  const quarryHalf = QUARRY.halfLengthM / CELL_SIZE_M + 0.3;
  const veinHalf = GOLD_VEIN.halfLengthM / CELL_SIZE_M;
  const keep = (p: ObstaclePlacement): boolean => {
    if (quarry) {
      const { u, v } = axisCoordinatesOfWorld(ctx.landscape, quarry, p.x, p.z);
      if (u >= strip[0] && u <= strip[1] && Math.abs(v) <= quarryHalf) return false;
    }
    if (vein) {
      const { u, v } = axisCoordinatesOfWorld(ctx.landscape, vein, p.x, p.z);
      const onAxis = Math.min(veinHalf, Math.max(-veinHalf, v));
      if (length2(u, v - onAxis) <= VEIN_CLEAR_CELLS) return false;
    }
    return rocks.every((r) => length2(p.x - r.x, p.z - r.z) >= ROCK_CLEARANCE_M);
  };
  return (placements) => placements.filter(keep);
}
