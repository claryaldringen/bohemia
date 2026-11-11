import { obstacleIndex, type Landscape, type ObstacleLayer } from '../../landscape';
import {
  ableTeams,
  isTrained,
  oxenHome,
  oxenToEdit,
  oxPens,
  ploughPairsHome,
} from '../livestock/oxen';
import { oxenOf } from '../livestock/pens';
import { axisCartCheck, type CartTarget } from '../paths/cart';
import { villageCartEstimates } from '../paths/cart-estimate';
import { addRoadCartTrips } from '../paths/roads';
import { CARTS, DRAFT_OXEN } from '../rules';
import { villageOrchards } from '../buildings/orchard';
import { squareCenter } from '../placement/square-grid';
import { fieldGridOf } from '../placement/squares';
import type {
  Cart,
  CartKind,
  CartReach,
  CartTripLog,
  ChronicleEvent,
  ConstructionWood,
  CropWork,
  FieldPart,
  HayMowing,
  Ox,
  Trail,
  VillageState,
} from '../types';
import { trailTerrain } from '../paths/terrain';
import { woodFellingCost } from '../forest/wood';

// Vozy (wagons.md – Vůz): zásoba vsi, kterou vyrábí tesař (carpentry.ts). Vůz stojí u ohrady
// volů, dvoukolák táhne jeden vůl, čtyřkolák dva (oxen.md – Potah; ve dny orby jdou páry napřed
// k rádlům, s výpravou jsou voli pryč) a jde s ním honák a nakladač. Vozí snopy z pole, seno z luk a klády ke stavbám – kus práce nošení převezme
// tam, kam dojede (`CartAccess`); obchodní výprava vezme vůz místo nosičů (trade.ts).
// Dosah vozu dává vozová síť (fáze 2 – `villageCartRoutes`: sklon ve směru jízdy, serpentiny,
// brody, les jen po pevné cestě; bez krajiny všude). Dosah úlohy se spočítá jednou – při prvním
// svozu – a uloží u ní (`CartReach`), takže výsledek nezávisí na kouscích dopočtu. Jízdy svozu jdou
// do ročního provozu cest – z nich vznikají vyjeté cesty (`addRoadCartTrips`).

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
const DAYS_PER_YEAR = 365;

/** Druhy vozů v pořadí výroby a výběru (dvoukolák napřed). */
export const CART_KINDS: readonly CartKind[] = ['two-wheel', 'four-wheel'];

/** Názvy vozů pro hráče (1. pád). */
export const CART_NAMES: Readonly<Record<CartKind, string>> = {
  'two-wheel': 'Dvoukolák',
  'four-wheel': 'Čtyřkolák',
};

/** Vozy vsi (vsi bez vozů prázdné). */
export function villageCarts(state: Pick<VillageState, 'carts'>): Cart[] {
  return state.carts ?? [];
}

/** Stav vozu 0–1 – kolik mu zbývá ze služby (CARTS.lifespanYears). */
export function cartCondition(cart: Pick<Cart, 'builtDay'>, day: number): number {
  const age = (day - cart.builtDay) / (CARTS.lifespanYears * DAYS_PER_YEAR);
  return Math.min(1, Math.max(0, 1 - age));
}

/** Přidá hotový vůz (mutuje stav); id = největší + 1. */
export function addCart(state: VillageState, kind: CartKind, day: number): Cart {
  const carts = (state.carts ??= []);
  const id = carts.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  const cart = { id, kind, builtDay: day };
  carts.push(cart);
  return cart;
}

/**
 * Vozy, které jsou s výpravou na cestě (id) – i vůz, který veze platbu za kování k vozu (wagons.md
 * – Kování vozů; `ironTrip.cartId` u dílny tesaře – bez obydlí ve vstupu jen výpravy).
 */
