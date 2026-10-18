import { dateOfDayIndex } from '../calendar';
import type { CalendarDate } from '../calendar';
import { SLAUGHTER_DAY } from './diet';
import { feedHay, isHayWinter, MOWING_DAY, planMowing, villageHay, villageHayKg } from './hay';
import { BIRTH_DAY, ensureLivestock, herdBirths, layEggs, slaughter } from './livestock';
import { OXEN, penDay, penOxen, villageOxen, villagePens } from './oxen';
import type { ChronicleEvent, VillageState } from './types';

// Den hospodářství vsi (diet.md, oxen.md) – stáda, seno a ohrady v pevném pořadí, před plánem
// osevu a prací dne: ohrady (výcvik, stáří spřežení, 1. 3. pokrytí sena), 1. 4. mláďata a konec
// zimy, 1. 6. plán seče, 1. 11. porážka a začátek zimy, každý den vejce a v zimě seno.

/** Konec zimy pro voly (1. 3.) – pokrytí sena rozhodne o jarní orbě a úhynu. */
const WINTER_END = { month: 3, day: 1 } as const;

function isOn(date: CalendarDate, target: { month: number; day: number }): boolean {
  return date.month === target.month && date.day === target.day;
}

/**
 * Kolik kusů dobytka bude přes zimu žrát seno – krávy a voli; ohrada bez spřežení a výcviku
 * počítá se dvěma voly (výcvik se dá zadat kdykoli a telata seno potřebují – oxen.md).
 */
export function hayHeads(state: VillageState): number {
  const cows = state.livestock?.herds.cow ?? 0;
  return (
    cows + villagePens(state).reduce((sum, pen) => sum + Math.max(penOxen(pen), OXEN.teamSize), 0)
  );
}

/** Den hospodářství (mutuje stav); vrací události kroniky. */
export function husbandryDay(
  state: VillageState,
  day: number,
  toolCoverage: number,
): ChronicleEvent[] {
  const date = dateOfDayIndex(day);
  const livestock = ensureLivestock(state);
  const events = penDay(state, day, isOn(date, WINTER_END), toolCoverage);
  if (isOn(date, BIRTH_DAY)) {
    herdBirths(state);
    if (state.hay) delete state.hay.winter;
  }
  if (isOn(date, MOWING_DAY)) {
    const mowing = planMowing(state, day, hayHeads(state));
    if (mowing || state.hay) state.hay = { ...villageHay(state), mowing };
  }
  if (isOn(date, SLAUGHTER_DAY)) {
    const event = slaughter(state, day, villageOxen(state), villageHayKg(state));
    if (event) events.push(event);
    if (state.hay) state.hay.winter = { oxenNeedKg: 0, oxenEatenKg: 0 };
  }
  layEggs(state);
  if (isHayWinter(day)) feedHay(state, villageOxen(state), livestock.herds.cow);
  return events;
}
