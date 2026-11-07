// Oheň pohřební hranice bez Babylonu (docs/design/cemetery.md – Pohřeb ve scéně): plameny, jiskry
// a záře jako sprity (textures/particles/fire.png – tools/blender/funeral.py), deterministicky
// podle času jako dým (smoke-schedule.ts – plumePuffs): každý plamen žije necelou sekundu, roste
// z hranice nahoru a mizí, jiskry vyletují vysoko a vítr je odnáší. Síla ohně (`pyreState` –
// funeral-plan.ts) řídí, kolik plamenů je vidět, jak jsou vysoké a jak svítí.
import { hash01 } from './smoke-schedule';
import { PYRE } from './funeral-plan';

/** Kolik plamenů, jisker a září má jedna hranice (sprity). */
export const FLAMES_PER_PYRE = 26;
export const SPARKS_PER_PYRE = 16;
/** Buňky textury fire.png: plamen, rozervaný plamen, jiskra, záře. */
export const FIRE_CELLS = { flame: 0, ragged: 1, spark: 2, glow: 3 } as const;

/**
 * Tvar ohně: rozměry toho, co hoří (m – podél, napříč, výška), a kolik plamenů a jisker má.
 * Hranice (PYRE_FIRE), nebo hromada větví na pasece (`heapFire` – clearing-fire.ts).
 */
export interface FireShape {
  lengthM: number;
  widthM: number;
  heightM: number;
  flames: number;
  sparks: number;
  /** Násobek velikosti plamenů a záře (hranice 1). */
  scale: number;
}

/** Pohřební hranice. */
export const PYRE_FIRE: FireShape = {
  lengthM: PYRE.lengthM,
  widthM: PYRE.widthM,
  heightM: PYRE.heightM,
  flames: FLAMES_PER_PYRE,
  sparks: SPARKS_PER_PYRE,
  scale: 1,
};

/** Sprity jednoho ohně tvaru `shape` (plameny, jiskry a záře). */
export function fireSpriteCount(shape: FireShape): number {
  return shape.flames + shape.sparks + 1;
}

/** Sprite ohně: posun od středu hranice na zemi (m, v osách světa), velikost, buňka a barva. */
export interface FireSprite {
  dx: number;
  dy: number;
  dz: number;
  width: number;
  height: number;
  angle: number;
  cell: number;
  /** Násobek barvy textury (aditivně – 0 = nesvítí). */
  intensity: number;
}

/** Vítr – stejný směr jako dým z obydlí (smoke-schedule.ts), jiskry odnáší méně. */
const WIND = { x: 0.94, z: 0.34 };

function blank(): FireSprite {
  return { dx: 0, dy: 0, dz: 0, width: 0, height: 0, angle: 0, cell: 0, intensity: 0 };
}

/**
 * Sprity ohně hranice v čase `timeS` (s): `fire` síla plamenů 0–1, `stack` výška hranice 0–1
 * (plameny šlehají z hranice, jak sesedá, jsou níž), `glow` žhavé uhlíky 0–1 (měkká záře nad
 * nimi), `heading` natočení hranice (podélná osa), `shape` tvar ohně (bez údaje hranice).
 * Pořadí: plameny, jiskry, záře.
 */
export function fireSprites(
  seed: number,
  timeS: number,
  state: { fire: number; stack: number; glow: number },
  heading: { x: number; z: number },
  out: FireSprite[] = [],
  shape: FireShape = PYRE_FIRE,
): FireSprite[] {
  const FLAMES = shape.flames;
  const SPARKS = shape.sparks;
  const k = shape.scale;
  const total = FLAMES + SPARKS + 1;
  while (out.length < total) out.push(blank());
  out.length = total;
  const { fire, stack, glow } = state;
  // osy hranice: podél (heading) a napříč
  const ax = heading.x;
  const az = heading.z;
  const top = shape.heightM * Math.max(0.15, stack);
  for (let i = 0; i < FLAMES; i++) {
    const o = out[i]!;
    const life = 0.7 + 0.45 * hash01(seed, i, 41);
    const phase = timeS / life + hash01(seed, i, 42);
    const generation = Math.floor(phase);
    const age = phase - generation;
    const r = (k: number): number => hash01(seed * 977 + i, generation, k);
    // kolik plamenů hoří – slabý oheň jen část (podle pořadí plamene)
    const lit = fire > 0.02 && i / FLAMES < 0.15 + 0.85 * fire;
    const along = (r(1) - 0.5) * shape.lengthM * 0.95;
    const across = (r(2) - 0.5) * shape.widthM * 0.9;
    const base = top * (0.25 + 0.75 * r(3));
    const rise = k * (0.5 + 1.2 * fire) * age * (0.7 + 0.6 * r(4));
    const size =
      k * (0.55 + 0.9 * fire) * (0.6 + 0.5 * r(5)) * Math.sin(Math.PI * Math.min(1, age * 1.15));
    const sway = 0.12 * Math.sin(age * 6 + r(6) * 6.28);
    o.dx = ax * along - az * across + WIND.x * rise * 0.25 + sway;
    o.dz = az * along + ax * across + WIND.z * rise * 0.25;
    o.dy = base + rise;
    o.width = size * 0.62;
    o.height = size;
    o.angle = (r(7) - 0.5) * 0.35;
    o.cell = r(8) < 0.5 ? FIRE_CELLS.flame : FIRE_CELLS.ragged;
    o.intensity = lit ? (0.55 + 0.45 * fire) * (1 - age * 0.6) : 0;
  }
  for (let j = 0; j < SPARKS; j++) {
    const i = FLAMES + j;
    const o = out[i]!;
    const life = 1.6 + 1.2 * hash01(seed, i, 51);
    const phase = timeS / life + hash01(seed, i, 52);
    const generation = Math.floor(phase);
    const age = phase - generation;
    const r = (j: number): number => hash01(seed * 613 + i, generation, j);
    const lit = fire > 0.1 && j / SPARKS < fire;
    const rise = k * (2.5 + 4 * r(1)) * (1 - (1 - age) * (1 - age));
    const drift = 2.2 * age * age * (0.6 + 0.8 * r(2));
    const spin = 0.4 * Math.sin(age * 9 + r(3) * 6.28);
    o.dx = ax * (r(4) - 0.5) * shape.lengthM + WIND.x * drift + spin;
    o.dz = az * (r(4) - 0.5) * shape.lengthM + (r(5) - 0.5) * shape.widthM + WIND.z * drift;
    o.dy = top + 0.4 + rise;
    const size = 0.09 + 0.07 * r(6);
    o.width = size;
    o.height = size;
    o.angle = 0;
    o.cell = FIRE_CELLS.spark;
    // jiskra bliká a dohasíná
    o.intensity = lit ? (1 - age) * (0.6 + 0.4 * Math.abs(Math.sin(age * 23 + r(7) * 6))) : 0;
  }
  // měkká záře nad hranicí – svítí oheň i žhavé uhlíky
  const g = out[total - 1]!;
  const light = Math.max(fire, 0.4 * glow);
  g.dx = 0;
  g.dz = 0;
  g.dy = 0.4 + 0.8 * top * fire;
  g.width = k * (3 + 3.5 * fire + 1.2 * glow);
  g.height = g.width;
  g.angle = 0;
  g.cell = FIRE_CELLS.glow;
  g.intensity = 0.35 * light;
  return out;
}

/** Nejvzdálenější dosah ohně od středu hranice (m) – je oheň v záběru? */
export const FIRE_REACH_M = { up: PYRE.heightM + 8, side: 4 };
