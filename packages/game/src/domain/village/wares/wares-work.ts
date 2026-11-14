import type { Landscape } from '../../landscape';
import type { VillageState } from '../types';
import { beeTreeWalksM, collectBeeTrees } from './bee-trees';
import { processHidesDay } from './hides';

/**
 * Práce vsi na zboží ze zbytku po stavbách (volá `freeLaborDay` před oky): napřed vybrání brtí
 * od 1. 10., pak zpracování kůží a kožešin v domácnosti (hides-honey.md). Vrací spotřebované
 * člověkodny.
 */
export function waresWorkDay(
  state: VillageState,
  day: number,
  labor: number,
  landscape: Landscape | null,
): number {
  const bees = landscape ? collectBeeTrees(state, day, labor, beeTreeWalksM(landscape)) : 0;
  return bees + processHidesDay(state, day, labor - bees);
}
