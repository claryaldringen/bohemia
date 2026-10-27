import { CART_KINDS, cartLoadRatio, villageCarts } from './carts';
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
import type {
  CartDemand,
  CartDemandDay,
  CartKind,
  CartYear,
  DraftState,
  VillageState,
} from './types';

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
 * Páry k rádlům (oxen.md – Kolik volů ves chce): `need` = kolik párů by letos stačilo zorat celý
 * osev. Když orba na plán setí nestačí (`need` nad páry, které ves má), ves páry **zvýší hned**
 * (Martin 27. 10. 2026 k doplňování párů a rádel: „Nejen že smí, ale dokonce by měla“) – volné
 * páry osadí rádly a další vycvičí. Sníží je s hysterezí (návrh Clauda 20. 10. 2026): jen když
 * potřeba leží dva plány po sobě níž – na větší z obou potřeb; jeden slabší rok tak nezastaví
 * náhradu páru, který ves potřebuje (výcvik trvá 2 roky, pár slouží 10). Bez předchozího plánu se
 * loňská potřeba bere jako dnešní páry (pár na ohradu volů). Pod pojistkou zásob počítá `need`
 * i nutné díly mimo postup (`startSeason`).
 */
export function nextPloughPairs(
  state: Pick<VillageState, 'pens' | 'draft'>,
  need: number,
): { ploughPairs: number; ploughNeed: number } {
  const current = wantedPloughPairs(state);
  const previous = state.draft?.ploughNeed ?? current;
  const high = Math.max(need, previous);
  // dolů jen na větší z obou potřeb (dva plány po sobě níž), nahoru hned na dnešní potřebu
  const held = Math.min(high, current);
  return { ploughPairs: Math.max(held, need), ploughNeed: need };
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

/** Úspora vozů za rok podle počtu vozů a volů ve dny orby (`CartYear`). */
type YearTable = Pick<CartYear, 'base' | 'plough'>;

/**
 * Vozy, které se vyplatí (wagons.md – Kolik vozů ves chce): ze všech počtů dvoukoláků (do 12),
 * čtyřkoláků (do 4) a volů, kteří se vejdou do `places` míst, ten, kde loňská úspora (`year` –
 * `base` mimo dny orby i s výpravami, `plough` ve dny orby podle volů, kteří neorají) mínus cena
 * vozů (`cartYearCost`) a volů navíc nad páry k rádlům (`year.oxCost`) vyjde nejvýš; při shodě
 * méně vozů a volů. Voli táhnou vozy naráz (dvoukolák jeden, čtyřkolák dva); ve dny orby jezdí jen
 * s voly, kteří neorají – na ně ves může držet voly navíc. Páry k rádlům nejvýš, kolik se jich
 * vejde.
 */
export function chooseCarts(
  year: CartYear | (CartDemand & { oxCost: number }),
  wantedPairs: number,
  places: number,
): DraftChoice {
  const table = yearTable(year);
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
      const saved = table.base[two]?.[four] ?? 0;
      const row = table.plough[two]?.[four] ?? [];
      const cartCost = two * cartYearCost('two-wheel') + four * cartYearCost('four-wheel');
      // voli: aspoň na vozy a páry, nejvýš tolik, aby ve dny orby jezdily všechny vozy
      for (let oxen = fromOxen; oxen <= Math.min(places, ploughOxen + oxenOfCarts); oxen++) {
        const free = Math.min(oxen - ploughOxen, row.length - 1);
        const ploughDay = free >= 0 ? (row[free] ?? 0) : 0;
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
 * Krávy na voly (diet.md – Krávy na obměnu volů; cíl krav podle volů – Martin 20. 10. 2026: „Dejme
 * možnost 1.“, podrobnosti návrh Clauda): ves s ohradou volů drží OXEN.minCows krav (pár telat do
 * výcviku a chovná kráva) a na obměnu volů OXEN.cowsPerOx krávy na každého vola, kterého chce na
 * rádla i vozy (`oxenTrainingTarget` – páry k rádlům s hysterezí a voli vozů v místech ohrad volů):
 * voli jsou býčci (≈ 0,2 na kus stáda skotu a rok), vůl slouží 10 let – obměna desetiny volů ročně.
 * Ke kravám na mléko se přičítají (`breedingCows`). Bez ohrady volů 0.
 */
export function oxenCows(state: Pick<VillageState, 'pens' | 'draft' | 'carts'>): number {
  if (oxPens(state).length === 0) return 0;
  return OXEN.minCows + OXEN.cowsPerOx * oxenTrainingTarget(state);
}

// --- rok vozů --------------------------------------------------------------------------------

/** Nový rok vozů od dne `day`. */
function emptyDemand(day: number): CartDemand {
  return { from: day, days: [], 'four-wheel': [] };
}

/** Rok vozů, který běží (mutuje stav – bez něj začne dnes). */
function runningDemand(state: VillageState, day: number): CartDemand {
  // nový rok vozů už počítá čtyřkolák po louce a strništi (`withFourWheelReach`)
  const draft: DraftState = (state.draft ??= { fourWheelOffRoad: true });
  return (draft.demand ??= emptyDemand(day));
}

/** Přičte úspory vozů (od největší) k řadě k-tých vozů. */
function addSavings(row: number[], savings: readonly number[], max: number): void {
  const sorted = savings.filter((s) => s > EPSILON).sort((a, b) => b - a);
  for (let k = 0; k < sorted.length && k < max; k++) row[k] = (row[k] ?? 0) + sorted[k]!;
}

/** Na setiny. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Co by dnes vozy ušetřily (`addCartDemand`): nošení, kam dojede i čtyřkolák, a jinam a jízdy dvoukoláku. */
export interface CartDemandToday {
  /** Nošení (čd), kam dojede i čtyřkolák. */
  road: number;
  /** Nošení (čd), kam dojede jen dvoukolák. */
  other: number;
  /** Úspory jízd dvoukoláku pro uhlí, rudu, hlínu a vodu (čd na vůz). */
  jobs: number[];
}

/**
 * Den provozu vozů (wagons.md – Kolik vozů ves chce; mutuje stav): dnešní nošení tam, kam vůz
 * dojede, a jízdy dvoukoláku (`today`; `plough` – den orby) se zapíšou do roku vozů. I den bez
 * práce rok vozů založí – ves s ohradou volů ví, že vozy nepotřebovala.
 */
export function addCartDemand(
  state: VillageState,
  day: number,
  today: CartDemandToday,
  plough: boolean,
): void {
  const demand = runningDemand(state, day);
  const jobs = today.jobs.filter((j) => j > EPSILON).map(cents);
  if (today.road <= EPSILON && today.other <= EPSILON && jobs.length === 0) return;
  const rec: CartDemandDay = {
    ...(today.road > EPSILON ? { r: cents(today.road) } : {}),
    ...(today.other > EPSILON ? { o: cents(today.other) } : {}),
    ...(jobs.length > 0 ? { j: jobs } : {}),
    ...(plough ? { p: 1 as const } : {}),
  };
  (demand.days ??= []).push(rec);
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
 * Úspora vozů za den (čd): čtyřkoláky (`four`) napřed na nošení, kam dojedou (za den odvezou
 * dvakrát víc se stejnou posádkou), dvoukoláky (`two`) na zbytek nošení po plných nákladech
 * a na jízdy pro uhlí, rudu, hlínu a vodu – od největší úspory (jako skutečné vozy – `fleetHaulPlan`).
 */
export function cartDayValue(rec: CartDemandDay, two: number, four: number): number {
  const cap2 = CARTS.carrierManDays;
  const cap4 = cap2 * cartLoadRatio('four-wheel');
  let road = rec.r ?? 0;
  let value = 0;
  for (let k = 0; k < four && road > EPSILON; k++) {
    const take = Math.min(cap4, road);
    value += take * (1 - CARTS.crew / cap4);
    road -= take;
  }
  if (two <= 0) return value;
  const rest = road + (rec.o ?? 0);
  const full = Math.floor(rest / cap2 + EPSILON);
  const part = rest - full * cap2;
  const units = [...(rec.j ?? [])];
  for (let k = 0; k < Math.min(full, two); k++) units.push(cap2 * (1 - CARTS.crew / cap2));
  if (part > EPSILON && full < two) units.push(part * (1 - CARTS.crew / cap2));
  units.sort((a, b) => b - a);
  for (let k = 0; k < two && k < units.length; k++) value += units[k]!;
  return value;
}

/** Prázdná tabulka úspor (dvoukoláky × čtyřkoláky, ve dny orby i × voli). */
function emptyTable(): YearTable {
  const n2 = CART_DEMAND.maxCarts['two-wheel'];
  const n4 = CART_DEMAND.maxCarts['four-wheel'];
  const base: number[][] = [];
  const plough: number[][][] = [];
  for (let two = 0; two <= n2; two++) {
    base.push(new Array<number>(n4 + 1).fill(0));
    plough.push(
      Array.from({ length: n4 + 1 }, (_, four) => new Array<number>(two + 2 * four + 1).fill(0)),
    );
  }
  return { base, plough };
}

/**
 * Tabulka úspor roku vozů (`CartYear` bez ceny vola): dny roku (mimo dny orby přímo, ve dny orby
 * podle volů, kteří neorají – čtyřkoláky a dvoukoláky z nich nejlíp), výpravy čtyřkoláků a rok
 * uložený před dny (úspory k-tých dvoukoláků), vše × `scale`.
 */
function demandTable(demand: CartDemand, scale: number): YearTable {
  const table = emptyTable();
  const n2 = CART_DEMAND.maxCarts['two-wheel'];
  const n4 = CART_DEMAND.maxCarts['four-wheel'];
  // úspora dnů podle vozů, které jedou: mimo dny orby a ve dny orby zvlášť (sečtené přes dny)
  const base = emptyTable().base;
  const plough = emptyTable().base;
  for (const rec of demand.days ?? []) {
    const into = rec.p ? plough : base;
    for (let two = 0; two <= n2; two++) {
      for (let four = 0; four <= n4; four++) into[two]![four]! += cartDayValue(rec, two, four);
    }
  }
  for (let two = 0; two <= n2; two++) {
    for (let four = 0; four <= n4; four++) {
      table.base[two]![four] = cents(
        (base[two]![four]! +
          firstSum(demand['four-wheel'], four) +
          firstSum(demand['two-wheel'], two)) *
          scale,
      );
      // ve dny orby jedou vozy jen s voly, kteří neorají – čtyřkoláky a dvoukoláky z nich nejlíp
      const row = table.plough[two]![four]!;
      for (let free = 0; free < row.length; free++) {
        let best = 0;
        for (let f4 = 0; f4 <= Math.min(four, Math.floor(free / DRAFT_OXEN['four-wheel'])); f4++) {
          const f2 = Math.min(two, free - f4 * DRAFT_OXEN['four-wheel']);
          best = Math.max(best, plough[f2]![f4]!);
        }
        row[free] = cents((best + firstSum(demand.plough, Math.min(two, free))) * scale);
      }
    }
  }
  return table;
}

/** Součet prvních `n` úspor (bez řady 0). */
function firstSum(values: readonly number[] | undefined, n: number): number {
  let sum = 0;
  for (let k = 0; k < n && k < (values?.length ?? 0); k++) sum += values![k]!;
  return sum;
}

/** Tabulka úspor uzavřeného roku – i roku uloženého před tabulkou (úspory k-tých vozů). */
function yearTable(year: CartYear | (CartDemand & { oxCost: number })): YearTable {
  if ('base' in year) return year;
  return demandTable(year, 1);
}

/**
 * Konec roku vozů (1. 11. – wagons.md, Kolik vozů ves chce; mutuje stav): rok vozů dlouhý aspoň
 * CART_DEMAND.minDays se uzavře do tabulky úspor (`CartYear` – přepočtené na rok, na setiny) s cenou vola
 * `oxCost` a začne nový; kratší (ohrada volů postavená v létě, ves uložená dřív) běží do dalšího
 * 1. 11. Bez roku vozů nic.
 */
export function closeCartYear(state: VillageState, day: number, oxCost: number): void {
  const demand = state.draft?.demand;
  if (!demand || day - demand.from < CART_DEMAND.minDays) return;
  const scale = DAYS_PER_YEAR / (day - demand.from);
  state.draft = {
    ...state.draft,
    lastYear: { from: demand.from, oxCost, ...demandTable(demand, scale) },
    demand: emptyDemand(day),
  };
}
