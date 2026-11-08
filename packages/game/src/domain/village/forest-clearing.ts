// Klučení lesa pro pole po fázích (forest.md – Klučení lesa pro pole – postup): čisté funkce
// fáze dílu, potřeby práce dne a pádů stromů. Fáze se odvozuje z odvedené práce a dne, žádný
// čítač tiků.

import { dateOfDayIndex } from '../calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { fellTrees, obstacleChangesAt } from './obstacles';
import { monthInWindow } from './orchard';
import { foundingCostPerHa } from './productivity';
import { BURN_WINDOWS, FOREST_CLEARING } from './rules-fields';
import { squareCenter } from './square-grid';
import { fieldGridOf } from './squares';
import type { ClearingStage, FieldPart, VillageState } from './types';
import { addLogs, logsFromClearedTrees } from './wood';

const EPSILON = 1e-9;
const M2_PER_HA = 10_000;
/** Krajina sídla má pevnou velikost (landscape/world.ts). */
const GEOMETRY = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M } as const;

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

/**
 * Střed čtverce dílu ve světě (m) – místo kácení pro hromadu klád (`addLogs`); díl bez políčka
 * (kalibrace bez krajiny) null.
 */
export function partCenter(
  state: Pick<VillageState, 'fields'>,
  part: Pick<FieldPart, 'cell' | 'fieldId'>,
): { x: number; z: number } | null {
  return part.cell ? squareCenter(GEOMETRY, fieldGridOf(state, part.fieldId), part.cell) : null;
}

/**
 * Je kácení dílu hotové? Práce kácení odvedená (i se zaokrouhlením) – poslední strom padl.
 */
function fellingDone(part: Pick<FieldPart, 'clearing' | 'foundingCost' | 'foundingDone'>): boolean {
  return part.foundingDone >= clearingFellCost(part) - EPSILON;
}

/**
 * Pokácí stromy dílu, na které došla práce kácení (mutuje stav; forest.md – Klučení lesa pro
 * pole – postup, bod 1): jedno `fellTrees` za díl a den, po každém stromu zůstane pařez. Strom,
 * který mezitím padl jinak (dřevo stavby, uhlíř) nebo zmizel, se přeskočí bez klády; dospělé
 * stromy dají klády na hromadu pole u cesty nejblíž čtverci dílu, na kterém padl první z nich
 * (bez cesty v dosahu u čtverce – `addLogs`). Jakmile je kácení hotové, padnou všechny zbylé stromy a začne schnutí (`felledDay`).
 */
export function fellDueTrees(state: VillageState, part: FieldPart, day: number): void {
  const clearing = part.clearing;
  if (!clearing) return;
  const done = fellingDone(part);
  const due = done ? clearing.fell.length : treesDue(part, part.foundingDone);
  if (due > clearing.felled) {
    // stojí jen strom, který není odstraněný, pařezem ani mladým stromkem
    const changes = obstacleChangesAt(state, day);
    const gone = new Set([...changes.removed, ...changes.stumps, ...changes.saplings]);
    const falling = clearing.fell.slice(clearing.felled, due).filter((t) => !gone.has(t.id));
    if (falling.length > 0) {
      state.felledTrees =
        fellTrees(
          state,
          falling.map((t) => t.id),
          day,
        ).felledTrees ?? [];
    }
    const logs = logsFromClearedTrees(falling.filter((t) => t.log).length);
    if (logs > 0) {
      addLogs(state, logs, partCenter(state, part), part.fieldId);
    }
    clearing.felled = due;
  }
  if (done && clearing.felledDay === undefined) clearing.felledDay = day;
}

/**
 * Pořadí práce na zakládaných dílech pole ve dni `day` (forest.md – Rozdělení práce): napřed
 * díly ve fázi pálení, pak kácení a díly bez fází – obojí od nejbližšího k obydlí, při shodě podle
 * id; schnoucí díly práci neberou a v pořadí nejsou.
 */
export function clearingWorkOrder(parts: readonly FieldPart[], day: number): FieldPart[] {
  const byDistance = (a: FieldPart, b: FieldPart): number =>
    a.distanceM - b.distanceM || a.id - b.id;
  const burning: FieldPart[] = [];
  const rest: FieldPart[] = [];
  for (const part of parts) {
    const stage = clearingStage(part, day);
    if (stage === 'burn') burning.push(part);
    else if (stage !== 'dry') rest.push(part);
  }
  return [...burning.sort(byDistance), ...rest.sort(byDistance)];
}

/** Doutnají pařezy dílu ve dni `day`? `smolderDays` od dohoření (scéna – kouř bez plamenů). */
export function isSmoldering(part: Pick<FieldPart, 'burnedDay'>, day: number): boolean {
  const burned = part.burnedDay;
  return burned !== undefined && day >= burned && day < burned + FOREST_CLEARING.smolderDays;
}
