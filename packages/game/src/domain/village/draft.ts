import { CART_KINDS, villageCarts } from './carts';
import { HAY, HAY_WINTER_DAYS } from './hay';
import { oxPens, oxPlaces, villageOxen } from './oxen';
import {
  CARPENTRY,
  CARTS,
  CART_DEMAND,
  DRAFT_OXEN,
  FELLING_MAN_DAYS_PER_TREE,
  OXEN,
} from './rules';
import type { CartDemand, CartKind, DraftState, VillageState } from './types';

// Kolik volů a vozů ves chce (oxen.md – Kolik volů ves chce, wagons.md – Kolik vozů ves chce;
// Martin 20. 10. 2026: „Vesnice určitě potřebuje více vozů. Ať to funguje jako se stády - ohrada
// pro voly udrží určitý počet spřežení a když bude vesnice potřebovat víc vozů, ohrada se musí
// zvětšit.“). Páry k rádlům podle plánu osevu (1. 9.), vozy podle loňského provozu (rok vozů od
// 1. 11.): další vůz se vyplatí, když loni ušetřil (nebo by ušetřil) víc práce, než stojí – práce
// tesaře na 10 let života vozu a seno pro voly, které by ves kvůli němu držela navíc. Voli se sdílí
// – orba (podzim a jaro) a svoz (léto) se nepřekrývají, takže ves chce nejvyšší současnou potřebu:
// páry k rádlům, nebo voly všech vozů naráz, ne součet. Strop je místo v ohradách volů.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
const DAYS_PER_YEAR = 365.25;

/**
 * Páry k rádlům, které ves chce (plán osevu k 1. 9. – `DraftState.ploughPairs`): tolik, aby voli
 * zorali celý osev v oknech orby. Bez plánu (ves uložená dřív, nová ohrada) pár na každou ohradu
 * volů – jako dřív spřežení na ohradu. Bez ohrady volů 0.
 */
export function wantedPloughPairs(state: Pick<VillageState, 'pens' | 'draft'>): number {
  const pens = oxPens(state).length;
  if (pens === 0) return 0;
  return state.draft?.ploughPairs ?? pens;
}

/**
 * Páry k rádlům s hysterezí (oxen.md – Kolik volů ves chce; koordinátor za Martina 20. 10. 2026:
 * páry se nemají měnit rok od roku – rozhodnutí Clauda): `need` = kolik párů by letos stačilo
 * zorat celý osev. Ves páry změní, jen když potřeba leží dva plány po sobě na téže straně – zvýší
 * je na menší z obou potřeb, sníží na větší z nich; jinak drží, kolik má. Jednoletý výkyv tak
 * nevycvičí pár ani nepostaví rádlo (výcvik trvá 2 roky, pár slouží 10) a jeden slabší rok
 * nezastaví náhradu páru, který ves potřebuje. Bez předchozího plánu se loňská potřeba bere jako
 * dnešní páry (pár na ohradu volů).
 */
export function nextPloughPairs(
  state: Pick<VillageState, 'pens' | 'draft'>,
  need: number,
): { ploughPairs: number; ploughNeed: number } {
  const current = wantedPloughPairs(state);
  const previous = state.draft?.ploughNeed ?? current;
  const low = Math.min(need, previous);
  const high = Math.max(need, previous);
  return { ploughPairs: Math.min(high, Math.max(low, current)), ploughNeed: need };
}

/** Cena vozu za rok (čd): práce tesaře a klády na CARTS.lifespanYears života vozu. */
export function cartYearCost(kind: CartKind): number {
  const logs = CARPENTRY.cartLogs[kind] * FELLING_MAN_DAYS_PER_TREE;
  return (CARPENTRY.cartManDays[kind] + logs) / CARTS.lifespanYears;
}

