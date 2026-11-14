// Déšť ve scéně (disasters.md – Ve scéně, Deštivé léto): dny deště ze seedu dne – jen vzhled,
// pravidla o nich nevědí. Prohlížeč je počítá ze dne světa (`gameDayAt`) deterministicky – všichni
// hráči vidí déšť ve stejné dny. Bez Babylonu (testy); částice kreslí rain-renderer.ts.
import type { DayLight } from './day-light';
import type { Rgb, SeasonLight } from './season-look';

/** Podíl deštivých dnů při plném mokru (deštivé léto se silou 1); při menším mokru úměrně méně. */
const RAIN_DAY_SHARE = 0.55;
/** Síla deště v deštivý den: RAIN_MIN až 1 (podle seedu dne). */
const RAIN_MIN = 0.6;
/** Přechod mezi dnem s deštěm a bez (podíl dne ≈ 10 s) – déšť začne a skončí plynule. */
const RAIN_FADE = 0.12;
/** Síla deště po krocích – světlo a kaluže se při náběhu přepočítají nejvýš desetkrát. */
const RAIN_STEPS = 10;

/** Celé číslo → 0–1 (hash bez stavu – seed dne). */
function dayHash(day: number, salt: number): number {
  let h = Math.imul((day | 0) ^ 0x5bd1e995, 0x9e3779b1) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Síla deště 0–1 celý herní den `day` (pořadí dne světa) při mokru `wet` 0–1; bez deště 0. */
export function rainOnDay(day: number, wet: number): number {
  if (wet <= 0 || dayHash(day, 0x2f6b) >= RAIN_DAY_SHARE * Math.min(1, wet)) return 0;
  return RAIN_MIN + (1 - RAIN_MIN) * dayHash(day, 0x71c3);
}

/**
 * Síla deště 0–1 v okamžiku `gameDay` (desetinný den světa) při mokru `wet` (`SeasonLook.wet`):
 * přes den stejná, na přelomu dnů plynulý přechod; po krocích desetin. Bez mokra vždy 0.
 */
export function rainAmount(gameDay: number, wet: number): number {
  if (wet <= 0 || !Number.isFinite(gameDay)) return 0;
  const day = Math.floor(gameDay);
  const f = gameDay - day;
  const now = rainOnDay(day, wet);
  let amount = now;
  if (f < RAIN_FADE) {
    const edge = (rainOnDay(day - 1, wet) + now) / 2;
    amount = edge + (now - edge) * smooth(f / RAIN_FADE);
  } else if (f > 1 - RAIN_FADE) {
    const edge = (rainOnDay(day + 1, wet) + now) / 2;
    amount = now + (edge - now) * smooth((f - (1 - RAIN_FADE)) / RAIN_FADE);
  }
  return Math.round(amount * RAIN_STEPS) / RAIN_STEPS;
}

/**
 * Mokrá zem a kaluže 0–1 (`seasonC.w`, season-materials.ts – `seasonPuddle`): v deštivém létě
 * zůstávají kaluže i mezi dešti (× 0,45 mokra), za deště přibývají.
 */
export function puddleAmount(wet: number, rain: number): number {
  return Math.min(1, 0.45 * Math.max(0, wet) + 0.7 * Math.max(0, rain));
}

/** Zataženo za deště: šedé slunce, světlo oblohy a opar (násobky při plném dešti). */
const OVERCAST = {
  sun: 0.5,
  sunColor: [0.86, 0.89, 0.93] as Rgb,
  sky: 0.92,
  skyColor: [0.74, 0.77, 0.8] as Rgb,
  clearColor: [0.56, 0.59, 0.63] as Rgb,
  fogColor: [0.62, 0.65, 0.68] as Rgb,
  fog: 1.9,
  shadows: 0.2,
  waterSky: [0.5, 0.53, 0.57] as Rgb,
};

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Světlo za deště (zataženo): slunce slabší a šedé, šedá obloha a hustší opar, skoro bez stínů.
 * Bez deště `day` beze změny (stejný objekt).
 */
export function overcast(day: DayLight, rain: number): DayLight {
  if (rain <= 0) return day;
  const r = Math.min(1, rain);
  const light: SeasonLight = {
    ...day.light,
    sunIntensity: day.light.sunIntensity * (1 - (1 - OVERCAST.sun) * r),
    sunColor: mixRgb(day.light.sunColor, OVERCAST.sunColor, 0.7 * r),
    skyIntensity: day.light.skyIntensity * (1 - (1 - OVERCAST.sky) * r),
    skyColor: mixRgb(day.light.skyColor, OVERCAST.skyColor, 0.6 * r),
    clearColor: mixRgb(day.light.clearColor, OVERCAST.clearColor, 0.75 * r),
    fogColor: mixRgb(day.light.fogColor, OVERCAST.fogColor, 0.7 * r),
    fogDensity: day.light.fogDensity * (1 + (OVERCAST.fog - 1) * r),
  };
  return {
    ...day,
    light,
    shadowStrength: day.shadowStrength * (1 - (1 - OVERCAST.shadows) * r),
    waterSky: mixRgb(day.waterSky, OVERCAST.waterSky, 0.6 * r),
  };
}

/** Kapky v okolí kamery: kolik jich je při plném dešti a jak velký je kvádr (× vzdálenost kamery). */
export const RAIN_DROPS = 1800;
const BOX_PER_RADIUS = 0.9;
const BOX_MIN_M = 30;
const BOX_MAX_M = 420;
/** Rychlost pádu (m/s), délka čárky (× strana kvádru) a vítr – šikmý déšť (posun na metr pádu). */
const FALL_MPS = 9;
const STREAK_PER_BOX = 0.035;
export const RAIN_WIND: readonly [number, number] = [0.18, 0.08];

/** Kvádr deště kolem cíle kamery: strana (m), výška (m), délka čárky (m) a šířka (m). */
export interface RainBox {
  side: number;
  height: number;
  streak: number;
  width: number;
}

/**
 * Rozmazání pohybem: čárka je aspoň tak dlouhá, jako kapka urazí mezi dvěma posuny (× 1,5), jinak
 * by při řídkých snímcích (okno bez fokusu 10 fps, škrcení záložky) kapka poskočila o víc, než je
 * její čárka, a oko by ji spárovalo s jinou – déšť by vypadal pomalý nebo obrácený (časový aliasing).
 */
const STREAK_BLUR = 1.5;
/** Nejdelší započtený čas mezi posuny (s) – po dlouhé pauze nebo skryté záložce nevzniknou obří čárky. */
const STREAK_MAX_DT = 1;
/** Čárka nejvýš tolik výšky kvádru. */
const STREAK_MAX_OF_HEIGHT = 0.4;

/** Délka čárky (m) při čase `dtSeconds` od minulého posunu; nejméně `box.streak`. */
export function streakLength(box: RainBox, look: DropLook, dtSeconds: number): number {
  const dt = Number.isFinite(dtSeconds) ? Math.min(STREAK_MAX_DT, Math.max(0, dtSeconds)) : 0;
  const blurred = look.fallMps * dt * STREAK_BLUR;
  return Math.min(Math.max(box.streak, blurred), box.height * STREAK_MAX_OF_HEIGHT);
}

export function rainBox(radius: number, look: DropLook = RAIN_LOOK): RainBox {
  const side = Math.min(BOX_MAX_M, Math.max(BOX_MIN_M, radius * BOX_PER_RADIUS));
  return { side, height: side * 0.6, streak: side * look.streak, width: side * look.width };
}

/**
 * Jak padají a vypadají částice (déšť, kroupy – storm.ts): rychlost pádu (m/s), vítr (posun na
 * metr pádu), délka a šířka čárky (× strana kvádru).
 */
export interface DropLook {
  fallMps: number;
  wind: readonly [number, number];
  streak: number;
  width: number;
}

export const RAIN_LOOK: DropLook = {
  fallMps: FALL_MPS,
  wind: RAIN_WIND,
  streak: STREAK_PER_BOX,
  width: 0.0011,
};

/**
 * Poloha kapky `i` v čase `t` (s): x, z ukotvené ve světě (kvádr se při posunu kamery jen
 * přeskládá, kapky neplavou s kamerou), y padá dolů a dokola. `seeds` = 3 čísla 0–1 na kapku.
 * Zapíše do `out` (x, y, z) relativně k zemi pod cílem kamery.
 */
export function dropPosition(
  seeds: Float32Array,
  i: number,
  t: number,
  center: { x: number; z: number },
  box: RainBox,
  out: [number, number, number],
  look: DropLook = RAIN_LOOK,
): void {
  const half = box.side / 2;
  const wrap = (u: number, c: number): number => {
    const w = u * box.side - (c - half);
    return c - half + (((w % box.side) + box.side) % box.side);
  };
  const fall = (seeds[i * 3 + 2]! * box.height + t * look.fallMps) % box.height;
  const y = box.height - fall;
  // vítr: čím níž, tím dál po větru (šikmé čárky jsou rovnoběžné s dráhou kapky)
  out[0] = wrap(seeds[i * 3]!, center.x) + look.wind[0] * fall;
  out[1] = y - box.height * 0.15;
  out[2] = wrap(seeds[i * 3 + 1]!, center.z) + look.wind[1] * fall;
}

/** Náhodná semínka kapek (deterministicky) – 3 čísla 0–1 na kapku. */
export function dropSeeds(count: number): Float32Array {
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = dayHash(i, 0x3c6e);
  return seeds;
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
