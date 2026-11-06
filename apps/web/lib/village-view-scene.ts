// Sestavení dat scény vsi, rozdělení práce dne a data pro kontrolu umístění.

import {
  SceneThreshingFloor,
  type ScenePlot,
  sceneMound,
  scenePlot,
  SceneFieldPart,
  SceneHayMeadow,
  SceneLabor,
  SceneLaborHome,
  SceneLaborShare,
  SceneLord,
  SceneRide,
  SceneShoeing,
  SceneVillage,
  type SceneCraftYard,
} from './village-view-scene-types';
import { sceneRoutesKey } from './scene-routes';
import {
  sceneEarthworks,
  sceneOre,
  sceneRoadApples,
  sceneRoadTrees,
  sceneRoads,
  sceneWoods,
} from './village-view-roads';
import {
  plantedSaplingViews,
  sceneCarts,
  sceneKilnRemnants,
  sceneKilns,
  scenePloughLegs,
  workshopSmokes,
  craftYard,
} from './village-view-crafts';
import {
  cemeteryProgress,
  sceneOrchardSquare,
  scenePenSpecies,
  scenePens,
  sceneSacred,
  threshingFloorStraw,
  wearOf,
} from './village-view-buildings';
import { FLAX_BLOOM_MONTH, scenePart } from './village-view-fields';
import {
  wagonHome,
  ableTeams,
  oxPens,
  ploughPairsHome,
  ploughsThisYear,
  waterHouseholdsToday,
  storedWaterCartDrive,
  waterCartPlan,
  CART_JOBS,
  dateOfDayIndex,
  fieldPartLooks,
  hayMeadowLooks,
  obstacleChangesAt,
  laborReport,
  ageGroup,
  trainingFamily,
  trainingHours,
  lordRides,
  type LordRide,
  partStage,
  partOvergrowthYears,
  hailZone,
  pastureGrazedParts,
  isGrazeableFallow,
  reservedTrees,
  ruinOvergrowth,
  oldGraves,
  structureCondition,
  tileCenterWorld,
  wholeLogs,
  pileLogs,
  type ConstructionSummary,
  purchaseLine,
  shoeingDay,
  type LaborDay,
  type LaborShare,
  type Landscape,
  type Person,
  type PlacementVillage,
  type VillageState,
  type VillageSummary,
  villageCemeteries,
  villageOrchards,
  pathFortificationsOf,
  type DwellingPlot,
} from '@bohemia/game';
import { sceneGrainPits } from './grain-pit-view';
import { sceneFunerals } from './funeral-view';
import { scenePersons } from './person-view';
import { sceneWeddings } from './wedding-view';
import { sceneWildlife } from './wildlife-view';
import { sceneFlood, sceneHail, sceneTornado, sceneWeather } from './weather-view';
import { sceneFire } from './fire-view';
import { sceneFortifications } from './fort-view';

