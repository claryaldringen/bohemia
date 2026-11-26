// Otroci jako zboží (markets.md – Rozhodnutí plánu 5, bod 6; Martin 26. 11. 2026: „Moc to řešíš.
// Otroci nejsou rodina, ale zboží“): kus je jeden otrok – manžel ani děti s ním neodcházejí a i malé
// dítě-otrok jde prodat samo. Kdo smí odejít, vybírá `emigrantGroups` (otroci napřed); tady je
// výběr prodejních otroků – jeden průchod lidmi bez simulace (pohled dvorce ho volá často) – a nabídka
// otroků na trhu vlastní vsi s rezervací otroků z ní (bod 8).
import { keptByLine } from '../people/dynasty';
import { isAway } from '../people/people';
import { canBeSold } from '../people/slaves';
import type { Person, VillageState } from '../types';

/**
 * Otroci, které ves smí prodat (bod 6): `canBeSold` (pohan, ne muž rodu ani šlechtic), doma (ne
 * `isAway`), ne `keptByLine` (manželka muže rodu); od nejnižšího id – kdo přišel dřív, jde dřív.
 */
export function sellableSlaves(state: VillageState, day: number): Person[] {
  const kept = keptByLine(state);
  return state.people
    .filter((p) => canBeSold(p) && !isAway(p, day) && !kept(p))
    .sort((a, b) => a.id - b.id);
}

export const SLAVES_BAD_COUNT = 'Počet otroků musí být celé nezáporné číslo.';

/**
 * Nabídka otroků na trhu vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8; vzor `setArmsOrder` –
 * Martin 25. 11. 2026 u zbroje: „Hráč zadá počet“): zapíše počet (mutuje stav), 0 pole smaže,
 * necelé nebo záporné odmítne. Na počet otroků se neomezuje – nabízí se min(nabídka, zásoba)
 * (`offeredSlaveIds`), zbytek čeká.
 */
export function setSlavesForSale(
  state: VillageState,
  count: number,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(count) || count < 0) return { ok: false, reason: SLAVES_BAD_COUNT };
  if (count > 0) state.slavesForSale = count;
  else delete state.slavesForSale;
  return { ok: true };
}

/** Nabídka po prodeji `sold` otroků (mutuje stav; vzor `reduceArmsOrder`): nula ze stavu zmizí. */
export function reduceSlavesForSale(state: VillageState, sold: number): void {
  if (state.slavesForSale === undefined || !(sold > 0)) return;
  const rest = state.slavesForSale - sold;
  if (rest > 0) state.slavesForSale = rest;
  else delete state.slavesForSale;
}

/** Žádní rezervovaní otroci – ves bez nabídky (`emigrantGroups` bez `reserved`). */
export const NO_RESERVED: ReadonlySet<number> = new Set();

/**
 * Rezervace (bod 8): id prvních `slavesForSale` ze `sellableSlaves` – otroci z nabídky, které trh
 * vsi jako rodinu, muže ani ženu nevybere (`emigrantGroups` s `reserved`). Počítá se jednou z celé
 * vsi (začátek tržního dne, krok správce) a předává se dál beze změny – přepočet ze vsi zmenšené
 * o odešlé by rezervoval jiné lidi. Bez nabídky prázdná (prodejní otroci se nehledají).
 */
export function offeredSlaveIds(state: VillageState, day: number): ReadonlySet<number> {
  const count = state.slavesForSale ?? 0;
  if (!(count > 0)) return NO_RESERVED;
  return new Set(
    sellableSlaves(state, day)
      .slice(0, count)
      .map((p) => p.id),
  );
}
