// Boj ve scéně (war.md – Ve scéně – Boj): šípy letí od střelce k cíli po oblouku, srážka zblízka
// zvíří prach, padlí leží do konce dne. Bez Babylonu – rány se poznají ze dvou po sobě jdoucích
// snímků boje (jádro nastaví `cooldown` na plný interval v taktu rány); kreslí army-renderer.ts.
import { TICKS_PER_SECOND, WAR, type Pos } from '@bohemia/game';
import { BOW_TICKS, MELEE_TICKS, type SceneBattle } from './army';

/** Výstřel lukem: odkud, kam a kdy (s, čas scény). */
export interface Shot {
  key: string;
  from: Pos;
  to: Pos;
  startS: number;
  /** Délka letu (s). */
  flightS: number;
}

/** Srážka zblízka – prach mezi muži. */
export interface Clash {
  key: string;
  at: Pos;
  startS: number;
}

/** Rychlost šípu (m/s, návrh Clauda – 40–60 m za ≈ 1 s). */
export const ARROW_M_S = 45;
/** Výška oblouku šípu jako podíl vzdálenosti. */
const ARROW_ARC = 0.12;
/** Výška ramene střelce a cíle (m). */
const SHOULDER_M = 1.5;
/** Jak dlouho se prach srážky zvedá (s). */
export const DUST_S = 0.7;

/**
 * Rány taktu `cur` (po snímku `prev`): muž v boji s cílem, kterému jádro právě nastavilo plný
 * interval rány – na 20–60 m lukem (šíp), zblízka srážka. Bez předchozího snímku nic (rány
 * nejsou poznat). `nowS` je okamžik, kdy snímek přišel.
 */
export function strikesOf(
  prev: SceneBattle | null,
  cur: SceneBattle,
  nowS: number,
): { shots: Shot[]; clashes: Clash[] } {
  const shots: Shot[] = [];
  const clashes: Clash[] = [];
  if (!prev || cur.ticks <= prev.ticks) return { shots, clashes };
  const before = new Map(prev.fighters.map((f) => [f.id, f]));
  const byId = new Map(cur.fighters.map((f) => [f.id, f]));
  const c = WAR.combat;
  for (const f of cur.fighters) {
    if (f.state !== 'fight' || f.aim === null) continue;
    const t = byId.get(f.aim);
    const was = before.get(f.id);
    if (!t || !was) continue;
    // nový interval rány: cooldown se v taktu rány nastaví na plno (dřív menší)
    const d = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
    if (f.cooldown === BOW_TICKS && was.cooldown < BOW_TICKS && f.bow && d >= c.bowMinM) {
      shots.push({
        key: `${f.id}@${cur.ticks}`,
        from: { x: f.pos.x, z: f.pos.z },
        to: { x: t.pos.x, z: t.pos.z },
        startS: nowS,
        flightS: d / ARROW_M_S,
      });
    } else if (f.cooldown === MELEE_TICKS && was.cooldown < MELEE_TICKS && d <= c.meleeM + 0.5) {
      clashes.push({
        key: `${f.id}@${cur.ticks}`,
        at: { x: (f.pos.x + t.pos.x) / 2, z: (f.pos.z + t.pos.z) / 2 },
        startS: nowS,
      });
    }
  }
  return { shots, clashes };
}

/** Šíp v letu: poloha (y nad terénem u střelce) a směr; po dopadu null. */
export interface ArrowPose {
  /** Podíl letu 0–1. */
  u: number;
  x: number;
  /** Výška nad přímkou mezi rameny (m) – renderer přičte terén. */
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/** Šíp v okamžiku `nowS` – parabola nad spojnicí střelce a cíle; mimo let null. */
export function arrowAt(shot: Shot, nowS: number): ArrowPose | null {
  const u = (nowS - shot.startS) / shot.flightS;
  if (u < 0 || u > 1) return null;
  const dx = shot.to.x - shot.from.x;
  const dz = shot.to.z - shot.from.z;
  const d = Math.hypot(dx, dz);
  const h = d * ARROW_ARC;
  // y = 4 h u (1 − u), sklon dy/du = 4 h (1 − 2u)
  const y = SHOULDER_M + 4 * h * u * (1 - u);
  const slope = 4 * h * (1 - 2 * u);
  const l = Math.hypot(d, slope) || 1;
  return {
    u,
    x: shot.from.x + dx * u,
    y,
    z: shot.from.z + dz * u,
    dx: dx / l,
    dy: slope / l,
    dz: dz / l,
  };
}

/** Prach srážky: poloměr (m) v okamžiku `nowS`, po dosednutí null. */
export function dustAt(clash: Clash, nowS: number): number | null {
  const u = (nowS - clash.startS) / DUST_S;
  if (u < 0 || u > 1) return null;
  return 0.6 + 1.8 * Math.sqrt(u);
}

/** Odstraní šípy a prach, které už dopadly / dosedly. */
export function pruneFx<T extends { startS: number }>(
  list: readonly T[],
  nowS: number,
  lengthS: (x: T) => number,
): T[] {
  return list.filter((x) => nowS - x.startS <= lengthS(x));
}

/**
 * Padlí a ranění leží do konce herního dne (war.md – Ve scéně): po něm (`dayEndMs`) se boj už
 * nekreslí. Bez hodin dne leží, dokud je boj ve scéně.
 */
export function fallenShown(nowMs: number, dayEndMs: number | null): boolean {
  return dayEndMs === null || nowMs < dayEndMs;
}

/** Takty za sekundu jádra – snímky boje přicházejí po taktech (`TICK_MS`). */
export const BATTLE_TICK_S = 1 / TICKS_PER_SECOND;
