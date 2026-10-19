// Vozy ve vsi bez Babylonu (docs/design/wagons.md – fáze 3): z dat vsi pro scénu
// (`SceneVillage.carts` – vůz, úloha dne, náklad a trasa od herního jádra), co který vůz dnes dělá
// ve scéně – jede tam a zpět po trase dne (svoz: prázdný k poli, louce nebo stromům, plný zpátky;
// výprava: po zemské stezce ke kraji mapy a zpět, naložený), nebo stojí u ohrady bez volů – a kolik
// spřežení dnes táhne vůz a kolik orá (voli nejsou zároveň u vozu, u rádla a v ohradě). Kreslí
// village-renderer.ts (cart-renderer.ts, plough-team-renderer.ts, pen-animals.ts).
import { CARTS } from '@bohemia/game';
import type { SceneCart, SceneVillage } from '../village-view';
import { shuttleRoute, type CartPlan, type CartSpot } from './cart-layout';
import type { PenLayout } from './pen-layout';

/** Vůz stojí u boční stěny ohrady venku – od plotu (m) a rozestup víc vozů vedle sebe (m). */
const PARKED_M = { fromFence: 2.3, apart: 2.6, back: 1.5 } as const;

/** Vozy, které dnes jedou (mají úlohu i trasu) – každý táhne jedno spřežení. */
export function drivingCarts(village: Pick<SceneVillage, 'carts'>): SceneCart[] {
  return (village.carts ?? []).filter((c) => c.job !== null && (c.route?.length ?? 0) >= 2);
}

/**
 * Spřežení dne (wagons.md – Vůz: ve dny orby orají, jinak vozí): kolik jich táhne vůz a kolik
 * jich smí orat – orba dostane jen spřežení, která nejedou s vozem (`ploughTeams` = kolik jich
 * scéna k orbě má). Jádro vozí jen se spřežením, které ten den neorá; scéna to respektuje, i když
 * by data nesouhlasila – voli nejsou zároveň u vozu a u rádla.
 */
export function draftTeamsToday(
  village: Pick<SceneVillage, 'carts'>,
  ploughTeams: number,
): { carts: number; plough: number } {
  const carts = drivingCarts(village).length;
  return { carts, plough: Math.max(0, ploughTeams - carts) };
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
 * seno, klády zpátky, zboží výpravy tam i zpět); svoz v okně herního dne `window` (ladicí – jízdy
 * dne se vejdou do herního dne, PLOUGH_DAY_DEBUG), výprava dokola tempem volů jako nosiči.
 * Víc vozů na téže trase jede za sebou. Vůz bez jízdy stojí u ohrady (nejbližší hotové), bez
 * ohrady se nekreslí.
 */
export function villageCartPlans(
  village: Pick<SceneVillage, 'carts'>,
  pens: readonly { id: number; layout: PenLayout }[],
  window: { startMs: number; endMs: number } | null,
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
    if (job && driving.has(cart.id)) {
      const group = sameRoute.get(JSON.stringify(cart.route))!;
      plans.push({
        kind: cart.kind,
        cargo: job.load,
        shuttle: shuttleRoute(cart.route!, cart.kind),
        schedule: {
          window: job.activity === 'haul' ? window : null,
          maxTrips: CARTS.loadsPerCartDay,
          phase: group.indexOf(cart.id) / group.length,
        },
        ...(job.activity === 'trade' ? { loadedBothWays: true } : {}),
      });
      continue;
    }
    const pen = nearestPen(pens, cart);
    if (!pen) continue;
    const index = parkedAt.get(pen.id) ?? 0;
    parkedAt.set(pen.id, index + 1);
    plans.push({ kind: cart.kind, parked: parkedCartSpot(pen.layout, index) });
  }
  return plans;
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