/**
 * Cena vola za rok (čd – oxen.md, Kolik volů ves chce): seno přes zimu (`hayPerKg` – cena sena
 * v práci, `foodCosts`) a výcvik – 2 roky krmení bez práce rozpočítané na 10 let služby. Pastva
 * práci nestojí (pasou výrostci – diet.md, Pasáci).
 */
export function oxYearCost(hayPerKg: number): number {
  const hay = HAY.dailyKg.ox * HAY_WINTER_DAYS * hayPerKg;
  return hay * (1 + OXEN.trainingYears / OXEN.serviceYears);
}

/** Kolik volů táhne vozy `carts` naráz. */
function cartsOxen(carts: Readonly<Record<CartKind, number>>): number {
  return CART_KINDS.reduce((sum, kind) => sum + carts[kind] * DRAFT_OXEN[kind], 0);
}

/** Vozy, které ves má, po druzích. */
function ownedCarts(state: Pick<VillageState, 'carts'>): Record<CartKind, number> {
  const have: Record<CartKind, number> = { 'two-wheel': 0, 'four-wheel': 0 };
  for (const cart of villageCarts(state)) have[cart.kind]++;
  return have;
}

/** Kolik volů a vozů ves chce (`draftChoice`). */
export interface DraftChoice {
  /** Páry k rádlům. */
  pairs: number;
  /** Vozy po druzích. */
  carts: Record<CartKind, number>;
  /** Voli – páry k rádlům, nebo voli vozů naráz (víc z toho). */
  oxen: number;
}

/** Součet prvních `n` úspor. */
function firstSum(values: readonly number[], n: number): number {
  let sum = 0;
  for (let k = 0; k < n && k < values.length; k++) sum += values[k]!;
  return sum;
}

/**
 * Vozy, které se vyplatí (wagons.md – Kolik vozů ves chce): ze všech počtů dvoukoláků,
 * čtyřkoláků a volů, kteří se vejdou do `places` míst, ten, kde loňská úspora (`year` – k-tý vůz
 * ušetřil `year[kind][k]`) mínus cena vozů (`cartYearCost`) a volů navíc nad páry k rádlům
 * (`year.oxCost`) vyjde nejvýš; při shodě méně vozů a volů. Voli táhnou vozy naráz (dvoukolák
 * jeden, čtyřkolák dva); ve dny orby jezdí jen dvoukoláky s voly, kteří neorají (`year.plough`) –
 * na ně ves může držet vola navíc. Páry k rádlům nejvýš, kolik se jich vejde.
 */
export function chooseCarts(
  year: CartDemand & { oxCost: number },
  wantedPairs: number,
  places: number,
): DraftChoice {
  const pairs = Math.min(wantedPairs, Math.floor(places / DRAFT_OXEN.ard));
  const ploughOxen = pairs * DRAFT_OXEN.ard;
  let best: DraftChoice = {
    pairs,
    carts: { 'two-wheel': 0, 'four-wheel': 0 },
    oxen: ploughOxen,
  };
  let bestNet = 0;
  for (let four = 0; four <= CART_DEMAND.maxCarts['four-wheel']; four++) {
    for (let two = 0; two <= CART_DEMAND.maxCarts['two-wheel']; two++) {
      if (two === 0 && four === 0) continue;
      const carts = { 'two-wheel': two, 'four-wheel': four };
      const oxenOfCarts = cartsOxen(carts);
      const fromOxen = Math.max(ploughOxen, oxenOfCarts);
      const saved = firstSum(year['two-wheel'], two) + firstSum(year['four-wheel'], four);
      const cartCost = two * cartYearCost('two-wheel') + four * cartYearCost('four-wheel');
      // voli: aspoň na vozy a páry, nejvýš tolik, aby ve dny orby jezdily všechny dvoukoláky
      for (let oxen = fromOxen; oxen <= Math.min(places, ploughOxen + two); oxen++) {
        const ploughDay = firstSum(year.plough, Math.min(two, oxen - ploughOxen));
        const net = saved + ploughDay - cartCost - (oxen - ploughOxen) * year.oxCost;
        if (net > bestNet + EPSILON) {
          bestNet = net;
          best = { pairs, carts, oxen };
        }
      }
    }
  }
  return best;
}

