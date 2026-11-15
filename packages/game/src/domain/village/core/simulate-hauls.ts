// Svoz a jízdy vozů – svoz úrody, sena a klád, úlohy vozů (uhlí, ruda, hlína, voda, osivo).
import type { Landscape, ObstacleLayer } from '../../landscape';
import {
  CART_KINDS,
  addHaulTrips,
  cartOrigin,
  cropCartReach,
  fellingHaulable,
  fleetCarts,
  fleetHaulPlan,
  haulAvailable,
  haulPlan,
  logsCartReach,
  mowingCartReach,
  orchardCartReach,
  sowingCartReach,
  takeCart,
  type CartAccess,
  type CartFleet,
  type HaulPlan,
} from '../crafts/carts';
import {
  kilnCartDrive,
  kilnCartOffer,
  oreCartDrive,
  oreCartOffer,
  stoneCartDrive,
  stoneCartOffer,
  waterCartDrive,
  waterCartPlan,
  type CartDrives,
  type SmithCart,
  type WaterCartPlan,
} from '../crafts/cart-jobs';
import {
  basketManDaysPerKg,
  findKiln,
  dugBasketManDaysPerKg,
  occupiedSmiths,
  type CharcoalDelivery,
  type DugMaterial,
} from '../crafts/smith-supply';
import { occupiedWorkshops, type WorkshopDay } from '../crafts/crafts';
import { type HouseholdWater } from './labor';
import { type HaulWork } from './labor-report';
import { harvestCarryShare } from './productivity';
import { CARTS, CART_DEMAND, CART_JOBS, CHURCH_WORK_CRAFT, SMITH_SUPPLY, ORCHARD } from '../rules';
import type {
  CartKind,
  CartReach,
  CartTripLog,
  Construction,
  CraftCoverage,
  MasonCraft,
  Quarry,
  VillageState,
  WorkshopActivity,
} from '../types';
import { churchQuarryLeft, mastersPresent } from '../buildings/church-build';
import {
  constructionStoneBreak,
  constructionStoneCarry,
  constructionStoneWork,
  quarryBreakManDaysPerM3,
  stoneCarryManDaysPerM3,
  villageQuarries,
  type StoneCart,
} from '../fortification/state/quarry';
import { logArrivalPoint } from '../forest/log-piles';
import { woodFellingCost } from '../forest/wood';
import { constructionNeed, foundingIndex, invest } from './simulate-build';
import { DayTask, EPSILON } from './simulate-plan';

/**
 * Podíl práce úlohy, kam dojede čtyřkolák (ne na zoraný díl, širší oblouk), z té, kam dojede dvoukolák
 * (0–1; wagons.md – Co se vozí a na čem).
 */
export function roadShare(
  reach: Pick<CartReach, 'share'>,
  reach4: Pick<CartReach, 'share'> | null,
): number {
  if (!reach4 || reach.share <= 1e-9) return 0;
  return Math.min(1, reach4.share / reach.share);
}

/**
 * Svoz vozy na úlohy dne (wagons.md – Vůz; mutuje `tasks`, `hauls` a flotilu): vozy jedou na úlohy
 * v pořadí dne – odnos snopů (podíl odnosu na sklizni) a svoz sena (CARTS.haulShare.hay) tam, kam
 * dojedou; čtyřkoláky napřed podél pevných cest (`access4`), dvoukoláky na zbytek (`fleetHaulPlan`
 * – levnější vůz pro každou práci). Úloha pak chce o převzaté nošení méně práce a o honáky
 * a nakladače víc.
 */