export function sceneVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): SceneVillage {
  const constructions = summary.constructions;
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  // zásoba houby a hřiven je společná všem obydleným kovárnám (production-chains.md – Kovář)
  const smithies = state.dwellings.filter(
    (d) => d.workshop?.craft === 'smith' && occupied.has(d.id),
  ).length;
  const yardOf = (d: (typeof state.dwellings)[number]): SceneCraftYard | null =>
    occupied.has(d.id) ? craftYard(state, d, day, smithies) : null;
  const built = state.dwellings.map((d) => {
    const yard = yardOf(d);
    return {
      id: d.id,
      type: d.type,
      position: d.position,
      built: true,
      progress: 1,
      inhabited: occupied.has(d.id),
      ...(d.plot ? { plot: scenePlot(landscape, d.plot) } : {}),
      since: d.builtDay,
      // stav po tisícinách – rozpad ve scéně jde po stupních (dwelling-decay.ts)
      ...(d.condition < 1 ? { condition: Math.round(d.condition * 1000) / 1000 } : {}),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      ...(d.workshop && occupied.has(d.id) && workshopSmokes(d.workshop) ? { working: true } : {}),
      ...(yard ? { yard } : {}),
      ...(d.plainShape ? { plainShape: true as const } : {}),
    };
  });
  // staveniště ukazuje samotnou stavbu – dřevo se kácí v lese, než se začne stavět; přestavba
  // polozemnice bez pozemku stojí na novém pozemku (domácnost zatím bydlí ve starém domě)
  const sites = state.constructions.flatMap((c) => {
    if (c.kind !== 'dwelling' && c.kind !== 'rebuild') return [];
    if (c.dwellingType === null || c.position === null) return [];
    const progress = constructions.find((s) => s.id === c.id)?.buildProgress ?? 0;
    const plot = c.plot ? { plot: scenePlot(landscape, c.plot) } : {};
    return [
      {
        id: c.id,
        type: c.dwellingType,
        position: c.position,
        built: false,
        progress,
        ...plot,
        since: c.startedDay,
        ...(c.craft ? { craft: c.craft } : {}),
        ...(c.plainShape ? { plainShape: true as const } : {}),
      },
    ];
  });
  const looks = fieldPartLooks(state, day, true);
  // len kvete v červnu (fields.md – Len)
  const flaxBloom = dateOfDayIndex(day).month === FLAX_BLOOM_MONTH;
  // kam stáda dojdou – jen ves se skutečnými stády (bez nich scéna stáda odvodí z domácností)
  const grazed = state.livestock ? pastureGrazedParts(state, day) : null;
  // ves letos orá rádlem – celé pole má kulaté rohy (oxen.md – Jen rádlo)
  const ard = ploughsThisYear(state);
  // počasí roku, které už je vidět (disasters.md – Ve scéně) – nikdy seed ani budoucí rok
  const weather = sceneWeather(state, day);
  // krupobití a povodeň jen v jejich den a po něm (nikdy budoucí rozpis)
  const hail = sceneHail(state, day);
  const flood = sceneFlood(state, day);
  const tornado = sceneTornado(state, day);
  const fields = state.fields.map((f) => ({
    id: f.id,
    ...(f.grid ? { grid: f.grid } : {}),
    ...(ard ? { ard: true as const } : {}),
    // vzhled po čtvercích z jádra (fieldPartLooks); bez něj (starší příloh) odhad scény
    parts: state.parts.flatMap((p): SceneFieldPart[] => {
      if (p.fieldId !== f.id || p.cell === undefined) return [];
      const years = p.state === 'fallow' ? partOvergrowthYears(p) : 0;
      return [
        {
          ...scenePart(landscape, p, p.cell, partStage(p, day), f.grid),
          ...looks.get(p.id),
          ...(p.state === 'sown' && (p.crop === 'legume' || p.crop === 'flax')
            ? { crop: p.crop }
            : {}),
          ...(p.state === 'sown' && p.crop === 'winter' ? { winter: true as const } : {}),
          ...(p.state === 'sown' &&
          p.crop === 'flax' &&
          flaxBloom &&
          looks.get(p.id)?.look === 'green'
            ? { bloom: true as const }
            : {}),
          ...(years > 0 ? { overgrowth: years } : {}),
          ...(grazed && isGrazeableFallow(p) ? { grazed: grazed.has(p.id) } : {}),
          ...(p.roadCut ? { roadCut: [...p.roadCut] } : {}),
          ...(p.burnedDay === undefined ? {} : { burnedDay: p.burnedDay }),
        },
      ];
    }),
  }));
  const woods = sceneWoods(state, landscape, day);
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    ...(c.grid ? { grid: c.grid } : {}),
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
      ...(c.grid ? { rotation: c.grid.rotation } : {}),
      ...(s.constructionId === undefined ? {} : { pending: true }),
    })),
    built: c.builtDay !== null,
    progress: cemeteryProgress(c.id, c.builtDay !== null, constructions),
    graves: oldGraves(c),
    ...(c.mounds?.length ? { mounds: c.mounds.map((m) => sceneMound(m, day)) } : {}),
    ...wearOf(structureCondition(c.fenceWear, 'cemetery-fence', day), 'fence'),
  }));
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    ...(o.grid ? { grid: o.grid } : {}),
    squares: o.squares.map((s) => {
      const square = sceneOrchardSquare(landscape, s, day, state.orchardWork ?? null, o.grid);
      // sad v pruhu krupobití bez jablek až do sklizně (disasters.md – Kroupy, Ve scéně)
      return hail && square.fruit && hailZone(hail.strip, square.x, square.z)
        ? { ...square, fruit: false }
        : square;
    }),
  }));
  const funerals = sceneFunerals(state, day);
  const weddings = sceneWeddings(state, day, landscape);
  const reserved = [...reservedTrees(state)].sort((a, b) => a - b);
  const labor = sceneLabor(state, { ...summary.people, ...summary.family }, landscape);
  const sacred = sceneSacred(state, landscape, day, summary);
  const obstacles = obstacleChangesAt(state, day);
  const roads = sceneRoads(state, summary.constructions);
  const roadTrees = sceneRoadTrees(state, day, obstacles);
  const kilns = sceneKilns(state, summary);
  const kilnRemnants = sceneKilnRemnants(state, day);
  const grainPits = sceneGrainPits(state);
  const plantedSaplings = plantedSaplingViews(state, day);
  const roadApples = sceneRoadApples(state, day, obstacles);
  const { oreSites, orePits } = sceneOre(state, day);
  // požár jen v jeho den (disasters.md – Požár, Ve scéně), shořelé zbytky jam ohořelé
  const fire = sceneFire(state, day);
  const ruins = (state.ruins ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    position: r.position,
    since: r.day,
    overgrowth: Math.round(ruinOvergrowth(r, day) * 1000) / 1000,
    ...(r.plot ? { plot: scenePlot(landscape, r.plot) } : {}),
    ...(r.craft ? { craft: r.craft } : {}),
    ...(r.plainShape ? { plainShape: true as const } : {}),
    ...(r.charred ? { charred: true as const } : {}),
  }));
  const pens = scenePens(state, landscape, day, summary);
  const earthworks = sceneEarthworks(state, day);
  const fortifications = pathFortificationsOf(state, landscape);
  const forts = sceneFortifications(state, landscape, day);
  const home = wagonHome(state);
  const carts = sceneCarts(state, day, landscape, fields);
  const ploughLegs = scenePloughLegs(state, fields);
  const hayMeadows = hayMeadowLooks(state, day).map((view): SceneHayMeadow => {
    const center = tileCenterWorld(landscape, view.cell.x, view.cell.y);
    return {
      cell: { x: view.cell.x, y: view.cell.y },
      x: center.x,
      z: center.z,
      size: landscape.cellSizeM,
      look: view.look,
      ...(view.work === undefined ? {} : { work: view.work }),
      ...(view.before === undefined ? {} : { before: view.before }),
    };
  });
  // hromady klád u lesa (forest.md – Klučení lesa pro pole – postup) v celých kládách
  const logStacks = (state.logStacks ?? []).flatMap((stack) => {
    const logs = wholeLogs(stack.logs);
    return logs > 0 ? [{ id: stack.id, x: stack.x, z: stack.z, logs }] : [];
  });
  const penned = pens.reduce((sum, pen) => sum + pen.cows, 0);
  const herds = summary.livestock.herds;
  const threshingFloors = sceneThreshingFloors(state, constructions, day);
  // divoká zvěř (wildlife.md – Ve scéně) – hejna vran podle osetých ha
  const sownHa =
    fields.reduce(
      (sum, f) =>
        sum + f.parts.reduce((m2, p) => m2 + (p.stage === 'sown' ? p.size * p.size : 0), 0),
      0,
    ) / 10_000;
  const wildlife = sceneWildlife(state, day, sownHa, landscape);
  return {
    dwellings: [...built, ...sites],
    ...(ruins.length > 0 ? { ruins } : {}),
    ...(oreSites.length > 0 ? { oreSites } : {}),
    ...(orePits.length > 0 ? { orePits } : {}),
    fields,
    cemeteries,
    ...(funerals.length > 0 ? { funerals } : {}),
    ...(weddings.length > 0 ? { weddings } : {}),
    ...(orchards.length > 0 ? { orchards } : {}),
    obstacles,
    ...(reserved.length > 0 ? { reservedTrees: reserved } : {}),
    woodLogs: wholeLogs(pileLogs(state)),
    ...(logStacks.length > 0 ? { logStacks } : {}),
    ...(labor ? { labor } : {}),
    ...(sacred ? { sacred } : {}),
    ...(threshingFloors.length > 0 ? { threshingFloors } : {}),
    livestock: { ...herds, cow: Math.max(0, herds.cow - penned) },
    ...(wildlife ? { wildlife } : {}),
    ...(hayMeadows.length > 0 ? { hayMeadows } : {}),
    ...(pens.length > 0 ? { pens } : {}),
    ...(summary.crafts.coverage.tools > 0 ? { toolCoverage: summary.crafts.coverage.tools } : {}),
    ...(ableTeams(state, day) > 0 ? { ploughTeam: true as const } : {}),
    ...(oxPens(state).length > 0 ? { ploughPairs: ploughPairsHome(state, day) } : {}),
    ...(roads.length > 0 ? { roads } : {}),
    ...(state.roads?.junctions ? { junctions: state.roads.junctions } : {}),
    ...(roadTrees.length > 0 ? { roadTrees } : {}),
    ...(woods.length > 0 ? { woods } : {}),
    ...(kilns.length > 0 ? { kilns } : {}),
    ...(kilnRemnants.length > 0 ? { kilnRemnants } : {}),
    ...(grainPits.length > 0 ? { grainPits } : {}),
    ...(plantedSaplings.length > 0 ? { plantedSaplings } : {}),
    ...(roadApples.length > 0 ? { roadApples } : {}),
    ...(carts.length > 0 ? { carts } : {}),
    ...(ploughLegs ? { ploughLegs } : {}),
    ...(earthworks.length > 0 ? { earthworks } : {}),
    ...(fortifications.length > 0 ? { fortifications } : {}),
    ...(forts.length > 0 ? { forts } : {}),
    ...(state.routes
      ? { routes: { key: sceneRoutesKey(state.routes), list: state.routes.list } }
      : {}),
    ...(state.roads?.wear
      ? {
          wear: {
            day: state.roads.wear.day,
            ...(state.roads.wear.cellM !== undefined ? { cellM: state.roads.wear.cellM } : {}),
            cells: state.roads.wear.cells,
          },
        }
      : {}),
    ...(home
      ? { home: { x: Math.round(home.x * 100) / 100, z: Math.round(home.z * 100) / 100 } }
      : {}),
    ...(weather ? { weather } : {}),
    ...(hail ? { hail } : {}),
    ...(flood ? { flood } : {}),
    ...(fire ? { fire } : {}),
    ...(tornado ? { tornado } : {}),
  };
}

