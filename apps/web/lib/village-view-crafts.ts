// Řemesla, milíře, vozy a jejich trasy pro scénu a panel.

import {
  SceneBurnerCamp,
  SceneKiln,
  SceneKilnRemnant,
  SceneKilnState,
  CartLoad,
  SceneCart,
  ScenePloughLegs,
  SceneVillage,
  type SceneCraftYard,
} from './village-view-scene-types';
import { VillageCrafts } from './village-view-types';
import {
  craftSources,
  CARPENTRY,
  CRAFT_PRODUCTION,
  carpenterWorkFactor,
  cartCondition,
  cartOrigin,
  cartsAway,
  obstacleIndex,
  seasonCrops,
  ploughBlockEndPart,
  ploughFrontBand,
  villageCarts,
  CARTS,
  CART_JOBS,
  expeditionCartLoads,
  laborReport,
  obstaclesOf,
  squareCenter,
  tileCenterWorld,
  type Cart,
  type CartKind,
  type Craft,
  type CraftCoverage,
  type LaborShare,
  type Landscape,
  type VillageState,
  type VillageSummary,
  type CharcoalKiln,
  type KilnRemnant,
  type KilnStage,
  kilnCharcoalShare,
  kilnRemnantOvergrowth,
  workshopKilns,
  BURNER_CAMP,
  campRemnantOvergrowth,
  saplingGrowth,
  villageOrchards,
  villageQuarries,
  bloomKg,
  ironBarsKg,
  smithBellows,
  type WorkshopActivity,
} from '@bohemia/game';
import { nearestToCentroid, type CartGoal } from './cart-routes';
import { stoneDestination } from './scene/stone-destination';
import { sceneTrails } from './trail-view';

export { nearestToCentroid, simplifiedRoute } from './cart-routes';

type Workshop = NonNullable<VillageState['dwellings'][number]['workshop']>;

/**
 * Kouří dílna u domu? Pec a výheň, když vyrábí – u kováře i tavba v redukční peci a překování houby
 * (production-chains.md – Kovář); uhlíř topí jen v milíři – ten je samostatná stavba (`sceneKilns`).
 */
export function workshopSmokes(workshop: Workshop): boolean {
  // tesař netopí – dílna nekouří (wagons.md)
  if (workshop.craft === 'carpenter' || workshop.craft === 'burner') return false;
  if (workshop.craft === 'smith' && SMITH_TASK[workshop.activity] !== undefined) return true;
  return workshop.activity === 'producing';
}

/** Činnost kovárny dne → práce ve scéně (production-chains.md – Kovář, Činnost dne). */
const SMITH_TASK: Partial<Record<WorkshopActivity, NonNullable<SceneCraftYard['task']>>> = {
  smelting: 'smelt',
  refining: 'refine',
  producing: 'forge',
};

/**
 * Hranice stupňů zásob u dílny pro scénu (kg; návrh Clauda – „pár stupňů“, ne přesné množství):
 * houba a hřivny na jednu kovárnu (zásoba kovářů je společná – dělí se rovným dílem), hlína
 * u hrnčíře (dávka na 30 dní ≈ 50–100 kg, vůz 400 kg – crafts.md, Hlína hrnčíře).
 */
export const CRAFT_YARD_STEPS = {
  bloomKg: [0.05, 3, 8],
  barsKg: [0.05, 5, 20],
  clayKg: [0.5, 30, 120],
} as const;

/**
 * Fáze rozdělaného vozu u tesaře podle průběhu dřevěné práce 0–1 (villagers.md – Fáze činností,
 * Tesař; návrh Clauda): napřed korba (ložní plocha, vůz na špalcích bez kol), od `wheels` korba
 * s koly, s hotovou dřevěnou prací celý vůz (čeká na kování – wagons.md, Kování vozů).
 */
export const CART_BUILD_STAGES = { wheels: 0.45 } as const;

