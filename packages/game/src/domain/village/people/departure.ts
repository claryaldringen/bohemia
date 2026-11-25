import { TOTAL_GAME_DAYS } from '../../calendar';
import { newSteward } from '../steward/steward-state';
import type { Landscape } from '../../landscape';
import { cloneState } from '../core/clone';
import { takeVillageMeatKg, villageSlaughterMeatKg } from '../core/meat-stocks';
import { currentLord } from './dynasty';
import { villageHorses } from '../livestock/horses';
import { isVillageExtinct } from '../core/extinction';
import {
  addCarriedStocks,
  carriedStocksOf,
  ownedHorses,
  ownedOxen,
  takeAllCarts,
  takeAllHorses,
  takeAllOxen,
  takeCarriedStocks,
  type CarriedStocks,
} from './belongings';
import { removePeople } from './kinship';
import { villageManor } from './manor';
import { dwellingGatePoint } from '../paths/network-grid';
import { ageGroup, ageYears, hidesInForest, onExpedition } from './people';
import { relocationBlock } from './relocation';
import { leavingCart, takeLeavingCart } from '../crafts/carts';
import {
  CARTS,
  CHRONICLE_MAX_EVENTS,
  DWELLINGS,
  FOOD_NEED_KG_PER_YEAR,
  LEAVING,
  RUIN_YEARS,
  START_SEED_YEARS,
} from '../rules';
import { drawGrainPits } from '../fields/grain-pits';
import { reservedSeedKg } from '../fields/seed';
import { sheavesOutlook, takeSheaves } from '../fields/threshing';
import { DIRECTION_VECTORS } from '../trade/trail';
import type {
  Ancestor,
  Cart,
  CartKind,
  ChronicleEvent,
  Direction8,
  DwellingRuin,
  Emigrant,
  HerdSpecies,
  Horse,
  LivestockState,
  NeighborDirection,
  Ox,
  Person,
  VillageFaith,
  VillageJourney,
  VillageState,
} from '../types';

// Odchod do nové vsi (migration.md – Odchod do nové vsi; Martin: „hráč označí víc obydlí, vyvede
// jejich lidi a založí s nimi ves jinde na stejné mapě nebo na nové mapě“, detaily návrh Clauda):
// domácnosti vybraných obydlí odejdou celé – i s příbuzenskými vazbami –, vezmou si jídlo, které
// unesou, a poměrný díl stád. Domy zůstanou prázdné. Odejdou-li všichni, berou si úplně vše (Martin
// 25. 11. 2026 – belongings.ts) a ves je opuštěná.

const DAYS_PER_YEAR = 365.25;
const HERDS: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

/** Jídlo, které si odcházející nesou (kg). */
export interface LeavingFood {
  grainKg: number;
  meatKg: number;
  cheeseKg: number;
  legumesKg: number;
  applesKg: number;
}

/**
 * Co nese celá ves navíc k lidem, jídlu, osivu, stádům a volům (migration.md – Co si vezmou: „berou
 * si úplně vše“) – jen odešli-li všichni.
 */
export interface WholeVillageLoad {
  /** Zásoby a vybavení (`CARRIED_STOCKS` v belongings.ts). */
  stocks: CarriedStocks;
  /** Všechny vozy vsi. */
  carts: Cart[];
  /** Všichni koně vsi (první kůň vůdce) – v nové vsi čekají bez ohrady. */
  horses: Horse[];
  /** Z masa (`food.meatKg`) zásoba z porážky 1. 11. (`VillageState.slaughterMeatKg`). */
  slaughterMeatKg: number;
  /** Lhůta osiva zakladatelů v rezervě (`VillageState.reservedSeedUntilDay`); chybí = bez ochrany. */
  seedUntilDay?: number;
}

/**
 * Osadníci nové vsi: lidé (s rodiči a manžely), rodokmen předků, kteří zůstali nebo zemřeli
 * (jen rodiče osadníků – na příbuzenství do bratranců stačí), dcery vdané pryč, jídlo a stáda; celá
 * ves i všechno ostatní (`whole`).
 */
export interface Settlers {
  people: Person[];
  ancestors: Ancestor[];
  emigrants: Emigrant[];
  food: LeavingFood;
  /**
   * Osivo na první osev (kg obilí navíc k `food.grainKg` – fields.md, Osivo pro ves bez zásob):
   * nová ves ho má jen na setí (`VillageState.reservedSeedKg`). Chybí = žádné.
   */
  seedKg?: number;
  herds: Record<HerdSpecies, number>;
  young: Record<HerdSpecies, number>;
  /**
   * Vůz s voly, který si vzali (migration.md – Vůz při odchodu); bez vozu chybí. V nové vsi je vůz
   * její a voli čekají bez ohrady (`VillageState.looseOxen`). Celá ves: všichni voli, vozy ve `whole`.
   */
  cart?: Cart;
  oxen?: Ox[];
  /** Odešla celá ves – co nese navíc; chybí = odešla jen část lidí. */
  whole?: WholeVillageLoad;
  /**
   * Vůdce odchodu (lord.md – Dělení vsi): syn vojvody s poměrnou částí vsi, nebo vojvoda, který
   * odchází s domácnostmi – v nové vsi je vojvodou. Chybí = nejstarší muž rodu mezi osadníky.
   */
  lordId?: number;
  /**
   * Ves založí syn vojvody (`departWithSon`) – řídí ji správce od založení (steward.md – Stav
   * správce). Odchod vojvody s obydlími či celé vsi je stěhování sídla hráče: příznak chybí.
   */
  stewarded?: true;
  /**
   * Jezdecký kůň vůdce (lord.md – Dělení vsi, Kůň syna) – v nové vsi čeká bez ohrady
   * (`VillageState.looseHorses`). Bez koně chybí; u celé vsi je mezi koňmi ve `whole`.
   */
  horse?: Horse;
  /**
   * Den křtu rodu hráče (christianity.md – Křest rodu; `VillageFaith.rodBaptizedDay`): nová ves
   * rodu založená po křtu ho zdědí (plán 2026-11-10 – Review Focus 1). Chybí – rod nepokřtěný.
   */
  rodBaptizedDay?: number;
}