export function cartsAway(
  state: Pick<VillageState, 'trade'> & { dwellings?: VillageState['dwellings'] },
): Set<number> {
  const away = new Set<number>();
  for (const e of state.trade?.expeditions ?? []) for (const id of e.carts ?? []) away.add(id);
  for (const d of state.dwellings ?? []) {
    const id = d.workshop?.ironTrip?.cartId;
    if (id !== undefined) away.add(id);
  }
  return away;
}

/**
 * Vozy, které dosloužily (mutuje stav – krok dne): vůz starší než CARTS.lifespanYears zmizí,
 * kronika `cart-worn-out`. Vůz na výpravě doslouží až po návratu.
 */
export function retireCarts(state: VillageState, day: number): ChronicleEvent[] {
  const carts = state.carts;
  if (!carts || carts.length === 0) return [];
  const away = cartsAway(state);
  const events: ChronicleEvent[] = [];
  state.carts = carts.filter((cart) => {
    if (away.has(cart.id) || cartCondition(cart, day) > 0) return true;
    events.push({ day, kind: 'cart-worn-out', cart: cart.kind });
    return false;
  });
  return events;
}

/** Kolik volů vůz táhne (oxen.md – Potah: dvoukolák 1, čtyřkolák 2). */
export function cartOxen(kind: CartKind): number {
  return DRAFT_OXEN[kind];
}

/**
 * Podíl párů s rádlem, které jsou doma (orba – oxen.md; voli u vozů výprav neorají); bez párů 1.
 */
export function teamsHomeShare(
  state: Pick<VillageState, 'pens' | 'ards' | 'carts' | 'trade'>,
  day: number,
): number {
  const teams = ableTeams(state, day);
  if (teams <= 0) return 1;
  return ploughPairsHome(state, day) / teams;
}

/**
 * Vozy, které dnes můžou vozit, a voli pro ně (oxen.md – Voli se sdílí): vozy doma (ne na výpravě)
 * po druzích a vycvičení voli doma, kteří neorají – ve dny orby (`ploughing`) jdou páry napřed
 * k rádlům, vozy táhne zbytek volů. Plány svozu flotilu ubírají (`takeCart`).
 */
export interface CartFleet {
  'two-wheel': number;
  'four-wheel': number;
  oxen: number;
}

/** Flotila dne (`CartFleet`). */
export function cartFleetToday(
  state: Pick<VillageState, 'carts' | 'pens' | 'ards' | 'trade'>,
  day: number,
  ploughing: boolean,
): CartFleet {
  const away = cartsAway(state);
  const fleet: CartFleet = { 'two-wheel': 0, 'four-wheel': 0, oxen: 0 };
  for (const cart of villageCarts(state)) if (!away.has(cart.id)) fleet[cart.kind]++;
  if (fleet['two-wheel'] + fleet['four-wheel'] === 0) return fleet;
  const ploughOxen = ploughing ? DRAFT_OXEN.ard * ploughPairsHome(state, day) : 0;
  fleet.oxen = Math.max(0, oxenHome(state, day) - ploughOxen);
  return fleet;
}

/** Kolik vozů druhu `kind` z flotily může jet – každý se svými voly (dvoukolák 1, čtyřkolák 2). */
export function fleetCarts(fleet: Readonly<CartFleet>, kind: CartKind): number {
  return Math.max(0, Math.min(fleet[kind], Math.floor(fleet.oxen / DRAFT_OXEN[kind])));
}

/** Vůz druhu `kind` i se svými voly jede (mutuje flotilu). */
export function takeCart(fleet: CartFleet, kind: CartKind, count = 1): void {
  fleet[kind] -= count;
  fleet.oxen -= count * DRAFT_OXEN[kind];
}

/**
 * Kolik dvoukoláků dnes může vozit (oxen.md – Voli se sdílí): doma (ne na výpravě) a s vlastním
 * vycvičeným volem, který je doma a neorá – ve dny orby (`ploughing`) jdou páry napřed k rádlům,
 * vozy táhne zbytek volů.
 */
