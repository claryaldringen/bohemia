import { length2, type Landscape, type ObstacleLayer } from '../landscape';
import { cartOrigin } from './carts';
import type { HouseholdWater } from './labor';
import type { CartTarget } from './paths/cart';
import { villageCartRoutes } from './paths/roads';
import { PATH_WATER_SPOT } from './paths/terrain';
import { groundSpots, walkGroundOf } from './paths/walking';
import {
  CARTS,
  CART_JOBS,
  CHARCOAL_KILN,
  CRAFT_PRODUCTION,
  TEAM_TRAVEL,
  WATER_FETCHING,
} from './rules';
import type { CartDrive, CartKind, VillageState } from './types';

// Co vozy vozí mimo svoz (wagons.md – Co vozy vozí; Martin 19. 10. 2026: „Pokud budou mít
// k dispozici vůz, ať na pole, pro vodu nebo pro dřevěné uhlí jede vůz.“; podrobnosti návrh
// Clauda): dvoukolák, který dnes nesváží úrodu, seno ani klády a jehož voli neorají, jede pro uhlí
// k milíři, s osivem na pole, nebo pro vodu v sudech (CART_JOBS.order). Tady jsou jízdy – kam vůz
// dojede a za kolik, kolik práce posádky stojí a kolik ušetří; krok práce simulace (simulate.ts)
// z nich skládá den. Vůz jede jen tam, kam ho pustí vozová síť, a jen když ušetří práci.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
/** Délka pracovního dne v sekundách (jako chůze pro vodu – WATER_FETCHING.dayHours). */
const DAY_S = WATER_FETCHING.dayHours * 3600;
/** Vytahání, třídění a odnos uhlí z vypáleného milíře – čd na kg (charcoal.ts). */
const DRAW_MAN_DAYS_PER_KG = CHARCOAL_KILN.drawManDaysPerTree / CRAFT_PRODUCTION.charcoalKgPerTree;
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
 * Jízdy vozů vsi (wagons.md – Co vozy vozí): s krajinou trasy dvoukoláku vozovou sítí
 * (`villageCartRoutes` – cena v m po louce, konec trasy), bez krajiny (testy, kalibrace) vzdušnou
 * čarou od ohrady ke kraji cíle. Bez ohrady se spřežením null.
 */
export function villageCartDrives(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): CartDrives | null {
  if (!cartOrigin(state)) return null;
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
    const routes = villageCartRoutes(s, day, landscape, obstacles, 'two-wheel', targets);
    return targets.map((t, k) => {
      const route = routes?.[k];
      if (!route?.reached) return null;
      const end = route.points[route.points.length - 1] ?? t;
      return { costM: cm(route.cost), x: cm(end.x), z: cm(end.z) };
    });
  };
}

/** Jedna jízda tam a zpět po trase `costM` (m po louce) se zastávkami `stopS` (s). */
export function cartTripSeconds(costM: number, stopS: number): number {
  return (2 * Math.max(0, costM)) / TEAM_TRAVEL.speedMps + stopS;
}

/** Práce posádky vozu (CARTS.crew lidí) na jednu jízdu (čd). */
export function cartTripManDays(costM: number, stopS: number): number {
  return (CARTS.crew * cartTripSeconds(costM, stopS)) / DAY_S;
}

/** Kolik jízd vůz za den zvládne – co se vejde do dne, nejvýš CARTS.loadsPerCartDay. */
export function cartTripsPerDay(costM: number, stopS: number): number {
  return Math.min(CARTS.loadsPerCartDay, DAY_S / Math.max(1, cartTripSeconds(costM, stopS)));
}

// --- uhlí z milíře ----------------------------------------------------------------------------

/**
 * Odvoz uhlí vozem z milíře ke kováři (crafts.md – Uhlíř): práce posádky na kg uhlí, kolik uhlí
 * vůz za den nejvýš odveze a kde jeho trasa u milíře končí (m – jízdy do ročního provozu cest).
 */
export interface KilnCart {
  manDaysPerKg: number;
  maxKg: number;
  x: number;
  z: number;
}

/**
 * Vůz pro uhlí (wagons.md – Co vozy vozí, crafts.md – Uhlíř): s vozem odpadne odnos v koších –
 * CART_JOBS.charcoal.carryShare vytahání (u lesního milíře s přirážkou za chůzi `walkFactor`) –
 * a přibude práce posádky na jízdy (náklad CART_JOBS.charcoal.loadKg). Vůz se vezme, jen když tím
 * práce na kg uhlí klesne; kam nedojede (`drive` null), null.
 */
export function kilnCartOffer(drive: CartDrive | null, walkFactor: number): KilnCart | null {
  if (!drive) return null;
  const job = CART_JOBS.charcoal;
  const perKg = cartTripManDays(drive.costM, job.stopS) / job.loadKg;
  const saved = DRAW_MAN_DAYS_PER_KG * walkFactor * job.carryShare;
  if (perKg + EPSILON >= saved) return null;
  return {
    manDaysPerKg: perKg,
    maxKg: job.loadKg * cartTripsPerDay(drive.costM, job.stopS),
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
): CartDrive | null {
  const origin = cartOrigin(state);
  if (!landscape || !origin) return null;
  const key = `${state.walkLayoutKey ?? ''}|${origin.x},${origin.z}`;
  if (state.waterCart?.key === key) return state.waterCart.drive;
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
  state.waterCart = { key, drive: best };
  return best;
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
  /** Kolik vozů jelo. */
  carts: number;
  /** Kam vůz jezdí – konec trasy u břehu (m). */
  spot: { x: number; z: number };
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
    carts: Math.min(carts, Math.max(1, Math.ceil(trips / tripsPerCart - EPSILON))),
    spot: { x: drive.x, z: drive.z },
  };
}
