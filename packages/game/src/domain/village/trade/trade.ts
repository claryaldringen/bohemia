// Obchod vsi (docs/design/markets.md): zboží obchodu ve vsi (`villageGoodStock`, `addGood`), jeho
// hodnota v kg obilí (`sellPrice`, `goodWorth` – platba koní nové ohrady) a výpravy na cestě.
// Smyšlení sousedé za krajem mapy skončili (markets.md – Pravidla 1): výprava k sousedovi už
// nevyrazí, uložená výprava na cestě ale doběhne (markets.md – Pravidla 10) – nosiči a honáci
// pracují ze společné práce vsi (`workExpeditions`) a s návratem přinesou zboží, dobytek, koně
// i lidi (`finishExpeditions`, `settleNewcomers`). Tytéž kroky nesou zásilky vazalů (vassalage.md –
// Doprava a cílová ves). Převody starších vsí: hřivny místo nástrojů a jen společné suroviny
// (Martin 19. 10. 2026: „Nech jen společné suroviny, nezaváděj nové.“). Čisté funkce bez I/O.
import { takeVillageMeatKg } from '../core/meat-stocks';
import { addCart, idleCartsOf, removeIdleCart } from '../crafts/carts';
import { charcoalStockKg, takeCharcoal } from '../crafts/charcoal';
import { toolEquipmentKg } from '../crafts/iron';
import { ageGroup } from '../people/people';
import { addCattle, cattleForSale, removeCattle } from './cattle-trade';
import { NO_PEOPLE, emigrantGroups, newcomerProfiles, settleNewcomers } from './people-trade';
import { addHorses, horsesForSale, removeHorses } from './horse-trade';
import { logArrivalPoint } from '../forest/log-piles';
import { addStone, stoneOnHand, takeStone } from '../fortification/state/stone';
import { addLogs, takeLogs, woodLogs } from '../forest/wood';
import {
  TRADE_GOODS,
  cartGoodKind,
  isCattleGood,
  isHorseGood,
  isLivestockGood,
  isPeopleGood,
} from './goods';
import { CARTS, HIDES, IRON, TRADE, TRADE_GOOD_VALUES } from '../rules';
import { ensureWares } from '../wares/wares';
import { tradeSeason, tradeWeather } from './trade-weather';
import type {
  CartGood,
  CartKind,
  ChronicleEvent,
  ComingPeople,
  MarketCart,
  Person,
  TradeExpedition,
  TradeGood,
  TradeGoods,
  TradePeople,
  VillageState,
} from '../types';

const EPSILON = 1e-9;

/** Kolik kg obilí soused připíše za sháněné v hodnotě `valueKg` – ÷ přirážka × příplatek. */
export function sellValue(valueKg: number): number {
  return (valueKg / (1 + TRADE.markup)) * (1 + TRADE.demandBonus);
}

/**
 * Násobek hodnoty zboží `good` v den `day` po zlém / krutém roce kraje (disasters.md – Obchod):
 * obilí 1, ostatní zboží (i luštěniny) 1, 0,67 nebo 0,5 – ves dostane za zboží méně obilí a
 * naopak za obilí si koupí méně zboží (platba koní nové ohrady – `horsePenPayment`). Ves bez
 * `weatherSeed` má vždy 1.
 */
export function goodWorth(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  good: TradeGood,
  day: number,
): number {
  return good === 'grain' ? 1 : tradeWeather(state, tradeSeason(day)).goodsValue;
}

/** Kolik kg obilí soused dá za kus sháněného zboží – hodnota ÷ přirážka × příplatek za sháněné. */
export function sellPrice(good: TradeGood): number {
  return sellValue(TRADE_GOOD_VALUES[good].valueKg);
}

/** Kolik kůže skotu je kůže kozí nebo prasečí (plocha – hides-honey.md – Zpracování v domácnosti). */
export function smallHideRatio(): number {
  return HIDES.smallHideM2 / HIDES.hideM2;
}

/** Kůže k obchodu v kusech kůže skotu – velké a malé přepočtem plochou. */
export function hidesOnHand(state: VillageState): number {
  const wares = state.wares;
  if (!wares) return 0;
  return wares.hides + (wares.smallHides ?? 0) * smallHideRatio();
}

