import { TOTAL_GAME_DAYS } from '../calendar';
import { length2, type Landscape, type ObstacleLayer } from '../landscape';
import { premiumSacredHappiness } from './premium-effects';
import { moundPlaces, usedPlaces } from './burials';
import {
  burialOrder,
  cemeteryCapacity,
  freePlaces,
  readySquares,
  villageCemeteries,
} from './cemetery';
import { cartCondition, cartsAway, haulCartsToday, villageCarts } from './carts';
import {
  cartAwaitingIron,
  craftCoverage,
  craftNeeds,
  craftStocks,
  smithIronSummary,
  workshopLabor,
  type CraftNeeds,
  type SmithIronSummary,
} from './crafts';
import { toolEquipmentKg } from './iron';
import { ironTripDaysLeft } from './cart-iron';
import {
  charcoalStockKg,
  kilnCharcoalKg,
  kilnCharcoalShare,
  kilnPoint,
  kilnYieldKg,
  workshopKilns,
} from './charcoal';
import {
  potterClaySummary,
  smithOreSummary,
  type PotterClaySummary,
  type SmithOreSummary,
} from './smith-supply';
import { craftSkillSummary, type CraftSkillSummary } from './craft-skill';
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
import { dailyMilk, dairyDams, villageCheeseKg, yearlyMilk } from './dairy';
import { villageMeal, villageMeatKg } from './diet';
import { villageHayKg } from './hay';
import { horsesInPlaces, villageHorses } from './horses';
import { villageLegumesKg } from './legumes';
import {
  dailyEggsKg,
  grazingDemandHa,
  meatNeedPerYear,
  pastureHa,
  pigForestHa,
  villageChickens,
  cullingMeatKg,
  freshMeatAheadEnergy,
  freshMeatPerDayKg,
  isSlaughterSeason,
  villageDams,
  villageHerds,
} from './livestock';
import {
  ableTeams,
  isTrained,
  oxAgeYears,
  oxPens,
  oxPlaces,
  oxRetireDay,
  oxTrainingProgress,
  trainedOxen,
  villageArds,
  villageOxen,
  villagePens,
} from './oxen';
import { cartTargets, oxenOverRoom, wantedOxen, wantedPloughPairs } from './draft';
import { herdPlaces, type HerdPlaces } from './husbandry';
import { oxenOf, penOccupancy, penPlaces, penSpecies } from './pens';
import {
  orchardAgeYears,
  orchardAreaM2,
  orchardExpectedYieldKg,
  villageApplesKg,
  villageOrchards,
} from './orchard';
import { ageGroup, ageYears, foodNeedPerDay, occupants } from './people';
import {
  CARPENTRY,
  CART_IRON,
  CHARCOAL_KILN,
  CHRONICLE_MAX_EVENTS,
  DWELLINGS,
  STARVATION,
} from './rules';
import {
  groveHappiness,
  sacredBuildingHappiness,
  villageGroves,
  villageSacredBuildings,
  villageSacredOaks,
} from './sacred';
import { sacredOakNow, type SacredOakNow } from './sacred-life';
import type {
  AbandonedStructure,
  CharcoalKiln,
  KilnStage,
  Construction,
  Dwelling,
  ConstructionKind,
  CartKind,
  Craft,
  CraftCoverage,
  CraftStocks,
  DietDay,
  Direction8,
  DwellingType,
  FallowStage,
  FieldPart,
  HerdSpecies,
  PenSpecies,
  Position,
  SacredBuildingKind,
  SquareGrid,
  TileCell,
  VillageState,
  Workshop,
  WorkshopActivity,
  RoadGrade,
} from './types';
import { copyGrid } from './square-grid';
import { pileLogs, treesToFell, woodFellingCost, woodLogs } from './wood';

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
  /** Stavba vozové cesty (roads.md – Vozová cesta); u ostatních chybí. */
  wagon?: true;
  /**
   * Oprava stavby, ke které se zase chodí (abandonment.md – Oprava) – druh a id opravované
   * stavby; jinak null.
   */
  repair: { structure: AbandonedStructure; id: number } | null;
}

