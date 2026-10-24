// Pohřeb, svatba a karavany výprav jako postavy mimo rozpočet pracujících.
import { AGE, type Sex } from '@bohemia/game';
import type { SceneExpedition, SceneVillage } from '../village-view';
import {
  caravanHead,
  caravanPlan,
  caravanProgress,
  caravanPoints,
  memberSpot,
  waitingOffset,
  type CaravanMember,
  type DayWindow,
} from './caravan';
import { funeralActiveIn, funeralPlan, funeralPose, type FuneralPlan } from './funeral-plan';
import {
  BRIDE_CLOTH,
  weddingActiveIn,
  weddingCloth,
  weddingLookRoll,
  weddingMembersIn,
  weddingPlan,
  weddingPose,
  type WeddingPlan,
} from './wedding-plan';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import { alongRoute, route, walkSpeed, type PoseFn, type VillagerClip } from './villager-motion';
import type { ScenePerson } from '../person-view';
import { ADULTS } from './villager-roster';
import {
  FIGURE_SCALE,
  HOUSE_MARGIN_M,
  WOMEN,
  type Context,
  type HairLook,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPlanOptions,
} from './villager-plan-types';
import { inBox, trafficDoor, unit, walkRoute } from './villager-plan-geometry';
import { STRANGER, adultHair, cast, context, figure } from './villager-plan-cast';

/** Nejvýš tolik postav všech pohřbů dne (víc pohřbů naráz – nejnovější napřed). */
export const MAX_FUNERAL_FIGURES_TOTAL = 60;

/**
 * Pohřby, jejichž lidé jsou vidět během dne `window` – nejnovější napřed, dokud se jejich lidé
 * vejdou do MAX_FUNERAL_FIGURES_TOTAL (hranice ostatních kreslí ves dál).
 */
export function activeFunerals(
  plans: readonly FuneralPlan[],
  window: DayWindow | null,
): FuneralPlan[] {
  let total = 0;
  return [...plans]
    .filter((plan) => funeralActiveIn(plan, window))
    .sort((a, b) => b.timeline.startMs - a.timeline.startMs)
    .filter((plan) => {
      if (total + plan.members.length > MAX_FUNERAL_FIGURES_TOTAL) return false;
      total += plan.members.length;
      return true;
    });
}

/**
 * Pohřby vsi pro scénu (cemetery.md – Pohřeb ve scéně, funeral-plan.ts): průvod vychází od
 * vchodu domu zemřelého (volné místo před vchodem jako provoz na cestách) po pěšinách; lidé
 * stojí na schůdné zemi mimo domy a pozemky. Bez pohřbů, obydlí nebo hodin světa nic.
 */
export function planFunerals(
  village: SceneVillage,
  ground: VillagerGround,
  options: Pick<VillagerPlanOptions, 'seed' | 'paths' | 'dayWindow'>,
): FuneralPlan[] {
  const funerals = village.funerals ?? [];
  const dayWindow = options.dayWindow;
  if (funerals.length === 0 || village.dwellings.length === 0 || !dayWindow) return [];
  const ctx = context(village, ground, options.seed, 0, options.paths ?? null);
  // obydlí jsou v seznamu staveb první (pak milíře, modly a ohrady – id se mohou krýt)
  const dwellings = ctx.houses.slice(0, village.dwellings.length);
  return funerals.flatMap((funeral) => {
    const plan = funeralPlan(funeral, village, {
      dayWindow,
      door: (id) => {
        const house = dwellings.find((h) => h.id === id);
        return house ? trafficDoor(ctx, house) : null;
      },
      // úseky bez trasy obcházejí domy i ploty ohrad (lidé nesmí chodit přes ohrady)
      route: (a, b) => walkRoute(ctx, a, b)?.points ?? null,
      standable: (x, z) =>
        ctx.ground.walkable(x, z) && !ctx.houses.some((h) => inBox(h, x, z, HOUSE_MARGIN_M)),
      figureScale: FIGURE_SCALE,
    });
    return plan ? [plan] : [];
  });
}

