// Co hostitelská ves na trhu nabízí a shání (markets.md – Pravidla 3, Rozhodnutí plánu 2, bod 5):
// přebytek nad vlastní potřebou podle výpočtu potřeby jako u dávek. Ten výpočet (výhled vsi,
// `vassalage/spare.ts`) existuje pro makrokomodity – obilí, dobytek, koně, klády a kámen – a pro
// výrobky dílen jejich potřeba a zásoba řemeslníků (nástroje, keramika, dřevěné nářadí, hřivny –
// Rozhodnutí plánu 3, bod 5); ostatní zboží (jídlo, med, kůže…) se vyměňuje jen mezi výpravami.
// Čisté funkce, stav nemění.
import { cattleSpare, grainOnHandKg, grainReserveKg, grainSpareKg } from '../../vassalage/spare';
import { ownCraftsmanWorks } from '../crafts/craft-buying';
import {
  craftCoverage,
  craftStocks,
  craftTargets,
  ironOrderBarsKg,
  smithBarsTargetKg,
} from '../crafts/crafts';
import { ironBarsKg, toolEquipmentKg, toolNeedKg } from '../crafts/iron';
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
 * Co ves v den `day` na trhu nabízí a shání (Rozhodnutí plánu 2, bod 5; Rozhodnutí plánu 3,
 * bod 5). Nabídka je nejvýš `villageGoodStock`, klády a kámen jen nabízí (celá hromada, pojistka na
 * ně není). Výrobky dílen nad vlastní potřebu nabízí (nástroje nad `toolNeedKg`, keramika a dřevěné
 * nářadí nad `craftTargets`, hřivny nad `smithBarsTargetKg`), do potřeby je shání jen bez vlastního
 * pracujícího řemeslníka (`ownCraftsmanWorks`) – hřivny jen na vozy čekající na kování
 * (`ironOrderBarsKg`). Výhled (`stewardOutlook`) se počítá jednou a `villageSpare` celý se nevolá.
 * Prázdné položky se nezapisují.
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

  // jen dílny – bez vlastního pracujícího řemeslníka ves shání do potřeby, nad potřebu nabízí
  const targets = craftTargets(state, day);
  const stocks = craftStocks(state);
  const tools = toolEquipmentKg(state);
  const toolNeed = toolNeedKg(state, day);
  const woodTools = stocks.woodToolsKg ?? 0;
  const bars = ironBarsKg(state);
  give('tools', tools - toolNeed);
  give('pottery', stocks.potteryKg - targets.potteryKg);
  give('woodTools', woodTools - targets.woodToolsKg);
  give('ironBars', bars - smithBarsTargetKg(state, day));
  if (!ownCraftsmanWorks(state, 'smith')) {
    want('tools', toolNeed - tools);
    want('ironBars', ironOrderBarsKg(state) - bars);
  }
  if (!ownCraftsmanWorks(state, 'potter')) want('pottery', targets.potteryKg - stocks.potteryKg);
  if (!ownCraftsmanWorks(state, 'carpenter')) want('woodTools', targets.woodToolsKg - woodTools);

  // klády a kámen: celá hromada, nikdy ve wants
  give('logs', villageGoodStock(state, 'logs', day));
  give('stone', villageGoodStock(state, 'stone', day));
  return { offer, wants };
}
