import { TOTAL_GAME_DAYS } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import {
  burialOrder,
  cemeteryCapacity,
  freeGraves,
  readySquares,
  villageCemeteries,
} from './cemetery';
import { craftCoverage, craftNeeds, craftStocks, oreFactor, workshopLabor } from './crafts';
import { isFull, isOvercrowded } from './dwellings';
import { waitingHouseholds } from './households';
import { familyCounts, type FamilyCounts } from './kinship';
import { fallowStage } from './fields';
import {
  happinessFactors,
  happinessLaborFactor,
  happinessTarget,
  villageHappiness,
  type HappinessFactors,
} from './happiness';
import { dailyMilk, villageCheeseKg, yearlyMilk } from './dairy';
import { villageMeal, villageMeatKg } from './diet';
import { villageHayKg } from './hay';
import { villageLegumesKg } from './legumes';
import {
  dailyEggsKg,
  grazingDemandHa,
  legumeNeedPerYear,
  meatNeedPerYear,
  pastureHa,
  pigForestHa,
  villageChickens,
  villageHerds,
} from './livestock';
import { OXEN, teamAgeYears, trainingBlock, trainingProgress, villagePens } from './oxen';
import {
  orchardAgeYears,
  orchardAreaM2,
  orchardExpectedYieldKg,
  villageApplesKg,
  villageOrchards,
} from './orchard';
import { ageGroup, foodNeedPerDay, occupants } from './people';
import { CHARCOAL_KILN, CHRONICLE_MAX_EVENTS, DWELLINGS, STARVATION } from './rules';
import {
  groveHappiness,
  sacredBuildingHappiness,
  villageGroves,
  villageSacredBuildings,
  villageSacredOaks,
} from './sacred';
import { sacredOakNow, type SacredOakNow } from './sacred-life';
import type {
  CharcoalKiln,
  KilnStage,
  Construction,
  ConstructionKind,
  Craft,
  CraftCoverage,
  CraftStocks,
  DietDay,
  DwellingType,
  FallowStage,
  FieldPart,
  HerdSpecies,
  Position,
  SacredBuildingKind,
  TileCell,
  VillageState,
  WorkshopActivity,
  RoadGrade,
} from './types';
import { treesToFell, woodFellingCost, woodLogs } from './wood';

// Souhrn vsi pro panel hráče a scénu – jen čte stav, nic nemění.

/**
 * Stadium dílu pro scénu: zakládá se, připravený, osetý, nebo příloh – mladý příloh 1–2 roky,
 * pak louka (pastvina, louka na seno); nepasený a nesečený příloh zarůstá křovinami a mladým
 * lesem (fields.md – Zarůstání).
 */
export type PartStage = 'founding' | 'ready' | 'sown' | FallowStage;

export interface HouseholdSummary {
  dwellingId: number;
  type: DwellingType;
  /** Řemeslo dílny (crafts.md); obyčejné obydlí null. */
  craft: Craft | null;
  occupants: number;
  /** Muži, ženy, děti, starší a manželské páry domácnosti (kinship.md – panel obydlí). */
  family: FamilyCounts;
  capacity: number;
  full: boolean;
  overcrowded: boolean;
  condition: number;
}

export interface ConstructionSummary {
  id: number;
  kind: ConstructionKind;
  dwellingType: DwellingType | null;
  /** Stavěná řemeslná dílna (crafts.md), jinak null. */
  craft: Craft | null;
  dwellingId: number | null;
  fieldId: number | null;
  /** Výměra zakládaného pole (m²), u obydlí null. */
  areaM2: number | null;
  /** Zakládané pohřebiště a počet jeho čtverců, u ostatních staveb null. */
  cemeteryId: number | null;
  squares: number | null;
  /** Vysazovaný sad, u ostatních staveb null (výměra v `areaM2`). */
  orchardId: number | null;
  /** Průběh 0–1. */
  progress: number;
  /** Průběh samotné stavby bez kácení dřeva 0–1 (staveniště ve scéně). */
  buildProgress: number;
  /** Kolik stromů stavba ještě musí skácet (forest.md). */
  treesToFell: number;
  /**
   * Vylepšení pevné cesty a výsadba jabloní u ní – úseky a stupeň, na který se vylepšují
   * (roads.md); jinak null.
   */
  roadIds: number[] | null;
  roadGrade: RoadGrade | null;
}

