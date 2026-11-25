import {
  ABANDON_FOUNDING,
  PRODUCT_CRAFT,
  type GridCell,
  HORSES,
  AGE,
  CARTS,
  DRAFT_OXEN,
  LEAVING,
  ORCHARD,
  everyoneLeaves,
  sacredBuildingHappiness,
  type CartKind,
  type PremiumSiteKind,
  type PremiumType,
  type Craft,
  type Crop,
  type DwellingType,
  type FamilyCounts,
  type FieldSurface,
  type HerdPlaces,
  type HerdSpecies,
  type MasonCraft,
  type MasonryCircle,
  type ClearingStage,
  type PenSpecies,
  type PartStage,
  type NextCrop,
  type PartYearWork,
  type RoadGrade,
  type RoadKind,
  type RoadUpgradeOption,
  type SacredBuildingKind,
  type TileCell,
  type WorkshopActivity,
  type WaresView,
} from '@bohemia/game';
import type { VillageChurch } from './church-view';
import type { LeaveDirection } from './departure-view';
import type { VillageManor } from './manor-view';
import type { FieldDamageView, WildlifeSpeciesView } from './wildlife-view';
import { partLossRows, type PartLossRow, type PartProtectionView } from './disasters-view';
import type { VillageHorses } from './horse-view';
import type { VillageDugSite } from './ore-site-view';
import type { VillageKiln } from './kiln-view';
import type { VillageGrainPit } from './grain-pit-view';
import type { VillageJunction } from './junction-view';
import type { VillageFortGate, VillageFortification, VillageFortSection } from './fort-view';
import { FORT_GATE_HALF_M } from './fort-sections';
import type {
  DepartingSon,
  FieldOutlookView,
  PartOutlookView,
  StructureUseView,
  VillageFieldPart,
  VillageThreshingFloor,
} from './village-view-types';
import { TREE_GROWTH_YEARS } from './orchard-look';
import {
  personPortrait,
  type ArmsView,
  type DwellingResident,
  type LodgeView,
  type PersonPortraitIcon,
} from './person-view';
import { expeditionPersonState, type ExpeditionPersonState } from './expedition-buttons';
import {
  INJURED_ACTIVITY,
  journeyActivity,
  personActivity,
  type PersonFigureState,
} from './person-activity';
import type { PartyView } from './journey-view';
import type { SceneJourney } from './scene/journey-riders';
import {
  cartActivityText,
  cartGoal,
  cartPen,
  teamActivityText,
  teamPen,
  type CartGoal,
  type DraftFigureState,
} from './draft-activity';
import { ROLE_NAMES, herdRole } from './person-roles';
import {
  dugSiteOf,
  nearestRoad,
  selectedFieldPart,
  selectedOrchardSquare,
  type VillageTarget,
} from './scene/village-picking';
import {
  CRAFT_LOOKS,
  type FieldLook,
  type SceneVillage,
  type VillageCraftSource,
  type VillagePurchase,
  type VillageOxen,
  type VillageRoad,
  type VillageView,
} from './village-view';
import { workshopStopNotice } from './village-notices';

// Co ukáže panel výběru (dole uprostřed, jako v 0 A.D.) o vybraném obydlí (i řemeslné dílně –
// crafts.md), dílu pole a celém poli (fields.md – Co hráč vidí), hřbitovu, čtverci sadu a celém
// sadu, posvátném místě (posvátný dub, dubový háj, modla, svatyně – happiness.md) nebo ohradě
// (oxen.md – zvířata, spřežení, výcvik a seno; diet.md – stáda vsi) nebo rudišti kováře (crafts.md
// – Uhlí a ruda kováře). Čistý modul – data z pohledu na ves a scény vsi.

/** Řemeslná dílna v panelu výběru – co dělá, kolik vyrobí a zásoba jejího výrobku. */
export interface SelectionWorkshop {
  craft: Craft;
  activity: WorkshopActivity;
  /** Práce řemeslu za den (člověkodny). */
  laborPerDay: number;
  /** Výroba za den, když jsou vstupy (kg). */
  outputPerDayKg: number;
  /** Zásoba výrobku ve vsi (kg). */
  stockKg: number;
  /** Pokrytí potřeby vsi výrobkem 0–1 (nástroje, keramika); uhlí null. */
  coverage: number | null;
  /**
   * Uhlíř: milíř, u kterého se dnes pracuje – rozdělaný (kácení a příprava, stavba, pálení), jinak
   * nejstarší vypálený (crafts.md – Milíř u skácených buků); fáze, buky, průběh 0–1 a uhlí; jinak
   * null.
   */
  kiln: VillageView['crafts']['workshops'][number]['kilns'][number] | null;
  /**
   * Uhlíř: všechny jeho milíře (nejvýš dva – jeden se rozebírá, druhý se chystá) – tlačítka je
   * vyberou; jinak prázdné.
   */
  kilns: VillageView['crafts']['workshops'][number]['kilns'];
  /** Uhlíř: pařezy buků, na které ještě zasadí mladý buk. */
  toPlant: number;
  /** Učení řemesla (crafts.md): výkon dílny podle praxe, praxe řemeslníka a kdo se učí. */
  skill: VillageView['crafts']['workshops'][number]['skill'];
  /**
   * Tesař (wagons.md – Tesař): vozy vsi (doma / na cestě) a kolik jich ves potřebuje, rozdělaný
   * vůz (druh, průběh 0–1), pokrytí dřevěné práce staveb posledního dne 0–1 a kování k vozu
   * (wagons.md – Kování vozů); ostatní dílny null.
   */
  carpenter: {
    carts: VillageView['crafts']['carts'];
    cartTargets: VillageView['crafts']['cartTargets'];
    making: { kind: CartKind; progress: number } | null;
    woodworkCoverage: number;
    iron: NonNullable<VillageView['crafts']['workshops'][number]['carpenter']>['iron'];
  } | null;
  /** Kovář: ruda, rudiště a kdo nosí uhlí (crafts.md – Uhlí a ruda kováře); jinak chybí. */
  ore?: NonNullable<VillageView['crafts']['workshops'][number]['ore']>;
  /**
   * Kovář (production-chains.md – Kovář): houba, hřivny a jejich zásoba, nástroje ve vybavení
   * domácností s pokrytím potřeby a měchař u tavby; jinak chybí.
   */
  iron?: NonNullable<VillageView['crafts']['workshops'][number]['iron']> & { coverage: number };
  /** Hrnčíř: hlína a hliniště (crafts.md – Hlína hrnčíře); jinak chybí. */
  clay?: NonNullable<VillageView['crafts']['workshops'][number]['clay']>;
}

/**
 * Výrobky řemeslníků v panelu dvorce: vlastní řemeslník, nebo žádný (markets.md – Pravidla 1),
 * a nákupy u sousedů uložené na cestě do návratu (crafts.md – Nákup u sousedů).
 */
export interface SelectionBuying {
  sources: SelectionCraftSource[];
  purchases: VillagePurchase[];
}

/** Výrobek v řádku dvorce; dílna, která stojí bez vstupu, nese text upozornění (`stopped`). */
export interface SelectionCraftSource extends VillageCraftSource {
  stopped?: string;
}

/** Společné údaje panelů opevnění: id, druh a nástavba valu. */
type FortPanelBase = Pick<VillageFortification, 'id' | 'fortKind' | 'top'>;