/**
 * Odejdou všichni (migration.md – Co si vezmou)? Jediné místo, kde se to rozhoduje: odchází-li
 * `leaving` z `villagers` lidí vsi, je ves opuštěná (`abandonedDay`) a osadníci si berou úplně vše.
 */
export function everyoneLeaves(leaving: number, villagers: number): boolean {
  return villagers > 0 && leaving >= villagers;
}

/** Ves je opuštěná – odešli všichni (dál se nesimuluje). */
export function isVillageAbandoned(state: Pick<VillageState, 'abandonedDay'>): boolean {
  return state.abandonedDay !== undefined;
}

/** Lidé jsou na cestě na novou mapu – ves ještě nestojí (nesimuluje se). */
export function isVillageTravelling(state: Pick<VillageState, 'journey'>): boolean {
  return state.journey !== undefined;
}

/**
 * Ves spí: vymřelá nebo opuštěná. Nemění se (jen den by se posouval), takže se kvůli dni
 * neukládá; shoduje se se sloupcem `asleep` v DB. Ves na cestě nespí – čeká na správce.
 */
export function isVillageAsleep(state: Pick<VillageState, 'extinctDay' | 'abandonedDay'>): boolean {
  return isVillageExtinct(state) || isVillageAbandoned(state);
}

/**
 * Ves se nesimuluje: vymřelá, opuštěná, nebo na cestě. `advanceVillage` u ní jen posune den.
 */
export function isVillageDormant(
  state: Pick<VillageState, 'extinctDay' | 'abandonedDay' | 'journey'>,
): boolean {
  return isVillageExtinct(state) || isVillageAbandoned(state) || isVillageTravelling(state);
}

/**
 * Ves zanikne, protože rod vymřel (lord.md – Konec rodu; Martin: „ves zanikne“): od dne `day`
 * je opuštěná (kronika „Ves opuštěna – rod vymřel“), dál se nedopočítává (`isVillageDormant`)
 * a lidé v ní zůstanou jen jako záznam – pohled je nezobrazí (`abandonedVillageAt`). Vymřelá,
 * opuštěná i putující ves zůstane beze změny (týž objekt). Vstup nemění.
 */
export function abandonForLineEnd(state: VillageState, day: number): VillageState {
  if (isVillageDormant(state)) return state;
  const event: ChronicleEvent = { day, kind: 'village-abandoned', reason: 'line-ended' };
  return {
    ...state,
    abandonedDay: day,
    chronicle: [...state.chronicle, event].slice(-CHRONICLE_MAX_EVENTS),
  };
}

/** Došli už lidé na cestě do dne `day` na místo nové vsi? */
export function journeyArrived(state: Pick<VillageState, 'journey'>, day: number): boolean {
  return state.journey !== undefined && day >= state.journey.arrivalDay;
}

/** Celá ves neodejde, dokud je výprava na trhu (expeditions.md – Kdo je na výpravě, ze vsi neodejde). */
export const MARKET_AWAY = 'Výprava se ještě nevrátila z trhu.';

/**
 * Proč celá ves odejít nemůže, nebo null: výprava na trh je pryč s lidmi a zbožím, které by
 * v nové vsi chybělo (návrh Clauda; Martin 25. 11. 2026: „berou si úplně vše“).
 */
export function wholeVillageBlock(state: Pick<VillageState, 'trade'>): string | null {
  return state.trade?.expeditions.some((e) => e.kind === 'market') ? MARKET_AWAY : null;
}

/**
 * Proč domácnosti obydlí `dwellingIds` v den `day` odejít nemůžou – česky pro hráče, nebo null. Kdo
 * je na výpravě (`onExpedition`), odejít nemůže – ani jeho domácnost (expeditions.md – Odchod ze vsi).
 */
export function departureBlock(
  state: VillageState,
  dwellingIds: readonly number[],
  day: number,
): string | null {
  if (isVillageDormant(state)) return 'Ve vsi nikdo nežije.';
  if (dwellingIds.length === 0) return 'Vyber obydlí, jejichž domácnosti odejdou.';
  if (new Set(dwellingIds).size !== dwellingIds.length) return 'Obydlí se opakuje.';
  for (const id of dwellingIds) {
    const block = relocationBlock(state, id);
    if (block === 'no-household') return 'V některém z obydlí nikdo nebydlí.';
    if (block === 'relocating') return 'Domácnost, která si staví nový dům, odejít nemůže.';
  }
  const households = new Set(dwellingIds);
  if (state.people.some((p) => households.has(p.dwellingId) && onExpedition(p, day))) {
    return 'Někdo z domácnosti je na výpravě.';
  }
  const leaving = state.people.filter((p) => households.has(p.dwellingId)).length;
  if (everyoneLeaves(leaving, state.people.length)) return wholeVillageBlock(state);
  return null;
}

/**
 * Kolik jídla si lidé `leavers` vezmou (migration.md, návrh Clauda): unesou LEAVING.carryKgPerPerson
 * na člověka od LEAVING.carryFromAge let a s vozem (`cart` – migration.md, Vůz při odchodu) navíc
 * jeho náklad (CARTS.loadKg), nejvýš poměrný díl zásob vsi podle počtu lidí. Když neunesou celý
 * díl, berou z každé zásoby (obilí, maso, sýr, luštěniny, ovoce) stejný podíl. Snopy, které ves smí
 * vymlátit, jsou zásobou jako zrno (production-chains.md – Humno – výhled se ztrátami): svůj díl si
 * vymlátí a vezmou stejným podílem. Osivo (`leavingSeedKg`) mají napřed – obilí na jídlo je díl
 * bez osiva a osivo na voze ubere místo jídlu. Odchází-li celá ves, bere všechno (`wholeStores`).
 */
