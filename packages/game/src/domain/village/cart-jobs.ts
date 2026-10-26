import { length2, type Landscape, type ObstacleLayer } from '../landscape';
import { cartLoadRatio, cartOrigin } from './carts';
import type { HouseholdWater } from './labor';
import type { CartTarget } from './paths/cart';
import { addRoadCartTrips, villageCartRoutes } from './paths/roads';
import { PATH_WATER_SPOT } from './paths/terrain';
import { groundSpots, walkGroundOf } from './paths/walking';
import { CARTS, CART_JOBS, TEAM_TRAVEL, WATER_FETCHING } from './rules';
import type { CartDrive, CartKind, CartTripLog, OreSite, VillageState } from './types';

// Co vozy vozí mimo svoz (wagons.md – Co vozy vozí; Martin 19. 10. 2026: „Pokud budou mít
// k dispozici vůz, ať na pole, pro vodu nebo pro dřevěné uhlí jede vůz.“; 20. 10. 2026: „Pokud
// bude ve vesnici vůz, tak kováři přiveze uhlí sedlák s vozem (a odečte se jeho práce). To samé
// u těžení rudy.“; podrobnosti návrh Clauda): dvoukolák, který dnes nesváží úrodu, seno ani klády
// a jehož voli neorají, jede pro uhlí k milíři, pro rudu na rudiště, s osivem na pole, nebo pro
// vodu v sudech (CART_JOBS.order). Tady jsou jízdy – kam vůz
// dojede a za kolik, kolik práce posádky stojí a kolik ušetří; krok práce simulace (simulate.ts)
// z nich skládá den. Vůz jede jen tam, kam ho pustí vozová síť, a jen když ušetří práci.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
/** Délka pracovního dne v sekundách (jako chůze pro vodu – WATER_FETCHING.dayHours). */
const DAY_S = WATER_FETCHING.dayHours * 3600;
/** Břehy pro vodu vozem nejméně tak daleko od sebe (m) – hledá se podél vody, ne v jednom místě. */
const WATER_SPOT_SPACING_M = 15;

/** Jízdy vozu od ohrady se spřežením k cílům: kam a za kolik dojede (null = nedojede). */
export type CartDrives = (
  state: VillageState,
  targets: readonly CartTarget[],
) => (CartDrive | null)[];

