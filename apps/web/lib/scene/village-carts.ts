// Vozy ve vsi bez Babylonu (docs/design/wagons.md – fáze 3): z dat vsi pro scénu
// (`SceneVillage.carts` – vůz, úloha dne, náklad a trasa od herního jádra), co který vůz dnes dělá
// ve scéně – jede tam a zpět po trase dne (svoz: prázdný k poli, louce nebo stromům, plný zpátky;
// výprava: po zemské stezce ke kraji mapy a zpět, naložený), nebo stojí u ohrady bez volů – a kolik
// spřežení dnes táhne vůz a kolik orá (voli nejsou zároveň u vozu, u rádla a v ohradě). Kreslí
// village-renderer.ts (cart-renderer.ts, plough-team-renderer.ts, pen-animals.ts).
import { DRAFT_OXEN } from '@bohemia/game';
import type { SceneCart, SceneExpedition, SceneVillage } from '../village-view';
import {
  CART_TURN_M,
  cartRoute,
  nearestOnRoute,
  shuttleRoute,
  type CartCaravan,
  type CartParked,
  type CartPlan,
  type CartSpot,
} from './cart-layout';
import { caravanHead, caravanPlan, caravanTimeline, type DayWindow } from './caravan';
import { carpenterCartSpot, type CraftYardView } from './craft-yard-layout';
import type { PenLayout } from './pen-layout';
import { route as walkRoute } from './villager-motion';

/** Vůz stojí u boční stěny ohrady venku – od plotu (m) a rozestup víc vozů vedle sebe (m). */
const PARKED_M = { fromFence: 2.3, apart: 2.6, back: 1.5 } as const;

/**
 * Rozdělané vozy u tesařů (villagers.md – Fáze činností, Tesař): před dílnou (`CARPENTER_CART`)
 * stojí vůz po fázích stavby z dvora dílny (`SceneCraftYard.cart` – roste se dny výroby). Bez id
 * – vůz ještě není vozem vsi.
 */
export function buildingCartPlans(yards: readonly CraftYardView[]): CartParked[] {
  return yards.flatMap((view): CartParked[] => {
    const cart = view.craft === 'carpenter' ? view.yard?.cart : undefined;
    return cart ? [{ kind: cart.kind, parked: carpenterCartSpot(view), build: cart.stage }] : [];
  });
}

/** Vozy, které dnes jedou (mají úlohu i trasu) – dvoukolák táhne vůl, čtyřkolák pár. */
export function drivingCarts(village: Pick<SceneVillage, 'carts'>): SceneCart[] {
  return (village.carts ?? []).filter((c) => c.job !== null && (c.route?.length ?? 0) >= 2);
}

/**
 * Voli dne (oxen.md – Voli se sdílí, wagons.md – Vůz): kolik vozů jede a kolik volů je táhne
 * (dvoukolák jeden, čtyřkolák dva – DRAFT_OXEN), a kolik párů smí orat – jen z volů, kteří nejedou
 * s vozem (`ploughTeams` = kolik párů s rádlem scéna k orbě má; vycvičení voli ohrad, bez údaje –
 * ukázky – pár za každé dva voly vozu). Jádro ve dny orby dává vozům jen voly, kteří neorají;
 * scéna to respektuje, i když by data nesouhlasila – vůl není zároveň u vozu a u rádla.
 */
export function draftTeamsToday(
  village: Pick<SceneVillage, 'carts' | 'pens'>,
  ploughTeams: number,
): { carts: number; cartOxen: number; plough: number } {
  const driving = drivingCarts(village);
  const cartOxen = driving.reduce((sum, c) => sum + DRAFT_OXEN[c.kind], 0);
  const trained = (village.pens ?? []).reduce((sum, p) => sum + p.oxen, 0);
  const free =
    trained > 0
      ? Math.floor(Math.max(0, trained - cartOxen) / DRAFT_OXEN.ard)
      : Math.max(0, ploughTeams - Math.ceil(cartOxen / DRAFT_OXEN.ard));
  return { carts: driving.length, cartOxen, plough: Math.min(ploughTeams, free) };
}

/**
 * Kde stojí vůz bez jízdy (`index` – kolikátý u téže ohrady): venku u boční stěny ohrady na
 * straně bez přístřešku, ojí ke vsi (strana branky), víc vozů vedle sebe dál od plotu.
 */
export function parkedCartSpot(
  layout: Pick<PenLayout, 'square' | 'front' | 'side'>,
  index: number,
): CartSpot {
  const { square, front, side } = layout;
  const out = square.size / 2 + PARKED_M.fromFence + index * PARKED_M.apart;
  return {
    x: square.x - side.x * out - front.x * PARKED_M.back,
    z: square.z - side.z * out - front.z * PARKED_M.back,
    hx: front.x,
    hz: front.z,
  };
}

/**
 * Co vozy vsi dnes ve scéně dělají (`CartPlan` pro cart-renderer.ts): vůz s úlohou a trasou jede
 * tam a zpět (`shuttleRoute` – smyčky obratišť za cílem a u ohrady), náklad podle úlohy (snopy,
 * seno, klády a uhlí zpátky, osivo tam, sudy na vodu tam i zpět, zboží výpravy tam i zpět) dokola
 * tempem volů ve skutečném čase; vůz výpravy jede v karavaně (caravan.ts).
 * Víc vozů na téže trase jede za sebou. Vůz bez jízdy stojí u ohrady (nejbližší hotové), bez
 * ohrady se nekreslí.
 */
