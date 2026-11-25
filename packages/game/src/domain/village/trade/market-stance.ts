// Co hostitelská ves na trhu nabízí a shání (markets.md – Pravidla 3, Rozhodnutí plánu 2, bod 5):
// přebytek nad vlastní potřebou podle výpočtu potřeby jako u dávek. Ten výpočet (výhled vsi,
// `vassalage/spare.ts`) existuje pro makrokomodity – obilí, dobytek, koně, klády a kámen – a pro
// výrobky dílen jejich potřeba a zásoba řemeslníků (nástroje, keramika, dřevěné nářadí, hřivny,
// vozy – Rozhodnutí plánu 3, bod 5) a pro lidi výhled přebytku lidí a jeho obrácení (bod 10);
// med, vosk a kožešiny nad potřebu domácností jdou i kupcům (Rozhodnutí plánu 4, bod 6), ostatní
// zboží (jídlo, kůže…) se vyměňuje jen mezi výpravami. Čisté funkce, stav nemění.
import {
  cattleSpare,
  grainOnHandKg,
  grainReserveKg,
  grainSpareKg,
  peopleOffer,
} from '../../vassalage/spare';
import { idleCartsOf } from '../crafts/carts';
import { ownCraftsmanWorks } from '../crafts/craft-buying';
import {
  craftCoverage,
  craftStocks,
  craftTargets,
  ironOrderBarsKg,
  smithBarsTargetKg,
} from '../crafts/crafts';
import { ironBarsKg, toolEquipmentKg, toolNeedKg } from '../crafts/iron';
import { cartsWanted, missingCart, oxenTrainingTarget } from '../livestock/draft';
import { horsesWanted } from '../livestock/horse-breeding';
import { breedingCows, oxenCalvesWanted } from '../livestock/husbandry';
import { oxenComing, villageOxen } from '../livestock/oxen';
import { stewardOutlook } from '../steward/steward-outlook';
import { HONEY } from '../rules';
import { yearlyNeed } from '../wares/hides';
import type { HorseGood, MarketStance, TradeGood, TradeGoods, VillageState } from '../types';
import { CART_GOODS, HORSE_GOODS, PEOPLE_GOODS, cartGoodKind } from './goods';
import { horsesForSale, horsesOf } from './horse-trade';
import { peopleWanted } from './market-people';
import { emigrantGroups } from './people-trade';
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
 * Šum plovoucí čárky v kg: zbytek nad potřebou menší než miligram není nabídka (zásoba rovná cíli
 * dává rozdíl ~1e-8 kg – výprava by ho vezla a kronika psala „0 kg“). Technická mez, ne pravidlo.
 */
const NOISE_KG = 1e-6;

/** Zapíše do nabídky `offer` zboží `good` – `amount`, nejvýš `villageGoodStock` (šum ne). */
function giveTo(
  state: VillageState,
  day: number,
  offer: TradeGoods,
  good: TradeGood,
  amount: number,
): void {
  const n = Math.min(amount, villageGoodStock(state, good, day));
  if (n > NOISE_KG) offer[good] = n;
}

/**
 * Výrobky dílen, které ves v den `day` nabízí (Rozhodnutí plánu 3, bod 5) – nad vlastní potřebu:
 * nástroje nad `toolNeedKg`, keramika a dřevěné nářadí nad `craftTargets`, hřivny nad
 * `smithBarsTargetKg`, volné vozy nad `cartsWanted`; nejvýš `villageGoodStock`. Táž čísla jako
 * v `marketStance`, jen bez výhledu správce (`stewardOutlook`), takže je levná – hotové zakázky ji
 * počítají každý den (`fillOrders`). Prázdné položky se nezapisují.
 */
export function craftOffer(state: VillageState, day: number): TradeGoods {
  const offer: TradeGoods = {};
  const give = (good: TradeGood, amount: number): void => giveTo(state, day, offer, good, amount);
  const targets = craftTargets(state, day);
  const stocks = craftStocks(state);
  give('tools', toolEquipmentKg(state) - toolNeedKg(state, day));
  give('pottery', stocks.potteryKg - targets.potteryKg);
  give('woodTools', (stocks.woodToolsKg ?? 0) - targets.woodToolsKg);
  give('ironBars', ironBarsKg(state) - smithBarsTargetKg(state, day));
  for (const good of CART_GOODS) {
    const kind = cartGoodKind(good);
    give(good, idleCartsOf(state, kind).length - cartsWanted(state, kind));
  }
  return offer;
}

