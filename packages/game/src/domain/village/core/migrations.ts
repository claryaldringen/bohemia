import type { Landscape, ObstacleLayer } from '../../landscape';
import { withArmsCaps } from '../people/arms-caps';
import { withAwaitingLord } from '../people/appoint-lord';
import { withoutTrampledParts } from '../crafts/cart-jobs';
import { withoutSameMapVillages } from '../crafts/cart-iron';
import { needsFourWheelReach, withFourWheelReach } from '../crafts/carts';
import { withCattleKinds } from '../trade/cattle-trade';
import { cloneState } from './clone';
import { withCraftSkill } from '../crafts/craft-skill';
import { withDynasty } from '../people/dynasty';
import { withoutFieldLegumes } from '../fields/field-legumes';
import { withMergedFields } from '../fields/fields';
import { withForestClearing } from '../forest/forest-clearing-migration';
import { needsFortPoints, withFortPoints } from '../fortification/convert';
import { withoutGardenFlax } from '../fields/garden';
import { withGrainPits } from '../fields/grain-pit-site';
import { withHorsePenStock } from '../livestock/horse-stock';
import { withToolEquipment } from '../crafts/iron';
import { withKinship } from '../people/kinship';
import { withRoadLogPiles } from '../forest/log-piles-migration';
import { withoutSowingHelp } from '../people/lord';
import { withManor } from '../people/manor';
import { withoutSurplusCrops } from '../fields/merge-surplus';
import { withObstacleClearing } from './obstacles';
import { withOxen } from '../livestock/oxen';
import { withRoadCondition } from '../paths/road-condition';
import { withPlannedLining } from '../paths/road-lining';
import { withMergedRoads } from '../paths/roads-form';
import { withoutWalkStages } from '../paths/village';
import { withVisitsSeed, withWearCells, withWearSeed } from '../paths/wear';
import { withPenGrace, withPenSpecies } from '../livestock/pens';
import { withForestDistances, withLivestockLand } from '../placement/placement-squares';
import { withPlots } from '../buildings/plots';
import { withBridgedRoads } from '../roads/road-upgrades';
import { withRoadSwaths } from '../roads/road-swath';
import { withSowingRotation, withoutRotationNext } from '../fields/rotation';
import { withCharredRuins } from '../buildings/ruins';
import { withChurchQuarryDistance } from '../buildings/church-build';
import { withSeedForgiven, withoutSeedTarget } from '../fields/seed';
import { withDwellingShapes } from '../buildings/shape-migration';
import { withSteward } from '../steward/steward-state';
import { withThreshingGrace } from '../fields/threshing';
import { withIronBarsTrade, withoutForeignGoods } from '../trade/trade';
import type { VillageState } from '../types';
import { withWeatherSeed } from '../disasters/weather';
import { withWildlife } from '../wildlife/wildlife';
import { withSeason } from './year-plan';

// Převody starších vsí (village-core.md – Převody starších vsí): jeden seřazený seznam, který
// volá načtení vsi (`updateVillage`) i dopočet (`advanceVillage`) – každý převod jednou, vždy ve
// stejném pořadí. Převod je jednorázový a idempotentní (ves, které nic nechybí, vrací týž objekt)
// a vstupní stav nemění. Nový převod patří na konec seznamu (pravidlo v village-core.md).

/** Načtení vsi (`updateVillage`): den, do kterého se ves dopočítá, seed počasí mapy a krajina. */
export interface VillageLoadContext {
  readonly today: number;
  readonly weatherSeed: number | null;
  readonly landscape: Landscape;
  readonly obstacles: ObstacleLayer;
}

/**
 * Kontext převodů: vrstva překážek a krajina sídla (u dopočtu bez nich jen testy a měření); `load`
 * jen při načtení vsi – bez něj (dopočet) se převody `loadOnly` přeskočí.
 */
export interface VillageMigrationContext {
  readonly obstacles: ObstacleLayer | null;
  readonly landscape: Landscape | null;
  readonly load?: VillageLoadContext;
}

/**
 * Převod starší vsi: `id` (jméno, jedinečné), `since` (den zavedení, RRRR-MM-DD) a `run`. Převod
 * `loadOnly` běží jen při načtení vsi – dopočet ho přeskočí (proč: tabulka ve village-core.md).
 */
export type VillageMigration =
  | {
      readonly id: string;
      readonly since: string;
      readonly loadOnly?: false;
      readonly run: (state: VillageState, ctx: VillageMigrationContext) => VillageState;
    }
  | {
      readonly id: string;
      readonly since: string;
      readonly loadOnly: true;
      readonly run: (state: VillageState, ctx: VillageLoadContext) => VillageState;
    };

/**
 * Pořadí běhu = pořadí, ve kterém převody dosud skutečně běžely: nejdřív řetěz načtení vsi, pak
 * převody, které uměl jen dopočet (village-core.md – Převody starších vsí). Nový převod na konec.
 */