export function planTaskHauls(
  state: VillageState,
  tasks: DayTask[],
  hauls: Map<DayTask, HaulPlan>,
  fleet: CartFleet,
  access: CartAccess,
  access4: CartAccess | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  const carry = harvestCarryShare(coverage.tools);
  for (const task of tasks) {
    const four = access4 ? fleetCarts(fleet, 'four-wheel') : 0;
    if (four + fleetCarts(fleet, 'two-wheel') <= 0) break;
    let available = 0;
    let road = 0;
    // kam vůz dojede, se spočítá při prvním svozu úlohy a uloží u ní (vozová síť – carts.ts)
    if (task.field?.name === 'harvest') {
      const work = task.field.work;
      work.cartReach ??= cropCartReach(state, work, landscape, access);
      const share = carry * work.cartReach.share;
      available = haulAvailable(work.required.harvest, task.remaining, work.hauled ?? 0, share);
      if (four > 0 && access4) {
        work.cartReach4 ??= cropCartReach(state, work, landscape, access4);
        road = available * roadShare(work.cartReach, work.cartReach4);
      }
    } else if (task.name === 'mow' && state.hay?.mowing) {
      const mowing = state.hay.mowing;
      mowing.cartReach ??= mowingCartReach(state, mowing, landscape, access);
      const share = CARTS.haulShare.hay * mowing.cartReach.share;
      available = haulAvailable(mowing.required, task.remaining, mowing.hauled ?? 0, share);
      if (four > 0 && access4) {
        mowing.cartReach4 ??= mowingCartReach(state, mowing, landscape, access4);
        road = available * roadShare(mowing.cartReach, mowing.cartReach4);
      }
    } else if (task.name === 'orchard-harvest' && state.orchardWork?.task === 'harvest') {
      // jablka ze sadu do vsi (orchard.md – Jablka vozem) – odnos v koších převezme vůz
      const apples = state.orchardWork;
      apples.cartReach ??= orchardCartReach(state, landscape, access);
      const share = ORCHARD.harvestCarryShare * apples.cartReach.share;
      available = haulAvailable(apples.required, task.remaining, apples.hauled ?? 0, share);
      if (four > 0 && access4) {
        apples.cartReach4 ??= orchardCartReach(state, landscape, access4);
        road = available * roadShare(apples.cartReach, apples.cartReach4);
      }
    } else {
      continue;
    }
    const haul = fleetHaulPlan(available, road, fleet);
    if (haul.carts === 0) continue;
    hauls.set(task, haul);
    task.remaining = task.remaining - haul.work + haul.crew;
  }
}

/**
 * Stavba, na kterou dnes vůz může vozit klády, a kolik dovozu smí převzít (čd) – z toho u stromů,
 * kam dojede čtyřkolák (`road`).
 */
export interface LogHaul {
  c: Construction;
  haulable: number;
  road: number;
}

/**
 * Stavby, na které dnes vozy můžou vozit klády (wagons.md – Vůz): CARTS.haulShare.logs
 * zbývajícího kácení a dovozu u stromů, ke kterým vůz dojede, v pořadí staveb; čtyřkolák ke
 * stromům, ke kterým dojede (`access4` – klády dlouhé, výhodnější čtyřkolákem). Dosah se spočítá
 * jednou za stavbu, při prvním svozu klád (mutuje – `ConstructionWood.cartReach`, `cartReach4`).
 */
export function logHaulCandidates(
  state: VillageState,
  day: number,
  access: CartAccess,
  access4: CartAccess | null,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): LogHaul[] {
  const founding = foundingIndex(state);
  return state.constructions.flatMap((c) => {
    if (!c.wood || c.done + 1e-9 >= woodFellingCost(c.wood)) return [];
    if (constructionNeed(state, c, day, founding) <= 0) return [];
    // ke kterým stromům vůz dojede – jednou za stavbu, při prvním svozu klád
    c.wood.cartReach ??= logsCartReach(state, c.wood, landscape, obstacles, access);
    const reach = fellingHaulable(c, c.wood.cartReach.trees);
    const haulable = haulAvailable(
      reach.total,
      reach.remaining,
      c.wood.hauled ?? 0,
      CARTS.haulShare.logs,
    );
    if (haulable <= 0) return [];
    let road = 0;
    if (access4) {
      c.wood.cartReach4 ??= logsCartReach(state, c.wood, landscape, obstacles, access4);
      const reach4 = fellingHaulable(c, c.wood.cartReach4.trees);
      road =
        reach.remaining > 1e-9 ? haulable * Math.min(1, reach4.remaining / reach.remaining) : 0;
    }
    return [{ c, haulable, road }];
  });
}

/** Svoz klád na stavby `candidates` z flotily (`fleetHaulPlan` – čtyřkoláky u cest napřed). */
export function logHaulPlan(candidates: readonly LogHaul[], fleet: CartFleet): HaulPlan {
  return fleetHaulPlan(
    candidates.reduce((sum, x) => sum + x.haulable, 0),
    candidates.reduce((sum, x) => sum + x.road, 0),
    fleet,
  );
}

/**
 * Klády ke stavbám vozem (wagons.md – Vůz): vozy plánu `plan` (`logHaulPlan`) převezmou dovoz
 * u staveb `candidates` stavbu po stavbě; honáci a nakladači jdou ze společné práce (když nestačí,
 * vozy převezmou poměrně méně). Mutuje stav (postup staveb – kácení jako u společné práce); bez
 * práce null.
 */
