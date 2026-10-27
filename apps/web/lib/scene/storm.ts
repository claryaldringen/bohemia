// Bouřka s kroupami ve scéně (disasters.md – Kroupy, Ve scéně; Martin 27. 10. 2026: „Když přijde
// bouřka s kroupami, chci, aby scéna potemněla a blýskalo se.“). Čisté funkce bez Babylonu
// (testy); kroupy a bílý pás kreslí storm-renderer.ts. Průběh bouřky je podle podílu dne
// krupobití (den ≈ 86 s), záblesky podle času – všichni hráči vidí blesk ve stejný okamžik.
import { hailZone, type HailStrip } from '@bohemia/game';
import type { DayLight, Grade } from './day-light';
import type { Rgb, SeasonLight } from './season-look';

/** Síla bouřky, krup a bílého pásu po krocích – světlo se při náběhu přepočítá nejvýš 10×. */
const STEPS = 10;

/**
 * Průběh dne krupobití (podíl dne od jeho začátku): bouřka se stáhne za desetinu dne, drží do
 * 0,6 a do 0,8 odejde; kroupy padají 0,1–0,5; bílý pás přibývá s kroupami a roztaje do půlky
 * dalšího dne (návrh Clauda).
 */
const STORM_DAY = { rise: [0, 0.1], fall: [0.6, 0.8] } as const;
const HAIL_FALL = { rise: [0.1, 0.16], fall: [0.42, 0.5] } as const;
const HAIL_COVER = { rise: [0.12, 0.45], fall: [0.6, 1.5] } as const;

/** Ve které síle bouřky se blýská (při slabší bouřce už ne). */
const FLASH_MIN_STORM = 0.6;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function ramp(t: number, from: number, to: number): number {
  return clamp01((t - from) / (to - from));
}

function stepped(v: number): number {
  return Math.round(clamp01(v) * STEPS) / STEPS;
}

function envelope(
  t: number,
  phase: { rise: readonly [number, number]; fall: readonly [number, number] },
): number {
  if (!(t >= 0)) return 0;
  return stepped(
    ramp(t, phase.rise[0], phase.rise[1]) * (1 - ramp(t, phase.fall[0], phase.fall[1])),
  );
}

/** Síla bouřky 0–1 v okamžiku `t` = den světa − den krupobití (po desetinách); mimo bouřku 0. */
export function stormAmount(t: number): number {
  return envelope(t, STORM_DAY);
}

/** Kolik krup padá 0–1 (podíl částic) v okamžiku `t` od začátku dne krupobití. */
export function hailFall(t: number): number {
  return envelope(t, HAIL_FALL);
}

/** Bílý pás krup na zemi 0–1 – přibývá s kroupami a roztaje do půlky dalšího dne. */
export function hailCover(t: number): number {
  return envelope(t, HAIL_COVER);
}

/** Váha bílého pásu v bodě: vnitřek pruhu 1, okraj (poloviční škoda v jádru) 0,5, mimo 0. */
export function hailWeight(strip: HailStrip, x: number, z: number): number {
  const zone = hailZone(strip, x, z);
  return zone === 'core' ? 1 : zone === 'edge' ? 0.5 : 0;
}