/** Humna pro scénu (production-chains.md – Humno) – rozestavěná s průběhem stavby. */
function sceneThreshingFloors(
  state: VillageState,
  constructions: readonly ConstructionSummary[],
  day: number,
): SceneThreshingFloor[] {
  const floors = state.threshingFloors ?? [];
  const builtCount = floors.filter((f) => f.builtDay !== null).length;
  const shares = state.labor?.shares ?? [];
  // vymlácené zrno čeká na humnech na uložení do jam – rovným dílem
  const queueKg = builtCount > 0 ? (state.grainPitWork?.queueKg ?? 0) / builtCount : 0;
  const grainKg = Math.round(queueKg / 10) * 10;
  return floors.map((f) => {
    const built = f.builtDay !== null;
    const straw = threshingFloorStraw(f.builtDay, day);
    const threshing =
      built &&
      shares.some(
        (s) =>
          s.activity === 'thresh' &&
          s.manDays > 0 &&
          s.target.kind === 'threshing-floor' &&
          s.target.id === f.id,
      );
    return {
      id: f.id,
      position: f.position,
      built,
      progress: built ? 1 : (constructions.find((c) => c.id === f.id)?.buildProgress ?? 0),
      ...(built && straw > 0 ? { straw } : {}),
      ...(threshing ? { threshing: true as const } : {}),
      ...(built && grainKg > 0 ? { grainKg } : {}),
    };
  });
}

