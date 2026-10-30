// Typy pohledu na ves (DTO panelu) – nabídka staveb, panel, řemesla, pole, sady.

import type { DwellingResident } from './person-view';
import { SceneVillage } from './village-view-scene-types';
import {
  type TradeGood,
  CRAFT_PRODUCTS,
  type RoadKind,
  type AbandonedStructure,
  type ClearingStage,
  type BuildKind,
  type DietDay,
  type HerdSpecies,
  type LivestockSummary,
  type OxenSummary,
  type ChronicleEvent,
  type FamilyCounts,
  type ConstructionKind,
  type CartKind,
  type Craft,
  type CraftCoverage,
  type CraftNeeds,
  type CraftProduct,
  type CraftPurchaseGoods,
  type CraftStocks,
  type Crop,
  type BuildableDwellingType,
  type Direction8,
  type NewcomerGroup,
  type DwellingType,
  type FieldSurface,
  type HungerLevel,
  type PartStage,
  type NextCrop,
  type PartYearWork,
  type RelocationBlock,
  type RoadApplesOption,
  type RoadGrade,
  type RoadUpgrade,
  type RoadUpgradeOption,
  type SacredBuildingKind,
  type StockResource,
  type TileCell,
  type VillageLifespan,
  type VillageSummary,
  type WorkshopActivity,
  type PenSpecies,
  type HerdPlaces,
} from '@bohemia/game';
import { type HouseholdRelocation } from './relocation-view';

import { type VillageManor } from './manor-view';
import type { FieldDamageView, VillageWildlife } from './wildlife-view';
import type {
  DisasterChronicleEntry,
  PartLossesView,
  PartProtectionView,
  WeatherView,
} from './disasters-view';
import { type VillageHorses } from './horse-view';

import { type VillageDugSite } from './ore-site-view';

import { type VillageKiln } from './kiln-view';

import { type VillageGrainPit } from './grain-pit-view';
import { type VillageJunction } from './junction-view';
import { type VillageRoadEnd } from './road-end-view';

import type { VillageListItem } from './village-list';

import type { LineEndView } from './line-end-view';

import {
  type VillageAbandonment,
  type VillageJourneyView,
  type VillageLeave,
} from './departure-view';

/**
 * Stavba v nabídce staveb: cena a jestli na ni ves má (bez surovin, dřeva nebo lidí k osídlení je
 * tlačítko zašedlé).
 */
export interface BuildOption {
  /** Člověkodny ze společné práce – u pole a sadu za hektar (`perHa`), u hřbitova za čtverec. */
  laborManDays: number;
  perHa: boolean;
  /** Cena za čtverec (pohřebiště). */
  perSquare: boolean;
  /**
   * Předem – suroviny (obilí, dřevo ve stromech) a lidé k osídlení: kolik stavba chce a kolik
   * chybí (0 = ves má).
   */
  upfront: { resource: StockResource; amount: number; missing: number }[];
  /**
   * Stavbu nejde zahájit z jiného důvodu než surovin – svatyně je jedna na ves (happiness.md);
   * rozhraní důvod ukáže v popisku červeně. Jinak null.
   */
  blocked: string | null;
  affordable: boolean;
  /**
   * Cena druhu v rozcestníku, který se od stavby liší (ohrada koní: vyšší plot a koně zaplacení
   * předem z přebytku (hřivny, zvířata, obilí) – horses.md, Koně se stavbou ohrady); klíč = id druhu.
   */
  variants?: Record<
    string,
    Pick<BuildOption, 'laborManDays' | 'upfront' | 'affordable' | 'blocked'> & {
      /** Čím ves koně zaplatí (hřivny, zvířata, obilí) – ikony s čísly; prázdné, když nestačí. */
      payment: { good: TradeGood; amount: number }[];
      /** Rozšíření existující ohrady platbu nechce – dostupné podle surovin předem. */
      extendAffordable: boolean;
    }
  >;
}

/** Štěstí obyvatel pro horní lištu (happiness.md). */
export interface VillageHappiness {
  /** Štěstí 0–100. */
  value: number;
  /** Cílová hodnota, ke které se štěstí pomalu posouvá. */
  target: number;
  /** Násobek veškeré práce vsi (0,8–1,1). */
  laborFactor: number;
}

/**
 * Posvátná místa pro panel výběru – kolik které samo přidává štěstí (stropy počtu a součtu platí
 * pro celou ves), stáří dubu (háj: jeho nejstaršího dubu – `oakAgeYears`, celé roky; strom mimo
 * vrstvu null) a u modly a svatyně průběh stavby.
 */
export interface VillageSacred {
  /** Živé posvátné duby a posvátné souše (`snag`) – padlá souš už posvátným dubem není. */
  oaks: { id: number; happiness: number; ageYears: number | null; snag: boolean }[];
  groves: {
    id: number;
    oaks: number;
    squares: number;
    happiness: number;
    ageYears: number | null;
  }[];
  /**
   * Modly a svatyně – hotové (`built`, id stavby, která je postavila) i rozestavěné (id stavby):
   * průběh celé stavby i s kácením dubů 0–1 a kolik dubů ještě musí skácet.
   */
  buildings: {
    id: number;
    kind: SacredBuildingKind;
    built: boolean;
    happiness: number;
    progress: number;
    oaksToFell: number;
    /** Stav hotové stavby 0–1 (abandonment.md – chátrání); rozestavěná 1. */
    condition: number;
    /** Opuštěná – nikdo k ní nechodí, chátrá. */
    abandoned: boolean;
    /** Vesničané stavbu opravují (abandonment.md – Oprava) – průběh 0–1; jinak null. */
    repair: number | null;
  }[];
}