type SelectionKinds =
  | {
      kind: 'dwelling';
      id: number;
      type: DwellingType;
      occupants: number;
      /** Muži, ženy, děti, starší a manželské páry (kinship.md – panel obydlí). */
      family: FamilyCounts;
      capacity: number;
      /** Věk obyvatel v letech, od nejstaršího. */
      ages: number[];
      /** Obyvatelé s portrétem, rolí a věkem, od nejstaršího. */
      residents: DwellingResident[];
      condition: number;
      ageYears: number;
      full: boolean;
      overcrowded: boolean;
      /** Letošní sklizeň zahrádky (kg luštěnin – fields.md, Zahrádka u obydlí); jinak chybí. */
      garden?: { legumeKg: number };
      /**
       * Obyvatelé obydlí přestavují (průběh 0–1, nový typ a stromy, které ještě musí skácet),
       * jinak null.
       */
      rebuild: { progress: number; type: DwellingType; treesToFell: number } | null;
      /** Řemeslná dílna (crafts.md); obyčejné obydlí null. */
      workshop: SelectionWorkshop | null;
      /** Dvorec vojvody (trade.md) – vylepšení vsi; obyčejné obydlí null. */
      manor: VillageManor | null;
      /** Zásoby zboží vsi na dvorci (hides-honey.md); jiné obydlí nebo ves bez zboží null. */
      wares?: WaresView | null;
      /**
       * Popisek domu vedlejší manželky vojvody, který vojvodu jmenuje (lord.md – Kde se jméno
       * ukazuje); jiný dům null.
       */
      lordWifeHome?: string | null;
      /**
       * Dvorec: má ves na výrobky vlastního řemeslníka a nákupy u sousedů na cestě (crafts.md –
       * Nákup u sousedů; markets.md – Pravidla 1); u ostatních obydlí chybí.
       */
      buying?: SelectionBuying;
      /** Odejít do nové vsi (migration.md); když domácnost odejít nemůže, null. */
      leave: SelectionLeave | null;
      /** Dvorec: synové vojvody od 16 let pro odchod s poměrnou částí vsi (lord.md); jinak chybí. */
      sons?: SelectionSon[];
      /** Opustit, zbourat, vrátit (demolition.md – Rozhraní); dvorec údaj nemá. */
      use?: StructureUseView;
    }
  | {
      /** Víc vybraných lidí (Shift + klik, klik na člena skupiny – expeditions.md, Výběr). */
      kind: 'people';
      /** Vybraní lidé v pořadí výběru – řada portrétů (klik vybere jen jednoho). */
      people: { id: number; portrait: PersonPortraitIcon; role: string }[];
      /** Součet síly do meče (ženy a děti 0; jezdec na koni se svým koněm víc). */
      strength: number;
      /** Co o nich ví tlačítka Osedlat, Sesednout a Domů (`expeditionButtons`). */
      states: ExpeditionPersonState[];
    }
  | {
      /** Víc vybraných obydlí (Ctrl/Shift + klik, Ctrl + A – migration.md). */
      kind: 'dwellings';
      ids: readonly number[];
      /** Domácnosti ve vybraných obydlích (obydlí s lidmi). */
      households: number;
      /** Lidé ve vybraných obydlích. */
      people: number;
      /** Odejít do nové vsi s domácnostmi, které můžou (migration.md); žádná null. */
      leave: SelectionLeave | null;
    }
  | {
      kind: 'site';
      id: number;
      type: DwellingType;
      /** Stavěná řemeslná dílna; obydlí null. */
      craft: Craft | null;
      /** Průběh celé stavby i s kácením dřeva 0–1. */
      progress: number;
      /** Kolik stromů stavba ještě musí skácet (forest.md). */
      treesToFell: number;
      /** Nový dům stěhující se domácnosti (id jejího obydlí) – jde zrušit; jinak null. */
      relocates: number | null;
      /** Průběh bourání 0–1 (staveniště pozpátku – demolition.md); stavba null. */
      demolition?: number;
    }
  | {
      kind: 'field';
      id: number;
      areaM2: number;
      fertility: number;
      /** Díly podle stadia v pořadí PART_STAGE_ORDER (jen nenulová). */
      stages: { stage: PartStage; count: number }[];
      /**
       * Díly podle povrchu, na kterém se zakládaly, v pořadí FIELD_SURFACE_ORDER (jen nenulové) –
       * prázdné, když je celé pole na louce.
       */
      surfaces: { surface: FieldSurface; count: number }[];
      /**
       * Oseté díly podle plodiny v pořadí CROP_ORDER (jen nenulové – fields.md, Ozim a jař,
       * Luštěniny).
       */
      crops: { crop: Crop; count: number }[];
      /**
       * Na řadě (fields.md – Osevní postup po dílech, bod 6): díly mimo letošní práci, které čekají
       * na ozim či jař (jen nenulové).
       */
      turn: { crop: 'winter' | 'spring'; count: number }[];
      /** Hromada osiva vsi (`VillageView.sowingSeed`); bez osiva null. */
      seed: NonNullable<VillageView['sowingSeed']> | null;
      /** Odpočívající příloh (pod 95 %) – díly. */
      resting: number;
      /** Díly s popelem z vymýceného lesa (fields.md – Úroda). */
      ashParts: number;
      /** Zakládané díly v lese po fázích klučení; null bez nich. */
      clearing?: Record<ClearingStage, number>;
      /** Nejvyšší letošní bonus úrodnosti z popela (+40 první sezónu, +20 druhou), jinak 0. */
      ashBonus: number;
      /** Kolik z pole zarůstá (m² – fields.md, Zarůstání); 0 = nic. */
      overgrowingM2: number;
      /** Očekávaná úroda osetých dílů a jestli práce stačí (fields.md – Co hráč vidí); jinak chybí. */
      outlook?: FieldOutlookView;
      /** Zakládání pole (průběh 0–1), hotové null. */
      founding: number | null;
      /** Id všech polí vsi – tlačítko „Označit všechna pole“. */
      fieldIds?: readonly number[];
    }
  | {
      /** Všechna pole vsi najednou (i nesousedící): počet a součet výměry. */
      kind: 'fields';
      ids: readonly number[];
      areaM2: number;
    }
  | {
      /**
       * Díl pole (klik na pole – fields.md, Co hráč vidí; Martin 19. 10. 2026): co na něm je,
       * úrodnost, letošní práce, příloh, cesta a hospodářství. Id pole a čtverec dílu.
       */
      kind: 'field-part';
      id: number;
      cell: TileCell;
      /** Id dílu (`FieldPart.id`) – opuštění a vrácení do osevu. */
      partId: number;
      /** Opuštěný díl (fields.md – Opuštěný díl) – neoseje se a zarůstá; osetý po žních. */
      abandoned: boolean;
      /** Proč díl opustit nejde (nezaložený díl – zrušit jde stavba); jde-li, null. */
      abandonBlock: string | null;
      /** Co je na dílu vidět (vzhled ze scény); bez vzhledu null – název podle stadia. */
      look: FieldLook | null;
      stage: PartStage;
      /** Oseto luštěninami – zelené a zralé luštěniny místo obilí. */
      legume: boolean;
      /** Oseto lnem – zelený, kvetoucí a zralý len místo obilí (fields.md – Len). */
      flax: boolean;
      /** Len kvete (červen). */
      bloom: boolean;
      /** Díl letos oralo spřežení rádlem (zoráno místo zkopáno). */
      ploughed: boolean;
      areaM2: number;
      fertility: number;
      naturalFertility: number;
      /** Letošní bonus z popela vymýceného lesa; jinak 0. */
      ashBonus: number;
      surface: FieldSurface;
      /** Chůze z nejbližšího obydlí (m). */
      walkM: number;
      /** Hospodářství – obydlí, ke kterému díl patří (typ kvůli ikoně); bez hospodářství null. */
      holding: { dwellingId: number; type: DwellingType } | null;
      /** Osetý díl: kolik let v řadě je oset; jinak null. */
      sownYears: number | null;
      /** Příloh: celé roky ladem; jinak null. */
      fallowYears: number | null;
      /** Roky přílohu bez pastvy a seče (fields.md – Zarůstání); 0 = nezarůstá. */
      overgrowthYears: number;
      /** Pasou se na dílu stáda (příloh ve fázi louky); jinde null. */
      grazed: boolean | null;
      /** Letošní osev: plodina, příprava půdy, setí a sklizeň (podíly 0–1); mimo osev null. */
      crop: NonNullable<PartYearWork['crop']> | null;
      /** Letošní seč sena – kolik je posečeno 0–1; díl, který se neseče, null. */
      mow: number | null;
      /** Co na dílu poroste příště (osevní postup); zakládaný díl null. */
      next: NextCrop | null;
      /** Úhor: odpočinek k 95 % (0–1) a roky do osevu (≈); jinak null. */
      rest: { share: number; years: number } | null;
      /** Zakládá se – průběh, zbývající práce (člověkodny) a stromy na klády; jinak null. */
      founding: NonNullable<VillageFieldPart['founding']> | null;
      /** Škoda zvěře letos (wildlife.md – Co hráč vidí); díl mimo ohrožení null. */
      damage?: FieldDamageView | null;
      /** Ochrana dílu před počasím (disasters.md – Ochrana dílu); ves bez počasí kraje chybí. */
      protection?: PartProtectionView;
      /** Řádky odhadu ztrát letos – počasí, kroupy, povodeň, smršť (disasters.md); žádné chybí. */
      losses?: PartLossRow[];
      /** Očekávaná úroda a jestli práce stačí (fields.md – Co hráč vidí); mimo osev chybí. */
      outlook?: PartOutlookView;
      /** Id všech polí vsi – tlačítko „Označit všechna pole“. */
      fieldIds?: readonly number[];
    }
  | {
      kind: 'cemetery';
      id: number;
      squares: number;
      /** Místa na hroby (cemetery.md – Mohyly podle významu: mohyla zabere 1–4 místa). */
      capacity: number;
      /** Pohřbení (lidé). */
      graves: number;
      usedPlaces: number;
      freePlaces: number;
      /** Odhad, za kolik let se zaplní; bez úmrtí null. Hygienu hráč nevidí (cemetery.md). */
      yearsLeft: number | null;
      /** Vytyčený a ohrazený – nehotový ukáže jen průběh založení. */
      built: boolean;
      /** Stavba – založení, u hotového rozšíření (průběh 0–1); bez stavby null. */
      building: number | null;
      /** Stav plotu 0–1 (abandonment.md). */
      condition: number;
      /** Nikdo ke hřbitovu nechodí – plot chátrá. */
      abandoned: boolean;
      /** Oprava plotu (abandonment.md – Oprava) – průběh 0–1; bez opravy null. */
      repair: number | null;
      /** Zbourat (zaorat) – jen pokřtěný rod (christianity.md). */
      use?: StructureUseView;
    }
  | {
      kind: 'orchard';
      id: number;
      areaM2: number;
      /** Stáří v celých letech od výsadby; nevysazený null. */
      ageYears: number | null;
      /** Úroda nejbližší sklizně (kg jablek). */
      expectedYieldKg: number;
      /** Výsadba (průběh 0–1); vysazený sad null. */
      planting: number | null;
      /** Výsadba čeká na okno (jaro, podzim). */
      plantingWaits: boolean;
      /** Opustit, zbourat, vrátit (demolition.md). */
      use?: StructureUseView;
    }
  | {
      /** Čtverec sadu (klik na sad – orchard.md, Co hráč vidí). Id sadu a čtverec. */
      kind: 'orchard-square';
      id: number;
      cell: TileCell;
      areaM2: number;
      /** Stáří v celých letech od výsadby; dokud se sází, null. */
      ageYears: number | null;
      /** Úroda čtverce nejbližší sklizně (kg jablek). */
      expectedYieldKg: number;
      /** Výsadba (i znovu při obnově) 0–1; vysazený null. */
      planting: number | null;
      plantingWaits: boolean;
      /** V obnově – staré stromy čekají na skácení, nebo se sází znovu (orchard.md – Obnova sadu). */
      renewal: boolean;
      walkM: number;
      /** Opustit, zbourat, vrátit celý sad (demolition.md). */
      use?: StructureUseView;
    }
  | {
      kind: 'sacred-oak';
      id: number;
      /** Kolik dub sám přidává štěstí (stropy vsi platí zvlášť). */
      happiness: number;
      /**
       * Stáří dubu v celých letech (podle velikosti, roste s herním časem; souš – stáří, kdy
       * uschla); neznámé null.
       */
      ageYears: number | null;
      /** Dub stářím uschl – stojí posvátná souš. */
      snag: boolean;
    }
  | {
      kind: 'grove';
      id: number;
      /** Dospělé duby háje (v okruhu 25 m). */
      oaks: number;
      /** Kolik háj sám přidává štěstí. */
      happiness: number;
      /** Stáří nejstaršího dubu háje v celých letech; neznámé null. */
      ageYears: number | null;
    }
  | {
      kind: 'sacred';
      id: number;
      type: SacredBuildingKind;
      /** Kolik stavba přidá štěstí (hotová přidává, rozestavěná až po dostavění). */
      happiness: number;
      /** Stavba (průběh celé stavby i s kácením dubů 0–1); hotová null. */
      building: number | null;
      /** Kolik dubů stavba ještě musí skácet. */
      oaksToFell: number;
      /** Stav hotové stavby 0–1 (abandonment.md); rozestavěná 1. */
      condition: number;
      /** Opuštěná – nikdo k ní nechodí, chátrá. */
      abandoned: boolean;
      /** Oprava (abandonment.md – Oprava) – průběh 0–1; bez opravy null. */
      repair: number | null;
      /** Opustit, zbourat, vrátit (demolition.md – Rozhraní); rozestavěná stavba údaj nemá. */
      use?: StructureUseView;
      /** Průběh bourání 0–1 (staveniště pozpátku); stavba, která se nebourá, údaj nemá. */
      demolition?: number;
    }
  | {
      kind: 'pen';
      id: number;
      /** Druh zvířat ohrady (oxen.md – Ohrady podle druhu). */
      species: PenSpecies;
      /** Čtverce ohrady (nejvýš 4). */
      squares: number;
      /** Místa na noc pro stádo svého druhu, u ohrady volů pro voly i telata. */
      places: number;
      /** Kolik zvířat v ohradě v noci stojí. */
      animals: number;
      /** Místa stáda druhu – všechny ohrady druhu, u domů a potřeba (`VillagePen.herdPlaces`). */
      herdPlaces: HerdPlaces | null;
      /** Rozšíření ve stavbě – průběh 0–1; bez rozšíření null. */
      extension: number | null;
      built: boolean;
      /** Průběh stavby 0–1 (hotová 1). */
      progress: number;
      /** Voli v ohradě – vycvičení i telata ve výcviku. */
      oxen: number;
      /**
       * Voli vsi a kolik jich ves chce, páry s rádlem a vozy (oxen.md – Ohrada volů, Co hráč
       * vidí) – jen u ohrady volů, jinak null.
       */
      oxenVillage: VillageOxen | null;
      /** Krávy v ohradě (v zimě). */
      cows: number;
      /**
       * Stádo druhu ohrady v celé vsi (kusy) a jeho druh (issue #3, Martin 22. 10. 2026: „informace
       * v boxu se musí týkat jen druhu zvířat v dané ohradě“); u ohrady volů null – voli jsou
       * výše. Slepice se nikde neukazují.
       */
      herd: { species: HerdSpecies; count: number } | null;
      /** Nejstarší vycvičený vůl – stáří a kolik let ještě slouží; bez vycvičených volů null. */
      team: { ageYears: number; yearsLeft: number } | null;
      /** Výcvik volů – tele, které se vycvičí nejdřív: průběh 0–1 a zbývající dny; jinak null. */
      training: { progress: number; daysLeft: number } | null;
      /** Zásoba sena vsi (kg). */
      hayKg: number;
      /**
       * Koně vsi po kusech, kolik jich ves chce a obilí (horses.md – Co hráč vidí) – jen u ohrady
       * koní; jinak null.
       */
      horses?: VillageHorses | null;
      /** Stav hotové ohrady 0–1 (abandonment.md). */
      condition: number;
      /** Opuštěná – bez zvířat a nikdo k ní nechodí, chátrá. */
      abandoned: boolean;
      /** Oprava (abandonment.md – Oprava) – průběh 0–1; bez opravy null. */
      repair: number | null;
      /** Opustit, zbourat, vrátit (demolition.md – Rozhraní); rozestavěná ohrada údaj nemá. */
      use?: StructureUseView;
    }
  | {
      kind: 'road';
      id: number;
      /** Úseky cesty hráče (řetěz – roads.md, Cesta pro hráče). */
      segments: number[];
      /** Oba konce cesty – co na nich je a co klik vybere (paths.md – pravidlo 11). */
      ends: VillageRoad['ends'];
      /** Převládající druh cesty (vyšlapaná, vyježděná, upravená, hať) – portrét. */
      roadKind: VillageRoad['roadKind'];
      lengthM: number;
      /** Délka po druzích (m). */
      kinds: VillageRoad['kinds'];
      ageYears: number;
      /** Stojící stromy u cesty. */
      trees: number;
      /** O kolik stromy u cesty zrychlí chůzi i vozy (roads.md); bez stromů 0. */
      treeSpeed: number;
      /** Mokřina na ose (m) a brody – kde se hodí hať a lávka. */
      wetM: number;
      fords: number;
      /** Rozestavěné vylepšení (stupeň, průběh 0–1, stromy ke skácení); jinak null. */
      building: { grade: RoadGrade; progress: number; treesToFell: number } | null;
      /** Vylepšení, která úsek nabízí – cena a proč teď nejde. */
      upgrades: RoadUpgradeOption[];
      /** Rozdělaná úprava nebo vozová cesta, kterou jde zrušit (id stavby); jinak null. */
      cancelId: number | null;
      /** Vozová cesta (roads.md – Vozová cesta) – stav, průběh stavby a proč teď nejde. */
      wagon: VillageRoad['wagon'];
      /** Jabloně podél úseku a „Vysadit jabloně“ (roads.md – Vysazení jabloní). */
      apples: VillageRoad['apples'];
    }
  | ({
      /**
       * Rudiště kováře (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026: „Půjde rudiště také
       * označit?“) nebo hliniště hrnčíře (`clay-site` – Hlína hrnčíře): ložisko, hromada u jámy,
       * zásoba v dílně, cesta z dílny, jámy a kdo tu dnes kope a nosí; `workshopId` = kovárna či
       * dílna hrnčíře (tlačítko ji vybere).
       */
      kind: 'ore-site';
    } & VillageDugSite)
  | ({ kind: 'clay-site' } & VillageDugSite)
  | {
      /**
       * Prvek prémiové krajiny (premium-landscapes.md – Co hráč vidí): ikona typu, co místo dává
       * hned a co později (`premium-view.ts`); `site` – druh prvku pod kurzorem.
       */
      kind: 'premium-site';
      type: PremiumType;
      site: PremiumSiteKind;
    }
  | {
      /**
       * Člověk vsi (villagers.md – Výběr postavy; Martin 20. 10. 2026: „Stačí mi jenom vědět info
       * typu – žena rolníka, jde pro vodu.“): portrét podle pohlaví a věku, role pod portrétem,
       * co právě dělá, věk, dům (tlačítko ho vybere – null, když dům ve scéně není) a u výrostka,
       * který pase, zvíře stáda.
       */
      kind: 'person';
      id: number;
      portrait: PersonPortraitIcon;
      role: string;
      /** Jméno muže rodu (lord.md – Kde se jméno ukazuje); ostatní lidé null. */
      name?: string | null;
      activity: string;
      age: number;
      home: number | null;
      /** Ikona domu (`public/icons/build/` – typ obydlí nebo dílna). */
      homeIcon: string | null;
      herd: HerdSpecies | null;
      /** Smí ho hráč povýšit do šlechtického stavu (vassalage.md – Povýšení vesničana). */
      ennobleable?: boolean;
      /** Pokřtěný (christianity.md – Víra vesničanů) – malý kříž v panelu; pohan nic. */
      christian?: boolean;
      /** Vojvoda se smí nechat pokřtít (christianity.md – Křest rodu) – tlačítko „Nechat se pokřtít“. */
      baptizable?: boolean;
      /** Mistr stavební huti – ikona oboru v panelu (stone-masonry.md); jinak chybí. */
      mason?: MasonCraft | null;
      /** Okruh huti mistra – do popisku ikony oboru. */
      lodgeCircle?: MasonryCircle | null;
      /** Kněz kostela (churches.md). */
      priest?: boolean;
      /** Huť a mistři u vojvody (stone-masonry.md – Stavební huť); jen u vojvody. */
      lodge?: LodgeView | null;
      /** Dovednosti, když se člověk cvičil (lord.md – Dovednosti); jinak null. */
      arms?: ArmsView | null;
      /** Má koně (jezdec – horses.md). */
      horse?: boolean;
      /**
       * Kůň, na kterém jezdec jezdí (horses.md – Co hráč vidí): věk, výcvik 0–1 a dostává-li obilí;
       * bez koně null.
       */
      mount?: SelectionPersonMount | null;
      /** Výprava člověka pro tlačítka Osedlat, Sesednout a Domů; bez plného stavu vsi chybí. */
      expedition?: ExpeditionPersonState | null;
      /**
       * Oráč a honák u spřežení, vozka u vozu (villagers.md – Výběr postavy): tlačítko vybere
       * spřežení či vůz; ostatní null.
       */
      draft?: { kind: 'plough-team'; team: number } | { kind: 'cart'; id: number } | null;
    }
  | {
      /**
       * Spřežení volů s rádlem na poli (oxen.md – Výběr spřežení; Martin 20. 10. 2026: „nešlo mi
       * kliknout na volské spřežení ani na člověka, co jej vedl“): co dělá, díl, který orá
       * (tlačítko ho vybere – null, když díl ve scéně není), voli, ohrada, ze které jsou (tlačítko),
       * a oráč a honák (tlačítka je vyberou; nikdo – null).
       */
      kind: 'plough-team';
      team: number;
      activity: string;
      part: { fieldId: number; cell: TileCell } | null;
      oxen: number;
      pen: number | null;
      ploughman: CrewMember | null;
      leader: CrewMember | null;
    }
  | {
      /**
       * Vůz vsi (wagons.md – Výběr vozu): druh, co dělá (stojí u ohrady, jede pro náklad, veze
       * ho…), co právě veze (`cargo` – jen naložený), stav, kolik volů ho táhne, ohrada (tlačítko)
       * a vozka (tlačítko ho vybere; nikdo – null).
       */
      kind: 'cart';
      id: number;
      cartKind: CartKind;
      activity: string;
      cargo: CartGoal | null;
      /** Nosnost vozu (kg) a kolik nákladu veze právě teď; neznámé množství – null. */
      capacityKg: number;
      loadKg: number | null;
      condition: number;
      oxen: number;
      pen: number | null;
      drover: CrewMember | null;
    }
  | ({
      /**
       * Milíř nebo milířiště uhlíře (crafts.md – Milíř u skácených buků; Martin 20. 10. 2026:
       * „Vyčleň milíř jako samostatnou stavbu.“): fáze a průběh, uhlí v milíři, cesta ze zemnice
       * uhlíře a z kovárny a kdo sem dnes chodí pro uhlí; `burnerId` = dílna uhlíře (tlačítko ji
       * vybere).
       */
      kind: 'kiln';
    } & VillageKiln)
  | ({
      /**
       * Otevřená obilná jáma (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „Označit
       * půjde jen otevřená jáma - zavřená nebude vidět - a v označení se ukáže kolik v ní je
       * zrní.“): zrno v jámě a kolik se do ní vejde, stáří jámy.
       */
      kind: 'grain-pit';
    } & VillageGrainPit)
  | ({
      /**
       * Křižovatka cest (paths.md – Křižovatky; Martin, #6): kříž nebo Y, kolik cest do ní vede,
       * znamení a stáří.
       */
      kind: 'junction';
    } & VillageJunction)
  | ({
      /**
       * Humno (production-chains.md – Humno): hotové nebo staveniště, nevymlácené snopy vsi
       * a jestli se dnes mlátí.
       */
      kind: 'threshing-floor';
    } & VillageThreshingFloor)
  | {
      /**
       * Hromada klád u cesty (forest.md – Mýcení a hromada klád): kolik klád na ní leží.
       */
      kind: 'log-pile';
      id: number;
      logs: number;
    }
  | {
      /**
       * Lom na skalním výchozu (fortifications.md – Kámen): rozestavěný (`constructionId`),
       * nebo hotový – kámen na hromadách vsi (m³) a lámání do zásoby.
       */
      kind: 'quarry';
      outcropId: number;
      constructionId?: number;
      stoneM3: number;
    }
  | ({
      /**
       * Kostel nebo staveniště kostela (churches.md): postup po druzích práce, chybějící mistr,
       * kapacita, hroby a kněz.
       */
      kind: 'church';
    } & VillageChurch)
  | ({
      /**
       * Celé opevnění včetně bran (dvojklik – fortifications.md, Rozhraní): druh, délka obvodu,
       * stav, brány, útočiště, průběh stavby a vylepšení celého opevnění.
       */
      kind: 'fortification';
    } & VillageFortification)
  | ({
      /**
       * Úsek opevnění mezi branami (klik – fortifications.md, Rozhraní – Úseky): délka hradby
       * úseku, stav a stáří jeho dílů, druh, průběh stavby a zboření úseku.
       */
      kind: 'fortification-section';
      section: VillageFortSection;
    } & FortPanelBase &
      Pick<VillageFortification, 'progress' | 'work' | 'constructionId' | 'occupancy'>)
  | ({
      /**
       * Brána opevnění (klik jako na křižovatku – fortifications.md, Brány): druh brány podle
       * opevnění, stav dílu brány a cesta, která branou vede.
       */
      kind: 'fortification-gate';
      gate: VillageFortGate;
      /** Cesta hráče, která branou vede (klik ji vybere); bez cesty null. */
      road: { id: number; segment: number; roadKind: RoadKind } | null;
    } & FortPanelBase)
  | ({
      /**
       * Divoké zvíře (wildlife.md – Co hráč vidí; Martin 24. 10. 2026 nechal na Claudovi): druh
       * s hrubým stavem (tři stupně plnosti, plno), co kraj uživí, loňská škoda a strhnutý dobytek –
       * bez přesných kusů.
       */
      kind: 'wildlife';
    } & WildlifeSpeciesView)
  | {
      /**
       * Cizí výjezd vojvody na mapě vsi (lord-control.md – Soused; návrh Clauda – jako cizí jednotka
       * v 0 A.D.): jméno vojvody a rod, které jsou o rodech veřejné, a kolik mužů a jezdců jede.
       */
      kind: 'visitor';
      leader: string;
      house: string;
      men: number;
      riders: number;
    };

