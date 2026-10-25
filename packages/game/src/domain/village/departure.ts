import { TOTAL_GAME_DAYS } from '../calendar';
import type { Landscape } from '../landscape';
import { cloneState } from './clone';
import { isVillageExtinct } from './extinction';
import { removePeople } from './kinship';
import { villageManor } from './manor';
import { ageYears, occupants } from './people';
import { relocationBlock } from './relocation';
import { leavingCart, takeLeavingCart } from './carts';
import { CARTS, CHRONICLE_MAX_EVENTS, DWELLINGS, LEAVING, RUIN_YEARS } from './rules';
import { sheavesOutlook, takeSheaves } from './threshing';
import { DIRECTION_VECTORS } from './trail';
import type {
  Ancestor,
  Cart,
  CartKind,
  ChronicleEvent,
  Direction8,
  DwellingRuin,
  Emigrant,
  HerdSpecies,
  LivestockState,
  NeighborDirection,
  Ox,
  Person,
  VillageJourney,
  VillageState,
} from './types';

// Odchod do nové vsi (migration.md – Odchod do nové vsi; Martin: „hráč označí víc obydlí, vyvede
// jejich lidi a založí s nimi ves jinde na stejné mapě nebo na nové mapě“, detaily návrh Clauda):
// domácnosti vybraných obydlí odejdou celé – i s příbuzenskými vazbami –, vezmou si jídlo, které
// unesou, a poměrný díl stád. Domy zůstanou prázdné. Odejdou-li všichni, ves je opuštěná.

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
 * Osadníci nové vsi: lidé (s rodiči a manžely), rodokmen předků, kteří zůstali nebo zemřeli
 * (jen rodiče osadníků – na příbuzenství do bratranců stačí), dcery vdané pryč, jídlo a stáda.
 */
