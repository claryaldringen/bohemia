import type { ObstacleLayer } from '../landscape';
import { addCart } from './carts';
import { missingCart } from './draft';
import {
  NO_STOCKS,
  craftStocks,
  craftTargets,
  nextTree,
  occupiedWorkshops,
  workshopLabor,
  type WorkshopDay,
} from './crafts';
import { fellTrees } from './obstacles';
import { carpenterWorkFactor, woodworkLabor } from './productivity';
import { CARPENTRY } from './rules';
import type {
  Construction,
  ConstructionKind,
  CraftCoverage,
  Dwelling,
  VillageState,
  Workshop,
  WorkshopActivity,
} from './types';
import { availableTrees, isTreeStanding, wholeLogs, woodLogs } from './wood';

// Tesař (wagons.md – Tesař, Martin 19. 10. 2026): řemeslník v polozemnici s předsazenou střechou.
// Vyrábí podle potřeby vsi vozy (jeden dvoukolák na spřežení, s hotovou zemskou stezkou čtyřkolák
// – carts.ts) a dřevěné nářadí (zásoba v kg jako nástroje kováře – crafts.ts) a pomáhá stavbám:
// člověkoden tesaře vede CARPENTRY.crew člověkodny dřevěné práce vsi a dřevěná část práce staveb
// zlevní podle pokrytí tesařem (meze WOODWORK_LABOR). Klády bere z hromady, bez nich si skácí
// strom sám (jako hrnčíř); nástroje od kováře zrychlí všechnu jeho práci (CARPENTER_TOOLS_WORK).
// Kroky simulace mutují stav – volat na klonu; den po dni, na kouscích nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
/** Nejvýš tolik kroků výroby za den (kácení, vozy a nářadí se střídají). */
const MAX_STEPS = 64;

/**
 * Podíl dřevěné práce na ceně stavby (wagons.md – Tesař): obydlí, přestavby a dílny podle typu
 * obydlí, ohrada, rádlo, modla, svatyně, cesty a opravy podle druhu (CARPENTRY); pole, sad,
 * hřbitov a jabloně u cest 0.
 */
export function constructionWoodShare(c: Pick<Construction, 'kind' | 'dwellingType'>): number {
  if (c.kind === 'dwelling' || c.kind === 'rebuild') {
    return c.dwellingType ? CARPENTRY.dwellingWoodShare[c.dwellingType] : 0;
  }
  return (CARPENTRY.woodShare as Partial<Record<ConstructionKind, number>>)[c.kind] ?? 0;
}

/**
 * Násobek práce stavby podle pokrytí tesařem 0–1 (wagons.md – Tesař, Účinek): dřevěná část práce
 * od 1 k 0,6 (WOODWORK_LABOR), ostatní práce beze změny. Bez tesaře 1.
 */
export function constructionLaborFactor(
  c: Pick<Construction, 'kind' | 'dwellingType'>,
  carpentryCoverage: number,
): number {
  if (carpentryCoverage <= 0) return 1;
  const share = constructionWoodShare(c);
  if (share <= 0) return 1;
  return 1 - share + share * woodworkLabor(carpentryCoverage);
}

/** Rozestavěná stavba s dřevěnou prací – tesař má komu pomáhat. */
export function woodworkPending(state: Pick<VillageState, 'constructions'>): boolean {
  return state.constructions.some((c) => constructionWoodShare(c) > 0 && c.cost - c.done > EPSILON);
}

/** Co tesař vyrobí dál: rozdělaný vůz, chybějící vůz, nebo dřevěné nářadí do zásoby; jinak null. */
function nextProduct(
  state: VillageState,
  day: number,
  workshop: Workshop,
): 'cart' | 'tools' | null {
  if (workshop.cart || missingCart(state)) return 'cart';
  const target = craftTargets(state, day).woodToolsKg;
  return (craftStocks(state).woodToolsKg ?? 0) + EPSILON < target ? 'tools' : null;
}

/**
 * Má tesař z čeho vyrábět: klády v dílně nebo na hromadě, rozdělané kácení, nebo strom, který
 * jde skácet (bez vrstvy překážek – jen testy – dřeva neomezeně).
 */
function hasWood(
  state: VillageState,
  day: number,
  workshop: Workshop,
  obstacles: ObstacleLayer | null,
): boolean {
  if ((workshop.timber ?? 0) > EPSILON || workshop.felling) return true;
  if (wholeLogs(woodLogs(state)) >= 1) return true;
  return obstacles === null || availableTrees(obstacles, state, day) > 0;
}

/**
 * Tesaři, kteří dnes nemají co dělat, a jejich domácnost proto pracuje se vsí (wagons.md –
 * Tesař; crafts.md – Podle potřeby): vozů i nářadí je dost (`resting`), nebo chybí dřevo
 * (`no-wood`) – a žádná stavba nečeká na dřevěnou práci. Rozhoduje se na začátku dne.
 */