/** Pohřebiště pro panel – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
export interface CemeterySummary {
  id: number;
  squares: number;
  /** Vytyčené a ohrazené – přijímá mrtvé. */
  built: boolean;
  /** Místa na hroby hotových čtverců (cemetery.md – Mohyly podle významu: mohyla zabere 1–4). */
  capacity: number;
  /** Pohřbení (lidé). */
  graves: number;
  /** Obsazená a volná místa na hroby. */
  usedPlaces: number;
  freePlaces: number;
  /**
   * Odhad, za kolik let se zaplní – podle úmrtí posledních let, průměrné velikosti mohyl vsi
   * a pořadí pohřbívání (nejdřív pohřebiště nejblíž k obydlím). Bez úmrtí null.
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

/**
 * Milíř uhlíře pro panel (crafts.md – Milíř u skácených buků): id (null jen u milíře ze starší vsi
 * před převodem), fáze, kolik buků dávky je připravených z kolika, průběh fáze 0–1 (u pálení dny ÷
 * CHARCOAL_KILN.burnDays, u vypáleného milíře podíl už rozebraného uhlí), uhlí, které ve
 * vypáleném milíři zbývá, a kolik dá celý (kg), střed (m), chůze ze zemnice uhlíře (m) a kovárna,
 * odkud se pro uhlí chodí (id, chůze m – po prvním nošení), den výběru dávky.
 */
export interface KilnSummary {
  id: number | null;
  stage: KilnStage;
  prepared: number;
  trees: number;
  progress: number;
  charcoalKg: number;
  yieldKg: number;
  x: number;
  z: number;
  walkM: number;
  carry: { smithId: number; walkM: number } | null;
  startDay?: number;
}

/** Řemeslná dílna pro panel výběru (crafts.md – Co hráč vidí). */
export interface WorkshopSummary {
  dwellingId: number;
  craft: Craft;
  activity: WorkshopActivity;
  /** Kolik lidí v dílně bydlí. */
  occupants: number;
  /** Práce řemeslu za den po denním minimu (člověkodny, se štěstím). */
  laborPerDay: number;
  /**
   * Kovář (crafts.md – Uhlí a ruda kováře): zásoba rudy, rudiště, hromada u jámy a kdo nosí uhlí;
   * ostatní dílny null.
   */
  ore: SmithOreSummary | null;
  /**
   * Kovář (production-chains.md – Kovář): houba, hřivny a jejich zásoba, nástroje ve vybavení
   * domácností a měchař u tavby; ostatní dílny null.
   */
  iron: SmithIronSummary | null;
  /** Hrnčíř (crafts.md – Hlína hrnčíře): zásoba hlíny, hliniště a hromada u jámy; jinak null. */
  clay: PotterClaySummary | null;
  /**
   * Uhlíř: jeho milíře (crafts.md – Milíř u skácených buků, Rovnováha uhlíř – kovář) v pořadí, jak
   * je začal; ostatní dílny prázdné.
   */
  kilns: KilnSummary[];
  /** Uhlíř: pařezy buků, na které ještě zasadí mladý buk; ostatní dílny 0. */
  toPlant: number;
  /** Učení řemesla (crafts.md): výkon dílny podle praxe, praxe řemeslníka a kdo se učí. */
  skill: CraftSkillSummary;
  /**
   * Tesař (wagons.md – Tesař): rozdělaný vůz (druh a průběh 0–1), klády v dílně a pokrytí dřevěné
   * práce staveb posledního dne 0–1; ostatní dílny null.
   */
  carpenter: {
    cart: { kind: CartKind; progress: number } | null;
    timber: number;
    woodworkCoverage: number;
    /**
     * Kování k vozu (wagons.md – Kování vozů): vůz s hotovou dřevěnou prací čeká na kování (kg),
     * nebo pro něj tesař či jeho syn (věk) jde do vsi `to` (jméno, soused ve směru)
     * s nosiči (`porters`), nebo s vozem a sedlákem (`cart` – druh vozu), a vrátí se za
     * `daysLeft` dní; jinak null.
     */
    iron: {
      kg: number;
      trip: {
        to: string;
        direction: Direction8 | null;
        daysLeft: number;
        son: boolean;
        age: number;
        porters: number;
        cart: CartKind | null;
      } | null;
    } | null;
  } | null;
}

