// Co dělá vybrané spřežení s rádlem, vůz a lidé u nich – krátké věty do panelu výběru
// (villagers.md – Výběr postavy; oxen.md – Výběr spřežení, wagons.md – Výběr vozu; Martin
// 20. 10. 2026: „nešlo mi kliknout na volské spřežení ani na člověka, co jej vedl“). Ze stavu,
// který hlásí scéna (plough-team-renderer.ts, cart-renderer.ts), a dat vsi ve scéně. Čistý modul.
import { DRAFT_OXEN } from '@bohemia/game';
import type { CartLeg } from './scene/cart-layout';
import type { TeamActivity } from './scene/draft-state';
import type { PersonJob } from './scene/villager-roster';
import type { SceneCart, SceneVillage } from './village-view';

/**
 * Stav vybraného spřežení nebo vozu ve scéně (hlásí ho scéna jen při změně): spřežení – pořadí
 * dne, co dělá, oráč a honák (id lidí; nikdo – null); vůz – id, kde v jízdě je, jestli veze
 * náklad, jestli je vidět, a vozka.
 */
export type DraftFigureState =
  | {
      kind: 'team';
      team: number;
      activity: TeamActivity;
      ploughman: number | null;
      leader: number | null;
    }
  | {
      kind: 'cart';
      cart: number;
      leg: CartLeg;
      loaded: boolean;
      hidden: boolean;
      drover: number | null;
    };