/** Na centimetry. */
function cm(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Jízdy vozů vsi (wagons.md – Co vozy vozí): s krajinou trasy vozu druhu `kind` vozovou sítí
 * (`villageCartRoutes` – cena v m po louce, konec trasy; pole stálou cenou – paths.md, Stálé trasy), bez
 * krajiny (testy, kalibrace) dvoukolák vzdušnou čarou od ohrady ke kraji cíle a čtyřkolák nikam. Bez ohrady se spřežením null.
 */
export function villageCartDrives(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  kind: CartKind = 'two-wheel',
): CartDrives | null {
  if (!cartOrigin(state)) return null;
  if (!landscape && kind === 'four-wheel') return null;
  if (!landscape) {
    return (s, targets) => {
      const origin = cartOrigin(s);
      return targets.map((t) =>
        origin
          ? {
              costM: cm(Math.max(0, length2(t.x - origin.x, t.z - origin.z) - t.reachM)),
              x: t.x,
              z: t.z,
            }
          : null,
      );
    };
  }
  return (s, targets) => {
    if (targets.length === 0) return [];
    const routes = villageCartRoutes(s, day, landscape, obstacles, kind, targets);
    return targets.map((t, k) => {
      const route = routes?.[k];
      if (!route?.reached) return null;
      const end = route.points[route.points.length - 1] ?? t;
      return {
        costM: cm(route.cost),
        x: cm(end.x),
        z: cm(end.z),
      };
    });
  };
}

/** Jedna jízda tam a zpět po trase `costM` (m po louce) se zastávkami `stopS` (s). */
export function cartTripSeconds(costM: number, stopS: number): number {
  return (2 * Math.max(0, costM)) / TEAM_TRAVEL.speedMps + stopS;
}

/** Práce posádky vozu (`crew` lidí – bez údaje CARTS.crew) na jednu jízdu (čd). */
export function cartTripManDays(costM: number, stopS: number, crew: number = CARTS.crew): number {
  return (crew * cartTripSeconds(costM, stopS)) / DAY_S;
}

/** Kolik jízd vůz za den zvládne – co se vejde do dne, nejvýš CARTS.loadsPerCartDay. */
export function cartTripsPerDay(costM: number, stopS: number): number {
  return Math.min(CARTS.loadsPerCartDay, DAY_S / Math.max(1, cartTripSeconds(costM, stopS)));
}

// --- uhlí z milíře a ruda z rudiště -----------------------------------------------------------

/**
 * Vůz se sedlákem pro uhlí nebo rudu (crafts.md – Uhlí a ruda kováře): práce sedláka ze společné
 * práce vsi na kg, u rudy i práce kováře, který jede s ním (čd na kg – z práce dílny), kolik vůz
 * za den nejvýš odveze (kg) a kde jeho trasa u milíře nebo rudiště končí (m – jízdy do ročního
 * provozu cest).
 */
export interface SmithCart {
  manDaysPerKg: number;
  riderManDaysPerKg: number;
  maxKg: number;
  x: number;
  z: number;
}

/**
 * Vůz pro uhlí od milíře ke kováři (wagons.md – Co vozy vozí, crafts.md – Uhlí a ruda kováře): sedlák
 * (CART_JOBS.charcoal.crew) jede k milíři, uhlíř nakládá při vytahání, u kovárny složí kovář –
 * náklad CART_JOBS.charcoal.loadKg (čtyřkolák – `kind` – dvakrát tolik se stejnou posádkou). Vůz
 * se vezme, jen když práce sedláka na kg uhlí je menší než nošení v koších kovářovou domácností
 * (`footPerKg` – čd na kg); kam nedojede (`drive` null), null.
 */
export function kilnCartOffer(
  drive: CartDrive | null,
  footPerKg: number,
  kind: CartKind = 'two-wheel',
): SmithCart | null {
  if (!drive) return null;
  const job = CART_JOBS.charcoal;
  const loadKg = job.loadKg * cartLoadRatio(kind);
  const perKg = cartTripManDays(drive.costM, job.stopS, job.crew) / loadKg;
  if (perKg + EPSILON >= footPerKg) return null;
  return {
    manDaysPerKg: perKg,
    riderManDaysPerKg: 0,
    maxKg: loadKg * cartTripsPerDay(drive.costM, job.stopS),
    x: drive.x,
    z: drive.z,
  };
}

/**
 * Vůz pro rudu z rudiště do kovárny (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026: „Kovář
 * a sedlák s vozem dojedou na místo, kde se ruda těží, … a pak s plným vozem přijedou zase do
 * kovárny.“): sedlák a kovář (CART_JOBS.ore.crew) jedou k hromadě rudy u jámy, naloží plný
 * dvoukolák (CARTS.loadKg) a vrátí se – sedlák ze společné práce, kovář z práce dílny. Vůz se
 * vezme, jen když práce obou na kg rudy je menší než nošení v koších (`footPerKg`); kam nedojede,
 * null.
 */
export function oreCartOffer(
  drive: CartDrive | null,
  footPerKg: number,
  material: 'ore' | 'clay' = 'ore',
): SmithCart | null {
  if (!drive) return null;
  // hlína hrnčíři stejně (crafts.md – Hlína hrnčíře): hrnčíř a sedlák pro hromadu u jámy
  const job = CART_JOBS[material];
  const loadKg = CARTS.loadKg['two-wheel'];
  const trip = cartTripManDays(drive.costM, job.stopS, 1) / loadKg;
  if (trip * job.crew + EPSILON >= footPerKg) return null;
  return {
    manDaysPerKg: trip * (job.crew - 1),
    riderManDaysPerKg: trip,
    maxKg: loadKg * cartTripsPerDay(drive.costM, job.stopS),
    x: drive.x,
    z: drive.z,
  };
}

/**
 * Jízda vozu k milíři (uloží se u milíře – `CharcoalKiln.cart`): k jeho středu `at` do
 * CART_JOBS.charcoal.reachM (milíř v lese jen po pevné cestě – vozová síť ho jinak nepustí).
 */
export function kilnCartDrive(
  state: VillageState,
  at: { x: number; z: number },
  drives: CartDrives,
): CartDrive | null {
  return drives(state, [{ x: at.x, z: at.z, reachM: CART_JOBS.charcoal.reachM }])[0] ?? null;
}

/**
 * Jízda vozu k rudišti (uloží se u rudiště – `OreSite.cart`): k místu do CART_JOBS.ore.reachM
 * (mokřina – vůz sjede po suchém, ne do vody).
 */
export function oreCartDrive(
  state: VillageState,
  site: Pick<OreSite, 'x' | 'z'>,
  drives: CartDrives,
  material: 'ore' | 'clay' = 'ore',
): CartDrive | null {
  return drives(state, [{ x: site.x, z: site.z, reachM: CART_JOBS[material].reachM }])[0] ?? null;
}

// --- voda v sudech ---------------------------------------------------------------------------

/**
 * Kam vůz jezdí pro vodu (wagons.md – Co vozy vozí): ze suchých břehů nejblíž ohradě se spřežením
 * (CART_JOBS.water.spots, nejméně WATER_SPOT_SPACING_M od sebe – podél vody) ten, ke kterému vůz
 * sjede nejlevněji; když nesjede k žádnému, null (voda se nosí). Spočítá se pro rozložení vsi
 * (klíč chůze a ohrada) a uloží ve stavu (`VillageState.waterCart`, mutuje) – přepočet jen po
 * změně. Bez krajiny (bez břehů) null.
 */
export function waterCartDrive(
  state: VillageState,
  landscape: Landscape | null,
  drives: CartDrives,
  kind: CartKind = 'two-wheel',
): CartDrive | null {
  const origin = cartOrigin(state);
  if (!landscape || !origin) return null;
  // čtyřkolák má vlastní břeh – jen kam sjede po pevné cestě (wagons.md – Co se vozí a na čem)
  const field = kind === 'four-wheel' ? 'waterCart4' : 'waterCart';
  const key = `${state.walkLayoutKey ?? ''}|${origin.x},${origin.z}`;
  if (state[field]?.key === key) return state[field].drive;
  const spots = [...groundSpots(walkGroundOf(landscape), PATH_WATER_SPOT)]
    .map((p) => ({ p, d: length2(p.x - origin.x, p.z - origin.z) }))
    .sort((a, b) => a.d - b.d || a.p.x - b.p.x || a.p.z - b.p.z);
  const picked: { x: number; z: number }[] = [];
  for (const { p } of spots) {
    if (picked.length >= CART_JOBS.water.spots) break;
    if (picked.some((q) => length2(q.x - p.x, q.z - p.z) < WATER_SPOT_SPACING_M)) continue;
    picked.push(p);
  }
  const found = drives(
    state,
    picked.map((p) => ({ x: p.x, z: p.z, reachM: CART_JOBS.water.reachM })),
  );
  let best: CartDrive | null = null;
  for (const drive of found) {
    if (drive && (!best || drive.costM < best.costM)) best = drive;
  }
  state[field] = { key, drive: best };
  return best;
}

/**
 * Uložená jízda vozu `kind` k vodě (`waterCartDrive` – `VillageState.waterCart`, čtyřkolák
 * `waterCart4`) bez přepočtu – pro scénu, ať ukáže týž plán jako simulace. Bez uložené null.
 */
export function storedWaterCartDrive(
  state: Pick<VillageState, 'waterCart' | 'waterCart4'>,
  kind: CartKind,
): CartDrive | null {
  return (kind === 'four-wheel' ? state.waterCart4 : state.waterCart)?.drive ?? null;
}

/** Voda vozem na jeden den (`waterCartPlan`). */
export interface WaterCartPlan {
  /**
   * Přirážka denního minima za vodu po domácnostech (čd, ve stejném pořadí jako vstup): chůze
   * s vědry za vodu, kterou vůz nepřivezl, a díl práce posádky vozu.
   */
  water: number[];
  /** Práce posádky vozu (čd) – honák a nakladač, jízda, nabírání a rozlití. */
  crew: number;
  /** Chůze s vědry, kterou vůz ušetřil (čd). */
  saved: number;
  /** Kolik vody vůz přivezl (l) a za kolik jízd (podíl na náklad – jako svoz). */
  litres: number;
  trips: number;
  /**
   * Kolik dní vozu se spřežením jízdy zaberou (jízdy ÷ jízdy vozu za den – `cartTripsPerDay`) –
   * podíl dne páru, který ráno sveze vodu od rádla (wagons.md – Voda ráno ve dny orby).
   */
  cartDays: number;
  /** Kolik vozů jelo a jakých. */
  carts: number;
  kind: CartKind;
  /** Kam vůz jezdí – konec trasy u břehu (m). */
  spot: { x: number; z: number };
}

/**
 * Starší ves s pošlapanou plochou dílů (`trampledM2` – vůz přes zaseté pole) ji ztratí: vůz úrodu
 * nepošlape (paths.md – Stálé trasy; Martin 25. 10. 2026: „Pokud vůz pojede přes pole, tak žádnou
 * úrodu nepošlape – je to přiměřené herní zjednodušení.“). Jednou a idempotentně – bez pošlapání
 * týž objekt.
 */
export function withoutTrampledParts(state: VillageState): VillageState {
  if (!state.parts.some((p) => 'trampledM2' in p)) return state;
  return {
    ...state,
    parts: state.parts.map((p) => {
      if (!('trampledM2' in p)) return p;
      const rest: Partial<Record<'trampledM2', unknown>> & Omit<typeof p, 'trampledM2'> = { ...p };
      delete rest.trampledM2;
      return rest;
    }),
  };
}

/**
 * Jízdy vozů za den na jednom místě (wagons.md – Vyjeté cesty; mutuje): všechny jízdy z deníku
 * `log` (svoz, voda, uhlí, ruda, klády, osivo) přičte do ročního provozu cest. Pevné pořadí jízd =
 * pořadí zápisu.
 */
export function flushCartTrips(state: VillageState, log: CartTripLog): void {
  if (log.length === 0) return;
  if (state.roads) addRoadCartTrips(state.roads, log);
}

/**
 * Voda v sudech na den (wagons.md – Co vozy vozí; paths.md – Pochůzky pro vodu): vůz (`carts`
 * dvoukoláků) jezdí k břehu `drive` – sudy CART_JOBS.water.barrelL, jízda tam a zpět, nabírání
 * a rozlití. Domácnostem od největší úspory na litr (chůze s vědry nad WATER_FETCHING.includedM –
 * `HouseholdWater.labor`) přiveze jejich vodu (CART_JOBS.water.litresPerPerson na člověka), dokud
 * ji vozy za den uvezou a dokud je jízda levnější než chůze. Přirážka za vodu se zmenší o vodu,
 * kterou vůz přivezl, a přičte se díl práce posádky. Nic neušetří (nebo vůz nesjede k vodě) – null.
 */
export function waterCartPlan(
  households: readonly HouseholdWater[],
  carts: number,
  drive: CartDrive | null,
  kind: CartKind = 'two-wheel',
): WaterCartPlan | null {
  if (!drive || carts <= 0) return null;
  const job = CART_JOBS.water;
  const barrel = job.barrelL[kind];
  const stopS = job.fillS + job.unloadS;
  const perLitre = cartTripManDays(drive.costM, stopS) / barrel;
  const tripsPerCart = cartTripsPerDay(drive.costM, stopS);
  let capacity = carts * tripsPerCart * barrel;
  const order = households
    .map((h, k) => ({ k, h, litres: h.people * job.litresPerPerson }))
    .filter((x) => x.litres > EPSILON && x.h.labor / x.litres > perLitre + EPSILON)
    .sort((a, b) => b.h.labor / b.litres - a.h.labor / a.litres || a.k - b.k);
  const water = households.map((h) => h.labor);
  let litres = 0;
  let saved = 0;
  for (const { k, h, litres: need } of order) {
    if (capacity <= EPSILON) break;
    const brought = Math.min(need, capacity);
    capacity -= brought;
    const share = brought / need;
    water[k] = h.labor * (1 - share) + perLitre * brought;
    saved += h.labor * share;
    litres += brought;
  }
  if (litres <= EPSILON) return null;
  const trips = litres / barrel;
  return {
    water,
    crew: perLitre * litres,
    saved,
    litres,
    trips,
    cartDays: trips / tripsPerCart,
    carts: Math.min(carts, Math.max(1, Math.ceil(trips / tripsPerCart - EPSILON))),
    kind,
    spot: { x: drive.x, z: drive.z },
  };
}
