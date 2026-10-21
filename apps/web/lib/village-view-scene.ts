// Sestavení dat scény vsi, rozdělení práce dne a data pro kontrolu umístění.

import {
  SceneThreshingFloor,
  sceneMound,
  scenePlot,
  SceneFieldPart,
  SceneHayMeadow,
  SceneLabor,
  SceneLaborHome,
  SceneLaborShare,
  SceneVillage,
} from './village-view-scene-types';
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
  scenePloughApproach,
  workshopSmokes,
} from './village-view-crafts';
import {
  cemeteryProgress,
  sceneOrchardSquare,
  scenePenSpecies,
  scenePens,
  sceneSacred,
  wearOf,
} from './village-view-buildings';
import { FLAX_BLOOM_MONTH, scenePart } from './village-view-fields';
import {
  wagonHome,
  ableTeams,
  oxPens,
  ploughPairsHome,
  ploughsThisYear,
  householdWater,
  waterCartPlan,
  CART_JOBS,
  dateOfDayIndex,
  fieldPartLooks,
  hayMeadowLooks,
  obstacleChangesAt,
  laborReport,
  partStage,
  partOvergrowthYears,
  pastureGrazedParts,
  isGrazeableFallow,
  reservedTrees,
  ruinOvergrowth,
  oldGraves,
  structureCondition,
  tileCenterWorld,
  wholeLogs,
  type ConstructionSummary,
  type LaborShare,
  type Landscape,
  type PlacementVillage,
  type VillageState,
  type VillageSummary,
  villageCemeteries,
  villageOrchards,
} from '@bohemia/game';
import { sceneGrainPits } from './grain-pit-view';
import { foreignFromScene, plotOfScene } from './scene/neighbour-villages';
import { sceneFunerals } from './funeral-view';
import { scenePersons } from './person-view';
import { sceneWeddings } from './wedding-view';

export function sceneVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): SceneVillage {
  const constructions = summary.constructions;
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const built = state.dwellings.map((d) => ({
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
    ...(d.plainShape ? { plainShape: true as const } : {}),
  }));
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
  const looks = fieldPartLooks(state, day);
  // len kvete v červnu (fields.md – Len)
  const flaxBloom = dateOfDayIndex(day).month === FLAX_BLOOM_MONTH;
  // kam stáda dojdou – jen ves se skutečnými stády (bez nich scéna stáda odvodí z domácností)
  const grazed = state.livestock ? pastureGrazedParts(state, day) : null;
  // ves letos orá rádlem – celé pole má kulaté rohy (oxen.md – Jen rádlo)
  const ard = ploughsThisYear(state);
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
          ...(p.state === 'sown' &&
          p.crop === 'flax' &&
          flaxBloom &&
          looks.get(p.id)?.look === 'green'
            ? { bloom: true as const }
            : {}),
          ...(years > 0 ? { overgrowth: years } : {}),
          ...(grazed && isGrazeableFallow(p) ? { grazed: grazed.has(p.id) } : {}),
          ...(p.roadCut ? { roadCut: [...p.roadCut] } : {}),
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
    squares: o.squares.map((s) =>
      sceneOrchardSquare(landscape, s, day, state.orchardWork ?? null, o.grid),
    ),
  }));
  const funerals = sceneFunerals(state, day);
  const weddings = sceneWeddings(state, day, landscape);
  const reserved = [...reservedTrees(state)].sort((a, b) => a - b);
  const labor = sceneLabor(state, { ...summary.people, ...summary.family });
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
  const ruins = (state.ruins ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    position: r.position,
    since: r.day,
    overgrowth: Math.round(ruinOvergrowth(r, day) * 1000) / 1000,
    ...(r.plot ? { plot: scenePlot(landscape, r.plot) } : {}),
    ...(r.craft ? { craft: r.craft } : {}),
    ...(r.plainShape ? { plainShape: true as const } : {}),
  }));
  const pens = scenePens(state, landscape, day, summary);
  const earthworks = sceneEarthworks(state, day);
  const home = wagonHome(state);
  const carts = sceneCarts(state, day, landscape, fields);
  const ploughApproach = scenePloughApproach(state, day, landscape, fields);
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
  const penned = pens.reduce((sum, pen) => sum + pen.cows, 0);
  const herds = summary.livestock.herds;
  const threshingFloors = sceneThreshingFloors(state, constructions);
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
    woodLogs: wholeLogs(state.woodLogs ?? 0),
    ...(labor ? { labor } : {}),
    ...(sacred ? { sacred } : {}),
    ...(threshingFloors.length > 0 ? { threshingFloors } : {}),
    livestock: { ...herds, cow: Math.max(0, herds.cow - penned) },
    ...(hayMeadows.length > 0 ? { hayMeadows } : {}),
    ...(pens.length > 0 ? { pens } : {}),
    ...(summary.crafts.coverage.tools > 0 ? { toolCoverage: summary.crafts.coverage.tools } : {}),
    ...(ableTeams(state, day) > 0 ? { ploughTeam: true as const } : {}),
    ...(oxPens(state).length > 0 ? { ploughPairs: ploughPairsHome(state, day) } : {}),
    ...(roads.length > 0 ? { roads } : {}),
    ...(roadTrees.length > 0 ? { roadTrees } : {}),
    ...(woods.length > 0 ? { woods } : {}),
    ...(kilns.length > 0 ? { kilns } : {}),
    ...(kilnRemnants.length > 0 ? { kilnRemnants } : {}),
    ...(grainPits.length > 0 ? { grainPits } : {}),
    ...(plantedSaplings.length > 0 ? { plantedSaplings } : {}),
    ...(roadApples.length > 0 ? { roadApples } : {}),
    ...(carts.length > 0 ? { carts } : {}),
    ...(ploughApproach ? { ploughApproach } : {}),
    ...(earthworks.length > 0 ? { earthworks } : {}),
    ...(home
      ? { home: { x: Math.round(home.x * 100) / 100, z: Math.round(home.z * 100) / 100 } }
      : {}),
  };
}