/**
 * Voli vsi (oxen.md – Ohrada volů, Co hráč vidí): vycvičení a ve výcviku, místa ohrad volů, kolik
 * volů ves chce (páry k rádlům, nebo voli vozů naráz), páry s rádlem a vozy, které ves má a chce
 * (wagons.md – Kolik vozů ves chce).
 */
export interface VillageOxen extends OxenSummary {
  carts: Record<CartKind, number>;
  cartTargets: Readonly<Record<CartKind, number>>;
}

/** Ohrada pro panel výběru (oxen.md – Co hráč vidí): stavba, voli, výcvik a seno. */
export interface VillagePen {
  id: number;
  /** Druh zvířat ohrady (oxen.md – Ohrady podle druhu). */
  species: PenSpecies;
  /** Čtverce ohrady (i rozšíření ve stavbě) – nejvýš 4. */
  squares: number;
  /** Místa na noc pro stádo svého druhu, u ohrady volů pro voly (hotové čtverce). */
  places: number;
  /** Kolik zvířat v ohradě v noci stojí (u ohrady volů voli a telata). */
  animals: number;
  /**
   * Místa stáda svého druhu celé vsi – ve všech ohradách druhu, u domů a kolik míst v ohradách by
   * stádo potřebovalo (oxen.md – Co hráč vidí, `herdPlaces`); u spřežení null.
   */
  herdPlaces: HerdPlaces | null;
  /** Rozšíření ve stavbě – průběh 0–1; bez rozšíření null. */
  extension: number | null;
  built: boolean;
  /** Průběh stavby 0–1 (hotová 1). */
  progress: number;
  /** Nejstarší vycvičený vůl – stáří a kolik let ještě slouží; bez vycvičených volů null. */
  team: { ageYears: number; yearsLeft: number } | null;
  /** Výcvik volů – tele, které se vycvičí nejdřív: průběh 0–1 a zbývající dny; jinak null. */
  training: { progress: number; daysLeft: number } | null;
  /** Kolik krav a volů v ohradě právě stojí (krávy jen v zimě). */
  cows: number;
  oxen: number;
  /** Stav hotové ohrady 0–1 (abandonment.md – ohrada bez zvířat chátrá); rozestavěná 1. */
  condition: number;
  /** Opuštěná – bez zvířat a nikdo k ní nechodí, chátrá. */
  abandoned: boolean;
  /** Vesničané ohradu opravují (abandonment.md – Oprava) – průběh 0–1; jinak null. */
  repair: number | null;
}

/**
 * Pevná cesta pro panel výběru (roads.md – Co hráč vidí, Cesta pro hráče): celá cesta hráče –
 * řetěz úseků mezi rozcestími a volnými konci bez ohledu na stupeň (road-chains.ts). Stupeň,
 * délka (po stupních), stáří, stromy u ní, rozestavěné vylepšení a vylepšení, která cesta nabízí
 * (cena a proč teď nejde).
 */
export interface VillageRoad {
  /** Id cesty = první úsek řetězu (stejné, ať se vybere kterýkoli úsek). */
  id: number;
  /** Úseky cesty v pořadí podél ní – výběr kteréhokoli vybere celou cestu. */
  segments: number[];
  /**
   * Oba konce cesty v jejím pořadí (paths.md – pravidlo 11, Co hráč vidí; Martin 25. 10. 2026):
   * stavba či cíl, křižovatka, kraj mapy, jiná cesta, nebo nikam – klik vybere, co jde vybrat.
   */
  ends: [VillageRoadEnd, VillageRoadEnd];
  /**
   * Druh cesty, který na ní převládá (podle délky; při shodě lepší) – portrét panelu. Vyšlapaná
   * s vozy je vyježděná (wagons.md – Vyježděná cesta, `roadKind`).
   */
  roadKind: RoadKind;
  lengthM: number;
  /** Délka po druzích (m) – jen druhy, které cesta má, od vyšlapané přes vyježděnou po hať. */
  kinds: { kind: RoadKind; lengthM: number }[];
  /** Stáří nejstaršího úseku v celých letech. */
  ageYears: number;
  /** Stojící stromy u cesty (keře a stromy, ne souše a pařezy). */
  trees: number;
  /**
   * O kolik stromy a jabloně u cesty zrychlí chůzi i jízdu vozem (roads.md – Stromy u cesty
   * zrychlí chůzi): průměr úseků podle délky (`roadTreeSpeed`), na tisíciny; bez stromů 0.
   */
  treeSpeed: number;
  /** Cesta vede mokřinou (m) a přes brody. */
  wetM: number;
  fords: number;
  /** Rozestavěné vylepšení – na jaký stupeň, průběh 0–1 a stromy ke skácení; jinak null. */
  building: { grade: RoadGrade; progress: number; treesToFell: number } | null;
  upgrades: RoadUpgradeOption[];
  /** Rozdělaná úprava nebo vozová cesta, kterou jde zrušit (id stavby); jinak null. */
  cancelId: number | null;
  /**
   * Vozová cesta (roads.md – Vozová cesta): hotová, staví se (průběh 0–1), nebo zatím žádná –
   * a proč ji teď nejde zadat (bez hledání trasy; trasu, cenu a co přinese spočítá náhled ve
   * scéně stejnou funkcí jako server – `planWagonRoad`).
   */
  wagon: { status: 'none' | 'building' | 'built'; progress: number; blocked: string | null };
  /**
   * Jabloně podél cesty (roads.md – Vysazení jabloní): živé stromy, z nich plodící, rozestavěná
   * výsadba (kolik jabloní a průběh 0–1) a „Vysadit jabloně“ – kolik přibude, práce a proč ne.
   */
  apples: {
    trees: number;
    bearing: number;
    /** Rozestavěná výsadba; `waits` – mimo okna výsadby (sází se na jaře a na podzim). */
    planting: { trees: number; progress: number; waits: boolean } | null;
    option: RoadApplesOption;
  };
}