/** Fáze stavby vozu 1–3 z průběhu dřevěné práce 0–1 (`CART_BUILD_STAGES`). */
export function cartBuildStage(progress: number): 1 | 2 | 3 {
  if (progress >= 1 - 1e-9) return 3;
  return progress >= CART_BUILD_STAGES.wheels ? 2 : 1;
}

/** Stupeň zásoby 0–3: kolik hranic `steps` množství `kg` dosáhlo. */
export function yardStage(kg: number, steps: readonly number[]): number {
  return steps.filter((step) => kg >= step).length;
}

/**
 * Dvůr hotové obývané dílny pro scénu (`SceneCraftYard`) – jen čtení stavu: tesař – rozdělaný vůz
 * po fázích (`cartBuildStage`); kovář – činnost dne,
 * měchař u tavby (syn 10–13 z rozdělení práce dne, nebo dospělý z domácnosti – `smithBellows`),
 * houba a hřivny po stupních; hrnčíř – hlína v jámě po stupních a šlapání, když dnes vyrábí.
 * Jiná řemesla nic.
 */
export function craftYard(
  state: VillageState,
  dwelling: VillageState['dwellings'][number],
  day: number,
  smithies: number,
): SceneCraftYard | null {
  const w = dwelling.workshop;
  if (!w) return null;
  if (w.craft === 'carpenter') {
    // rozdělaný vůz roste se dnem výroby (průběh dřevěné práce – workCarpenter v jádru)
    if (!w.cart) return null;
    const progress = w.cart.done / CARPENTRY.cartManDays[w.cart.kind];
    return { cart: { kind: w.cart.kind, stage: cartBuildStage(progress) } };
  }
  if (w.craft === 'potter') {
    const clay = yardStage(w.clayKg ?? 0, CRAFT_YARD_STEPS.clayKg);
    const treading = w.activity === 'producing' && clay > 0;
    if (clay === 0 && !treading) return null;
    return { clay, ...(treading ? { treading: true as const } : {}) };
  }
  if (w.craft !== 'smith') return null;
  const task = SMITH_TASK[w.activity];
  const share = Math.max(1, smithies);
  const bloom = yardStage(bloomKg(state) / share, CRAFT_YARD_STEPS.bloomKg);
  const bars = yardStage(ironBarsKg(state) / share, CRAFT_YARD_STEPS.barsKg);
  const son = (laborReport(state)?.shares ?? []).some(
    (s) =>
      s.activity === 'craft' &&
      s.target.kind === 'dwelling' &&
      s.target.id === dwelling.id &&
      (s.ages?.length ?? 0) > 0,
  );
  const bellows =
    task === 'smelt' && (son || smithBellows(state, dwelling.id, day)?.kind === 'adult');
  if (!task && bloom === 0 && bars === 0) return null;
  return {
    ...(task ? { task } : {}),
    ...(bellows ? { bellows: true as const } : {}),
    bloom,
    bars,
  };
}

/** Milíře uhlířů pro scénu – fáze, průběh a uhlí (crafts.md – Milíř u skácených buků). */
export function sceneKilns(state: VillageState, summary: VillageSummary): SceneKiln[] {
  return state.dwellings.flatMap((d) =>
    workshopKilns(d.workshop).flatMap((kiln): SceneKiln[] => {
      if (!kiln.site || kiln.id === undefined) return [];
      return [
        {
          id: kiln.id,
          burnerId: d.id,
          x: kiln.site.x,
          z: kiln.site.z,
          ...sceneKilnState(d.id, kiln, summary),
        },
      ];
    }),
  );
}

/** Milířiště pro scénu – zarůstání po 5 % (nepřestavuje se při každém dotazu). */
export function sceneKilnRemnants(state: VillageState, day: number): SceneKilnRemnant[] {
  return (state.kilnRemnants ?? []).map((r) =>
    sceneKilnRemnantOf(r, kilnRemnantOvergrowth(r, day)),
  );
}

