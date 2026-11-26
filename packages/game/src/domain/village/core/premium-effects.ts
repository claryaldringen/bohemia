// Účinky prémiových krajin „hned“ přes existující mechaniky (premium-landscapes.md – Typy krajin,
// sloupec „Hned“): bohaté rudiště a hliniště dílen, sad na jižním svahu, posvátná hora a pramen,
// pramen a slanisko bez polí. Krajina bez typu (NPC, Vlkov, dnešní hráči) nic nemá – ves je bit po
// bitu stejná. Prvky typu jsou čistá funkce krajiny (`premiumFeaturesOf`).
import {
  premiumFeaturesOf,
  type Landscape,
  type PremiumSite,
  type PremiumSiteKind,
} from '../../landscape';
import { pointInPolygon, type Point } from '../placement/polygon';
import { PREMIUM_EFFECTS } from '../rules';
import { squareCenter } from '../placement/square-grid';
import type { VillageState } from '../types';

/** Prvky typu krajiny druhu `kind` (krajina bez typu nebo bez krajiny – žádné). */
export function premiumSites(
  landscape: Landscape | null | undefined,
  kind: PremiumSiteKind,
): readonly PremiumSite[] {
  if (!landscape || landscape.premium === undefined) return [];
  return (premiumFeaturesOf(landscape)?.sites ?? []).filter((s) => s.kind === kind);
}

/**
 * Bohaté naleziště dílny v prémiové krajině (premium-landscapes.md – Bohatá železná ruda, Dobrá
 * keramická hlína): rudiště typu `iron-ore` pro rudu, hliniště typu `fine-clay` pro hlínu; jinak
 * null.
 */
export function premiumDugSpot(
  landscape: Landscape | null,
  material: 'ore' | 'clay',
): { x: number; z: number } | null {
  if (!landscape) return null;
  const type = landscape.premium;
  if (material === 'ore' ? type !== 'iron-ore' : type !== 'fine-clay') return null;
  const site = premiumSites(landscape, material === 'ore' ? 'iron-ore' : 'clay')[0];
  return site ? { x: Math.round(site.x * 100) / 100, z: Math.round(site.z * 100) / 100 } : null;
}

/**
 * Násobek suroviny na kg výrobku dílny, která kope na bohatém nalezišti (`OreSite.rich`): ruda
 * kováře `PREMIUM_EFFECTS.richOre`, hlína hrnčíře `fineClay`; jinde 1.
 */
export function dugMaterialFactor(
  site: { rich?: true } | null | undefined,
  material: 'ore' | 'clay',
): number {
  if (!site?.rich) return 1;
  return material === 'ore' ? PREMIUM_EFFECTS.richOre : PREMIUM_EFFECTS.fineClay;
}

/**
 * Štěstí z posvátného místa krajiny (premium-landscapes.md – Posvátná hora, Posvátný pramen):
 * vrchol posvátné hory nebo posvátný pramen je posvátné místo vsi od založení – jako háj
 * (`PREMIUM_EFFECTS.sacredPlace`); jinde 0.
 */
export function premiumSacredHappiness(landscape: Landscape | null | undefined): number {
  const type = landscape?.premium;
  if (type === 'sacred-mountain') {
    return premiumSites(landscape, 'summit').length > 0 ? PREMIUM_EFFECTS.sacredPlace : 0;
  }
  if (type === 'sacred-spring') {
    return premiumSites(landscape, 'spring').length > 0 ? PREMIUM_EFFECTS.sacredPlace : 0;
  }
  return 0;
}

/**
 * Místa pramenů a slaniska krajiny (posvátný pramen, solný pramen) – kruhy `springClearM`, kam
 * nesmí pole, sad ani hřbitov (placement-squares.ts – jako voda). Krajina bez nich prázdné.
 */
export function premiumSpringShapes(landscape: Landscape): Point[][] {
  const type = landscape.premium;
  if (type !== 'sacred-spring' && type !== 'salt-spring') return [];
  const r = PREMIUM_EFFECTS.springClearM;
  return [...premiumSites(landscape, 'spring'), ...premiumSites(landscape, 'salt')].map((s) => [
    [s.x - r, s.z - r],
    [s.x + r, s.z - r],
    [s.x + r, s.z + r],
    [s.x - r, s.z + r],
  ]);
}

/**
 * Čtverce sadů na teplém jižním svahu (premium-landscapes.md – Teplé jižní svahy) dostanou
 * `OrchardSquare.sunny` (mutuje stav, idempotentně – krok dne, ať čtverec sadu založeného
 * správcem uprostřed dopočtu vyjde stejně po kouscích i vcelku): střed čtverce v obrysu prvku
 * `slope`. Krajina jiného typu nic nemění.
 */
export function markSunnyOrchards(state: VillageState, landscape: Landscape): void {
  if (landscape.premium !== 'south-slopes' || !state.orchards) return;
  const slopes = premiumSites(landscape, 'slope').filter((s) => s.outline);
  if (slopes.length === 0) return;
  for (const orchard of state.orchards) {
    for (const square of orchard.squares) {
      if (square.sunny) continue;
      const c = squareCenter(landscape, orchard.grid, square.cell);
      if (slopes.some((s) => pointInPolygon([c.x, c.z], s.outline!))) square.sunny = true;
    }
  }
}

/**
 * Náplavy zlatonosného potoka (m, na cm) v pevném pořadí `goldPlacerSites` (gold.md – Pravidla 1);
 * krajina bez typu `gold-stream` nebo bez krajiny [] bez výpočtu, jinak přes mezipaměť
 * `premiumFeaturesOf`.
 */
export function goldPlacers(
  landscape: Landscape | null | undefined,
): readonly { x: number; z: number }[] {
  if (!landscape || landscape.premium !== 'gold-stream') return [];
  return premiumSites(landscape, 'gold-placer').map((s) => ({
    x: Math.round(s.x * 100) / 100,
    z: Math.round(s.z * 100) / 100,
  }));
}
