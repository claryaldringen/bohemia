import { dateOfDayIndex, monthLength } from '../calendar';
import { tradeCarts } from '../village/carts';
import { yearlyCommonLabor } from '../village/dwellings';
import type { TradePeople, VillageState } from '../village/types';
import type { GridCell } from '../village/world-grid';
import { cellDistance } from '../world/placement';
import {
  addMacro,
  macroGoodsOf,
  minMacro,
  noMacroGoods,
  subtractMacro,
  type MacroGoods,
  type MacroSpare,
} from './macro';
import { VASSALAGE } from './rules-vassalage';
import { villageSpare } from './spare';

// Doprava dávek (vassalage.md – Doprava a cílová ves; Martin 2. 11. 2026: „U každé komodity uvažuj
// i náklady na dopravu…“; výpočet návrh Clauda): kolik ves zvládne dovézt do cílové vsi volnou
// prací, vozy a voly v listopadu. Každý řádek je nejvýš pro dané zboží samotné (celá doprava jen
// na něj) – řádky se nesčítají.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Dny cesty tam a zpět na `cells` políček: VASSALAGE.travelDaysPerCell na políčko každým směrem;
 * uvnitř políčka (0) jako nejkratší cesta k sousedovi.
 */
function roundTripDays(cells: number): number {
  return cells > 0 ? 2 * cells * VASSALAGE.travelDaysPerCell : VASSALAGE.transport.sameCellTripDays;
}

/**
 * Nejvíc, co ves v den `day` doveze na `cells` políček (vassalage.md – Doprava a cílová ves):
 * práce = společná práce vsi (`yearlyCommonLabor`, roční průměr na den) × dny listopadu. Napřed
 * vozy, které mohou na cestu i s voly (`tradeCarts` – čtyřkoláky napřed), každý tolikrát, kolikrát
 * se za listopad otočí (aspoň jednou), dokud na vozky (VASSALAGE.transport.cartCrew na vůz) stačí
 * práce; zbytek práce nese po 25 kg (kláda 100 kg = dva nosiči). Dobytek a koně žene honák
 * (VASSALAGE.transport.headsPerDrover / horsesPerDrover) – vozy na to nejsou. Lidé a robota jdou
 * po svých (bez meze dopravy).
 */
export function transportLimit(state: VillageState, day: number, cells: number): MacroGoods {
  const t = VASSALAGE.transport;
  const tripDays = roundTripDays(cells);
  const monthDays = monthLength(dateOfDayIndex(day).year, VASSALAGE.transportMonth);
  const labor = Math.max(0, yearlyCommonLabor(state)) * monthDays;
  const cartTrips = Math.max(1, Math.floor(monthDays / tripDays + EPSILON));
  const crewDays = t.cartCrew * tripDays;
  let left = labor;
  let cartKg = 0;
  let cartLogs = 0;
  for (const cart of tradeCarts(state, day)) {
    const trips = Math.min(cartTrips, Math.floor(left / crewDays + EPSILON));
    if (trips <= 0) break;
    left -= trips * crewDays;
    cartKg += trips * t.cartKg[cart.kind];
    cartLogs += trips * Math.floor(t.cartKg[cart.kind] / t.logKg + EPSILON);
  }
  // cesty pěšky (člověk tam a zpět) – nosiči po vozkách, honáci z celé práce
  const porters = Math.floor(left / tripDays + EPSILON);
  const drovers = Math.floor(labor / tripDays + EPSILON);
  const kg = cartKg + porters * t.porterKg;
  const heads = drovers * t.headsPerDrover;
  return {
    grainKg: kg,
    hayKg: kg,
    cattle: { cows: heads, youngOxen: heads, trainedOxen: heads },
    horses: drovers * t.horsesPerDrover,
    logs: cartLogs + Math.floor(porters / t.logCarriers + EPSILON),
    // kámen jen vozem – celé m³ z nákladu všech cest vozů
    stoneM3: Math.floor(cartKg / t.stoneKgPerM3 + EPSILON),
  };
}

/** Ves rodu pro výhled: stav, políčko mřížky světa a den (bez něj poslední odsimulovaný). */
export interface HouseVillage {
  state: VillageState;
  cell: GridCell;
  day?: number;
}

/** Co rod už odvádí jiným pánům a na splátkách (makrokomodity, volitelně lidé a robota). */
export type MacroCommitments = MacroGoods & Partial<Pick<MacroSpare, 'people' | 'laborDays'>>;

/**
 * Výhled rodu do cílové vsi na `targetCell` (vassalage.md – Výhled; součet vsí): u každé vsi menší
 * z přebytku (`villageSpare`) a z dopravy (`transportLimit` podle vzdálenosti `cellDistance`),
 * sečtené přes vsi, bez závazků `commitments` (Víc pánů – návrh Clauda: závazky berou přebytek
 * i dopravu, proto se odečtou až od dovezitelného). Lidé a robota bez dopravy, také bez závazků.
 * Vymřelé a opuštěné vsi nic nedají. Vstupní stavy nemění.
 */
export function houseSpare(
  villages: readonly HouseVillage[],
  targetCell: GridCell,
  commitments: MacroCommitments,
): MacroSpare {
  let goods = noMacroGoods();
  const people: TradePeople = { families: 0, men: 0, women: 0 };
  let laborDays = 0;
  for (const v of villages) {
    if (v.state.extinctDay !== undefined || v.state.abandonedDay !== undefined) continue;
    const day = v.day ?? v.state.lastDay;
    const spare = villageSpare(v.state, day);
    const carry = transportLimit(v.state, day, cellDistance(v.cell, targetCell));
    goods = addMacro(goods, minMacro(macroGoodsOf(spare), carry));
    people.families += spare.people.families;
    people.men += spare.people.men;
    people.women += spare.people.women;
    laborDays += spare.laborDays;
  }
  const owed = commitments.people;
  return {
    ...subtractMacro(goods, commitments),
    people: {
      families: Math.max(0, people.families - (owed?.families ?? 0)),
      men: Math.max(0, people.men - (owed?.men ?? 0)),
      women: Math.max(0, people.women - (owed?.women ?? 0)),
    },
    laborDays: Math.max(0, laborDays - (commitments.laborDays ?? 0)),
  };
}