export function haulCartsToday(
  state: Pick<VillageState, 'carts' | 'pens' | 'ards' | 'trade'>,
  day: number,
  ploughing: boolean,
): number {
  return fleetCarts(cartFleetToday(state, day, ploughing), 'two-wheel');
}

/** Kolikrát víc nákladu vůz uveze proti dvoukoláku (čtyřkolák 800 kg – dvakrát). */
export function cartLoadRatio(kind: CartKind): number {
  return CARTS.loadKg[kind] / CARTS.loadKg['two-wheel'];
}

/**
 * Vozy pro výpravu (wagons.md – Obchod): doma a s vycvičenými voly, kteří nejsou s jinou výpravou
 * (čtyřkolák táhnou dva, dvoukolák jeden – oxen.md, Potah) – čtyřkoláky napřed (víc nákladu), pak
 * dvoukoláky; v pořadí id. Vůz, na který voli nezbudou, zůstane doma.
 */
export function tradeCarts(
  state: Pick<VillageState, 'carts' | 'pens' | 'trade'>,
  day: number,
): Cart[] {
  const away = cartsAway(state);
  let oxen = oxenHome(state, day);
  const home = villageCarts(state)
    .filter((c) => !away.has(c.id))
    .sort((a, b) => CART_KINDS.indexOf(b.kind) - CART_KINDS.indexOf(a.kind) || a.id - b.id);
  const out: Cart[] = [];
  for (const cart of home) {
    if (oxen < cartOxen(cart.kind)) continue;
    oxen -= cartOxen(cart.kind);
    out.push(cart);
  }
  return out;
}

// --- svoz --------------------------------------------------------------------------------

/**
 * Svoz vozy na jednu úlohu dne: kolik práce nošení vozy převezmou (`work` – člověkodny nošení),
 * kolik práce stojí honáci a nakladači (`crew`) a kolik vozů jede; z toho čtyřkoláky (`four`)
 * a jejich díl nošení (`fourWork`) – chybí = jen dvoukoláky.
 */
export interface HaulPlan {
  work: number;
  crew: number;
  carts: number;
  four?: number;
  fourWork?: number;
}

export const NO_HAUL: HaulPlan = { work: 0, crew: 0, carts: 0 };

/**
 * Svoz na úlohu, kde je `available` člověkodní nošení tam, kam vůz dojede (wagons.md – Vůz):
 * vůz za den odveze tolik jako CARTS.carrierManDays nosičů a jdou s ním CARTS.crew lidé –
 * u menšího nákladu poměrně méně. Nejvýš `carts` vozů.
 */
export function haulPlan(available: number, carts: number): HaulPlan {
  if (available <= EPSILON || carts <= 0) return NO_HAUL;
  const work = Math.min(available, carts * CARTS.carrierManDays);
  return {
    work,
    crew: (work * CARTS.crew) / CARTS.carrierManDays,
    carts: Math.min(carts, Math.ceil(work / CARTS.carrierManDays - EPSILON)),
  };
}

/** Klíče uložených dosahů a jízd čtyřkoláku (CropWork, HayMowing, OrchardWork, ConstructionWood, milíř, voda). */
const FOUR_WHEEL_CACHES = new Set(['cartReach4', 'cart4', 'waterCart4']);

function dropFourWheelCaches(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) dropFourWheelCaches(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FOUR_WHEEL_CACHES.has(key)) delete record[key];
    else dropFourWheelCaches(record[key]);
  }
}

/**
 * Ves z doby, kdy čtyřkolák jezdil jen po pevných cestách (wagons.md – Co se vozí a na čem;
 * Martin 20. 10. 2026: „Po strništích a loukách může libovolně“): uložené dosahy a jízdy
 * čtyřkoláku se jednou zahodí a spočítají znovu (mutuje – volá se na kopii stavu). Jen ves
 * s rokem vozů (`draft`) – bez něj čtyřkolák nic nespočítal.
 */
