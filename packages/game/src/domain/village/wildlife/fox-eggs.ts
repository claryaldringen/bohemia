// Lišky a vejce (wildlife.md – Liška na slepicích). Jen čísla z krajiny, bez importu stád.

import { PREDATION, WILDLIFE_CAPS } from '../rules/rules-wildlife';
import type { WildlifeLand, WildlifeState } from '../types';

/** Počet lišek podle krajiny: 1 na 100 ha lesa a luk, nejvýš 4 (neukládá se). */
export function foxCount(land: WildlifeLand): number {
  return Math.min(
    WILDLIFE_CAPS.foxesMax,
    Math.floor(((land.forestHa + land.openHa) * WILDLIFE_CAPS.foxesPer100Ha) / 100),
  );
}

/** Podíl vajec, který zbude slepicím: 1 − min(8 %; 2 % × lišky). Ves bez zvěře: 1 (beze změny). */
export function foxEggFactor(wildlife: Pick<WildlifeState, 'land'> | undefined): number {
  if (!wildlife) return 1;
  return 1 - Math.min(PREDATION.fox.eggMax, PREDATION.fox.eggShare * foxCount(wildlife.land));
}
