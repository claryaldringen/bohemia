// Klučení lesa pro pole po fázích (forest.md – Klučení lesa pro pole – postup): čisté funkce
// fáze dílu, potřeby práce dne a pádů stromů. Fáze se odvozuje z odvedené práce a dne, žádný
// čítač tiků.

import { dateOfDayIndex } from '../calendar';
import { monthInWindow } from './orchard';
import { foundingCostPerHa } from './productivity';
import { BURN_WINDOWS, FOREST_CLEARING } from './rules-fields';
import type { ClearingStage, FieldPart } from './types';

const EPSILON = 1e-9;
const M2_PER_HA = 10_000;

/** Práce pálení dílu (člověkodny): podíl sazby lesa za plochu, který nepatří ke kácení. */
export function clearingBurnCost(areaM2: number, toolCoverage: number): number {
  return (
    foundingCostPerHa('forest', toolCoverage) *
    (areaM2 / M2_PER_HA) *
    (1 - FOREST_CLEARING.fellShare)
  );
}

/** Práce kácení dílu (člověkodny): zbytek ceny založení po pálení (i s kameny). */
export function clearingFellCost(part: Pick<FieldPart, 'foundingCost' | 'clearing'>): number {
  return part.foundingCost - (part.clearing?.burnCost ?? 0);
}

/**
 * Fáze zakládaného dílu v lese ve dni `day`; `null` = díl bez fází (louka, křoviny, starší díl)
 * nebo už hotový. Schnutí trvá `dryDays` od pádu posledního stromu a končí nejdřív v okně
 * pálení; do pádu posledního stromu zapsaného simulací se počítá schnutí od dneška.
 */
export function clearingStage(
  part: Pick<FieldPart, 'clearing' | 'foundingCost' | 'foundingDone' | 'state'>,
  day: number,
): ClearingStage | null {
  const clearing = part.clearing;
  if (!clearing || part.state !== 'founding') return null;
  if (part.foundingDone >= part.foundingCost - EPSILON) return null;
  if (part.foundingDone < clearingFellCost(part) - EPSILON) return 'fell';
  const felledDay = clearing.felledDay ?? day;
  if (day < felledDay + FOREST_CLEARING.dryDays) return 'dry';
  return monthInWindow(BURN_WINDOWS, dateOfDayIndex(day).month) ? 'burn' : 'dry';
}

/**
 * Kolik práce dílu se dnes dá odvést: při kácení zbytek kácení, při schnutí nic, při pálení zbytek
 * celku; díl bez fází zbytek založení jako dosud.
 */
export function clearingNeedToday(
  part: Pick<FieldPart, 'clearing' | 'foundingCost' | 'foundingDone' | 'state'>,
  day: number,
): number {
  const rest = Math.max(0, part.foundingCost - part.foundingDone);
  const stage = clearingStage(part, day);
  if (stage === null) return rest;
  if (stage === 'dry') return 0;
  if (stage === 'burn') return rest;
  return Math.max(0, clearingFellCost(part) - part.foundingDone);
}

/**
 * Kolik stromů dílu má padnout při odvedené práci `done`: strom `i` padne, jakmile kácení dojde
 * na `(i + 1) / n` své ceny. Čtverec bez stromů se kácí jen kvůli kamenům – nic nepadá.
 */
export function treesDue(part: Pick<FieldPart, 'clearing' | 'foundingCost'>, done: number): number {
  const n = part.clearing?.fell.length ?? 0;
  if (n === 0) return 0;
  const fellCost = clearingFellCost(part);
  if (fellCost <= EPSILON) return n;
  return Math.min(n, Math.max(0, Math.floor((done / fellCost) * n + EPSILON)));
}

/**
 * První den pálení dílu (konec schnutí, nejdřív v okně pálení) pro panel – „Pálí se od března“;
 * `null`, dokud poslední strom nepadl.
 */
export function burnFromDay(part: Pick<FieldPart, 'clearing'>): number | null {
  const felledDay = part.clearing?.felledDay;
  if (felledDay === undefined) return null;
  const first = felledDay + FOREST_CLEARING.dryDays;
  for (let day = first; day < first + 366; day++) {
    if (monthInWindow(BURN_WINDOWS, dateOfDayIndex(day).month)) return day;
  }
  return null;
}