/** Názvy druhů cesty (roads.md – Druhy cest, Vylepšení cesty; wagons.md – Vyježděná cesta). */
export const ROAD_KIND_NAMES: Record<RoadKind, string> = {
  trodden: 'Vyšlapaná cesta',
  cart: 'Vyježděná cesta',
  improved: 'Upravená cesta',
  causeway: 'Cesta s hatí a lávkou',
  wagon: 'Vozová cesta',
};

/** Tlačítka vylepšení – název akce. */
export const ROAD_UPGRADE_NAMES: Record<RoadUpgrade, string> = {
  improved: 'Upravit cestu',
};

/** Jídlo pro horní lištu a tooltip nasycení (diet.md) – energie, pestrost a podíly na energii. */
export type VillageDiet = Pick<DietDay, 'energy' | 'protein' | 'diversity' | 'shares'>;

/** Řemeslná dílna pro panel výběru (crafts.md – Co hráč vidí). */
export interface VillageWorkshop {
  /** Id obydlí dílny. */
  dwellingId: number;
  craft: Craft;
  /** Co dílna dělala poslední den – vyrábí, kácí, čeká na uhlí / dřevo, nemá kdo, prázdná. */
  activity: WorkshopActivity;
  occupants: number;
  /** Práce řemeslu za den (člověkodny po denním minimu). */
  laborPerDay: number;
  /** Výroba za den při této práci, když jsou vstupy (kg výrobku). */
  outputPerDayKg: number;
  /**
   * Uhlíř: jeho milíře (crafts.md – Milíř u skácených buků) – fáze, připravené buky z kolika,
   * průběh fáze 0–1, uhlí a kde stojí; ostatní dílny prázdné.
   */
  kilns: VillageSummary['crafts']['workshops'][number]['kilns'];
  /** Uhlíř: pařezy buků, na které ještě zasadí mladý buk; ostatní 0. */
  toPlant: number;
  /**
   * Učení řemesla (crafts.md – Učení řemesla): výkon dílny podle praxe 0–1 (po setinách), praxe
   * řemeslníka (roky, po desetinách) a synové, kteří se učí (věk, praxe).
   */
  skill: VillageSummary['crafts']['workshops'][number]['skill'];
  /**
   * Tesař (wagons.md – Tesař): rozdělaný vůz (druh a průběh 0–1), klády v dílně, pokrytí dřevěné
   * práce staveb posledního dne 0–1 a kování k vozu (čeká, nebo cesta pro ně – wagons.md, Kování
   * vozů); ostatní dílny null.
   */
  carpenter: VillageSummary['crafts']['workshops'][number]['carpenter'];
  /**
   * Kovář (crafts.md – Uhlí a ruda kováře): zásoba rudy (kg), rudiště (vzdálenost chůze, kolik rudy
   * v ložisku zbývá), hromada u jámy a kdo nosí uhlí (synové 10–13, vůz se sedlákem); bez údaje
   * dílna jiného řemesla.
   */
  ore?: VillageSummary['crafts']['workshops'][number]['ore'];
  /**
   * Kovář (production-chains.md – Kovář): houba a hřivny u kovárny, zásoba hřiven na rok obnovy,
   * nástroje ve vybavení a jejich potřeba (kg, po desetinách) a měchař u tavby; bez údaje dílna
   * jiného řemesla.
   */
  iron?: VillageSummary['crafts']['workshops'][number]['iron'];
  /**
   * Hrnčíř (crafts.md – Hlína hrnčíře): zásoba hlíny (kg), hliniště (vzdálenost chůze, kolik hlíny
   * zbývá) a hromada u jámy; bez údaje dílna jiného řemesla.
   */
  clay?: VillageSummary['crafts']['workshops'][number]['clay'];
}

/** Vůz vsi pro lištu a panel (wagons.md – Vůz): druh, stav 0–1 a jestli je s výpravou pryč. */
export interface VillageCart {
  id: number;
  kind: CartKind;
  condition: number;
  away: boolean;
}

/**
 * Řemesla vsi pro horní lištu a panel výběru: zásoby (kg), potřeba a pokrytí 0–1 (meze
 * produktivity) a dílny – hotové (`workshops`). Lišta zásoby ukáže, jen když ves řemesla má
 * (`present` – hotová nebo rozestavěná dílna, nebo něco v zásobě). Vozy od tesaře (wagons.md)
 * a kolik jich ves potřebuje.
 */
export interface VillageCrafts {
  present: boolean;
  stocks: CraftStocks;
  /**
   * Nástroje ve vybavení domácností (kg – production-chains.md, Nástroje jako vybavení
   * domácností); v liště nejsou, panel kovárny je ukáže s pokrytím `coverage.tools`. Chybí =
   * neznámo (starší pohledy, testy).
   */
  equipmentKg?: number;
  needs: CraftNeeds;
  coverage: CraftCoverage;
  workshops: VillageWorkshop[];
  carts: VillageCart[];
  cartTargets: Readonly<Record<CartKind, number>>;
  /**
   * Kde ves bere nástroje, keramiku a dřevěné nářadí (crafts.md – Nákup u sousedů): vlastní
   * pracující řemeslník, nebo nejbližší soused s řemeslníkem (směr, dny cesty, po stezce);
   * chybí = neznámo (starší pohledy, testy).
   */
  sources?: VillageCraftSource[];
}

