import type { LanguageGroup } from '../domain/world';
import { isLanguageGroup } from '../domain/world';
import type { HouseRepository } from './houses';
import type { SettlementRepository } from './settlements';

/** Port účtu hráče – jazyk skupiny (newcomers.md – Jazyková skupina). */
export interface AccountLanguages {
  languageOf(playerId: string): Promise<LanguageGroup>;
  setLanguage(playerId: string, language: LanguageGroup): Promise<void>;
}

export type ChooseLanguageResult = { ok: true } | { ok: false; reason: string };

/**
 * Volba jazyka (hráč přihlášený přes Google ji při registraci nedělá): uloží jazyk účtu i živého
 * rodu, ale jen dokud hráč nezaložil ves – pak se jazyk rodu nemění.
 */
export async function chooseLanguage(
  deps: {
    accounts: AccountLanguages;
    houses: HouseRepository;
    settlements: SettlementRepository;
  },
  input: { playerId: string; language: unknown },
): Promise<ChooseLanguageResult> {
  if (!isLanguageGroup(input.language)) return { ok: false, reason: 'Neznámý jazyk.' };
  if (await deps.settlements.findSeat(input.playerId)) {
    return { ok: false, reason: 'Jazyk se volí jen na začátku.' };
  }
  await deps.accounts.setLanguage(input.playerId, input.language);
  const house = await deps.houses.activeOf(input.playerId);
  if (house) await deps.houses.setLanguage(house.id, input.language);
  return { ok: true };
}