/** Vůz vsi pro panel (wagons.md – Vůz): druh, stav 0–1 a jestli je s výpravou na cestě. */
export interface CartSummary {
  id: number;
  kind: CartKind;
  condition: number;
  away: boolean;
}

/** Řemesla vsi – zásoby, potřeba, pokrytí (meze produktivity) a dílny. */
export interface CraftsSummary {
  stocks: CraftStocks;
  /**
   * Nástroje ve vybavení domácností (kg – production-chains.md, Nástroje jako vybavení
   * domácností); pokrytí potřeby `coverage.tools`.
   */
  equipmentKg: number;
  needs: CraftNeeds;
  coverage: CraftCoverage;
  workshops: WorkshopSummary[];
  /** Vozy vsi a kolik jich ves potřebuje (wagons.md – Vůz). */
  carts: CartSummary[];
  cartTargets: Readonly<Record<CartKind, number>>;
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
  /** Mléko dnes (l, když se podojí všechny dojné samice) a za rok. */
  milkLPerDay: number;
  milkLPerYear: number;
}

/** Ohrada pro panel výběru a scénu (oxen.md – Co hráč vidí). */
export interface PenSummary {
  id: number;
  /** Druh zvířat ohrady (oxen.md – Ohrady podle druhu). */
  species: PenSpecies;
  /** První čtverec ohrady (přístřešek) v mřížce `grid`; bez ní políčko krajiny. */
  cell: TileCell;
  /** Další čtverce ohrady (`pending` – rozšíření ve stavbě); bez údaje jen první. */
  extraSquares?: { cell: TileCell; x: number; z: number; pending?: true }[];
  /** Místa na noc pro stádo svého druhu, u ohrady volů pro voly (hotové čtverce – `penPlaces`). */
  places: number;
  /** Kolik zvířat v ohradě v noci stojí (`penOccupancy` – u ohrady volů voli i telata). */
  animals: number;
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez ní políčko krajiny. */
  grid?: SquareGrid;
  x: number;
  z: number;
  built: boolean;
  /**
   * Nejstarší vycvičený vůl ohrady (oxen.md – Voli po kusech): stáří v letech a kolik let ještě
   * slouží; bez vycvičených volů null.
   */
  team: { ageYears: number; yearsLeft: number } | null;
  /**
   * Výcvik volů (začíná sám – oxen.md): tele, které se vycvičí nejdřív – průběh 0–1 a zbývající
   * dny; bez telat ve výcviku null.
   */
  training: { progress: number; daysLeft: number } | null;
  /** Voli ohrady volů – vycvičení a telata ve výcviku; jiné ohrady bez údaje. */
  oxen?: { trained: number; training: number };
}

/**
 * Voli vsi (oxen.md – Ohrada volů, Co hráč vidí): vycvičení, ve výcviku, místa ohrad volů, kolik
 * volů ves chce (páry k rádlům, nebo voli vozů naráz – víc z toho), páry s rádlem a rádla.
 */
export interface OxenSummary {
  trained: number;
  training: number;
  places: number;
  /** Kolik volů ves chce bez ohledu na místo (`wantedOxen`). */
  wanted: number;
  /** Ves chce víc volů, než se vejde do ohrad volů (upozornění). */
  overRoom: boolean;
  /** Páry k rádlům, které ves chce (`wantedPloughPairs`). */
  ploughPairs: number;
  /** Páry vycvičených volů s rádlem (`ableTeams`). */
  teams: number;
  ards: number;
}