export type { PersonPortraitIcon };

/** Člověk u spřežení či vozu v panelu – id (tlačítko ho vybere) a portrét. */
export interface CrewMember {
  id: number;
  portrait: PersonPortraitIcon;
}

/** Ikony a názvy stád (`/icons/resources/<ikona>.png`). */
export const HERD_LABELS: Record<HerdSpecies, { name: string; icon: string }> = {
  sheep: { name: 'Ovce', icon: 'sheep' },
  goat: { name: 'Kozy', icon: 'goat' },
  pig: { name: 'Prasata', icon: 'pig' },
  cow: { name: 'Krávy', icon: 'cow' },
};

/** Pořadí stadií dílů v panelu pole – od zakládání po příloh (pastvinu). */
export const PART_STAGE_ORDER: readonly PartStage[] = [
  'founding',
  'ready',
  'sown',
  'young-fallow',
  'meadow',
  'shrubs',
  'young-forest',
];

/** Pořadí plodin v panelu pole – ozim (sklízí se dřív), jař, luštěniny, len. */
export const CROP_ORDER: readonly Crop[] = ['winter', 'spring', 'legume', 'flax'];

/** Popisky plodin a ikony (`/icons/resources/<ikona>.png`). */
export const CROP_LABELS: Record<Crop, { name: string; icon: string }> = {
  winter: { name: 'Ozim – žito a pšenice, zasetá na podzim, sklizeň v červenci', icon: 'ozim' },
  spring: { name: 'Jař – ječmen, zasetý na jaře, sklizeň v srpnu', icon: 'jar' },
  legume: {
    name: 'Luštěniny – hrách a čočka, zaseté na jaře, sklizeň v červenci',
    icon: 'legumes',
  },
  flax: { name: 'Len – na plátno, zasetý na jaře, trhá se v červenci', icon: 'flax' },
};