export function restingCarpenters(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null = null,
): Map<number, WorkshopActivity> {
  const resting = new Map<number, WorkshopActivity>();
  const carpenters = occupiedWorkshops(state, 'carpenter');
  if (carpenters.length === 0 || woodworkPending(state)) return resting;
  for (const d of carpenters) {
    const workshop = d.workshop!;
    const product = nextProduct(state, day, workshop);
    if (product === null) resting.set(d.id, 'resting');
    else if (!hasWood(state, day, workshop, obstacles)) resting.set(d.id, 'no-wood');
  }
  return resting;
}

/** Pomoc tesařů stavbám dne (wagons.md – Tesař). */
export interface CarpentryHelp {
  /** Práce tesařů na stavbách (čd) – jde do staveb se společnou prací vsi. */
  labor: number;
  /** Pokrytí dřevěné práce staveb tesaři 0–1 – posouvá meze WOODWORK_LABOR. */
  coverage: number;
  /** Kolik práce dal stavbám který tesař (id dílny). */
  byWorkshop: ReadonlyMap<number, number>;
}

export const NO_HELP: CarpentryHelp = { labor: 0, coverage: 0, byWorkshop: new Map() };

/**
 * Pomoc tesařů stavbám dne (wagons.md – Tesař, pomoc stavbám; návrh Clauda): stavby mají
 * přednost před výrobou – člověkoden tesaře vede CARPENTRY.crew člověkodnů dřevěné práce vsi
 * (bez nástrojů od kováře méně – CARPENTER_TOOLS_WORK), takže tesaři dají stavbám tolik, kolik
 * dřevěná práce dne potřebuje, nejvýš svou práci po denním minimu. Tesař, který nemá co
 * vyrábět, je na stavbě celý den. Jeho práce jde do staveb se společnou prací vsi. Pokrytí =
 * kolik vedení tesaři dali ÷ kolik ho dřevěná práce chtěla (nejvýš 1).
 * `woodwork(extra)` = dřevěná práce staveb dne (čd bez tesaře), když stavby dostanou společnou
 * práci vsi a navíc `extra` (rozdělení rovným dílem jako ve stavbách – simulate.ts).
 */
export function carpentryHelp(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity: number,
  resting: ReadonlyMap<number, WorkshopActivity>,
  woodwork: (extra: number) => number,
): CarpentryHelp {
  const working = occupiedWorkshops(state, 'carpenter').filter((d) => !resting.has(d.id));
  if (working.length === 0 || !woodworkPending(state)) return NO_HELP;
  const carpenters = working.map((d) => ({
    id: d.id,
    labor: workshopLabor(state, day, d.id, coverage.pottery, productivity).craft,
    idle: nextProduct(state, day, d.workshop!) === null,
  }));
  const total = carpenters.reduce((sum, c) => sum + c.labor, 0);
  if (total <= EPSILON) return NO_HELP;
  const needed = (woodwork(total) * carpenterWorkFactor(coverage.tools)) / CARPENTRY.crew;
  const byWorkshop = new Map<number, number>();
  let leading = 0;
  let given = 0;
  for (const c of carpenters) {
    const lead = Math.min(c.labor, Math.max(0, needed - leading));
    leading += lead;
    const give = c.idle ? c.labor : lead;
    if (give > EPSILON) byWorkshop.set(c.id, give);
    given += give;
  }
  return {
    labor: given,
    coverage: needed > EPSILON ? Math.min(1, leading / needed) : 0,
    byWorkshop,
  };
}

/**
 * Den tesařů (mutuje stav – krok práce po stavbách): každá obývaná dílna tesaře, která neodpočívá,
 * dá po pomoci stavbám (`help`) zbytek práce výrobě – nejdřív rozdělaný nebo chybějící vůz, pak
 * dřevěné nářadí do zásoby. Dřevo: klády v dílně, pak celé klády z hromady, jinak skácí nejbližší
 * strom (vyhrazený dílnou, pařez). Vrací, kam práce šla (rozdělení práce dne).
 */
export function workCarpenters(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  productivity: number,
  resting: ReadonlyMap<number, WorkshopActivity>,
  help: CarpentryHelp,
): WorkshopDay[] {
  const days: WorkshopDay[] = [];
  const occupied = new Set(occupiedWorkshops(state, 'carpenter').map((d) => d.id));
  const carpenters = state.dwellings
    .filter((d) => d.workshop?.craft === 'carpenter')
    .sort((a, b) => a.id - b.id);
  for (const dwelling of carpenters) {
    const workshop = dwelling.workshop!;
    workshop.woodworkCoverage = help.coverage;
    if (!occupied.has(dwelling.id)) {
      workshop.activity = 'empty';
      continue;
    }
    const free = resting.get(dwelling.id);
    if (free) {
      workshop.activity = free;
      continue;
    }
    const labor = workshopLabor(state, day, dwelling.id, coverage.pottery, productivity);
    const helped = Math.min(labor.craft, help.byWorkshop.get(dwelling.id) ?? 0);
    const output = workCarpenter(
      state,
      dwelling,
      Math.max(0, labor.craft - helped),
      day,
      obstacles,
      coverage.tools,
    );
    workshop.activity =
      output.making > EPSILON
        ? 'producing'
        : output.felling > EPSILON
          ? 'felling'
          : helped > EPSILON
            ? 'helping'
            : output.noWood
              ? 'no-wood'
              : 'idle';
    days.push({
      dwellingId: dwelling.id,
      craft: 'carpenter',
      domestic: labor.dailyMin,
      felling: output.felling,
      fellingTrees: output.fellingTrees,
      making: output.making,
      producedKg: output.producedKg,
    });
  }
  return days;
}