/**
 * Lidé pohřbu (funeral-plan.ts): nosiči jsou muži, ostatní podle pohlaví a věku z jádra – ženy
 * v šátcích jako jinde, starší s šedinami.
 */
export function funeralFigures(ctx: Context, plan: FuneralPlan): PlannedVillager[] {
  return plan.members.flatMap((member, index) => {
    // za márami jdou skuteční lidé (id z jádra), máry nesou muži vsi
    const c = cast(
      ctx,
      `funeral:${plan.key}:${member.key}`,
      { women: member.sex === 'female' ? 1 : 0, child: member.child },
      () =>
        member.person !== undefined
          ? ctx.roster!.takeId(member.person)
          : member.bearer
            ? (ctx.roster!.take({ ...ADULTS, onlySex: 'male' }) ??
              ctx.roster!.take({ from: AGE.adult, to: Infinity, onlySex: 'male' }))
            : null,
    );
    if (!c) return [];
    const hair: HairLook = member.elder
      ? 'grey'
      : member.child
        ? 'natural'
        : adultHair(c.who, ctx.sexes.married);
    const pose = funeralPose(plan, index, c.who.kind, c.who.scale);
    return [figure(c, pose, hair, { kind: 'funeral', bearer: member.bearer })];
  });
}

/** Klip člena karavany na cestě: nosič se zbožím nese, ostatní jdou. */
export function caravanClip(member: CaravanMember): VillagerClip {
  return member.loaded ? 'carry' : 'walk';
}

/**
 * Karavana výpravy k sousedovi (trade.md – Ve scéně, caravan.ts): jedna skupina po zemské
 * stezce podle postupu výpravy v herním čase – tam nosiči se zbožím (s vozy jen pomocníci, náklad
 * veze vůz – kreslí village-carts.ts) a lidé, kteří odcházejí k sousedovi; za krajem mapy zmizí
 * a za dny výpravy se objeví na cestě zpátky – nosiči a lidé od souseda (pohlaví a věk z jádra).
 * Před odchodem a po návratu stojí v hloučku u začátku stezky; výjimečně (ves bez dospělých) stojí
 * na cestě.
 */