/** Pohřebiště pro panel – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
export interface CemeterySummary {
  id: number;
  squares: number;
  /** Vytyčené a ohrazené – přijímá mrtvé. */
  built: boolean;
  capacity: number;
  graves: number;
  freeGraves: number;
  /**
   * Odhad, za kolik let se zaplní – podle úmrtí posledních let a pořadí pohřbívání (nejdřív
   * pohřebiště nejblíž k obydlím). Bez úmrtí null.
   */
  yearsLeft: number | null;
}

/** Jabloňový sad pro panel – plocha, stáří a odhad úrody (orchard.md – Co hráč vidí). */
export interface OrchardSummary {
  id: number;
  areaM2: number;
  squares: number;
  /** Kolik čtverců už je vysazeno. */
  plantedSquares: number;
  /** Stáří v celých letech od výsadby; dokud se nic nevysadilo, null. */
  ageYears: number | null;
  /** Úroda nejbližší sklizně při plné sklizni (kg jablek). */
  expectedYieldKg: number;
}

/** Řemeslná dílna pro panel výběru (crafts.md – Co hráč vidí). */
export interface WorkshopSummary {
  dwellingId: number;
  craft: Craft;
  activity: WorkshopActivity;
  /** Kolik lidí v dílně bydlí. */
  occupants: number;
  /** Práce řemeslu za den po minimu a domácí výrobě (člověkodny, se štěstím). */
  laborPerDay: number;
  /** Přirážka za rudu nebo hlínu dál od potoka (1 = voda blízko). */
  oreFactor: number;
  /**
   * Uhlíř: rozdělaný milíř (crafts.md – Uhlíř) – fáze, kolik buků dávky je připravených z kolika,
   * průběh fáze 0–1 (u pálení dny ÷ CHARCOAL_KILN.burnDays) a jestli stojí v lese; jinak null.
   */
  kiln: {
    stage: KilnStage;
    prepared: number;
    trees: number;
    progress: number;
    forest: boolean;
  } | null;
  /** Uhlíř: pařezy buků, na které ještě zasadí mladý buk; ostatní dílny 0. */
  toPlant: number;
}

/** Řemesla vsi – zásoby, potřeba, pokrytí (meze produktivity) a dílny. */
export interface CraftsSummary {
  stocks: CraftStocks;
  needs: { toolsKg: number; potteryKg: number };
  coverage: CraftCoverage;
  workshops: WorkshopSummary[];
}

/** Štěstí obyvatel pro horní lištu (happiness.md). */
export interface HappinessSummary {
  /** Štěstí 0–100. */
  value: number;
  /** Cílová hodnota, ke které se štěstí posouvá (při zítřejším nasycení). */
  target: number;
  /** Z čeho se cíl skládá (body; ubírající kladně). */
  factors: HappinessFactors;
  /** Násobek veškeré práce vsi (0,8–1,1). */
  laborFactor: number;
}

/** Posvátná místa vsi pro panel výběru a scénu – i kolik které přidává (bez stropů). */
export interface SacredSummary {
  /**
   * Ušetřené posvátné duby – `day` = den ušetření (dub pak ve scéně postupně roste), stadium,
   * stáří, štěstí, velikost a den uschnutí v den souhrnu (`SacredOakNow`).
   */
  oaks: ({ id: number; day: number; x: number; z: number } & SacredOakNow)[];
  groves: {
    id: number;
    x: number;
    z: number;
    cells: TileCell[];
    oaks: number;
    happiness: number;
  }[];
  /** Hotové modly a svatyně (id = id stavby, která je postavila). */
  buildings: { id: number; kind: SacredBuildingKind; position: Position; happiness: number }[];
}