export interface Settlers {
  people: Person[];
  ancestors: Ancestor[];
  emigrants: Emigrant[];
  food: LeavingFood;
  herds: Record<HerdSpecies, number>;
  young: Record<HerdSpecies, number>;
  /**
   * Vůz s voly, který si vzali (migration.md – Vůz při odchodu); bez vozu chybí. V nové vsi je vůz
   * její a voli čekají bez ohrady (`VillageState.looseOxen`).
   */
  cart?: Cart;
  oxen?: Ox[];
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

/** Žije ve vsi někdo (pro konec hry) – nevymřela a není opuštěná; ves na cestě žije. */
export function isVillageLiving(state: Pick<VillageState, 'extinctDay' | 'abandonedDay'>): boolean {
  return !isVillageExtinct(state) && !isVillageAbandoned(state);
}

/** Došli už lidé na cestě do dne `day` na místo nové vsi? */
export function journeyArrived(state: Pick<VillageState, 'journey'>, day: number): boolean {
  return state.journey !== undefined && day >= state.journey.arrivalDay;
}

/** Proč domácnosti obydlí `dwellingIds` teď odejít nemůžou – česky pro hráče, nebo null. */
export function departureBlock(state: VillageState, dwellingIds: readonly number[]): string | null {
  if (isVillageDormant(state)) return 'Ve vsi nikdo nežije.';
  if (dwellingIds.length === 0) return 'Vyber obydlí, jejichž domácnosti odejdou.';
  if (new Set(dwellingIds).size !== dwellingIds.length) return 'Obydlí se opakuje.';
  for (const id of dwellingIds) {
    const block = relocationBlock(state, id);
    if (block === 'no-household') return 'V některém z obydlí nikdo nebydlí.';
    if (block === 'relocating') return 'Domácnost, která si staví nový dům, odejít nemůže.';
  }
  return null;
}

/**
 * Kolik jídla si lidé `leavers` vezmou (migration.md, návrh Clauda): unesou LEAVING.carryKgPerPerson
 * na člověka od LEAVING.carryFromAge let a s vozem (`cart` – migration.md, Vůz při odchodu) navíc
 * jeho náklad (CARTS.loadKg), nejvýš poměrný díl zásob vsi podle počtu lidí. Když neunesou celý
 * díl, berou z každé zásoby (obilí, maso, sýr, luštěniny, ovoce) stejný podíl. Snopy, které ves smí
 * vymlátit, jsou zásobou jako zrno (production-chains.md – Humno – výhled se ztrátami): svůj díl si
 * vymlátí a vezmou stejným podílem.
 */
export function leavingFood(
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  cart: CartKind | null = null,
): LeavingFood {
  return leavingShare(state, leavers, day, cart).food;
}

/** Jídlo, které lidé `leavers` vezmou, a jaký podíl každé zásoby to je (`leavingFood`). */
function leavingShare(
  state: VillageState,
  leavers: readonly Person[],
  day: number,
  cart: CartKind | null,
): { food: LeavingFood; fraction: number } {
  const share = state.people.length > 0 ? leavers.length / state.people.length : 0;
  const carriers = leavers.filter((p) => ageYears(p.bornDay, day) >= LEAVING.carryFromAge).length;
  const sheaves = sheavesOutlook(state, day);
  const shares: LeavingFood = {
    grainKg: (Math.max(0, state.storesKg) + sheaves.grainKg) * share,
    meatKg: Math.max(0, state.meatKg ?? 0) * share,
    cheeseKg: Math.max(0, state.cheeseKg ?? 0) * share,
    legumesKg: (Math.max(0, state.legumesKg ?? 0) + sheaves.legumesKg) * share,
    applesKg: Math.max(0, state.applesKg ?? 0) * share,
  };
  const total = Object.values(shares).reduce((sum, kg) => sum + kg, 0);
  const budget = carriers * LEAVING.carryKgPerPerson + (cart ? CARTS.loadKg[cart] : 0);
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
function validateDepartureDay(state: VillageState, day: number): void {
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
 * prázdné. Odejdou-li všichni, ves je opuštěná (`abandonedDay`, kronika `village-abandoned`).
 * Vrací novou starou ves (vstupní stav nemění) a osadníky. RangeError, když odejít nejde
 * (`departureBlock`) nebo je den neplatný.
 */
export function departVillage(
  state: VillageState,
  day: number,
  dwellingIds: readonly number[],
  direction?: Direction8,
): { state: VillageState; settlers: Settlers } {
  validateDepartureDay(state, day);
  const block = departureBlock(state, dwellingIds);
  if (block !== null) throw new RangeError(block);
  const households = new Set(dwellingIds);
  const leavers = state.people.filter((p) => households.has(p.dwellingId));
  const share = leavers.length / state.people.length;
  // volný vůz s voly (migration.md – Vůz při odchodu) – uveze víc jídla
  const cart = leavingCart(state, day, leavers.length === state.people.length);
  const { food, fraction } = leavingShare(state, leavers, day, cart?.cart.kind ?? null);
  const kin = settlerKin(state, leavers);
  const next = cloneState(state);
  if (cart) takeLeavingCart(next, cart);
  // z každé zásoby stejný podíl – i ze snopů, které ves smí vymlátit (production-chains.md – Humno)
  next.storesKg -= Math.max(0, state.storesKg) * fraction;
  if (next.meatKg !== undefined) next.meatKg -= food.meatKg;
  if (next.cheeseKg !== undefined) next.cheeseKg -= food.cheeseKg;
  if (next.legumesKg !== undefined) next.legumesKg -= Math.max(0, state.legumesKg ?? 0) * fraction;
  if (next.applesKg !== undefined) next.applesKg -= food.applesKg;
  const sheaves = sheavesOutlook(state, day);
  takeSheaves(next, sheaves.grainKg > 0 ? fraction : 0, sheaves.legumesKg > 0 ? fraction : 0);
  const herds = Object.fromEntries(HERDS.map((s) => [s, 0])) as Record<HerdSpecies, number>;
  const young = Object.fromEntries(HERDS.map((s) => [s, 0])) as Record<HerdSpecies, number>;
  if (next.livestock) {
    for (const species of HERDS) {
      herds[species] = next.livestock.herds[species] * share;
      young[species] = next.livestock.young[species] * share;
      next.livestock.herds[species] -= herds[species];
      next.livestock.young[species] -= young[species];
    }
  }
  const leaving = new Set(leavers.map((p) => p.id));
  const emigrated = new Map<number, NeighborDirection>();
  if (direction) for (const p of leavers) emigrated.set(p.id, direction);
  removePeople(next, leaving, emigrated);
  next.chronicle.push({
    day,
    kind: 'households-left',
    households: households.size,
    people: leavers.length,
    ...(direction ? { direction } : {}),
  });
  if (next.people.length === 0) {
    next.abandonedDay = day;
    next.chronicle.push({ day, kind: 'village-abandoned' });
  }
  const people = leavers.map((p) => {
    const copy = { ...p };
    // manžel zůstal ve staré vsi (vdaná do jiného domu) – v nové vsi je ovdovělý
    if (copy.spouseId !== undefined && !leaving.has(copy.spouseId)) delete copy.spouseId;
    return copy;
  });
  return {
    state: next,
    settlers: {
      people,
      ...kin,
      food,
      herds,
      young,
      ...(cart ? { cart: { ...cart.cart }, oxen: cart.oxen } : {}),
    },
  };
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
 * Ves lidí na cestě na novou mapu (migration.md – fáze 4): ještě nestojí – lidé, jídlo a stáda,
 * žádná obydlí ani stavby. Nesimuluje se; po příjezdu (`journey.arrivalDay`) hráč umístí první
 * zemnici a ves se založí z osadníků (`settlersOf` → `foundVillage`). Den odchodu už proběhl
 * (`lastDay = day`).
 */
export function travellingVillage(
  settlers: Settlers,
  seed: number,
  day: number,
  journey: VillageJourney,
): VillageState {
  const householdId = settlersMaxId(settlers) + 1;
  const { food } = settlers;
  return {
    seed,
    foundedDay: day,
    lastDay: day,
    nextId: householdId + 1,
    people: settlers.people.map((p) => ({ ...p, dwellingId: householdId })),
    // ves bez rodu jako nová ves z osadníků (`foundVillage`) – převod rodu ji nemá sledovat
    dynasty: { lordId: null, lords: [] },
    dwellings: [],
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: food.grainKg,
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
    ...(food.cheeseKg > 0 ? { cheeseKg: food.cheeseKg } : {}),
    ...(food.legumesKg > 0 ? { legumesKg: food.legumesKg } : {}),
    ...(food.applesKg > 0 ? { applesKg: food.applesKg } : {}),
    livestock: { herds: { ...settlers.herds }, young: { ...settlers.young } },
    ...(settlers.cart ? { carts: [{ ...settlers.cart }] } : {}),
    ...(settlers.oxen && settlers.oxen.length > 0
      ? { looseOxen: settlers.oxen.map((ox) => ({ ...ox })) }
      : {}),
    ...(settlers.ancestors.length > 0 ? { ancestors: settlers.ancestors } : {}),
    ...(settlers.emigrants.length > 0 ? { emigrants: settlers.emigrants } : {}),
    journey: { ...journey },
  };
}

/** Osadníci ze vsi na cestě – lidé, rodokmen, jídlo a stáda, se kterými ves založí. */
export function settlersOf(state: VillageState): Settlers {
  return {
    people: state.people.map((p) => ({ ...p })),
    ancestors: (state.ancestors ?? []).map((a) => ({ ...a })),
    emigrants: (state.emigrants ?? []).map((e) => ({ ...e })),
    food: {
      grainKg: Math.max(0, state.storesKg),
      meatKg: Math.max(0, state.meatKg ?? 0),
      cheeseKg: Math.max(0, state.cheeseKg ?? 0),
      legumesKg: Math.max(0, state.legumesKg ?? 0),
      applesKg: Math.max(0, state.applesKg ?? 0),
    },
    herds: { ...(state.livestock?.herds ?? { sheep: 0, goat: 0, pig: 0, cow: 0 }) },
    young: { ...(state.livestock?.young ?? { sheep: 0, goat: 0, pig: 0, cow: 0 }) },
    ...(state.carts?.[0] ? { cart: { ...state.carts[0] } } : {}),
    ...(state.looseOxen && state.looseOxen.length > 0
      ? { oxen: state.looseOxen.map((ox) => ({ ...ox })) }
      : {}),
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
  const { looseOxen, ...kept } = state;
  void looseOxen;
  return {
    ...kept,
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

/** Lidé ve vsi (obydlí `dwellingId`) – kolik jich odejde s domácností. */
export function householdSize(state: VillageState, dwellingId: number): number {
  return occupants(state, dwellingId).length;
}