/** Pořadí povrchů v panelu pole – od louky po les. */
export const FIELD_SURFACE_ORDER: readonly FieldSurface[] = ['meadow', 'shrub', 'forest'];

export const FIELD_SURFACE_NAMES: Record<FieldSurface, string> = {
  meadow: 'Založeno na louce',
  shrub: 'Založeno v křovinách',
  forest: 'Založeno v lese',
};

export const PART_STAGE_NAMES: Record<PartStage, string> = {
  founding: 'Zakládá se',
  ready: 'Připraveno k osevu',
  sown: 'Oseto',
  'young-fallow': 'Mladý příloh',
  meadow: 'Příloh – pastvina',
  shrubs: 'Příloh zarostlý křovinami',
  'young-forest': 'Příloh zarostlý mladým lesem',
};

/**
 * Co je na dílu pole vidět – název pod portrétem panelu dílu (fields.md – Co hráč vidí; podle
 * `FieldLook`, luštěniny a orba rádlem zvlášť).
 */
const FIELD_LOOK_NAMES: Record<FieldLook, string> = {
  bare: 'Rozrytý drn',
  plowed: 'Zkopáno',
  sown: 'Zaseto',
  sprouted: 'Vzešlé osení',
  green: 'Zelené obilí',
  ripe: 'Zralé obilí',
  harvesting: 'Žeň',
  stubble: 'Strniště',
  'young-fallow': 'Mladý příloh',
  pasture: 'Pastvina',
  meadow: 'Louka na seno',
  mown: 'Posečená louka',
  haystacks: 'Stohy sena',
  shrubs: 'Křoviny',
  'young-forest': 'Mladý les',
  slash: 'Paseka',
  burnt: 'Spálenina',
};

/** Název dílu pole pod portrétem – co na něm je (zakládaný a připravený díl podle stadia). */
export function fieldPartName(
  details: Pick<
    Extract<SelectionDetails, { kind: 'field-part' }>,
    'look' | 'stage' | 'legume' | 'flax' | 'ploughed'
  > &
    Partial<Pick<Extract<SelectionDetails, { kind: 'field-part' }>, 'bloom'>>,
): string {
  const { look, stage } = details;
  if (stage === 'founding' || stage === 'ready' || look === null) return PART_STAGE_NAMES[stage];
  if (look === 'plowed' && details.ploughed) return 'Zoráno';
  if (details.flax) {
    if (look === 'green') return details.bloom ? 'Kvetoucí len' : 'Zelený len';
    if (look === 'ripe') return 'Zralý len';
    if (look === 'harvesting') return 'Trhání lnu';
  }
  if (details.legume) {
    if (look === 'green') return 'Zelené luštěniny';
    if (look === 'ripe') return 'Zralé luštěniny';
    if (look === 'harvesting') return 'Sklizeň luštěnin';
  }
  return FIELD_LOOK_NAMES[look];
}

/**
 * Název čtverce sadu pod portrétem: výsadba, mladé jabloně (rostou TREE_GROWTH_YEARS let), staré
 * jabloně (od roku obnovy – orchard.md, Obnova sadu, i čekající na obnovu), jinak jabloně.
 */