/**
 * Zemnice uhlířů u milířů pro scénu (workshops.md – Uhlíř – zemnice u milíře): hotové
 * a rozestavěné (`built` po 5 %, `occupied` – hotová, milíř uhlíře pálí), pak opuštěné
 * (`overgrowth` po 5 %) – v pořadí jako `PlacementVillage.camps` na serveru (`burnerCampSites`).
 */
export function sceneBurnerCamps(state: VillageState, day: number): SceneBurnerCamp[] {
  const out: SceneBurnerCamp[] = [];
  for (const d of state.dwellings) {
    const camp = d.workshop?.camp;
    if (!camp) continue;
    const built = camp.builtDay !== undefined;
    out.push({
      id: camp.id,
      burnerId: d.id,
      x: camp.x,
      z: camp.z,
      rotation: camp.rotation,
      built: built ? 1 : Math.floor(Math.min(1, camp.done / BURNER_CAMP.buildManDays) * 20) / 20,
      occupied: built && workshopKilns(d.workshop).some((k) => k.stage === 'burn'),
      overgrowth: null,
    });
  }
  for (const r of state.campRemnants ?? []) {
    out.push({
      id: r.id,
      burnerId: r.burnerId,
      x: r.x,
      z: r.z,
      rotation: r.rotation,
      built: 1,
      occupied: false,
      overgrowth: Math.round(campRemnantOvergrowth(r, day) * 20) / 20,
    });
  }
  return out;
}

/** Milířiště pro scénu z jednoho záznamu – `overgrowth` 0–1 po 5 % (vlastní i cizí ves). */
export function sceneKilnRemnantOf(
  r: Pick<KilnRemnant, 'id' | 'burnerId' | 'x' | 'z'>,
  overgrowth: number,
): SceneKilnRemnant {
  return {
    id: r.id,
    burnerId: r.burnerId,
    x: r.x,
    z: r.z,
    overgrowth: Math.round(overgrowth * 20) / 20,
  };
}

/**
 * Fáze milíře pro scénu z průběhu 0–1 a podílu uhlí 0–1 (jen vypálený milíř) – obojí po 2 %, ať se
 * milíř nepřestavuje při každém dotazu. Sdílí vlastní i cizí ves.
 */
export function sceneKilnStateOf(
  stage: KilnStage,
  progress: number,
  charcoalShare?: number,
): SceneKilnState {
  return {
    stage,
    progress: Math.round(progress * 50) / 50,
    ...(stage === 'draw' && charcoalShare !== undefined
      ? { charcoal: Math.round(charcoalShare * 50) / 50 }
      : {}),
  };
}

/**
 * Fáze milíře pro scénu (crafts.md – Milíř stojí vždy): průběh fáze a u vypáleného milíře podíl
 * uhlí, které v něm zbývá – obojí po 2 %, ať se milíř nepřestavuje při každém dotazu.
 */
function sceneKilnState(
  dwellingId: number,
  kiln: CharcoalKiln,
  summary: VillageSummary,
): SceneKilnState {
  const info = summary.crafts.workshops
    .find((w) => w.dwellingId === dwellingId)
    ?.kilns.find((k) => k.id === (kiln.id ?? null));
  return sceneKilnStateOf(kiln.stage, info?.progress ?? 0, kilnCharcoalShare(kiln));
}

/** Velikost mladých buků od uhlíře 0–1 po setinách (instance se nepřestavují při každém dotazu). */
export function plantedSaplingViews(
  state: VillageState,
  day: number,
): { id: number; growth: number }[] {
  return (state.felledTrees ?? []).flatMap((f) => {
    if (f.planted === undefined) return [];
    const growth = saplingGrowth(f, day);
    return growth === null ? [] : [{ id: f.id, growth: Math.round(growth * 100) / 100 }];
  });
}

