// Hodnota zboží a zvěř podle počasí kraje (disasters.md – Co z toho plyne, Obchod a Zvěř). Ves bez
// `weatherSeed` má všechny roky normální, takže se nemění nic.

import { dateOfDayIndex } from '../../calendar';
import { DISASTER_TRADE } from '../rules/rules-disasters';
import { TRADE } from '../rules/rules-trade';
import { isBadSummer, isCruelYear, weatherOf } from '../disasters/weather';
import type { VillageState } from '../types/types-state';

type WeatherState = Pick<VillageState, 'weatherSeed' | 'disasters'>;

/** Rok obchodu – herní rok posledního 1. 11. (TRADE.restockDay) do dne `day` včetně. */
export function tradeSeason(day: number): number {
  const date = dateOfDayIndex(day);
  const { month, day: restock } = TRADE.restockDay;
  const after = date.month > month || (date.month === month && date.day >= restock);
  return after ? date.year : date.year - 1;
}

/** Násobek hodnoty zboží v roce obchodu `season` (rok od 1. 11.); normální rok je 1. */
export function tradeWeather(state: WeatherState, season: number): { goodsValue: number } {
  const weather = weatherOf(state, season);
  if (isCruelYear(weather)) return DISASTER_TRADE.cruel;
  if (isBadSummer(weather.summer)) return DISASTER_TRADE.bad;
  return { goodsValue: 1 };
}
