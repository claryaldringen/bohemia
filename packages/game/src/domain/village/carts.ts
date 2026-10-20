import { obstacleIndex, type Landscape, type ObstacleLayer } from '../landscape';
import { ableTeams, oxenHome, oxPens, ploughPairsHome } from './oxen';
import { axisCartCheck, type CartTarget } from './paths/cart';
import { addRoadCartTrips, villageCartRoutes } from './paths/roads';
import { CARTS, DRAFT_OXEN } from './rules';
import { squareCenter } from './square-grid';
import { fieldGridOf } from './squares';
import type {
  Cart,
  CartKind,
  CartReach,
  ChronicleEvent,
  ConstructionWood,
  CropWork,
  FieldPart,
  HayMowing,
  TradeExpedition,
  Trail,
  VillageState,
} from './types';
import { trailTerrain } from './paths/terrain';
import { woodFellingCost } from './wood';

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

/** Vozy, které jsou s výpravou na cestě (id). */
export function cartsAway(state: Pick<VillageState, 'trade'>): Set<number> {
  const away = new Set<number>();
  for (const e of state.trade?.expeditions ?? []) for (const id of e.carts ?? []) away.add(id);
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
 * Kolik dvoukoláků dnes může vozit (oxen.md – Voli se sdílí): doma (ne na výpravě) a s vlastním
 * vycvičeným volem, který je doma a neorá – ve dny orby (`ploughing`) jdou páry napřed k rádlům,
 * vozy táhne zbytek volů. Čtyřkolák jezdí jen s výpravami.
 */
export function haulCartsToday(
  state: Pick<VillageState, 'carts' | 'pens' | 'ards' | 'trade'>,
  day: number,
  ploughing: boolean,
): number {
  const carts = villageCarts(state);
  if (carts.length === 0) return 0;
  const away = cartsAway(state);
  const home = carts.filter((c) => c.kind === 'two-wheel' && !away.has(c.id)).length;
  const ploughOxen = ploughing ? DRAFT_OXEN.ard * ploughPairsHome(state, day) : 0;
  const oxen = oxenHome(state, day) - ploughOxen;
  return Math.max(0, Math.min(home, Math.floor(oxen / DRAFT_OXEN['two-wheel'])));
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
 * kolik práce stojí honáci a nakladači (`crew`) a kolik vozů jede.
 */
export interface HaulPlan {
  work: number;
  crew: number;
  carts: number;
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
 * ušetří práci tam, kam nedojede). `state` je stav vsi, ze kterého se síť počítá (i upravený –
 * žeň po strništi, `harvestReachState`); cíle jdou najednou (jedno hledání). Délka v pořadí cílů,
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
    const routes = villageCartRoutes(state, day, landscape, obstacles, kind, targets);
    return targets.map((_, k) => {
      const route = routes?.[k];
      return route?.reached ? route.lengthM : null;
    });
  };
}

/** Odkud vozy vyjíždějí – hotová ohrada volů (nejnižší id); bez ní null. */
export function cartOrigin(state: Pick<VillageState, 'pens'>): { x: number; z: number } | null {
  const pen = oxPens(state)
    .filter((p) => p.builtDay !== null)
    .sort((a, b) => a.id - b.id)[0];
  return pen ? { x: pen.x, z: pen.z } : null;
}

/**
 * Dosah vozů vsi dnes: s krajinou vozová síť (`networkCartAccess`), bez krajiny všude (testy,
 * kalibrace – jako chůze bez krajiny vzdušně); bez hotové ohrady volů null.
 */
export function villageCartAccess(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): CartAccess | null {
  if (!cartOrigin(state)) return null;
  return landscape ? networkCartAccess(day, landscape, obstacles) : EVERYWHERE;
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
 * Stav vsi pro žeň (wagons.md – Svoz, rozhodnutí Clauda): vůz jede za žní po strništi – snopy
 * se svážejí z požatých dílů, kde stojí v panácích, a žeň jde od domu ven (fields.md – Postup
 * práce po čtvercích), takže díly sklízené plodiny se pro vůz postupně otevírají. Ostatní osetá
 * pole (jař, luštěniny při žni ozimu) zůstávají neprůjezdná. Díly plodiny `work` proto vozová síť
 * vidí jako sklizené (strniště – stadium `ready`, jede se pomaleji).
 */
export function harvestReachState(state: VillageState, work: CropWork): VillageState {
  const reaped = new Set(work.partIds);
  return {
    ...state,
    parts: state.parts.map((p) =>
      reaped.has(p.id) && p.state === 'sown' ? { ...p, state: 'ready' as const } : p,
    ),
  };
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
  return reachOf(harvestReachState(state, work), spots, access);
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
 * úlohy podle váhy. Ves bez pevných cest (bez krajiny) nic nesčítá.
 */
export function addHaulTrips(
  state: VillageState,
  reach: Pick<CartReach, 'points'>,
  hauled: number,
  kind: CartKind = 'two-wheel',
): void {
  if (!state.roads || hauled <= EPSILON || reach.points.length === 0) return;
  const trips = (hauled * CARTS.loadsPerCartDay) / CARTS.carrierManDays;
  addRoadCartTrips(
    state.roads,
    reach.points.map((p) => ({ x: p.x, z: p.z, kind, trips: trips * p.weight })),
  );
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

/** Vozy výpravy podle id (pro panel – druh vozů na cestě). */
export function expeditionCartKinds(
  state: Pick<VillageState, 'carts'>,
  expedition: Pick<TradeExpedition, 'carts'>,
): CartKind[] {
  const byId = new Map(villageCarts(state).map((c) => [c.id, c.kind]));
  return (expedition.carts ?? []).flatMap((id) => {
    const kind = byId.get(id);
    return kind ? [kind] : [];
  });
}
