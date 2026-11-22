// Lov vsi (hunting.md – Pravidla 1, 2, 11): kalendářní lov rodu a lov navíc jsou pryč. Lov se
// vyhlásí tlačítkem dvorce, kdykoli není hájení (březen–květen) a lov vsi neběží – bez meze
// „jednou za 3 dny“. Ves zaplatí práci honců zítra, dnešek je spočtený od rána
// (`reserveBeaters`). Úlovek roku (`hunt.year`) čte panel dvorce; plní ho i úlovek z jezdecké
// hlídky (`field-patrol.ts`).
import { dateOfDayIndex } from '../../calendar';
import { HUNT } from '../rules/rules-wildlife';
import type { HuntState, VillageState } from '../types';

/** Lov vsi, která ještě nelovila: prázdný úlovek roku, bez honců. */
export function emptyHunt(): HuntState {
  return { year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 } };
}

/** Proč nejde lov vyhlásit: hájení (březen–květen), nebo lov vsi už běží. */
export type HuntDenied = 'closed-season' | 'already';

/** Důvody odepření lovu (`huntDenied`) česky pro hráče – červeně u zašedlého tlačítka. */
export const HUNT_DENIED_TEXT: Record<HuntDenied, string> = {
  'closed-season': 'Zvěř má hájení – od března do května se neloví.',
  already: 'Lov už běží.',
};

/**
 * Smí ves dnes (`day` = dnešní odsimulovaný den) vyhlásit lov (hunting.md – Pravidla 2, 11)?
 * Vrací null, nebo důvod: hájení (březen–květen, `HUNT.closedMonths`) a běžící lov vsi (`running`).
 */
export function huntDenied(state: VillageState, day: number, running: boolean): HuntDenied | null {
  const { month } = dateOfDayIndex(day);
  if (month >= HUNT.closedMonths.from && month <= HUNT.closedMonths.to) return 'closed-season';
  return running ? 'already' : null;
}

/**
 * Honci na `day + 1` (mutuje stav; hunting.md – Pravidla 2): `HUNT.beaters.men` mužů zítra celý
 * den chybí v práci vsi – dnešní práce je spočtená od rána. Druhý lov téhož dne honce přičte
 * (`men += HUNT.beaters.men`), lov jiného dne starou rezervaci přepíše. Ves bez stavu zvěře nic.
 */
export function reserveBeaters(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  const hunt = (w.hunt ??= emptyHunt());
  const tomorrow = day + 1;
  const reserved = hunt.beaters?.day === tomorrow ? hunt.beaters.men : 0;
  hunt.beaters = { day: tomorrow, men: reserved + HUNT.beaters.men };
}