export function haulLogs(
  state: VillageState,
  day: number,
  common: number,
  plan: HaulPlan,
  candidates: readonly LogHaul[],
  log?: CartTripLog,
): HaulWork | null {
  if (common <= 0 || plan.carts === 0) return null;
  const founding = foundingIndex(state);
  const scale = plan.crew > common ? common / plan.crew : 1;
  let left = plan.work * scale;
  const fourShare = plan.work > 1e-9 ? (plan.fourWork ?? 0) / plan.work : 0;
  const trees: number[] = [];
  for (const { c, haulable } of candidates) {
    if (left <= 0) break;
    const work = Math.min(left, haulable);
    const wood = c.wood!;
    for (const t of wood.fell.slice(wood.felled, wood.felled + 3)) {
      if (t.id !== null && !trees.includes(t.id)) trees.push(t.id);
    }
    invest(state, day, c, work, false, founding);
    wood.hauled = (wood.hauled ?? 0) + work;
    if (wood.cartReach4 && fourShare > 0) {
      addHaulTrips(state, wood.cartReach4, work * fourShare, 'four-wheel', log);
    }
    if (wood.cartReach)
      addHaulTrips(state, wood.cartReach, work * (1 - fourShare), 'two-wheel', log);
    left -= work;
  }
  return {
    job: 'logs',
    manDays: plan.crew * scale,
    carts: plan.carts,
    ...(plan.four ? { four: plan.four } : {}),
    trees,
  };
}

/** Vůz se sedlákem pro uhlí od milíře ke kováři (crafts.md – Uhlí a ruda kováře). */
export interface CharcoalCartJob {
  burnerId: number;
  /** Id milíře (crafts.md – Milíř u skácených buků). */
  kilnId?: number;
  smithId: number;
  /** Milíř (m). */
  at: { x: number; z: number };
  /** Kolik uhlí vůz přiveze (kg) a práce sedláka (čd – ze společné práce). */
  kg: number;
  manDays: number;
  /** Kde trasa vozu u milíře končí (m – jízdy do ročního provozu cest). */
  x: number;
  z: number;
  /** Který vůz jede (čtyřkolák k lesnímu milíři po cestě). */
  kind: CartKind;
}

/** Vůz se sedlákem pro rudu z rudiště do kovárny (crafts.md – Uhlí a ruda kováře). */
export interface OreCartJob {
  smithId: number;
  /** Rudiště (m). */
  site: { x: number; z: number };
  /**
   * Kolik rudy vůz přiveze (kg), práce sedláka (čd – ze společné práce) a kováře, který jede
   * s ním (čd – z práce dílny).
   */
  kg: number;
  manDays: number;
  riderManDays: number;
  /** Kde trasa vozu u rudiště končí (m). */
  x: number;
  z: number;
}

/** Co vozy dnes vozí mimo svoz a klády (wagons.md – Co vozy vozí). */
export interface CartJobsDay {
  /** Kolik vozů jede (uhlí, ruda, osivo, voda). */
  carts: number;
  /** Uhlí od milířů ke kovářům. */
  charcoal: CharcoalCartJob[];
  /** Ruda z rudišť do kováren. */
  ore: OreCartJob[];
  /** Hlína z hlinišť k hrnčířům (crafts.md – Hlína hrnčíře; `smithId` = dílna hrnčíře). */
  clay: OreCartJob[];
  /** Voda v sudech; bez ní null. */
  water: WaterCartPlan | null;
  /** Vozy s kamenem z lomu na stavby (fortifications.md – Kámen, Nošení kamene a vůz). */
  stone: StoneCart[];
}

export const NO_CART_JOBS: CartJobsDay = {
  carts: 0,
  charcoal: [],
  ore: [],
  clay: [],
  water: null,
  stone: [],
};

/**
 * Jízdy vozů, které nesvážejí úrodu, seno ani klády (wagons.md – Co vozy vozí; mutuje `tasks`,
 * `hauls` a flotilu jako svoz): v pořadí CART_JOBS.order – uhlí z milíře do kovárny tam, kde ho
 * dnes uhlíř vytahal (`deliveries`; jízda k milíři se uloží u milíře), ruda z hromady u jámy dávky
 * na celý vůz (jízda k rudišti se uloží u rudiště – crafts.md, Uhlí a ruda kováře), osivo na pole
 * (`planSeedHauls`), voda v sudech (`waterCartPlan`; břeh se uloží ve stavu), kámen z lomu na
 * stavby (`planStoneCarts`). Vůz jede jen tam, kam dojede, a jen když ušetří práci (uhlí proti
 * odnosu na tyči – stejná práce jako nošení v koších, ruda proti nošení v koších kovářovou
 * domácností, kámen proti nošení v nůších).
 * Uhlí a vodu veze levnější vůz (wagons.md – Co se vozí a na čem): čtyřkolák, když dojede po
 * pevné cestě a za kg stojí míň práce; ruda a osivo jen dvoukolákem.
 */