/**
 * Kolik volů a vozů ves chce, když se do ohrad volů vejde `places` volů (bez meze `Infinity`):
 * páry k rádlům (`wantedPloughPairs`) a vozy, které se podle loňského provozu vyplatí
 * (`chooseCarts`); bez uzavřeného roku vozů jen vozy, které ves má. Bez ohrady volů nic.
 */
export function draftChoice(
  state: Pick<VillageState, 'pens' | 'draft' | 'carts'>,
  places: number,
): DraftChoice {
  const wanted = wantedPloughPairs(state);
  const none: Record<CartKind, number> = { 'two-wheel': 0, 'four-wheel': 0 };
  if (wanted === 0) return { pairs: 0, carts: none, oxen: 0 };
  const year = state.draft?.lastYear;
  if (year) return chooseCarts(year, wanted, places);
  const pairs = Math.min(wanted, Math.floor(places / DRAFT_OXEN.ard));
  const carts = ownedCarts(state);
  const oxen = Math.min(places, Math.max(pairs * DRAFT_OXEN.ard, cartsOxen(carts)));
  return { pairs, carts, oxen };
}

/**
 * Kolik volů ves chce bez ohledu na místo v ohradách (oxen.md – Kolik volů ves chce): páry
 * k rádlům, nebo voli vozů, které se vyplatí, naráz – víc z toho. Bez ohrady volů 0.
 */
export function wantedOxen(state: Pick<VillageState, 'pens' | 'draft' | 'carts'>): number {
  return draftChoice(state, Infinity).oxen;
}

/** Kolik volů ves cvičí a krmí – kolik jich chce v místech ohrad volů (`draftChoice`). */
export function oxenTrainingTarget(state: Pick<VillageState, 'pens' | 'draft' | 'carts'>): number {
  return draftChoice(state, oxPlaces(state)).oxen;
}

/**
 * Kolik vozů ves chce (wagons.md – Kolik vozů ves chce): vozy, které se podle loňského provozu
 * vyplatí a jejichž voli se vejdou do ohrad volů (`draftChoice`); bez uzavřeného roku vozů jen ty,
 * které má. Bez ohrady volů žádný – vůz bez volů stojí.
 */
export function cartTargets(
  state: Pick<VillageState, 'pens' | 'draft' | 'carts'>,
): Readonly<Record<CartKind, number>> {
  return draftChoice(state, oxPlaces(state)).carts;
}

/**
 * Vůz, který ves chce a nemá (ani se nevyrábí v žádné dílně tesaře) – dvoukolák napřed; jinak
 * null.
 */
export function missingCart(
  state: Pick<VillageState, 'pens' | 'draft' | 'carts' | 'dwellings'>,
): CartKind | null {
  const targets = cartTargets(state);
  const have = ownedCarts(state);
  for (const d of state.dwellings) {
    const making = d.workshop?.cart;
    if (making) have[making.kind]++;
  }
  return CART_KINDS.find((kind) => have[kind] < targets[kind]) ?? null;
}

/**
 * Chce ves víc volů, než se vejde do ohrad volů (upozornění „Voli se nevejdou do ohrady“ – jako
 * stáda)? Jen ves s hotovou ohradou volů (rozestavěná ohrada místa ještě nemá).
 */
export function oxenOverRoom(state: Pick<VillageState, 'pens' | 'draft' | 'carts'>): boolean {
  if (!oxPens(state).some((p) => p.builtDay !== null)) return false;
  return Math.max(wantedOxen(state), villageOxen(state)) > oxPlaces(state);
}

