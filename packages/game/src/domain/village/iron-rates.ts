import { CRAFT_PRODUCTION, IRON } from './rules';

// Ceny kroků řetězu kovárny (production-chains.md – Kovář; IRON v rules.ts): dnešní cena kování
// – CRAFT_PRODUCTION.toolManDaysPerKg práce a toolCharcoalKgPerKg uhlí na kg nástrojů – rozdělená
// na tavbu, překování houby na hřivny a kování nástrojů. Jen konstanty, bez závislostí na stavu
// (smith-supply.ts i iron.ts).

/** Kolik kg houby vyjde na kg nástrojů (1,2 kg hřiven ÷ 0,6). */
const BLOOM_PER_TOOL_KG = IRON.barsPerToolKg / IRON.barsPerBloomKg;

/**
 * Tavba v redukční peci na kg železné houby (production-chains.md – Kovář): práce s měchařem (čd
 * vyučeného), uhlí a ruda (kg) – podíl IRON.labor.smelt a IRON.charcoal.smelt dnešní ceny kování
 * na kg nástrojů, ruda 1 ÷ IRON.bloomPerOreKg.
 */
export const SMELT = {
  manDaysPerKg: (CRAFT_PRODUCTION.toolManDaysPerKg * IRON.labor.smelt) / BLOOM_PER_TOOL_KG,
  charcoalKgPerKg: (CRAFT_PRODUCTION.toolCharcoalKgPerKg * IRON.charcoal.smelt) / BLOOM_PER_TOOL_KG,
  oreKgPerKg: 1 / IRON.bloomPerOreKg,
} as const;

/** Překování houby na kg hřiven: práce, uhlí a houba (kg). */
export const REFINE = {
  manDaysPerKg: (CRAFT_PRODUCTION.toolManDaysPerKg * IRON.labor.refine) / IRON.barsPerToolKg,
  charcoalKgPerKg:
    (CRAFT_PRODUCTION.toolCharcoalKgPerKg * IRON.charcoal.refine) / IRON.barsPerToolKg,
  bloomKgPerKg: 1 / IRON.barsPerBloomKg,
} as const;

/** Kování kg nástrojů z hřiven: práce, uhlí a hřivny (kg). */
export const FORGE = {
  manDaysPerKg: CRAFT_PRODUCTION.toolManDaysPerKg * IRON.labor.forge,
  charcoalKgPerKg: CRAFT_PRODUCTION.toolCharcoalKgPerKg * IRON.charcoal.forge,
  barsKgPerKg: IRON.barsPerToolKg,
} as const;

/** Ruda na kg nástrojů celým řetězem (kg – 8 jako dřív, crafts.md – Uhlí a ruda kováře). */
export const ORE_KG_PER_TOOL_KG = BLOOM_PER_TOOL_KG * SMELT.oreKgPerKg;

/**
 * Ruda na dnešní tavbu na plný úvazek (kg): práce dílny `labor` ÷ práce na kg houby (celé tempo)
 * × ruda na kg houby – podle toho se kope dávka rudy (crafts.md – Uhlí a ruda kováře).
 */
export function smeltOreKg(labor: number): number {
  return (Math.max(0, labor) / SMELT.manDaysPerKg) * SMELT.oreKgPerKg;
}
