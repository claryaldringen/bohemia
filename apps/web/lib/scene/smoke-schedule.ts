// Dým z obydlí bez Babylonu: kdy se v obydlí topí (deterministicky podle herního dne a obydlí)
// a kde je který obláček kouře. Herní den trvá ≈ 86 s, takže ranní a večerní vaření se střídá
// s přestávkami – dým „občas“ stoupá a zase přestane.
import { TOTAL_GAME_DAYS, type WorldClock } from '@bohemia/game';

/** Herní den jako spojité číslo (celá část = den od začátku světa, zbytek = denní doba). */
export function gameDayAt(nowMs: number, world: WorldClock): number {
  const dayMs = (world.endMs - world.startMs) / TOTAL_GAME_DAYS;
  return (nowMs - world.startMs) / dayMs;
}

/** Skutečná délka herního dne (s). */
export function gameDaySeconds(world: WorldClock): number {
  return (world.endMs - world.startMs) / TOTAL_GAME_DAYS / 1000;
}

/** Deterministická náhoda 0–1 z celých čísel (bez stavu – jde volat pro libovolný den). */
export function hash01(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ohně dne: [začátek, konec] jako denní doba 0–1 a síla 0–1. */
export function dayFires(
  seed: number,
  day: number,
): { from: number; to: number; strength: number }[] {
  const r = (k: number): number => hash01(seed, day, k);
  const fires: { from: number; to: number; strength: number }[] = [];
  // ráno vaření (občas vynechá), večer vaření a teplo, někdy krátce přes den
  if (r(1) > 0.15) {
    const from = 0.22 + 0.07 * r(2);
    fires.push({ from, to: from + 0.07 + 0.09 * r(3), strength: 0.65 + 0.35 * r(4) });
  }
  if (r(5) < 0.3) {
    const from = 0.45 + 0.1 * r(6);
    fires.push({ from, to: from + 0.04 + 0.05 * r(7), strength: 0.45 + 0.3 * r(8) });
  }
  if (r(9) > 0.1) {
    const from = 0.7 + 0.07 * r(10);
    fires.push({ from, to: from + 0.08 + 0.1 * r(11), strength: 0.7 + 0.3 * r(12) });
  }
  return fires;
}

/** Jak rozhořelý oheň náběh a dohasínání (podíl dne ≈ 2 s). */
const FIRE_EDGE_DAY = 0.025;

/** Síla dýmu 0–1 v herní okamžik `gameDay` (gameDayAt) pro obydlí se `seed`. */
export function smokeStrength(seed: number, gameDay: number): number {
  const day = Math.floor(gameDay);
  const time = gameDay - day;
  let strength = 0;
  for (const fire of dayFires(seed, day)) {
    const rise = Math.min(1, Math.max(0, (time - fire.from) / FIRE_EDGE_DAY));
    const fall = Math.min(1, Math.max(0, (fire.to - time) / FIRE_EDGE_DAY));
    strength = Math.max(strength, fire.strength * Math.min(rise, fall));
  }
  return strength;
}

/**
 * Odkud dým stoupá: dýmník obydlí (topí se podle rozvrhu ohně – vaření ráno a večer), pec nebo
 * výheň pracující dílny (topí se přes pracovní den), milíř (doutná dnem i nocí – crafts.md)
 * a pohřební hranice (cemetery.md – Pohřeb ve scéně: hustší a vyšší sloupec – PYRE_PLUME; sílu
 * neurčuje rozvrh ohně, ale obřad – funeral-plan.ts, `pyreState`).
 */
export type SmokeKind = 'hearth' | 'craft' | 'milir' | 'pyre';

/** Pracovní den dílny jako denní doba 0–1 – pec a výheň hoří od rána do večera. */
const CRAFT_FIRE = { from: 0.26, to: 0.78 } as const;

/**
 * Síla dýmu 0–1 v herní okamžik `gameDay` podle druhu zdroje: dýmník podle rozvrhu ohně
 * (`smokeStrength`), pec a výheň přes pracovní den (síla se den po dni trochu liší), milíř
 * pořád – slabší, doutná pod hlínou.
 */
export function ventSmokeStrength(kind: SmokeKind, seed: number, gameDay: number): number {
  if (kind === 'hearth') return smokeStrength(seed, gameDay);
  // hranice hoří podle obřadu (funeral-plan.ts) – mimo něj se nekouří
  if (kind === 'pyre') return 0;
  const day = Math.floor(gameDay);
  if (kind === 'milir') return 0.5 + 0.15 * hash01(seed, day, 21);
  const time = gameDay - day;
  const rise = Math.min(1, Math.max(0, (time - CRAFT_FIRE.from) / FIRE_EDGE_DAY));
  const fall = Math.min(1, Math.max(0, (CRAFT_FIRE.to - time) / FIRE_EDGE_DAY));
  return (0.55 + 0.25 * hash01(seed, day, 22)) * Math.min(rise, fall);
}

// --- Obláčky kouře ---

/** Obláčků na jeden sloupec dýmu a jak dlouho obláček žije (s). */
export const PUFFS_PER_PLUME = 18;
export const PUFF_LIFE_S = 11;
/** Kam vítr žene kouř (jednotkový směr v x, z) a jak daleko za život obláčku (m). */
const WIND = { x: 0.94, z: 0.34, driftM: 5.5 };
/** Jak vysoko obláček vystoupá za život (m) a jak velký je na začátku a na konci (m). */
const RISE_M = 9.5;
const SIZE_M = { start: 0.55, end: 3.4 };

export interface Puff {
  /** Posun od dýmníku (m). */
  dx: number;
  dy: number;
  dz: number;
  size: number;
  /** Natočení v rovině obrazovky (rad). */
  angle: number;
  /** Krytí 0–1 (už se silou ohně v okamžiku, kdy obláček vznikl). */
  alpha: number;
  /** Odstín šedi 0–1. */
  shade: number;
}

/**
 * Tvar sloupce dýmu: kolik obláčků, jak dlouho obláček žije (s), kam vystoupá a kam ho vítr
 * odnese (m) a jak velký je na začátku a na konci (m).
 */
export interface PlumeShape {
  puffs: number;
  lifeS: number;
  riseM: number;
  driftM: number;
  size: { start: number; end: number };
}

/** Dým z dýmníku, pece a milíře. */
export const HEARTH_PLUME: PlumeShape = {
  puffs: PUFFS_PER_PLUME,
  lifeS: PUFF_LIFE_S,
  riseM: RISE_M,
  driftM: WIND.driftM,
  size: SIZE_M,
};
/** Pohřební hranice – hustší a vyšší sloupec z větších obláčků. */
export const PYRE_PLUME: PlumeShape = {
  puffs: 30,
  lifeS: 15,
  riseM: 24,
  driftM: 10,
  size: { start: 1.1, end: 7 },
};

/** Tvar sloupce dýmu podle druhu zdroje. */
export function plumeShape(kind: SmokeKind): PlumeShape {
  return kind === 'pyre' ? PYRE_PLUME : HEARTH_PLUME;
}

/**
 * Obláčky sloupce dýmu v čase `timeS` (s): každý obláček stoupá a zpomaluje, vítr ho odnáší,
 * roste a slábne. Krytí podle síly ohně ve chvíli, kdy obláček vznikl – když se přestane topit,
 * poslední obláčky ještě doletí a sloupec se odtrhne. `strengthAt(ageS)` = síla ohně před
 * `ageS` sekundami. `shape` – tvar sloupce (bez údaje dým z dýmníku).
 */
export function plumePuffs(
  seed: number,
  timeS: number,
  strengthAt: (ageS: number) => number,
  out: Puff[] = [],
  shape: PlumeShape = HEARTH_PLUME,
): Puff[] {
  const count = shape.puffs;
  const life = shape.lifeS;
  const size = shape.size;
  out.length = count;
  const cycle = timeS / life;
  for (let i = 0; i < count; i++) {
    const phase = cycle + (i + 0.5 * hash01(seed, i, 7)) / count;
    const generation = Math.floor(phase);
    const age = phase - generation;
    const r = (k: number): number => hash01(seed * 131 + i, generation, k);
    const strength = strengthAt(age * life);
    const rise = shape.riseM * (1 - Math.pow(1 - age, 1.7)) * (0.85 + 0.3 * r(1));
    const drift = shape.driftM * Math.pow(age, 1.5) * (0.8 + 0.4 * r(2));
    // boční vlnění a rozptyl – sloupec není rovná čára
    const sway = (0.25 + 1.1 * age) * Math.sin(age * 5.2 + r(3) * 6.28);
    const fade = Math.min(1, age / 0.08) * (1 - Math.pow(age, 1.6));
    out[i] = {
      dx: WIND.x * drift - WIND.z * sway,
      dy: rise,
      dz: WIND.z * drift + WIND.x * sway,
      size: size.start + (size.end - size.start) * Math.pow(age, 0.8) * (0.8 + 0.4 * r(4)),
      angle: r(5) * 6.28 + age * (r(6) - 0.5) * 1.6,
      alpha: Math.max(0, fade) * strength,
      shade: 0.78 + 0.16 * r(7),
    };
  }
  return out;
}

/** Nejvzdálenější dosah obláčků sloupce tvaru `shape` od zdroje (m) – je dým v záběru? */
export function plumeReach(shape: PlumeShape): { up: number; side: number } {
  return {
    up: shape.riseM * 1.2 + shape.size.end,
    side: shape.driftM * 1.2 + 1.4 + shape.size.end,
  };
}

/** Nejvzdálenější dosah obláčků od dýmníku (m) – pro kontrolu, jestli je dým v záběru. */
export const PLUME_REACH_M = plumeReach(HEARTH_PLUME);
