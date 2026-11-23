import { addCart } from './carts';
import { NO_STOCKS, cartAwaitingIron, cartIronBarsKg } from './crafts';
import { CART_IRON } from '../rules';
import type {
  CartKind,
  ChronicleEvent,
  Dwelling,
  IronTrip,
  LaborTarget,
  VillageState,
  Workshop,
} from '../types';

// Kování vozů (wagons.md – Kování vozů; Martin 20. 10. 2026: „Ano. A taky přidej tedy pravidlo,
// že vozy mají železnou složku“; podrobnosti návrh Clauda). Vůz má kování (osy, hřeby, obruče
// a kování nábojů) – dvoukolák 3 kg, čtyřkolák 6 kg; ve vsi se kove z hřiven (1,2 kg hřiven na kg –
// production-chains.md, Kovář). Tesař vůz rozdělá; s hotovou dřevěnou prací čeká na kování a dělá
// zatím dřevěné nářadí. Ves s hřivnami ho má z nich (chybí-li, kovář na zakázku taví a překovává
// přednostně – `smithBarsTargetKg`); ves bez kováře a bez hřiven vůz nedokončí – čeká, dokud kování
// nebude (Martin 22. 11. 2026: „Ves by měla být schopná přežít a rozvíjet se dle současných
// pravidel i bez obchodu“; kování u kováře souseda zrušeno – markets.md – Pravidla 1, vrátí se se
// skutečnými sousedy). Cesta pro kování, uložená ve starší vsi, doběhne (`cartIronDay` krok 1).
// Kroky mutují stav (volat na klonu), den po dni, deterministicky.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kolik kování vůz potřebuje (kg). */
export function cartIronKg(kind: CartKind): number {
  return CART_IRON.kg[kind];
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
 * (stezka, kraj mapy) a kolik lidí z vsi s ní je. Jen cesty s nosiči nebo
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
      to.trailId !== null
        ? { kind: 'trail', id: to.trailId }
        : { kind: 'edge', direction: to.direction, ...to.edge };
    out.push({ target, manDays });
  }
  return out;
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
 * 1. kdo šel pro kování (cesta uložená ve starší vsi), ujde den – po návratu přinese kování
 *    a vůz je hotový (`iron-brought`, `cart-made`); kdo cestou zemřel nebo z vsi odešel, kování
 *    nepřinese (vůz čeká dál),
 * 2. vůz s hotovou dřevěnou prací vezme kování z hřiven vsi (`cartIronBarsKg` – production-chains.md,
 *    Kovář), když jich je dost – hotový,
 * 3. jinak vůz čeká – nikdo pro kování nechodí.
 */
export function cartIronDay(state: VillageState, day: number): ChronicleEvent[] {
  const carpenters = state.dwellings.filter(
    (d) => d.workshop?.craft === 'carpenter' && (d.workshop.ironTrip || d.workshop.cart),
  );
  if (carpenters.length === 0) return [];
  const events: ChronicleEvent[] = [];
  carpenters.sort((a, b) => a.id - b.id);
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
    const stocks = state.crafts ?? NO_STOCKS;
    const bars = cartIronBarsKg(workshop.cart!.kind);
    if ((stocks.ironBarsKg ?? 0) + EPSILON >= bars) {
      // kování z hřiven vsi – od vlastního kováře (production-chains.md – Kovář)
      state.crafts = { ...stocks, ironBarsKg: Math.max(0, (stocks.ironBarsKg ?? 0) - bars) };
      events.push(finishCart(state, workshop, day));
    }
  }
  return events;
}

/** Kolik dní cesty pro kování ještě zbývá (panel). */
export function ironTripDaysLeft(trip: Pick<IronTrip, 'days' | 'done'>): number {
  return Math.max(0, trip.days - trip.done);
}

/**
 * Čára cesty pro kování krajinou (scéna – postava jako karavana nákupu u sousedů): od dílny tesaře
 * rovně k bodu na kraji mapy; po zemské stezce null.
 */
export function ironTripLine(
  dwelling: Pick<Dwelling, 'position'>,
  trip: Pick<IronTrip, 'to'>,
): { x: number; z: number }[] | null {
  const from = { x: dwelling.position.x, z: dwelling.position.z };
  if (trip.to.trailId !== null) return null;
  return [from, { ...trip.to.edge }];
}

/**
 * Převod vsi uložené v době, kdy rod mohl mít vsi na téže mapě (zrušeno – migration.md): cesta
 * pro kování ke kovárně jiné vsi (`to.kind === 'village'`) se zahodí (vůz čeká na kování, tesař
 * se vrátí k práci) a zbylý přehled sousedních vsí `neighbours` (dřív jen dočasný pohled) se
 * odebere. Bez čeho převádět, vrátí tentýž objekt; idempotentní.
 */
export function withoutSameMapVillages(state: VillageState): VillageState {
  const legacy = state as VillageState & { neighbours?: unknown };
  const staleTrip = (trip: unknown): boolean =>
    (trip as { to?: { kind?: string } } | null | undefined)?.to?.kind === 'village';
  const stale = state.dwellings.some((d) => staleTrip(d.workshop?.ironTrip));
  if (legacy.neighbours === undefined && !stale) return state;
  const next: VillageState & { neighbours?: unknown } = { ...state };
  delete next.neighbours;
  if (stale) {
    next.dwellings = state.dwellings.map((d) =>
      d.workshop && staleTrip(d.workshop.ironTrip)
        ? { ...d, workshop: { ...d.workshop, ironTrip: null } }
        : d,
    );
  }
  return next;
}