export function leavingFood(
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  cart: CartKind | null = null,
): LeavingFood {
  return leavingStores(state, leavers, day, cart).food;
}

/**
 * Osivo, které si lidé `leavers` ponesou (kg obilí – fields.md, Osivo pro ves bez zásob; návrh
 * Clauda): na první osev půl roční potřeby odcházejících (START_SEED_YEARS, jako nová ves), jen
 * z dílu zásob obilí vsi podle počtu lidí, který jim patří – mateřská ves tak nepřijde o víc než
 * o poměrný díl zásob; nemá-li zrno, nesou méně, nebo nic. Osivo mají napřed: LEAVING.seedKgPerCarrier
 * na nosiče navíc k jídlu, zbytek na voze místo jídla (vůz uveze víc). Celá ves bere i rezervu
 * osiva (`wholeStores`).
 */
export function leavingSeedKg(
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  cart: CartKind | null = null,
): number {
  return leavingStores(state, leavers, day, cart).seedKg;
}

/** Jídlo a osivo odcházejících – celé vsi všechno (`wholeStores`), části lidí díl (`leavingShare`). */
function leavingStores(
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  cart: CartKind | null,
): { food: LeavingFood; seedKg: number } {
  return everyoneLeaves(leavers.length, state.people.length)
    ? wholeStores(state, day)
    : leavingShare(state, leavers, day, cart);
}