export interface VillageSummary {
  people: { children: number; adults: number; elders: number };
  /** Muži, ženy, děti, starší a páry celé vsi (kinship.md) – i pohlaví postav ve scéně. */
  family: FamilyCounts;
  households: HouseholdSummary[];
  storesKg: number;
  /** Zásoby jablek (kg) – jí se před obilím, 1. 3. shnijí. */
  applesKg: number;
  /** Klády v zásobě vsi celkem (forest.md) – na všech hromadách. */
  woodLogs: number;
  /** Z toho klády na hromadách (`logStacks` – u cest a u míst kácení). */
  forestLogs: number;
  /** Klády bez hromady (`pileLogs` – jen ves před převodem na hromady u cesty). */
  pileLogs: number;
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
  /**
   * Místa na noc po druzích stáda – ohrady svého druhu, domy a kolik míst v ohradách by stádo
   * potřebovalo (oxen.md – Ohrady podle druhu, Co hráč vidí; `herdPlaces`).
   */
  herdPlaces: Record<HerdSpecies, HerdPlaces>;
  /** Voli vsi a kolik jich ves chce; bez ohrady volů null. */
  oxen: OxenSummary | null;
  /**
   * Volná (společná) práce posledního dne – kolik ves dnes nechá na stavby; na jaře a v žních
   * bývá nula (Martin, 19. 10. 2026 – ukazatel v liště, dřív průměr 30 dní zaostával o týdny).
   */
  commonLaborPerDay: number;
  /**
   * Některá rodina se může oddělit (`waitingHouseholds` – ženatý pár, který dům nedrží, nebo
   * svobodný syn plného domu) a nečeká na ni žádné nové ani prázdné obydlí – upozornění „Rodina
   * čeká na dům“; jméno pole zůstalo z doby, kdy odcházeli jen lidé z plné domácnosti.
   */
  fullHousehold: boolean;
  constructions: ConstructionSummary[];
  /**
   * Ves šetří jídlem nebo hladoví – zásoby nevystačí do sklizně a ubírá z přídělu (jako
   * `hunger-began` v kronice).
   */
  hungry: boolean;
  /** Stupeň hladu pro upozornění (population.md – Co hráč vidí). */
  hunger: HungerLevel;
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
 * Stupeň hladu (population.md – Co hráč vidí): `fed` – jí se dosyta; `rationing` – ves šetří
 * jídlem, zásoby do sklizně nevystačí a ubírá z přídělu, ale jí se aspoň STARVATION.fedFrom (90 %);
 * `hungry` – příděl pod 90 %, od té hranice se sčítá hlad; `starving` – lidé umírají hlady.
 */
export type HungerLevel = 'fed' | 'rationing' | 'hungry' | 'starving';

/** Lidé umírají hlady – nahromaděný hlad přesáhl práh dětí a starších. */
function isStarving(state: VillageState): boolean {
  return state.people.length > 0 && (state.starvationDays ?? 0) > STARVING_FROM_DAYS;
}

/**
 * Stupeň hladu vsi z posledního jídla: příděl do sklizně podle výhledu (`VillageState.ration`;
 * ves uložená dřív bez něj – energie posledního jídla).
 */
export function hungerLevel(state: VillageState): HungerLevel {
  if (isStarving(state)) return 'starving';
  if (!state.hungry) return 'fed';
  const ration = state.ration ?? state.diet?.energy ?? 0;
  return ration < STARVATION.fedFrom ? 'hungry' : 'rationing';
}

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
    milk: dailyMilk(villageDams(state), next),
    eggsKg: dailyEggsKg(state),
    // zítřejší zimní porážka (diet.md – Porážka v zimě)
    meatKg: isSlaughterSeason(next)
      ? Math.min(cullingMeatKg(state), freshMeatPerDayKg(state, next))
      : 0,
    meatAheadEnergy: freshMeatAheadEnergy(state, next),
  }).diet;
}