/**
 * Kolik zboží ves má k obchodu v den `day` (celé kusy a kg): obilí, maso, sýr a luštěniny ze
 * zásob, dobytek (`cattleForSale` – krávy bez chovného páru, mladí voli ve výcviku, vycvičení voli
 * doma mimo posledních let služby), celé klády z hromady a výrobky řemesel – nástroje celé
 * vybavení domácností (`toolEquipmentKg`), vozy volné vozy druhu (`idleCartsOf`). Lidé: kolik
 * skupin druhu ves smí dát (`emigrantGroups` jen s tím druhem – markets.md, Rozhodnutí plánu 3,
 * bod 10); rodiny, muži a ženy berou z týchž lidí, takže se nesčítají.
 */
export function villageGoodStock(
  state: VillageState,
  good: TradeGood,
  day: number = state.lastDay,
): number {
  if (isPeopleGood(good)) {
    return emigrantGroups(state, day, { ...NO_PEOPLE, [good]: Infinity })[good].length;
  }
  if (isCattleGood(good)) return cattleForSale(state, good, day);
  // koně bez jezdce (horse-trade.ts – horses.md, Nákup a prodej)
  if (isHorseGood(good)) return horsesForSale(state, good, day);
  switch (good) {
    case 'grain':
      return Math.floor(state.storesKg);
    case 'meat':
      return Math.floor(state.meatKg ?? 0);
    case 'cheese':
      return Math.floor(state.cheeseKg ?? 0);
    case 'legumes':
      return Math.floor(state.legumesKg ?? 0);
    case 'logs':
      return Math.floor(woodLogs(state));
    case 'stone':
      // celé m³ z hromad kamení (trade.md – Kámen)
      return Math.floor(stoneOnHand(state) + EPSILON);
    case 'pottery':
      return Math.floor(state.crafts?.potteryKg ?? 0);
    case 'tools':
      // nástroje ve vybavení domácností (markets.md – Rozhodnutí plánu 3, bod 4)
      return Math.floor(toolEquipmentKg(state) + EPSILON);
    case 'woodTools':
      // dřevěné nářadí od tesaře (wagons.md – Tesař)
      return Math.floor((state.crafts?.woodToolsKg ?? 0) + EPSILON);
    case 'twoWheelCarts':
    case 'fourWheelCarts':
      // volné vozy druhu – ne s výpravou ani na cestě pro kování (markets.md – Rozhodnutí plánu 3,
      // bod 4)
      return idleCartsOf(state, cartGoodKind(good)).length;
    case 'ironBars':
      // hřivny z kovárny (production-chains.md – Kovář)
      return Math.floor(state.crafts?.ironBarsKg ?? 0);
    case 'charcoal':
      // uhlí u kováře i ve vypálených milířích (crafts.md – Milíř stojí vždy)
      return Math.floor(charcoalStockKg(state));
    case 'honey':
      return Math.floor((state.wares?.honeyKg ?? 0) + EPSILON);
    case 'wax':
      return Math.floor((state.wares?.waxKg ?? 0) + EPSILON);
    case 'hides':
      // kůže skotu v kusech, malé (kozí a prasečí) přepočtem plochou (hides-honey.md – Obchod)
      return Math.floor(hidesOnHand(state) + EPSILON);
    case 'furs':
      // kožešiny z lovu a ovčí dohromady
      return Math.floor((state.wares?.sheepFurs ?? 0) + (state.wares?.wildFurs ?? 0) + EPSILON);
    case 'coins':
      return Math.floor((state.coins ?? 0) + EPSILON);
    case 'swords':
    case 'mailShirts':
    case 'helmets':
      return Math.floor(state.arms?.[good] ?? 0);
  }
}

/**
 * Prodá `n` nejmladších volných vozů druhu `good` (mutuje stav) a vrátí je po kusech se stářím –
 * kupující dostane vůz s tímtéž `builtDay` (markets.md – Rozhodnutí plánu 3, bod 4). Volných
 * vozů je nejvýš kolik je, víc se neprodá.
 */
export function takeCarts(state: VillageState, good: CartGood, n: number): MarketCart[] {
  const out: MarketCart[] = [];
  for (let k = 0; k < n; k++) {
    const cart = removeIdleCart(state, cartGoodKind(good));
    if (!cart) break;
    out.push({ good, builtDay: cart.builtDay });
  }
  return out;
}