export const VILLAGE_MIGRATIONS: readonly VillageMigration[] = [
  // vsi rodu na téže mapě jsou zrušené (migration.md) – zbytky se zahodí
  { id: 'same-map-villages', since: '2026-11-02', loadOnly: true, run: withoutSameMapVillages },
  // kopie seedu počasí mapy (disasters.md – Kraj) – seed drží úložiště
  {
    id: 'weather-seed',
    since: '2026-10-27',
    loadOnly: true,
    run: (s, ctx) => withWeatherSeed(s, ctx.weatherSeed),
  },
  // roční plán → hospodářský rok a osevní postup po dílech (fields.md – bod 7)
  { id: 'season', since: '2026-10-25', run: withSeason },
  { id: 'sowing-rotation', since: '2026-10-25', run: withSowingRotation },
  // odstraněné překážky, vzdálenost k lesu, pozemky, varianty rozměrů domů (population.md),
  // sloučená pole, dobytek s pastvou (diet.md)
  {
    id: 'obstacle-clearing',
    since: '2026-10-17',
    loadOnly: true,
    run: (s, ctx) => withObstacleClearing(s, ctx.obstacles),
  },
  {
    id: 'forest-distances',
    since: '2026-10-17',
    loadOnly: true,
    run: (s, ctx) => withForestDistances(s, ctx.landscape),
  },
  {
    id: 'plots',
    since: '2026-10-18',
    loadOnly: true,
    run: (s, ctx) => withPlots(s, ctx.landscape, ctx.obstacles),
  },
  {
    id: 'dwelling-shapes',
    since: '2026-10-20',
    loadOnly: true,
    run: (s, ctx) => withDwellingShapes(s, ctx.landscape, ctx.obstacles),
  },
  { id: 'merged-fields', since: '2026-10-18', loadOnly: true, run: withMergedFields },
  {
    id: 'livestock-land',
    since: '2026-10-18',
    loadOnly: true,
    run: (s, ctx) => withLivestockLand(s, ctx.landscape),
  },
  // zvěř na stropu (wildlife.md) – i nová ves, zakládání ji nemá (domácí foundVillage je bez krajiny)
  { id: 'wildlife', since: '2026-10-26', run: (s, ctx) => withWildlife(s, ctx.landscape) },
  // spojené cesty a průsek lesem (roads.md – Průsek lesem)
  {
    id: 'merged-roads',
    since: '2026-10-18',
    loadOnly: true,
    run: (s, ctx) => withMergedRoads(s, ctx.landscape),
  },
  {
    id: 'road-swaths',
    since: '2026-10-19',
    loadOnly: true,
    run: (s, ctx) => withRoadSwaths(s, ctx.obstacles, ctx.landscape),
  },
  // pohlaví a manželé (kinship.md), rod vojvody (lord.md – Převod starších vsí)
  { id: 'kinship', since: '2026-10-18', run: (s) => withKinship(s) },
  { id: 'dynasty', since: '2026-10-24', run: withDynasty },
  // obchod: tři druhy dobytka, hřivny místo nástrojů, jen společné suroviny (trade.md,
  // production-chains.md – Kovář)
  { id: 'cattle-kinds', since: '2026-10-20', run: withCattleKinds },
  { id: 'tool-equipment', since: '2026-10-21', run: withToolEquipment },
  { id: 'iron-bars-trade', since: '2026-10-21', run: withIronBarsTrade },
  { id: 'foreign-goods', since: '2026-10-19', run: withoutForeignGoods },
  // ohrady podle druhu a roční odklad míst od dneška (oxen.md – Ohrady podle druhu); odklad
  // mlácení od dneška (production-chains.md – Starší vsi) – při dopočtu od dne po `lastDay`
  { id: 'pen-species', since: '2026-10-19', run: withPenSpecies },
  {
    id: 'pen-grace',
    since: '2026-10-19',
    loadOnly: true,
    run: (s, ctx) => withPenGrace(s, ctx.today),
  },
  {
    id: 'threshing-grace',
    since: '2026-10-20',
    run: (s, ctx) => withThreshingGrace(s, ctx.load?.today),
  },
  // ohořelé jámy (disasters.md – Požár), cesty a stálé trasy (paths.md – Stálé trasy; roads.md)
  { id: 'charred-ruins', since: '2026-10-31', loadOnly: true, run: withCharredRuins },
  { id: 'walk-stages', since: '2026-10-26', loadOnly: true, run: withoutWalkStages },
  { id: 'planned-lining', since: '2026-10-31', loadOnly: true, run: withPlannedLining },
  { id: 'trampled-parts', since: '2026-10-26', loadOnly: true, run: withoutTrampledParts },
  { id: 'bridged-roads', since: '2026-10-24', loadOnly: true, run: withBridgedRoads },
  // voli po kusech (oxen.md), koně ohrady (horses.md)
  { id: 'oxen', since: '2026-10-20', run: withOxen },
  { id: 'horse-pen-stock', since: '2026-10-26', run: withHorsePenStock },
  // dvorec vojvody (trade.md), vyšlapanost, provoz a stav cest (paths.md – Převod starých vsí),
  // obilné jámy (production-chains.md – Obilné jámy)
  { id: 'manor', since: '2026-10-18', loadOnly: true, run: withManor },
  { id: 'wear-seed', since: '2026-10-24', loadOnly: true, run: withWearSeed },
  { id: 'wear-cells', since: '2026-10-26', loadOnly: true, run: withWearCells },
  { id: 'visits-seed', since: '2026-10-24', loadOnly: true, run: withVisitsSeed },
  { id: 'road-condition', since: '2026-10-24', loadOnly: true, run: withRoadCondition },
  {
    id: 'grain-pits',
    since: '2026-10-20',
    loadOnly: true,
    run: (s, ctx) => withGrainPits(s, ctx.landscape, ctx.obstacles),
  },
  // fáze klučení rozestavěných dílů v lese a hromada klád na dnešním místě (forest.md)
  {
    id: 'forest-clearing',
    since: '2026-10-26',
    run: (s, ctx) => withForestClearing(s, ctx.obstacles),
  },
  {
    id: 'road-log-piles',
    since: '2026-11-08',
    loadOnly: true,
    run: (s, ctx) => withRoadLogPiles(s, ctx.landscape),
  },
  // pole bez pevného sledu, odpuštěné osivo, díly nad potřebu jednou frontou, plán bez cíle
  // osevu, rodina bez pomoci s osevem, bez luštěnin na poli a lnu na zahrádce (fields.md, lord.md)
  { id: 'rotation-next', since: '2026-11-10', run: withoutRotationNext },
  { id: 'seed-forgiven', since: '2026-10-27', run: withSeedForgiven },
  { id: 'surplus-crops', since: '2026-11-09', run: withoutSurplusCrops },
  { id: 'seed-target', since: '2026-11-09', run: withoutSeedTarget },
  { id: 'sowing-help', since: '2026-11-09', run: withoutSowingHelp },
  { id: 'field-legumes', since: '2026-11-09', run: withoutFieldLegumes },
  { id: 'garden-flax', since: '2026-11-09', run: withoutGardenFlax },
  // strop dovedností (war.md – Síla; nová ves ho má od založení), čekání na vojvodu
  // (lord.md), praxe řemeslníků (crafts.md – Učení řemesla), správce (steward.md)
  { id: 'arms-caps', since: '2026-11-06', run: withArmsCaps },
  { id: 'awaiting-lord', since: '2026-11-05', run: withAwaitingLord },
  { id: 'craft-skill', since: '2026-10-20', run: withCraftSkill },
  { id: 'steward', since: '2026-10-30', run: withSteward },
  // dosahy čtyřkoláku po loukách (wagons.md) a opevnění z bodů (fortifications.md – Obvod z bodů)
  { id: 'four-wheel-reach', since: '2026-10-20', run: fourWheelReach },
  { id: 'fort-points', since: '2026-11-07', run: fortPoints },
  // lámání kostela s nošením v nůších (fortifications.md – Kámen, Nošení kamene a vůz)
  { id: 'church-quarry-carry', since: '2026-11-12', run: withChurchQuarryDistance },
];

/** `withFourWheelReach` mutuje – na kopii, jen když ves převod potřebuje. */
function fourWheelReach(state: VillageState): VillageState {
  if (!needsFourWheelReach(state)) return state;
  const next = cloneState(state);
  withFourWheelReach(next);
  return next;
}

/** `withFortPoints` mutuje a potřebuje rozměry krajiny – na kopii, jen když ves převod potřebuje. */
function fortPoints(state: VillageState, ctx: VillageMigrationContext): VillageState {
  if (!ctx.landscape || !needsFortPoints(state)) return state;
  const next = cloneState(state);
  withFortPoints(next, ctx.landscape);
  return next;
}

/**
 * Projde seznam převodů (`VILLAGE_MIGRATIONS`) v jeho pořadí; bez `ctx.load` (dopočet) přeskočí
 * převody `loadOnly`. Vstupní stav nemění; ves, které nic nechybí, vrací týž objekt.
 */
export function migrateVillage(state: VillageState, ctx: VillageMigrationContext): VillageState {
  let next = state;
  for (const migration of VILLAGE_MIGRATIONS) {
    if (!migration.loadOnly) next = migration.run(next, ctx);
    else if (ctx.load) next = migration.run(next, ctx.load);
  }
  return next;
}