/** Odkud ves bere výrobek řemeslníků (crafts.md – Nákup u sousedů). */
export interface VillageCraftSource {
  product: CraftProduct;
  own: boolean;
  direction: Direction8 | null;
  days: number | null;
  trail: boolean;
}

export interface VillageView {
  /** Id vsi – akce i dotazy jdou podle něj (migration.md – Víc vsí jednoho hráče). */
  id: string;
  /**
   * Otisk pohledu (`villageViewStamp` – ves, den, jméno a verze všech vsí hráče): klient ho pošle
   * s dalším dotazem a server při shodě odpoví `{ unchanged: true }` bez načtení vsí. Chybí =
   * dotaz vždy celý.
   */
  stamp?: string;
  /** Sídlo (mapa), na jehož krajině ves stojí. */
  settlementId: string;
  name: string;
  /**
   * Všechny vsi hráče (i tahle) pro přepínač v horní liště – sídelní první, pak podle založení.
   * Upozornění z jiných vsí se ukážou krátkým řádkem se jménem vsi.
   */
  villages: VillageListItem[];
  dayIndex: number;
  people: { children: number; adults: number; elders: number };
  households: {
    dwellingId: number;
    type: DwellingType;
    /** Řemeslo dílny (crafts.md); obyčejné obydlí null. */
    craft: Craft | null;
    occupants: number;
    /** Muži, ženy, děti, starší a manželské páry (kinship.md – panel obydlí). */
    family: FamilyCounts;
    capacity: number;
    full: boolean;
    overcrowded: boolean;
    condition: number;
    /** Věk obyvatel v celých letech, od nejstaršího. */
    ages: number[];
    /** Obyvatelé s portrétem, rolí a věkem, od nejstaršího (panel obydlí). */
    residents: DwellingResident[];
    /** Stáří obydlí v celých letech. */
    ageYears: number;
    /** Domácnost si staví nový dům (migration.md – Přestěhování domácnosti); jinak null. */
    relocation: HouseholdRelocation | null;
    /** Proč se domácnost teď přestěhovat nemůže (null = může). */
    relocationBlock: RelocationBlock | null;
  }[];
  storesKg: number;
  /** Zásoby ovoce – jablek (kg; v rozhraní „ovoce“ – diet.md). */
  applesKg: number;
  /** Zásoba sýra (kg) a mléko dne (l, když se podojí všechny dojné samice – diet.md). */
  cheeseKg: number;
  milkLPerDay: number;
  /** Zásoba masa (kg) – uzené a sušené (diet.md). */
  meatKg: number;
  /** Zásoba luštěnin (kg – hrách a čočka; diet.md – Luštěniny). */
  legumesKg: number;
  /** Zásoba sena (kg) – horní lišta ho ukáže, když ves má ohradu nebo seno (oxen.md). */
  hayKg: number;
  /** Jídlo příštího dne – energie, pestrost a podíly obilí, masa a ovoce (tooltip nasycení). */
  diet: VillageDiet;
  /** Dobytek – stáda, slepice, voli a nosnost (diet.md – Co hráč vidí). */
  livestock: LivestockSummary;
  /** Ohrady v pořadí založení. */
  pens: VillagePen[];
  /**
   * Druhy stád, která se na noc nevejdou do ohrad svého druhu ani k domům (oxen.md – Ohrady podle
   * druhu) – co se nevejde, půjde při porážce na maso; bez údaje se vejdou všechna.
   */
  penShort?: HerdSpecies[];
  /**
   * Voli vsi a kolik jich ves chce (oxen.md – Ohrada volů, Co hráč vidí) – panel ohrady volů
   * a upozornění „Voli se nevejdou do ohrady“; bez ohrady volů bez údaje.
   */
  oxen?: VillageOxen;
  /**
   * Koně vsi po kusech, kolik jich ves chce a obilí (horses.md – Co hráč vidí) – panel ohrady
   * koní a upozornění; ves bez ohrady koní bez údaje.
   */
  horses?: VillageHorses;
  /** Snopy a výmlat (production-chains.md – Humno); ves bez snopů a upozornění bez údaje. */
  threshing?: VillageThreshing;
  /** Humna pro panel výběru (production-chains.md – Humno) – hotová i rozestavěná; bez humna bez údaje. */
  threshingFloors?: VillageThreshingFloor[];
  /** Pevné cesty (roads.md) – úseky pro panel výběru: stupeň, délka, stáří, stromy, vylepšení. */
  roads: VillageRoad[];
  /** Všechny klády vsi v kusech – u vsi i na hromadách u lesa (forest.md). */
  woodLogs: number;
  /** Z toho klády na hromadách u lesa; bez hromady u lesa bez údaje. */
  woodLogsForest?: number;
  /** Z toho klády na hromadě u vsi (`pileLogs`); vždy s `woodLogsForest`. */
  woodLogsPile?: number;
  /** Řemesla – zásoby uhlí, nástrojů a keramiky, pokrytí a dílny (crafts.md). */
  crafts: VillageCrafts;
  storesMonths: number;
  satiation: number;
  /**
   * Kolik lidí uživí pole vsi v ustáleném oběhu (fields.md – Co hráč vidí, Pole uživí): počet lidí,
   * pole v oběhu (ha) a průměrná přirozená úrodnost; bez pole nebo lidí null.
   */
  fieldCapacity?: { people: number; rotationHa: number; fertility: number } | null;
  commonLaborPerDay: number;
  /**
   * Vojvodova rodina dnes (lord.md – Co hráč vidí): kolik jich cvičí, je na poli a vede domácnost;
   * bez cvičící rodiny null.
   */
  lord?: { training: number; field: number; household: number } | null;
  /** Rod vojvody pro jména (lord.md – Jména); ves bez rodu null, starší pohled bez pole. */
  dynasty?: DynastyView | null;
  /** Některá rodina se může oddělit a nečeká na ni žádné obydlí (upozornění „Rodina čeká na dům“). */
  fullHousehold: boolean;
  /** Nabídka staveb – hráč staví kdy chce, předem musí ves mít suroviny a lidi k osídlení. */
  build: Record<BuildKind, BuildOption>;
  /** Nový dům stěhující se domácnosti – cena bez lidí k osídlení (migration.md). */
  relocation: Record<BuildableDwellingType, BuildOption>;
  constructions: {
    id: number;
    kind: ConstructionKind;
    label: string;
    progress: number;
    /** Typ stavěného obydlí (u přestavby nový typ), u pole null. */
    dwellingType: DwellingType | null;
    /** Stavěná nebo přestavovaná řemeslná dílna (crafts.md), jinak null. */
    craft: Craft | null;
    /** Přestavované obydlí (rebuild), jinak null. */
    dwellingId: number | null;
    /** Nový dům stěhující se domácnosti – id jejího obydlí (migration.md); jinak null. */
    relocates: number | null;
    /** Zakládané pole (field), jinak null. */
    fieldId: number | null;
    /** Zakládaný nebo rozšiřovaný hřbitov (cemetery), jinak null. */
    cemeteryId: number | null;
    /** Vysazovaný sad (orchard), jinak null. */
    orchardId: number | null;
    /** Stavěná nebo rozšiřovaná ohrada (pen), jinak null. */
    penId: number | null;
    /** Stavbu jde zrušit (cancel-construction.ts) – rozestavěná, kterou začal hráč. */
    cancellable: boolean;
    /** Kolik stromů stavba ještě musí skácet (obydlí, přestavba – forest.md). */
    treesToFell: number;
  }[];
  /**
   * Pole pro panel výběru: výměra, průměrná úrodnost, počet dílů podle stadia a podle povrchu,
   * na kterém se díly zakládaly (louka, křoviny, les), oseté díly podle plodiny (ozim, jař)
   * a kolik dílů má popel z vymýceného lesa.
   */
  fields: {
    id: number;
    areaM2: number;
    fertility: number;
    stages: Partial<Record<PartStage, number>>;
    surfaces: Partial<Record<FieldSurface, number>>;
    /** Oseté díly podle plodiny (fields.md – Ozim a jař); díl bez plodiny je jař. */
    crops: Partial<Record<Crop, number>>;
    /**
     * Na řadě (fields.md – Osevní postup po dílech, bod 6): díly mimo letošní práci, které čekají
     * na ozim či jař, odpočívající příloh (pod 95 %) a díly letošní práce nad potřebu podle obilí.
     */
    turn: {
      winter: number;
      spring: number;
      resting: number;
      surplus: { winter: number; spring: number };
    };
    /** Díly v okně bonusu úrodnosti po vymýcení lesa (fields.md – Úroda). */
    ashParts: number;
    /** Zakládané díly v lese po fázích klučení (kácí se / schne / pálí se); chybí bez nich. */
    clearing?: Record<ClearingStage, number>;
    /** Nejvyšší letošní bonus úrodnosti z popela (+40 první sezónu osevu, +20 druhou), jinak 0. */
    ashBonus: number;
    /**
     * Kolik z pole zarůstá (m², fields.md – Zarůstání): příloh, který se poslední vegetační
     * období nespásl ani neposekl, i ten, který už zarostl křovinami a mladým lesem.
     */
    overgrowingM2: number;
    /** Díly pole pro panel vybraného dílu (klik na pole – fields.md, Co hráč vidí). */
    parts: VillageFieldPart[];
  }[];
  /** Hřbitovy v pořadí pohřbívání – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
  cemeteries: VillageCemetery[];
  /** Jabloňové sady pro panel výběru – plocha, stáří, odhad úrody (orchard.md). */
  orchards: VillageOrchard[];
  /** Ves šetří jídlem nebo hladoví – zásoby nevystačí do sklizně. */
  hungry: boolean;
  /** Lidé umírají hlady – nahromaděný hlad přesáhl práh (population.md – Hlad a vymření). */
  starving: boolean;
  /**
   * Stupeň hladu pro upozornění (population.md – Co hráč vidí): šetří jídlem (příděl 90–100 %),
   * hladoví (pod 90 %), lidé umírají hlady.
   */
  hunger: HungerLevel;
  /** Stavby stojí – několik dní po sobě nezbyla žádná společná práce. */
  constructionsStalled: boolean;
  /** Štěstí obyvatel (happiness.md) – horní lišta. */
  happiness: VillageHappiness;
  /** Posvátné duby, háje, modly a svatyně (happiness.md) – panel výběru. */
  sacred: VillageSacred;
  /** Ves vymřela – herní rok založení a vymření a kolik let žila; žijící ves null. */
  extinct: VillageLifespan | null;
  /** Ves je opuštěná – odešli všichni (migration.md); žijící ves null. */
  abandoned: VillageAbandonment | null;
  /** Lidé jsou na cestě na novou mapu (migration.md – fáze 4); ves, která stojí, null. */
  journey: VillageJourneyView | null;
  /** Odchod do nové vsi – dny cesty na novou mapu po směrech a kam to nejde (migration.md). */
  leave: VillageLeave;
  /**
   * Konec hry – hráči vymřely všechny vsi (ne jen tahle). Rozhraní ukáže obrazovku porážky
   * s tlačítkem Začít znovu.
   */
  gameOver: boolean;
  /**
   * Hra skončila, protože vymřel rod po meči (lord.md – Konec rodu) – kronika rodu pro obrazovku
   * porážky; jinak chybí.
   */
  lineEnded?: LineEndView;
  scene: SceneVillage;
  /**
   * Posledních CHRONICLE_LENGTH událostí, nejnovější první (`kind` – druh pro upozornění, `kg` –
   * množství u sklizní a porážky).
   */
  chronicle: {
    day: number;
    kind: ChronicleEvent['kind'];
    kg?: number;
    /** U pádu a opravy stavby (`structure-fell`, `structure-repaired`) která stavba. */
    structure?: AbandonedStructure;
    /** Kolik kusů kterého druhu se porazilo navíc (`emergency-slaughter` – diet.md). */
    animals?: Partial<Record<HerdSpecies, number>>;
    /** Kdo přišel od souseda a odkud (`newcomer` – trade.md, Výměna lidí). */
    group?: NewcomerGroup;
    direction?: Direction8;
    /** Co ves koupila u souseda (`crafts-bought` – crafts.md, Nákup u sousedů). */
    products?: CraftProduct[];
    /**
     * Cesta pro kování k vozu (`iron-trip`, `iron-brought` – wagons.md, Kování vozů): do které vsi
     * (jméno), jestli šel syn tesaře, kolik nosičů šlo s ním, nebo jestli platbu vezl vůz.
     */
    place?: string;
    son?: boolean;
    porters?: number;
    byCart?: true;
    /** Kolik volů se vycvičilo, dosloužilo nebo uhynulo (oxen.md – Voli po kusech). */
    oxen?: number;
    /** Kolik koní se narodilo, dosloužilo nebo uhynulo (horses.md – Chov, Krmení). */
    horses?: number;
    /** Koně okul vlastní kovář, ne kovář z jiné vsi (horses.md – Kování). */
    own?: boolean;
    /** Pohromy (disasters.md – Co hráč vidí): stupeň vody, síla smrště, potlučené díly, shořelé domy. */
    level?: DisasterChronicleEntry['level'];
    strength?: DisasterChronicleEntry['strength'];
    parts?: number;
    dwellings?: number;
    dateLabel: string;
    text: string;
  }[];
  /**
   * Nákupy výrobků řemeslníků u sousedů na cestě (crafts.md – Nákup u sousedů): směr, co ves
   * kupuje (kg), kolik lidí jde a kolik dní zbývá; chybí = žádný.
   */
  purchases?: VillagePurchase[];
  /** Den poslední svatby mezi domy (population.md – Sňatky mezi domy); žádná null. */
  lastMarriageDay: number | null;
  /**
   * Dvorec vojvody (trade.md – Dvorec vojvody): obydlí, odkud jdou vylepšení vsi – zemské stezky
   * a obchod se sousedy; dokud zakladatelé první zemnici staví, null.
   */
  manor: VillageManor | null;
  /** Divoká zvěř vsi – hrubé stavy druhů a podklady upozornění (wildlife.md); chybí = ještě není. */
  wildlife?: VillageWildlife;
  /**
   * Počasí roku pro horní lištu (disasters.md – Co hráč vidí): jen neobvyklé a už vidět, povodeň
   * s výškou vody; ves bez počasí kraje nebo obyčejný rok – chybí. Nikdy seed ani budoucí rok.
   */
  weather?: WeatherView;
  /**
   * Rudiště kováren (crafts.md – Uhlí a ruda kováře) pro panel výběru – ložisko, hromada u jámy,
   * zásoba v kovárně, cesta, jámy a kdo tu dnes pracuje; chybí = žádné.
   */
  oreSites?: VillageDugSite[];
  /** Hliniště hrnčířů (crafts.md – Hlína hrnčíře) pro panel výběru – jako rudiště; chybí = žádné. */
  claySites?: VillageDugSite[];
  /**
   * Milíře a milířiště uhlířů (crafts.md – Milíř u skácených buků) pro panel výběru – fáze, uhlí,
   * cesty a kdo sem dnes chodí pro uhlí; chybí = žádné.
   */
  kilns?: VillageKiln[];
  /**
   * Otevřené obilné jámy (production-chains.md – Obilné jámy) pro panel výběru – zrno v jámě;
   * zapečetěné jámy nejsou vidět. Chybí = žádná.
   */
  grainPits?: VillageGrainPit[];
  /**
   * Křižovatky cest (paths.md – Křižovatky) pro panel výběru – tvar, počet cest, znamení, stáří.
   * Chybí = žádná.
   */
  junctions?: VillageJunction[];
}