/** Celé číslo → 0–1 (hash bez stavu). */
function hash(n: number, salt: number): number {
  let h = Math.imul((n | 0) ^ 0x27d4eb2d, 0x9e3779b1) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Blesky: okno (ms), v němž nejvýš jeden blesk, šance blesku v okně a průběh záblesku.
 * Bezpečné pro oči (WCAG 2.3.1 – nejvýš 3 záblesky za sekundu): každý blesk má jedinou
 * špičku (jas jen roste, pak jen klesá) a mezi blesky sousedních oken je tma aspoň
 * `FLASH_GAP_MS` – za libovolnou sekundu tak nejvýš 2 vzestupy jasu.
 */
const FLASH_SLOT_MS = 1800;
const FLASH_CHANCE = 0.45;
const FLASH_GAP_MS = 400;
/** Záblesk: [do ms od začátku, síla] – náběh, úder, pak už jen pohasíná (bez druhé špičky). */
const FLASH_PULSES: readonly (readonly [number, number])[] = [
  [50, 0.6],
  [140, 1],
  [230, 0.7],
  [330, 0.4],
  [450, 0.15],
];

/**
 * Záblesk blesku 0–1 v čase `epochMs` – deterministicky z času (všichni hráči týž okamžik),
 * nejvýš jeden blesk za `FLASH_SLOT_MS`, začátek tak, aby po něm do dalšího okna zbyla tma
 * `FLASH_GAP_MS`; síla po krocích (překresluje se jen při změně).
 */
export function lightningFlash(epochMs: number): number {
  if (!Number.isFinite(epochMs)) return 0;
  const slot = Math.floor(epochMs / FLASH_SLOT_MS);
  if (hash(slot, 0x1b37) >= FLASH_CHANCE) return 0;
  const lastPulse = FLASH_PULSES[FLASH_PULSES.length - 1]![0];
  const start = hash(slot, 0x5e11) * (FLASH_SLOT_MS - lastPulse - FLASH_GAP_MS);
  const since = epochMs - slot * FLASH_SLOT_MS - start;
  if (since < 0) return 0;
  // slabší blesky dál v krajině – síla celého záblesku 0,5–1
  const strength = 0.5 + 0.5 * hash(slot, 0x7a2f);
  for (const [until, level] of FLASH_PULSES) {
    if (since < until) return Math.round(level * strength * 20) / 20;
  }
  return 0;
}

/** Záblesk jen v silné bouřce. */
export function stormFlash(storm: number, epochMs: number): number {
  return storm >= FLASH_MIN_STORM ? lightningFlash(epochMs) : 0;
}

/**
 * Bouřka (násobky a barvy při plné síle): tmavá mračna místo oblohy, slunce skoro zhasne,
 * oblaka, okolní světlo i tón materiálů bez světla (impostory, dým) ztmavnou, opar zhoustne
 * a zešedne, stíny skoro zmizí, barvy vyblednou (filtr obrazu – jen s denní dobou).
 */
export const STORM = {
  sun: 0.3,
  sunColor: [0.72, 0.76, 0.84] as Rgb,
  sky: 0.55,
  skyColor: [0.5, 0.54, 0.6] as Rgb,
  ground: 0.6,
  clearColor: [0.17, 0.19, 0.23] as Rgb,
  fogColor: [0.25, 0.27, 0.31] as Rgb,
  fog: 1.6,
  ambient: 0.6,
  tone: 0.6,
  shadows: 0.05,
  waterSky: [0.2, 0.22, 0.26] as Rgb,
  saturation: -30,
};

/** Záblesk (přírůstky při plném záblesku): oblaka, okolní světlo a tón, světlá obloha. */
export const FLASH = {
  sky: 2.2,
  skyColor: [0.86, 0.9, 1] as Rgb,
  ambient: 0.7,
  tone: 0.9,
  clearColor: [0.8, 0.83, 0.95] as Rgb,
  fogColor: [0.62, 0.65, 0.74] as Rgb,
};

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const scaleRgb = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const addRgb = (a: Rgb, k: number): Rgb => [a[0] + k, a[1] + k, a[2] + k];

/**
 * Světlo za bouřky (`storm` 0–1) se zábleskem (`flash` 0–1): ztmavení celé scény jako násobek
 * světla dne a filtru obrazu; záblesk krátce zvýší světlo oblak a okolní světlo (ne slunce –
 * stínová mapa se nepřekresluje). Bez bouřky `day` beze změny (stejný objekt).
 */
export function stormLight(day: DayLight, storm: number, flash: number): DayLight {
  if (storm <= 0) return day;
  const s = clamp01(storm);
  const f = clamp01(flash);
  const dim = (k: number): number => 1 - (1 - k) * s;
  const light: SeasonLight = {
    ...day.light,
    sunIntensity: day.light.sunIntensity * dim(STORM.sun),
    sunColor: mixRgb(day.light.sunColor, STORM.sunColor, 0.7 * s),
    skyIntensity: day.light.skyIntensity * dim(STORM.sky) + FLASH.sky * f,
    skyColor: mixRgb(mixRgb(day.light.skyColor, STORM.skyColor, 0.6 * s), FLASH.skyColor, f),
    groundColor: scaleRgb(day.light.groundColor, dim(STORM.ground)),
    clearColor: mixRgb(
      mixRgb(day.light.clearColor, STORM.clearColor, 0.85 * s),
      FLASH.clearColor,
      0.7 * f,
    ),
    fogColor: mixRgb(mixRgb(day.light.fogColor, STORM.fogColor, 0.8 * s), FLASH.fogColor, 0.6 * f),
    fogDensity: day.light.fogDensity * (1 + (STORM.fog - 1) * s),
  };
  const grade: Grade = {
    ...day.grade,
    saturation: day.grade.saturation + STORM.saturation * s,
  };
  return {
    ...day,
    light,
    ambient: addRgb(scaleRgb(day.ambient, dim(STORM.ambient)), FLASH.ambient * f),
    tone: addRgb(scaleRgb(day.tone, dim(STORM.tone)), FLASH.tone * f),
    waterSky: mixRgb(day.waterSky, STORM.waterSky, 0.7 * s),
    grade,
    shadowStrength: day.shadowStrength * dim(STORM.shadows),
  };
}

/** Kroupy padají s deštěm – síla deště za bouřky (× síla bouřky). */
export const STORM_RAIN = 0.7;