export function planCartJobs(
  state: VillageState,
  input: {
    fleet: CartFleet;
    tasks: DayTask[];
    hauls: Map<DayTask, HaulPlan>;
    access: CartAccess;
    landscape: Landscape | null;
    drives: () => CartDrives | null;
    drives4: () => CartDrives | null;
    deliveries: readonly CharcoalDelivery[];
    resting: ReadonlyMap<number, WorkshopActivity>;
    water: readonly HouseholdWater[];
  },
): CartJobsDay {
  const fleet = input.fleet;
  const any = (): boolean => fleetCarts(fleet, 'two-wheel') + fleetCarts(fleet, 'four-wheel') > 0;
  if (!any()) return NO_CART_JOBS;
  let used = 0;
  const charcoal: CharcoalCartJob[] = [];
  const dug: Record<DugMaterial, OreCartJob[]> = { ore: [], clay: [] };
  let water: WaterCartPlan | null = null;
  let stone: StoneCart[] = [];
  for (const job of CART_JOBS.order) {
    if (!any()) break;
    if (job === 'charcoal') {
      for (const d of input.deliveries) {
        if (!any()) break;
        const kiln = findKiln(
          state.dwellings.find((x) => x.id === d.burnerId),
          d.kilnId,
        );
        if (!kiln) continue;
        const footPerKg = basketManDaysPerKg(d.walkM, SMITH_SUPPLY.basketKg.charcoal);
        const offers: { kind: CartKind; offer: SmithCart }[] = [];
        const all = fleetCarts(fleet, 'two-wheel') > 0 ? input.drives() : null;
        if (all) {
          if (kiln.cart === undefined) kiln.cart = kilnCartDrive(state, d.at, all);
          const offer = kilnCartOffer(kiln.cart, footPerKg);
          if (offer) offers.push({ kind: 'two-wheel', offer });
        }
        const all4 = fleetCarts(fleet, 'four-wheel') > 0 ? input.drives4() : null;
        if (all4) {
          if (kiln.cart4 === undefined) kiln.cart4 = kilnCartDrive(state, d.at, all4);
          const offer = kilnCartOffer(kiln.cart4, footPerKg, 'four-wheel');
          if (offer) offers.push({ kind: 'four-wheel', offer });
        }
        // levnější vůz – méně práce sedláka na kg (při shodě dvoukolák)
        const best = offers.sort((a, b) => a.offer.manDaysPerKg - b.offer.manDaysPerKg)[0];
        if (!best) continue;
        const kg = Math.min(d.kg, best.offer.maxKg);
        charcoal.push({
          burnerId: d.burnerId,
          ...(d.kilnId !== undefined ? { kilnId: d.kilnId } : {}),
          smithId: d.smithId,
          at: d.at,
          kg,
          manDays: kg * best.offer.manDaysPerKg,
          x: best.offer.x,
          z: best.offer.z,
          kind: best.kind,
        });
        takeCart(fleet, best.kind);
        used++;
      }
    } else if (job === 'ore' || job === 'clay') {
      // ruda kovářům a hlína hrnčířům (crafts.md – Uhlí a ruda kováře, Hlína hrnčíře)
      const dwellings = job === 'ore' ? occupiedSmiths(state) : occupiedWorkshops(state, 'potter');
      for (const smith of dwellings) {
        if (fleetCarts(fleet, 'two-wheel') <= 0) break;
        if (input.resting.has(smith.id)) continue;
        const workshop = smith.workshop!;
        const batch = job === 'ore' ? workshop.oreBatch : workshop.clayBatch;
        const site = job === 'ore' ? workshop.oreSite : workshop.claySite;
        if (!batch?.cart || !site || batch.dug + EPSILON < batch.kg || batch.heap <= EPSILON) {
          continue;
        }
        const all = input.drives();
        if (!all) continue;
        if (site.cart === undefined) site.cart = oreCartDrive(state, site, all, job);
        const footPerKg = dugBasketManDaysPerKg(job, site.walkM);
        const offer = oreCartOffer(site.cart, footPerKg, job);
        if (!offer) continue;
        const kg = Math.min(batch.heap, offer.maxKg);
        dug[job].push({
          smithId: smith.id,
          site: { x: site.x, z: site.z },
          kg,
          manDays: kg * offer.manDaysPerKg,
          riderManDays: kg * offer.riderManDaysPerKg,
          x: offer.x,
          z: offer.z,
        });
        takeCart(fleet, 'two-wheel');
        used++;
      }
    } else if (job === 'seed') {
      const two = fleetCarts(fleet, 'two-wheel');
      if (two <= 0) continue;
      const left = planSeedHauls(
        state,
        input.tasks,
        input.hauls,
        two,
        input.access,
        input.landscape,
      );
      takeCart(fleet, 'two-wheel', two - left);
      used += two - left;
    } else if (job === 'water') {
      water = bestWaterPlan(state, fleet, input);
      if (water) {
        takeCart(fleet, water.kind, water.carts);
        used += water.carts;
      }
    } else {
      stone = planStoneCarts(state, fleet, input.drives);
      used += stone.length;
    }
  }
  return { carts: used, charcoal, ...dug, water, stone };
}

