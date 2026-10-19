import {
  heightAtWorld,
  obstacleIndex,
  surfaceAt,
  tileOfWorldPoint,
  type Landscape,
  type ObstacleLayer,
} from '../landscape';
import { ableTeams, villagePens } from './oxen';
import { CARTS, CART_ACCESS } from './rules';
import { squareCenter } from './square-grid';
import { fieldGridOf } from './squares';
import type {
  Cart,
  CartKind,
  ChronicleEvent,
  ConstructionWood,
  CropWork,
  FieldPart,
  HayMowing,
  TradeExpedition,
  VillageState,
} from './types';
import { woodFellingCost } from './wood';

// Vozy (wagons.md – Vůz): zásoba vsi, kterou vyrábí tesař (carpentry.ts). Vůz stojí u ohrady se
// spřežením, táhnou ho voli ze spřežení (ve dny orby orají, s výpravou jsou pryč) a jde s ním
// honák a nakladač. Vozí snopy z pole, seno z luk a klády ke stavbám – kus práce nošení převezme
// tam, kam dojede (`CartAccess`); obchodní výprava vezme vůz místo nosičů (trade.ts).
// Dosah vozu je zatím zástupný (`straightCartAccess` – fáze 1); vozová síť (fáze 2) dá skutečné
// trasy se sklonem ve směru jízdy, serpentinami a vyjetými cestami.

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

/**
 * Kolik vozů ves potřebuje (wagons.md – návrh Clauda): dvoukolák na každé vycvičené spřežení
 * (jeden vůz na spřežení) a s hotovou zemskou stezkou navíc jeden čtyřkolák na obchodní výpravy.
 * Bez spřežení žádný – vůz bez volů stojí.
 */
export function cartTargets(
  state: Pick<VillageState, 'pens' | 'trails'>,
): Readonly<Record<CartKind, number>> {
  const teams = ableTeams(state);
  const trail = (state.trails ?? []).some((t) => t.builtDay !== null);
  return { 'two-wheel': teams, 'four-wheel': teams > 0 && trail ? 1 : 0 };
}

/**
 * Vůz, který ves potřebuje a nemá (ani se nevyrábí v žádné dílně tesaře) – dvoukolák napřed;
 * jinak null.
 */