/** Humna pro scénu (production-chains.md – Humno) – rozestavěná s průběhem stavby. */
function sceneThreshingFloors(
  state: VillageState,
  constructions: readonly ConstructionSummary[],
): SceneThreshingFloor[] {
  return (state.threshingFloors ?? []).map((f) => {
    const built = f.builtDay !== null;
    return {
      id: f.id,
      position: f.position,
      built,
      progress: built ? 1 : (constructions.find((c) => c.id === f.id)?.buildProgress ?? 0),
    };
  });
}

/** Rozdělení práce posledního dne pro postavy – člověkodny na setiny (drobné podíly 0,01). */
function sceneLabor(state: VillageState, people: SceneLabor['people']): SceneLabor | null {
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
  return {
    day: labor.day,
    month: dateOfDayIndex(labor.day).month,
    people,
    shares,
    ...(labor.herders ? { herders: { ...labor.herders } } : {}),
    ...(homes.length > 0 ? { homes } : {}),
    ...(persons.length > 0 ? { persons } : {}),
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
 * `haul` s vodou a uloženou jízdou k břehu; domácnosti dílen, které dnes pracují, nosí vodu samy.
 * Jen vzhled – podle toho chodí ve scéně pro vodu pěšky méně lidí.
 */
function waterCartShares(state: VillageState, shares: readonly LaborShare[]): Map<number, number> {
  const out = new Map<number, number>();
  const share = shares.find((s) => s.activity === 'haul' && s.job === 'water');
  const drive = state.waterCart?.drive;
  if (!share || !drive) return out;
  const working = new Set<number>();
  for (const s of shares) {
    if (s.activity !== 'craft') continue;
    if (s.target.kind === 'dwelling' || s.target.kind === 'kiln') working.add(s.target.id);
  }
  const villagers =
    working.size > 0 ? state.people.filter((p) => !working.has(p.dwellingId)) : state.people;
  const households = householdWater(villagers, state.dwellings);
  const plan = waterCartPlan(households, share.carts ?? 1, drive);
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
    constructions: [],
    // stavby a půda jiných vsí na téže mapě (migration.md)
    ...(foreignFromScene(scene) ? { foreign: foreignFromScene(scene) } : {}),
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