export function withFourWheelReach(state: VillageState): void {
  if (!state.draft || !needsFourWheelReach(state)) return;
  dropFourWheelCaches(state);
  state.draft.fourWheelOffRoad = true;
}

/** Ves potřebuje převod dosahů čtyřkoláku (`withFourWheelReach`) – seznam převodů podle toho klonuje. */
export function needsFourWheelReach(state: Pick<VillageState, 'draft'>): boolean {
  return state.draft ? !state.draft.fourWheelOffRoad : false;
}

/**
 * Svoz z flotily (wagons.md – Co se vozí a na čem, Martin 20. 10. 2026: „Ano, udělej to jak
 * říkáš“ – ves vybere levnější vůz pro každou práci): čtyřkoláky napřed na nošení, kam dojedou
 * (`road` – kam dojede čtyřkolák – po louce a strništi, na zoraný díl ne; za den uveze dvakrát víc se stejnou posádkou), dvoukoláky na
 * zbytek (`available` – kam dojede dvoukolák, i co čtyřkoláky nepobraly). Vůz za den odveze
 * CARTS.carrierManDays × poměr nákladu nosičů, posádka CARTS.crew poměrně k nákladu. Mutuje
 * flotilu (`takeCart`).
 */
export function fleetHaulPlan(available: number, road: number, fleet: CartFleet): HaulPlan {
  if (available <= EPSILON) return NO_HAUL;
  const cap4 = CARTS.carrierManDays * cartLoadRatio('four-wheel');
  let fourWork = 0;
  let four = 0;
  const roadLeft = Math.min(road, available);
  while (fourWork + EPSILON < roadLeft && fleetCarts(fleet, 'four-wheel') > 0) {
    fourWork += Math.min(cap4, roadLeft - fourWork);
    four++;
    takeCart(fleet, 'four-wheel');
  }
  const rest = available - fourWork;
  let twoWork = 0;
  let two = 0;
  while (twoWork + EPSILON < rest && fleetCarts(fleet, 'two-wheel') > 0) {
    twoWork += Math.min(CARTS.carrierManDays, rest - twoWork);
    two++;
    takeCart(fleet, 'two-wheel');
  }
  if (four + two === 0) return NO_HAUL;
  const crew = (fourWork / cap4 + twoWork / CARTS.carrierManDays) * CARTS.crew;
  return {
    work: fourWork + twoWork,
    crew,
    carts: four + two,
    ...(four > 0 ? { four, fourWork } : {}),
  };
}

/**
 * Pokrok úlohy z práce vsi `amount`, když na ní jezdí vozy (`haul`): honáci a nakladači jdou
 * napřed a vozy pak převezmou svůj díl nošení; když práce na posádku nestačí, vozy převezmou
 * poměrně méně. Bez vozů = `amount`.
 */
export function haulProgress(amount: number, haul: HaulPlan): number {
  if (haul.crew <= EPSILON) return amount;
  if (amount >= haul.crew) return amount - haul.crew + haul.work;
  return hauledBy(amount, haul);
}

/** Kolik nošení vozy z práce vsi `amount` opravdu převzaly (posádka jde napřed). */
export function hauledBy(amount: number, haul: HaulPlan): number {
  if (haul.crew <= EPSILON) return 0;
  return amount >= haul.crew ? haul.work : (Math.max(0, amount) / haul.crew) * haul.work;
}

/**
 * Nošení, které vozy na úloze ještě smí převzít (čd): nejvýš podíl `share` práce úlohy na místech,
 * kam vůz dojede (`reach`), bez toho, co už převzaly (`hauled`), a nejvýš ten podíl ze zbývající
 * práce – vůz sám úlohu nedodělá (snopy se musí nejdřív požnout, klády skácet).
 */
export function haulAvailable(
  required: number,
  remaining: number,
  hauled: number,
  share: number,
): number {
  return Math.max(0, Math.min(required * share - hauled, remaining * share));
}

