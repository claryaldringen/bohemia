import type { Landscape } from '../../landscape';
import type { VillageState } from '../types';
import { beeTreeWalksM, collectBeeTrees } from './bee-trees';
import { processHidesDay } from './hides';

/**
 * Práce vsi na zboží ze zbytku po stavbách (volá `freeLaborDay` před oky): napřed vybrání brtí
 * od 1. 10. ze zbytku `labor`, pak zpracování kůží a kožešin v domácnosti (hides-honey.md) – jen
 * z volné práce žen `women` (population.md – Práce, Stavby staví muži: „Domácí zpracování kůží
 * a kožešin dělají ženy z volného času“), nejvýš z toho, co po brtích zbude; práce mužů na
 * zpracování nejde. Bez `women` (pohlaví neznámá) z celého zbytku. Vrací spotřebované člověkodny.
 */
export function waresWorkDay(
  state: VillageState,
  day: number,
  labor: number,
  landscape: Landscape | null,
  women?: number,
): number {
  const bees = landscape ? collectBeeTrees(state, day, labor, beeTreeWalksM(landscape)) : 0;
  const rest = labor - bees;
  const hides = women === undefined ? rest : Math.min(rest, Math.max(0, women));
  return bees + processHidesDay(state, day, hides);
}
