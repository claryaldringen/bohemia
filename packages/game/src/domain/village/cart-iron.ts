import { length2, type Landscape } from '../landscape';
import { addCart, cartOxen, cartsAway, trailCartPassable, villageCarts } from './carts';
import { addCartDemand } from './draft';
import { oxPens, oxenHome } from './oxen';
import { groupCap, neighbourCrafts, productPrice, purchaseRoute, tripOf } from './craft-buying';
import { NO_STOCKS, cartAwaitingIron, occupiedWorkshops } from './crafts';
import { neighbourOf } from './neighbours';
import { CARTS, CART_IRON, CRAFT_BUYING, NEIGHBOR_DIRECTIONS, TRADE } from './rules';
import { smithHead, smithSons } from './smith-supply';
import { trailTripDays } from './trail';
import type {
  Cart,
  CartKind,
  ChronicleEvent,
  Dwelling,
  IronTrip,
  IronTripTarget,
  LaborTarget,
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
// téže mapě, nebo souseda za krajem mapy (cesta a platba obilím jako nákup u sousedů). Platbu sám
// neunese (Martin 20. 10. 2026: „pokud zaplatil 173 kg obilí, tak nemohl jít sám. Buď si musel
// půjčit vůz nebo muselo jít alespoň 6 lidí, aby to obilí unesli“): veze ji volný vůz se sedlákem,
// nebo ji nesou nosiči z vsi po 25 kg. Kroky mutují stav (volat na klonu), den po dni,
// deterministicky.

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
 * Vsi s kovářem, kam může tesař z `from` jít pro kování (wagons.md – Kování vozů): obývané kovárny
 * jiných vsí hráče na téže mapě (`neighbourSnapshot` – smithies; jde se k nim krajinou, celou
 * cestu je vidět) a sousedé za krajem mapy s kovářem (`neighbourCrafts` – po hotové stezce, nebo
 * krajinou ke kraji mapy jako nákup u sousedů), s dny cesty tam a zpět. V pořadí: vsi na téže mapě,
 * pak směry.
 */
export function ironDestinations(
  state: VillageState,
  from: { x: number; z: number },
  landscape: Landscape | null,
): IronRoute[] {
  const out: IronRoute[] = [];
  for (const smithy of state.neighbours?.smithies ?? []) {
    out.push({
      to: { kind: 'village', name: smithy.name, x: smithy.x, z: smithy.z },
      days: mapTripDays(length2(smithy.x - from.x, smithy.z - from.z)),
    });
  }
  for (const direction of NEIGHBOR_DIRECTIONS) {
    if (!neighbourCrafts(state.seed, direction).includes('smith')) continue;
    const route = purchaseRoute(state, direction, landscape, from);
    out.push({
      to: {
        kind: 'neighbour',
        name: neighbourOf(state.seed, direction).name,
        direction,
        trailId: route.trailId,
        edge: { x: Math.round(route.edge.x * 10) / 10, z: Math.round(route.edge.z * 10) / 10 },
      },
      days: route.days,
    });
  }
  return out;
}

/**
 * Projede vůz cestou pro kování (wagons.md – Kování vozů): jen po hotové zemské stezce sjízdné pro
 * vozy (jako vozy výprav – `trailCartPassable`); krajinou ke kraji mapy a do vsi na téže mapě ne.
 */
function cartCanGo(state: VillageState, route: IronRoute, landscape: Landscape | null): boolean {
  if (route.to.kind !== 'neighbour' || route.to.trailId === null) return false;
  const trailId = route.to.trailId;
  const trail = (state.trails ?? []).find((t) => t.id === trailId);
  return !!trail && trailCartPassable(state, trail, landscape);
}

/**
 * Volný vůz pro platbu za kování (wagons.md – Kování vozů): doma (ne na výpravě ani s jinou
 * platbou; vůz, na který se kování dělá, ještě mezi vozy vsi není), s voly doma (`oxenHome`,
 * `cartOxen`) a s nákladem na platbu – dvoukolák napřed (jeden vůl), pak podle id. Jinak null.
 */
export function freeIronCart(state: VillageState, day: number, grainKg: number): Cart | null {
  const away = cartsAway(state);
  const oxen = oxenHome(state, day);
  const free = villageCarts(state)
    .filter(
      (c) =>
        !away.has(c.id) && oxen >= cartOxen(c.kind) && CARTS.loadKg[c.kind] + EPSILON >= grainKg,
    )
    .sort((a, b) => cartOxen(a.kind) - cartOxen(b.kind) || a.id - b.id);
  return free[0] ?? null;
}

/**
 * Jak jde tesař pro kování (wagons.md – Kování vozů): kam, dny jedné cesty tam a zpět, dny celkem
 * (nosiči víckrát), kolik nosičů z vsi jde s ním, vůz (null – pěšky) a práce vsi celkem (čd – tesař
 * nebo syn a nosiči, nebo sedlák, krát dny).
 */
export interface IronPlan {
  to: IronTripTarget;
  tripDays: number;
  days: number;
  porters: number;
  cart: boolean;
  labor: number;
}

/**
 * Možnosti cesty pro kování (wagons.md – Kování vozů; stav nemění): do každé vsi s kovářem
 * (`ironDestinations`) **pěšky s nosiči** – skupina jako nákup u sousedů (`tripOf`: lidí = nákladů
 * obilí po 25 kg, tesař nese taky, nejvýš `groupCap`; když jich ves tolik nemá, jdou víckrát) –
 * a kam projede vůz (`cartCanGo`), i **vozem se sedlákem** (tesař a CART_IRON.cartCrew sedlák,
 * jedna cesta). Vozem bez ohledu na to, jestli je dnes vůz volný – to rozhodne `ironPlan`.
 */
export function ironOptions(
  state: VillageState,
  day: number,
  from: { x: number; z: number },
  landscape: Landscape | null,
  grainKg: number,
): IronPlan[] {
  const cap = groupCap(state, day);
  const out: IronPlan[] = [];
  for (const route of ironDestinations(state, from, landscape)) {
    const walk = tripOf(grainKg, route.days, cap);
    out.push({
      to: route.to,
      tripDays: route.days,
      days: walk.days,
      porters: walk.group - 1,
      cart: false,
      labor: walk.labor,
    });
    if (cartCanGo(state, route, landscape)) {
      out.push({
        to: route.to,
        tripDays: route.days,
        days: route.days,
        porters: 0,
        cart: true,
        labor: (1 + CART_IRON.cartCrew) * route.days,
      });
    }
  }
  return out;
}

/** Levnější možnost: méně práce vsi celkem, při shodě kratší cesta, pak dřív v pořadí. */
function cheaper(a: IronPlan, b: IronPlan | null): boolean {
  if (!b) return true;
  if (a.labor < b.labor - EPSILON) return true;
  return Math.abs(a.labor - b.labor) <= EPSILON && a.days < b.days;
}

/** Nejlevnější z možností (`cheaper`); bez možností null. */
function cheapest(options: readonly IronPlan[]): IronPlan | null {
  let best: IronPlan | null = null;
  for (const o of options) if (cheaper(o, best)) best = o;
  return best;
}

/**
 * Cesta pro kování, kterou ves zvolí (wagons.md – Kování vozů): ze všech vsí s kovářem a obou
 * způsobů nejméně práce vsi celkem (tesař nebo syn a nosiči, nebo sedlák, krát dny cesty), při shodě
 * kratší cesta. Vozem jen s volným vozem (`hasCart`). Bez vsi s kovářem null.
 */
export function ironPlan(options: readonly IronPlan[], hasCart: boolean): IronPlan | null {
  return cheapest(options.filter((o) => hasCart || !o.cart));
}

/**
 * Kolik lidí z vsi je dnes s cestami pro kování pryč (wagons.md – Kování vozů): nosiči a sedlák
 * s vozem – chybí v práci vsi po celou cestu jako skupiny nákupu u sousedů. Tesař nebo jeho syn
 * se nepočítá (chybí v dílně – `ironTravellers`).
 */
export function ironTripHelpers(state: Pick<VillageState, 'dwellings'>): number {
  let n = 0;
  for (const d of state.dwellings) {
    const trip = d.workshop?.ironTrip;
    if (trip) n += ironTripCrew(trip);
  }
  return n;
}

/** Lidé z vsi u jedné cesty pro kování – nosiči, nebo sedlák s vozem. */
function ironTripCrew(trip: Pick<IronTrip, 'porters' | 'cartId'>): number {
  return (trip.porters ?? 0) + (trip.cartId !== undefined ? CART_IRON.cartCrew : 0);
}

/**
 * Cesty pro kování dne v rozdělení práce (činnost `trade` – jako nákup u sousedů): kam jde skupina
 * (stezka, kraj mapy, jiná ves na téže mapě) a kolik lidí z vsi s ní je. Jen cesty s nosiči nebo
 * vozem.
 */
export function ironTripShares(
  state: Pick<VillageState, 'dwellings'>,
): { target: LaborTarget; manDays: number }[] {
  const out: { target: LaborTarget; manDays: number }[] = [];
  for (const d of state.dwellings) {
    const trip = d.workshop?.ironTrip;
    if (!trip) continue;
    const manDays = ironTripCrew(trip);
    if (manDays <= 0) continue;
    const to = trip.to;
    const target: LaborTarget =
      to.kind === 'village'
        ? { kind: 'village' }
        : to.trailId !== null
          ? { kind: 'trail', id: to.trailId }
          : { kind: 'edge', direction: to.direction, ...to.edge };
    out.push({ target, manDays });
  }
  return out;
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
        ...(trip2.porters ? { porters: trip2.porters } : {}),
        ...(trip2.cartId !== undefined ? { byCart: true as const } : {}),
      });
    }
  }
  return events;
}