const DAYS_PER_SERVICE_YEAR = 365.25;

/** Ohrady pro panel a scénu. */
function penSummaries(state: VillageState, day: number): PenSummary[] {
  const occupancy = penOccupancy(state);
  return villagePens(state).map((pen) => {
    const oxen = oxenOf(pen);
    const trained = oxen.filter((ox) => isTrained(ox, day));
    const calves = oxen.filter((ox) => !isTrained(ox, day));
    // nejstarší vůl doslouží první, nejstarší tele se vycvičí první
    const oldest = trained.reduce<(typeof trained)[number] | null>(
      (best, ox) => (best === null || ox.trainedDay < best.trainedDay ? ox : best),
      null,
    );
    const nextReady = calves.reduce<(typeof calves)[number] | null>(
      (best, ox) => (best === null || ox.trainedDay < best.trainedDay ? ox : best),
      null,
    );
    const age = oldest ? oxAgeYears(oldest, day) : null;
    return {
      id: pen.id,
      species: penSpecies(pen),
      cell: { x: pen.cell.x, y: pen.cell.y },
      ...(pen.extraSquares?.length
        ? {
            extraSquares: pen.extraSquares.map((q) => ({
              cell: { x: q.cell.x, y: q.cell.y },
              x: q.x,
              z: q.z,
              ...(q.constructionId === undefined ? {} : { pending: true as const }),
            })),
          }
        : {}),
      places: penPlaces(pen),
      animals: occupancy.get(pen.id) ?? 0,
      ...(pen.grid ? { grid: copyGrid(pen.grid) } : {}),
      x: pen.x,
      z: pen.z,
      built: pen.builtDay !== null,
      team:
        oldest && age !== null
          ? {
              ageYears: age,
              yearsLeft: Math.max(
                0,
                Math.ceil((oxRetireDay(oldest) - day) / DAYS_PER_SERVICE_YEAR),
              ),
            }
          : null,
      training: nextReady
        ? {
            progress: oxTrainingProgress(nextReady, day),
            daysLeft: Math.max(0, nextReady.trainedDay - day),
          }
        : null,
      ...(penSpecies(pen) === 'team'
        ? { oxen: { trained: trained.length, training: calves.length } }
        : {}),
    };
  });
}

/** Voli vsi pro panel ohrady volů a upozornění; bez ohrady volů null. */
function oxenSummary(state: VillageState, day: number): OxenSummary | null {
  if (oxPens(state).length === 0) return null;
  const trained = trainedOxen(state, day);
  return {
    trained,
    training: villageOxen(state) - trained,
    places: oxPlaces(state),
    wanted: wantedOxen(state),
    overRoom: oxenOverRoom(state),
    ploughPairs: wantedPloughPairs(state),
    teams: ableTeams(state, day),
    ards: villageArds(state),
  };
}