export function orchardSquareName(
  details: Pick<
    Extract<SelectionDetails, { kind: 'orchard-square' }>,
    'planting' | 'renewal' | 'ageYears'
  >,
): string {
  if (details.planting !== null) return details.renewal ? 'Obnova jabloní' : 'Výsadba jabloní';
  const age = details.ageYears ?? 0;
  if (details.renewal || age >= ORCHARD.declineAfterYear) return 'Staré jabloně';
  return age < TREE_GROWTH_YEARS ? 'Mladé jabloně' : 'Jabloně';
}

/**
 * Údaje o vybraném cíli plus rozestavěná stavba, kterou jde zrušit (`cancelConstructionId`,
 * cancel-construction.ts) – tlačítko Zrušit stavbu v panelu.
 */
/** Kůň pod jezdcem v panelu člověka. */
export interface SelectionPersonMount {
  ageYears: number;
  training: number;
  fed: boolean;
  /** Obilí koně za den (kg). */
  grainKgPerDay: number;
}

export type SelectionDetails = SelectionKinds & {
  cancelConstructionId?: number;
  /** Stavbu postavil správce (steward.md – Co hráč vidí) – panel ukáže jeho ikonu. */
  stewardBuilt?: true;
  /** Přepínač správce v panelu dvorce vojvody; jiné cíle bez údaje. */
  steward?: { on: boolean };
};

/** Cíle, jejichž id může nést značku „postavil správce“ (stavby, jejich celky a díly polí). */
const STEWARD_MARKED_KINDS: ReadonlySet<string> = new Set([
  'dwelling',
  'site',
  'field',
  'field-part',
  'cemetery',
  'orchard',
  'pen',
  'road',
  'sacred',
  'threshing-floor',
]);

/** Doplní k údajům značku správce a jeho přepínač (jen dvorec). */
function withSteward(view: VillageView | null, details: SelectionDetails): SelectionDetails {
  if (!view) return details;
  const marked =
    STEWARD_MARKED_KINDS.has(details.kind) &&
    'id' in details &&
    view.steward.built.includes(details.id);
  const toggle = details.kind === 'dwelling' && details.manor !== null;
  if (!marked && !toggle) return details;
  return {
    ...details,
    ...(marked ? { stewardBuilt: true as const } : {}),
    ...(toggle ? { steward: { on: view.steward.on } } : {}),
  };
}

/** Rozestavěná stavba vybraného cíle, kterou jde zrušit; jinak undefined. */
function cancellableConstruction(
  view: VillageView | null,
  details: SelectionKinds,
): number | undefined {
  if (!view) return undefined;
  // zkrácené pohledy v testech stavby nemají
  const cancellable =
    (view.constructions as VillageView['constructions'] | undefined)?.filter(
      (c) => c.cancellable,
    ) ?? [];
  const newest = (ids: number[]): number | undefined => (ids.length ? Math.max(...ids) : undefined);
  const among = (match: (c: (typeof cancellable)[number]) => boolean): number | undefined =>
    newest(cancellable.filter(match).map((c) => c.id));
  switch (details.kind) {
    case 'site':
      return among((c) => c.id === details.id);
    case 'sacred':
      return details.building !== null ? among((c) => c.id === details.id) : undefined;
    case 'threshing-floor':
      return details.built ? undefined : among((c) => c.id === details.id);
    case 'quarry':
      return details.constructionId === undefined
        ? undefined
        : among((c) => c.id === details.constructionId);
    case 'fortification':
    case 'fortification-section':
      return details.constructionId === undefined
        ? undefined
        : among((c) => c.id === details.constructionId);
    case 'field':
      return among((c) => c.kind === 'field' && c.fieldId === details.id);
    case 'cemetery':
      return among((c) => c.kind === 'cemetery' && c.cemeteryId === details.id);
    case 'orchard':
      return among((c) => c.kind === 'orchard' && c.orchardId === details.id);
    case 'pen':
      return among((c) => c.kind === 'pen' && c.penId === details.id);
    case 'road':
      return details.cancelId ?? undefined;
    case 'church':
      // zrušit jde jen stavbu před střechou (výzdoba dostavěného kostela doběhne)
      return details.built ? undefined : among((c) => c.id === details.id);
    default:
      return undefined;
  }
}

/** Údaje o vybraném cíli, nebo null (nic nevybráno, cíl zanikl, ves ještě není). */
export function selectionDetails(
  view: VillageView | null,
  scene: SceneVillage,
  target: VillageTarget | null,
  person: PersonFigureState | null = null,
  draft: DraftFigureState | null = null,
  parties: readonly PartyView[] = [],
  visitors: readonly SceneJourney[] = [],
  /** Mapa vsi na scéně – člen skupiny na ní je „doma“ (tlačítko Osedlat). */
  homeCell: GridCell | null = null,
): SelectionDetails | null {
  const details = selectionKinds(view, scene, target, person, draft, parties, visitors, homeCell);
  if (!details) return null;
  const cancelConstructionId = cancellableConstruction(view, details);
  const withCancel =
    cancelConstructionId === undefined ? details : { ...details, cancelConstructionId };
  return withSteward(view, withCancel);
}