/** Rozdělení práce posledního dne pro postavy – člověkodny na setiny (drobné podíly 0,01). */
export function sceneLabor(
  state: VillageState,
  people: SceneLabor['people'],
  landscape: Landscape | null = null,
): SceneLabor | null {
  const labor = laborReport(state);
  if (!labor) return null;
  // na setiny, ale nic, co dnes práci dostalo, nezmizí – i drobná práce na stavbě je stavba,
  // která roste, a u ní má někdo stát (villagers.md); díly čela polní práce jdou do podílu
  // (`parts`), cíl zůstane pole
  const shares = [...labor.shares, ...(labor.aside ?? [])].flatMap((share): SceneLaborShare[] => {
    if (share.manDays <= 0) return [];
    const manDays = Math.max(0.01, Math.round(share.manDays * 100) / 100);
    if (share.target.kind === 'field' && share.target.parts) {
      const { parts, progress, ...target } = share.target;
      return [{ ...share, target, manDays, parts, ...(progress ? { progress } : {}) }];
    }
    return [{ ...share, manDays }];
  });
  const homes = sceneLaborHomes(state, labor.shares);
  const persons = scenePersons(state, labor.day);
  const lord = sceneLord(state, labor.lord, labor.day);
  const shoeing = sceneShoeing(state, labor.day, landscape);
  return {
    day: labor.day,
    month: dateOfDayIndex(labor.day).month,
    people,
    shares,
    ...(labor.herders ? { herders: { ...labor.herders } } : {}),
    ...(labor.slaughterHeads ? { slaughter: { ...labor.slaughterHeads } } : {}),
    ...(homes.length > 0 ? { homes } : {}),
    ...(persons.length > 0 ? { persons } : {}),
    ...(lord ? { lord } : {}),
    ...(shoeing ? { shoeing } : {}),
  };
}