/**
 * Výroba dílny za den při práci `labor` (kg) – uhlíř bez kácení, kovář bez rudy a hrnčíř bez hlíny
 * (kopou zvlášť – crafts.md, Uhlí a ruda kováře, Hlína hrnčíře), tesař dřevěné nářadí podle
 * nástrojů od kováře (wagons.md).
 */
function workshopOutputKg(craft: Craft, labor: number, coverage: CraftCoverage): number {
  if (craft === 'carpenter') {
    return labor / (CARPENTRY.woodToolsManDaysPerKg * carpenterWorkFactor(coverage.tools));
  }
  if (craft === 'burner') return labor * CRAFT_PRODUCTION.charcoalKgPerManDay;
  if (craft === 'smith') return labor / CRAFT_PRODUCTION.toolManDaysPerKg;
  return labor / CRAFT_PRODUCTION.potteryManDaysPerKg;
}

/** Řemesla pro lištu a panel výběru. */
export function craftsView(
  state: VillageState,
  summary: VillageSummary,
  landscape: Landscape | null,
): VillageCrafts {
  const { stocks, needs, coverage, workshops, carts, cartTargets } = summary.crafts;
  const present =
    workshops.length > 0 ||
    state.constructions.some((c) => c.craft) ||
    stocks.charcoalKg +
      stocks.potteryKg +
      (stocks.ironBarsKg ?? 0) +
      (stocks.woodToolsKg ?? 0) +
      summary.crafts.equipmentKg >
      0 ||
    carts.length > 0;
  return {
    present,
    stocks,
    equipmentKg: summary.crafts.equipmentKg,
    needs,
    coverage,
    workshops: workshops.map((w) => ({
      dwellingId: w.dwellingId,
      craft: w.craft,
      activity: w.activity,
      occupants: w.occupants,
      laborPerDay: w.laborPerDay,
      // výroba podle praxe řemeslníka (crafts.md – Učení řemesla)
      outputPerDayKg: workshopOutputKg(w.craft, w.laborPerDay, coverage) * w.skill.share,
      kilns: w.kilns,
      toPlant: w.toPlant,
      skill: {
        share: Math.round(w.skill.share * 100) / 100,
        years: Math.round(w.skill.years * 10) / 10,
        apprentices: w.skill.apprentices.map((a) => ({
          age: a.age,
          years: Math.round(a.years * 10) / 10,
        })),
      },
      carpenter: w.carpenter,
      ...(w.iron
        ? {
            iron: {
              ...w.iron,
              bloomKg: Math.round(w.iron.bloomKg * 10) / 10,
              barsKg: Math.round(w.iron.barsKg * 10) / 10,
              barsTargetKg: Math.round(w.iron.barsTargetKg * 10) / 10,
              equipmentKg: Math.round(w.iron.equipmentKg * 10) / 10,
            },
          }
        : {}),
      ...(w.ore
        ? {
            ore: {
              ...w.ore,
              stockKg: Math.round(w.ore.stockKg * 10) / 10,
              heapKg: Math.round(w.ore.heapKg * 10) / 10,
              site: w.ore.site
                ? { walkM: Math.round(w.ore.site.walkM), leftKg: Math.round(w.ore.site.leftKg) }
                : null,
            },
          }
        : {}),
      ...(w.clay
        ? {
            clay: {
              ...w.clay,
              stockKg: Math.round(w.clay.stockKg * 10) / 10,
              heapKg: Math.round(w.clay.heapKg * 10) / 10,
              site: w.clay.site
                ? { walkM: Math.round(w.clay.site.walkM), leftKg: Math.round(w.clay.site.leftKg) }
                : null,
            },
          }
        : {}),
    })),
    carts: carts.map((c) => ({ ...c, condition: Math.round(c.condition * 100) / 100 })),
    cartTargets,
    sources: craftSources(state, landscape).map((source) => ({
      product: source.product,
      own: source.own,
      direction: source.route?.direction ?? null,
      days: source.route?.days ?? null,
      trail: source.route?.trailId !== null && source.route !== null,
    })),
  };
}

