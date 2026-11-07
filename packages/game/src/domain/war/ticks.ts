import { TOTAL_GAME_DAYS, type WorldClock } from '../calendar';
import { createRandom, deriveSeed, type Random } from '../landscape/random';
import { WAR } from './rules-war';

// Takty tažení (plán 2026-11-03 – rozhodnutí 12): tažení je první mechanika ve skutečném čase –
// server ho počítá po taktech (4 za sekundu) od začátku světa. Takt `t` začíná v okamžiku
// `startMs + t × 250 ms`; herní den taktu je den, ve kterém takt začíná (stejně jako kalendář).

/** Takty za skutečnou sekundu. */
export const TICKS_PER_SECOND = WAR.campaign.ticksPerSecond;
/** Délka taktu (ms). */
export const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Záměr hráče se plánuje na takt teď + 2 – výsledek nezávisí na tom, kdo a kdy počítá. */
export const INTENT_LEAD_TICKS = WAR.campaign.intentLeadTicks;
/** Kontrolní bod tažení v úložišti nejvýš po tolika taktech. */
export const CHECKPOINT_TICKS = WAR.campaign.checkpointTicks;

/** Takt, ve kterém leží skutečný okamžik `ms` (před začátkem světa záporný). */
export function tickOfMs(ms: number, world: WorldClock): number {
  return Math.floor((ms - world.startMs) / TICK_MS);
}

/** Skutečný okamžik (ms), kdy takt začíná. */
export function msOfTick(tick: number, world: WorldClock): number {
  return world.startMs + tick * TICK_MS;
}

/**
 * Herní den, ve kterém takt `tick` začíná – shodně s kalendářem (`getWorldState` v okamžiku
 * `msOfTick`). BigInt: uplynulé ms × počet dní přesahuje přesnost Number.
 */
export function dayOfTick(tick: number, world: WorldClock): number {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new RangeError(`Takt musí být celé nezáporné číslo: ${tick}`);
  }
  const elapsed = BigInt(tick) * BigInt(TICK_MS);
  const duration = BigInt(world.endMs - world.startMs);
  return Number((elapsed * BigInt(TOTAL_GAME_DAYS)) / duration);
}

/** Herní hodiny jednoho taktu (≈ 0,07 h – 344 taktů na herní den; prolamování v mužohodinách). */
export function hoursPerTick(world: WorldClock): number {
  return (24 * TICK_MS * TOTAL_GAME_DAYS) / (world.endMs - world.startMs);
}

/** Náhoda taktu – jen ze seedu tažení, čísla taktu a účelu (`label`), nikdy z pořadí výpočtu. */
export function tickRandom(seed: number, tick: number, label: string): Random {
  return createRandom(deriveSeed(seed, `${label}:${tick}`));
}