/**
 * Stavba, pro kterou dnes láme lom, a odkud kam se kámen nosí (fortifications.md – Kámen, Nošení
 * kamene a vůz): kostel s mistry na lámání a se zbytkem lámání, zakázka do zásoby (k hromadě u cesty
 * u dvorce – `logArrivalPoint`) a nedostavěná hradba s kamenem z lomu (`fortStone`). Lom musí stát;
 * jinak null. Nošení z plochy lomu na m³ (`carryPerM3`) nahradí vůz, lámání a nošení bloků na
 * plochu (`breakPerM3`) ne.
 */
function stoneSource(
  state: VillageState,
  c: Construction,
  masters: () => ReadonlySet<MasonCraft>,
): {
  quarry: Quarry;
  to: { x: number; z: number };
  carryPerM3: number;
  breakPerM3: number;
} | null {
  const quarryOf = (id: number): Quarry | null =>
    villageQuarries(state).find((q) => q.outcropId === id) ?? null;
  if (c.church) {
    const site = c.church;
    const m = masters();
    if (!c.position || !m.has('builder') || !m.has(CHURCH_WORK_CRAFT.quarry)) return null;
    if (churchQuarryLeft(site) <= EPSILON) return null;
    const quarry = quarryOf(site.quarryId);
    return quarry
      ? {
          quarry,
          to: c.position,
          carryPerM3: stoneCarryManDaysPerM3(site.quarryDistanceM),
          breakPerM3: quarryBreakManDaysPerM3(site.quarryRockM),
        }
      : null;
  }
  if (c.done + EPSILON >= c.cost) return null;
  const work = constructionStoneWork(c);
  if (!work || work.share <= 0) return null;
  const quarry = quarryOf(work.outcropId);
  if (!quarry) return null;
  const to = c.kind === 'quarrying' ? logArrivalPoint(state) : c.fortStone?.at;
  const breakPerM3 = constructionStoneBreak(c, quarry);
  return to ? { quarry, to, carryPerM3: constructionStoneCarry(c, breakPerM3), breakPerM3 } : null;
}

/**
 * Vozy s kamenem z lomu na stavby (wagons.md – Co vozy vozí, bod 5; mutuje flotilu): stavbám
 * v pořadí staveb, pro které dnes láme lom (`stoneSource`), po jednom dvoukoláku, dokud nějaký
 * zbývá – jen když posádka stojí méně práce než nošení v nůších (`stoneCartOffer`). Jízda z lomu
 * ke stavbě se spočítá jednou a uloží u stavby (`Construction.stoneCart`). Kolik vůz uveze, se
 * rozhodne až při práci stavby (`invest` – nejvýš to, co se ten den nalámalo).
 */
export function planStoneCarts(
  state: VillageState,
  fleet: CartFleet,
  drives: () => CartDrives | null,
): StoneCart[] {
  const carts: StoneCart[] = [];
  let masters: ReadonlySet<MasonCraft> | null = null;
  const mastersOf = (): ReadonlySet<MasonCraft> => (masters ??= mastersPresent(state));
  for (const c of state.constructions) {
    if (fleetCarts(fleet, 'two-wheel') <= 0) break;
    const source = stoneSource(state, c, mastersOf);
    if (!source) continue;
    const all = drives();
    if (!all) break;
    if (c.stoneCart === undefined)
      c.stoneCart = stoneCartDrive(state, source.quarry, source.to, all);
    const offer = stoneCartOffer(c.stoneCart, source.carryPerM3, source.breakPerM3);
    if (!offer) continue;
    carts.push({ constructionId: c.id, outcropId: source.quarry.outcropId, ...offer });
    takeCart(fleet, 'two-wheel');
  }
  return carts;
}

/**
 * Voda v sudech z flotily `fleet` (wagons.md – Co vozy vozí; flotilu nemění): ten druh vozů, který
 * ušetří víc (úspora chůze s vědry − posádka); břeh se uloží ve stavu (`waterCartDrive`). Nic
 * neušetří – null. Týž výběr pro vozy se zbylými voly (`planCartJobs`) i pro pár od rádla ráno
 * (`morningWaterPlan`).
 */