export function villageCartPlans(
  village: Pick<SceneVillage, 'carts' | 'expeditions' | 'trails'>,
  pens: readonly { id: number; layout: PenLayout }[],
  dayWindow: (day: number) => DayWindow | null = () => null,
  walkable?: (x: number, z: number) => boolean,
): CartPlan[] {
  const carts = village.carts ?? [];
  const driving = new Set(drivingCarts(village).map((c) => c.id));
  // vozy na téže trase – pořadí a počet (posun fáze)
  const sameRoute = new Map<string, number[]>();
  for (const cart of carts) {
    if (!driving.has(cart.id)) continue;
    const key = JSON.stringify(cart.route);
    sameRoute.set(key, [...(sameRoute.get(key) ?? []), cart.id]);
  }
  const parkedAt = new Map<number, number>();
  const plans: CartPlan[] = [];
  for (const cart of carts) {
    const job = cart.job;
    // vůz výpravy jede v karavaně podle postupu výpravy (trade.md – Ve scéně, caravan.ts)
    const expedition =
      job?.activity === 'trade'
        ? village.expeditions?.find((e) => e.carts.includes(cart.id))
        : undefined;
    const caravan =
      expedition && driving.has(cart.id)
        ? caravanCartPlan(
            village,
            cart,
            expedition,
            dayWindow(expedition.startDay ?? expedition.day),
          )
        : null;
    if (caravan) {
      plans.push(caravan);
      continue;
    }
    if (job && driving.has(cart.id)) {
      const group = sameRoute.get(JSON.stringify(cart.route))!;
      plans.push({
        id: cart.id,
        kind: cart.kind,
        cargo: job.load,
        // svoz snopů s hotovým humnem – plný k humnu, odtud k ohradě (SceneCart.viaRoute)
        shuttle: shuttleRoute(cart.route!, cart.kind, walkable, cart.viaRoute),
        // všechny vozy – i svoz úrody, sena a klád – jezdí tempem volů ve skutečném čase jako
        // provoz na cestách (villagers.md – Činnosti od začátku do konce): voli ani vozka
        // nejdou časosběrem, za herní den se stihne, kolik se stihne
        schedule: { phase: group.indexOf(cart.id) / group.length },
        // sudy na vodu jsou na voze tam (prázdné) i zpět (plné) – wagons.md, Co vozy vozí
        ...(job.activity === 'trade' || job.load === 'water' ? { loadedBothWays: true } : {}),
        ...(job.outbound ? { loadedOut: true } : {}),
      });
      continue;
    }
    const pen = nearestPen(pens, cart);
    if (!pen) continue;
    const index = parkedAt.get(pen.id) ?? 0;
    parkedAt.set(pen.id, index + 1);
    plans.push({ id: cart.id, kind: cart.kind, parked: parkedCartSpot(pen.layout, index) });
  }
  return plans;
}

/**
 * Vůz v karavaně výpravy (caravan.ts): jede od ohrady na začátek zemské stezky a po ní v čele
 * karavany (vozy za sebou po CARAVAN_GAP_M.cart), za krajem mapy zmizí a za dny výpravy se vrátí
 * po stezce a k ohradě (trasa zpět je obrácená – voli jdou vpřed). Bez stezky null.
 */
export function caravanCartPlan(
  village: Pick<SceneVillage, 'trails'>,
  cart: SceneCart,
  e: SceneExpedition,
  window: DayWindow | null,
): CartCaravan | null {
  const trail = e.trailId === null ? null : village.trails?.find((t) => t.id === e.trailId);
  if (!trail || trail.points.length < 2 || !cart.route || cart.route.length < 2) return null;
  const L = walkRoute(trail.points.map((p) => [p.x, p.z] as const)).length;
  const radius = CART_TURN_M[cart.kind];
  const out = cartRoute(cart.route, { closed: false, turnRadius: radius });
  const back = cartRoute([...cart.route].reverse(), { closed: false, turnRadius: radius });
  // kde na trase vozu začíná stezka (před ní jede od ohrady)
  const start = nearestOnRoute(out, trail.points[0]!);
  const plan = caravanPlan(e);
  const columns = { out: plan.out.length, back: plan.back.length };
  const k = Math.max(0, e.carts.indexOf(cart.id));
  // ve skutečném čase od dne, kdy cesta začala (caravan.ts) – bez okna se nekreslí
  if (!window) return null;
  const timeline = caravanTimeline(e, window, L, columns);
  return {
    id: cart.id,
    kind: cart.kind,
    cargo: 'goods',
    routes: { out, back },
    at: (nowMs) => {
      const head = caravanHead(timeline, nowMs, L, columns);
      if (head.leg === 'away') return { leg: 'back', s: 0, speed: 0, visible: false };
      // doma – stojí na konci cesty zpět u ohrady
      if (head.leg === 'done') return { leg: 'back', s: back.length, speed: 0, visible: true };
      const behind = plan[head.leg].carts[k] ?? 0;
      const onTrail = head.leg === 'out' ? head.head - behind : head.head + behind;
      const s = Math.min(out.length, Math.max(0, start + onTrail));
      const moving = head.speed > 0 && s > 0 && s < out.length;
      return {
        leg: head.leg,
        s: head.leg === 'out' ? s : Math.max(0, back.length - s),
        speed: moving ? head.speed : 0,
        visible: onTrail <= L,
      };
    },
  };
}

function nearestPen(
  pens: readonly { id: number; layout: PenLayout }[],
  at: { x: number; z: number },
): { id: number; layout: PenLayout } | null {
  let best: { id: number; layout: PenLayout } | null = null;
  let bestD = Infinity;
  for (const pen of pens) {
    const d = Math.hypot(pen.layout.square.x - at.x, pen.layout.square.z - at.z);
    if (d < bestD) {
      best = pen;
      bestD = d;
    }
  }
  return best;
}