// --- dosah vozu ----------------------------------------------------------------------------

/**
 * Dosah vozu (wagons.md – Vozová síť): dojede vůz od ohrady volů k cílům, a kolik metrů
 * jízdy? Rozhraní pro práci s vozy – kde vůz nedojede, nosí se jako dřív (anti-cíl: vůz, který
 * ušetří práci tam, kam nedojede). `state` je stav vsi, ze kterého se síť počítá; cíle jdou
 * najednou (jedno hledání). Délka v pořadí cílů,
 * null = nedojede.
 */
export type CartAccess = (state: VillageState, targets: readonly CartTarget[]) => (number | null)[];

/** Vůz dojede všude vzdušnou čarou – ves bez krajiny (testy, kalibrace). */
export const EVERYWHERE: CartAccess = (_state, targets) => targets.map(() => 0);

/**
 * Dosah vozů po vozové síti (wagons.md – fáze 2, `villageCartRoutes`): trasy dvoukoláku od ohrad
 * volů – sklon ve směru jízdy, serpentiny, brody, les jen po pevné cestě, přes osetý díl
 * ne. Bez hotové ohrady volů nedojede nikam.
 */
export function networkCartAccess(
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  kind: CartKind = 'two-wheel',
): CartAccess {
  return (state, targets) => {
    if (targets.length === 0) return [];
    void obstacles;
    const routes = villageCartEstimates(state, day, landscape, kind, targets);
    return targets.map((_, k) => {
      const route = routes?.[k];
      return route?.reached ? route.lengthM : null;
    });
  };
}

/**
 * Vůz s voly, který si vezmou odcházející (migration.md – Vůz při odchodu; Martin 20. 10. 2026:
 * „Ano, udělej to jak říkáš“ – návrh nových nákladů vozů, wagons.md): vůz doma (ne na výpravě)
 * a vycvičení voli pro něj (DRAFT_OXEN), bez kterých ves udrží páry k rádlům, které má
 * (`ableTeams`); odchází-li celá ves (`all`), páry nedrží. Napřed čtyřkolák (uveze víc jídla), pak
 * dvoukolák, nejmladší vůz; voli s nejdelší zbývající službou (nejpozději vycvičení). Bez vozu nebo
 * volů null. Nemění stav – vůz a voly odebere `takeLeavingCart`.
 */
export function leavingCart(
  state: Pick<VillageState, 'pens' | 'ards' | 'carts' | 'trade'>,
  day: number,
  all: boolean,
): { cart: Cart; oxen: Ox[] } | null {
  const away = cartsAway(state);
  const home = villageCarts(state).filter((c) => !away.has(c.id));
  if (home.length === 0) return null;
  const trained = oxPens(state)
    .flatMap((pen) => oxenOf(pen).filter((ox) => isTrained(ox, day)))
    .sort((a, b) => b.trainedDay - a.trainedDay);
  const spare = trained.length - (all ? 0 : DRAFT_OXEN.ard * ableTeams(state, day));
  for (const kind of ['four-wheel', 'two-wheel'] as const) {
    if (spare < DRAFT_OXEN[kind]) continue;
    const cart = home
      .filter((c) => c.kind === kind)
      .sort((a, b) => b.builtDay - a.builtDay || b.id - a.id)[0];
    if (cart) return { cart, oxen: trained.slice(0, DRAFT_OXEN[kind]).map((ox) => ({ ...ox })) };
  }
  return null;
}

/**
 * Vůz a voly `taken` (`leavingCart`) odvezou odcházející (mutuje stav): vůz zmizí z vozů vsi,
 * voli z ohrad (stejný den vycvičení – z ohrady s nejvyšším id napřed).
 */