function selectionKinds(
  view: VillageView | null,
  scene: SceneVillage,
  target: VillageTarget | null,
  person: PersonFigureState | null = null,
  draft: DraftFigureState | null = null,
  parties: readonly PartyView[] = [],
  visitors: readonly SceneJourney[] = [],
  homeCell: GridCell | null = null,
): SelectionKinds | null {
  if (!target) return null;
  if (target.kind === 'visitor') {
    const v = visitors.find((j) => j.journeyId === target.journeyId);
    return v
      ? {
          kind: 'visitor',
          leader: v.leader,
          house: v.house,
          men: v.men.length,
          riders: v.men.filter((m) => m.mounted).length,
        }
      : null;
  }
  if (target.kind === 'wildlife') {
    const species = view?.wildlife?.species.find((s) => s.species === target.species);
    return species ? { kind: 'wildlife', ...species } : null;
  }
  if (target.kind === 'premium-site') {
    return { kind: 'premium-site', type: target.type, site: target.site };
  }
  // lidé jiné vsi hráče (`villageId` – člen její výpravy): pohled vsi scény o nich nic neví
  if ((target.kind === 'person' || target.kind === 'people') && target.villageId) return null;
  if (target.kind === 'person')
    return personDetails(view, scene, target.id, person, draft, parties, homeCell);
  if (target.kind === 'plough-team') return teamDetails(scene, target.team, draft);
  if (target.kind === 'cart') return cartDetails(scene, target.id, draft);
  if (target.kind === 'dwellings') return dwellingsDetails(view, scene, target.ids);
  if (target.kind === 'people') return peopleDetails(scene, target.ids, parties, homeCell);
  if (target.kind === 'fields') {
    const fields = (view?.fields ?? []).filter((f) => target.ids.includes(f.id));
    if (fields.length === 0) return null;
    return {
      kind: 'fields',
      ids: fields.map((f) => f.id),
      areaM2: fields.reduce((sum, f) => sum + f.areaM2, 0),
    };
  }
  if (target.kind === 'dwelling') {
    const dwelling = scene.dwellings.find((d) => d.id === target.id);
    if (!dwelling) return null;
    if (!dwelling.built) {
      // staveniště ve scéně ukazuje jen stavbu – panel celý průběh i s kácením dřeva
      const construction = view?.constructions.find((c) => c.id === dwelling.id);
      return {
        kind: 'site',
        id: dwelling.id,
        type: dwelling.type,
        craft: dwelling.craft ?? null,
        progress: construction?.progress ?? dwelling.progress,
        treesToFell: construction?.treesToFell ?? 0,
        relocates: construction?.relocates ?? null,
        ...(dwelling.demolition === undefined ? {} : { demolition: dwelling.demolition }),
      };
    }
    const household = view?.households.find((h) => h.dwellingId === target.id);
    if (!household) return null;
    const rebuild = view?.constructions.find(
      (c) => c.kind === 'rebuild' && c.dwellingId === target.id,
    );
    return {
      kind: 'dwelling',
      id: household.dwellingId,
      type: household.type,
      occupants: household.occupants,
      family: household.family,
      capacity: household.capacity,
      ages: household.ages,
      residents: household.residents,
      condition: household.condition,
      ageYears: household.ageYears,
      full: household.full,
      overcrowded: household.overcrowded,
      ...(household.garden ? { garden: household.garden } : {}),
      rebuild: rebuild
        ? {
            progress: rebuild.progress,
            type: rebuild.dwellingType ?? household.type,
            treesToFell: rebuild.treesToFell,
          }
        : null,
      workshop: view ? workshopDetails(view, household.dwellingId) : null,
      manor: view?.manor?.dwellingId === household.dwellingId ? view.manor : null,
      ...(view?.manor?.dwellingId === household.dwellingId ? { wares: view.wares } : {}),
      lordWifeHome: lordWifeHome(view, scene, household.dwellingId),
      ...(view?.manor?.dwellingId === household.dwellingId && view.crafts.sources
        ? { buying: buyingDetails(view, view.crafts.sources) }
        : {}),
      leave: view ? leaveDetails(view, [household.dwellingId]) : null,
      ...(view?.manor?.dwellingId === household.dwellingId && view.dynasty
        ? { sons: sonDetails(view) }
        : {}),
      ...(household.use ? { use: household.use } : {}),
    };
  }
  if (target.kind === 'cemetery') {
    const cemetery = view?.cemeteries.find((c) => c.id === target.id);
    if (!cemetery) return null;
    return {
      kind: 'cemetery',
      id: cemetery.id,
      squares: cemetery.squares,
      capacity: cemetery.capacity,
      graves: cemetery.graves,
      usedPlaces: cemetery.usedPlaces,
      freePlaces: cemetery.freePlaces,
      yearsLeft: cemetery.yearsLeft,
      built: cemetery.built,
      building: cemetery.built && cemetery.progress >= 1 ? null : cemetery.progress,
      condition: cemetery.fenceCondition,
      abandoned: cemetery.abandoned,
      repair: cemetery.repair,
      ...(cemetery.use ? { use: cemetery.use } : {}),
    };
  }
  if (target.kind === 'sacred-oak') {
    const oak = view?.sacred.oaks.find((o) => o.id === target.id);
    return oak
      ? {
          kind: 'sacred-oak',
          id: oak.id,
          happiness: oak.happiness,
          ageYears: oak.ageYears,
          snag: oak.snag,
        }
      : null;
  }
  if (target.kind === 'grove') {
    const grove = view?.sacred.groves.find((g) => g.id === target.id);
    return grove
      ? {
          kind: 'grove',
          id: grove.id,
          oaks: grove.oaks,
          happiness: grove.happiness,
          ageYears: grove.ageYears,
        }
      : null;
  }
  if (target.kind === 'sacred') return sacredDetails(view, scene, target.id);
  if (target.kind === 'field-part') return fieldPartDetails(view, scene, target);
  if (target.kind === 'orchard-square') {
    if (!selectedOrchardSquare(scene, target)) return null;
    const orchard = view?.orchards.find((o) => o.id === target.id);
    const square = orchard?.cells.find(
      (c) => c.cell.x === target.cell.x && c.cell.y === target.cell.y,
    );
    return square
      ? {
          kind: 'orchard-square',
          id: target.id,
          ...square,
          ...(orchard?.use ? { use: orchard.use } : {}),
        }
      : null;
  }
  if (target.kind === 'pen') return penDetails(view, target.id);
  if (target.kind === 'kiln') {
    const inScene =
      scene.kilns?.some((k) => k.id === target.id) ||
      scene.kilnRemnants?.some((r) => r.id === target.id);
    if (!inScene) return null;
    const kiln = view?.kilns?.find((k) => k.id === target.id);
    return kiln ? { kind: 'kiln', ...kiln } : null;
  }
  if (target.kind === 'church') {
    if (!scene.churches?.some((c) => c.id === target.id)) return null;
    const church = view?.churches?.find((c) => c.id === target.id);
    return church ? { kind: 'church', ...church } : null;
  }
  if (target.kind === 'log-pile') {
    // jen hromada, která ve scéně leží (prázdná zmizí)
    const pile = scene.logStacks?.find((l) => l.id === target.id);
    return pile ? { kind: 'log-pile', id: pile.id, logs: pile.logs } : null;
  }
  if (target.kind === 'quarry') {
    const quarry = scene.quarries?.find((q) => q.outcropId === target.id);
    if (!quarry) return null;
    return {
      kind: 'quarry',
      outcropId: quarry.outcropId,
      ...(quarry.constructionId !== undefined ? { constructionId: quarry.constructionId } : {}),
      stoneM3: view?.stoneSupply?.m3 ?? 0,
    };
  }
  if (target.kind === 'threshing-floor') {
    if (!scene.threshingFloors?.some((f) => f.id === target.id)) return null;
    const floor = view?.threshingFloors?.find((f) => f.id === target.id);
    return floor ? { kind: 'threshing-floor', ...floor } : null;
  }
  if (
    target.kind === 'fortification' ||
    target.kind === 'fortification-section' ||
    target.kind === 'fortification-gate'
  ) {
    return fortificationDetails(view, scene, target);
  }
  if (target.kind === 'grain-pit') {
    // jen otevřená jáma, která ve scéně je (zapečetěné nejsou vidět)
    if (!scene.grainPits?.some((p) => p.id === target.id)) return null;
    const pit = view?.grainPits?.find((p) => p.id === target.id);
    return pit ? { kind: 'grain-pit', ...pit } : null;
  }
  if (target.kind === 'junction') {
    if (!scene.junctions?.some((j) => j.id === target.id)) return null;
    const junction = view?.junctions?.find((j) => j.id === target.id);
    return junction ? { kind: 'junction', ...junction } : null;
  }
  if (target.kind === 'ore-site' || target.kind === 'clay-site') {
    if (!dugSiteOf(scene, target)) return null;
    const sites = target.kind === 'clay-site' ? view?.claySites : view?.oreSites;
    const site = sites?.find((s) => s.workshopId === target.id);
    if (!site) return null;
    return target.kind === 'clay-site'
      ? { kind: 'clay-site', ...site }
      : { kind: 'ore-site', ...site };
  }
  if (target.kind === 'road') {
    // cesta hráče – vybraný kterýkoli úsek řetězu (roads.md – Cesta pro hráče)
    const road = view?.roads.find((r) => r.id === target.id || r.segments.includes(target.id));
    return road ? { kind: 'road', ...road } : null;
  }
  if (target.kind === 'orchard') {
    const orchard = view?.orchards.find((o) => o.id === target.id);
    if (!orchard) return null;
    return {
      kind: 'orchard',
      id: orchard.id,
      areaM2: orchard.areaM2,
      ageYears: orchard.ageYears,
      expectedYieldKg: orchard.expectedYieldKg,
      planting: orchard.planting,
      plantingWaits: orchard.plantingWaits,
      ...(orchard.use ? { use: orchard.use } : {}),
    };
  }
  const field = view?.fields.find((f) => f.id === target.id);
  if (!field) return null;
  const founding = view?.constructions.find((c) => c.kind === 'field' && c.fieldId === target.id);
  return {
    kind: 'field',
    id: field.id,
    areaM2: field.areaM2,
    fertility: field.fertility,
    stages: PART_STAGE_ORDER.flatMap((stage) => {
      const count = field.stages[stage] ?? 0;
      return count > 0 ? [{ stage, count }] : [];
    }),
    surfaces: Object.keys(field.surfaces).some((s) => s !== 'meadow')
      ? FIELD_SURFACE_ORDER.flatMap((surface) => {
          const count = field.surfaces[surface] ?? 0;
          return count > 0 ? [{ surface, count }] : [];
        })
      : [],
    crops: CROP_ORDER.flatMap((crop) => {
      const count = field.crops[crop] ?? 0;
      return count > 0 ? [{ crop, count }] : [];
    }),
    turn: (['winter', 'spring'] as const).flatMap((crop) => {
      const count = field.turn[crop];
      return count > 0 ? [{ crop, count }] : [];
    }),
    seed: view?.sowingSeed ?? null,
    resting: field.turn.resting,
    ashParts: field.ashParts,
    ...(field.clearing ? { clearing: field.clearing } : {}),
    ashBonus: field.ashBonus,
    overgrowingM2: field.overgrowingM2,
    ...(field.outlook ? { outlook: field.outlook } : {}),
    founding: founding ? founding.progress : null,
    fieldIds: view?.fields.map((f) => f.id) ?? [],
  };
}

/** Kůň jezdce `riderId` z pohledu na ves (jede-li na koni); jinak null. */

/**
 * Opevnění ve výběru (fortifications.md – Rozhraní): celé (dvojklik), úsek mezi branami s dílem
 * `segment` (klik), nebo brána v dílu `segment` (klik do dosahu brány).
 */
function fortificationDetails(
  view: VillageView | null,
  scene: SceneVillage,
  target: Extract<
    VillageTarget,
    { kind: 'fortification' | 'fortification-section' | 'fortification-gate' }
  >,
): SelectionKinds | null {
  const inScene = scene.forts?.find((f) => f.id === target.id);
  const fort = view?.fortifications?.find((f) => f.id === target.id);
  if (!inScene || !fort) return null;
  if (target.kind === 'fortification') return { kind: 'fortification', ...fort };
  const base: FortPanelBase = {
    id: fort.id,
    fortKind: fort.fortKind,
    ...(fort.top ? { top: fort.top } : {}),
  };
  if (target.kind === 'fortification-section') {
    const section = fort.sections.find((x) => x.segments.includes(target.segment));
    if (!section) return null;
    return {
      kind: 'fortification-section',
      ...base,
      section,
      occupancy: fort.occupancy,
      // stavba na dílech úseku (na opevnění smí běžet víc staveb); starší pohled – stavba opevnění
      ...((section.progress ?? fort.progress) !== undefined
        ? { progress: section.progress ?? fort.progress }
        : {}),
      ...((section.work ?? fort.work) ? { work: section.work ?? fort.work } : {}),
      ...((section.constructionId ?? fort.constructionId) !== undefined
        ? { constructionId: section.constructionId ?? fort.constructionId }
        : {}),
    };
  }
  const gate = fort.gateViews.find((g) => g.segment === target.segment);
  const at = inScene.gates.find((g) => g.segment === target.segment);
  if (!gate || !at) return null;
  // cesta, která branou vede – osa cesty prochází bránou (fortifications.md – Brány)
  const segment = nearestRoad(scene, at, FORT_GATE_HALF_M);
  const road =
    segment === null
      ? undefined
      : view?.roads.find((r) => r.id === segment || r.segments.includes(segment));
  return {
    kind: 'fortification-gate',
    ...base,
    gate,
    road: road && segment !== null ? { id: road.id, segment, roadKind: road.roadKind } : null,
  };
}

function mountOf(view: VillageView | null, riderId: number): SelectionPersonMount | null {
  const horse = view?.horses?.horses.find((h) => h.riderId === riderId);
  if (!view?.horses || !horse) return null;
  return {
    ageYears: horse.ageYears,
    training: horse.training,
    fed: view.horses.fed,
    grainKgPerDay: HORSES.grainKgPerDay,
  };
}

/**
 * Člověk vsi (villagers.md – Výběr postavy): kdo to je z lidí ve scéně (`labor.persons`), co dělá
 * ze stavu jeho postavy (`person` – hlásí scéna; jiný člověk nebo nic – „doma“). Výrostek, který
 * dnes pase, je pasáček / pasačka.
 */