/** Roční potřeba lidí (kg obilí). */
function yearlyNeedKg(people: readonly Person[], day: number): number {
  return people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/** Nosiči – lidé od LEAVING.carryFromAge let. */
function carrierCount(people: readonly Person[], day: number): number {
  return people.filter((p) => ageYears(p.bornDay, day) >= LEAVING.carryFromAge).length;
}

/** Jídlo, které má přednost před osivem nad osivo pěšky (kg) – na LEAVING.cartSeedFoodDays dní. */
function foodBeforeSeedKg(needKg: number): number {
  return (needKg * LEAVING.cartSeedFoodDays) / DAYS_PER_YEAR;
}

/**
 * Jídlo a osivo celé vsi (migration.md – Co si vezmou): úplně všechno, bez meze nosnosti – i jídlo
 * ukryté v lese (`refuge.hidden`); snopy jdou nevymlácené s ostatními zásobami (`CARRIED_STOCKS`).
 * Osivem (nová ves ho nesní) je rezerva osiva vsi a k ní osivo na první osev jako u části lidí
 * (návrh Clauda) – nejvýš do půl roční potřeby: pěšky LEAVING.seedKgPerCarrier na nosiče, víc jen
 * z toho, co zbude po jídle na LEAVING.cartSeedFoodDays dní (i se zrnem ve snopech).
 */
function wholeStores(state: VillageState, day: number): { food: LeavingFood; seedKg: number } {
  const reserveKg = reservedSeedKg(state);
  const grainKg =
    Math.max(0, state.storesKg) - reserveKg + Math.max(0, state.refuge?.hidden?.foodKg ?? 0);
  const food: LeavingFood = {
    grainKg,
    meatKg: Math.max(0, state.meatKg ?? 0),
    cheeseKg: Math.max(0, state.cheeseKg ?? 0),
    legumesKg: Math.max(0, state.legumesKg ?? 0),
    applesKg: Math.max(0, state.applesKg ?? 0),
  };
  const sheaves = sheavesOutlook(state, day);
  const totalKg =
    Object.values(food).reduce((sum, kg) => sum + kg, 0) + sheaves.grainKg + sheaves.legumesKg;
  const needKg = yearlyNeedKg(state.people, day);
  const seedKg = Math.max(
    0,
    Math.min(
      needKg * START_SEED_YEARS - reserveKg,
      grainKg,
      carrierCount(state.people, day) * LEAVING.seedKgPerCarrier +
        Math.max(0, totalKg - foodBeforeSeedKg(needKg)),
    ),
  );
  return { food: { ...food, grainKg: grainKg - seedKg }, seedKg: reserveKg + seedKg };
}

/** Náhled odchodu celé vsi (popisek tlačítek odchodu – migration.md, Co si vezmou). */
export interface WholeVillagePreview {
  /** Všechno jídlo a osivo (kg; bez nevymlácených snopů). */
  foodKg: number;
  /** Všechna zvířata (kusy) – stáda, voli a koně, i bez ohrady. */
  animals: number;
  /** Všechny vozy. */
  carts: number;
}

/** Co si celá ves vezme, kdyby v den `day` odešli všichni – stejně jako `departVillage`. */
export function wholeVillagePreview(state: VillageState, day: number): WholeVillagePreview {
  const { food, seedKg } = wholeStores(state, day);
  const hidden = state.refuge?.hidden?.herd;
  const heads = (s: HerdSpecies): number =>
    Math.round((state.livestock?.herds[s] ?? 0) + (hidden?.[s] ?? 0));
  return {
    foodKg: Object.values(food).reduce((sum, kg) => sum + kg, seedKg),
    animals: HERDS.reduce((sum, s) => sum + heads(s), ownedOxen(state) + ownedHorses(state)),
    carts: state.carts?.length ?? 0,
  };
}

/** Jídlo a osivo, které lidé `leavers` vezmou, a jaký podíl každé zásoby to je (`leavingFood`). */
function leavingShare(
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  cart: CartKind | null,
): { food: LeavingFood; fraction: number; seedKg: number; seedStoresKg: number } {
  const share = state.people.length > 0 ? leavers.length / state.people.length : 0;
  const carriers = carrierCount(leavers, day);
  const sheaves = sheavesOutlook(state, day);
  const cartKg = cart ? CARTS.loadKg[cart] : 0;
  // osivo napřed ze dílu zásob obilí, který jim patří (osivo, které má mateřská ves jen na setí,
  // mezi ně nepatří) – na nosiče navíc k jídlu, zbytek na voze místo jídla
  const need = yearlyNeedKg(leavers, day);
  // zásoby bez rezervy osiva mateřské vsi – ta zůstává jí (poměrný díl se počítá z ostatních)
  const ownStoresKg = Math.max(0, state.storesKg) - reservedSeedKg(state);
  const grainShare = Math.max(0, ownStoresKg) * share;
  const footSeedKg = carriers * LEAVING.seedKgPerCarrier;
  const shares: LeavingFood = {
    grainKg: (Math.max(0, ownStoresKg) + sheaves.grainKg) * share,
    meatKg: Math.max(0, state.meatKg ?? 0) * share,
    cheeseKg: Math.max(0, state.cheeseKg ?? 0) * share,
    legumesKg: (Math.max(0, state.legumesKg ?? 0) + sheaves.legumesKg) * share,
    applesKg: Math.max(0, state.applesKg ?? 0) * share,
  };
  const rawTotal = Object.values(shares).reduce((sum, kg) => sum + kg, 0);
  // jídlo má přednost: osivo na vůz (nad osivo pěšky) jen z místa, které zbude po jídle na
  // LEAVING.cartSeedFoodDays dní (migration.md)
  const capacityKg = carriers * LEAVING.carryKgPerPerson + cartKg;
  const foodKeptKg = Math.min(rawTotal, foodBeforeSeedKg(need));
  const cartSeedKg = Math.max(0, capacityKg - foodKeptKg);
  const seedKg = Math.max(
    0,
    Math.min(need * START_SEED_YEARS, grainShare, footSeedKg + cartSeedKg),
  );
  shares.grainKg -= seedKg;
  const total = rawTotal - seedKg;
  const budget = capacityKg - Math.max(0, seedKg - footSeedKg);
  const scale = total > budget && total > 0 ? budget / total : 1;
  return {
    food: {
      grainKg: shares.grainKg * scale,
      meatKg: shares.meatKg * scale,
      cheeseKg: shares.cheeseKg * scale,
      legumesKg: shares.legumesKg * scale,
      applesKg: shares.applesKg * scale,
    },
    fraction: share * scale,
    seedKg,
    // zásoby a snopy ubudou podílem `fraction`; osivo z něj – z jídla – vzala jen část `scale`
    seedStoresKg: seedKg * (1 - scale),
  };
}

/** Je `e` rodič, dítě nebo sourozenec člověka `p` (podle id rodičů)? */
function closeRelative(
  p: { id: number; motherId?: number; fatherId?: number },
  e: { id: number; motherId?: number; fatherId?: number },
): boolean {
  const sibling =
    (p.motherId !== undefined && p.motherId === e.motherId) ||
    (p.fatherId !== undefined && p.fatherId === e.fatherId);
  return (
    e.id === p.motherId ||
    e.id === p.fatherId ||
    e.motherId === p.id ||
    e.fatherId === p.id ||
    sibling
  );
}

/**
 * Rodokmen osadníků: rodiče, kteří neodcházejí (žijí ve staré vsi, nebo jsou mezi předky), jako
 * předci s vlastními rodiči – tak jdou poznat prarodiče, strýcové i bratranci. Dcery vdané pryč,
 * které jsou osadníkům rodičem, dítětem nebo sourozencem.
 */
function settlerKin(
  state: VillageState,
  leavers: readonly Person[],
): Pick<Settlers, 'ancestors' | 'emigrants'> {
  const leaving = new Set(leavers.map((p) => p.id));
  const known = new Map<number, Ancestor>();
  for (const a of state.ancestors ?? []) known.set(a.id, a);
  for (const p of state.people) known.set(p.id, p);
  const ancestors = new Map<number, Ancestor>();
  for (const p of leavers) {
    for (const parentId of [p.motherId, p.fatherId]) {
      if (parentId === undefined || leaving.has(parentId)) continue;
      const parent = known.get(parentId);
      ancestors.set(parentId, {
        id: parentId,
        ...(parent?.motherId === undefined ? {} : { motherId: parent.motherId }),
        ...(parent?.fatherId === undefined ? {} : { fatherId: parent.fatherId }),
      });
    }
  }
  const emigrants = (state.emigrants ?? []).filter((e) => leavers.some((p) => closeRelative(p, e)));
  return {
    ancestors: [...ancestors.values()].sort((a, b) => a.id - b.id),
    emigrants: emigrants.map((e) => ({ ...e })),
  };
}

/** Den akce: celé číslo ve světě, ne do minulosti vsi; jinak RangeError. */
export function validateDepartureDay(state: VillageState, day: number): void {
  if (!Number.isInteger(day) || day < 0 || day >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${day} neleží ve světě.`);
  }
  if (day < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, akce v den ${day} nejde.`);
  }
}

/**
 * Domácnosti obydlí `dwellingIds` odejdou založit novou ves (migration.md – Odchod do nové vsi):
 * všichni jejich lidé opustí ves (příbuzní, kteří zůstali, je mají v rodokmenu; na novou mapu
 * `direction` zůstanou i jako odešlí ve směru – war.md), vezmou si jídlo (`leavingFood`)
 * a poměrný díl stád (ovce, kozy, prasata, krávy – voli a ohrady zůstávají). Jejich domy zůstanou
 * prázdné. Odejdou-li všichni (`everyoneLeaves`), vezmou si úplně vše a ves je opuštěná
 * (`abandonedDay`, kronika `village-abandoned`).
 * Odchází-li vojvoda, osadníci ho nesou jako vůdce (`Settlers.lordId`) – v nové vsi zůstává
 * vojvodou. Vrací novou starou ves (vstupní stav nemění) a osadníky. RangeError, když odejít nejde
 * (`departureBlock`) nebo je den neplatný.
 */