/**
 * Kolik herních dní dozadu scéna dostává kování (≈ 1 skutečná hodina – kovář jde ve skutečném
 * čase chůzí přes půl mapy a kuje každého koně dvě minuty; návrh Clauda, villagers.md – Činnosti
 * od začátku do konce).
 */
export const SHOEING_VIEW_DAYS = 40;

/**
 * Poslední kování pro scénu (horses.md – Kování, Ve scéně): nejnovější den s kováním za
 * `SHOEING_VIEW_DAYS` (kronika `horses-shod`), z jádra `shoeingDay` – koně a u cizího kováře cesta
 * ze směru souseda (zemská stezka, jinak čára krajinou jako nákup u sousedů).
 */
function sceneShoeing(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): SceneShoeing | null {
  let shodDay: number | null = null;
  // kronika je od nejstarší – odzadu, jen posledních SHOEING_VIEW_DAYS dní
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const entry = state.chronicle[i]!;
    if (entry.day <= day - SHOEING_VIEW_DAYS) break;
    if (entry.day <= day && entry.kind === 'horses-shod') {
      shodDay = entry.day;
      break;
    }
  }
  const today = shodDay === null ? null : shoeingDay(state, shodDay, landscape);
  if (!today || shodDay === null) return null;
  const route = today.route;
  return {
    day: shodDay,
    own: today.own,
    horses: today.horses.map((h) => ({ pen: h.penId, id: h.horseId })),
    ...(route && route.trailId !== null ? { trailId: route.trailId } : {}),
    ...(route && route.trailId === null ? { line: purchaseLine(state, route) } : {}),
  };
}

/**
 * Vedlejší manželky mimo dvorec, které vojvoda navštěvuje (lord.md – Rod vojvody, Manželky; jen
 * vzhled): v pořadí podle id – scéna je střídá po cyklech dne rodiny (lord-day.ts). Bez nich prázdné.
 */
export function visitedWives<W extends { id: number; dwellingId: number }>(
  wives: readonly W[],
  manor: number,
): W[] {
  return wives.filter((w) => w.dwellingId !== manor).sort((a, b) => a.id - b.id);
}

