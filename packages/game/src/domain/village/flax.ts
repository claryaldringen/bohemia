import { dayPartLosses } from './disasters';
import { ageGroup } from './people';
import { FLAX } from './rules';
import type { ChronicleEvent, CropWork, VillageState } from './types';
import { harvestKg, seasonCrop, taskRemaining } from './year-plan';

// Len na oděv (fields.md – Len a Zahrádka u obydlí, diet.md – Oděv). Od 9. 11. 2026 ho ves na poli
// nepěstuje (Martin: „Nebylo by lepší, kdyby si lidé řešili len sami podobně, jako luštěniny?“) –
// domácnost ho seje na zahrádce svého pozemku (`garden.ts`); zasetý len na poli starší vsi doroste
// a sklidí se. Len není zásoba (Martin nechce nové suroviny): sklidí se 31. 7. (co červenec na poli
// nedotrhá, 31. 8.) a v rámci roku se zpracuje v domácí práci (`DOMESTIC` – přerozdělení). Při
// trhání se zapíše, na jaký podíl oděvu len je (`VillageState.linen`) – platí do dalšího trhání;
// když nestačí, ubere štěstí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik třeného lnu ves potřebuje na oděv za rok (kg) – podle věku lidí v den `day`. */
export function flaxNeedKg(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FLAX.kgPerYear[ageGroup(p, day)], 0);
}

/**
 * Na jaký podíl oděvu má ves len (0–1) – zapsaný při posledním trhání. Vsi bez zápisu (uložené
 * dřív, nové do prvního trhání po plánu k 1. 9.) mají lnu dost.
 */
export function linenCoverage(state: Pick<VillageState, 'linen'>): number {
  return state.linen ?? 1;
}

/** Štěstí, které ubere nedostatek lnu na oděv (0 – FLAX.unhappiness). */
export function linenUnhappiness(state: Pick<VillageState, 'linen'>): number {
  return FLAX.unhappiness * (1 - linenCoverage(state));
}

/** Trhání dorůstajícího lnu na poli (mutuje práci plodiny) – úroda s počasím roku jako jař. */
function fieldFlaxKg(state: VillageState, day: number, flax: CropWork): number {
  // len je jařina – počasí roku jako jař (disasters.md – Léto)
  const kg = harvestKg(
    flax,
    state.parts,
    day,
    'flax',
    dayPartLosses(state, day, 'flax', flax.partIds, undefined),
  );
  flax.harvestedKg = kg;
  return kg;
}

/**
 * Len na oděv (31. 7. a 31. 8., po jídle dne – mutuje stav): zapíše, na jaký podíl oděvu ves len
 * má (`VillageState.linen`) – len ze zahrádek (`gardenKg` – fields.md, Zahrádka u obydlí) a
 * dorůstající len na poli starší vsi (fields.md – Len, zrušeno: zasetý len doroste a sklidí se)
 * vůči potřebě všech lidí v den zápisu (`flaxNeedKg` – i lidí v zemnicích, které zahrádku nemají).
 * Len na poli, který červenec nedotrhal, se trhá i v srpnu a 31. 8. (`final`) se přičte (fields.md
 * – Žně i v srpnu); upozornění pak až 31. 8. Ves, která letos zahrádky neosela (`gardenKg` null)
 * a len na poli nemá, oděv nezapíše. Když lnu nestačí, vrátí událost kroniky `linen-short`.
 */
export function harvestFlax(
  state: VillageState,
  day: number,
  final: boolean,
  gardenKg: number | null,
): ChronicleEvent | null {
  const flax = state.season ? seasonCrop(state.season, 'flax') : undefined;
  const field = flax && flax.harvestedKg === null ? flax : undefined;
  const need = flaxNeedKg(state, day);
  let kg: number;
  let pending = false;
  if (final) {
    // 31. 8. jen len na poli, který 31. 7. nebyl dotržený – k podílu zapsanému 31. 7.
    if (!field) return null;
    kg = linenCoverage(state) * need + fieldFlaxKg(state, day, field);
  } else {
    if (gardenKg === null && !field) return null;
    kg = gardenKg ?? 0;
    if (field && taskRemaining(field, 'harvest') > EPSILON) pending = true;
    else if (field) kg += fieldFlaxKg(state, day, field);
  }
  const coverage = need > EPSILON ? Math.min(1, kg / need) : 1;
  state.linen = coverage;
  if (pending || coverage >= 1 - EPSILON) return null;
  return { day, kind: 'linen-short', kg: Math.round(kg), neededKg: Math.round(need) };
}