export function takeLeavingCart(
  state: VillageState,
  taken: { cart: Cart; oxen: readonly Ox[] },
): void {
  state.carts = villageCarts(state).filter((c) => c.id !== taken.cart.id);
  if (state.carts.length === 0) delete state.carts;
  const pens = [...oxPens(state)].sort((a, b) => b.id - a.id);
  for (const ox of taken.oxen) {
    for (const pen of pens) {
      const oxen = oxenToEdit(pen);
      const k = oxen.findIndex((o) => o.trainedDay === ox.trainedDay);
      if (k < 0) continue;
      oxen.splice(k, 1);
      break;
    }
  }
}

/** Odkud vozy vyjíždějí – hotová ohrada volů (nejnižší id); bez ní null. */
export function cartOrigin(state: Pick<VillageState, 'pens'>): { x: number; z: number } | null {
  const pen = oxPens(state)
    .filter((p) => p.builtDay !== null)
    .sort((a, b) => a.id - b.id)[0];
  return pen ? { x: pen.x, z: pen.z } : null;
}

/**
 * Dosah vozů vsi dnes (`kind` – čtyřkolák širším obloukem a ne na zoraný díl): s krajinou vozová síť
 * (`networkCartAccess`), bez krajiny všude (testy, kalibrace – jako chůze bez krajiny vzdušně); bez
 * hotové ohrady volů null.
 */
export function villageCartAccess(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  kind: CartKind = 'two-wheel',
): CartAccess | null {
  if (!cartOrigin(state)) return null;
  return landscape ? networkCartAccess(day, landscape, obstacles, kind) : EVERYWHERE;
}

/** Střed dílu pole ve světě. */
function partCenter(
  state: VillageState,
  geo: { size: number; cellSizeM: number },
  part: FieldPart,
): { x: number; z: number } {
  return squareCenter(geo, fieldGridOf(state, part.fieldId), part.cell!);
}

/** Místo svozu – cíl vozu, plocha (váha) a skupina (pole, louky), do které patří. */
interface HaulSpot {
  x: number;
  z: number;
  weight: number;
  group: string;
}

/**
 * Kam vozy na úloze dojedou (`CartReach`): podíl váhy míst, ke kterým vůz dojede, a body jízd –
 * za každou skupinu (pole, louky) dosažené místo nejblíž jejímu těžišti s váhou dosažené plochy.
 */
function reachOf(state: VillageState, spots: readonly HaulSpot[], access: CartAccess): CartReach {
  const total = spots.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0) return { share: 0, points: [] };
  const lengths = access(
    state,
    spots.map((s) => ({ x: s.x, z: s.z, reachM: CARTS.reachM })),
  );
  const groups = new Map<string, { spots: HaulSpot[]; weight: number; x: number; z: number }>();
  let reached = 0;
  spots.forEach((spot, k) => {
    if (lengths[k] === null || lengths[k] === undefined) return;
    reached += spot.weight;
    const g = groups.get(spot.group) ?? { spots: [], weight: 0, x: 0, z: 0 };
    g.spots.push(spot);
    g.weight += spot.weight;
    g.x += spot.x * spot.weight;
    g.z += spot.z * spot.weight;
    groups.set(spot.group, g);
  });
  const points = [...groups.values()].map((g) => {
    const cx = g.x / g.weight;
    const cz = g.z / g.weight;
    let best = g.spots[0]!;
    let bestD = Infinity;
    for (const spot of g.spots) {
      const d = (spot.x - cx) ** 2 + (spot.z - cz) ** 2;
      if (d < bestD) {
        best = spot;
        bestD = d;
      }
    }
    return { x: best.x, z: best.z, weight: g.weight / reached };
  });
  return { share: reached / total, points };
}

/**
 * Kam vůz při žni plodiny dojede (podíl plochy dílů plánu, body jízd po polích) – snopy
 * z ostatních dílů se nosí jako dřív. Bez krajiny všude (body žádné – jízdy se nesčítají).
 */