export function departVillage(
  state: VillageState,
  day: number,
  dwellingIds: readonly number[],
  direction?: Direction8,
): { state: VillageState; settlers: Settlers } {
  validateDepartureDay(state, day);
  const block = departureBlock(state, dwellingIds, day);
  if (block !== null) throw new RangeError(block);
  const households = new Set(dwellingIds);
  const leavers = state.people.filter((p) => households.has(p.dwellingId));
  // odchází-li vojvoda, vede odchod a v nové vsi zůstává vojvodou (lord.md – Dělení vsi, Kdo může
  // vést odchod: celá ves s vojvodou)
  const lord = currentLord(state);
  const lordLeaves = lord !== null && lord !== undefined && households.has(lord.dwellingId);
  const lordHorse = lordLeaves
    ? villageHorses(state).find((h) => h.riderId === lord.id)
    : undefined;
  return departLeavers(state, day, leavers, {
    event: {
      day,
      kind: 'households-left',
      households: households.size,
      people: leavers.length,
      ...(direction ? { direction } : {}),
    },
    ...(direction ? { direction } : {}),
    ...(lordLeaves ? { lordId: lord.id } : {}),
    ...(lordHorse ? { horseId: lordHorse.id } : {}),
  });
}

/** Co osadníci nesou – jídlo, osivo, zvířata a vozy; celá ves i zásoby a vybavení (`whole`). */
type SettlersLoad = Pick<
  Settlers,
  'food' | 'seedKg' | 'herds' | 'young' | 'cart' | 'oxen' | 'horse' | 'whole'
>;

/** Podíl `share` každého stáda a letošních mláďat odejde (mutuje stav). */
function takeHerds(state: VillageState, share: number): Pick<Settlers, 'herds' | 'young'> {
  const herds = Object.fromEntries(HERDS.map((s) => [s, 0])) as Record<HerdSpecies, number>;
  const young = Object.fromEntries(HERDS.map((s) => [s, 0])) as Record<HerdSpecies, number>;
  if (state.livestock) {
    for (const species of HERDS) {
      herds[species] = state.livestock.herds[species] * share;
      young[species] = state.livestock.young[species] * share;
      state.livestock.herds[species] -= herds[species];
      state.livestock.young[species] -= young[species];
    }
  }
  return { herds, young };
}

/**
 * Část lidí si vezme svůj díl (mutuje `next`, kopii stavu `state`): jídlo a osivo, které unese,
 * poměrný díl stád, volný vůz s voly (migration.md – Vůz při odchodu) a koně vůdce `horseId`.
 */
function takeShare(
  next: VillageState,
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  horseId: number | undefined,
): SettlersLoad {
  // volný vůz s voly (migration.md – Vůz při odchodu) – uveze víc jídla
  const cart = leavingCart(state, day);
  const { food, fraction, seedKg, seedStoresKg } = leavingShare(
    state,
    leavers,
    day,
    cart?.cart.kind ?? null,
  );
  if (cart) takeLeavingCart(next, cart);
  // z každé zásoby stejný podíl – i ze snopů, které ves smí vymlátit (production-chains.md – Humno)
  // poměrný díl ze zásob bez rezervy osiva mateřské vsi (ta zůstává jí)
  const ownStoresKg = Math.max(0, Math.max(0, state.storesKg) - reservedSeedKg(state));
  next.storesKg -= ownStoresKg * fraction + seedStoresKg;
  // i zásobě z porážky 1. 11. poměrně (součet uzeného zůstává přesný)
  takeVillageMeatKg(next, food.meatKg);
  if (next.cheeseKg !== undefined) next.cheeseKg -= food.cheeseKg;
  if (next.legumesKg !== undefined) next.legumesKg -= Math.max(0, state.legumesKg ?? 0) * fraction;
  if (next.applesKg !== undefined) next.applesKg -= food.applesKg;
  const sheaves = sheavesOutlook(state, day);
  takeSheaves(next, sheaves.grainKg > 0 ? fraction : 0, sheaves.legumesKg > 0 ? fraction : 0);
  const horse = horseId === undefined ? undefined : takeHorse(next, horseId);
  return {
    food,
    ...(seedKg > 0 ? { seedKg } : {}),
    ...takeHerds(next, leavers.length / state.people.length),
    ...(cart ? { cart: { ...cart.cart }, oxen: cart.oxen } : {}),
    ...(horse ? { horse } : {}),
  };
}

/**
 * Odcházejí všichni – berou si úplně vše (mutuje stav; migration.md – Co si vezmou, Martin
 * 25. 11. 2026): všechno jídlo a osivo (`wholeStores`), stáda, voly, koně, vozy, zásoby a vybavení
 * (belongings.ts). Ve staré vsi nezbude žádná zásoba – obilné jámy jsou prázdné –, jen co nejde
 * odnést: stavby, pole, hromady klád a kamene, surovina u dílen a v milířích (návrh Clauda).
 */
function takeEverything(
  state: VillageState,
  day: number,
  leaderHorseId: number | undefined,
): SettlersLoad {
  const { food, seedKg } = wholeStores(state, day);
  const slaughterMeatKg = villageSlaughterMeatKg(state);
  const seedUntilDay = state.reservedSeedUntilDay;
  const { herds, young } = takeHerds(state, 1);
  // co ves na útěku ukryla v lese (war.md – Varování, poslové a útěk do hradiště)
  const hidden = state.refuge?.hidden;
  if (state.refuge && hidden) {
    for (const species of HERDS) herds[species] += hidden.herd[species];
    delete state.refuge.hidden;
  }
  const oxen = takeAllOxen(state, day);
  const whole: WholeVillageLoad = {
    stocks: takeCarriedStocks(state),
    carts: takeAllCarts(state),
    horses: takeAllHorses(state, day, leaderHorseId),
    slaughterMeatKg,
    ...(seedUntilDay === undefined ? {} : { seedUntilDay }),
  };
  state.storesKg = 0;
  delete state.reservedSeedKg;
  delete state.reservedSeedUntilDay;
  delete state.sowingSeed;
  drawGrainPits(state);
  takeVillageMeatKg(state, food.meatKg);
  if (state.cheeseKg !== undefined) state.cheeseKg = 0;
  if (state.legumesKg !== undefined) state.legumesKg = 0;
  if (state.applesKg !== undefined) state.applesKg = 0;
  // kusy, které čekaly na zimní porážku, odešly se stádem
  if (state.livestock) delete state.livestock.culling;
  return {
    food,
    ...(seedKg > 0 ? { seedKg } : {}),
    herds,
    young,
    ...(oxen.length > 0 ? { oxen } : {}),
    whole,
  };
}