/**
 * Vozy vsi pro scénu (wagons.md – Vůz): stojí u ohrady se spřežením; ty, které dnes vozí
 * (podíly práce `haul` s počtem vozů) nebo jedou s výpravou (`trade`), nesou cíl dne, náklad
 * a trasu (`cartRouteToday` – fáze 3).
 */
export function sceneCarts(
  state: VillageState,
  day: number,
  landscape: Landscape,
  fields: SceneVillage['fields'],
): SceneCart[] {
  const carts = villageCarts(state);
  if (carts.length === 0) return [];
  const home = cartOrigin(state) ?? (state.pens ?? []).find((p) => p.builtDay !== null) ?? null;
  const away = cartsAway(state);
  const jobs = new Map<number, NonNullable<SceneCart['job']>>();
  for (const e of state.trade?.expeditions ?? []) {
    const ids = e.carts ?? [];
    const loads = expeditionCartLoads(
      e,
      ids.map((id) => carts.find((c) => c.id === id)?.kind ?? 'two-wheel'),
    );
    ids.forEach((id, i) => {
      jobs.set(id, {
        activity: 'trade',
        target: { kind: 'trail', id: e.trailId },
        load: 'goods',
        ...(loads[i] !== undefined ? { loadKg: loads[i] } : {}),
      });
    });
  }
  // vůz s platbou za kování k vozu jede po zemské stezce jako výprava (wagons.md – Kování vozů)
  for (const d of state.dwellings) {
    const trip = d.workshop?.ironTrip;
    if (trip?.cartId === undefined || trip.to.kind !== 'neighbour' || trip.to.trailId === null) {
      continue;
    }
    jobs.set(trip.cartId, {
      activity: 'trade',
      target: { kind: 'trail', id: trip.to.trailId },
      load: 'goods',
    });
  }
  const idleOf = (kind: CartKind): Cart[] =>
    carts.filter((c) => c.kind === kind && !away.has(c.id)).sort((a, b) => a.id - b.id);
  const idle = idleOf('two-wheel');
  const idleFour = idleOf('four-wheel');
  for (const share of laborReport(state)?.shares ?? []) {
    if (share.activity !== 'haul') continue;
    // čtyřkoláky svozu (wagons.md – Co se vozí a na čem), zbytek dvoukoláky
    const four = idleFour.splice(0, share.fourWheel ?? 0);
    const two = idle.splice(0, Math.max(0, (share.carts ?? 1) - four.length));
    for (const cart of [...four, ...two]) {
      jobs.set(cart.id, {
        activity: 'haul',
        target: share.target,
        load: haulLoad(state, share),
        // osivo veze vůz na pole, zpátky jede prázdný (wagons.md – Co vozy vozí)
        ...(share.job === 'seed' ? { outbound: true as const } : {}),
        // kámen z lomu na stavbu (fortifications.md – Kámen, Nošení kamene a vůz)
        ...(share.job === 'stone' && share.construction !== undefined
          ? { construction: share.construction }
          : {}),
      });
    }
  }
  return carts.map((c) => {
    const job = jobs.get(c.id) ?? null;
    const goal = job ? cartGoalToday(state, landscape, c.kind, job, fields) : null;
    return {
      id: c.id,
      kind: c.kind,
      x: home?.x ?? 0,
      z: home?.z ?? 0,
      condition: Math.round(cartCondition(c, day) * 10) / 10,
      job,
      ...(goal ? { goal } : {}),
    };
  });
}

/**
 * Cesty spřežení dne (oxen.md – Spřežení zůstane na poli): spřežení je na poli, dokud nezorá, co
 * okno potřebuje – `out` jen v den příjezdu k bloku (výjezd z ohrady nebo přesun od konce
 * předchozího bloku), `home` jen v den návratu (od konce bloku do ohrady). Z dat jádra
 * (`PloughWork.trip`) jen cíle (`outGoals`, `homeGoals` – po plodinách, platí první, kam
 * spřežení dojede); trasy vozovou sítí jako dvoukolák bez nákladu spočítá prohlížeč
 * (`withCartRoutes` – cart-routes.ts). `stand` (den bez orby) platí jen bez cesty tam i zpět.
 * Bez cílů i bez stání null.
 */