/** Nákup u souseda na cestě (crafts.md – Nákup u sousedů). */
export interface VillagePurchase {
  direction: Direction8;
  get: CraftPurchaseGoods;
  /** Platba v kg obilí (hodnota u souseda). */
  payKg: number;
  group: number;
  daysLeft: number;
  /** Průběh cesty 0–1. */
  progress: number;
}

/** Názvy výrobků řemeslníků ve 4. pádě (kronika, upozornění – nákup u sousedů). */
export const PRODUCT_NAMES: Record<CraftProduct, string> = {
  toolsKg: 'nástroje',
  potteryKg: 'keramiku',
  woodToolsKg: 'dřevěné nářadí',
};

/** Názvy výrobků řemeslníků v 1. pádě (popisky panelu). */
export const PRODUCT_TITLES: Record<CraftProduct, string> = {
  toolsKg: 'Nástroje',
  potteryKg: 'Keramika',
  woodToolsKg: 'Dřevěné nářadí',
};

/** Ikona výrobku v `public/icons/resources/`. */
export const PRODUCT_ICONS: Record<CraftProduct, string> = {
  toolsKg: 'tools',
  potteryKg: 'pottery',
  woodToolsKg: 'wood-tools',
};

/** Co ves koupila – výrobky v pořadí CRAFT_PRODUCTS (aspoň kg). */
export function boughtProducts(get: CraftPurchaseGoods): CraftProduct[] {
  return CRAFT_PRODUCTS.filter((p) => (get[p] ?? 0) > 0);
}

