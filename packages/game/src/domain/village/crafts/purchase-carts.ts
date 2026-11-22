import { dateOfDayIndex } from '../../calendar';
import type { Landscape } from '../../landscape';
import { cropTaskRemaining, cropTaskWindows, seasonCrops, windowEndOf } from '../core/year-plan';
import { ploughTeamsAfield } from '../livestock/plough-trip';
import { oxenHome, ploughPairsHome } from '../livestock/oxen';
import {
  CARPENTRY,
  CARTS,
  CART_IRON,
  CRAFT_BUYING,
  DRAFT_OXEN,
  TRADE,
  TRADE_GOOD_VALUES,
} from '../rules';
import { buyValue, goodWorth } from '../trade/trade';
import { CART_KINDS, cartOxen, cartsAway, trailCartPassable, villageCarts } from './carts';
import type { Cart, CartKind, VillageState } from '../types';

// Vozy u nákupu u sousedů (crafts.md – Nákup u sousedů, Vozy; Martin 19. 10. 2026: „Až bude vůz,
// pojedou zásoby na voze a ušetří se člověkodny.“; CLAUDE.md: „Vesničané sami používají, co jim
// ulehčí práci“; Martin 22. 11. 2026 „ano“ – ves bez tesaře si vůz koupí u souseda, když se jí to
// vyplatí; podrobnosti návrh Clauda): má-li ves doma vůz a voly, kteří ten den neorají, jede nákup
// po sjízdné zemské stezce vozem – náklad na voze, s vozem honák a pomocník (CARTS.tradeCrew), jako
// výprava (wagons.md – Obchod, Opakované jízdy vozu) –, když je to levnější v práci než nosiči.
// Vůz od tesaře souseda má cenu z čísel, která už jsou (práce tesaře, klády a kování). Čisté
// funkce, stav nemění.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Orají dnes voli (oxen.md – Voli se sdílí, Spřežení zůstane na poli)? Spřežení je na poli, nebo
 * některá plodina má dnes v okně orbu, která zbývá (jako úloha orby dne – `dayTasks`).
 */
export function ploughingToday(state: VillageState, day: number): boolean {
  if (ploughTeamsAfield(state, day)) return true;
  if (!state.season) return false;
  const month = dateOfDayIndex(day).month;
  return seasonCrops(state.season).some(
    ({ crop, work }) =>
      cropTaskRemaining(work, 'plough') > EPSILON &&
      windowEndOf(cropTaskWindows(crop, 'plough'), month) !== null,
  );
}

/**
 * Voli, kteří můžou s nákupem (crafts.md – Nákup u sousedů, Vozy): vycvičení voli doma (ne
 * s výpravou, vozem pro kování ani s jiným nákupem), kteří dnes neorají – ve dny orby jdou páry
 * napřed k rádlům (stejně jako vozy svozu – `cartFleetToday`).
 */
export function purchaseOxen(state: VillageState, day: number): number {
  const plough = ploughingToday(state, day) ? DRAFT_OXEN.ard * ploughPairsHome(state, day) : 0;
  return Math.max(0, oxenHome(state, day) - plough);
}

/**
 * Vozy, které můžou s nákupem jet, každý se svými voly z `oxen` (dvoukolák jeden, čtyřkolák dva –
 * oxen.md, Potah): doma (`cartsAway`), čtyřkoláky napřed (víc nákladu), pak podle id – jako vozy
 * výpravy (`tradeCarts`). Vůz, na který voli nezbudou, zůstane doma.
 */
export function purchaseCarts(state: VillageState, oxen: number): Cart[] {
  const away = cartsAway(state);
  const home = villageCarts(state)
    .filter((c) => !away.has(c.id))
    .sort((a, b) => CART_KINDS.indexOf(b.kind) - CART_KINDS.indexOf(a.kind) || a.id - b.id);
  const out: Cart[] = [];
  let left = oxen;
  for (const cart of home) {
    if (left < cartOxen(cart.kind)) continue;
    left -= cartOxen(cart.kind);
    out.push(cart);
  }
  return out;
}

/**
 * Projede vůz cestou k sousedovi (wagons.md – Obchod, Kování vozů): jen po hotové zemské stezce
 * sjízdné pro vozy (`trailCartPassable`); krajinou ke kraji mapy ne.
 */
export function cartRoutePassable(
  state: VillageState,
  trailId: number | null,
  landscape: Landscape | null,
): boolean {
  if (trailId === null) return false;
  const trail = (state.trails ?? []).find((t) => t.id === trailId);
  return !!trail && trail.builtDay !== null && trailCartPassable(state, trail, landscape);
}

/** Doprava nákupu: kolik lidí jde naráz, dny celkem, práce (čd) a kolik vozů jede (0 – pěšky). */
export interface PurchaseTransport {
  group: number;
  days: number;
  labor: number;
  carts: number;
}

/**
 * Skupina pěšky (crafts.md – Nákup u sousedů): nosič nese TRADE.porterKg, nejvýš `cap` lidí naráz;
 * víc nákladu = víc cest tam a zpět.
 */
export function tripOf(
  loadKg: number,
  routeDays: number,
  cap: number,
): { group: number; days: number; labor: number } {
  const loads = Math.max(1, Math.ceil(loadKg / TRADE.porterKg - EPSILON));
  const group = Math.min(cap, loads);
  const rounds = Math.ceil(loads / group - EPSILON);
  const days = routeDays * rounds;
  return { group, days, labor: group * days };
}

