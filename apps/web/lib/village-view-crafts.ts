// Řemesla, milíře, vozy a jejich trasy pro scénu a panel.

import {
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
  villageCartRoutes,
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
  kilnCharcoalShare,
  kilnRemnantOvergrowth,
  workshopKilns,
  saplingGrowth,
  villageOrchards,
  bloomKg,
  ironBarsKg,
  smithBellows,
  type WorkshopActivity,
} from '@bohemia/game';
import { sceneTrails } from './trail-view';

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

/** Stupeň zásoby 0–3: kolik hranic `steps` množství `kg` dosáhlo. */
export function yardStage(kg: number, steps: readonly number[]): number {
  return steps.filter((step) => kg >= step).length;
}

/**
 * Dvůr hotové obývané dílny pro scénu (`SceneCraftYard`) – jen čtení stavu: kovář – činnost dne,
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
  return (state.kilnRemnants ?? []).map((r) => ({
    id: r.id,
    burnerId: r.burnerId,
    x: r.x,
    z: r.z,
    overgrowth: Math.round(kilnRemnantOvergrowth(r, day) * 20) / 20,
  }));
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
  return {
    stage: kiln.stage,
    progress: Math.round((info?.progress ?? 0) * 50) / 50,
    ...(kiln.stage === 'draw' ? { charcoal: Math.round(kilnCharcoalShare(kiln) * 50) / 50 } : {}),
  };
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
      });
    }
  }
  return carts.map((c) => {
    const job = jobs.get(c.id) ?? null;
    const route = job ? cartRouteToday(state, day, landscape, c.kind, job, fields) : null;
    return {
      id: c.id,
      kind: c.kind,
      x: home?.x ?? 0,
      z: home?.z ?? 0,
      condition: Math.round(cartCondition(c, day) * 10) / 10,
      job,
      ...(route ? { route } : {}),
    };
  });
}

/**
 * Cesty spřežení dne (oxen.md – Spřežení zůstane na poli): spřežení je na poli, dokud nezorá, co
 * okno potřebuje – `out` jen v den příjezdu k bloku (výjezd z ohrady nebo přesun od konce
 * předchozího bloku), `home` jen v den návratu (od konce bloku do ohrady). Z dat jádra
 * (`PloughWork.trip`), trasy vozovou sítí jako dvoukolák bez nákladu (pevná cesta rychleji,
 * napříč přes neosetá pole, osetým dílem ne). Bez cest null.
 */