export function scenePloughLegs(
  state: VillageState,
  fields: SceneVillage['fields'],
): ScenePloughLegs | null {
  if (!state.season) return null;
  const scene = new Map(fields.flatMap((f) => f.parts).map((p) => [p.id, p]));
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const goal = (
    from: { x: number; z: number } | null,
    partId: number | undefined,
    reverse = false,
  ): CartGoal | null => {
    const part = partId === undefined ? undefined : scene.get(partId);
    if (!part) return null;
    return {
      to: { x: part.x, z: part.z },
      reachM: part.size / 2 + 1.5,
      ...(from ? { from } : {}),
      ...(reverse ? { reverse: true as const } : {}),
    };
  };
  const outGoals: CartGoal[] = [];
  const homeGoals: CartGoal[] = [];
  for (const { work } of seasonCrops(state.season)) {
    const plough = work.plough;
    const trip = plough?.trip;
    if (!plough || !trip) continue;
    if (trip.arrived?.day === state.lastDay) {
      const first = plough.bands?.find((b) => b.block === trip.block)?.partIds[0];
      const from = trip.arrived.from;
      const end = from === null ? null : ploughBlockEndPart(plough, from, byId);
      const start = end ? scene.get(end.id) : undefined;
      const out =
        from === null ? goal(null, first) : start ? goal({ x: start.x, z: start.z }, first) : null;
      if (out) outGoals.push(out);
    }
    if (trip.home === state.lastDay) {
      const back = goal(null, ploughBlockEndPart(plough, trip.block, byId)?.id, true);
      if (back) homeGoals.push(back);
    }
  }
  // den bez orby: spřežení na poli stojí u čela orby (díl, kde orba pokračuje)
  let stand: { x: number; z: number } | null = null;
  const ploughed = laborReport(state)?.shares.some((s) => s.activity === 'plough' && s.manDays > 0);
  if (!ploughed) {
    for (const { work } of seasonCrops(state.season)) {
      const trip = work.plough?.trip;
      if (!trip || trip.home !== undefined) continue;
      // blok, u kterého spřežení je (konec jeho pásů); bez něj čelo orby
      const here = work.plough ? ploughBlockEndPart(work.plough, trip.block, byId) : null;
      const band = here ? null : ploughFrontBand(work, byId, state.lastDay);
      const part = scene.get(here?.id ?? band?.partIds[0] ?? -1);
      if (part) stand = { x: part.x, z: part.z };
      if (stand) break;
    }
  }
  if (outGoals.length === 0 && homeGoals.length === 0 && !stand) return null;
  return {
    ...(outGoals.length > 0 ? { outGoals } : {}),
    ...(homeGoals.length > 0 ? { homeGoals } : {}),
    ...(stand ? { stand } : {}),
  };
}

/**
 * Co vůz při svozu veze: klády ke stavbě, seno ze seče (louka, díl úhoru v seči), jinak snopy;
 * mimo svoz (wagons.md – Co vozy vozí) uhlí a osivo jako zboží, vodu v sudech, rudu z rudiště.
 */
function haulLoad(state: VillageState, share: LaborShare): CartLoad {
  if (share.job === 'water') return 'water';
  if (share.job === 'stone') return 'stone';
  if (share.job === 'ore') return 'ore';
  if (share.job === 'clay') return 'clay';
  if (share.target.kind === 'orchard') return 'apples';
  if (share.job === 'seed' || share.job === 'charcoal') return 'goods';
  const t = share.target;
  if (t.kind === 'meadow') return 'hay';
  if (t.kind !== 'field') return 'logs';
  const mown = new Set(state.hay?.mowing?.partIds ?? []);
  return (t.parts ?? []).some((id) => mown.has(id)) ? 'hay' : 'sheaves';
}

