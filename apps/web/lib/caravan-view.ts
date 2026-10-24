// Výpravy k sousedům pro karavanu ve scéně (docs/design/trade.md – Ve scéně): z výprav na cestě
// ve stavu vsi kdo jde tam a zpátky (nosiči, vozy, lidé, kteří se stěhují – pohlaví a věk z jádra)
// a postup výpravy s dnešním tempem – scéna (scene/caravan.ts) z toho rozestaví karavanu po
// zemské stezce. Čistý modul na serveru.
import {
  CARTS,
  CART_IRON,
  TRADE,
  ageYears,
  isCattleGood,
  isLivestockGood,
  ironTripLine,
  neighbourOf,
  newcomerProfiles,
  purchaseLine,
  type CraftPurchase,
  type Dwelling,
  type IronTrip,
  type TradeExpedition,
  type TradeGoods,
  type VillageState,
} from '@bohemia/game';
import { expeditionToday } from './manor-view';
import type { SceneExpedition } from './village-view';

/** Kdo odešel s výpravou (výprava uložená dřív nemá `members` – dospělí střídavě muž a žena). */
function leavingOf(e: TradeExpedition, day: number): SceneExpedition['leaving'] {
  const give = e.givePeople;
  if (!give) return [];
  if (give.members) {
    return give.members.map((m) => ({ sex: m.sex, age: ageYears(m.bornDay, day) }));
  }
  return Array.from({ length: give.people }, (_, i) => ({
    sex: i % 2 === 0 ? 'male' : 'female',
    age: 25,
  }));
}

/** Nesou nosiči něco – zboží mimo dobytek a koně (ti jdou po svých s honákem). */
function carries(goods: TradeGoods): boolean {
  return Object.entries(goods).some(([g, n]) => !isLivestockGood(g) && (n ?? 0) > 0);
}

/** Dobytek ve zboží – krávy a voli (mladí i vycvičení) – trade.md, Dobytek ve třech druzích. */
function herdOf(goods: TradeGoods): { cows: number; oxen: number } {
  return { cows: goods.cows ?? 0, oxen: (goods.youngOxen ?? 0) + (goods.trainedOxen ?? 0) };
}

/**
 * Výpravy vsi na cestě pro scénu – karavany po zemských stezkách; i skupiny nákupu u sousedů
 * (crafts.md – Nákup u sousedů), bez stezky po přímce krajinou ke kraji mapy, a tesař nebo jeho
 * syn na cestě pro kování k vozu (wagons.md – Kování vozů).
 */
export function sceneExpeditions(state: VillageState): SceneExpedition[] {
  return [
    ...tradeCaravans(state),
    ...(state.purchases ?? []).map((p) => purchaseCaravan(state, p)),
    ...state.dwellings.flatMap((d) => {
      const trip = d.workshop?.ironTrip;
      return trip ? [ironCaravan(state, d, trip)] : [];
    }),
  ];
}

/** Výpravy k sousedům (trade.md – Ve scéně). */
function tradeCaravans(state: VillageState): SceneExpedition[] {
  const day = state.lastDay;
  return (state.trade?.expeditions ?? []).map((e) => {
    const today = expeditionToday(state, e);
    // dnešní tempo – výprava vyslaná dnes vyrazí plným tempem
    const perDay = today === null ? e.porters : today;
    const coming = newcomerProfiles(state.seed, String(e.id), e.getPeople ?? { families: [] });
    // vozy jedou víckrát (wagons.md – Opakované jízdy vozu): postup a tempo platí pro právě
    // běžící jízdu; lidé vyrazí první jízdou, noví lidé se vrací poslední
    const trips = Math.max(1, e.trips ?? 1);
    const whole = e.cost > 0 ? Math.min(1, e.done / e.cost) : 1;
    const trip = Math.min(trips - 1, Math.floor(whole * trips));
    const local = whole >= 1 ? 1 : whole * trips - trip;
    const tripDays = e.days / trips;
    return {
      id: e.id,
      trailId: e.trailId,
      porters: e.porters,
      carts: [...(e.carts ?? [])],
      cartCrew: CARTS.tradeCrew,
      ...(trips > 1 ? { trips } : {}),
      leaving: trip === 0 ? leavingOf(e, day) : [],
      coming: (trip === trips - 1 ? coming : []).flatMap((p) =>
        p.members.map((m) => ({ sex: m.sex, age: m.ageYears })),
      ),
      carriesOut: carries(e.give),
      carriesBack: carries(e.get),
      // dobytek jde po svých – prodaný tam, koupený zpátky (trade.md – Dobytek ve třech druzích)
      ...(Object.keys({ ...e.give, ...e.get }).some(isCattleGood)
        ? { cattle: { out: herdOf(e.give), back: herdOf(e.get) } }
        : {}),
      progress: Math.round(local * 1e4) / 1e4,
      rate: e.cost > 0 ? Math.round(((perDay * trips) / e.cost) * 1e4) / 1e4 : 0,
      day,
      onMap: tripDays > 0 ? Math.max(0.2, (tripDays - TRADE.beyondEdgeDays) / tripDays) : 1,
      trip: { kind: 'trade', to: neighbourOf(state.seed, e.direction).name },
    };
  });
}