export function scenePloughLegs(
  state: VillageState,
  day: number,
  landscape: Landscape,
  fields: SceneVillage['fields'],
): ScenePloughLegs | null {
  if (!state.season) return null;
  const scene = new Map(fields.flatMap((f) => f.parts).map((p) => [p.id, p]));
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const obstacles = obstaclesOf(landscape);
  const route = (
    from: { x: number; z: number } | null,
    partId: number | undefined,
  ): { x: number; z: number }[] | null => {
    const part = partId === undefined ? undefined : scene.get(partId);
    if (!part) return null;
    const target = { x: part.x, z: part.z, reachM: part.size / 2 + 1.5 };
    const found = villageCartRoutes(state, day, landscape, obstacles, 'two-wheel', [target], from);
    const r = found?.[0];
    return r?.reached && r.points.length >= 2 ? simplifiedRoute(r.points) : null;
  };
  let out: { x: number; z: number }[] | null = null;
  let home: { x: number; z: number }[] | null = null;
  for (const { work } of seasonCrops(state.season)) {
    const plough = work.plough;
    const trip = plough?.trip;
    if (!plough || !trip) continue;
    if (!out && trip.arrived?.day === state.lastDay) {
      const first = plough.bands?.find((b) => b.block === trip.block)?.partIds[0];
      const from = trip.arrived.from;
      const end = from === null ? null : ploughBlockEndPart(plough, from, byId);
      const start = end ? scene.get(end.id) : undefined;
      if (from === null) out = route(null, first);
      else if (start) out = route({ x: start.x, z: start.z }, first);
    }
    if (!home && trip.home === state.lastDay) {
      const back = route(null, ploughBlockEndPart(plough, trip.block, byId)?.id);
      if (back) home = [...back].reverse();
    }
  }
  // den bez orby: spřežení na poli stojí u čela orby (díl, kde orba pokračuje)
  let stand: { x: number; z: number } | null = null;
  const ploughed = laborReport(state)?.shares.some((s) => s.activity === 'plough' && s.manDays > 0);
  if (!out && !home && !ploughed) {
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
  if (!out && !home && !stand) return null;
  return { ...(out ? { out } : {}), ...(home ? { home } : {}), ...(stand ? { stand } : {}) };
}

/**
 * Co vůz při svozu veze: klády ke stavbě, seno ze seče (louka, díl úhoru v seči), jinak snopy;
 * mimo svoz (wagons.md – Co vozy vozí) uhlí a osivo jako zboží, vodu v sudech, rudu z rudiště.
 */
function haulLoad(state: VillageState, share: LaborShare): CartLoad {
  if (share.job === 'water') return 'water';
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

/** Nejvýš tolik bodů trasy vozu do scény (osa se zjednoduší). */
const CART_ROUTE_POINTS = 80;
/** Odchylka zjednodušené osy od trasy vozové sítě (m). */
const CART_ROUTE_TOLERANCE_M = 0.6;

/**
 * Trasa vozu dne (wagons.md – fáze 3): svoz – osa vozové sítě od ohrady k místu dnešní práce
 * (díl na čele žně / seče nejblíž těžišti dnešních dílů, políčko louky, strom stavby) stejnou
 * funkcí jako dosah svozu (`villageCartRoutes` – pole stálou cenou, paths.md – Stálé trasy), mimo
 * svoz k milíři a na břeh pro vodu (wagons.md – Co vozy vozí); výprava
 * – od ohrady na začátek zemské stezky a po ní ke kraji mapy. Kam vůz nedojede (nebo bez cíle),
 * null.
 */
function cartRouteToday(
  state: VillageState,
  day: number,
  landscape: Landscape,
  kind: CartKind,
  job: NonNullable<SceneCart['job']>,
  fields: SceneVillage['fields'],
): { x: number; z: number }[] | null {
  const obstacles = obstaclesOf(landscape);
  const routeTo = (
    reachState: VillageState,
    target: { x: number; z: number },
    reachM: number,
  ): { x: number; z: number }[] | null => {
    const route = villageCartRoutes(reachState, day, landscape, obstacles, kind, [
      { x: target.x, z: target.z, reachM },
    ])?.[0];
    return route?.reached && route.points.length >= 2 ? route.points : null;
  };
  // čtyřkolák nedojede všude (zoraný díl, širší oblouk – wagons.md, Co se vozí a na čem): na
  // místo, kam nedojede, jede k bodu svozu nejblíž těžišti, ke kterému dojede (jádro mu dává jen
  // nošení, kam dojede)
  const routeToAny = (
    reachState: VillageState,
    goals: readonly { x: number; z: number }[],
    reachM: number,
  ): { x: number; z: number }[] | null => {
    if (goals.length === 0) return null;
    const routes = villageCartRoutes(
      reachState,
      day,
      landscape,
      obstacles,
      kind,
      goals.map((g) => ({ x: g.x, z: g.z, reachM })),
    );
    const reached = goals.flatMap((g, k) => {
      const route = routes?.[k];
      return route?.reached && route.points.length >= 2 ? [{ x: g.x, z: g.z, k }] : [];
    });
    const best = nearestToCentroid(reached);
    return best ? routes![best.k]!.points : null;
  };
  const t = job.target;
  let axis: { x: number; z: number }[] | null = null;
  if (job.activity === 'trade') {
    if (t.kind !== 'trail') return null;
    const trail = sceneTrails(state).find((tr) => tr.id === t.id);
    if (!trail || trail.points.length < 2) return null;
    // od ohrady na začátek stezky (vozovou sítí), pak po stezce ke kraji mapy
    const start = trail.points[0]!;
    const approach = routeTo(state, start, CARTS.reachM);
    axis = [...(approach ?? []), ...trail.points];
  } else if (t.kind === 'field') {
    const field = fields.find((f) => f.id === t.id);
    const ids = new Set(t.parts ?? []);
    const parts = (field?.parts ?? []).filter((p) => p.id !== undefined && ids.has(p.id));
    const goal = nearestToCentroid(parts);
    if (!goal) return null;
    axis = routeTo(state, goal, CARTS.reachM);
    if (!axis && kind === 'four-wheel') axis = routeToAny(state, parts, CARTS.reachM);
  } else if (t.kind === 'meadow') {
    const cells = t.cells.map((c) => tileCenterWorld(landscape, c.x, c.y));
    const goal = nearestToCentroid(cells);
    axis = goal ? routeTo(state, goal, CARTS.reachM) : null;
    if (!axis && kind === 'four-wheel') axis = routeToAny(state, cells, CARTS.reachM);
  } else if (t.kind === 'trees') {
    const trees = t.ids.flatMap((id) => {
      const k = obstacleIndex(obstacles, id);
      return k < 0 ? [] : [{ x: obstacles.x[k]!, z: obstacles.z[k]! }];
    });
    const goal = nearestToCentroid(trees);
    axis = goal ? routeTo(state, goal, CARTS.dragM) : null;
    if (!axis && kind === 'four-wheel') axis = routeToAny(state, trees, CARTS.dragM);
  } else if (t.kind === 'kiln') {
    // uhlí od milíře ke kováři (wagons.md – Co vozy vozí) – k milíři jako jádro (kilnCartDrive)
    axis = routeTo(state, t, CART_JOBS.charcoal.reachM);
  } else if (t.kind === 'water') {
    // voda v sudech – na břeh, kde trasa jádra končí (waterCartDrive)
    axis = routeTo(state, t, CART_JOBS.water.reachM);
  } else if (t.kind === 'orchard') {
    // jablka ze sadu (orchard.md – Jablka vozem) – na kraj sadu k čtverci nejblíž těžišti, kam
    // vůz dojede (do sadu nevjede)
    const orchard = villageOrchards(state).find((o) => o.id === t.id);
    const squares = (orchard?.squares ?? [])
      .filter((sq) => sq.plantedDay !== null)
      .map((sq) => squareCenter(landscape, orchard!.grid, sq.cell));
    axis = routeToAny(state, squares, CARTS.reachM);
  } else if (t.kind === 'ore' || t.kind === 'clay') {
    // ruda z rudiště a hlína z hliniště (crafts.md – Uhlí a ruda kováře, Hlína hrnčíře) – k hromadě
    // u jámy jako jádro (oreCartDrive)
    axis = routeTo(state, t, CART_JOBS[t.kind].reachM);
  }
  return axis ? simplifiedRoute(axis) : null;
}

/** Bod nejblíž těžišti bodů (díl na čele práce, políčko louky, strom); bez bodů null. */
function nearestToCentroid<P extends { x: number; z: number }>(points: readonly P[]): P | null {
  if (points.length === 0) return null;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p.z, 0) / points.length;
  let best = points[0]!;
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Osa trasy pro scénu: bez opakovaných bodů, zjednodušená (Douglas–Peucker s odchylkou
 * CART_ROUTE_TOLERANCE_M, když je bodů moc, s větší) a zaokrouhlená na cm.
 */
export function simplifiedRoute(
  points: readonly { x: number; z: number }[],
): { x: number; z: number }[] {
  const unique = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) > 0.01,
  );
  let tolerance = CART_ROUTE_TOLERANCE_M;
  let out = douglasPeucker(unique, tolerance);
  while (out.length > CART_ROUTE_POINTS) {
    tolerance *= 1.5;
    out = douglasPeucker(unique, tolerance);
  }
  return out.map((p) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }));
}

function douglasPeucker<P extends { x: number; z: number }>(
  points: readonly P[],
  tolerance: number,
): P[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const pa = points[a]!;
    const pb = points[b]!;
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const length = Math.hypot(dx, dz);
    let worst = -1;
    let worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const p = points[i]!;
      const d =
        length > 1e-9
          ? Math.abs((p.x - pa.x) * dz - (p.z - pa.z) * dx) / length
          : Math.hypot(p.x - pa.x, p.z - pa.z);
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