/**
 * Co ves v den `day` na trhu nabízí a shání (Rozhodnutí plánu 2, bod 5; Rozhodnutí plánu 3,
 * bod 5). Nabídka je nejvýš `villageGoodStock`, klády a kámen jen nabízí (celá hromada, pojistka na
 * ně není). Výrobky dílen nad vlastní potřebu nabízí (`craftOffer`), do potřeby je shání jen bez
 * vlastního pracujícího řemeslníka (`ownCraftsmanWorks`) – hřivny jen na vozy čekající na kování
 * (`ironOrderBarsKg`), vůz jeden druhu `missingCart`. Lidi nabízí, bez kterých ves pole udrží
 * (`peopleSpare`), a shání obráceně, když je půdy víc než práce (`peopleWanted` – Rozhodnutí plánu 3,
 * bod 10). Výhled (`stewardOutlook`) se počítá jednou a `villageSpare` celý se nevolá. Prázdné
 * položky se nezapisují.
 */
export function marketStance(state: VillageState, day: number): MarketStance {
  const offer: TradeGoods = {};
  const wants: TradeGoods = {};
  const give = (good: TradeGood, amount: number): void => giveTo(state, day, offer, good, amount);
  const want = (good: TradeGood, amount: number): void => {
    if (amount > EPSILON) wants[good] = amount;
  };

  const outlook = stewardOutlook(state, day, craftCoverage(state, day));
  // obilí: nad pojistku nabízí, pod pojistkou shání
  give('grain', grainSpareKg(state, day, outlook));
  want('grain', grainReserveKg(state, day, outlook) - grainOnHandKg(state));

  // vosk celý, kožešiny nad roční potřebu domácností a med nad roční příděl – ten jen s obilím nad
  // pojistkou (jinak je celá zásoba jídlo); nic z toho ve wants (Rozhodnutí plánu 4, bod 6)
  const wares = state.wares;
  if (wares) {
    give('wax', Math.floor(wares.waxKg + EPSILON));
    give(
      'furs',
      Math.floor(wares.sheepFurs + wares.wildFurs - yearlyNeed(state, day).furs + EPSILON),
    );
    if (grainSpareKg(state, day, outlook) > 0) {
      give(
        'honey',
        Math.floor(wares.honeyKg - HONEY.kgPerPersonYear * state.people.length + EPSILON),
      );
    }
  }

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

  // jen dílny a vozy – nad potřebu nabízí (`craftOffer`), bez vlastního pracujícího řemeslníka
  // shání do potřeby
  Object.assign(offer, craftOffer(state, day));
  const targets = craftTargets(state, day);
  const stocks = craftStocks(state);
  const woodTools = stocks.woodToolsKg ?? 0;
  if (!ownCraftsmanWorks(state, 'smith')) {
    want('tools', toolNeedKg(state, day) - toolEquipmentKg(state));
    want('ironBars', ironOrderBarsKg(state) - ironBarsKg(state));
  }
  if (!ownCraftsmanWorks(state, 'potter')) want('pottery', targets.potteryKg - stocks.potteryKg);
  if (!ownCraftsmanWorks(state, 'carpenter')) want('woodTools', targets.woodToolsKg - woodTools);

  // vozy: bez vlastního pracujícího tesaře shání jeden vůz druhu, který chybí (`missingCart`)
  const missing = ownCraftsmanWorks(state, 'carpenter') ? null : missingCart(state);
  const missingGood = CART_GOODS.find((good) => cartGoodKind(good) === missing);
  if (missingGood) want(missingGood, 1);

  // klády a kámen: celá hromada, nikdy ve wants
  give('logs', villageGoodStock(state, 'logs', day));
  give('stone', villageGoodStock(state, 'stone', day));

  // lidé: bez koho ves pole udrží, nabízí – po druzích, které jde vybrat celé najednou (rodiny, muži
  // a ženy berou z týchž lidí; `emigrantGroups` přes všechny druhy); půdy víc než práce – shání
  const spare = emigrantGroups(state, day, peopleOffer(state, day, outlook));
  const wantedPeople = peopleWanted(state, day, outlook);
  for (const good of PEOPLE_GOODS) {
    if (spare[good].length > 0) offer[good] = spare[good].length;
    want(good, wantedPeople[good]);
  }
  return { offer, wants };
}