export function bestWaterPlan(
  state: VillageState,
  fleet: Readonly<CartFleet>,
  input: {
    landscape: Landscape | null;
    drives: () => CartDrives | null;
    drives4: () => CartDrives | null;
    water: readonly HouseholdWater[];
  },
): WaterCartPlan | null {
  const plans: WaterCartPlan[] = [];
  for (const kind of CART_KINDS) {
    const carts = fleetCarts(fleet, kind);
    const all = carts > 0 ? (kind === 'four-wheel' ? input.drives4() : input.drives()) : null;
    if (!all) continue;
    const plan = waterCartPlan(
      input.water,
      carts,
      waterCartDrive(state, input.landscape, all, kind),
      kind,
    );
    if (plan) plans.push(plan);
  }
  return plans.sort((a, b) => b.saved - b.crew - (a.saved - a.crew))[0] ?? null;
}

/** Vozy pro uhlí, rudu a hlínu, na které dnes zbyl sedlák ze společné práce. */
export interface SmithCartsDay {
  charcoal: CharcoalCartJob[];
  ore: OreCartJob[];
  clay: OreCartJob[];
  /** Práce sedláků celkem (čd – z práce vsi). */
  manDays: number;
}

/**
 * Sedláci pro vozy s uhlím a rudou (crafts.md – Uhlí a ruda kováře; Martin: „přiveze uhlí sedlák
 * s vozem (a odečte se jeho práce)“): z práce vsi, která na sedláky dnes zbyla (`carting` –
 * rozdělení práce dne), v pořadí přednosti – vůz, na jehož sedláka práce nezbyla, nejede (uhlí
 * a rudu pak donesou pěšky).
 */
export function paySmithCarts(jobs: CartJobsDay, carting: number): SmithCartsDay {
  let left = Math.max(0, carting);
  const charcoal = jobs.charcoal.filter((c) => {
    if (c.manDays > left + EPSILON) return false;
    left -= c.manDays;
    return true;
  });
  const pay = (o: OreCartJob): boolean => {
    if (o.manDays > left + EPSILON) return false;
    left -= o.manDays;
    return true;
  };
  const ore = jobs.ore.filter(pay);
  const clay = jobs.clay.filter(pay);
  return { charcoal, ore, clay, manDays: Math.max(0, carting) - left };
}

/** Nošení, kam dojede vůz: podél pevných cest (i čtyřkolák) a jinam (jen dvoukolák) – čd. */
export interface CarriedToday {
  road: number;
  other: number;
}

/** Nošení `carried` čd, z něj podíl `road`, kam dojede i čtyřkolák. */
export function carried(carried: number, road: number): CarriedToday {
  if (carried <= 1e-9) return { road: 0, other: 0 };
  const r = carried * Math.max(0, Math.min(1, road));
  return { road: r, other: carried - r };
}

/**
 * Nošení, které dnes na úloze proběhlo (wagons.md – Kolik vozů ves chce): úloha postoupila
 * o `amount` čd a jeho podíl je nošení tam, kam vůz dojede – odnos snopů při sklizni, svoz sena při
 * seči, osivo při setí (jako svoz – `planTaskHauls`, `planSeedHauls`); u sklizně a seče i díl podél
 * pevných cest, kam dojede čtyřkolák (`roadAccess`; osivo jen dvoukolákem). Dosah vozu se u úlohy
 * spočítá a uloží jako při svozu.
 */
export function taskCarryDemand(
  state: VillageState,
  task: DayTask,
  amount: number,
  access: CartAccess,
  roadAccess: CartAccess | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): CarriedToday {
  if (amount <= 1e-9) return { road: 0, other: 0 };
  if (task.field?.name === 'harvest') {
    const work = task.field.work;
    work.cartReach ??= cropCartReach(state, work, landscape, access);
    if (roadAccess) work.cartReach4 ??= cropCartReach(state, work, landscape, roadAccess);
    return carried(
      amount * harvestCarryShare(coverage.tools) * work.cartReach.share,
      roadAccess ? roadShare(work.cartReach, work.cartReach4 ?? null) : 0,
    );
  }
  if (task.field?.name === 'sow') {
    const work = task.field.work;
    work.seedReach ??= sowingCartReach(state, work, landscape, access);
    return carried(amount * CART_JOBS.seed.carryShare * work.seedReach.share, 0);
  }
  if (task.name === 'mow' && state.hay?.mowing) {
    const mowing = state.hay.mowing;
    mowing.cartReach ??= mowingCartReach(state, mowing, landscape, access);
    if (roadAccess) mowing.cartReach4 ??= mowingCartReach(state, mowing, landscape, roadAccess);
    return carried(
      amount * CARTS.haulShare.hay * mowing.cartReach.share,
      roadAccess ? roadShare(mowing.cartReach, mowing.cartReach4 ?? null) : 0,
    );
  }
  if (task.name === 'orchard-harvest' && state.orchardWork?.task === 'harvest') {
    const apples = state.orchardWork;
    apples.cartReach ??= orchardCartReach(state, landscape, access);
    if (roadAccess) apples.cartReach4 ??= orchardCartReach(state, landscape, roadAccess);
    return carried(
      amount * ORCHARD.harvestCarryShare * apples.cartReach.share,
      roadAccess ? roadShare(apples.cartReach, apples.cartReach4 ?? null) : 0,
    );
  }
  return { road: 0, other: 0 };
}