/** Vozy z trhu přijdou do vsi se stářím prodejce (mutuje stav; nové id, `addCart`). */
export function addMarketCarts(state: VillageState, carts: readonly MarketCart[]): void {
  for (const cart of carts) addCart(state, cartGoodKind(cart.good), cart.builtDay);
}

/**
 * Přičte (záporně ubere) zboží ve vsi v den `day` (mutuje stav). Koupené koně přidává výprava
 * po kusech (`addHorses`), tady se koně jen prodávají. Lidé nejsou počty – odcházejí a přicházejí
 * jako skuteční lidé (`takePeople`, `settlePeople`, `restorePeople` v market-people.ts), proto je
 * `addGood` nebere: smyčka přes zboží, která na lidi zapomene, spadne hned (markets.md –
 * Rozhodnutí plánu 3, bod 10; nikdo nevznikne ani nezmizí).
 */
export function addGood(state: VillageState, good: TradeGood, amount: number, day: number): void {
  if (isPeopleGood(good)) {
    throw new Error(`Lidé (${good}) se nepřičítají – odcházejí a přicházejí jako skuteční lidé.`);
  }
  if (isCattleGood(good)) {
    // dobytek do stáda a ohrad volů, prodaný z nich (cattle-trade.ts)
    if (amount > 0) addCattle(state, good, amount, day);
    else removeCattle(state, good, -amount, day);
    return;
  }
  if (isHorseGood(good)) {
    if (amount < 0) removeHorses(state, good, -amount, day);
    return;
  }
  switch (good) {
    case 'grain':
      state.storesKg = Math.max(0, state.storesKg + amount);
      return;
    case 'meat':
      // prodej ubere poměrně i zásobě z porážky 1. 11., koupené maso je ostatní uzené
      if (amount < 0) takeVillageMeatKg(state, -amount);
      else state.meatKg = (state.meatKg ?? 0) + amount;
      return;
    case 'cheese':
      state.cheeseKg = Math.max(0, (state.cheeseKg ?? 0) + amount);
      return;
    case 'legumes':
      state.legumesKg = Math.max(0, (state.legumesKg ?? 0) + amount);
      return;
    case 'logs':
      if (amount > 0) addLogs(state, amount, null);
      else takeLogs(state, -amount);
      return;
    case 'stone':
      // koupený kámen na hromadu u cesty, prodaný z hromad nejblíž dvorci (trade.md – Kámen)
      if (amount > 0) addStone(state, amount, null);
      else takeStone(state, -amount, logArrivalPoint(state));
      return;
    case 'pottery': {
      const crafts = (state.crafts ??= { charcoalKg: 0, potteryKg: 0 });
      crafts.potteryKg = Math.max(0, crafts.potteryKg + amount);
      return;
    }
    case 'tools':
      // koupené nástroje jdou rovnou do vybavení domácností, prodané z něj (markets.md –
      // Rozhodnutí plánu 3, bod 4)
      state.toolEquipmentKg = Math.max(0, toolEquipmentKg(state) + amount);
      return;
    case 'woodTools': {
      const crafts = (state.crafts ??= { charcoalKg: 0, potteryKg: 0 });
      crafts.woodToolsKg = Math.max(0, (crafts.woodToolsKg ?? 0) + amount);
      return;
    }
    case 'twoWheelCarts':
    case 'fourWheelCarts': {
      // jen celé vozy: koupený je nový (`addCart`; vůz z trhu se stářím přidává `addMarketCarts`),
      // prodá se nejmladší volný vůz druhu (`removeIdleCart`) – markets.md, Rozhodnutí plánu 3, bod 4
      const kind = cartGoodKind(good);
      const n = Math.floor(Math.abs(amount) + EPSILON);
      for (let k = 0; k < n; k++) {
        if (amount > 0) addCart(state, kind, day);
        else removeIdleCart(state, kind);
      }
      return;
    }
    case 'ironBars': {
      const crafts = (state.crafts ??= { charcoalKg: 0, potteryKg: 0 });
      crafts.ironBarsKg = Math.max(0, (crafts.ironBarsKg ?? 0) + amount);
      return;
    }
    case 'charcoal': {
      // prodané uhlí napřed od kováře, pak z vypálených milířů; koupené jde ke kováři
      // (crafts.md – Milíř stojí vždy)
      if (amount < 0) takeCharcoal(state, -amount);
      else (state.crafts ??= { charcoalKg: 0, potteryKg: 0 }).charcoalKg += amount;
      return;
    }
    case 'honey': {
      const wares = ensureWares(state);
      wares.honeyKg = Math.max(0, wares.honeyKg + amount);
      return;
    }
    case 'wax': {
      const wares = ensureWares(state);
      wares.waxKg = Math.max(0, wares.waxKg + amount);
      return;
    }
    case 'hides': {
      const wares = ensureWares(state);
      if (amount >= 0) {
        wares.hides += amount;
        return;
      }
      // prodej bere napřed velké kůže, zbytek malé přepočtem plochou
      const fromBig = Math.min(wares.hides, -amount);
      wares.hides -= fromBig;
      const small = (-amount - fromBig) / smallHideRatio();
      wares.smallHides = Math.max(0, (wares.smallHides ?? 0) - small);
      return;
    }
    case 'furs': {
      // prodej bere napřed kožešiny z lovu, pak ovčí; koupené jdou ke kožešinám z lovu
      const wares = ensureWares(state);
      if (amount >= 0) {
        wares.wildFurs += amount;
        return;
      }
      const fromWild = Math.min(wares.wildFurs, -amount);
      wares.wildFurs -= fromWild;
      wares.sheepFurs = Math.max(0, wares.sheepFurs - (-amount - fromWild));
      return;
    }
    case 'coins': {
      // celé kusy, nikdy pod 0; nula ze stavu zmizí (markets.md – Rozhodnutí plánu 4, bod 1)
      const next = Math.max(0, (state.coins ?? 0) + amount);
      if (next > 0) state.coins = next;
      else delete state.coins;
      return;
    }
    case 'swords':
    case 'mailShirts':
    case 'helmets': {
      const next = Math.max(0, (state.arms?.[good] ?? 0) + amount);
      if (next > 0) (state.arms ??= {})[good] = next;
      else if (state.arms) {
        delete state.arms[good];
        if (Object.keys(state.arms).length === 0) delete state.arms;
      }
    }
  }
}

