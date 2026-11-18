import { foodNeedPerDay, guestFoodNeedPerDay } from './people';
import { proteinNeedPerDay } from '../core/diet';
import { lordFamily } from './lord';
import { masterHousehold } from './lodge-life';
import { nextStarvationDays } from './population';
import { HUNGER_PRIORITY } from '../rules/rules-people';
import type { Person, VillageState } from '../types';

// Přednost v hladu (population.md – Hlad a vymření, Přednost v hladu; diet.md – Hlad; Martin
// 17. 11. 2026: „Ano, elita ať jí první – kníže, pak zahraniční mistři a pak ostatní řemeslníci.
// Vycvičit řemeslníky totiž trvá dlouho a stojí zdroje“, „I s rodinami“).

/** Počet skupin: rod vojvody, domácnosti mistrů huti, řemeslníci a učni, zbytek vsi. */
export const HUNGER_GROUPS = 4;

/** Index nejnižší skupiny (zbytek vsi) – i hosté. */
const REST = HUNGER_GROUPS - 1;

/** Rozdělení lidí vsi do skupin přednosti a jejich potřeba jídla. */
export interface HungerSplit {
  /** Skupina člověka (id → 0–3); kdo v mapě chybí (narodil se po rozdělení), patří do zbytku. */
  readonly groupOf: ReadonlyMap<number, number>;
  /** Potřeba jídla skupin za den (kg obilí); hosté jsou ve zbytku. */
  readonly needs: readonly number[];
  /**
   * Potřeba bílkovin skupin za den (kg – `proteinNeedPerDay` lidí skupiny); hosté bílkoviny
   * nenesou, jako potřeba bílkovin vsi (`villageProteinNeed`).
   */
  readonly proteinNeeds: readonly number[];
  /** Počet jedlíků ve skupinách (lidé, ve zbytku i hosté). */
  readonly counts: readonly number[];
}

/**
 * Do které skupiny přednosti kdo patří (člověk patří do nejvyšší skupiny, kam ho řadí kterékoli
 * pravidlo): 0 – rod vojvody ve vsi (vojvoda a rodina ve dvorci i v domech elity a vedlejší
 * manželky – `lordFamily`); 1 – domácnosti zahraničních mistrů huti (`masterHousehold`);
 * 2 – domácnosti ostatních řemeslníků (obydlí s dílnou) a každý, kdo se řemeslo vyučil nebo učí
 * (`Person.practice`, i mimo dílnu); 3 – zbytek vsi.
 */
export function hungerSplit(state: VillageState, day: number): HungerSplit {
  const groupOf = new Map<number, number>();
  const put = (people: readonly Person[], group: number): void => {
    for (const p of people) {
      const had = groupOf.get(p.id);
      if (had === undefined || group < had) groupOf.set(p.id, group);
    }
  };
  const family = lordFamily(state, day);
  put(
    [
      ...(family.lord ? [family.lord] : []),
      ...family.trainees,
      ...family.household,
      ...family.others,
      ...family.wivesApart,
    ],
    0,
  );
  for (const p of state.people) if (p.mason !== undefined) put(masterHousehold(state, p), 1);
  const workshops = new Set(state.dwellings.filter((d) => d.workshop).map((d) => d.id));
  put(
    state.people.filter(
      (p) =>
        workshops.has(p.dwellingId) ||
        Object.values(p.practice ?? {}).some((years) => years !== undefined && years > 0),
    ),
    2,
  );
  const needs = new Array<number>(HUNGER_GROUPS).fill(0);
  const proteinNeeds = new Array<number>(HUNGER_GROUPS).fill(0);
  const counts = new Array<number>(HUNGER_GROUPS).fill(0);
  for (const p of state.people) {
    const group = groupOf.get(p.id) ?? REST;
    needs[group] = (needs[group] ?? 0) + foodNeedPerDay(p, day);
    proteinNeeds[group] = (proteinNeeds[group] ?? 0) + proteinNeedPerDay(p, day);
    counts[group] = (counts[group] ?? 0) + 1;
  }
  if (state.guests !== undefined) {
    needs[REST] = (needs[REST] ?? 0) + guestFoodNeedPerDay(state, day);
    counts[REST] = (counts[REST] ?? 0) + state.guests.filter((g) => g.untilDay > day).length;
  }
  return { groupOf, needs, proteinNeeds, counts };
}