export function caravanFigures(
  ctx: Context,
  e: SceneExpedition,
  window: DayWindow | null,
): PlannedVillager[] {
  // po zemské stezce, nákup u souseda bez stezky po čáře krajinou (crafts.md)
  const points = caravanPoints(e, ctx.village.trails);
  if (points.length < 2) return [];
  const path = route(points.map((p) => [p.x, p.z] as const));
  const L = path.length;
  const plan = caravanPlan(e);
  const columns = { out: plan.out.length, back: plan.back.length };
  const daySeconds = window ? Math.max(1, (window.endMs - window.startMs) / 1000) : 86;
  const [x0, z0] = [points[0]!.x, points[0]!.z];
  const first = unit(points[1]!.x - x0, points[1]!.z - z0);
  const out: PlannedVillager[] = [];
  // kdo jde (villagers.md – Výběr postavy): nosiči a pomocníci u vozů jsou dospělí vsi, tam
  // i zpátky tíž; u kování tesař nebo syn (`trip.travellerId`) – s vozem pomocník u vozu; lidé,
  // kteří se stěhují k sousedovi nebo od něj přicházejí, nejsou lidé vsi (nejdou vybrat)
  const trip = e.trip ?? null;
  const traveller = trip?.kind === 'iron' ? (trip.travellerId ?? null) : null;
  const walkers = new Map<string, ScenePerson | null>();
  const walker = (role: string, slot: string, sex: Sex): ScenePerson | null => {
    const roster = ctx.roster!;
    const id =
      traveller !== null &&
      (role === 'leaving' || role === 'coming' || (role === 'helper' && slot === 'helper:0:0'))
        ? 'traveller'
        : slot;
    if (walkers.has(id)) return walkers.get(id)!;
    const person = id === 'traveller' ? roster.takeId(traveller!) : roster.take({ ...ADULTS, sex });
    walkers.set(id, person);
    return person;
  };
  for (const leg of ['out', 'back'] as const) {
    plan[leg].members.forEach((member, index) => {
      const key = `caravan:${e.id}:${member.key}`;
      const person = member.sex !== null;
      const child = person && (member.age ?? 30) < 14;
      const [, role = '', ...rest] = member.key.split(':');
      const slot = [role, ...rest].join(':');
      const stranger = person && traveller === null;
      const c = cast(
        ctx,
        key,
        { women: person ? (member.sex === 'female' ? 1 : 0) : WOMEN.trade, child },
        stranger ? STRANGER : (sex) => walker(role, slot, sex),
      );
      if (!c) return;
      const who = c.who;
      const hair: HairLook =
        (member.age ?? 0) >= 45 ? 'grey' : child ? 'natural' : adultHair(who, ctx.sexes.married);
      const clip = caravanClip(member);
      const base = walkSpeed(who.kind, clip, who.scale);
      const pose: PoseFn = (t, _herds, o) => {
        const nowMs = t * 1000 + LIVESTOCK_EPOCH_MS;
        const head = caravanHead(e, caravanProgress(e, window, nowMs), L, columns);
        o.hidden = head.leg !== leg;
        if (o.hidden) {
          o.x = x0;
          o.z = z0;
          o.clip = 'idle';
          o.pace = 1;
          return o;
        }
        const spot = memberSpot(head, member.behind, L, index);
        o.hidden = !spot.visible;
        if (spot.waiting !== null) {
          const w = waitingOffset(spot.waiting);
          o.x = x0 - first.x * w.back - first.z * w.side;
          o.z = z0 - first.z * w.back + first.x * w.side;
          o.headingX = first.x;
          o.headingZ = first.z;
          o.clip = 'idle';
          o.pace = 1;
          o.stage = 'wait';
          return o;
        }
        alongRoute(path, spot.s, leg === 'back', o);
        // vedle osy (pomocník u vozu) – vlevo od směru chůze
        o.x -= o.headingZ * member.side;
        o.z += o.headingX * member.side;
        const speed = head.perDay / daySeconds;
        o.clip = speed > 0 ? clip : 'idle';
        o.pace = speed > 0 ? Math.min(3, Math.max(0.6, speed / Math.max(0.1, base))) : 1;
        o.stage = leg;
        return o;
      };
      out.push(
        figure(c, pose, hair, {
          kind: 'caravan',
          trip,
          porter: c.person?.id !== traveller,
        }),
      );
    });
  }
  return out;
}

/** Nejvýš tolik postav všech svateb dne (víc svateb naráz – nejnovější napřed). */
export const MAX_WEDDING_FIGURES_TOTAL = 60;

/**
 * Svatby, jejichž lidé jsou vidět během dne `window` – nejnovější napřed, dokud se jejich lidé
 * vejdou do MAX_WEDDING_FIGURES_TOTAL.
 */
export function activeWeddings(
  plans: readonly WeddingPlan[],
  window: DayWindow | null,
): WeddingPlan[] {
  let total = 0;
  return [...plans]
    .filter((plan) => weddingActiveIn(plan, window))
    .sort((a, b) => b.timeline.startMs - a.timeline.startMs)
    .filter((plan) => {
      if (total + plan.members.length > MAX_WEDDING_FIGURES_TOTAL) return false;
      total += plan.members.length;
      return true;
    });
}