/** Zboží s kladným množstvím v pořadí TRADE_GOODS. */
function entries(goods: TradeGoods): [TradeGood, number][] {
  return TRADE_GOODS.flatMap((g) =>
    (goods[g] ?? 0) > 0 ? [[g, goods[g]!] as [TradeGood, number]] : [],
  );
}

/**
 * Kolik kg nákladu veze při jedné jízdě každý z vozů výpravy (`kinds` – druhy vozů, `trips` jízd):
 * větší z cest tam a zpět, nejvýš nosnost vozů, rozdělený podle nosnosti (zobrazení nákladu
 * vozu – wagons.md, Opakované jízdy vozu). Bez vozů prázdné.
 */
export function expeditionCartLoads(
  e: Pick<TradeExpedition, 'give' | 'get'>,
  kinds: readonly CartKind[],
): number[] {
  const kg = (goods: TradeGoods): number =>
    entries(goods).reduce(
      (sum, [good, amount]) =>
        isLivestockGood(good) ? sum : sum + amount * TRADE_GOOD_VALUES[good].carryKg,
      0,
    );
  const capacity = kinds.reduce((sum, kind) => sum + CARTS.loadKg[kind], 0);
  if (capacity <= 0) return [];
  const load = Math.min(capacity, Math.max(kg(e.give), kg(e.get)));
  return kinds.map((kind) => Math.round((load * CARTS.loadKg[kind]) / capacity));
}

/**
 * Kolik člověkodní chce výprava v den `day`: tolik, kolik s ní jde lidí, nejvýš co jí zbývá.
 * Výprava na trh (markets.md – Rozhodnutí plánu 2, bod 2: termín trhu je pevný) jen ve dnech
 * `startedDay` … `market.returnDay` − 1 – mimo ně nic, i když jí práce zbývá (vsi chyběli
 * dospělí).
 */