export function missingCart(
  state: Pick<VillageState, 'pens' | 'trails' | 'carts' | 'dwellings'>,
): CartKind | null {
  const targets = cartTargets(state);
  const have: Record<CartKind, number> = { 'two-wheel': 0, 'four-wheel': 0 };
  for (const cart of villageCarts(state)) have[cart.kind]++;
  for (const d of state.dwellings) {
    const making = d.workshop?.cart;
    if (making) have[making.kind]++;
  }
  return CART_KINDS.find((kind) => have[kind] < targets[kind]) ?? null;
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

/** Spřežení, která jsou s vozem na výpravě (každý vůz na cestě táhne jedno spřežení). */
export function teamsAway(state: Pick<VillageState, 'trade'>): number {
  return cartsAway(state).size;
}

/** Podíl spřežení vsi, která jsou doma (orba – oxen.md); bez spřežení 1. */
export function teamsHomeShare(state: Pick<VillageState, 'pens' | 'trade'>): number {
  const teams = ableTeams(state);
  if (teams <= 0) return 1;
  return Math.max(0, teams - teamsAway(state)) / teams;
}

/**
 * Kolik dvoukoláků dnes může vozit: doma (ne na výpravě) a se spřežením, které neorá (`ploughing`
 * – dnes je v plánu orba, voli orají) ani nejede s výpravou. Čtyřkolák jezdí jen s výpravami.
 */
export function haulCartsToday(
  state: Pick<VillageState, 'carts' | 'pens' | 'trade'>,
  ploughing: boolean,
): number {
  const carts = villageCarts(state);
  if (carts.length === 0 || ploughing) return 0;
  const away = cartsAway(state);
  const home = carts.filter((c) => c.kind === 'two-wheel' && !away.has(c.id)).length;
  return Math.max(0, Math.min(home, ableTeams(state) - away.size));
}

/**
 * Vozy pro výpravu (wagons.md – Obchod): doma a se spřežením, které nejede s jinou výpravou –
 * čtyřkoláky napřed (víc nákladu), pak dvoukoláky; v pořadí id.
 */
export function tradeCarts(state: Pick<VillageState, 'carts' | 'pens' | 'trade'>): Cart[] {
  const away = cartsAway(state);
  const teams = Math.max(0, ableTeams(state) - away.size);
  const home = villageCarts(state)
    .filter((c) => !away.has(c.id))
    .sort((a, b) => CART_KINDS.indexOf(b.kind) - CART_KINDS.indexOf(a.kind) || a.id - b.id);
  return home.slice(0, teams);
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
 * Dosah vozu (wagons.md – Vozová síť): dojede vůz od ohrady k místu, a kolik metrů jízdy?
 * Rozhraní pro práci s vozy – kde vůz nedojede, nosí se jako dřív (anti-cíl: vůz, který ušetří
 * práci tam, kam nedojede). Fáze 1 dává zástupnou odpověď (`straightCartAccess`), vozová síť
 * (fáze 2 – sklon ve směru jízdy, serpentiny, vyjeté cesty, brody a hať) ho nahradí.
 */
export interface CartAccess {
  /**
   * Délka jízdy k bodu (m), nebo null – vůz tam nedojede. `dragM` – posledních tolik metrů
   * smí vést lesem (kládu ke kraji lesa vlečou lidé – CARTS.dragM); jinak 0.
   */
  reach(target: { x: number; z: number }, dragM?: number): number | null;
}

/** Vůz dojede všude vzdušnou čarou – ves bez krajiny (testy, kalibrace). */
export const EVERYWHERE: CartAccess = {
  reach: () => 0,
};

/**
 * Zástupný dosah vozu (fáze 1, návrh Clauda – do vozové sítě): vůz jede od ohrady rovně a cesta
 * se vzorkuje po CART_ACCESS.stepM – každý bod musí ležet na louce nebo na políčku vsi (pole,
 * ohrada – `open`), ne v lese ani ve vodě, a sklon mezi body (sklon ve směru jízdy) nejvýš
 * CART_ACCESS.maxGrade. Les smí jen posledních `dragM` metrů (kládu vlečou lidé). Pevné cesty,
 * brody a hať zatím nezná – vozová síť (fáze 2) je zahrne a ve svahu najde serpentiny, takže
 * zástupná odpověď je spíš přísná: kde vůz rovně nedojede, nosí se jako dřív. Výsledky drží
 * v mezipaměti.
 */
export function straightCartAccess(
  landscape: Landscape,
  from: { x: number; z: number },
  open: ReadonlySet<number> = new Set(),
): CartAccess {
  const cache = new Map<string, number | null>();
  return {
    reach(target, dragM = 0): number | null {
      const key = `${target.x.toFixed(1)},${target.z.toFixed(1)},${dragM}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const result = straightReach(landscape, from, target, dragM, open);
      cache.set(key, result);
      return result;
    },
  };
}

function straightReach(
  landscape: Landscape,
  from: { x: number; z: number },
  target: { x: number; z: number },
  dragM: number,
  open: ReadonlySet<number>,
): number | null {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.max(1, Math.ceil(length / CART_ACCESS.stepM));
  const step = length / steps;
  let previous = heightAtWorld(landscape, from.x, from.z);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return null;
    const index = tile.y * landscape.size + tile.x;
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return null;
    if (surface === 'forest' && !open.has(index) && length - t * length > dragM + EPSILON) {
      return null;
    }
    const height = heightAtWorld(landscape, x, z);
    if (step > EPSILON && Math.abs(height - previous) / step > CART_ACCESS.maxGrade) return null;
    previous = height;
  }
  return length;
}

/** Odkud vozy vyjíždějí – ohrada se spřežením (nejnižší id); bez ní null. */
export function cartOrigin(state: Pick<VillageState, 'pens'>): { x: number; z: number } | null {
  const pen = villagePens(state)
    .filter((p) => p.team !== null && p.builtDay !== null)
    .sort((a, b) => a.id - b.id)[0];
  return pen ? { x: pen.x, z: pen.z } : null;
}

/** Políčka krajiny, která ves otevřela (díly polí, ohrady) – vůz po nich jede i v bývalém lese. */
function openTiles(state: VillageState, landscape: Landscape): Set<number> {
  const tiles = new Set<number>();
  const add = (p: { x: number; z: number }): void => {
    const tile = tileOfWorldPoint(landscape, p.x, p.z);
    if (tile) tiles.add(tile.y * landscape.size + tile.x);
  };
  for (const part of state.parts) {
    if (part.cell) add(partCenter(state, landscape, part));
  }
  for (const pen of villagePens(state)) add(pen);
  return tiles;
}

/** Střed dílu pole ve světě (díl bez čtverce – starší obrys – null). */
function partCenter(
  state: VillageState,
  landscape: Landscape,
  part: FieldPart,
): { x: number; z: number } {
  return squareCenter(landscape, fieldGridOf(state, part.fieldId), part.cell!);
}

/**
 * Dosah vozů vsi dnes: s krajinou zástupný dosah od ohrady se spřežením (`straightCartAccess`),
 * bez krajiny všude (testy, kalibrace – jako chůze bez krajiny vzdušně); bez ohrady null.
 */
export function villageCartAccess(
  state: VillageState,
  landscape: Landscape | null,
): CartAccess | null {
  const origin = cartOrigin(state);
  if (!origin) return null;
  if (!landscape) return EVERYWHERE;
  return straightCartAccess(landscape, origin, openTiles(state, landscape));
}

/** Podíl plochy dílů, ke kterým vůz dojede (0–1); bez dílů 0. */
function reachableAreaShare(
  landscape: Landscape | null,
  access: CartAccess,
  squares: readonly { areaM2: number; at: () => { x: number; z: number } | null }[],
): number {
  let total = 0;
  let reached = 0;
  for (const sq of squares) {
    total += sq.areaM2;
    if (!landscape) {
      reached += sq.areaM2;
      continue;
    }
    const at = sq.at();
    if (at && access.reach(at) !== null) reached += sq.areaM2;
  }
  return total > 0 ? reached / total : 0;
}

/**
 * Podíl sklizně plodiny na dílech, kam vůz dojede (podle plochy dílů plánu) – snopy z ostatních
 * dílů se nosí jako dřív. Počítá se každý den svozu znovu (dosah se mění s poli a ohradami –
 * výsledek nesmí záviset na kouscích dopočtu); dosah sám si body pamatuje (`straightCartAccess`).
 */
export function cropHaulShare(
  state: VillageState,
  work: CropWork,
  landscape: Landscape | null,
  access: CartAccess,
): number {
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const squares = work.partIds.flatMap((id) => {
    const part = partsById.get(id);
    if (!part) return [];
    return [
      {
        areaM2: part.areaM2,
        at: () => (landscape && part.cell ? partCenter(state, landscape, part) : null),
      },
    ];
  });
  return reachableAreaShare(landscape, access, squares);
}

/** Podíl seče na loukách, kam vůz dojede (podle plochy luk v seči). */
export function mowingHaulShare(
  state: VillageState,
  mowing: HayMowing,
  landscape: Landscape | null,
  access: CartAccess,
): number {
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const squares = (mowing.squares ?? mowing.partIds.map((partId) => ({ partId }))).flatMap((sq) => {
    if (sq.partId !== undefined) {
      const part = partsById.get(sq.partId);
      if (!part) return [];
      return [
        {
          areaM2: part.areaM2,
          at: () => (landscape && part.cell ? partCenter(state, landscape, part) : null),
        },
      ];
    }
    const cell = 'cell' in sq ? sq.cell : undefined;
    if (!cell) return [];
    return [
      {
        areaM2: 'areaM2' in sq ? sq.areaM2 : 0,
        at: () => (landscape ? squareCenter(landscape, undefined, cell) : null),
      },
    ];
  });
  return reachableAreaShare(landscape, access, squares);
}

/**
 * Kácení a dovoz klád stavby u stromů, ke kterým vůz dojede (člověkodny) – celé (`total`)
 * a zbývající (`remaining`); kládu z lesa ke kraji vlečou lidé (CARTS.dragM). Stromy bez polohy
 * (ves bez vrstvy překážek) dosáhne vždy, stromy mimo vrstvu (les vsi) nikdy – zástupná odpověď
 * je přísná.
 */
export function fellingHaulable(
  c: { done: number; wood?: ConstructionWood },
  obstacles: ObstacleLayer | null,
  access: CartAccess,
): { total: number; remaining: number } {
  const wood = c.wood;
  const none = { total: 0, remaining: 0 };
  if (!wood) return none;
  const felling = woodFellingCost(wood);
  if (c.done + EPSILON >= felling) return none;
  let total = 0;
  let remaining = 0;
  let at = 0;
  for (const tree of wood.fell) {
    const start = at;
    at += tree.cost;
    let reached = tree.id === null || !obstacles;
    if (!reached && obstacles && tree.id !== null) {
      const index = obstacleIndex(obstacles, tree.id);
      reached =
        index >= 0 &&
        access.reach({ x: obstacles.x[index]!, z: obstacles.z[index]! }, CARTS.dragM) !== null;
    }
    if (!reached) continue;
    total += tree.cost;
    // zbývá jen nepokácená část (kácí se v pořadí stromů)
    remaining += Math.max(0, at - Math.max(start, c.done));
  }
  return { total, remaining };
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
