// Zboží obchodu (trade.md – Sousedé; Martin 19. 10. 2026: „Nech jen společné suroviny, nezaváděj
// nové.“): jen to, co ves sama má – seznamy v pořadí panelu a druhy dobytka a koní. Smyšlení
// sousedé za krajem mapy skončili (markets.md – Pravidla 1); seznamy dál nesou výpravy na cestě,
// zásilky vazalů a platby (ohrada koní).
import type {
  CartGood,
  CartKind,
  ArmsGood,
  CattleGood,
  Craft,
  HorseGood,
  NewcomerGroup,
  OrderGood,
  PeopleGood,
  TradeGood,
  TradeGoods,
} from '../types';

/** Zbroj v obchodu v pořadí panelu (markets.md – Rozhodnutí plánu 4, bod 7). */
export const ARMS_GOODS: readonly ArmsGood[] = ['swords', 'mailShirts', 'helmets'];

/** Mince jako zboží (markets.md – Rozhodnutí plánu 4, bod 1): kusy, celé. */
export const COIN_GOOD = 'coins' as const;

/** Zlato jako zboží (gold.md – Pravidla 1): gramy, na trhu celé. */
export const GOLD_GOOD = 'gold' as const;

/** Druhy dobytka v obchodu v pořadí panelu (trade.md – Dobytek ve třech druzích). */
export const CATTLE_GOODS: readonly CattleGood[] = ['cows', 'youngOxen', 'trainedOxen'];

/** Je zboží dobytek (krávy, mladí nebo vycvičení voli)? */
export function isCattleGood(good: string): good is CattleGood {
  return (CATTLE_GOODS as readonly string[]).includes(good);
}

/** Druhy koní v obchodu v pořadí panelu (horses.md – Nákup a prodej). */
export const HORSE_GOODS: readonly HorseGood[] = ['foals', 'mares', 'ridingHorses'];

/** Je zboží kůň (hříbě, klisna nebo jezdecký kůň)? */
export function isHorseGood(good: string): good is HorseGood {
  return (HORSE_GOODS as readonly string[]).includes(good);
}

/** Je zboží vůz (dvoukolák, čtyřkolák)? */
export function isCartGood(good: string): good is CartGood {
  return (CART_GOODS as readonly string[]).includes(good);
}

/** Jde zboží po svých s honákem (dobytek a koně) – nese ho nikdo? */
export function isLivestockGood(good: string): good is CattleGood | HorseGood {
  return isCattleGood(good) || isHorseGood(good);
}

/**
 * Vozy na trhu v pořadí panelu – dvoukoláky, pak čtyřkoláky (jako `CART_KINDS`; markets.md –
 * Rozhodnutí plánu 3, bod 4).
 */
export const CART_GOODS: readonly CartGood[] = ['twoWheelCarts', 'fourWheelCarts'];

/** Druh vozu zboží `good` (dvoukoláky – dvoukolák, čtyřkoláky – čtyřkolák). */
export function cartGoodKind(good: CartGood): CartKind {
  return good === 'twoWheelCarts' ? 'two-wheel' : 'four-wheel';
}

/**
 * Lidé na trhu v pořadí panelu a výběru (`emigrantGroups` – otroci napřed, pak rodiny, svobodní
 * muži a svobodné ženy; markets.md – Rozhodnutí plánu 3, bod 10, a plánu 5, bod 6).
 */
export const PEOPLE_GOODS: readonly PeopleGood[] = ['slaves', 'families', 'men', 'women'];

/** Jsou zboží lidé (otroci, rodiny, svobodní muži nebo ženy)? */
export function isPeopleGood(good: string): good is PeopleGood {
  return (PEOPLE_GOODS as readonly string[]).includes(good);
}

/** Skupina lidí (kronika `newcomer`, `EmigrantGroup.kind`) ke zboží lidí. */
export const PEOPLE_GROUP: Readonly<Record<PeopleGood, NewcomerGroup>> = {
  slaves: 'slave',
  families: 'family',
  men: 'man',
  women: 'woman',
};