/**
 * Vojvodova rodina dne pro scénu (lord.md – Ve scéně): z cvičící rodiny (`trainingFamily`) a počtů
 * dne (`LaborDay.lord`). Na poli jsou napřed nejmladší dospělí muži a ženy rodiny (jádro dává jen počty
 * `lordDayCounts`, jména volí scéna), chlapci cvičí vždy; ostatní cvičí hodiny podle věku (`trainingHours`; jezdí
 * jen ten, kdo má koně – `Horse.riderId`) a ženy vedou domácnost dvorce. Bez cvičící rodiny null.
 */
function sceneLord(state: VillageState, counts: LaborDay['lord'], day: number): SceneLord | null {
  const family = counts ? trainingFamily(state, day) : null;
  if (!family || !counts) return null;
  const home = family.lord?.dwellingId;
  if (home === undefined) return null;
  const riders = new Set<number>();
  for (const pen of state.pens ?? []) {
    for (const horse of pen.horses ?? [])
      if (horse.riderId !== undefined) riders.add(horse.riderId);
  }
  const atField = (people: Person[], count: number): Set<number> =>
    new Set(
      people
        .filter((p) => ageGroup(p, day) !== 'child')
        // jádro pořadí na poli neurčuje (jen počty) – návrh Clauda: napřed nejmladší dospělí
        // (silnější), vojvoda tak není vždy první
        .sort((a, b) => b.bornDay - a.bornDay || a.id - b.id)
        .slice(0, Math.max(0, count))
        .map((p) => p.id),
    );
  const men = atField(family.trainees, family.trainees.length - counts.training);
  const women = atField(family.household, family.household.length - counts.household);
  // jízdy dne z jádra (horses.md – Kdy a kam se jezdí) – jen jezdci, kteří dnes cvičí
  const rides = lordRides(state, day);
  const scene = (r: LordRide): SceneRide => ({
    id: r.riderId,
    horseId: r.horseId,
    training: r.training,
    hours: r.hours,
  });
  const riding = (rides?.riders ?? []).filter((r) => !men.has(r.riderId)).map(scene);
  const escort = rides?.escort && !men.has(rides.escort.riderId) ? rides.escort : null;
  // vedlejší manželky mimo dvorec se střídají po dnech (podle id, `day % počet`) – jen vzhled
  const wives = visitedWives(family.wivesApart, home);
  const lordId = family.lord?.id;
  const visits =
    wives.length > 0 &&
    lordId !== undefined &&
    family.trainees.some((p) => p.id === lordId && !men.has(p.id));
  return {
    ...(lordId !== undefined ? { lordId } : {}),
    ...(visits && lordId !== undefined
      ? { visit: { lordId, homes: wives.map((w) => w.dwellingId) } }
      : {}),
    ...(riding.length > 0 ? { riders: riding } : {}),
    ...(riding.length > 0 && rides?.trailId != null ? { borderTrailId: rides.trailId } : {}),
    ...(escort
      ? { escort: { ...scene(escort), expeditionId: escort.expeditionId, trailId: escort.trailId } }
      : {}),
    home,
    trainees: family.trainees
      .filter((p) => !men.has(p.id))
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        id: p.id,
        ...trainingHours(p, day, family.lord, rides !== null && riders.has(p.id)),
      })),
    household: family.household
      .filter((p) => !women.has(p.id))
      .map((p) => p.id)
      .sort((a, b) => a - b),
  };
}

/**
 * Obydlené domácnosti pro provoz na cestách (villagers.md – Provoz na cestách): lidé po obydlích
 * a kolik vody jim dnes přivezl vůz (`waterCartShares`).
 */
function sceneLaborHomes(state: VillageState, shares: readonly LaborShare[]): SceneLaborHome[] {
  const people = new Map<number, number>();
  for (const p of state.people) people.set(p.dwellingId, (people.get(p.dwellingId) ?? 0) + 1);
  const cart = waterCartShares(state, shares);
  return state.dwellings
    .filter((d) => (people.get(d.id) ?? 0) > 0)
    .map((d) => {
      const water = cart.get(d.id);
      return { id: d.id, people: people.get(d.id)!, ...(water ? { cartWater: water } : {}) };
    });
}