/**
 * Skupina nákupu u souseda jako karavana (crafts.md – Nákup u sousedů): nosiči nesou platbu tam
 * a výrobky zpátky, po hotové stezce, jinak po přímce od vsi ke kraji mapy (`line`). Jde-li skupina
 * vícekrát (`tripDays` < `days`), karavana jde každou cestu zvlášť – postup v právě běžící cestě,
 * den za den 1 ÷ dny cesty (lidé jdou každý den, nečekají na volné ruce).
 */
function purchaseCaravan(state: VillageState, p: CraftPurchase): SceneExpedition {
  const trip = Math.max(1, Math.min(p.days, p.tripDays ?? p.days));
  const round = Math.floor(p.done / trip);
  const progress = Math.min(1, (p.done - round * trip) / trip);
  return {
    id: `purchase:${p.direction}:${p.startedDay}`,
    trailId: p.trailId,
    ...(p.trailId === null ? { line: purchaseLine(state, p) } : {}),
    porters: p.group,
    carts: [],
    cartCrew: CARTS.tradeCrew,
    leaving: [],
    coming: [],
    carriesOut: (p.pay.grainKg ?? 0) + (p.pay.legumesKg ?? 0) > 0,
    carriesBack: true,
    progress: Math.round(progress * 1e4) / 1e4,
    rate: p.done < p.days ? Math.round((1 / trip) * 1e4) / 1e4 : 0,
    day: state.lastDay,
    onMap: Math.max(0.2, (trip - TRADE.beyondEdgeDays) / trip),
    trip: { kind: 'purchase', to: neighbourOf(state.seed, p.direction).name },
  };
}

/**
 * Cesta pro kování k vozu jako karavana (wagons.md – Kování vozů; Martin 20. 10. 2026: „pokud
 * zaplatil 173 kg obilí, tak nemohl jít sám. Buď si musel půjčit vůz nebo muselo jít alespoň 6 lidí,
 * aby to obilí unesli“): s vozem jede po zemské stezce vůz se sedlákem (honák u spřežení) a tesař
 * nebo jeho syn vedle vozu; pěšky tesař nebo syn (pohlaví a věk z jádra) a nosiči s obilím tam
 * – zpátky jdou s kováním bez nákladu. Po stezce, nebo krajinou rovně ke kraji mapy (za krajem
 * zmizí), nebo do jiné vsi na téže mapě ke kovárně a zpět (celou cestu vidět). Jde-li skupina
 * víckrát, každou cestu zvlášť jako nákup u sousedů.
 */
function ironCaravan(state: VillageState, dwelling: Dwelling, trip: IronTrip): SceneExpedition {
  const traveller = state.people.find((p) => p.id === trip.personId);
  const who = {
    sex: traveller?.sex ?? 'male',
    age: traveller ? ageYears(traveller.bornDay, state.lastDay) : 30,
  };
  const line = ironTripLine(dwelling, trip);
  const days = Math.max(1, trip.days);
  const leg = Math.max(1, Math.min(days, trip.tripDays ?? days));
  const round = Math.floor(trip.done / leg);
  const progress = Math.min(1, (trip.done - round * leg) / leg);
  const byCart = trip.cartId !== undefined;
  return {
    id: `iron:${dwelling.id}:${trip.startedDay}`,
    trailId: trip.to.kind === 'neighbour' ? trip.to.trailId : null,
    ...(line ? { line } : {}),
    // s vozem jde vedle vozu tesař (pomocník) a honák u spřežení je sedlák
    porters: byCart ? 0 : (trip.porters ?? 0),
    carts: byCart ? [trip.cartId!] : [],
    cartCrew: CART_IRON.cartCrew,
    leaving: byCart ? [] : [who],
    coming: byCart ? [] : [who],
    carriesOut: true,
    carriesBack: false,
    progress: Math.round(progress * 1e4) / 1e4,
    rate: trip.done < days ? Math.round((1 / leg) * 1e4) / 1e4 : 0,
    day: state.lastDay,
    // do vsi na téže mapě je celá cesta vidět, k sousedovi den za krajem mapy (jako nákup)
    onMap: trip.to.kind === 'village' ? 1 : Math.max(0.2, (leg - TRADE.beyondEdgeDays) / leg),
    trip: {
      kind: 'iron',
      to: trip.to.name,
      ...(traveller ? { travellerId: traveller.id } : {}),
    },
  };
}
