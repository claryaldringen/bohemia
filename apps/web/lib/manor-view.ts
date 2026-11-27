// Dvorec vojvody v pohledu na ves (docs/design/trade.md – Dvorec vojvody): které obydlí je
// dvorcem a vylepšení vsi, která odtud jdou – zemské stezky do 8 směrů. S okolím ves neobchoduje
// (markets.md – Pravidla 1). Čistý modul – data ze stavu vsi.
import {
  ARMS_GOODS,
  coinPriceOf,
  huntDenied,
  isChristian,
  isSlave,
  jewelleryOf,
  HUNT_DENIED_TEXT,
  lordFamily,
  marketFreeAdults,
  nextMerchantVisit,
  JEWELLER,
  oxenHome,
  tradeHomeCarts,
  TRADE_GOODS,
  villageGoodStock,
  type ArmsGood,
  type MarketTripCheck,
  type TradeGoods,
  stanceOf,
  villageManor,
  type DefenseStance,
  type TradeExpedition,
  type VillageState,
} from '@bohemia/game';
import {
  armsView,
  personPortrait,
  type DwellingResident,
  scenePersons,
  type ArmsView,
} from './person-view';
import { ROLE_NAMES } from './person-roles';
import { huntView, type HuntView } from './wildlife-view';
import { marketTripViews, type MarketTripView } from './market-view';

/**
 * Obyvatel dvorce (lord.md – Co hráč vidí): portrét, role a věk; muži rodiny od 7 let (cvičí) nesou
 * dovednosti `arms`, `horse` je u toho, kdo koně má (jezdí).
 */
export interface ManorMember extends DwellingResident {
  arms: ArmsView | null;
  horse: boolean;
}

/**
 * Proč dnes nejde vyhlásit lov (česky; hunting.md – Pravidla 2), nebo null – důvody se posuzují
 * na den honců, zítřek (`huntDenied(state, day + 1, …)` jako use-case).
 */
function huntDeniedText(state: VillageState, day: number, running: boolean): string | null {
  const denied = huntDenied(state, day + 1, running);
  return denied === null ? null : HUNT_DENIED_TEXT[denied];
}

/** Zajatec ve dvorci (war.md – Vzdaní, zajetí a výkupné): klíč zajetí a jméno do portrétu. */
export interface PrisonerView {
  id: string;
  name: string | null;
  noble: boolean;
  /** Ves, odkud zajatec pochází (war.md – výkupné); rod z ní doplní server (`houseId`). */
  homeVillageId: string;
  /** Rod zajatce (výkupné se nabízí jen zajatcům protistrany); chybí, nezná-li ho server. */
  houseId?: string;
}

/** Dvorec vojvody pro panel výběru. */
export interface VillageManor {
  /** Zajatci držení ve vsi; bez zajatců chybí. */
  prisoners?: PrisonerView[];
  /** Postoj vsi před cizím vojskem (war.md – Obránci); bez nastavení `flee`. */
  stance: DefenseStance;
  /** Lov: důvod odepření česky, nebo null (lze vyhlásit; hunting.md – Pravidla 2). */
  huntDenied: string | null;
  /** Lov rodu letos a psi dvorce (wildlife.md – Co hráč vidí); bez psů a úlovku chybí. */
  hunt?: HuntView;
  /**
   * Obydlí (id domácnosti), které je dvorcem. Stezky do 8 směrů (hotové, rozestavěné a nabídka
   * nových – cena, délka, důvod) pošle server až na vyžádání panelu (`panelOptionsOf`).
   */
  dwellingId: number;
  /** Otroci vsi a z nich pokřtění (markets.md – Pravidla 7); bez otroků chybí. */
  slaves?: { all: number; baptized: number };
  /** Obyvatelé dvorce od nejstaršího (lord.md – Co hráč vidí). */
  family?: ManorMember[];
  /**
   * Trh (markets.md – Rozhodnutí plánu 2, bod 9): vstup kontroly výpravy bez vzdálenosti
   * (`MarketTripCheck` – náhled ve webu volá `checkMarketTrip` jádra) a výpravy na cestě. Lidé
   * (rodiny, muži, ženy) mají ve `stock` nejvýš, kolik skupin druhu ves dá samotných; kolik jich
   * s celým výběrem odejde a kolik dospělých zbude na nosiče, spočítá server až pro vybrané počty
   * (`marketTripPeople` – Rozhodnutí plánu 3, bod 10; panel Trh).
   */
  market: Omit<MarketTripCheck, 'cells'> & {
    trips: MarketTripView[];
    /**
     * Den příštího příjezdu cizích kupců (≥ dnešek; markets.md – Rozhodnutí plánu 4, bod 8); null =
     * ves nemá zastávku stezky. Seed zastávky klientovi nejde – jen den.
     */
    merchantsDay: number | null;
    /**
     * Cena gramu zlata v mincích (`coinPriceOf` – pevná, gold.md – Pravidla 2; nezávisí na hladině
     * trhu); web ji jen ukazuje.
     */
    goldPrice: number;
    /**
     * Kapacita šperkaře vsi (`jewelleryOf`, celé gramy; gold.md – Pravidla 4): na tolik gramů kovu
     * ještě platí výhoda 1,5×; chybí, je-li 0.
     */
    jewelleryG?: number;
    /** Násobek šperkaře (`JEWELLER.factor`) k popiskům; je s `jewelleryG`. */
    jewelleryFactor?: number;
    /**
     * Zbroj k objednání u kupců (Rozhodnutí plánu 4, bod 15) – cena dne v mincích a objednaný počet,
     * v pořadí `ARMS_GOODS`; jen u vsi se zastávkou kupců, jinak prázdné.
     */
    arms: { good: ArmsGood; price: number; ordered: number }[];
    /** Den posledního příjezdu kupců (z `market.arrivals`); null = zatím žádný. */
    merchantsArrived: number | null;
    /**
     * Prodej otroků vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8): `stock` = prodejní otroci
     * (`stock.slaves`), `forSale` = nabízený počet (může být nad zásobou), `price` = cena dne v
     * mincích; null, když není zásoba ani nabídka.
     */
    slaveSale: { stock: number; forSale: number; price: number } | null;
  };
}