/**
 * Cíl jízdy vozu dne (wagons.md – fáze 3), ze kterého prohlížeč spočítá trasu (`cartGoalRoute`
 * – stejnou funkcí jako dosah svozu, `villageCartRoutes` – pole stálou cenou, paths.md – Stálé
 * trasy): svoz – od ohrady k místu dnešní práce (díl na čele žně / seče nejblíž těžišti dnešních
 * dílů, políčko louky, strom stavby), mimo svoz k milíři a na břeh pro vodu (wagons.md – Co vozy
 * vozí); výprava – od ohrady na začátek zemské stezky a po ní ke kraji mapy. Bez cíle null.
 */
/** Jak blízko středu humna vůz zastaví a skládá snopy (m – kraj mlatu; návrh Clauda). */
const FLOOR_CART_REACH_M = 9;

/** Hotové humno nejblíž bodu `p` (pole svozu), nebo null. */
function sheafFloor(
  state: VillageState,
  p: { x: number; z: number },
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const f of state.threshingFloors ?? []) {
    if (f.builtDay === null) continue;
    const d = Math.hypot(f.position.x - p.x, f.position.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = { x: f.position.x, z: f.position.z };
    }
  }
  return best;
}

function cartGoalToday(
  state: VillageState,
  landscape: Landscape,
  kind: CartKind,
  job: NonNullable<SceneCart['job']>,
  fields: SceneVillage['fields'],
): CartGoal | null {
  const xz = (p: { x: number; z: number }): { x: number; z: number } => ({ x: p.x, z: p.z });
  // čtyřkolák nedojede všude (zoraný díl, širší oblouk – wagons.md, Co se vozí a na čem): na
  // místo, kam nedojede, jede k bodu svozu nejblíž těžišti, ke kterému dojede (jádro mu dává jen
  // nošení, kam dojede)
  const toNearest = (
    points: readonly { x: number; z: number }[],
    reachM: number,
  ): CartGoal | null => {
    const goal = nearestToCentroid(points);
    if (!goal && kind !== 'four-wheel') return null;
    return {
      ...(goal ? { to: xz(goal) } : {}),
      ...(kind === 'four-wheel' ? { anyOf: points.map(xz) } : {}),
      reachM,
    };
  };
  const t = job.target;
  if (job.activity === 'trade') {
    if (t.kind !== 'trail') return null;
    const trail = sceneTrails(state).find((tr) => tr.id === t.id);
    if (!trail || trail.points.length < 2) return null;
    // od ohrady na začátek stezky (vozovou sítí), pak po stezce ke kraji mapy
    return { to: xz(trail.points[0]!), reachM: CARTS.reachM, then: trail.points.map(xz) };
  }
  if (t.kind === 'field') {
    const field = fields.find((f) => f.id === t.id);
    const ids = new Set(t.parts ?? []);
    const parts = (field?.parts ?? []).filter((p) => p.id !== undefined && ids.has(p.id));
    // bez dílů vůz nikam nejede (ani čtyřkolák)
    const goal = parts.length > 0 ? toNearest(parts, CARTS.reachM) : null;
    // snopy s hotovým humnem: plný vůz z pole k humnu (villagers.md – Fáze činností; návrh
    // Clauda – počty a čas svozu dál řídí simulace)
    const floor = job.load === 'sheaves' && goal ? sheafFloor(state, goal.to ?? parts[0]!) : null;
    return goal && floor ? { ...goal, via: { to: floor, reachM: FLOOR_CART_REACH_M } } : goal;
  }
  if (t.kind === 'meadow') {
    return toNearest(
      t.cells.map((c) => tileCenterWorld(landscape, c.x, c.y)),
      CARTS.reachM,
    );
  }
  if (t.kind === 'trees') {
    const obstacles = obstaclesOf(landscape);
    const trees = t.ids.flatMap((id) => {
      const k = obstacleIndex(obstacles, id);
      return k < 0 ? [] : [{ x: obstacles.x[k]!, z: obstacles.z[k]! }];
    });
    return toNearest(trees, CARTS.dragM);
  }
  // uhlí od milíře ke kováři (wagons.md – Co vozy vozí) – k milíři jako jádro (kilnCartDrive)
  if (t.kind === 'kiln') return { to: xz(t), reachM: CART_JOBS.charcoal.reachM };
  // voda v sudech – na břeh, kde trasa jádra končí (waterCartDrive)
  if (t.kind === 'water') return { to: xz(t), reachM: CART_JOBS.water.reachM };
  if (t.kind === 'orchard') {
    // jablka ze sadu (orchard.md – Jablka vozem) – na kraj sadu k čtverci nejblíž těžišti, kam
    // vůz dojede (do sadu nevjede)
    const orchard = villageOrchards(state).find((o) => o.id === t.id);
    const squares = (orchard?.squares ?? [])
      .filter((sq) => sq.plantedDay !== null)
      .map((sq) => squareCenter(landscape, orchard!.grid, sq.cell));
    return squares.length > 0 ? { anyOf: squares.map(xz), reachM: CARTS.reachM } : null;
  }
  // ruda z rudiště a hlína z hliniště (crafts.md – Uhlí a ruda kováře, Hlína hrnčíře) – k hromadě
  // u jámy jako jádro (oreCartDrive)
  if (t.kind === 'ore' || t.kind === 'clay') return { to: xz(t), reachM: CART_JOBS[t.kind].reachM };
  // kámen z lomu na stavbu (wagons.md – Co vozy vozí, bod 5): z lomu ke konci uložené jízdy stavby
  // (`Construction.stoneCart` – jádro, `stoneCartDrive`), trasa obráceně – od stavby k lomu
  // (village-carts.ts: u lomu nakládá, u stavby skládá); k hromadě kamene u stavby cíl posune
  // `withStoneCartHeaps`
  if (t.kind === 'quarry') {
    const quarry = villageQuarries(state).find((q) => q.outcropId === t.id);
    const drive = state.constructions.find((c) => c.id === job.construction)?.stoneCart;
    return quarry && drive
      ? { from: xz(quarry), to: xz(drive), reachM: STONE_CART_REACH_M, reverse: true }
      : null;
  }
  return null;
}