/**
 * Lidé `leavers` odejdou ze vsi (jádro `departVillage` a odchodu syna – `departWithSon`): jídlo,
 * osivo, poměrný díl stád podle počtu lidí a volný vůz s voly (migration.md), s vůdcem `lordId`
 * i jeho koněm `horseId` z ohrady koní (lord.md – Dělení vsi). Kronika `event`; odejdou-li všichni
 * (`everyoneLeaves`), berou si úplně vše (`takeEverything`) a ves je opuštěná. Den a lidi ověří
 * volající. Vstupní stav nemění.
 */
export function departLeavers(
  state: VillageState,
  day: number,
  leavers: readonly Person[],
  options: {
    event: ChronicleEvent;
    direction?: Direction8;
    lordId?: number;
    horseId?: number;
    stewarded?: true;
  },
): { state: VillageState; settlers: Settlers } {
  const { direction } = options;
  const all = everyoneLeaves(leavers.length, state.people.length);
  const kin = settlerKin(state, leavers);
  const next = cloneState(state);
  const load = all
    ? takeEverything(next, day, options.horseId)
    : takeShare(next, state, leavers, day, options.horseId);
  const leaving = new Set(leavers.map((p) => p.id));
  const emigrated = new Map<number, NeighborDirection>();
  if (direction) for (const p of leavers) emigrated.set(p.id, direction);
  removePeople(next, leaving, emigrated);
  next.chronicle.push(options.event);
  if (all) {
    next.abandonedDay = day;
    next.chronicle.push({ day, kind: 'village-abandoned' });
  }
  const people = leavers.map((p) => {
    const copy = { ...p };
    // manžel zůstal ve staré vsi (vdaná do jiného domu) – v nové vsi je ovdovělý
    if (copy.spouseId !== undefined && !leaving.has(copy.spouseId)) delete copy.spouseId;
    // ukrytí v lese jdou s ostatními – návrat `refuge-back` by chodil do staré vsi (návrh Clauda)
    if (all && hidesInForest(copy)) delete copy.away;
    return copy;
  });
  return {
    state: next,
    settlers: {
      people,
      ...kin,
      ...load,
      ...(options.lordId !== undefined && leaving.has(options.lordId)
        ? { lordId: options.lordId }
        : {}),
      ...(options.stewarded ? { stewarded: true as const } : {}),
      ...settlersFaith(state),
    },
  };
}

/** Den křtu rodu hráče, který si osadníci nesou do nové vsi (`Settlers.rodBaptizedDay`). */
function settlersFaith(state: Pick<VillageState, 'faith'>): { rodBaptizedDay?: number } {
  const day = state.faith?.rodBaptizedDay;
  return day === undefined ? {} : { rodBaptizedDay: day };
}

/** Víra nové vsi z osadníků – jen den křtu rodu (zničená posvátná místa patří staré vsi). */
export function faithOfSettlers(settlers: Pick<Settlers, 'rodBaptizedDay'>): {
  faith?: VillageFaith;
} {
  const day = settlers.rodBaptizedDay;
  return day === undefined ? {} : { faith: { rodBaptizedDay: day } };
}

/** Odebere koně `horseId` z ohrady koní (mutuje stav) a vrátí ho; bez něj undefined. */
function takeHorse(state: VillageState, horseId: number): Horse | undefined {
  for (const pen of state.pens ?? []) {
    const horse = pen.horses?.find((h) => h.id === horseId);
    if (!horse || !pen.horses) continue;
    pen.horses = pen.horses.filter((h) => h.id !== horseId);
    return { ...horse };
  }
  return undefined;
}

/** Vozy osadníků – celé vsi všechny, jinak vůz s voly (migration.md – Vůz při odchodu). */
export function settlersCarts(settlers: Pick<Settlers, 'cart' | 'whole'>): readonly Cart[] {
  return settlers.whole?.carts ?? (settlers.cart ? [settlers.cart] : []);
}

/** Koně osadníků – celé vsi všichni, jinak kůň vůdce (lord.md – Dělení vsi, Kůň syna). */
export function settlersHorses(settlers: Pick<Settlers, 'horse' | 'whole'>): readonly Horse[] {
  return settlers.whole?.horses ?? (settlers.horse ? [settlers.horse] : []);
}

/** Nejvyšší id mezi osadníky, předky a odešlými (nová ves čísluje dál). */
export function settlersMaxId(
  settlers: Pick<Settlers, 'people' | 'ancestors' | 'emigrants'>,
): number {
  return Math.max(
    0,
    ...settlers.people.map((p) => p.id),
    ...settlers.ancestors.map((a) => a.id),
    ...settlers.emigrants.map((e) => e.id),
  );
}

/**
 * Ves lidí na cestě na novou mapu (migration.md – fáze 4): ještě nestojí – lidé, jídlo a stáda
 * (celá ves i všechno ostatní – `Settlers.whole`), žádná obydlí ani stavby. Nesimuluje se; po příjezdu (`journey.arrivalDay`) hráč umístí první
 * zemnici a ves se založí z osadníků (`settlersOf` → `foundVillage`). Den odchodu už proběhl
 * (`lastDay = day`).
 */