/** Kupci ve vsi u stezky: den příštího příjezdu, objednávka zbroje a den posledního příjezdu. */
function merchantsField(
  state: VillageState,
  day: number,
): Pick<VillageManor['market'], 'merchantsDay' | 'arms' | 'merchantsArrived'> {
  const stops = state.merchantStops ?? [];
  const visit = stops.length > 0 ? nextMerchantVisit(stops, day) : null;
  const level = state.market?.level ?? 1;
  const arrivals = (state.market?.arrivals ?? []).filter((a) => a.merchants === true);
  return {
    merchantsDay: visit ? visit.day : null,
    arms:
      stops.length > 0
        ? ARMS_GOODS.map((good) => ({
            good,
            price: coinPriceOf(state.market?.prices, level, good),
            ordered: state.armsOrder?.[good] ?? 0,
          }))
        : [],
    merchantsArrived: arrivals.length > 0 ? Math.max(...arrivals.map((a) => a.day)) : null,
  };
}

/** Vstup kontroly výpravy na trh ze stavu vsi (zásoby všech druhů zboží, vozy, voli, volní dospělí). */
function marketField(state: VillageState, day: number): VillageManor['market'] {
  const stock: TradeGoods = {};
  for (const good of TRADE_GOODS) stock[good] = villageGoodStock(state, good, day);
  const slaves = stock.slaves ?? 0;
  const forSale = state.slavesForSale ?? 0;
  const jewelleryG = Math.floor(jewelleryOf(state));
  return {
    stock,
    slaveSale:
      slaves === 0 && forSale === 0
        ? null
        : {
            stock: slaves,
            forSale,
            price: coinPriceOf(state.market?.prices, state.market?.level ?? 1, 'slaves'),
          },
    homeCarts: tradeHomeCarts(state).map((c) => c.kind),
    oxenHome: oxenHome(state, day),
    adults: marketFreeAdults(state, day),
    day,
    trips: marketTripViews(state, day),
    goldPrice: coinPriceOf(state.market?.prices, state.market?.level ?? 1, 'gold'),
    ...(jewelleryG > 0 ? { jewelleryG, jewelleryFactor: JEWELLER.factor } : {}),
    ...merchantsField(state, day),
  };
}

/** Obyvatelé dvorce s rolí a dovednostmi (muži rodiny od 7 let vždy, i s nulami). */
export function manorFamily(state: VillageState, day: number): ManorMember[] {
  const manor = villageManor(state);
  if (!manor) return [];
  const trainees = new Set(lordFamily(state, day).trainees.map((p) => p.id));
  return scenePersons(state, day)
    .filter((p) => p.home === manor.id)
    .map((p): ManorMember => ({
      id: p.id,
      portrait: personPortrait(p),
      role: ROLE_NAMES[p.role],
      ...(p.name !== undefined ? { name: p.name } : {}),
      age: p.age,
      arms: p.arms ?? (trainees.has(p.id) ? armsView({ bow: 0, combat: 0, riding: 0 }) : null),
      horse: p.horse === true,
    }))
    .sort((a, b) => b.age - a.age || a.id - b.id);
}

/**
 * Kolik člověkodní výprava dostala posledního dne (podíl `trade` u její stezky v rozdělení práce
 * dne); výprava vyslaná až po dni (dnes) nebo bez rozdělení práce null.
 */
export function expeditionToday(state: VillageState, e: TradeExpedition): number | null {
  const labor = state.labor;
  if (!labor || labor.day !== state.lastDay || e.startedDay >= labor.day) return null;
  return labor.shares
    .filter((s) => s.activity === 'trade' && s.target.kind === 'trail' && s.target.id === e.trailId)
    .reduce((sum, s) => sum + s.manDays, 0);
}

/** Lov a psi pro pohled na dvorec (`VillageManor.hunt`). */
function huntField(state: VillageState, day: number): { hunt?: HuntView } {
  const hunt = huntView(state, day);
  return hunt ? { hunt } : {};
}

/** Otroci vsi jedním průchodem lidmi; bez otroků chybí. */
function slavesField(state: VillageState): { slaves?: { all: number; baptized: number } } {
  let all = 0;
  let baptized = 0;
  for (const p of state.people) {
    if (!isSlave(p)) continue;
    all++;
    if (isChristian(p)) baptized++;
  }
  return all > 0 ? { slaves: { all, baptized } } : {};
}

/** Dvorec vsi pro pohled na ves; dokud stojí jen staveniště první zemnice, null. */
export function manorView(
  state: VillageState,
  day: number,
  /** Lov vsi už běží ve výpravě (`huntRunning` use-case). */
  huntRunning = false,
): VillageManor | null {
  const manor = villageManor(state);
  if (!manor || state.extinctDay !== undefined) return null;
  return {
    dwellingId: manor.id,
    ...(state.prisoners?.length
      ? {
          prisoners: state.prisoners.map((p) => ({
            id: p.id,
            name: p.name ?? null,
            noble: p.noble === true,
            homeVillageId: p.ref.villageId,
          })),
        }
      : {}),
    stance: stanceOf(state),
    huntDenied: huntDeniedText(state, day, huntRunning),
    ...huntField(state, day),
    ...slavesField(state),
    family: manorFamily(state, day),
    market: marketField(state, day),
  };
}