export function cropCartReach(
  state: VillageState,
  work: CropWork,
  landscape: Landscape | null,
  access: CartAccess,
): CartReach {
  if (!landscape) return { share: 1, points: [] };
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const spots = work.partIds.flatMap((id): HaulSpot[] => {
    const part = partsById.get(id);
    if (!part?.cell) return [];
    const at = partCenter(state, landscape, part);
    return [{ ...at, weight: part.areaM2, group: `field:${part.fieldId}` }];
  });
  return reachOf(state, spots, access);
}

/**
 * Kam vůz s osivem dojede (wagons.md – Co vozy vozí): podíl plochy dílů plodiny a body jízd po
 * polích – vozová síť ve stavu, jak je (zoraný díl projede pomaleji, osetý díl jiné plodiny ne).
 * Osivo na ostatní díly se nosí jako dřív. Bez krajiny všude (body žádné – jízdy se nesčítají).
 */
export function sowingCartReach(
  state: VillageState,
  work: CropWork,
  landscape: Landscape | null,
  access: CartAccess,
): CartReach {
  if (!landscape) return { share: 1, points: [] };
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const spots = work.partIds.flatMap((id): HaulSpot[] => {
    const part = partsById.get(id);
    if (!part?.cell) return [];
    const at = partCenter(state, landscape, part);
    return [{ ...at, weight: part.areaM2, group: `field:${part.fieldId}` }];
  });
  return reachOf(state, spots, access);
}

/** Kam vůz při seči dojede (podíl plochy luk v seči, body jízd – díly polí a přirozené louky). */
export function mowingCartReach(
  state: VillageState,
  mowing: HayMowing,
  landscape: Landscape | null,
  access: CartAccess,
): CartReach {
  if (!landscape) return { share: 1, points: [] };
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const squares = mowing.squares ?? mowing.partIds.map((partId) => ({ partId }));
  const spots = squares.flatMap((sq): HaulSpot[] => {
    if (sq.partId !== undefined) {
      const part = partsById.get(sq.partId);
      if (!part?.cell) return [];
      const at = partCenter(state, landscape, part);
      return [{ ...at, weight: part.areaM2, group: `field:${part.fieldId}` }];
    }
    const cell = 'cell' in sq ? sq.cell : undefined;
    if (!cell) return [];
    const at = squareCenter(landscape, undefined, cell);
    return [{ ...at, weight: 'areaM2' in sq ? sq.areaM2 : 0, group: 'meadow' }];
  });
  return reachOf(state, spots, access);
}

/**
 * Kam vůz při sklizni jablek dojede (orchard.md – Jablka vozem): podíl plochy vysazených čtverců
 * sadů, ke kterým vůz dojede (do CARTS.reachM od středu čtverce – do sadu nevjede, staví na kraji)
 * a body jízd po sadech. Bez krajiny všude (body žádné).
 */
export function orchardCartReach(
  state: VillageState,
  landscape: Landscape | null,
  access: CartAccess,
): CartReach {
  if (!landscape) return { share: 1, points: [] };
  const spots = villageOrchards(state).flatMap((orchard) =>
    orchard.squares.flatMap((sq): HaulSpot[] => {
      if (sq.plantedDay === null) return [];
      const at = squareCenter(landscape, orchard.grid, sq.cell);
      return [{ ...at, weight: sq.areaM2, group: `orchard:${orchard.id}` }];
    }),
  );
  return reachOf(state, spots, access);
}

/**
 * Ke kterým stromům stavby vůz dojede (wagons.md – Svoz klád): k dospělému stromu do
 * CARTS.dragM (kládu ke kraji lesa vlečou lidé). Stromy bez polohy (ves bez vrstvy překážek) vždy,
 * stromy mimo vrstvu (les vsi) nikdy – vozová síť je stejně do lesa nepustí. Body jízd = stromy.
 */