/** Dobytek vsi pro panel (diet.md – Co hráč vidí): stáda, slepice, voli a nosnost. */
export interface LivestockSummary {
  /** Kusy po druzích (zaokrouhleně). */
  herds: Record<HerdSpecies, number>;
  chickens: number;
  /** Voli – spřežení i telata ve výcviku. */
  oxen: number;
  /** Pastva vsi a kolik jí stáda spásají (ha). */
  pastureHa: number;
  grazingHa: number;
  /** Les pro prasata (ha, 1 ha na prase). */
  pigForestHa: number;
  /** Roční potřeba masa vsi (kg) – bílkoviny, které chybí po obilí, mléku, vejcích a luštěninách. */
  meatNeedKg: number;
  /** Kolik luštěnin ves chce za rok sníst (kg – cíl osevu luštěnin bez rezervy). */
  legumeNeedKg: number;
  /** Mléko dnes (l, když se podojí všechny dojné samice) a za rok. */
  milkLPerDay: number;
  milkLPerYear: number;
}

/** Ohrada pro panel výběru a scénu (oxen.md – Co hráč vidí). */
export interface PenSummary {
  id: number;
  cell: TileCell;
  x: number;
  z: number;
  built: boolean;
  /** Vycvičené spřežení: stáří v letech a kolik let ještě slouží; bez spřežení null. */
  team: { ageYears: number; yearsLeft: number } | null;
  /** Výcvik spřežení: průběh 0–1 a zbývající dny; bez výcviku null. */
  training: { progress: number; daysLeft: number } | null;
  /** Proč teď nejde začít výcvik (česky), nebo null. */
  trainBlocked: string | null;
}