/**
 * Kolik vody (0–1 po desetinách) dnes přivezl vůz v sudech kterým domácnostem (wagons.md – Co vozy
 * vozí): týž plán jako simulace (`waterCartPlan` – domácnostem nejdál od vody první) s vozy podílu
 * `haul` s vodou, jejich druhem (`fourWheel`) a uloženou jízdou toho druhu k břehu
 * (`storedWaterCartDrive`); domácnosti dílen, které dnes pracují, lidé na cestě pro kování a dvorec
 * cvičící rodiny nosí vodu sami (`waterHouseholdsToday`).
 * Jen vzhled – podle toho chodí ve scéně pro vodu pěšky méně lidí.
 */
function waterCartShares(state: VillageState, shares: readonly LaborShare[]): Map<number, number> {
  const out = new Map<number, number>();
  const share = shares.find((s) => s.activity === 'haul' && s.job === 'water');
  if (!share) return out;
  // týž druh vozu a jeho břeh jako vítězný plán simulace (simulate-hauls – voda tím druhem vozů,
  // který ušetří víc; čtyřkoláky v podílu `fourWheel`)
  const kind = share.fourWheel ? 'four-wheel' : 'two-wheel';
  const drive = storedWaterCartDrive(state, kind);
  if (!drive) return out;
  const working = new Set<number>();
  for (const s of shares) {
    if (s.activity !== 'craft') continue;
    if (s.target.kind === 'dwelling' || s.target.kind === 'kiln') working.add(s.target.id);
  }
  // týž výběr domácností jako simulace (`waterHouseholdsToday` – bez dílen, kování a dvorce
  // cvičící rodiny vojvody)
  const households = waterHouseholdsToday(state, state.lastDay, working);
  const plan = waterCartPlan(households, share.carts ?? 1, drive, kind);
  if (!plan || plan.litres <= 0) return out;
  const perLitre = plan.crew / plan.litres;
  households.forEach((h, k) => {
    // přivezený podíl z přirážky, která domácnosti zbyla (waterCartPlan: přirážka × (1 − podíl)
    // + posádka za přivezené litry)
    const rest = h.labor - perLitre * h.people * CART_JOBS.water.litresPerPerson;
    if (rest <= 1e-9) return;
    const served = Math.round(((h.labor - (plan.water[k] ?? h.labor)) / rest) * 10) / 10;
    if (served > 0) out.set(h.dwellingId, Math.min(1, served));
  });
  return out;
}

/**
 * Pozemek ze scény pro kontrolu umístění  – i s dvorem dvorce (trade.md)
 * a natočený (střed a natočení čtverce – fields.md, Natočené stavby).
 */
export function plotOfScene(plot: ScenePlot): DwellingPlot {
  return {
    cell: plot.cell,
    variant: plot.variant,
    ...(plot.yard ? { yard: plot.yard.cell } : {}),
    ...(plot.rotation !== undefined && !plot.yard
      ? { square: { x: plot.x, z: plot.z, rotation: plot.rotation } }
      : {}),
  };
}

/**
 * Data pro kontrolu umístění v prohlížeči (`checkDwellingPlacement`, `fieldPartsFromCells`,
 * `cemeteryPartsFromCells`, `orchardPartsFromCells`) ze scény vsi – hotová i rozestavěná obydlí
 * jako obydlí, pole podle čtverců dílů, pohřebiště a sady podle svých čtverců, odstraněné
 * a pokácené překážky a vyhrazené stromy – náhled pak spočítá totéž co server.
 */
export function placementVillageFromScene(scene: SceneVillage): PlacementVillage {
  // kontrola běží při každém pohybu kurzoru nad stejnou scénou – stejná ves (i rejstřík čtverců
  // staveb v jádru, který se pamatuje podle seznamů staveb)
  const cached = placementCache.get(scene);
  if (cached) return cached;
  const village = scenePlacementVillage(scene);
  placementCache.set(scene, village);
  return village;
}

const placementCache = new WeakMap<SceneVillage, PlacementVillage>();