function personDetails(
  view: VillageView | null,
  scene: SceneVillage,
  id: number,
  state: PersonFigureState | null,
  draft: DraftFigureState | null,
  parties: readonly PartyView[],
  homeCell: GridCell | null,
): SelectionDetails | null {
  const person = scene.labor?.persons?.find((p) => p.id === id);
  if (!person) return null;
  // člověk ve skupině výpravy (lord-control.md – Co hráč vidí): „je na cestě“ / „čeká (2 dny)“ / „vrací se domů“
  const party = parties.find((p) => p.people.some((m) => m.personId === id)) ?? null;
  const figure = state?.id === id ? state : null;
  const herding = figure?.job?.kind === 'herd';
  const home = scene.dwellings.find((d) => d.id === person.home) ?? null;
  const job = figure?.job ?? null;
  return {
    kind: 'person',
    id,
    portrait: personPortrait(person),
    role: ROLE_NAMES[herding && person.age < AGE.adult ? herdRole(person.sex) : person.role],
    name: person.name ?? null,
    activity: party
      ? journeyActivity(party)
      : person.injured
        ? INJURED_ACTIVITY
        : personActivity(figure, scene, draft),
    age: person.age,
    home: home ? home.id : null,
    homeIcon: home ? (home.craft ? CRAFT_LOOKS[home.craft].icon : home.type) : null,
    herd: herding ? (figure?.herd ?? null) : null,
    arms: person.arms ?? null,
    ennobleable: person.ennobleable === true,
    christian: person.christian === true,
    baptizable: person.baptizable === true,
    mason: person.mason ?? null,
    lodgeCircle: person.lodgeCircle ?? null,
    priest: person.priest === true,
    lodge: person.lodge ?? null,
    horse: person.horse === true,
    mount: mountOf(view, id),
    expedition: expeditionPersonState(person, id, parties, homeCell),
    draft:
      job?.kind === 'plough'
        ? { kind: 'plough-team', team: job.team }
        : job?.kind === 'cart'
          ? { kind: 'cart', id: job.cart }
          : null,
  };
}

/**
 * Dům vedlejší manželky vojvody mimo dvorec (lord.md – Manželky): popisek se jménem vojvody v 1. pádu
 * (jméno se neskloňuje); jiný dům null.
 */
function lordWifeHome(
  view: VillageView | null,
  scene: SceneVillage,
  dwellingId: number,
): string | null {
  if (view?.manor?.dwellingId === dwellingId) return null;
  const wife = scene.labor?.persons?.some(
    (p) => p.home === dwellingId && p.role === 'voivode-secondary-wife',
  );
  if (!wife) return null;
  const lord = view?.dynasty?.lordName;
  return lord === undefined ? 'Dům vedlejší ženy vojvody' : `Dům vedlejší ženy vojvody – ${lord}`;
}

/** Člověk u spřežení či vozu (id ze scény) – jen když ho ves ve scéně má. */
function crewMember(scene: SceneVillage, id: number | null): CrewMember | null {
  const person = id === null ? undefined : scene.labor?.persons?.find((p) => p.id === id);
  return person ? { id: person.id, portrait: personPortrait(person) } : null;
}

/**
 * Spřežení s rádlem (oxen.md – Výběr spřežení): co dělá ze stavu, který hlásí scéna (`draft` –
 * jen toto spřežení; bez něj spřežení ve scéně není – null), díl, který orá, ohrada a lidé u něj.
 */
function teamDetails(
  scene: SceneVillage,
  team: number,
  draft: DraftFigureState | null,
): SelectionDetails | null {
  if (draft?.kind !== 'team' || draft.team !== team) return null;
  const ploughed = draft.activity.kind === 'plough' ? draft.activity.part : null;
  const cell =
    ploughed && ploughed.partId !== null
      ? scene.fields
          .find((f) => f.id === ploughed.fieldId)
          ?.parts.find((p) => p.id === ploughed.partId)?.cell
      : undefined;
  return {
    kind: 'plough-team',
    team,
    activity: teamActivityText(draft.activity),
    part: ploughed && cell ? { fieldId: ploughed.fieldId, cell } : null,
    oxen: DRAFT_OXEN.ard,
    pen: teamPen(scene, team),
    ploughman: crewMember(scene, draft.ploughman),
    leader: crewMember(scene, draft.leader),
  };
}

/**
 * Vůz (wagons.md – Výběr vozu): druh a stav ze scény vsi, co dělá a co veze ze stavu, který hlásí
 * scéna (`draft` – jen tento vůz; bez něj podle úlohy dne), ohrada a vozka.
 */
function cartDetails(
  scene: SceneVillage,
  id: number,
  draft: DraftFigureState | null,
): SelectionDetails | null {
  const cart = scene.carts?.find((c) => c.id === id);
  if (!cart) return null;
  const own = draft?.kind === 'cart' && draft.cart === id ? draft : null;
  const leg = own?.leg ?? (cart.job ? null : 'parked');
  const hitched = cart.job !== null && leg !== 'parked';
  return {
    kind: 'cart',
    id,
    cartKind: cart.kind,
    activity: cartActivityText(scene, id, leg),
    cargo: cart.job && own?.loaded && !own.hidden ? cartGoal(cart.job) : null,
    capacityKg: CARTS.loadKg[cart.kind],
    loadKg:
      cart.job?.loadKg === undefined ? null : own?.loaded && !own.hidden ? cart.job.loadKg : 0,
    condition: cart.condition,
    oxen: hitched ? DRAFT_OXEN[cart.kind] : 0,
    pen: cartPen(scene, id),
    drover: hitched ? crewMember(scene, own?.drover ?? null) : null,
  };
}

/**
 * Díl pole: co je vidět (stadium, vzhled, zarůstání, pastva) ze scény, čísla dílu z pohledu na ves
 * (díl podle id ze scény).
 */
function fieldPartDetails(
  view: VillageView | null,
  scene: SceneVillage,
  target: Extract<VillageTarget, { kind: 'field-part' }>,
): SelectionDetails | null {
  const shown = selectedFieldPart(scene, target);
  if (!shown || shown.id === undefined) return null;
  const part = view?.fields.find((f) => f.id === target.id)?.parts.find((p) => p.id === shown.id);
  if (!part) return null;
  const house =
    part.holding === undefined ? undefined : scene.dwellings.find((d) => d.id === part.holding);
  return {
    kind: 'field-part',
    id: target.id,
    cell: { x: target.cell.x, y: target.cell.y },
    partId: part.id,
    abandoned: part.abandoned === true,
    abandonBlock: part.founding ? ABANDON_FOUNDING : null,
    look: shown.look ?? null,
    stage: shown.stage,
    legume: shown.crop === 'legume',
    flax: shown.crop === 'flax',
    bloom: shown.bloom === true,
    // ves se spřežením orá všechno (oxen.md) – pole nese příznak `ard`
    ploughed: scene.fields.find((f) => f.id === target.id)?.ard === true,
    areaM2: part.areaM2 ?? shown.size * shown.size,
    fertility: part.fertility,
    naturalFertility: part.naturalFertility ?? part.fertility,
    ashBonus: part.ashBonus ?? 0,
    surface: part.surface ?? 'meadow',
    walkM: part.walkM,
    holding: house ? { dwellingId: house.id, type: house.type } : null,
    ...(part.damage ? { damage: part.damage } : {}),
    ...(part.protection ? { protection: part.protection } : {}),
    ...(part.losses ? { losses: partLossRows(part.losses, view?.weather) } : {}),
    sownYears: part.sownYears ?? null,
    fallowYears: part.fallowYears ?? null,
    overgrowthYears: shown.overgrowth ?? 0,
    grazed: shown.grazed ?? null,
    crop: part.work?.crop ?? null,
    mow: part.work?.mow ?? null,
    next: part.next ?? null,
    rest: part.rest ?? null,
    founding: part.founding ?? null,
    ...(part.outlook ? { outlook: part.outlook } : {}),
    fieldIds: view?.fields.map((f) => f.id) ?? [],
  };
}

/**
 * Víc vybraných lidí (expeditions.md – Výběr a skupina): řada portrétů, síla do meče (člen skupiny
 * podle skupiny, jinak podle ves) a stavy tlačítek Osedlat, Sesednout a Domů.
 */
function peopleDetails(
  scene: SceneVillage,
  ids: readonly number[],
  parties: readonly PartyView[],
  homeCell: GridCell | null,
): SelectionDetails | null {
  if (ids.length === 0) return null;
  const persons = scene.labor?.persons ?? [];
  const people: { id: number; portrait: PersonPortraitIcon; role: string }[] = [];
  const states: ExpeditionPersonState[] = [];
  let strength = 0;
  for (const id of ids) {
    const person = persons.find((p) => p.id === id);
    if (person)
      people.push({ id, portrait: personPortrait(person), role: ROLE_NAMES[person.role] });
    const member = parties.flatMap((p) => p.people).find((m) => m.personId === id);
    strength += member ? member.strength : (person?.expedition?.strength ?? 0);
    const state = expeditionPersonState(person, id, parties, homeCell);
    if (state) states.push(state);
  }
  if (people.length === 0) return null;
  return { kind: 'people', people, strength, states };
}

/**
 * Víc vybraných obydlí: domácnosti a lidé v nich (jen hotová obydlí s lidmi). Žádné hotové → null.
 */
function dwellingsDetails(
  view: VillageView | null,
  scene: SceneVillage,
  ids: readonly number[],
): SelectionDetails | null {
  const present = ids.filter((id) => scene.dwellings.some((d) => d.id === id));
  if (present.length === 0) return null;
  const households = (view?.households ?? []).filter((h) => present.includes(h.dwellingId));
  const inhabited = households.filter((h) => h.occupants > 0);
  return {
    kind: 'dwellings',
    ids: present,
    households: inhabited.length,
    people: inhabited.reduce((sum, h) => sum + h.occupants, 0),
    leave: view ? leaveDetails(view, present) : null,
  };
}