/** Výsledek dne jednoho tesaře. */
interface CarpenterOutput {
  felling: number;
  fellingTrees: number[];
  making: number;
  producedKg: number;
  noWood: boolean;
}

/**
 * Den jednoho tesaře (mutuje stav): práce `labor` po pomoci stavbám jde do vozu a nářadí; práce na
 * jednotku podle pokrytí nástroji (CARPENTER_TOOLS_WORK). Hotový vůz přibude do vozů vsi
 * (kronika `cart-made`).
 */
function workCarpenter(
  state: VillageState,
  dwelling: Dwelling,
  labor: number,
  day: number,
  obstacles: ObstacleLayer | null,
  toolCoverage: number,
): CarpenterOutput {
  const workshop = dwelling.workshop!;
  const factor = carpenterWorkFactor(toolCoverage);
  const stocks = (state.crafts ??= { ...NO_STOCKS });
  let left = labor;
  let felling = 0;
  let making = 0;
  let producedKg = 0;
  let noWood = false;
  const fellingTrees: number[] = [];

  /** Přidá do dílny kládu – z hromady, nebo kácením (vrátí false, když dnes kláda nepřibyla). */
  const getLog = (): boolean => {
    if (wholeLogs(woodLogs(state)) >= 1) {
      state.woodLogs = Math.max(0, woodLogs(state) - 1);
      workshop.timber = (workshop.timber ?? 0) + 1;
      return true;
    }
    workshop.felling ??= nextTree(state, dwelling, 'carpenter', day, obstacles);
    const tree = workshop.felling;
    if (!tree) {
      noWood = true;
      return false;
    }
    const work = Math.min(left, Math.max(0, tree.cost - tree.done));
    tree.done += work;
    left -= work;
    felling += work;
    if (tree.id !== null && !fellingTrees.includes(tree.id)) fellingTrees.push(tree.id);
    if (tree.done + EPSILON < tree.cost) return false;
    // skácený strom nechá pařez (jako u hrnčíře – crafts.ts)
    if (tree.id !== null && isTreeStanding(state, tree.id, day)) {
      state.felledTrees = fellTrees(state, [tree.id], day).felledTrees ?? [];
    }
    workshop.felling = null;
    workshop.timber = (workshop.timber ?? 0) + 1;
    return true;
  };

  for (let step = 0; step < MAX_STEPS && left > EPSILON; step++) {
    if (!workshop.cart) {
      const kind = missingCart(state);
      if (kind) {
        const logs = CARPENTRY.cartLogs[kind];
        if ((workshop.timber ?? 0) + EPSILON < logs) {
          if (!getLog() && (noWood || left <= EPSILON)) break;
          continue;
        }
        workshop.timber = Math.max(0, (workshop.timber ?? 0) - logs);
        workshop.cart = { kind, done: 0 };
      }
    }
    const cart = workshop.cart;
    if (cart) {
      const total = CARPENTRY.cartManDays[cart.kind];
      const progress = Math.min(left / factor, Math.max(0, total - cart.done));
      cart.done += progress;
      left -= progress * factor;
      making += progress * factor;
      if (cart.done + EPSILON >= total) {
        addCart(state, cart.kind, day);
        state.chronicle.push({ day, kind: 'cart-made', cart: cart.kind });
        workshop.cart = null;
      }
      continue;
    }
    const short = craftTargets(state, day).woodToolsKg - (stocks.woodToolsKg ?? 0);
    if (short <= EPSILON) break;
    if ((workshop.timber ?? 0) <= EPSILON) {
      if (!getLog() && (noWood || left <= EPSILON)) break;
      continue;
    }
    const perKg = CARPENTRY.woodToolsManDaysPerKg * factor;
    const kg = Math.min(short, left / perKg, (workshop.timber ?? 0) * CARPENTRY.woodToolsKgPerLog);
    stocks.woodToolsKg = (stocks.woodToolsKg ?? 0) + kg;
    workshop.timber = Math.max(0, (workshop.timber ?? 0) - kg / CARPENTRY.woodToolsKgPerLog);
    left -= kg * perKg;
    making += kg * perKg;
    producedKg += kg;
  }
  return { felling, fellingTrees, making, producedKg, noWood };
}