/** Výčet výrobků česky: „nástroje, keramiku a dřevěné nářadí“. */
export function productList(products: readonly CraftProduct[]): string {
  const names = products.map((p) => PRODUCT_NAMES[p]);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} a ${names[names.length - 1]}`;
}

/** Hřbitov pro panel výběru – čísla, žádné věty (rozhraní jako v 0 A.D.). */
export interface VillageCemetery {
  id: number;
  squares: number;
  /** Vytyčený a ohrazený – přijímá mrtvé. */
  built: boolean;
  /** Průběh stavby 0–1: založení, u hotového hřbitova rozšíření; bez stavby 1. */
  progress: number;
  /**
   * Místa na hroby hotových čtverců (rozšíření ve stavbě se nepočítá) – mohyla významného zabere
   * víc míst (cemetery.md – Mohyly podle významu).
   */
  capacity: number;
  /** Pohřbení (lidé). */
  graves: number;
  /** Obsazená a volná místa na hroby. */
  usedPlaces: number;
  freePlaces: number;
  /** Odhad, za kolik let se zaplní (podle úmrtí posledních let); bez úmrtí null. */
  yearsLeft: number | null;
  /** Stav plotu 0–1 (abandonment.md – ke hřbitovu, kam nikdo nechodí, plot chátrá). */
  fenceCondition: number;
  /** Opuštěný – nikdo k němu nechodí, plot chátrá. */
  abandoned: boolean;
  /**
   * Vesničané plot opravují, spadlý stavějí znovu (abandonment.md – Oprava) – průběh 0–1;
   * jinak null.
   */
  repair: number | null;
}

/**
 * Díl pole pro panel vybraného dílu (klik na pole vybere díl, dvojklik celé pole – fields.md, Co
 * hráč vidí): čísla zaokrouhlená pro panel, výchozí údaje chybí – pohled nese všechny díly vsi,
 * drží se proto úsporně. Co je vidět ve scéně (stadium, vzhled, roky bez pastvy a seče, pastva),
 * bere panel ze `SceneFieldPart` (díl podle `id`).
 */
export interface VillageFieldPart {
  id: number;
  /**
   * Výměra (m², celé) – bez skalních výchozů a půdy, kterou zabrala stavba; celý čtverec chybí
   * (strana čtverce ze scény na druhou).
   */
  areaM2?: number;
  /** Úrodnost dnes – i s popelem z vymýceného lesa (celá čísla 0–100). */
  fertility: number;
  /**
   * Přirozená úrodnost z krajiny – osev ji vyčerpává, ladem se obnovuje (celá čísla 0–100); stejná
   * jako dnešní chybí.
   */
  naturalFertility?: number;
  /** Letošní bonus úrodnosti z popela vymýceného lesa (+40, +20 – fields.md, Úroda); jinak chybí. */
  ashBonus?: number;
  /** Povrch při založení, když to nebyla louka (křoviny, les); louka chybí. */
  surface?: FieldSurface;
  /** Chůze z nejbližšího obydlí po pěšinách a cestách (m, celé – paths.md, Pěšiny a práce). */
  walkM: number;
  /** Hospodářství – id obydlí, ke kterému díl patří (fields.md – Hospodaření podle polohy domů). */
  holding?: number;
  /** Osetý díl: kolik let v řadě je oset (vyčerpání úrodnosti). */
  sownYears?: number;
  /** Příloh: celé roky ladem. */
  fallowYears?: number;
  /** Letošní práce na dílu (`partYearWork` – podíly na setiny); díl bez letošní práce chybí. */
  work?: PartYearWork;
  /**
   * Co na dílu poroste příště (`partRotation` – fields.md, Osevní postup po dílech, bod 6) – plodina,
   * nebo úhor; zakládaný díl chybí.
   */
  next?: NextCrop;
  /** Úhor: odpočinek k 95 % (setiny) a roky do osevu (≈). */
  rest?: { share: number; years: number };
  /** Zakládaný díl: průběh 0–1 (setiny), zbývající práce (člověkodny) a dospělé stromy na klády. */
  founding?: {
    progress: number;
    laborLeft: number;
    trees: number;
    /** Díl v lese po fázích (forest.md – Klučení lesa pro pole): fáze, stromy ke kácení a den pálení. */
    clearing?: PartClearingView;
  };
  /** Škoda zvěře letos (wildlife.md – Co hráč vidí): jen díl, který zvěř ohrožuje. */
  damage?: FieldDamageView;
  /** Ochrana dílu před počasím (disasters.md – Ochrana dílu); ves bez počasí kraje – chybí. */
  protection?: PartProtectionView;
  /** Odhad ztrát úrody letos z počasí a pohrom (disasters.md – Co hráč vidí); žádné – chybí. */
  losses?: PartLossesView;
}

/**
 * Klučení dílu v lese pro panel: fáze (`clearingStage`), kolik stromů zbývá pokácet a první den
 * pálení (`burnFromDay`, den hry) – jen po pádu posledního stromu.
 */
export interface PartClearingView {
  stage: ClearingStage;
  treesLeft: number;
  burnFrom?: number;
}

/** Čtverec sadu pro panel vybraného čtverce (klik na sad – orchard.md, Co hráč vidí). */
export interface VillageOrchardSquare {
  /** Čtverec v mřížce sadu – podle něj ho najde výběr ve scéně. */
  cell: TileCell;
  areaM2: number;
  /** Stáří v celých letech od výsadby; dokud se sází, null. */
  ageYears: number | null;
  /** Úroda čtverce nejbližší sklizně při plné sklizni (kg jablek, celé). */
  expectedYieldKg: number;
  /** Výsadba čtverce 0–1 (i znovu při obnově, když staré stromy padly); vysazený null. */
  planting: number | null;
  /** Výsadba čeká na okno (jaro, podzim). */
  plantingWaits: boolean;
  /** Čtverec je v obnově (orchard.md – Obnova sadu) – staré stromy čekají na skácení, nebo se sází znovu. */
  renewal: boolean;
  /** Chůze z nejbližšího obydlí (m, celé). */
  walkM: number;
}

/** Sad pro panel výběru – čísla, žádné věty. */
export interface VillageOrchard {
  id: number;
  areaM2: number;
  squares: number;
  /** Čtverce sadu pro panel vybraného čtverce. */
  cells: VillageOrchardSquare[];
  /** Stáří v celých letech od výsadby; dokud se nic nevysadilo, null. */
  ageYears: number | null;
  /** Úroda nejbližší sklizně při plné sklizni (kg jablek). */
  expectedYieldKg: number;
  /** Průběh výsadby 0–1; vysazený sad null. */
  planting: number | null;
  /** Výsadba čeká na okno – sází se jen na jaře a na podzim (orchard.md). */
  plantingWaits: boolean;
}

export const DAYS_PER_YEAR = 365.25;

/**
 * Snopy a výmlat vsi (production-chains.md – Humno): nevymlácené snopy (kg zrna obilí
 * a luštěnin) a upozornění – nouzový výmlat na udusané zemi u vsi bez humna (`emergency`), humno
 * nestačí (`floorShort`). Chybí, co neplatí.
 */
export interface VillageThreshingFloor {
  /** Id humna (= id stavby) – vybírá se podle něj (`{ kind: 'threshing-floor', id }`). */
  id: number;
  /** Hotové humno (jinak staveniště). */
  built: boolean;
  /** Průběh stavby 0–1 (hotové 1). */
  progress: number;
  /** Nevymlácené snopy vsi (kg zrna a luštěnin, po celých). */
  sheavesKg: number;
  /** Dnes se na humně mlátí (rozdělení práce dne). */
  threshingToday: boolean;
}

export interface VillageThreshing {
  sheavesKg?: number;
  emergency?: true;
  floorShort?: true;
}

/** Muž rodu bez jména – čeká, až ho hráč pojmenuje (lord.md – Kde se jméno zadává). */
export interface UnnamedLineMan {
  id: number;
  /** Věk v celých letech (portrét v panelu jména). */
  age: number;
  /** Je to vojvoda (popisek „Jméno vojvody“), jinak jeho syn („Jméno syna“). */
  lord: boolean;
}

/** Rod vojvody pro rozhraní jmen (lord.md – Jména, Kde se jméno zadává, Kde se jméno ukazuje). */
export interface DynastyView {
  lordId: number | null;
  /** Jméno dnešního vojvody; chybí – vojvoda jméno ještě nemá. */
  lordName?: string;
  /**
   * Žijící muži rodu bez jména – vojvoda první, pak od nejstaršího. Fronta se neukládá, je to stav
   * vsi (lord.md – Čekající jména se neukládají zvlášť).
   */
  unnamed: UnnamedLineMan[];
  /** Jména žijících mužů rodu – kostka nabízí přednostně jiná (`suggestLineName`). */
  taken: string[];
  /** Jména ženatých synů rodu, kteří bydlí v dvorci – čekají na dům („Rodina čeká na dům“). */
  waitingHome: string[];
  /** Synové vojvody od 16 let pro odchod s poměrnou částí vsi – řada ikon v panelu dvorce. */
  sons: DepartingSon[];
}

/** Syn vojvody pro odchod (lord.md – Dělení vsi, Co hráč vidí); mladší 16 let v řadě chybí. */
export interface DepartingSon {
  id: number;
  /** Bez jména syn vést nesmí. */
  name?: string;
  age: number;
  /** Proč nesmí vést (zašedlá ikona), jinak null. */
  reason: string | null;
  /** Obydlí dílu (obrys ve scéně); u syna, který nesmí vést, prázdné. */
  dwellingIds: number[];
  /** Lidé dílu. */
  people: number;
  /** Syn si vezme jezdeckého koně. */
  horse: boolean;
}