/**
 * Vyšle syna tesaře nebo tesaře pro kování (mutuje stav): kam (`ironRoute` od dílny), kdo
 * (`ironCarrier`) a platba obilím (`ironPriceKg`) ze zásob – jen ves, která nešetří jídlem
 * (`hungry` – výhled jídla do sklizně vychází; kování je malá částka, rozhodnutí Clauda). Platbu
 * veze volný vůz se sedlákem (`ironCart`), jinak ji nese skupina jako nákup u sousedů (`tripOf`):
 * tolik lidí, kolik je nákladů po 25 kg (tesař nese taky – 173 kg = 7 lidí), nejvýš malá skupina
 * vsi (`groupCap` – polovina dospělých, nejvýš 8); když jich ves tolik nemá, jdou víckrát (dny ×
 * počet cest). Když něco chybí, nic a null.
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
  const grainKg = ironPriceKg(kg);
  if (state.hungry || state.storesKg + EPSILON < grainKg) return null;
  const options = ironOptions(state, day, dwelling.position, landscape, grainKg);
  const cart = freeIronCart(state, day, grainKg);
  const plan = ironPlan(options, cart !== null);
  if (!plan) return null;
  // rok vozů vidí i cestu pro kování (wagons.md – Kolik vozů ves chce): kolik práce by vůz
  // ušetřil proti nejlevnější cestě pěšky – i když dnes volný vůz není
  const foot = cheapest(options.filter((o) => !o.cart));
  const byCart = cheapest(options.filter((o) => o.cart));
  if (
    foot &&
    byCart &&
    foot.labor > byCart.labor + EPSILON &&
    oxPens(state).some((p) => p.builtDay !== null)
  ) {
    addCartDemand(state, day, [foot.labor - byCart.labor], false);
  }
  state.storesKg = Math.max(0, state.storesKg - grainKg);
  const trip: IronTrip = {
    personId: carrier.person.id,
    son: carrier.son,
    startedDay: day,
    days: plan.days,
    done: 0,
    kg,
    grainKg: Math.round(grainKg * 100) / 100,
    to: plan.to,
  };
  if (plan.cart) trip.cartId = cart!.id;
  if (plan.porters > 0) trip.porters = plan.porters;
  if (plan.days > plan.tripDays) trip.tripDays = plan.tripDays;
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
