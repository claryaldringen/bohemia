// Sousedé a zvěř podle počasí kraje (disasters.md – Co z toho plyne, Obchod a Zvěř). Ves bez
// `weatherSeed` má všechny roky normální, takže se nemění nic.

import { DISASTER_TRADE } from '../rules/rules-disasters';
import { isBadSummer, isCruelYear, weatherOf } from '../disasters/weather';
import type { VillageState } from '../types/types-state';

type WeatherState = Pick<VillageState, 'weatherSeed' | 'disasters'>;

/** Násobky roku obchodu `season` (rok doplnění 1. 11.); normální rok je 1 a 1. */
export function tradeWeather(
  state: WeatherState,
  season: number,
): { grainStock: number; goodsValue: number } {
  const weather = weatherOf(state, season);
  if (isCruelYear(weather)) return DISASTER_TRADE.cruel;
  if (isBadSummer(weather.summer)) return DISASTER_TRADE.bad;
  return { grainStock: 1, goodsValue: 1 };
}
