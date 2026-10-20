import { streamStations } from '../stream-geometry';
import { hashFor, nearVillageSite, type ScatterContext } from './context';
import {
  obstacleId,
  type DecorObstacleLook,
  type ObstacleKind,
  type ObstaclePlacement,
} from './types';
import { tileOfWorldPoint } from '../world';

// Skály a suť na stěnách u potoka (vrstva překážek 2 nad terénem 2 – landscape.md, Skály
// u potoka). Jen deterministická matematika (det-math) – stejně na serveru i v prohlížeči.

/** Krok podél osy potoka (m) pro skály na horní hraně stěny a suť pod ní. */
const STEP_M = 9;
/** Od této výšky stěny (m) je to skála, plně od `full`; nižší nárazový břeh je hlinitý. */
const ROCK_FROM_M = 2.5;
const ROCK_FULL_M = 5;
/**
 * Šířka čela stěny (m) – podíl výšky v mezích, na vnitřní straně oblouku širší; dole suťový svah
 * (podíl šířky čela) – jako scéna (`cliffFaceM` v render-surface.ts).
 */
const FACE = { share: 0.8, min: 1.5, max: 9, innerWiden: 2, apron: 0.3 };
/** Suť na suťovém svahu pod stěnou: nejvýš kusů na stanici. */
const SCREE_MAX = 2;

/**
 * Skalní výchozy na horní hraně skalních stěn a ostrohů u potoka a pod nimi suť (balvany,
 * mechem porostlé kameny) – jen u stěn vyšších než ≈ 2,5 m; nízký hlinitý břeh nemá nic. Id podle
 * stanice na ose (zdroj `cliffRock`), vzestupně.
 */
export function cliffRockPlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const l = ctx.landscape;
  const { stream } = ctx;
  const hash = hashFor(ctx, 'cliff-rocks');
  const result: ObstaclePlacement[] = [];
  const inMap = (x: number, z: number): boolean => tileOfWorldPoint(l, x, z) !== null;
  for (const station of streamStations(stream, STEP_M)) {
    for (const side of [-1, 1]) {
      const cell = station.index * 2 + (side > 0 ? 1 : 0);
      const here = stream.nearest(
        station.x + station.nx * side * 0.5,
        station.z + station.nz * side * 0.5,
      );
      if (here.bank < ROCK_FROM_M) continue;
      const rock = Math.min(1, (here.bank - ROCK_FROM_M) / (ROCK_FULL_M - ROCK_FROM_M));
      const face =
        Math.min(FACE.max, Math.max(FACE.min, FACE.share * here.bank)) *
        (1 + FACE.innerWiden * Math.max(0, here.innerBend));
      const apron = face * FACE.apron;
      const at = (offset: number, along: number): { x: number; z: number } => {
        const d = here.halfWidth + offset;
        return {
          x: station.x + station.nx * side * d - station.nz * along,
          z: station.z + station.nz * side * d + station.nx * along,
        };
      };
      const fits = (x: number, z: number, from: number, to: number): boolean => {
        if (!inMap(x, z) || nearVillageSite(l, x, z)) return false;
        const d = stream.nearest(x, z).bankDistance;
        return d >= from && d <= to;
      };
      // Výchoz na horní hraně stěny – skála vystupuje z hrany a čela.
      if (hash(cell, 1, 151) < 0.12 + 0.3 * rock) {
        const offset = face * (0.85 + 0.4 * hash(cell, 2, 151));
        const p = at(offset, (hash(cell, 3, 151) - 0.5) * STEP_M);
        if (fits(p.x, p.z, face * 0.7, face + 4)) {
          const pick = hash(cell, 4, 151);
          const look: DecorObstacleLook =
            here.bank > 6 && pick < 0.3
              ? 'rock-tower'
              : pick < 0.65
                ? 'rock-ridge'
                : 'rock-boulder';
          result.push({
            id: obstacleId('cliffRock', cell, 0),
            kind: 'outcrop',
            look,
            x: p.x,
            z: p.z,
            rotation: hash(cell, 5, 151) * Math.PI * 2,
            scale: 0.9 + hash(cell, 6, 151) * 0.5 + 0.05 * Math.min(8, here.bank),
          });
        }
      }
      // Suť pod stěnou – balvany a kameny, které ze stěny spadly.
      const count = Math.floor(hash(cell, 7, 151) * (SCREE_MAX + 0.6) * rock);
      for (let i = 0; i < count; i++) {
        const offset = 0.4 + hash(cell, 10 + i, 151) * Math.max(0.2, apron - 0.4);
        const p = at(offset, (hash(cell, 20 + i, 151) - 0.5) * STEP_M);
        if (!fits(p.x, p.z, 0.25, apron + 0.5)) continue;
        const pick = hash(cell, 30 + i, 151);
        const look: DecorObstacleLook =
          pick < 0.35
            ? 'rock-moss-1'
            : pick < 0.6
              ? 'rock-moss-2'
              : pick < 0.85
                ? 'boulder'
                : 'stone-1';
        result.push({
          id: obstacleId('cliffRock', cell, 1 + i),
          kind: screeKind(look),
          look,
          x: p.x,
          z: p.z,
          rotation: hash(cell, 40 + i, 151) * Math.PI * 2,
          scale: 0.7 + hash(cell, 50 + i, 151) * 0.7,
        });
      }
    }
  }
  return result;
}

function screeKind(look: DecorObstacleLook): ObstacleKind {
  return look === 'stone-1' ? 'stone' : 'boulder';
}
