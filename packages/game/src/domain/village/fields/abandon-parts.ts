import { validateActionDay } from '../core/actions';
import { toAbandonedFallow } from './rotation';
import type { ChronicleEvent, FieldPart, VillageState } from '../types';

// Opuštění dílu pole (fields.md – Opuštěný díl; Martin 8. 11. 2026: „A“ – „Vypustit díly pole –
// akce pro hráče i správce, kterou díly vypadnou z oběhu a zarostou; stejná akce pro oba.“).
// Návrh Clauda: opuštěný díl zůstane v poli jako trvalý příloh, který se už neoseje (osevní
// postup ho přeskočí – `sowingGroup`, `nextSowing`), a zarůstá podle Zarůstání; osetý díl se
// opustí až po žních (`rotateAfterSeason` 1. 9.), nezaložený díl se neopouští – zrušit jde stavba.
// Vrácení je tatáž akce opačně: díl se vrátí do osevního postupu jako příloh (vrácení zarostlého
// stojí práci podle Zarůstání). Bez ceny – hráč smí kdykoli.

/** Díl už v poli není (zarostl lesem, pole zaniklo). */
export const ABANDON_NO_PART = 'Ten díl pole už není.';
/** Nezaložený díl se neopouští – rozestavěné pole jde zrušit (cancel-construction.ts). */
export const ABANDON_FOUNDING = 'Díl se teprve zakládá – zrušit jde celá stavba.';
/** Díl už je opuštěný. */
export const ABANDON_ALREADY = 'Díl už je opuštěný.';
/** Vrátit jde jen opuštěný díl. */
export const RETURN_NOT_ABANDONED = 'Díl není opuštěný.';

/** Důvod, proč díl opustit (`abandon`), nebo vrátit do osevu, nejde; null = jde. */
export function abandonPartBlock(
  part: Pick<FieldPart, 'state' | 'abandoned'>,
  abandon: boolean,
): string | null {
  if (!abandon) return part.abandoned ? null : RETURN_NOT_ABANDONED;
  if (part.state === 'founding') return ABANDON_FOUNDING;
  return part.abandoned ? ABANDON_ALREADY : null;
}

/** Důvod, proč díly `partIds` opustit či vrátit nejde (první díl s důvodem); null = jdou všechny. */
export function abandonPartsBlock(
  state: Pick<VillageState, 'parts'>,
  partIds: readonly number[],
  abandon: boolean,
): string | null {
  if (partIds.length === 0) return ABANDON_NO_PART;
  for (const id of partIds) {
    const part = state.parts.find((p) => p.id === id);
    if (!part) return ABANDON_NO_PART;
    const block = abandonPartBlock(part, abandon);
    if (block !== null) return block;
  }
  return null;
}

/**
 * Opustí díly `partIds` (`abandon`), nebo je vrátí do osevu (mutuje stav – pro den správce):
 * připravený díl jde hned do přílohu, příloh zůstane, jak leží, osetý díl dál roste a do přílohu
 * jde 1. 9. po žních; vrácený díl je zase v osevním postupu. Jeden řádek kroniky. RangeError,
 * když díly opustit či vrátit nejde (`abandonPartsBlock`).
 */
export function setPartsAbandoned(
  state: VillageState,
  day: number,
  partIds: readonly number[],
  abandon: boolean,
): ChronicleEvent {
  const block = abandonPartsBlock(state, partIds, abandon);
  if (block !== null) throw new RangeError(block);
  const chosen = new Set(partIds);
  for (const part of state.parts) {
    if (!chosen.has(part.id)) continue;
    if (!abandon) {
      delete part.abandoned;
      continue;
    }
    part.abandoned = true;
    if (part.state === 'ready') toAbandonedFallow(part, day);
  }
  const event: ChronicleEvent = abandon
    ? { day, kind: 'parts-abandoned', parts: chosen.size }
    : { day, kind: 'parts-returned', parts: chosen.size };
  state.chronicle.push(event);
  return event;
}

/**
 * Opustí díly pole `partIds`, nebo je vrátí do osevu (`abandon` false) – čistá funkce pro hráče
 * i správce (`setPartsAbandoned`). RangeError pro den do minulosti vsi a díly, které opustit či
 * vrátit nejde. Vstupní stav se nemění.
 */
export function abandonFieldParts(
  state: VillageState,
  day: number,
  partIds: readonly number[],
  abandon: boolean,
): VillageState {
  validateActionDay(state, day);
  const block = abandonPartsBlock(state, partIds, abandon);
  if (block !== null) throw new RangeError(block);
  const next = structuredClone(state);
  setPartsAbandoned(next, day, partIds, abandon);
  return next;
}
