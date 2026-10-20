import { length2, type Landscape } from '../landscape';
import { addCart } from './carts';
import { neighbourCrafts, productPrice, purchaseRoute } from './craft-buying';
import { NO_STOCKS, cartAwaitingIron, occupiedWorkshops } from './crafts';
import { neighbourOf } from './neighbours';
import { CART_IRON, CRAFT_BUYING, NEIGHBOR_DIRECTIONS, TRADE } from './rules';
import { smithHead, smithSons } from './smith-supply';
import { trailTripDays } from './trail';
import type {
  CartKind,
  ChronicleEvent,
  Dwelling,
  IronTrip,
  IronTripTarget,
  Person,
  VillageState,
  Workshop,
} from './types';

// Kování vozů (wagons.md – Kování vozů; Martin 20. 10. 2026: „Ano. A taky přidej tedy pravidlo,
// že vozy mají železnou složku. Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho
// má) dojít do nejbližší vesnice, kde kovář je“; podrobnosti návrh Clauda). Vůz má kování (osy,
// hřeby, obruče a kování nábojů) – dvoukolák 3 kg, čtyřkolák 6 kg ze zásoby nástrojů od kováře.
// Tesař vůz rozdělá; s hotovou dřevěnou prací čeká na kování a dělá zatím dřevěné nářadí. Ves
// s kovářem ho má ze zásoby (chybí-li, kovář ho vyrobí přednostně – `smithToolsTarget`), ves bez
// kováře pošle syna tesaře od 14 let, nebo tesaře, do nejbližší vsi s kovářem – jiné vsi hráče na
// téže mapě, nebo souseda za krajem mapy (cesta a platba obilím jako nákup u sousedů). Kroky mutují
// stav (volat na klonu), den po dni, deterministicky.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik kování vůz potřebuje (kg). */
export function cartIronKg(kind: CartKind): number {
  return CART_IRON.kg[kind];
}

/**
 * Má ves vlastního kováře, který kování vyrobí (wagons.md – Kování vozů): obývaná kovárna, která
 * má kde kopat rudu a odkud brát uhlí (bez uhlí jen s uhlířem ve vsi – uhlí přijde).
 */
export function smithAtHome(state: VillageState): boolean {
  const smiths = occupiedWorkshops(state, 'smith');
  if (smiths.length === 0) return false;
  const burner = occupiedWorkshops(state, 'burner').length > 0;
  return smiths.some((d) => {
    const activity = d.workshop!.activity;
    return activity !== 'no-ore' && (activity !== 'no-charcoal' || burner);
  });
}

/**
 * Kdo z dílny tesaře `dwellingId` jde pro kování: nejstarší syn od CART_IRON.fetchFromAge let,
 * jinak tesař (hlava domácnosti, ne dítě); nikdo, když v dílně není dospělý.
 */
export function ironCarrier(
  state: Pick<VillageState, 'people'>,
  dwellingId: number,
  day: number,
): { person: Person; son: boolean } | null {
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const son = smithSons(state, dwellingId, day).find((s) => s.age >= CART_IRON.fetchFromAge);
  if (son) return { person: byId.get(son.id)!, son: true };
  const members = state.people.filter((p) => p.dwellingId === dwellingId);
  const head = smithHead(members, day);
  if (!head || head.age < CART_IRON.fetchFromAge) return null;
  return { person: byId.get(head.id)!, son: false };
}

/**
 * Dny cesty tam a zpět k jiné vsi na téže mapě (m vzdušnou čarou): krajinou jako nákup u sousedů
 * (× CRAFT_BUYING.offTrailFactor, dny jako výprava – `trailTripDays`) bez dne za krajem mapy.
 */
export function mapTripDays(distanceM: number): number {
  return trailTripDays(distanceM * CRAFT_BUYING.offTrailFactor) - TRADE.beyondEdgeDays;
}

/** Kam a za kolik dní tam a zpět jde tesař pro kování. */
export interface IronRoute {
  to: IronTripTarget;
  days: number;
}

/**
 * Nejbližší ves s kovářem pro tesaře z `from` (wagons.md – Kování vozů): obývané kovárny jiných
 * vsí hráče na téže mapě (`neighbourSnapshot` – smithies; jde se k nim krajinou, celou cestu je
 * vidět) a sousedé za krajem mapy s kovářem (`neighbourCrafts` – po hotové stezce, nebo krajinou
 * ke kraji mapy jako nákup u sousedů). Nejméně dní cesty; při shodě ves na téže mapě, pak pořadí
 * směrů. Bez vsi s kovářem null.
 */
export function ironRoute(
  state: VillageState,
  from: { x: number; z: number },
  landscape: Landscape | null,
): IronRoute | null {
  let best: IronRoute | null = null;
  for (const smithy of state.neighbours?.smithies ?? []) {
    const days = mapTripDays(length2(smithy.x - from.x, smithy.z - from.z));
    if (!best || days < best.days) {
      best = { to: { kind: 'village', name: smithy.name, x: smithy.x, z: smithy.z }, days };
    }
  }
  for (const direction of NEIGHBOR_DIRECTIONS) {
    if (!neighbourCrafts(state.seed, direction).includes('smith')) continue;
    const route = purchaseRoute(state, direction, landscape, from);
    if (best && route.days >= best.days) continue;
    best = {
      to: {
        kind: 'neighbour',
        name: neighbourOf(state.seed, direction).name,
        direction,
        trailId: route.trailId,
        edge: { x: Math.round(route.edge.x * 10) / 10, z: Math.round(route.edge.z * 10) / 10 },
      },
      days: route.days,
    };
  }
  return best;
}