/** Dobytek pro panel – stáda zaokrouhleně, nosnost pastvy a lesa. */
function livestockSummary(state: VillageState, day: number): LivestockSummary {
  const herds = villageHerds(state);
  const oxen = villageOxen(state);
  return {
    herds: {
      sheep: Math.round(herds.sheep),
      goat: Math.round(herds.goat),
      pig: Math.round(herds.pig),
      cow: Math.round(herds.cow),
    },
    chickens: villageChickens(state),
    oxen,
    pastureHa: pastureHa(state, day),
    grazingHa: grazingDemandHa(herds, oxen, horsesInPlaces(villageHorses(state), day)),
    pigForestHa: pigForestHa(state),
    meatNeedKg: meatNeedPerYear(state, day),
    milkLPerDay: dailyMilk(villageDams(state), day).liters,
    milkLPerYear: yearlyMilk(dairyDams(herds)).liters,
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
    ...(c.earthwork !== undefined ? { wagon: true as const } : {}),
    repair: c.repair ? { structure: c.repair.structure, id: c.repair.id } : null,
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
  // míst na pohřeb – průměr mohyl vsi (bez mohyl jedno místo)
  const mounds = ordered.flatMap((c) => c.mounds ?? []);
  const perBurial =
    mounds.length > 0 ? mounds.reduce((sum, m) => sum + moundPlaces(m.size), 0) / mounds.length : 1;
  let freeBefore = 0;
  return ordered.map((c) => {
    const free = freePlaces(c);
    freeBefore += free;
    return {
      id: c.id,
      squares: c.squares.length,
      built: c.builtDay !== null,
      capacity: cemeteryCapacity(c),
      graves: c.graves,
      usedPlaces: usedPlaces(c),
      freePlaces: free,
      yearsLeft:
        free === 0 ? 0 : deathsPerYear > 0 ? freeBefore / (deathsPerYear * perBurial) : null,
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

/**
 * Souhrn vsi v den `day` (stav má být dopočítaný do tohoto dne); `landscape` – posvátné místo
 * prémiové krajiny ve štěstí (bez krajiny se nepočítá).
 */
export function summarizeVillage(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null = null,
  landscape: Landscape | null = null,
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
    forestLogs: Math.max(0, woodLogs(state) - pileLogs(state)),
    pileLogs: pileLogs(state),
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
    herdPlaces: herdPlaces(state, day, craftCoverage(state, day).tools),
    oxen: oxenSummary(state, day),
    commonLaborPerDay: history.at(-1) ?? 0,
    fullHousehold: waitingHouseholds(state, day) > 0,
    constructions: state.constructions.map((c) => constructionSummary(state, c)),
    hungry: state.hungry,
    hunger: hungerLevel(state),
    starvationDays,
    starving: isStarving(state),
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
    happiness: happinessSummary(state, day, diet, obstacles, premiumSacredHappiness(landscape)),
    sacred: sacredSummary(state, day, obstacles),
    crafts: craftsSummary(state, day),
  };
}

/** Řemesla vsi: zásoby, potřeba a pokrytí, dílny s tím, co dělají (crafts.md – Co hráč vidí). */
function craftsSummary(state: VillageState, day: number): CraftsSummary {
  const coverage = craftCoverage(state, day);
  const away = cartsAway(state);
  const productivity = happinessLaborFactor(villageHappiness(state));
  return {
    // uhlí u kováře i ve vypálených milířích (crafts.md – Milíř stojí vždy)
    stocks: { ...craftStocks(state), charcoalKg: charcoalStockKg(state) },
    equipmentKg: toolEquipmentKg(state),
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
          // dnes nastěhovaní: práce dne proběhla před osídlením – dílna začne zítra
          activity:
            occupied === 0
              ? 'empty'
              : workshop.activity === 'empty'
                ? 'settled'
                : workshop.activity,
          occupants: occupied,
          laborPerDay:
            occupied > 0
              ? workshopLabor(state, day, d.id, coverage.pottery, productivity).craft
              : 0,
          ore:
            workshop.craft === 'smith'
              ? smithOreSummary(state, d, day, haulCartsToday(state, day, false) > 0)
              : null,
          iron: workshop.craft === 'smith' ? smithIronSummary(state, d, day) : null,
          clay:
            workshop.craft === 'potter'
              ? potterClaySummary(d, haulCartsToday(state, day, false) > 0)
              : null,
          kilns: workshopKilns(workshop).map((k) => kilnSummary(d, k)),
          toPlant: workshop.toPlant?.length ?? 0,
          skill: craftSkillSummary(state, d.id, day),
          carpenter:
            workshop.craft === 'carpenter'
              ? {
                  cart: workshop.cart
                    ? {
                        kind: workshop.cart.kind,
                        progress: Math.min(
                          1,
                          workshop.cart.done / CARPENTRY.cartManDays[workshop.cart.kind],
                        ),
                      }
                    : null,
                  timber: workshop.timber ?? 0,
                  woodworkCoverage: workshop.woodworkCoverage ?? 0,
                  iron: ironSummary(state, workshop, day),
                }
              : null,
        },
      ];
    }),
    carts: villageCarts(state).map((cart) => ({
      id: cart.id,
      kind: cart.kind,
      condition: cartCondition(cart, day),
      away: away.has(cart.id),
    })),
    cartTargets: cartTargets(state),
  };
}

