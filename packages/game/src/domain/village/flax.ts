import { dateOfDayIndex } from '../calendar';
import { dayPartLosses } from './disasters';
import { effectiveFertility } from './fields';
import { ageGroup } from './people';
import { FLAX, PLANNING_DAY } from './rules';
import type { ChronicleEvent, FieldPart, VillageState } from './types';
import { cropGrossPerHa, harvestKg, seasonCrop } from './year-plan';

// Len na oděv (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „A to mi připomíná, že na
// částech pole musí být zasetý len.“; 9. 11. 2026 večer: „Len je extrémně náročná plodina na kvalitu
// půdy. Tam, kde už jednou rostl, se může vrátit až po 6 nebo 7 letech, takže se bude pěstovat na
// polích. Sklízí se v srpnu, ale obilí má vždy absolutní přednost“). Ves oseje len na jarních dílech
// s nejlepší úrodností, na kterých 7 let nerostl (`turnSelection`), jen do potřeby na plátno pro
// všechny (spodní oděv, šátky, ručníky, plachty). Trhá se jen v srpnu z práce, která zbude po
// obilí; co se nevytrhá, propadne. Len není zásoba (Martin nechce nové suroviny): 31. 8. se zapíše,
// na jaký podíl oděvu je (`VillageState.linen`) – platí do dalšího trhání; když nestačí, ubere
// štěstí, nikdo kvůli němu nehladoví. Zpracuje se v rámci roku v domácí práci (`DOMESTIC`).

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik třeného lnu ves potřebuje na oděv za rok (kg) – podle věku lidí v den `day`. */
export function flaxNeedKg(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FLAX.kgPerYear[ageGroup(p, day)], 0);
}

/** Očekávaný třený len dílu (kg) při plné a včasné práci – odhad při výběru dílů. */
export function expectedFlaxKg(part: FieldPart, day: number): number {
  return cropGrossPerHa('flax', effectiveFertility(part, day)) * (part.areaM2 / M2_PER_HA);
}

/**
 * Rok sklizně plodiny, která dnes přibude k práci: hospodářský rok začíná 1. 9. (`PLANNING_DAY`) –
 * díl vybraný na podzim se sklidí příští rok, na jaře letos.
 */
export function seasonHarvestYear(day: number): number {
  const { year, month, day: dom } = dateOfDayIndex(day);
  const autumn =
    month > PLANNING_DAY.month || (month === PLANNING_DAY.month && dom >= PLANNING_DAY.day);
  return autumn ? year + 1 : year;
}

/**
 * Smí na díl len, který dnes přibude k práci (fields.md – Len)? Nejdřív `FLAX.returnYears` let od
 * posledního lnu na dílu (`FieldPart.flaxYear` – chybí = smí hned).
 */
export function flaxAllowed(part: Pick<FieldPart, 'flaxYear'>, day: number): boolean {
  return flaxAllowedIn(part, seasonHarvestYear(day));
}

/** `flaxAllowed` s rokem sklizně spočteným předem (`seasonHarvestYear` – jen zrychlení). */
export function flaxAllowedIn(part: Pick<FieldPart, 'flaxYear'>, harvestYear: number): boolean {
  return part.flaxYear === undefined || harvestYear - part.flaxYear >= FLAX.returnYears;
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
 * Konec trhání lnu (31. 8., po jídle dne – mutuje stav): len letošního plánu jde z pole – úroda
 * podle vytrhané části (co srpen nevytrhal, propadne), počasí roku jako jař – a zapíše se, na jaký
 * podíl oděvu je (`VillageState.linen`) vůči potřebě zapsané v plánu k 1. 9. (`flaxNeedKg`). Plán
 * bez potřeby (ves založená během roku, plán z doby lnu na zahrádkách – fields.md, Zahrádka
 * u obydlí) oděv nezapíše – platí dosavadní podíl. Když lnu nestačí, vrátí událost kroniky
 * `linen-short`.
 */
export function harvestFlax(state: VillageState, day: number): ChronicleEvent | null {
  const plan = state.season;
  if (!plan || plan.flaxNeedKg === undefined) return null;
  const flax = seasonCrop(plan, 'flax');
  // len už sklizený (stav uložený mezi trháním a koncem srpna) se znovu nezapisuje
  if (flax && flax.harvestedKg !== null) return null;
  let kg = 0;
  if (flax) {
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