/** Kolik obilí stojí kování (kg) – u kováře souseda jako nákup nástrojů (0,96 hodnoty). */
export function ironPriceKg(kg: number): number {
  return kg * productPrice('toolsKg');
}

/** Dokončí vůz s kováním (mutuje stav): vůz přibude do vozů vsi, kronika `cart-made`. */
function finishCart(state: VillageState, workshop: Workshop, day: number): ChronicleEvent {
  const kind = workshop.cart!.kind;
  addCart(state, kind, day);
  workshop.cart = null;
  return { day, kind: 'cart-made', cart: kind };
}

/**
 * Kování vozů dne (mutuje stav – krok dne po práci; wagons.md – Kování vozů), po dílnách tesařů:
 * 1. kdo jde pro kování, ujde den – po návratu přinese kování a vůz je hotový (`iron-brought`,
 *    `cart-made`); kdo cestou zemřel nebo z vsi odešel, kování nepřinese (vůz čeká dál),
 * 2. vůz s hotovou dřevěnou prací vezme kování ze zásoby nástrojů, když v ní je – hotový,
 * 3. jinak, když ves nemá vlastního kováře (`smithAtHome`), jde syn tesaře od 14 let, nebo tesař,
 *    do nejbližší vsi s kovářem (`ironRoute`) – obilí za kování dá ves ze zásob hned; ves, která
 *    šetří jídlem nebo nemá obilí, vsi s kovářem nebo člověka, nechá vůz čekat (ves s kovářem –
 *    jeho zakázka).
 */
export function cartIronDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): ChronicleEvent[] {
  const carpenters = state.dwellings.filter(
    (d) => d.workshop?.craft === 'carpenter' && (d.workshop.ironTrip || d.workshop.cart),
  );
  if (carpenters.length === 0) return [];
  const events: ChronicleEvent[] = [];
  carpenters.sort((a, b) => a.id - b.id);
  let atHome: boolean | null = null;
  for (const dwelling of carpenters) {
    const workshop = dwelling.workshop!;
    const trip = workshop.ironTrip;
    if (trip) {
      if (!state.people.some((p) => p.id === trip.personId)) {
        workshop.ironTrip = null;
      } else {
        trip.done += 1;
        if (trip.done < trip.days) continue;
        workshop.ironTrip = null;
        if (workshop.cart) {
          events.push({ day, kind: 'iron-brought', cart: workshop.cart.kind, son: trip.son });
          events.push(finishCart(state, workshop, day));
        }
        continue;
      }
    }
    if (!cartAwaitingIron(workshop)) continue;
    const kg = cartIronKg(workshop.cart!.kind);
    const stocks = state.crafts ?? NO_STOCKS;
    if (stocks.toolsKg + EPSILON >= kg) {
      // kování ze zásoby nástrojů od kováře (vlastního nebo koupené)
      state.crafts = { ...stocks, toolsKg: Math.max(0, stocks.toolsKg - kg) };
      events.push(finishCart(state, workshop, day));
      continue;
    }
    atHome ??= smithAtHome(state);
    if (atHome) continue;
    const trip2 = startIronTrip(state, dwelling, day, landscape, kg);
    if (trip2) {
      events.push({
        day,
        kind: 'iron-trip',
        cart: workshop.cart!.kind,
        to: trip2.to.name,
        son: trip2.son,
        ...(trip2.to.kind === 'neighbour' ? { direction: trip2.to.direction } : {}),
      });
    }
  }
  return events;
}

/**
 * Vyšle syna tesaře nebo tesaře pro kování (mutuje stav): kam (`ironRoute` od dílny), kdo
 * (`ironCarrier`) a platba obilím (`ironPriceKg`) ze zásob – jen ves, která nešetří jídlem
 * (`hungry` – výhled jídla do sklizně vychází; kování je malá částka, rozhodnutí Clauda). Když
 * něco chybí,
 * nic a null.
 */
function startIronTrip(
  state: VillageState,
  dwelling: Dwelling,
  day: number,
  landscape: Landscape | null,
  kg: number,
): IronTrip | null {
  const carrier = ironCarrier(state, dwelling.id, day);
  if (!carrier) return null;
  const route = ironRoute(state, dwelling.position, landscape);
  if (!route) return null;
  const grainKg = ironPriceKg(kg);
  if (state.hungry || state.storesKg + EPSILON < grainKg) return null;
  state.storesKg = Math.max(0, state.storesKg - grainKg);
  const trip: IronTrip = {
    personId: carrier.person.id,
    son: carrier.son,
    startedDay: day,
    days: route.days,
    done: 0,
    kg,
    grainKg: Math.round(grainKg * 100) / 100,
    to: route.to,
  };
  dwelling.workshop!.ironTrip = trip;
  return trip;
}

/** Kolik dní cesty pro kování ještě zbývá (panel). */
export function ironTripDaysLeft(trip: Pick<IronTrip, 'days' | 'done'>): number {
  return Math.max(0, trip.days - trip.done);
}

/**
 * Čára cesty pro kování krajinou (scéna – postava jako karavana nákupu u sousedů): od dílny tesaře
 * rovně k bodu na kraji mapy, nebo ke kovárně jiné vsi na téže mapě; po zemské stezce null.
 */
export function ironTripLine(
  dwelling: Pick<Dwelling, 'position'>,
  trip: Pick<IronTrip, 'to'>,
): { x: number; z: number }[] | null {
  const from = { x: dwelling.position.x, z: dwelling.position.z };
  if (trip.to.kind === 'village') return [from, { x: trip.to.x, z: trip.to.z }];
  if (trip.to.trailId !== null) return null;
  return [from, { ...trip.to.edge }];
}