/** Stejný stav (změnu scéna hlásí, jen když se liší)? */
export function sameDraftState(a: DraftFigureState | null, b: DraftFigureState | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Co dělá spřežení (panel spřežení). */
export function teamActivityText(activity: TeamActivity): string {
  switch (activity.kind) {
    case 'plough':
      return 'orá díl pole';
    case 'to-field':
      return 'jde na pole';
    case 'between':
      return 'přechází na další díl';
    case 'to-pen':
      return 'vrací se do ohrady';
    case 'done':
      return activity.atPen ? 'stojí v ohradě' : 'stojí na poli';
  }
}

/** Oráč a honák podle toho, co spřežení dělá (bez stavu spřežení jen „orá“ a „vede spřežení“). */
function ploughCrewText(role: 'ploughman' | 'leader', activity: TeamActivity | null): string {
  switch (activity?.kind) {
    case 'to-field':
      return 'vede spřežení na pole';
    case 'between':
      return role === 'ploughman' ? 'přechází s rádlem na další díl' : 'vede spřežení na další díl';
    case 'to-pen':
      return 'vede spřežení do ohrady';
    case 'done':
      return activity.atPen ? 'je se spřežením u ohrady' : 'odpočívá u spřežení';
    default:
      return role === 'ploughman' ? 'orá' : 'vede spřežení';
  }
}

/** Co vůz veze (wagons.md – Co vozy vozí) – podle úlohy dne. */
export type CartGoal =
  'sheaves' | 'hay' | 'logs' | 'charcoal' | 'ore' | 'clay' | 'water' | 'seed' | 'apples' | 'goods';

/** Věty jízdy tam a zpět: k cíli, u cíle, zpátky, u ohrady. */
const CART_TEXTS: Record<CartGoal, readonly [string, string, string, string]> = {
  sheaves: ['jede pro snopy', 'nakládá snopy', 'veze snopy', 'skládá snopy'],
  hay: ['jede pro seno', 'nakládá seno', 'veze seno', 'skládá seno'],
  logs: ['jede pro klády', 'nakládá klády', 'veze klády ke stavbě', 'skládá klády'],
  charcoal: ['jede pro uhlí k milíři', 'nakládá uhlí', 'veze uhlí ke kováři', 'skládá uhlí'],
  ore: ['jede pro rudu', 'nakládá rudu', 'veze rudu do kovárny', 'skládá rudu'],
  clay: ['jede pro hlínu', 'nakládá hlínu', 'veze hlínu hrnčíři', 'skládá hlínu'],
  water: ['jede pro vodu', 'nabírá vodu', 'veze vodu', 'rozdává vodu'],
  seed: ['veze osivo na pole', 'skládá osivo', 'vrací se z pole', 'nakládá osivo'],
  apples: ['jede pro jablka', 'nakládá jablka', 'veze jablka', 'skládá jablka'],
  goods: ['jede pro náklad', 'nakládá', 'veze náklad', 'skládá náklad'],
};

/** Co vůz dnes veze (`SceneCart.job`) – zboží výpravy je `goods`. */
export function cartGoal(job: NonNullable<SceneCart['job']>): CartGoal {
  if (job.target.kind === 'kiln') return 'charcoal';
  if (job.outbound) return 'seed';
  switch (job.load) {
    case 'goods':
      return 'goods';
    default:
      return job.load;
  }
}

/**
 * Co dělá vůz (i jeho vozka): stojí u ohrady, jede pro náklad / nakládá / veze ho / skládá
 * (snopy, seno, klády, uhlí ke kováři, rudu, hlínu, vodu, osivo, jablka), u výpravy veze zboží do
 * sousední vsi, vrací se a za krajem mapy je pryč.
 */
export function cartActivityText(
  village: Pick<SceneVillage, 'carts' | 'expeditions'>,
  cartId: number,
  leg: CartLeg | null,
): string {
  const cart = village.carts?.find((c) => c.id === cartId);
  const job = cart?.job ?? null;
  if (!job || leg === 'parked') return 'stojí u ohrady';
  if (job.activity === 'trade') {
    const to = village.expeditions?.find((e) => e.carts.includes(cartId))?.trip?.to ?? null;
    switch (leg) {
      case 'away':
        return to ? `pryč – ve vesnici ${to}` : 'pryč – u sousedů';
      case 'back':
        return to ? `vrací se z vesnice ${to}` : 'vrací se od sousedů';
      case 'load':
        return 'nakládá zboží';
      case 'unload':
        return 'skládá zboží';
      default:
        return to ? `veze zboží do vesnice ${to}` : 'veze zboží k sousedům';
    }
  }
  const [out, load, back, unload] = CART_TEXTS[cartGoal(job)];
  switch (leg) {
    case 'load':
      return load;
    case 'back':
      return back;
    case 'unload':
      return unload;
    case 'loop':
    case 'away':
    case 'out':
    case null:
      return out;
  }
}

/**
 * Co dělá oráč, honák nebo vozka (`job` z villager-roster.ts) – podle stavu vybraného spřežení
 * či vozu (`draft`, jen když patří k tomuto spřežení či vozu); jiná úloha null.
 */
export function crewActivityText(
  job: PersonJob,
  draft: DraftFigureState | null,
  village: Pick<SceneVillage, 'carts' | 'expeditions'>,
): string | null {
  if (job.kind === 'plough') {
    const own = draft?.kind === 'team' && draft.team === job.team ? draft.activity : null;
    return ploughCrewText(job.role, own);
  }
  if (job.kind === 'cart') {
    const own = draft?.kind === 'cart' && draft.cart === job.cart ? draft.leg : null;
    return cartActivityText(village, job.cart, own);
  }
  return null;
}

/**
 * Ohrada, ze které jsou voli spřežení `team` (oxen.md – Ohrady podle druhu): voli venku patří
 * ohradám v pořadí id jako ve scéně (village-pens.ts – `penHerds`) – napřed vozy, které dnes
 * jedou (vůl z ohrady vozu), pak páry spřežení po řadě. Žádná – null.
 */
export function teamPen(
  village: Pick<SceneVillage, 'pens' | 'carts'>,
  team: number,
): number | null {
  const pens = [...(village.pens ?? [])].filter((p) => p.oxen > 0).sort((a, b) => a.id - b.id);
  const left = new Map(pens.map((p) => [p.id, p.oxen]));
  // vozy, které dnes jedou (village-carts.ts – `drivingCarts`)
  const driving = (village.carts ?? []).filter(
    (c) => c.job !== null && (c.route?.length ?? 0) >= 2,
  );
  for (const cart of driving) {
    const pen = cartPen(village, cart.id);
    if (pen !== null) left.set(pen, Math.max(0, (left.get(pen) ?? 0) - DRAFT_OXEN[cart.kind]));
  }
  let k = 0;
  for (const pen of pens) {
    let oxen = left.get(pen.id) ?? 0;
    while (oxen >= DRAFT_OXEN.ard) {
      if (k === team) return pen.id;
      k++;
      oxen -= DRAFT_OXEN.ard;
    }
  }
  return pens[0]?.id ?? null;
}

/** Ohrada vozu – vůz stojí u ohrady se spřežením (`SceneCart.x`, `z` = její střed). */
export function cartPen(
  village: Pick<SceneVillage, 'pens' | 'carts'>,
  cartId: number,
): number | null {
  const cart = village.carts?.find((c) => c.id === cartId);
  if (!cart) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (const pen of village.pens ?? []) {
    const d = Math.hypot(pen.x - cart.x, pen.z - cart.z);
    if (d < bestD) {
      best = pen.id;
      bestD = d;
    }
  }
  return best;
}