export function travellingVillage(
  settlers: Settlers,
  seed: number,
  day: number,
  journey: VillageJourney,
  /**
   * Správce vsi na cestě: ze schránky správce zapnutý (ves se po příjezdu založí sama), u odchodu
   * spuštěného hráčem vypnutý (čeká na hráče; steward.md – Odchod syna – upřesnění). Po založení
   * řídí ves správce podle `settlers.stewarded`.
   */
  stewardOnTheWay: boolean = settlers.stewarded === true,
): VillageState {
  const householdId = settlersMaxId(settlers) + 1;
  const { food, whole } = settlers;
  const carts = settlersCarts(settlers);
  // koně (kůň vůdce, celé vsi všichni) čekají bez ohrady i na cestě – nová id za domácností
  // (lord.md – Dělení vsi)
  const horses = settlersHorses(settlers).map((h, k) => ({ ...h, id: householdId + 1 + k }));
  const state: VillageState = {
    seed,
    foundedDay: day,
    lastDay: day,
    nextId: householdId + 1 + horses.length,
    people: settlers.people.map((p) => ({ ...p, dwellingId: householdId })),
    // ves bez rodu jako nová ves z osadníků (`foundVillage`) – převod rodu ji nemá sledovat
    dynasty: { lordId: null, lords: [] },
    // ves s vůdcem odchodu (syn vojvody) řídí správce od založení (steward.md – Stav správce)
    steward: newSteward(day, stewardOnTheWay),
    dwellings: [],
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    // osivo osadníků ves na cestě nesní (fields.md – Osivo pro ves bez zásob)
    storesKg: food.grainKg + (settlers.seedKg ?? 0),
    ...(settlers.seedKg ? { reservedSeedKg: settlers.seedKg } : {}),
    ...(whole?.seedUntilDay === undefined ? {} : { reservedSeedUntilDay: whole.seedUntilDay }),
    hungry: false,
    commonLaborHistory: [],
    chronicle: [
      {
        day,
        kind: 'journey-started',
        direction: journey.direction,
        arrivalDay: journey.arrivalDay,
      },
    ],
    meatKg: food.meatKg,
    ...(whole ? { slaughterMeatKg: whole.slaughterMeatKg } : {}),
    ...(food.cheeseKg > 0 ? { cheeseKg: food.cheeseKg } : {}),
    ...(food.legumesKg > 0 ? { legumesKg: food.legumesKg } : {}),
    ...(food.applesKg > 0 ? { applesKg: food.applesKg } : {}),
    livestock: { herds: { ...settlers.herds }, young: { ...settlers.young } },
    ...(carts.length > 0 ? { carts: carts.map((c) => ({ ...c })) } : {}),
    ...(settlers.oxen && settlers.oxen.length > 0
      ? { looseOxen: settlers.oxen.map((ox) => ({ ...ox })) }
      : {}),
    ...(settlers.ancestors.length > 0 ? { ancestors: settlers.ancestors } : {}),
    ...(settlers.emigrants.length > 0 ? { emigrants: settlers.emigrants } : {}),
    ...(horses.length > 0 ? { looseHorses: horses } : {}),
    ...faithOfSettlers(settlers),
    // vůdce odchodu ves na cestě drží až do založení (`settlersOf`)
    journey: {
      ...journey,
      ...(settlers.lordId === undefined ? {} : { lordId: settlers.lordId }),
      ...(settlers.stewarded ? { stewarded: true as const } : {}),
      ...(whole ? { whole: true as const } : {}),
    },
  };
  if (whole) addCarriedStocks(state, whole.stocks);
  return state;
}

/** Co celá ves na cestě nese navíc (`journey.whole`) – kopie. */
function wholeLoadOf(state: VillageState): WholeVillageLoad {
  const seedUntilDay = state.reservedSeedUntilDay;
  return {
    stocks: carriedStocksOf(state),
    carts: (state.carts ?? []).map((c) => ({ ...c })),
    horses: (state.looseHorses ?? []).map((h) => ({ ...h })),
    slaughterMeatKg: villageSlaughterMeatKg(state),
    ...(seedUntilDay === undefined ? {} : { seedUntilDay }),
  };
}

/**
 * Osadníci ze vsi na cestě – lidé, rodokmen, jídlo a stáda, se kterými ves založí; i vůdce odchodu
 * (`journey.lordId`) a jeho kůň bez ohrady. Celá ves (`journey.whole`) i všechno ostatní; ves na
 * cestě z doby, kdy celá ves nebrala vše, příznak nemá a zůstane, jak je.
 */
export function settlersOf(state: VillageState): Settlers {
  return {
    people: state.people.map((p) => ({ ...p })),
    ancestors: (state.ancestors ?? []).map((a) => ({ ...a })),
    emigrants: (state.emigrants ?? []).map((e) => ({ ...e })),
    food: {
      grainKg: Math.max(0, state.storesKg) - reservedSeedKg(state),
      meatKg: Math.max(0, state.meatKg ?? 0),
      cheeseKg: Math.max(0, state.cheeseKg ?? 0),
      legumesKg: Math.max(0, state.legumesKg ?? 0),
      applesKg: Math.max(0, state.applesKg ?? 0),
    },
    ...(reservedSeedKg(state) > 0 ? { seedKg: reservedSeedKg(state) } : {}),
    herds: { ...(state.livestock?.herds ?? { sheep: 0, goat: 0, pig: 0, cow: 0 }) },
    young: { ...(state.livestock?.young ?? { sheep: 0, goat: 0, pig: 0, cow: 0 }) },
    ...(state.journey?.whole
      ? { whole: wholeLoadOf(state) }
      : {
          ...(state.carts?.[0] ? { cart: { ...state.carts[0] } } : {}),
          ...(state.looseHorses?.[0] ? { horse: { ...state.looseHorses[0] } } : {}),
        }),
    ...(state.looseOxen && state.looseOxen.length > 0
      ? { oxen: state.looseOxen.map((ox) => ({ ...ox })) }
      : {}),
    ...(state.journey?.lordId === undefined ? {} : { lordId: state.journey.lordId }),
    // zdrojem pravdy je přepínač vsi na cestě (`steward.on`); `journey.stewarded` je jen počáteční
    ...((state.steward ? state.steward.on : state.journey?.stewarded === true)
      ? { stewarded: true as const }
      : {}),
    ...settlersFaith(state),
  };
}