/**
 * Krávy na voly (diet.md – Krávy na obměnu volů; Martin 20. 10. 2026 – návrh Clauda): ves
 * s ohradou volů drží OXEN.minCows krav (pár telat do výcviku a chovná kráva) a na obměnu volů
 * OXEN.cowsPerOx krávy na každého vola, kterého cvičí a krmí (býčci ≈ 0,4 na krávu a rok, obměna
 * desetiny volů ročně). Bez ohrady volů 0.
 */
export function oxenCows(state: Pick<VillageState, 'pens' | 'draft' | 'carts'>): number {
  if (oxPens(state).length === 0) return 0;
  return OXEN.minCows + OXEN.cowsPerOx * oxenTrainingTarget(state);
}

// --- rok vozů --------------------------------------------------------------------------------

/** Nový rok vozů od dne `day`. */
function emptyDemand(day: number): CartDemand {
  return { from: day, 'two-wheel': [], 'four-wheel': [], plough: [] };
}

/** Rok vozů, který běží (mutuje stav – bez něj začne dnes). */
function runningDemand(state: VillageState, day: number): CartDemand {
  const draft: DraftState = (state.draft ??= {});
  return (draft.demand ??= emptyDemand(day));
}

/** Přičte úspory vozů (od největší) k řadě k-tých vozů. */
function addSavings(row: number[], savings: readonly number[], max: number): void {
  const sorted = savings.filter((s) => s > EPSILON).sort((a, b) => b - a);
  for (let k = 0; k < sorted.length && k < max; k++) row[k] = (row[k] ?? 0) + sorted[k]!;
}

/**
 * Den provozu vozů (wagons.md – Kolik vozů ves chce; mutuje stav): úspory jednotlivých dvoukoláků
 * dne (čd – co by vozy dnes ušetřily, kdyby jich bylo dost; `plough` – den orby) se přičtou do roku
 * vozů od největší. I den bez úspor rok vozů založí – ves s ohradou volů ví, že vozy nepotřebovala.
 */
export function addCartDemand(
  state: VillageState,
  day: number,
  savings: readonly number[],
  plough: boolean,
): void {
  const demand = runningDemand(state, day);
  const row = plough ? demand.plough : demand['two-wheel'];
  addSavings(row, savings, CART_DEMAND.maxCarts['two-wheel']);
}

/**
 * Výprava a čtyřkoláky (wagons.md – Kolik vozů ves chce; mutuje stav): kolik práce by ušetřil
 * k-tý čtyřkolák (`savings` – nosiči, které vůz nahradí, krát dny cesty) – do roku vozů. Jen ves
 * s rokem vozů (s ohradou volů).
 */
export function addExpeditionDemand(
  state: VillageState,
  day: number,
  savings: readonly number[],
): void {
  if (!oxPens(state).some((p) => p.builtDay !== null)) return;
  const demand = runningDemand(state, day);
  addSavings(demand['four-wheel'], savings, CART_DEMAND.maxCarts['four-wheel']);
}

/**
 * Konec roku vozů (1. 11. – wagons.md, Kolik vozů ves chce; mutuje stav): rok vozů dlouhý aspoň
 * CART_DEMAND.minDays se uzavře – úspory přepočtené na rok a cena vola `oxCost` – a začne nový;
 * kratší (ohrada volů postavená v létě, ves uložená dřív) běží do dalšího 1. 11. Bez roku vozů nic.
 */
export function closeCartYear(state: VillageState, day: number, oxCost: number): void {
  const demand = state.draft?.demand;
  if (!demand || day - demand.from < CART_DEMAND.minDays) return;
  const scale = DAYS_PER_YEAR / (day - demand.from);
  const per = (row: readonly number[]): number[] => row.map((v) => v * scale);
  state.draft = {
    ...state.draft,
    lastYear: {
      from: demand.from,
      'two-wheel': per(demand['two-wheel']),
      'four-wheel': per(demand['four-wheel']),
      plough: per(demand.plough),
      oxCost,
    },
    demand: emptyDemand(day),
  };
}