/** Jak blízko konce uložené jízdy stavby (bodu vozové sítě) vůz s kamenem dojede (m). */
const STONE_CART_REACH_M = 3;
/** Jak blízko okraje hromady kamene u stavby vůz s kamenem zastaví a skládá (m; návrh Clauda). */
const STONE_HEAP_REACH_M = 4;

/**
 * Vůz s kamenem skládá u hromady kamene stavby (fortifications.md – Kámen, Nošení kamene a vůz):
 * cíl jízdy (`cartGoalToday`) se posune k hromadě, kam nosí kámen i nosiči bez vozu
 * (`stoneDestination` – hromada u kostela, bod obvodu hradby, zásoba u dvorce); kam k ní vůz
 * nedojede, jede ke konci uložené jízdy stavby (`anyOf`). Ostatní vozy beze změny.
 */
export function withStoneCartHeaps(
  carts: SceneCart[],
  village: Pick<SceneVillage, 'churches' | 'forts' | 'stoneStacks' | 'home'>,
): SceneCart[] {
  return carts.map((c) => {
    const goal = c.goal;
    if (c.job?.load !== 'stone' || !goal?.to || !goal.from) return c;
    const dest = stoneDestination(village, goal.to, c.job.construction, goal.from);
    if (!dest) return c;
    return {
      ...c,
      goal: { ...goal, to: dest.at, anyOf: [goal.to], reachM: dest.r + STONE_HEAP_REACH_M },
    };
  });
}