function scenePlacementVillage(scene: SceneVillage): PlacementVillage {
  return {
    dwellings: scene.dwellings.map((d) => ({
      type: d.type,
      position: d.position,
      // pozemek i s dvorem dvorce (trade.md) a natočením (fields.md – Natočené stavby)
      ...(d.plot ? { plot: plotOfScene(d.plot) } : {}),
      ...(d.craft ? { workshop: { craft: d.craft } } : {}),
      ...(d.plainShape ? { plainShape: true } : {}),
    })),
    // stavba opevnění zabírá celý obvod (`fortificationBand`) – ostatní stavby ji neznají
    constructions: (scene.forts ?? [])
      .filter((f) => f.building)
      .map((f) => ({ dwellingType: null, position: null, fortificationId: f.id })),
    // opevnění vsi – pás zabírá místo jiným stavbám a opevnění se nesmí dotknout jiného
    ...(scene.forts
      ? {
          fortifications: scene.forts.map((f) => ({
            id: f.id,
            grid: f.grid,
            cells: f.cells,
            kind: f.kind,
            segments: f.segments,
          })),
        }
      : {}),
    // natočená pole (fields.md – Natočené stavby) – díly jsou čtverce v jejich mřížce
    fields: scene.fields.map((f) => ({ id: f.id, ...(f.grid ? { grid: f.grid } : {}) })),
    // pole a plocha dílu (políčko) pro navazující pole – rozšíření a sloučení (fields.md)
    parts: scene.fields.flatMap((f) =>
      f.parts.map((p) => ({
        ...(p.id !== undefined ? { id: p.id } : {}),
        cell: p.cell,
        fieldId: f.id,
        areaM2: p.size * p.size,
      })),
    ),
    cemeteries: (scene.cemeteries ?? []).map((c) => ({
      ...(c.grid ? { grid: c.grid } : {}),
      squares: c.squares.map((s) => ({ cell: s.cell })),
    })),
    // plocha čtverce (políčko) pro varování, že sad stavbou obydlí zanikne
    orchards: (scene.orchards ?? []).map((o) => ({
      ...(o.grid ? { grid: o.grid } : {}),
      squares: o.squares.map((s) => ({ cell: s.cell, areaM2: s.size * s.size })),
    })),
    // ohrady po čtvercích s druhem – rozšíření jen ohrady téhož druhu (oxen.md)
    pens: (scene.pens ?? []).map((pen) => ({
      id: pen.id,
      species: scenePenSpecies(pen),
      cell: pen.cell,
      ...(pen.extraSquares ? { extraSquares: pen.extraSquares } : {}),
      ...(pen.grid ? { grid: pen.grid } : {}),
    })),
    // les vsi – pole ho vymýtí jako les, ostatní stavby ho vyklučí jako les krajiny (fields.md)
    ...(scene.woods
      ? {
          woods: scene.woods.map((w) => ({ cell: w.cell, ...(w.grid ? { grid: w.grid } : {}) })),
        }
      : {}),
    ...(scene.obstacles ? { obstacleChanges: scene.obstacles } : {}),
    ...(scene.reservedTrees ? { reservedTrees: scene.reservedTrees } : {}),
    ...(scene.sacred
      ? {
          sacredBuildings: scene.sacred.buildings.map((b) => ({
            kind: b.kind,
            position: b.position,
          })),
        }
      : {}),
    // humna i rozestavěná – zabírají půdorys (production-chains.md – Humno)
    ...(scene.threshingFloors
      ? { threshingFloors: scene.threshingFloors.map((f) => ({ position: f.position })) }
      : {}),
    ...(scene.toolCoverage ? { toolCoverage: scene.toolCoverage } : {}),
    ...(scene.ploughTeam ? { ploughTeam: true } : {}),
    // pevné cesty – kácení u kurzoru chůzí jako na serveru (roads.md)
    ...(scene.roads ? { walkRoads: scene.roads } : {}),
    // milíře uhlířů – samostatné stavby, přes ně stavět nejde (crafts.md – Milíř u skácených buků)
    ...(scene.kilns?.length ? { kilns: scene.kilns.map((k) => ({ x: k.x, z: k.z })) } : {}),
  };
}