/**
 * Energie skupin (0–1), když se z potřeby `needs` jí `ratio` celé potřeby vsi. Každá skupina má
 * nárok na životní minimum `minimum` (75 %) své potřeby – Martin 18. 11. 2026: „Nejde, aby elita
 * měla plný příděl a rolníci byli pod hranicí hladomoru…“, „75% je ok.“ Pod minimem jedí všichni
 * stejně (`ratio`); nad ním dostane každý minimum a zbytek se rozdělí po vrstvách v pořadí přednosti
 * až do plného přídělu (diet.md – Kdo dostane co). Skupina bez potřeby má plno (nikdo v ní
 * nehladoví). Při `ratio` ≥ 1 dostanou všechny přesně 1 – odečítání po skupinách by v plovoucí
 * čárce u poslední skupiny mohlo dát 0,9999999999999999 a sytá ves by se od dřívějšího výpočtu lišila.
 */
export function rationShares(
  ratio: number,
  needs: readonly number[],
  minimum: number = HUNGER_PRIORITY.minimumShare,
): number[] {
  if (ratio >= 1) return needs.map(() => 1);
  if (ratio < minimum) return needs.map(() => Math.max(0, ratio));
  let left = (ratio - minimum) * needs.reduce((sum, n) => sum + n, 0);
  return needs.map((need) => {
    if (need <= 0) return 1;
    const extra = Math.min(1 - minimum, left / need);
    left = Math.max(0, left - extra * need);
    return minimum + extra;
  });
}

/** Index skupiny, podle které se hladovění ukazuje hráči – nejnižší neprázdná (zbytek vsi). */
export function shownGroup(counts: readonly number[]): number {
  for (let g = REST; g >= 0; g--) if ((counts[g] ?? 0) > 0) return g;
  return REST;
}

/**
 * Nahromaděný hlad skupin (`VillageState.starvationGroups` pro skupiny 0–2 a `starvationDays` pro
 * zbytek); ves bez částí stavu začíná všemi skupinami z hladu vsi.
 */
export function groupStarvation(state: VillageState): number[] {
  const rest = state.starvationDays ?? 0;
  const upper = state.starvationGroups ?? [rest, rest, rest];
  return [upper[0] ?? rest, upper[1] ?? rest, upper[2] ?? rest, rest];
}

/**
 * Nahromaděný hlad po dni: každá skupina z energie, kterou dostala (`energy`; v hájení se strop
 * drží – `nextStarvationDays`). Prázdná skupina přebírá hlad nejbližší neprázdné (nejdřív
 * nižší, pak vyšší) – nikdo v ní není, ať se hlad vsi nerozchází. Zapíše `starvationDays`
 * (nejnižší neprázdná skupina – to vidí hráč, správce i výprava) a `starvationGroups`, jen když
 * se skupiny liší. Vrací nové hodnoty skupin.
 */
export function advanceGroupStarvation(
  state: VillageState,
  energy: readonly number[],
  counts: readonly number[],
  lucky: boolean,
): number[] {
  const values = groupStarvation(state).map((days, g) =>
    nextStarvationDays(days, energy[g] ?? 1, lucky),
  );
  for (let g = 0; g < HUNGER_GROUPS; g++) {
    if ((counts[g] ?? 0) > 0) continue;
    let from = -1;
    for (let k = g + 1; k < HUNGER_GROUPS && from < 0; k++) if ((counts[k] ?? 0) > 0) from = k;
    for (let k = g - 1; k >= 0 && from < 0; k--) if ((counts[k] ?? 0) > 0) from = k;
    if (from >= 0) values[g] = values[from] ?? 0;
  }
  const rest = values[REST] ?? 0;
  state.starvationDays = rest;
  const upper: [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
  if (upper.every((v) => v === rest)) delete state.starvationGroups;
  else state.starvationGroups = upper;
  return values;
}