/**
 * Nákup s prvními `n` vozy z `kinds` (wagons.md – Obchod, Opakované jízdy vozu): vozy jedou tolikrát,
 * kolikrát se naplní celé (aspoň jednou), zbytek aspoň TRADE.restTripShare vozů = ještě jedna jízda,
 * menší zbytek nesou nosiči rozdělení mezi jízdy; s každým vozem CARTS.tradeCrew lidé. Skupina
 * nejvýš `cap` lidí – víc nosičů by nešlo, vozy pak jedou ještě jednou. Null – posádka se do
 * skupiny nevejde.
 */
function cartTrip(
  loadKg: number,
  routeDays: number,
  cap: number,
  kinds: readonly CartKind[],
  n: number,
): PurchaseTransport | null {
  const crew = n * CARTS.tradeCrew;
  if (crew > cap) return null;
  const capacity = kinds.slice(0, n).reduce((sum, kind) => sum + CARTS.loadKg[kind], 0);
  const full = Math.floor(loadKg / capacity + EPSILON);
  const rest = Math.max(0, loadKg - full * capacity);
  let trips = Math.max(1, full);
  let porters = 0;
  if (full > 0 && rest >= TRADE.restTripShare * capacity - EPSILON) trips = full + 1;
  else if (full > 0) {
    porters = Math.ceil(Math.ceil(rest / TRADE.porterKg - EPSILON) / trips - EPSILON);
    if (crew + porters > cap) {
      trips = full + 1;
      porters = 0;
    }
  }
  const group = crew + porters;
  const days = trips * routeDays;
  return { group, days, labor: group * days, carts: n };
}

/**
 * Doprava nákupu (crafts.md – Nákup u sousedů, Vozy): pěšky (`tripOf`), nebo s vozy `kinds` (v pořadí
 * výběru – `purchaseCarts`; po sjízdné stezce, jinak prázdné) – počet vozů s nejmenší prací (lidé ×
 * dny), při shodě kratší a s méně vozy. Vozy jedou, jen když je to v práci levnější než nosiči
 * (jako vůz pro uhlí – wagons.md, Co vozy vozí).
 */
export function purchaseTransport(
  loadKg: number,
  routeDays: number,
  cap: number,
  kinds: readonly CartKind[],
): PurchaseTransport {
  let best: PurchaseTransport = { ...tripOf(loadKg, routeDays, cap), carts: 0 };
  for (let n = 1; n <= kinds.length; n++) {
    const trip = cartTrip(loadKg, routeDays, cap, kinds, n);
    if (!trip) continue;
    const cheaper =
      trip.labor < best.labor - EPSILON ||
      (Math.abs(trip.labor - best.labor) <= EPSILON && best.carts > 0 && trip.days < best.days);
    if (cheaper) best = trip;
  }
  return best;
}

/**
 * Kolik nákladu (kg) skupina odnese za jednu cestu tam a zpět: nosiči (`cap` × TRADE.porterKg),
 * nebo vozy z `kinds` s posádkou a nosiči do `cap` lidí – víc z toho.
 */
export function transportLoadKg(cap: number, kinds: readonly CartKind[]): number {
  let best = cap * TRADE.porterKg;
  let load = 0;
  for (let n = 1; n <= kinds.length; n++) {
    const crew = n * CARTS.tradeCrew;
    if (crew > cap) break;
    load += CARTS.loadKg[kinds[n - 1]!];
    best = Math.max(best, load + (cap - crew) * TRADE.porterKg);
  }
  return best;
}

/**
 * Hodnota vozu u tesaře souseda v kg obilí (crafts.md – Nákup u sousedů, Vozy; návrh Clauda – jen
 * z čísel, která už jsou): práce tesaře (CARPENTRY.cartManDays) za den tesaře v obilí jako dřevěné
 * nářadí (CRAFT_BUYING.woodToolsValueKg ÷ CARPENTRY.woodToolsManDaysPerKg – 2 kg obilí za 0,5 čd =
 * 4 kg za den), klády (CARPENTRY.cartLogs) za hodnotu klády v obchodu a kování (CART_IRON.kg) za
 * hodnotu nástrojů (jako kování k vozu – `ironPriceKg`). Dvoukolák 100 + 40 + 180 = 320 kg,
 * čtyřkolák 640 kg.
 */
export function cartValueKg(kind: CartKind): number {
  const dayKg = CRAFT_BUYING.woodToolsValueKg / CARPENTRY.woodToolsManDaysPerKg;
  return (
    CARPENTRY.cartManDays[kind] * dayKg +
    CARPENTRY.cartLogs[kind] * TRADE_GOOD_VALUES.logs.valueKg +
    CART_IRON.kg[kind] * CRAFT_BUYING.toolsValueKg
  );
}

/**
 * Kolik kg obilí soused chce za vůz – nabízené zboží za 0,96 hodnoty, po zlém roce kraje méně
 * (`goodWorth` jako u výrobků – `productPrice`).
 */
export function cartPriceKg(
  kind: CartKind,
  state?: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day?: number,
): number {
  const worth = state && day !== undefined ? goodWorth(state, 'pottery', day) : 1;
  return worth * buyValue(cartValueKg(kind));
}
