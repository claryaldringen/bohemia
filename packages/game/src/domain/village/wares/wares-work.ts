import type { Landscape } from '../../landscape';
import type { VillageState } from '../types';
import { processHidesDay } from './hides';

/**
 * Práce vsi na zboží ze zbytku po stavbách (volá `freeLaborDay` před oky): zatím zpracování kůží
 * a kožešin v domácnosti (hides-honey.md). Vrací spotřebované člověkodny.
 */
export function waresWorkDay(
  state: VillageState,
  day: number,
  labor: number,
  landscape: Landscape | null,
): number {
  // krajina je v podpisu pro brtě (Úloha 5) – zpracování ji nepotřebuje
  void landscape;
  return processHidesDay(state, day, labor);
}