/**
 * Svatby vsi pro scénu (kinship.md – Svatba ve scéně, wedding-plan.ts): průvod vychází od vchodu
 * domu nevěsty (volné místo před vchodem jako provoz na cestách) po pěšinách; lidé stojí na
 * schůdné zemi mimo domy a pozemky (modla a svatyně se nepočítají – okolí hlídá místo obřadu).
 * Bez svateb, obydlí nebo hodin světa nic.
 */
export function planWeddings(
  village: SceneVillage,
  ground: VillagerGround,
  options: Pick<VillagerPlanOptions, 'seed' | 'paths' | 'dayWindow'>,
): WeddingPlan[] {
  const weddings = village.weddings ?? [];
  const dayWindow = options.dayWindow;
  if (weddings.length === 0 || village.dwellings.length === 0 || !dayWindow) return [];
  const ctx = context(village, ground, options.seed, 0, options.paths ?? null);
  // obydlí jsou v seznamu staveb první (pak milíře, modly a ohrady – id se mohou krýt)
  const dwellings = ctx.houses.slice(0, village.dwellings.length);
  const sacred = new Set((village.sacred?.buildings ?? []).map((b) => b.position));
  const blocking = ctx.houses.filter((h) => !sacred.has(h.position));
  return weddings.flatMap((wedding) => {
    const plan = weddingPlan(wedding, village, {
      dayWindow,
      door: (id) => {
        const house = dwellings.find((h) => h.id === id);
        return house ? trafficDoor(ctx, house) : null;
      },
      // úseky bez trasy obcházejí domy i ploty ohrad (lidé nesmí chodit přes ohrady)
      route: (a, b) => walkRoute(ctx, a, b)?.points ?? null,
      standable: (x, z) =>
        ctx.ground.walkable(x, z) && !blocking.some((h) => inBox(h, x, z, HOUSE_MARGIN_M)),
      figureScale: FIGURE_SCALE,
      seed: options.seed,
    });
    return plan ? [plan] : [];
  });
}

/**
 * Lidé svatby (wedding-plan.ts): nevěsta s věncem v běleném lnu, ostatní pestřeji oblečení
 * (barva instance), podle pohlaví a věku z jádra – vdané ženy v šátcích, starší s šedinami.
 */
export function weddingFigures(
  ctx: Context,
  plan: WeddingPlan,
  window: DayWindow | null,
): PlannedVillager[] {
  const shown = new Set(weddingMembersIn(plan, window));
  return plan.members.flatMap((member, index) => {
    // jen kdo je dnes vidět – ve dny cesty lidí z okolí jsou svatebčané ze vsi u své práce
    if (!shown.has(index)) return [];
    const key = `wedding:${plan.key}:${member.key}`;
    const look = { women: member.sex === 'female' ? 1 : 0, child: member.child };
    const spouse = member.role === 'bride' || member.role === 'groom';
    // svatebčan je člověk vsi (id z jádra); lidé z okolí ne – postava je, vybrat nejde; pár se
    // ukáže vždy (i když ho starší zápis nezná)
    const c =
      (member.person !== undefined && member.role !== 'companion'
        ? cast(ctx, key, look, () => ctx.roster!.takeId(member.person!))
        : null) ?? (spouse || member.person === undefined ? cast(ctx, key, look, STRANGER) : null);
    if (!c) return [];
    const hair: HairLook = member.elder
      ? 'grey'
      : member.child
        ? 'natural'
        : adultHair(c.who, ctx.sexes.married);
    const pose = weddingPose(plan, index, c.who.kind, c.who.scale);
    const role = member.role === 'bride' || member.role === 'groom' ? member.role : 'guest';
    const out = figure(c, pose, hair, { kind: 'wedding', role });
    // nevěsta s věncem v běleném lnu, svatebčané pestřeji
    const cloth =
      member.role === 'bride' ? BRIDE_CLOTH : weddingCloth(weddingLookRoll(plan, index));
    return [{ ...out, look: { cloth, hair: member.role === 'bride' ? 'wreath' : out.look.hair } }];
  });
}