function expeditionNeedOn(e: TradeExpedition, day: number): number {
  if (e.kind === 'market' && !(e.market && day >= e.startedDay && day < e.market.returnDay)) {
    return 0;
  }
  return Math.min(e.porters, Math.max(0, e.cost - e.done));
}

/**
 * Kolik lidí je v den `day` na výpravách (trade.md – Doprava; Martin 19. 10. 2026: „Ano, udělej to
 * tak.“ – nosiči mají vlastní podíl práce): každá výprava na cestě chce denně tolik člověkodní,
 * kolik s ní jde lidí (nosiči, honáci a pomocníci u vozů), nejvýš co jí zbývá; výprava na trh jen
 * v dnech cesty a pobytu (`expeditionNeedOn`). Krok práce je vezme po denním minimu a před
 * rozdělením dne (`allocateDay` – `away`), takže výprava trvá přesně dny z náhledu. Platí pro
 * každou výpravu ve `state.trade.expeditions` (i nákup u sousedů).
 */
export function expeditionLaborNeed(state: Pick<VillageState, 'trade'>, day: number): number {
  return (state.trade?.expeditions ?? []).reduce((sum, e) => sum + expeditionNeedOn(e, day), 0);
}

/**
 * Práce lidí na výpravách dnes (trade.md – Doprava; jediné pravidlo pro všechny výpravy na cestě):
 * `expeditionLaborNeed`, nejvýš kolik je mezi `people` (lidé, kteří dnes pracují se vsí – bez
 * řemeslníků v dílnách) dospělých. Náklad 25 kg na několik dní cesty nesou dospělí; děti a starší
 * zůstanou doma. Krok práce ji dá do `allocateDay` jako `away` – po denním minimu domácností, před
 * úlohami dne – a `workExpeditions` ji rozdělí mezi výpravy. `extra` = lidé dalších cest
 * k sousedům (skupiny nákupu výrobků řemeslníků – crafts.md, Nákup u sousedů).
 */
export function expeditionLaborToday(
  state: Pick<VillageState, 'trade'>,
  people: readonly Person[],
  day: number,
  extra = 0,
): number {
  const need = expeditionLaborNeed(state, day) + extra;
  if (need <= 0) return 0;
  return Math.min(need, people.filter((p) => ageGroup(p, day) === 'adult').length);
}

/**
 * Práce nosičů dne `day` (mutuje stav – krok práce): rozdělí práci lidí na výpravách
 * (`allocateDay` – `away`, nejvýš `expeditionLaborToday`) – každá výprava nejvýš tolik, kolik má
 * lidí, v pořadí výprav; výprava na trh jen ve dnech cesty a pobytu. Když ves lidí na výpravu nemá
 * (po denním minimu, jen dospělí), cesta trvá déle – výprava na trh ne, ta má pevný termín. Vrátí
 * použitou práci a podíly po stezkách.
 */
export function workExpeditions(
  state: VillageState,
  away: number,
  day: number,
): { used: number; shares: { trailId: number; manDays: number; carts?: number }[] } {
  const shares: { trailId: number; manDays: number; carts?: number }[] = [];
  let left = away;
  for (const e of state.trade?.expeditions ?? []) {
    if (left <= EPSILON) break;
    const take = Math.min(left, expeditionNeedOn(e, day));
    if (take <= 0) continue;
    e.done += take;
    left -= take;
    // zásilka do vsi jiného hráče ani výprava na trh nejde po stezce k sousedovi – do podílů po
    // stezkách nepatří
    if (e.kind === 'shipment' || e.kind === 'market') continue;
    shares.push({
      trailId: e.trailId,
      manDays: take,
      ...(e.carts && e.carts.length > 0 ? { carts: e.carts.length } : {}),
    });
  }
  return { used: away - left, shares };
}

/**
 * Vrácené výpravy (mutuje stav): přinesené zboží do zásob vsi, lidé od souseda do obydlí
 * (`settleNewcomers`), kronika. Výprava na trh tu zůstane – uzavře ji až výsledek trhu
 * (`applyMarketResult`).
 */