/**
 * Zboží obchodu v pořadí panelu a zápočtu (obilí a jídlo, dobytek, koně a dřevo, výrobky řemesel –
 * nástroje, dřevěné nářadí a vozy za keramikou, markets.md – Rozhodnutí plánu 3, bod 4; lidé na
 * konci – bod 10).
 */
export const TRADE_GOODS: readonly TradeGood[] = [
  'grain',
  'legumes',
  'meat',
  'cheese',
  ...CATTLE_GOODS,
  ...HORSE_GOODS,
  'logs',
  'pottery',
  'tools',
  'woodTools',
  ...CART_GOODS,
  'ironBars',
  'charcoal',
  'stone',
  GOLD_GOOD,
  'honey',
  'hides',
  'furs',
  'wax',
  ...ARMS_GOODS,
  COIN_GOOD,
  ...PEOPLE_GOODS,
];

/**
 * Kusové zboží v pořadí panelu – dobytek, koně, klády, vozy, kámen (m³), kůže, kožešiny, zbroj,
 * mince a lidé
 * (jednotky jako `TRADE_GOOD_NAMES` ve webu: kusy a m³); ostatní zboží je v kg. Na trhu se prodává
 * jen po celých kusech, kg se dělí libovolně (markets.md – Rozhodnutí plánu 2, bod 4).
 */
export const PIECE_GOODS: readonly TradeGood[] = [
  ...CATTLE_GOODS,
  ...HORSE_GOODS,
  'logs',
  ...CART_GOODS,
  'stone',
  GOLD_GOOD,
  'hides',
  'furs',
  ...ARMS_GOODS,
  COIN_GOOD,
  ...PEOPLE_GOODS,
];

/** Kopie zboží bez mincí a zlata – cena dne a zápočet (Rozhodnutí plánu 6, bod 2). */
export function withoutMoney(goods: TradeGoods): TradeGoods {
  const out: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (good !== COIN_GOOD && good !== GOLD_GOOD && amount > 0) out[good] = amount;
  }
  return out;
}

/** Kopie zboží bez mincí, jen kladné položky v pořadí `TRADE_GOODS`. */
export function withoutCoins(goods: TradeGoods): TradeGoods {
  const out: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (good !== COIN_GOOD && amount > 0) out[good] = amount;
  }
  return out;
}

/** Kopie jen zboží `keep` s kladným množstvím, v pořadí `keep`. */
export function onlyGoods(goods: TradeGoods, keep: readonly TradeGood[]): TradeGoods {
  const out: TradeGoods = {};
  for (const good of keep) {
    const amount = goods[good] ?? 0;
    if (amount > 0) out[good] = amount;
  }
  return out;
}

/** Je zboží kusové (kusy nebo m³, ne kg)? */
export function isPieceGood(good: TradeGood): boolean {
  return PIECE_GOODS.includes(good);
}

/**
 * Výrobky dílen, na které jde zakázka, v pořadí `TRADE_GOODS` (markets.md – Rozhodnutí plánu 3,
 * bod 6): keramika, nástroje, dřevěné nářadí, vozy a hřivny.
 */
export const ORDER_GOODS: readonly OrderGood[] = [
  'pottery',
  'tools',
  'woodTools',
  ...CART_GOODS,
  'ironBars',
];

/**
 * Jediná mapa řemesel výrobků (markets.md – Rozhodnutí plánu 3, body 5–7): nástroje a hřivny
 * kovář, keramika hrnčíř, dřevěné nářadí a vozy tesař. `PRODUCT_CRAFT` (crafts/craft-buying.ts)
 * je z ní – tady je, protože tento soubor nic jiného nedováží (bez cyklu modulů).
 */
export const ORDER_CRAFT: Readonly<Record<OrderGood, Craft>> = {
  tools: 'smith',
  pottery: 'potter',
  woodTools: 'carpenter',
  ironBars: 'smith',
  twoWheelCarts: 'carpenter',
  fourWheelCarts: 'carpenter',
};

/** Je zboží výrobek dílny, na který jde zakázka (`ORDER_GOODS`)? */
export function isOrderGood(good: string): good is OrderGood {
  return (ORDER_GOODS as readonly string[]).includes(good);
}