/** Kování k vozu tesaře pro panel (wagons.md – Kování vozů); bez čekajícího vozu a cesty null. */
function ironSummary(
  state: VillageState,
  workshop: Workshop,
  day: number,
): NonNullable<WorkshopSummary['carpenter']>['iron'] {
  const trip = workshop.ironTrip ?? null;
  if (!trip && !cartAwaitingIron(workshop)) return null;
  const kind = workshop.cart?.kind;
  const kg = trip?.kg ?? (kind ? CART_IRON.kg[kind] : 0);
  if (!trip) return { kg, trip: null };
  const traveller = state.people.find((p) => p.id === trip.personId);
  const cart =
    trip.cartId === undefined ? null : (state.carts?.find((c) => c.id === trip.cartId) ?? null);
  return {
    kg,
    trip: {
      to: trip.to.name,
      direction: trip.to.kind === 'neighbour' ? trip.to.direction : null,
      daysLeft: ironTripDaysLeft(trip),
      son: trip.son,
      age: traveller ? ageYears(traveller.bornDay, day) : 0,
      porters: trip.porters ?? 0,
      cart: cart ? cart.kind : null,
    },
  };
}

/**
 * Milíř pro panel (crafts.md – Milíř u skácených buků): fáze, buky a průběh fáze 0–1, uhlí ve
 * vypáleném milíři, kde stojí a jak daleko se k němu chodí.
 */
function kilnSummary(burner: Dwelling, kiln: CharcoalKiln): KilnSummary {
  const n = kiln.trees.length;
  const total =
    kiln.stage === 'burn' ? CHARCOAL_KILN.burnDays : CHARCOAL_KILN.buildManDaysPerTree * n;
  const progress =
    kiln.stage === 'wood'
      ? n > 0
        ? kiln.prepared / n
        : 1
      : kiln.stage === 'draw'
        ? 1 - kilnCharcoalShare(kiln)
        : total > 0
          ? kiln.done / total
          : 1;
  const at = kilnPoint(burner, kiln);
  return {
    id: kiln.id ?? null,
    stage: kiln.stage,
    prepared: kiln.prepared,
    trees: n,
    progress: Math.min(1, Math.max(0, progress)),
    charcoalKg: kilnCharcoalKg(kiln),
    yieldKg: kilnYieldKg(kiln),
    x: at.x,
    z: at.z,
    walkM: kiln.walkM ?? length2(at.x - burner.position.x, at.z - burner.position.z),
    carry: kiln.carry ? { smithId: kiln.carry.smithId, walkM: kiln.carry.walkM } : null,
    ...(kiln.startDay !== undefined ? { startDay: kiln.startDay } : {}),
  };
}

/** Štěstí, jeho cíl a složky (cíl při jídle příštího dne). */
function happinessSummary(
  state: VillageState,
  day: number,
  diet: DietDay,
  obstacles: ObstacleLayer | null,
  premiumSacred: number,
): HappinessSummary {
  const value = villageHappiness(state);
  const factors = happinessFactors(
    state,
    day,
    diet.satiation,
    diet.shares.fruit > 0,
    obstacles,
    diet.shares.meat,
    premiumSacred,
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