/**
 * Odchod do nové vsi (migration.md) – kdo odejde, kolik lidí, jídla s sebou a kam to jde. Domácnosti,
 * které si staví nový dům, zůstávají; ve vymřelé či opuštěné vsi a u lidí na cestě nikdo.
 */
export interface SelectionLeave {
  /** Obydlí, jejichž domácnosti odejdou. */
  households: readonly number[];
  people: number;
  /**
   * Jídlo s sebou (kg) – kolik unesou lidé od 7 let a vůz (`cart`), nejvýš poměrný díl zásob; celá
   * ves všechno (`all`).
   */
  foodKg: number;
  /** Vůz s voly, který si vezmou (migration.md – Vůz při odchodu); bez vozu a u celé vsi null. */
  cart: CartKind | null;
  /**
   * Odchází celá ves – bere si úplně vše (migration.md – Co si vezmou): všechna zvířata (kusy)
   * a vozy. Chybí = odejde jen část.
   */
  all?: { animals: number; carts: number };
  /** Na novou mapu po směrech – dny cesty, nebo proč tím směrem nejde. */
  directions: readonly LeaveDirection[];
  /** Odchází syn vojvody a bere si jezdeckého koně (lord.md – Dělení vsi). */
  horse?: boolean;
}

/** Syn vojvody v řadě ikon dvorce a jeho odchod: díl vsi, vůz, kůň (lord.md – Dělení vsi). */
export interface SelectionSon extends DepartingSon {
  /** Odchod syna s dílem; když nesmí vést nebo ves nemůže odejít, null. */
  leave: SelectionLeave | null;
}

/** Synové vojvody pro odchod – popisek z náhledu jádra (všichni odcházející, i díl jen z rodiny). */
function sonDetails(view: VillageView): SelectionSon[] {
  const blocked = view.extinct || view.abandoned || view.journey;
  return (view.dynasty?.sons ?? []).map((son): SelectionSon => {
    const leave: SelectionLeave | null =
      son.reason === null && !blocked && son.people > 0
        ? {
            households: son.dwellingIds,
            people: son.people,
            foodKg: son.foodKg,
            cart: son.cart,
            directions: view.leave.directions,
            ...(son.horse ? { horse: true } : {}),
          }
        : null;
    return { ...son, leave };
  });
}

/**
 * Řádek výrobků dvorce: výrobek bez pracujícího řemeslníka, jehož dílna stojí bez vstupu, nese
 * důvod jako upozornění (`workshopStopNotice` – „Kovář nemá uhlí“); bez dílny nic.
 */
function buyingDetails(view: VillageView, sources: VillageCraftSource[]): SelectionBuying {
  return {
    sources: sources.map((source) => {
      if (source.own) return source;
      const stopped = view.crafts.workshops
        .filter((w) => w.craft === PRODUCT_CRAFT[source.product])
        .map(workshopStopNotice)
        .find((text) => text !== null);
      return stopped ? { ...source, stopped } : source;
    }),
    purchases: view.purchases ?? [],
  };
}

/** Odchod domácností vybraných obydlí `ids`; když žádná odejít nemůže, null. */
function leaveDetails(view: VillageView, ids: readonly number[]): SelectionLeave | null {
  if (view.extinct || view.abandoned || view.journey) return null;
  const leaving = view.households.filter(
    (h) =>
      ids.includes(h.dwellingId) &&
      h.occupants > 0 &&
      h.relocationBlock !== 'relocating' &&
      h.relocationBlock !== 'no-household',
  );
  if (leaving.length === 0) return null;
  const people = leaving.reduce((sum, h) => sum + h.occupants, 0);
  const carriers = leaving
    .flatMap((h) => h.ages)
    .filter((age) => age >= LEAVING.carryFromAge).length;
  const total = view.people.children + view.people.adults + view.people.elders;
  const food = view.storesKg + view.meatKg + view.cheeseKg + view.legumesKg + view.applesKg;
  const share = total > 0 ? people / total : 0;
  const households = leaving.map((h) => h.dwellingId);
  const { directions } = view.leave;
  // odcházejí-li všichni, berou si úplně vše (migration.md – Co si vezmou)
  if (everyoneLeaves(people, total)) {
    const { foodKg, animals, carts } = view.leave.all;
    const { allBlocked } = view.leave;
    return {
      households,
      people,
      foodKg,
      cart: null,
      all: { animals, carts },
      directions: allBlocked
        ? directions.map((d) => ({ ...d, blocked: d.blocked ?? allBlocked }))
        : directions,
    };
  }
  const { cart } = view.leave;
  const budget = carriers * LEAVING.carryKgPerPerson + (cart ? CARTS.loadKg[cart] : 0);
  return {
    households,
    people,
    foodKg: Math.min(budget, Math.max(0, food) * share),
    cart,
    directions,
  };
}

/** Řemeslná dílna obydlí `dwellingId` pro panel; obyčejné obydlí null. */
function workshopDetails(view: VillageView, dwellingId: number): SelectionWorkshop | null {
  const workshop = view.crafts.workshops.find((w) => w.dwellingId === dwellingId);
  if (!workshop) return null;
  const { stock } = CRAFT_LOOKS[workshop.craft].product;
  // kovář má v zásobě hřivny – pokrytí nástroji ukáže řádek vybavení (production-chains.md)
  const coverage =
    workshop.craft === 'potter'
      ? view.crafts.coverage.pottery
      : workshop.craft === 'carpenter'
        ? (view.crafts.coverage.woodTools ?? 0)
        : null;
  const carpenter = workshop.carpenter;
  return {
    craft: workshop.craft,
    activity: workshop.activity,
    laborPerDay: workshop.laborPerDay,
    outputPerDayKg: workshop.outputPerDayKg,
    stockKg: view.crafts.stocks[stock] ?? 0,
    coverage,
    kiln: workshop.kilns.find((k) => k.stage !== 'draw') ?? workshop.kilns[0] ?? null,
    kilns: workshop.kilns,
    toPlant: workshop.toPlant,
    skill: workshop.skill,
    ...(workshop.ore ? { ore: workshop.ore } : {}),
    ...(workshop.iron ? { iron: { ...workshop.iron, coverage: view.crafts.coverage.tools } } : {}),
    ...(workshop.clay ? { clay: workshop.clay } : {}),
    carpenter: carpenter
      ? {
          carts: view.crafts.carts,
          cartTargets: view.crafts.cartTargets,
          making: carpenter.cart,
          woodworkCoverage: carpenter.woodworkCoverage,
          iron: carpenter.iron,
        }
      : null,
  };
}

/**
 * Modla nebo svatyně – z pohledu na ves, staveniště čekající na server (jen ve scéně) s nulovým
 * průběhem.
 */
function sacredDetails(
  view: VillageView | null,
  scene: SceneVillage,
  id: number,
): SelectionDetails | null {
  const building = view?.sacred.buildings.find((b) => b.id === id);
  if (building) {
    return {
      kind: 'sacred',
      id,
      type: building.kind,
      happiness: building.happiness,
      building: building.built ? null : building.progress,
      oaksToFell: building.built ? 0 : building.oaksToFell,
      condition: building.condition,
      abandoned: building.abandoned,
      repair: building.repair,
      ...(building.use ? { use: building.use } : {}),
    };
  }
  const site = scene.sacred?.buildings.find((b) => b.id === id);
  if (!site) return null;
  // bouraná modla či svatyně je staveniště pozpátku pod id stavby bourání (demolition-view.ts)
  if (site.demolition !== undefined) {
    const target = scene.demolitions?.find((d) => d.id === id)?.targetId;
    const original = view?.sacred.buildings.find((b) => b.id === target);
    return {
      kind: 'sacred',
      id,
      type: site.kind,
      happiness: original?.happiness ?? sacredBuildingHappiness(site.kind),
      building: site.progress,
      oaksToFell: 0,
      condition: original?.condition ?? site.condition ?? 1,
      abandoned: original?.abandoned ?? false,
      repair: null,
      demolition: site.demolition,
    };
  }
  return {
    kind: 'sacred',
    id,
    type: site.kind,
    happiness: sacredBuildingHappiness(site.kind),
    building: site.built ? null : site.progress,
    oaksToFell: 0,
    condition: site.condition ?? 1,
    abandoned: site.abandoned === true,
    repair: null,
  };
}

/** Stádo druhu ohrady (skot = krávy); ohrada volů žádné (voli mají vlastní údaje). */
export function penHerd(
  species: PenSpecies,
  herds: Record<HerdSpecies, number>,
): { species: HerdSpecies; count: number } | null {
  if (species === 'team' || species === 'horse') return null;
  const herd: HerdSpecies = species === 'cattle' ? 'cow' : species;
  return { species: herd, count: herds[herd] };
}

/** Ohrada – z pohledu na ves (stáda, pastva a seno jsou celé vsi). */
function penDetails(view: VillageView | null, id: number): SelectionDetails | null {
  const pen = view?.pens.find((p) => p.id === id);
  if (!view || !pen) return null;
  return {
    kind: 'pen',
    id,
    species: pen.species,
    squares: pen.squares,
    places: pen.places,
    animals: pen.animals,
    herdPlaces: pen.herdPlaces,
    extension: pen.extension,
    built: pen.built,
    progress: pen.progress,
    oxen: pen.oxen,
    oxenVillage: pen.species === 'team' ? (view.oxen ?? null) : null,
    cows: pen.cows,
    herd: penHerd(pen.species, view.livestock.herds),
    team: pen.team,
    training: pen.training,
    hayKg: view.hayKg,
    horses: pen.species === 'horse' ? (view.horses ?? null) : null,
    condition: pen.condition,
    abandoned: pen.abandoned,
    repair: pen.repair,
    ...(pen.use ? { use: pen.use } : {}),
  };
}
