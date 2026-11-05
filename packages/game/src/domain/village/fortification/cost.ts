import type { BuildCost } from '../costs';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { FortKind } from '../types';

// Cena opevnění podle délky (fortifications.md – Cena a stavba; Martin 3. 11. 2026): na 100 m
// obvodu, úměrně délce – i rohy a brány se počítají délkou (návrh Clauda). Jako plot ohrad
// a hřbitova (`fence-cost.ts`) – cena roste s tím, kolik plotu se staví.

/** Co se staví: nové opevnění, vylepšení plotu na palisádu, plot nebo palisáda na valu. */
export type FortWork = 'new' | 'upgrade' | 'top';

/**
 * Cena opevnění druhu `kind` o délce `lengthM` (m): práce ze společné práce vsi a klády předem.
 * Vylepšení (`upgrade`) je jen na palisádu a stojí jako nová (plot nevrací nic), nástavba
 * (`top`) je plot nebo palisáda na valu za cenu samotného plotu nebo palisády.
 */
export function fortificationCost(kind: FortKind, lengthM: number, work: FortWork): BuildCost {
  if (work === 'upgrade' && kind !== 'palisade') {
    throw new Error(`Vylepšit jde jen plot na palisádu, ne na ${kind}`);
  }
  if (work === 'top' && kind === 'rampart') throw new Error('Na val jde jen plot nebo palisáda');
  const per = FORTIFICATIONS.costPer100M[kind];
  const share = lengthM / 100;
  const wood = per.wood * share;
  return {
    laborManDays: per.laborManDays * share,
    perHa: false,
    upfront: wood > 0 ? { wood } : {},
  };
}
