// Co hostitelská ves na trhu nabízí a shání (markets.md – Pravidla 3, Rozhodnutí plánu 2, bod 5):
// přebytek nad vlastní potřebou podle výpočtu potřeby jako u dávek. Ten výpočet (výhled vsi,
// `vassalage/spare.ts`) existuje jen pro makrokomodity, proto hostitel obchoduje jen s nimi –
// obilím, dobytkem, koňmi, klády a kamenem; ostatní zboží se v plánu 2 vyměňuje jen mezi výpravami.
// Čisté funkce, stav nemění.
import { cattleSpare, grainOnHandKg, grainReserveKg, grainSpareKg } from '../../vassalage/spare';
import { craftCoverage } from '../crafts/crafts';
import { oxenTrainingTarget } from '../livestock/draft';
import { horsesWanted } from '../livestock/horse-breeding';
import { breedingCows, oxenCalvesWanted } from '../livestock/husbandry';
import { oxenComing, villageOxen } from '../livestock/oxen';
import { stewardOutlook } from '../steward/steward-outlook';
import type { HorseGood, MarketStance, TradeGood, TradeGoods, VillageState } from '../types';
import { HORSE_GOODS } from './goods';
import { horsesForSale, horsesOf } from './horse-trade';
import { villageGoodStock } from './trade';

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik koní každého druhu ves chce (`horsesWanted`). */
const WANTED_KEY: Record<HorseGood, 'foals' | 'mares' | 'riding'> = {
  foals: 'foals',
  mares: 'mares',
  ridingHorses: 'riding',
};

/**
 * Co ves v den `day` na trhu nabízí a shání (Rozhodnutí plánu 2, bod 5). Nabídka je nejvýš
 * `villageGoodStock`, klády a kámen jen nabízí (celá hromada, pojistka na ně není). Výhled
 * (`stewardOutlook`) se počítá jednou a `villageSpare` celý se nevolá. Prázdné položky se nezapisují.
 */
export function marketStance(state: VillageState, day: number): MarketStance {
  const offer: TradeGoods = {};
  const wants: TradeGoods = {};
  const give = (good: TradeGood, amount: number): void => {
    const n = Math.min(amount, villageGoodStock(state, good, day));
    if (n > 0) offer[good] = n;
  };
  const want = (good: TradeGood, amount: number): void => {
    if (amount > EPSILON) wants[good] = amount;
  };

  const outlook = stewardOutlook(state, day, craftCoverage(state, day));
  // obilí: nad pojistku nabízí, pod pojistkou shání
  give('grain', grainSpareKg(state, day, outlook));
  want('grain', grainReserveKg(state, day, outlook) - grainOnHandKg(state));

  // dobytek: krávy a voli nad chovné jádro, chybějící krávy a vycvičení voli
  const cattle = cattleSpare(state, day);
  give('cows', cattle.cows);
  give('youngOxen', cattle.youngOxen);
  give('trainedOxen', cattle.trainedOxen);
  const cows = state.livestock?.herds.cow ?? 0;
  want('cows', Math.ceil(breedingCows(state) + oxenCalvesWanted(state, day) - cows - EPSILON));
  want('trainedOxen', oxenTrainingTarget(state) - villageOxen(state) - oxenComing(state));

  // koně: nad to, co ves chce, prodá volné; chybějící shání
  const horses = horsesWanted(state, day);
  for (const good of HORSE_GOODS) {
    const wanted = horses[WANTED_KEY[good]];
    const have = horsesOf(state, good, day);
    give(good, Math.min(horsesForSale(state, good, day), have - wanted));
    want(good, wanted - have);
  }

  // klády a kámen: celá hromada, nikdy ve wants
  give('logs', villageGoodStock(state, 'logs', day));
  give('stone', villageGoodStock(state, 'stone', day));
  return { offer, wants };
}