export interface VillageSummary {
  people: { children: number; adults: number; elders: number };
  /** Muži, ženy, děti, starší a páry celé vsi (kinship.md) – i pohlaví postav ve scéně. */
  family: FamilyCounts;
  households: HouseholdSummary[];
  storesKg: number;
  /** Zásoby jablek (kg) – jí se před obilím, 1. 3. shnijí. */
  applesKg: number;
  /** Klády na hromadě u vsi (forest.md). */
  woodLogs: number;
  /** Na kolik měsíců zásoby obilí vystačí při dnešní potřebě (bez lidí 0). */
  storesMonths: number;
  /** Nasycení příštího dne 0–1 podle přídělového systému (energie × pestrost – diet.md). */
  satiation: number;
  /** Jídlo příštího dne – energie, pestrost a podíly obilí, masa a ovoce (diet.md). */
  diet: DietDay;
  /** Zásoba masa (kg). */
  meatKg: number;
  /** Zásoba sýra (kg). */
  cheeseKg: number;
  /** Zásoba luštěnin (kg – diet.md, Luštěniny). */
  legumesKg: number;
  /** Zásoba sena (kg). */
  hayKg: number;
  /** Dobytek – stáda, slepice, voli a nosnost. */
  livestock: LivestockSummary;
  /** Ohrady v pořadí založení. */
  pens: PenSummary[];
  /** Průměrná společná práce za den (posledních 30 dní). */
  commonLaborPerDay: number;
  /**
   * Některá domácnost je plná (4 dospělí 14–44) a nečeká na ni žádné nové obydlí – upozornění
   * pro hráče, stavbu nepodmiňuje.
   */
  fullHousehold: boolean;
  constructions: ConstructionSummary[];
  /** Ves hladoví – zásoby nevystačí do sklizně (jako `hunger-began` v kronice). */
  hungry: boolean;
  /** Nahromaděný hlad ve dnech bez jídla (population.md – Hlad a vymření). */
  starvationDays: number;
  /**
   * Lidé umírají hlady – nahromaděný hlad přesáhl práh dětí a starších (dospělých chrání
   * v hájení štěstí, ale děti hladem umírají i tehdy).
   */
  starving: boolean;
  /** Den vymření vsi; žijící ves null. */
  extinctDay: number | null;
  /** Stavby stojí – posledních STALL_DAYS dní nezbyla žádná společná práce. */
  constructionsStalled: boolean;
  /** Pohřebiště v pořadí pohřbívání. */
  cemeteries: CemeterySummary[];
  /** Úmrtí za rok v posledních letech (odhad z kroniky) – pro odhad místa na pohřebištích. */
  deathsPerYear: number;
  /** Jabloňové sady v pořadí založení. */
  orchards: OrchardSummary[];
  /** Štěstí obyvatel (happiness.md). */
  happiness: HappinessSummary;
  /** Posvátná místa – ušetřené duby a háje, hotové modly a svatyně. */
  sacred: SacredSummary;
  /** Řemesla – zásoby výrobků, pokrytí potřeby a dílny (crafts.md). */
  crafts: CraftsSummary;
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
/** Úmrtí za kolik posledních let se průměrují pro odhad místa na pohřebištích. */
export const RECENT_DEATHS_YEARS = 10;
/** Kolik posledních dní bez společné práce znamená, že stavby stojí. */
export const STALL_DAYS = 3;
/** Méně společné práce za den (člověkodny) se bere jako žádná. */
const NO_LABOR = 0.01;
/** Od kolika dnů nahromaděného hladu lidé umírají hlady – nejnižší práh věkových skupin. */
const STARVING_FROM_DAYS = Math.min(...Object.values(STARVATION.threshold));

/**
 * Stadium dílu v daný den; příloh podle let ladem a let bez pastvy a seče (`fallowStage` –
 * fields.md, Zarůstání).
 */
export function partStage(part: FieldPart, day: number): PartStage {
  if (part.state !== 'fallow') return part.state;
  return fallowStage(part, day);
}

function peopleByGroup(state: VillageState, day: number): VillageSummary['people'] {
  const people = { children: 0, adults: 0, elders: 0 };
  for (const person of state.people) {
    const group = ageGroup(person, day);
    if (group === 'child') people.children++;
    else if (group === 'adult') people.adults++;
    else people.elders++;
  }
  return people;
}

function households(state: VillageState, day: number): HouseholdSummary[] {
  return state.dwellings.map((d) => ({
    dwellingId: d.id,
    type: d.type,
    craft: d.workshop?.craft ?? null,
    occupants: occupants(state, d.id).length,
    family: familyCounts(occupants(state, d.id), day),
    capacity: DWELLINGS[d.type].capacity,
    full: isFull(state, d.id, day),
    overcrowded: isOvercrowded(state, d.id, day),
    condition: d.condition,
  }));
}

/**
 * Jídlo příštího dne: příděl ze zásob obilí, masa a ovoce do sklizně, se kterou ves počítá
 * (i červencová sklizeň ozimu – stejně jako jídlo v simulaci; 1. 3. ráno ovoce shnije,
 * v nádobách později – pokrytí nádobami jako simulace příští den).
 */
function nextDayDiet(state: VillageState, day: number): DietDay {
  const next = Math.min(day + 1, TOTAL_GAME_DAYS - 1);
  return villageMeal(state, next, craftCoverage(state, next).pottery, {
    milk: dailyMilk(villageHerds(state), next),
    eggsKg: dailyEggsKg(state),
  }).diet;
}

const DAYS_PER_SERVICE_YEAR = 365.25;

/** Ohrady pro panel a scénu. */
function penSummaries(state: VillageState, day: number): PenSummary[] {
  return villagePens(state).map((pen) => {
    const age = teamAgeYears(pen, day);
    const progress = trainingProgress(pen, day);
    return {
      id: pen.id,
      cell: { x: pen.cell.x, y: pen.cell.y },
      x: pen.x,
      z: pen.z,
      built: pen.builtDay !== null,
      team:
        age === null ? null : { ageYears: age, yearsLeft: Math.max(0, OXEN.serviceYears - age) },
      training:
        progress === null || !pen.training
          ? null
          : {
              progress,
              daysLeft: Math.max(
                0,
                Math.ceil(pen.training.startDay + OXEN.trainingYears * DAYS_PER_SERVICE_YEAR - day),
              ),
            },
      trainBlocked: trainingBlock(state, pen.id, day, null),
    };
  });
}

/** Dobytek pro panel – stáda zaokrouhleně, nosnost pastvy a lesa. */
function livestockSummary(state: VillageState, day: number): LivestockSummary {
  const herds = villageHerds(state);
  const oxen = villagePens(state).reduce(
    (sum, pen) => sum + (pen.team ? OXEN.teamSize : 0) + (pen.training ? OXEN.teamSize : 0),
    0,
  );
  return {
    herds: {
      sheep: Math.round(herds.sheep),
      goat: Math.round(herds.goat),
      pig: Math.round(herds.pig),
      cow: Math.round(herds.cow),
    },
    chickens: villageChickens(state),
    oxen,
    pastureHa: pastureHa(state),
    grazingHa: grazingDemandHa(herds, oxen),
    pigForestHa: pigForestHa(state),
    meatNeedKg: meatNeedPerYear(state, day),
    legumeNeedKg: legumeNeedPerYear(state, day),
    milkLPerDay: dailyMilk(herds, day).liters,
    milkLPerYear: yearlyMilk(herds).liters,
  };
}

function constructionSummary(state: VillageState, c: Construction): ConstructionSummary {
  const orchard =
    c.kind === 'orchard' ? villageOrchards(state).find((o) => o.id === c.orchardId) : undefined;
  const areaM2 =
    c.kind === 'field'
      ? state.parts.filter((p) => p.fieldId === c.fieldId).reduce((s, p) => s + p.areaM2, 0)
      : c.kind === 'orchard'
        ? orchard
          ? orchardAreaM2(orchard)
          : 0
        : null;
  return {
    id: c.id,
    kind: c.kind,
    dwellingType: c.dwellingType,
    craft: c.craft ?? null,
    dwellingId: c.dwellingId,
    fieldId: c.fieldId,
    areaM2,
    cemeteryId: c.kind === 'cemetery' ? (c.cemeteryId ?? null) : null,
    squares: c.kind === 'cemetery' ? constructionSquares(state, c) : null,
    orchardId: c.kind === 'orchard' ? (c.orchardId ?? null) : null,
    progress: c.cost > 0 ? Math.min(1, c.done / c.cost) : 1,
    buildProgress: buildProgress(c),
    treesToFell: treesToFell(c),
    roadIds: c.kind === 'road' || c.kind === 'road-apples' ? [...(c.roadIds ?? [])] : null,
    roadGrade: c.kind === 'road' ? (c.roadGrade ?? null) : null,
  };
}

/** Průběh stavby po skácení dřeva – kácí se jako první část práce. */
function buildProgress(c: Construction): number {
  const felling = woodFellingCost(c.wood);
  const building = c.cost - felling;
  if (building <= 0) return c.done >= c.cost ? 1 : 0;
  return Math.min(1, Math.max(0, (c.done - felling) / building));
}

/** Kolik čtverců stavba hřbitova ohrazuje – rozšíření jen svoje, založení ostatní. */
function constructionSquares(state: VillageState, c: Construction): number {
  const cemetery = villageCemeteries(state).find((x) => x.id === c.cemeteryId);
  if (!cemetery) return 0;
  const own = cemetery.squares.filter((s) => s.constructionId === c.id).length;
  return own > 0 ? own : readySquares(cemetery.squares).length;
}

/**
 * Úmrtí za rok podle kroniky za posledních RECENT_DEATHS_YEARS let. Zkrácená kronika (drží jen
 * posledních CHRONICLE_MAX_EVENTS událostí) pokryje kratší dobu – počítá se od její první
 * události; doba se bere nejméně jako jeden rok, aby jedno úmrtí v mladé vsi odhad nezkreslilo.
 */
export function recentDeathsPerYear(state: VillageState, day: number): number {
  let from = Math.max(state.foundedDay, day - RECENT_DEATHS_YEARS * DAYS_PER_YEAR);
  const oldest = state.chronicle[0];
  if (state.chronicle.length >= CHRONICLE_MAX_EVENTS && oldest) from = Math.max(from, oldest.day);
  const deaths = state.chronicle.filter((e) => e.kind === 'death' && e.day >= from).length;
  return deaths / Math.max(1, (day - from) / DAYS_PER_YEAR);
}

/**
 * Pohřebiště v pořadí pohřbívání (nejblíž k obydlím první) s odhadem, za kolik let se zaplní:
 * pohřebiště se plní postupně, takže se sčítá volné místo všech pohřebišť před ním. Rozestavěná
 * se počítají, jako by už stála (stavba trvá krátce).
 */
function cemeterySummaries(state: VillageState, deathsPerYear: number): CemeterySummary[] {
  const ordered = burialOrder(
    villageCemeteries(state),
    state.dwellings.map((d) => d.position),
  );
  let freeBefore = 0;
  return ordered.map((c) => {
    const free = freeGraves(c);
    freeBefore += free;
    return {
      id: c.id,
      squares: c.squares.length,
      built: c.builtDay !== null,
      capacity: cemeteryCapacity(c),
      graves: c.graves,
      freeGraves: free,
      yearsLeft: free === 0 ? 0 : deathsPerYear > 0 ? freeBefore / deathsPerYear : null,
    };
  });
}

/** Stavby stojí: nějaká se staví a posledních STALL_DAYS dní na ni nezbyla společná práce. */
function stalled(state: VillageState): boolean {
  const recent = state.commonLaborHistory.slice(-STALL_DAYS);
  return (
    state.constructions.length > 0 &&
    recent.length === STALL_DAYS &&
    recent.every((labor) => labor < NO_LABOR)
  );
}

/** Souhrn vsi v den `day` (stav má být dopočítaný do tohoto dne). */
export function summarizeVillage(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null = null,
): VillageSummary {
  const needPerDay = state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
  const diet = nextDayDiet(state, day);
  const history = state.commonLaborHistory;
  const deathsPerYear = recentDeathsPerYear(state, day);
  const starvationDays = state.starvationDays ?? 0;
  return {
    people: peopleByGroup(state, day),
    family: familyCounts(state.people, day),
    households: households(state, day),
    storesKg: state.storesKg,
    applesKg: villageApplesKg(state),
    woodLogs: woodLogs(state),
    storesMonths:
      needPerDay > 0 ? state.storesKg / ((needPerDay * DAYS_PER_YEAR) / MONTHS_PER_YEAR) : 0,
    satiation: diet.satiation,
    diet,
    meatKg: villageMeatKg(state),
    cheeseKg: villageCheeseKg(state),
    legumesKg: villageLegumesKg(state),
    hayKg: villageHayKg(state),
    livestock: livestockSummary(state, day),
    pens: penSummaries(state, day),
    commonLaborPerDay: history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0,
    fullHousehold: waitingHouseholds(state, day) > 0,
    constructions: state.constructions.map((c) => constructionSummary(state, c)),
    hungry: state.hungry,
    starvationDays,
    starving: state.people.length > 0 && starvationDays > STARVING_FROM_DAYS,
    extinctDay: state.extinctDay ?? null,
    constructionsStalled: stalled(state),
    cemeteries: cemeterySummaries(state, deathsPerYear),
    deathsPerYear,
    orchards: villageOrchards(state).map((o) => ({
      id: o.id,
      areaM2: orchardAreaM2(o),
      squares: o.squares.length,
      plantedSquares: o.squares.filter((s) => s.plantedDay !== null).length,
      ageYears: orchardAgeYears(o, day),
      expectedYieldKg: orchardExpectedYieldKg(o, day),
    })),
    happiness: happinessSummary(state, day, diet, obstacles),
    sacred: sacredSummary(state, day, obstacles),
    crafts: craftsSummary(state, day),
  };
}

/** Řemesla vsi: zásoby, potřeba a pokrytí, dílny s tím, co dělají (crafts.md – Co hráč vidí). */
function craftsSummary(state: VillageState, day: number): CraftsSummary {
  const coverage = craftCoverage(state, day);
  const productivity = happinessLaborFactor(villageHappiness(state));
  return {
    stocks: { ...craftStocks(state) },
    needs: craftNeeds(state, day),
    coverage,
    workshops: state.dwellings.flatMap((d) => {
      const workshop = d.workshop;
      if (!workshop) return [];
      const occupied = occupants(state, d.id).length;
      return [
        {
          dwellingId: d.id,
          craft: workshop.craft,
          activity: occupied > 0 ? workshop.activity : 'empty',
          occupants: occupied,
          laborPerDay:
            occupied > 0
              ? workshopLabor(state, day, d.id, coverage.pottery, productivity).craft
              : 0,
          oreFactor: oreFactor(workshop),
          kiln: workshop.kiln ? kilnSummary(workshop.kiln) : null,
          toPlant: workshop.toPlant?.length ?? 0,
        },
      ];
    }),
  };
}

/** Rozdělaný milíř pro panel: fáze, buky a průběh fáze 0–1. */
function kilnSummary(kiln: CharcoalKiln): NonNullable<WorkshopSummary['kiln']> {
  const n = kiln.trees.length;
  const total =
    kiln.stage === 'wood'
      ? 0
      : kiln.stage === 'burn'
        ? CHARCOAL_KILN.burnDays
        : (kiln.stage === 'build'
            ? CHARCOAL_KILN.buildManDaysPerTree
            : CHARCOAL_KILN.drawManDaysPerTree) * n;
  const progress =
    kiln.stage === 'wood' ? (n > 0 ? kiln.prepared / n : 1) : total > 0 ? kiln.done / total : 1;
  return {
    stage: kiln.stage,
    prepared: kiln.prepared,
    trees: n,
    progress: Math.min(1, Math.max(0, progress)),
    forest: kiln.site !== null,
  };
}

/** Štěstí, jeho cíl a složky (cíl při jídle příštího dne). */
function happinessSummary(
  state: VillageState,
  day: number,
  diet: DietDay,
  obstacles: ObstacleLayer | null,
): HappinessSummary {
  const value = villageHappiness(state);
  const factors = happinessFactors(
    state,
    day,
    diet.satiation,
    diet.shares.fruit > 0,
    obstacles,
    diet.shares.meat,
  );
  return {
    value,
    target: happinessTarget(factors),
    factors,
    laborFactor: happinessLaborFactor(value),
  };
}

/**
 * Posvátná místa vsi a kolik které samo přidává (stropy počtu a součtu platí pro ves); duby se
 * stadiem a stářím v den `day` (`sacredOakNow`).
 */
function sacredSummary(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
): SacredSummary {
  return {
    oaks: villageSacredOaks(state).map((o) => ({
      id: o.id,
      day: o.day,
      x: o.x,
      z: o.z,
      ...sacredOakNow(obstacles, o.id, day),
    })),
    groves: villageGroves(state).map((g) => ({
      id: g.id,
      x: g.x,
      z: g.z,
      cells: g.cells.map((c) => ({ x: c.x, y: c.y })),
      oaks: g.oaks,
      happiness: groveHappiness(g.oaks),
    })),
    buildings: villageSacredBuildings(state).map((b) => ({
      id: b.id,
      kind: b.kind,
      position: b.position,
      happiness: sacredBuildingHappiness(b.kind),
    })),
  };
}