/** Odkud ves vychází na cestu: dvorec, jinak první obydlí či staveniště; bez nich střed mapy. */
export function villageCentre(state: VillageState): { x: number; z: number } {
  const manor = villageManor(state);
  const position =
    manor?.position ??
    state.dwellings[0]?.position ??
    state.constructions.find((c) => c.position !== null)?.position ??
    null;
  return position ? { x: position.x, z: position.z } : { x: 0, z: 0 };
}

/**
 * Odkud ves vychází na cestu po mřížce pochodu (tažení, výprava, útěk, posel) a kam se vrací:
 * branka pozemku dvorce (`dwellingGatePoint` – kde z něj vychází síť pěšin; bez pozemku před
 * vchodem domu). Střed dvorce leží v buňce stavby a únik z ní by vedl kudykoli (plán
 * 2026-11-16-dense-forest – oprava Úlohy 5: tažení z kotvy vsi a výprava od branky se neshodly,
 * kudy ze vsi ven). Bez hotového dvorce `villageCentre`.
 */
export function villageGate(state: VillageState, landscape: Landscape): { x: number; z: number } {
  const manor = villageManor(state);
  if (!manor) return villageCentre(state);
  const gate = dwellingGatePoint(landscape, {
    type: manor.type,
    position: manor.position,
    ...(manor.plot ? { plot: manor.plot } : {}),
    ...(manor.plainShape ? { plainShape: true } : {}),
    ...(manor.workshop ? { craft: manor.workshop.craft } : {}),
  });
  return { x: gate.x, z: gate.z };
}

/** Vzdálenost od bodu ke kraji krajiny ve směru `direction` (m). */
export function edgeDistanceM(
  landscape: Landscape,
  from: { x: number; z: number },
  direction: Direction8,
): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const v = DIRECTION_VECTORS[direction];
  const along = (p: number, d: number): number =>
    d > 0 ? (half - p) / d : d < 0 ? (-half - p) / d : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(along(from.x, v.x), along(from.z, v.z)));
}

/**
 * Dny cesty na novou mapu (migration.md, návrh Clauda): 1–3 dny podle vzdálenosti ke kraji mapy
 * (každých LEAVING.travelDays.perDayM metrů den navíc), po hotové zemské stezce 1 den.
 */
export function travelDays(edgeM: number, trailBuilt: boolean): number {
  const { min, max, perDayM } = LEAVING.travelDays;
  if (trailBuilt) return min;
  return Math.min(max, Math.max(min, Math.ceil(edgeM / perDayM)));
}

const RUIN_DAYS = RUIN_YEARS * DAYS_PER_YEAR;

/**
 * Opuštěná ves v den `day` jen pro pohled (migration.md – opuštěná ves se nesimuluje): nikdo
 * v ní nežije, obydlí chátrají ode dne odchodu pevným podílem prázdného obydlí
 * (`emptyLifespanYears`), na nule se zřítí a zůstane zbytek jámy, který RUIN_YEARS zarůstá; pole leží ladem od dne odchodu
 * a rozestavěné stavby zmizí. Žijící ves vrací beze změny (týž objekt).
 */
export function abandonedVillageAt(state: VillageState, day: number): VillageState {
  const since = state.abandonedDay;
  if (since === undefined) return state;
  const elapsed = Math.max(0, day - since);
  const dwellings: VillageState['dwellings'] = [];
  const ruins: DwellingRuin[] = (state.ruins ?? []).filter((r) => day - r.day <= RUIN_DAYS);
  for (const d of state.dwellings) {
    const perDay = 1 / (DWELLINGS[d.type].emptyLifespanYears * DAYS_PER_YEAR);
    const condition = d.condition - elapsed * perDay;
    if (condition > 0) {
      dwellings.push({ ...d, condition });
      continue;
    }
    const fellDay = since + Math.ceil(Math.max(0, d.condition) / perDay);
    if (day - fellDay > RUIN_DAYS) continue;
    ruins.push({
      id: d.id,
      type: d.type,
      position: { ...d.position },
      ...(d.plot ? { plot: d.plot } : {}),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      day: fellDay,
    });
  }
  const parts = state.parts.map((p) => {
    if (p.state === 'fallow') return p;
    const { crop, ...rest } = p;
    void crop; // ladem už nic neroste
    return { ...rest, state: 'fallow' as const, fallowSinceDay: since };
  });
  // nikdo v ní nežije – ani lidé, kteří zůstali jako záznam po konci rodu (`abandonForLineEnd`),
  // ani jejich dobytek (lord.md – Konec rodu: scéna bez lidí, dýmu a zvířat)
  const { looseOxen, looseHorses, ...kept } = state;
  void looseOxen;
  void looseHorses;
  return {
    ...kept,
    // pohled je jen projekce na den – spící ves se kvůli dni neukládá, její lastDay zaostává
    lastDay: Math.max(state.lastDay, day),
    people: [],
    ...(state.livestock ? { livestock: withoutAnimals(state.livestock) } : {}),
    dwellings,
    ruins,
    parts,
    constructions: [],
  };
}

/** Stáda opuštěné vsi – bez kusů. */
function withoutAnimals(livestock: LivestockState): LivestockState {
  const none = Object.fromEntries(HERDS.map((s) => [s, 0])) as Record<HerdSpecies, number>;
  return { ...livestock, herds: { ...none }, young: { ...none } };
}
