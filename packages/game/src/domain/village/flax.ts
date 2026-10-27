import { dayPartLosses } from './disasters';
import { effectiveFertility } from './fields';
import { ageGroup } from './people';
import { FLAX } from './rules';
import type { ChronicleEvent, FieldPart, VillageState } from './types';
import { cropGrossPerHa, harvestKg, seasonCrop } from './year-plan';

// Len (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „A to mi připomíná, že na částech
// pole musí být zasetý len.“). Ves oseje len na části pole – tolik, kolik potřebuje na plátno pro
// všechny (spodní oděv, šátky, ručníky, plachty). Len není zásoba (Martin nechce nové suroviny):
// sklidí se 31. 7. a v rámci roku se zpracuje v domácí práci (`DOMESTIC` – přerozdělení). Při
// trhání se zapíše, na jaký podíl oděvu len je (`VillageState.linen`) – platí do dalšího trhání;
// když nestačí, ubere štěstí.

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik třeného lnu ves potřebuje na oděv za rok (kg) – podle věku lidí v den `day`. */
export function flaxNeedKg(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FLAX.kgPerYear[ageGroup(p, day)], 0);
}

/** Očekávaný třený len dílu (kg) při plné a včasné práci – odhad při osevu. */
export function expectedFlaxKg(part: FieldPart, day: number): number {
  return cropGrossPerHa('flax', effectiveFertility(part, day)) * (part.areaM2 / M2_PER_HA);
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

/**
 * Trhání lnu (31. 7., po jídle dne – mutuje stav): sklidí len letošního plánu a zapíše, na jaký
 * podíl oděvu je (`VillageState.linen`) – vůči potřebě zapsané v plánu k 1. 9. (`flaxNeedKg`).
 * Plán bez potřeby (starší ves, ves založená během roku) oděv nezapíše. Když lnu nestačí, vrátí
 * událost kroniky `linen-short`.
 */
export function harvestFlax(state: VillageState, day: number): ChronicleEvent | null {
  const plan = state.season;
  if (!plan || plan.flaxNeedKg === undefined) return null;
  const flax = seasonCrop(plan, 'flax');
  let kg = 0;
  if (flax) {
    if (flax.harvestedKg !== null) return null;
    // len je jařina – počasí roku jako jař (disasters.md – Léto)
    kg = harvestKg(
      flax,
      state.parts,
      day,
      'flax',
      dayPartLosses(state, day, 'flax', flax.partIds, undefined),
    );
    flax.harvestedKg = kg;
  }
  const need = plan.flaxNeedKg;
  const coverage = need > EPSILON ? Math.min(1, kg / need) : 1;
  state.linen = coverage;
  if (coverage >= 1 - EPSILON) return null;
  return { day, kind: 'linen-short', kg: Math.round(kg), neededKg: Math.round(need) };
}