export function finishExpeditions(state: VillageState, day: number): ChronicleEvent[] {
  const trade = state.trade;
  if (!trade || trade.expeditions.length === 0) return [];
  const events: ChronicleEvent[] = [];
  trade.expeditions = trade.expeditions.filter((e) => {
    // výprava na trh (markets.md – Rozhodnutí plánu 2, bod 6): lidé a vozy jsou doma v pevný den,
    // zboží přijde se zprávou z trhu
    if (e.kind === 'market') return true;
    if (e.done + EPSILON < e.cost) return true;
    // zásilka (vassalage.md – Doprava a cílová ves): nosiči se vrátili bez zboží, to dojde
    // schránkou cílové vsi
    if (e.kind === 'shipment') return false;
    for (const [g, n] of entries(e.get)) addGood(state, g, n, day);
    // koně po kusech do ohrad koní (horse-trade.ts)
    addHorses(state, e.horses ?? [], day);
    const coming = e.getPeople;
    events.push({
      day,
      kind: 'trade-returned',
      direction: e.direction,
      get: { ...e.get },
      ...(coming ? { people: comingCounts(coming, state.seed, String(e.id)) } : {}),
    });
    // lidé od souseda přijdou s výpravou (trade.md – Výměna lidí)
    if (coming) events.push(...settleNewcomers(state, day, e.direction, coming, String(e.id)));
    return false;
  });
  return events;
}

/**
 * Kolik lidí s výpravou přijde – rodiny, muži a ženy; u výpravy uložené dřív se svobodní dospělí
 * bez pohlaví (`adults`) losují až při příchodu – v kronice podle losu (`newcomerProfiles`).
 */
function comingCounts(coming: ComingPeople, seed?: number, key?: string): TradePeople {
  if (coming.adults && seed !== undefined && key !== undefined) {
    const singles = newcomerProfiles(seed, key, coming).filter((p) => p.group !== 'family');
    return {
      families: coming.families.length,
      men: singles.filter((p) => p.group === 'man').length,
      women: singles.filter((p) => p.group === 'woman').length,
    };
  }
  return { families: coming.families.length, men: coming.men ?? 0, women: coming.women ?? 0 };
}

/**
 * Zboží s nástroji `tools` (uložené před hřivnami) převedenými na hřivny – kg ÷ IRON.barsPerToolKg
 * na celé kg (jako zásoba nástrojů ve vsi – `withToolEquipment`). Bez nástrojů týž objekt.
 */
function renamedTools(goods: TradeGoods): TradeGoods {
  const tools = goods.tools;
  if (tools === undefined) return goods;
  const out: TradeGoods = { ...goods };
  delete out.tools;
  const bars =
    (out.ironBars ?? 0) + Math.max(tools > 0 ? 1 : 0, Math.round(tools / IRON.barsPerToolKg));
  if (bars > 0) out.ironBars = bars;
  return out;
}

/**
 * Hřivny místo nástrojů v obchodu vsi uložené dřív (production-chains.md – Kovář; Martin 20. 10.
 * 2026: „V liště jenom hřivny“): nástroje `tools` ve výpravách k sousedovi po stezce a v kronice
 * výprav se převedou na hřivny (kg ÷ 1,2 – `renamedTools`) – výprava přinese hřivny. Výprava na
 * trh a zásilka (`kind`) nesou skutečné nástroje – zboží od plánu 3 trhu (markets.md – Rozhodnutí
 * plánu 3, bod 4) – a zůstanou. Zbytky roku sousedů nechá – smaže je převod
 * `withoutFictionalNeighbours`. Běží před `withoutForeignGoods`. Bez čeho převádět, vrátí tentýž
 * objekt; idempotentní (jako `withCattleKinds`).
 */
export function withIronBarsTrade(state: VillageState): VillageState {
  const trade = state.trade;
  const expeditions = trade?.expeditions.map((e) => {
    if (e.kind !== undefined) return e;
    const give = renamedTools(e.give);
    const get = renamedTools(e.get);
    return give === e.give && get === e.get ? e : { ...e, give, get };
  });
  const expeditionsChanged = expeditions?.some((e, i) => e !== trade!.expeditions[i]) ?? false;
  // kronika výprav – projde se jen, když v ní nástroje jsou (kronika bývá dlouhá)
  const legacyEvent = (event: ChronicleEvent): boolean =>
    (event.kind === 'trade-departed' && 'tools' in event.give) ||
    (event.kind === 'trade-returned' && 'tools' in event.get);
  const chronicleChanged = state.chronicle.some(legacyEvent);
  if (!expeditionsChanged && !chronicleChanged) return state;
  return {
    ...state,
    ...(trade && expeditionsChanged ? { trade: { ...trade, expeditions: expeditions! } } : {}),
    ...(chronicleChanged
      ? {
          chronicle: state.chronicle.map((event) => {
            if (event.kind === 'trade-departed') {
              return { ...event, give: renamedTools(event.give) };
            }
            if (event.kind === 'trade-returned') return { ...event, get: renamedTools(event.get) };
            return event;
          }),
        }
      : {}),
  };
}