export function logsCartReach(
  state: VillageState,
  wood: ConstructionWood,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  access: CartAccess,
): NonNullable<ConstructionWood['cartReach']> {
  if (!landscape || !obstacles) return { trees: wood.fell.map(() => true), points: [] };
  const at = wood.fell.map((tree) => {
    if (tree.id === null) return null;
    const index = obstacleIndex(obstacles, tree.id);
    return index < 0 ? null : { x: obstacles.x[index]!, z: obstacles.z[index]! };
  });
  const asked = at.flatMap((p, k) => (p ? [{ k, p }] : []));
  const lengths = access(
    state,
    asked.map(({ p }) => ({ x: p.x, z: p.z, reachM: CARTS.dragM })),
  );
  const trees = wood.fell.map((tree) => tree.id === null);
  const points: CartReach['points'] = [];
  let weight = 0;
  asked.forEach(({ k, p }, q) => {
    if (lengths[q] === null || lengths[q] === undefined) return;
    trees[k] = true;
    points.push({ x: p.x, z: p.z, weight: wood.fell[k]!.cost });
    weight += wood.fell[k]!.cost;
  });
  return { trees, points: points.map((p) => ({ ...p, weight: p.weight / (weight || 1) })) };
}

/**
 * Kácení a dovoz klád stavby u stromů, ke kterým vůz dojede (`reach` – po stromech; člověkodny)
 * – celé (`total`) a zbývající (`remaining`).
 */
export function fellingHaulable(
  c: { done: number; wood?: ConstructionWood },
  reach: readonly boolean[],
): { total: number; remaining: number } {
  const wood = c.wood;
  const none = { total: 0, remaining: 0 };
  if (!wood) return none;
  const felling = woodFellingCost(wood);
  if (c.done + EPSILON >= felling) return none;
  let total = 0;
  let remaining = 0;
  let at = 0;
  wood.fell.forEach((tree, k) => {
    const start = at;
    at += tree.cost;
    if (!reach[k]) return;
    total += tree.cost;
    // zbývá jen nepokácená část (kácí se v pořadí stromů)
    remaining += Math.max(0, at - Math.max(start, c.done));
  });
  return { total, remaining };
}

/**
 * Jízdy svozu do ročního provozu cest (wagons.md – Vyjeté cesty, `addRoadCartTrips`): vůz za den
 * udělá CARTS.loadsPerCartDay jízd – podle převzatého nošení (`hauled`, čd) rozdělených na body
 * úlohy podle váhy. Ves bez pevných cest (bez krajiny) nic nesčítá. S deníkem `log` jízdy jen
 * zapíše (zbytek obstará `flushCartTrips`).
 */
export function addHaulTrips(
  state: VillageState,
  reach: Pick<CartReach, 'points'>,
  hauled: number,
  kind: CartKind = 'two-wheel',
  log?: CartTripLog,
): void {
  if ((!state.roads && !log) || hauled <= EPSILON || reach.points.length === 0) return;
  const trips = (hauled * CARTS.loadsPerCartDay) / (CARTS.carrierManDays * cartLoadRatio(kind));
  const list = reach.points.map((p) => ({
    x: p.x,
    z: p.z,
    kind,
    trips: trips * p.weight,
  }));
  // s deníkem jízd dne se jízdy jen zapíšou (`flushCartTrips` – provoz cest)
  if (log) log.push(...list);
  else if (state.roads) addRoadCartTrips(state.roads, list);
}

/**
 * Projede vůz zemskou stezkou (wagons.md – Obchod; `axisCartCheck` – sklon ve směru jízdy do
 * meze a voda jen brodem)? Osa stezky = její úseky pevných cest od vsi ven. Bez krajiny ano.
 */
export function trailCartPassable(
  state: Pick<VillageState, 'roads'>,
  trail: Pick<Trail, 'pieces'>,
  landscape: Landscape | null,
): boolean {
  if (!landscape) return true;
  const roads = new Map((state.roads?.roads ?? []).map((r) => [r.id, r]));
  const terrain = trailTerrain(landscape, null);
  return trail.pieces.every((piece) => {
    const road = roads.get(piece.roadId);
    return !road || axisCartCheck(road.points, terrain).passable;
  });
}