/**
 * Kácení a dovoz klád stavby, které zbývá u stromů, kam vůz dojede, a z toho u stromů, kam dojede
 * čtyřkolák (čd po stavbách; dosah se spočítá a uloží jako při svozu klád – `logHaulCandidates`).
 */
export function reachableFelling(
  state: VillageState,
  day: number,
  access: CartAccess,
  roadAccess: CartAccess | null,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): Map<Construction, { remaining: number; road: number }> {
  const out = new Map<Construction, { remaining: number; road: number }>();
  const founding = foundingIndex(state);
  for (const c of state.constructions) {
    if (!c.wood || c.done + 1e-9 >= woodFellingCost(c.wood)) continue;
    if (constructionNeed(state, c, day, founding) <= 0) continue;
    c.wood.cartReach ??= logsCartReach(state, c.wood, landscape, obstacles, access);
    if (roadAccess) {
      c.wood.cartReach4 ??= logsCartReach(state, c.wood, landscape, obstacles, roadAccess);
    }
    out.set(c, {
      remaining: fellingHaulable(c, c.wood.cartReach.trees).remaining,
      road: c.wood.cartReach4 ? fellingHaulable(c, c.wood.cartReach4.trees).remaining : 0,
    });
  }
  return out;
}

/**
 * Klády, které se dnes u stromů, kam vůz dojede, skácely a odvezly (wagons.md – Kolik vozů ves
 * chce): CARTS.haulShare.logs dnešního kácení a dovozu (`before` – co u staveb zbývalo ráno,
 * `reachableFelling`), z toho u stromů, ke kterým dojede i čtyřkolák.
 */
export function logsDemand(
  before: ReadonlyMap<Construction, { remaining: number; road: number }>,
): CarriedToday {
  let felled = 0;
  let road = 0;
  for (const [c, was] of before) {
    const reach = c.wood?.cartReach?.trees;
    const after = reach ? fellingHaulable(c, reach).remaining : 0;
    felled += Math.max(0, was.remaining - after);
    const reach4 = c.wood?.cartReach4?.trees;
    const after4 = reach4 ? fellingHaulable(c, reach4).remaining : 0;
    road += Math.max(0, was.road - after4);
  }
  const share = CARTS.haulShare.logs;
  return { road: road * share, other: Math.max(0, felled - road) * share };
}

/**
 * Jízdy pro rudu a hlínu, kdyby vozů bylo dost (wagons.md – Kolik vozů ves chce): ruda a hlína,
 * kterou dnes kovárny a hrnčíři odnesli z rudiště či hliniště v koších nebo přivezli vozem
 * (`workshops` – nošení a jízdy), proti jízdě se sedlákem a řemeslníkem (`oreCartOffer` – jízda
 * k místu se uloží u něj); úspory vozů po plných dnech jízd (čd).
 */
export function oreDemand(
  state: VillageState,
  workshops: readonly WorkshopDay[],
  drives: () => CartDrives | null,
): number[] {
  const savings: number[] = [];
  for (const w of workshops) {
    const material: DugMaterial = w.craft === 'potter' ? 'clay' : 'ore';
    const fetch = (w.fetch ?? []).filter((f) => f.target.kind === material);
    if (fetch.length === 0) continue;
    const workshop = state.dwellings.find((d) => d.id === w.dwellingId)?.workshop;
    const site = material === 'clay' ? workshop?.claySite : workshop?.oreSite;
    const all = drives();
    if (!site || !all) continue;
    if (site.cart === undefined) site.cart = oreCartDrive(state, site, all, material);
    const footPerKg = dugBasketManDaysPerKg(material, site.walkM);
    const offer = oreCartOffer(site.cart, footPerKg, material);
    if (!offer) continue;
    let kg = 0;
    for (const f of fetch) {
      kg += f.cart ? f.manDays / offer.riderManDaysPerKg : f.manDays / footPerKg;
    }
    const perKg = footPerKg - offer.manDaysPerKg - offer.riderManDaysPerKg;
    for (; kg > EPSILON; kg -= offer.maxKg) savings.push(Math.min(kg, offer.maxKg) * perKg);
  }
  return savings;
}