/** Zboží, které obchod zná – uložené vsi mohou mít v obchodu ještě zboží zvenku (sůl, med…). */
function isTradeGood(key: string): key is TradeGood {
  return (TRADE_GOODS as readonly string[]).includes(key);
}

/** Zboží obsahuje druh, který obchod nezná. */
function hasForeign(goods: TradeGoods): boolean {
  return Object.keys(goods).some((key) => !isTradeGood(key));
}

/** Jen zboží, které obchod zná (nový objekt). */
function knownGoods(goods: TradeGoods): TradeGoods {
  return Object.fromEntries(Object.entries(goods).filter(([key]) => isTradeGood(key)));
}

/** Událost kroniky o výpravě se zbožím, které obchod nezná. */
function foreignTradeEvent(event: ChronicleEvent): boolean {
  return (
    (event.kind === 'trade-departed' && hasForeign(event.give)) ||
    (event.kind === 'trade-returned' && hasForeign(event.get))
  );
}

/**
 * Ves bez zboží zvenku (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen společné
 * suroviny, nezaváděj nové.“). Starší ves přijde o zásoby soli, železa, medu a kožešin
 * (`VillageState.goods`) a o podíl medu v posledním jídle – jen ves bez zboží vsi (`wares`); ves
 * se zbožím jí med z klátů (hides-honey.md – Klát u obydlí) a podíl jí zůstane. Výprava na cestě,
 * která měla přinést zboží zvenku, se ruší celá: nosiči přinesou zpět, co nesli (`get` = `give`),
 * ves nic neztratí ani nezíská. Z kroniky výprav zboží zvenku zmizí. Zbytky roku sousedů nechá –
 * smaže je převod `withoutFictionalNeighbours`. Bez čeho převádět, vrátí tentýž objekt;
 * idempotentní (jako `withKinship`).
 */
export function withoutForeignGoods(state: VillageState): VillageState {
  const legacy = state as VillageState & { goods?: unknown };
  const shares = state.diet?.shares;
  // převod běží při každém načtení – podíl medu ze zboží zvenku má jen ves bez zboží vsi
  const foreignHoney = shares?.honey !== undefined && state.wares === undefined;
  const trade = state.trade;
  const foreignExpeditions =
    trade?.expeditions.some((e) => hasForeign(e.give) || hasForeign(e.get)) ?? false;
  const foreignEvents = state.chronicle.some(foreignTradeEvent);
  if (legacy.goods === undefined && !foreignHoney && !foreignExpeditions && !foreignEvents) {
    return state;
  }
  const next: VillageState & { goods?: unknown } = { ...state };
  delete next.goods;
  if (state.diet && shares && foreignHoney) {
    const { grain, meat, dairy, eggs, fruit, legumes } = shares;
    next.diet = {
      ...state.diet,
      shares: { grain, meat, dairy, eggs, fruit, ...(legumes !== undefined ? { legumes } : {}) },
    };
  }
  if (trade && foreignExpeditions) {
    next.trade = {
      ...trade,
      expeditions: trade.expeditions.map((e) =>
        hasForeign(e.give) || hasForeign(e.get)
          ? { ...e, give: knownGoods(e.give), get: knownGoods(hasForeign(e.get) ? e.give : e.get) }
          : e,
      ),
    };
  }
  if (foreignEvents) {
    next.chronicle = state.chronicle.map((event) => {
      if (event.kind === 'trade-departed') return { ...event, give: knownGoods(event.give) };
      if (event.kind === 'trade-returned') return { ...event, get: knownGoods(event.get) };
      return event;
    });
  }
  return next;
}
