import type { VillageState } from '../../types';

/**
 * Skrývá se dnes ves před cizím vojskem na své mapě (war.md – Ves během nájezdu nepracuje)?
 * Den zapsala schránka (`raid-day`) – ten den nikdo nepracuje, ani v dílnách.
 */
export function raidHiding(state: Pick<VillageState, 'raidDay'>, day: number): boolean {
  return state.raidDay === day;
}
