import { ageGroup } from '../people/people';
import { WOOL } from '../rules';
import type { ChronicleEvent, LivestockState, VillageState } from '../types';

// Oděv – vlna (diet.md – Oděv; Martin 19. 10. 2026: „Ovce jsou hlavně kvůli vlně, aby se lidé
// mohli vůbec oblékat.“). Ves vždy chová tolik ovcí, aby měla vlnu na oděv pro všechny – je to
// spodní hranice stáda ovcí (livestock.ts – `winterTargets`, `sizeHerdsToNeed`), teprve nad ní
// rozhoduje rovnovážné hospodaření. Vlna není zásoba (Martin nechce nové suroviny): v rámci roku
// se zpracuje v domácí práci (`DOMESTIC`). Kolik oděvu ovce dají, se rozhodne při porážce 1. 11.
// podle ovcí, které ves nechá přes zimu (jaro je ostříhá) – do další porážky to platí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik surové vlny ves potřebuje na oděv za rok (kg) – podle věku lidí v den `day`. */
export function woolNeedKg(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + WOOL.kgPerYear[ageGroup(p, day)], 0);
}

/** Kolik chovných ovcí dá vlnu na oděv pro všechny (spodní hranice stáda ovcí). */
export function woolSheep(state: Pick<VillageState, 'people'>, day: number): number {
  return woolNeedKg(state, day) / WOOL.kgPerSheep;
}

/**
 * Podíl oděvu, na který ves má vlnu (0–1) – zapsaný při poslední porážce. Vsi bez zápisu (uložené
 * dřív, nové do první porážky) mají oděvu dost.
 */
export function woolCoverage(state: Pick<VillageState, 'livestock'>): number {
  return state.livestock?.wool ?? 1;
}

/**
 * Při porážce (1. 11., mutuje `livestock`): zapíše, na jaký podíl oděvu dají vlnu ovce, které ves
 * nechala přes zimu (`sheep` – bez ovcí na zimní porážku; `LivestockState.wool`), a když nestačí
 * (pod `WOOL.noticeBelow`), vrátí událost kroniky `wool-short`.
 */
export function recordWool(
  state: Pick<VillageState, 'people'>,
  livestock: LivestockState,
  day: number,
  sheep = livestock.herds.sheep,
): ChronicleEvent | null {
  const needed = woolSheep(state, day);
  const coverage = needed > EPSILON ? Math.min(1, sheep / needed) : 1;
  livestock.wool = coverage;
  if (coverage >= WOOL.noticeBelow - EPSILON) return null;
  return {
    day,
    kind: 'wool-short',
    sheep: Math.round(sheep * 10) / 10,
    needed: Math.ceil(needed - EPSILON),
  };
}

/** Štěstí, které ubere nedostatek vlny na oděv (0 – WOOL.unhappiness). */
export function woolUnhappiness(state: Pick<VillageState, 'livestock'>): number {
  return WOOL.unhappiness * (1 - woolCoverage(state));
}