/**
 * Jízdy s kamenem z lomu, kdyby vozů bylo dost (wagons.md – Kolik vozů ves chce): stejné stavby
 * a nabídky jako skutečné vozy (`planStoneCarts` – kostel, hradba s kamenem z lomu, zakázka do
 * zásoby), jeden dvoukolák na stavbu; úspora vozu za den = nejvýš `maxM3` × (nošení − posádka)
 * na m³ (čd). Jízda se spočítá jednou a uloží u stavby (`Construction.stoneCart`).
 */
export function stoneDemand(state: VillageState, drives: () => CartDrives | null): number[] {
  const savings: number[] = [];
  let masters: ReadonlySet<MasonCraft> | null = null;
  const mastersOf = (): ReadonlySet<MasonCraft> => (masters ??= mastersPresent(state));
  for (const c of state.constructions) {
    const source = stoneSource(state, c, mastersOf);
    if (!source) continue;
    const all = drives();
    if (!all) break;
    if (c.stoneCart === undefined)
      c.stoneCart = stoneCartDrive(state, source.quarry, source.to, all);
    const offer = stoneCartOffer(c.stoneCart, source.carryPerM3, source.breakPerM3);
    if (offer) savings.push(offer.maxM3 * (offer.carryPerM3 - offer.crewPerM3));
  }
  return savings;
}

/**
 * Jízdy pro uhlí a vodu, kdyby vozů bylo dost (wagons.md – Kolik vozů ves chce): stejné nabídky
 * jako skutečné vozy (`planCartJobs` – uhlí z milířů, odkud ho dnes do kovárny nosí, proti nošení
 * v koších, voda v sudech s CART_DEMAND.probeCarts vozy); úspory jednotlivých vozů (čd). Jízda
 * k vodě je poslední známá (`VillageState.waterCart`) – přepočet vozové sítě po každé změně
 * rozložení vsi by stál víc než celý odhad; znovu se hledá, jen když jízdu ves ještě nemá nebo se
 * ohrada volů přestěhovala.
 */
export function jobsDemand(
  state: VillageState,
  input: {
    landscape: Landscape | null;
    deliveries: readonly CharcoalDelivery[];
    drives: () => CartDrives | null;
    water: readonly HouseholdWater[];
  },
): number[] {
  const savings: number[] = [];
  for (const d of input.deliveries) {
    const kiln = findKiln(
      state.dwellings.find((x) => x.id === d.burnerId),
      d.kilnId,
    );
    const all = input.drives();
    if (!kiln || !all) continue;
    if (kiln.cart === undefined) kiln.cart = kilnCartDrive(state, d.at, all);
    const footPerKg = basketManDaysPerKg(d.walkM, SMITH_SUPPLY.basketKg.charcoal);
    const offer = kilnCartOffer(kiln.cart, footPerKg);
    if (offer) savings.push(Math.min(d.kg, offer.maxKg) * (footPerKg - offer.manDaysPerKg));
  }
  savings.push(...stoneDemand(state, input.drives));
  const origin = cartOrigin(state);
  const known = state.waterCart;
  const all = input.drives();
  const drive =
    known && origin && known.key.endsWith(`|${origin.x},${origin.z}`)
      ? known.drive
      : all
        ? waterCartDrive(state, input.landscape, all)
        : null;
  const water = waterCartPlan(input.water, CART_DEMAND.probeCarts, drive);
  if (water) {
    const each = (water.saved - water.crew) / water.carts;
    for (let k = 0; k < water.carts; k++) savings.push(each);
  }
  return savings;
}

/**
 * Osivo na pole vozem (wagons.md – Co vozy vozí; mutuje `tasks` a `hauls` jako svoz): na setí dne
 * převezmou vozy nošení osiva – CART_JOBS.seed.carryShare setí na dílech, kam vůz s osivem dojede
 * (dosah se spočítá při prvním odvozu osiva a uloží u plodiny – `CropWork.seedReach`). Úloha pak
 * chce o převzaté nošení méně práce a o honáky a nakladače víc. Vrátí, kolik vozů zbylo.
 */
export function planSeedHauls(
  state: VillageState,
  tasks: DayTask[],
  hauls: Map<DayTask, HaulPlan>,
  carts: number,
  access: CartAccess,
  landscape: Landscape | null,
): number {
  let left = carts;
  for (const task of tasks) {
    if (left <= 0) break;
    if (task.field?.name !== 'sow' || hauls.has(task)) continue;
    const work = task.field.work;
    work.seedReach ??= sowingCartReach(state, work, landscape, access);
    const share = CART_JOBS.seed.carryShare * work.seedReach.share;
    const available = haulAvailable(work.required.sow, task.remaining, work.seedHauled ?? 0, share);
    const haul = haulPlan(available, left);
    if (haul.carts === 0) continue;
    left -= haul.carts;
    hauls.set(task, haul);
    task.remaining = task.remaining - haul.work + haul.crew;
  }
  return left;
}
