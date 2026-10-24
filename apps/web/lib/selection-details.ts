import {
  HORSES,
  AGE,
  CARTS,
  DRAFT_OXEN,
  LEAVING,
  ORCHARD,
  PRODUCT_CRAFT,
  sacredBuildingHappiness,
  type CartKind,
  type Craft,
  type Crop,
  type Direction8,
  type BuildableDwellingType,
  type DwellingType,
  type FamilyCounts,
  type FieldSurface,
  type HerdPlaces,
  type HerdSpecies,
  type PenSpecies,
  type PartStage,
  type PartYearWork,
  type RoadGrade,
  type RoadUpgradeOption,
  type SacredBuildingKind,
  type TileCell,
  type WorkshopActivity,
} from '@bohemia/game';
import type { LeaveDirection } from './departure-view';
import type { VillageManor } from './manor-view';
import type { VillageHorses } from './horse-view';
import type { VillageDugSite } from './ore-site-view';
import type { VillageKiln } from './kiln-view';
import type { VillageGrainPit } from './grain-pit-view';
import type { VillageJunction } from './junction-view';
import type { VillageThreshingFloor } from './village-view-types';
import type { HouseholdRelocation } from './relocation-view';
import { TREE_GROWTH_YEARS } from './orchard-look';
import { personPortrait, type ArmsView, type PersonPortraitIcon } from './person-view';
import { personActivity, type PersonFigureState } from './person-activity';
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
  selectedFieldPart,
  selectedOrchardSquare,
  type VillageTarget,
} from './scene/village-picking';
import {
  CRAFT_LOOKS,
  type BuildOption,
  type FieldLook,
  type SceneVillage,
  type VillageCraftSource,
  type VillagePurchase,
  type VillageOxen,
  type VillageRoad,
  type VillageView,
} from './village-view';

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
  /**
   * Ves výrobek dílny dokupuje u souseda (vlastní řemeslník nemá vstupy – crafts.md, Nákup
   * u sousedů): směr a dny cesty; jinak chybí.
   */
  buying?: { direction: Direction8; days: number };
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

/** Nákup u sousedů v panelu dvorce (crafts.md – Nákup u sousedů). */
export interface SelectionBuying {
  sources: VillageCraftSource[];
  purchases: VillagePurchase[];
}

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
      condition: number;
      ageYears: number;
      full: boolean;
      overcrowded: boolean;
      /**
       * Obyvatelé obydlí přestavují (průběh 0–1, nový typ a stromy, které ještě musí skácet),
       * jinak null.
       */
      rebuild: { progress: number; type: DwellingType; treesToFell: number } | null;
      /** Řemeslná dílna (crafts.md); obyčejné obydlí null. */
      workshop: SelectionWorkshop | null;
      /** Domácnost si staví nový dům (migration.md – Přestěhování domácnosti); jinak null. */
      relocation: HouseholdRelocation | null;
      /** Přestěhovat domácnost – cena nového domu; když teď nejde (staví, přestavuje…), null. */
      relocate: Record<BuildableDwellingType, BuildOption> | null;
      /** Dvorec vojvody (trade.md) – vylepšení vsi; obyčejné obydlí null. */
      manor: VillageManor | null;
      /**
       * Dvorec: kde ves bere výrobky řemeslníků a nákupy u sousedů na cestě (crafts.md – Nákup
       * u sousedů); u ostatních obydlí chybí.
       */
      buying?: SelectionBuying;
      /** Odejít do nové vsi (migration.md); když domácnost odejít nemůže, null. */
      leave: SelectionLeave | null;
    }
  | {
      /** Víc vybraných obydlí (Ctrl/Shift + klik, Ctrl + A – migration.md). */
      kind: 'dwellings';
      ids: readonly number[];
      /** Domácnosti ve vybraných obydlích (obydlí s lidmi). */
      households: number;
      /** Lidé ve vybraných obydlích. */
      people: number;
      /** Domácnosti, které se teď můžou přestěhovat (id obydlí) – Přestěhovat je umístí postupně. */
      relocatable: readonly number[];
      /** Cena nového domu jedné domácnosti. */
      relocate: Record<BuildableDwellingType, BuildOption> | null;
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
      /** Díly s popelem z vymýceného lesa (fields.md – Úroda). */
      ashParts: number;
      /** Nejvyšší letošní bonus úrodnosti z popela (+40 první sezónu, +20 druhou), jinak 0. */
      ashBonus: number;
      /** Kolik z pole zarůstá (m² – fields.md, Zarůstání); 0 = nic. */
      overgrowingM2: number;
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
      /** Zakládá se – průběh, zbývající práce (člověkodny) a stromy na klády; jinak null. */
      founding: { progress: number; laborLeft: number; trees: number } | null;
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
    }
  | {
      kind: 'road';
      id: number;
      /** Úseky cesty hráče (řetěz – roads.md, Cesta pro hráče). */
      segments: number[];
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
       * Člověk vsi (villagers.md – Výběr postavy; Martin 20. 10. 2026: „Stačí mi jenom vědět info
       * typu – žena rolníka, jde pro vodu.“): portrét podle pohlaví a věku, role pod portrétem,
       * co právě dělá, věk, dům (tlačítko ho vybere – null, když dům ve scéně není) a u výrostka,
       * který pase, zvíře stáda.
       */
      kind: 'person';
      id: number;
      portrait: PersonPortraitIcon;
      role: string;
      activity: string;
      age: number;
      home: number | null;
      /** Ikona domu (`public/icons/build/` – typ obydlí nebo dílna). */
      homeIcon: string | null;
      herd: HerdSpecies | null;
      /** Dovednosti, když se člověk cvičil (lord.md – Dovednosti); jinak null. */
      arms?: ArmsView | null;
      /** Má koně (jezdec – horses.md). */
      horse?: boolean;
      /**
       * Kůň, na kterém jezdec jezdí (horses.md – Co hráč vidí): věk, výcvik 0–1 a dostává-li obilí;
       * bez koně null.
       */
      mount?: SelectionPersonMount | null;
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
    } & VillageThreshingFloor);

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

export type SelectionDetails = SelectionKinds & { cancelConstructionId?: number };

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
): SelectionDetails | null {
  const details = selectionKinds(view, scene, target, person, draft);
  if (!details) return null;
  const cancelConstructionId = cancellableConstruction(view, details);
  return cancelConstructionId === undefined ? details : { ...details, cancelConstructionId };
}

function selectionKinds(
  view: VillageView | null,
  scene: SceneVillage,
  target: VillageTarget | null,
  person: PersonFigureState | null = null,
  draft: DraftFigureState | null = null,
): SelectionKinds | null {
  if (!target) return null;
  if (target.kind === 'person') return personDetails(view, scene, target.id, person, draft);
  if (target.kind === 'plough-team') return teamDetails(scene, target.team, draft);
  if (target.kind === 'cart') return cartDetails(scene, target.id, draft);
  if (target.kind === 'dwellings') return dwellingsDetails(view, scene, target.ids);
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
      condition: household.condition,
      ageYears: household.ageYears,
      full: household.full,
      overcrowded: household.overcrowded,
      rebuild: rebuild
        ? {
            progress: rebuild.progress,
            type: rebuild.dwellingType ?? household.type,
            treesToFell: rebuild.treesToFell,
          }
        : null,
      workshop: view ? workshopDetails(view, household.dwellingId) : null,
      relocation: household.relocation,
      relocate: view && household.relocationBlock === null ? view.relocation : null,
      manor: view?.manor?.dwellingId === household.dwellingId ? view.manor : null,
      ...(view?.manor?.dwellingId === household.dwellingId && view.crafts.sources
        ? { buying: { sources: view.crafts.sources, purchases: view.purchases ?? [] } }
        : {}),
      leave: view ? leaveDetails(view, [household.dwellingId]) : null,
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
    const square = view?.orchards
      .find((o) => o.id === target.id)
      ?.cells.find((c) => c.cell.x === target.cell.x && c.cell.y === target.cell.y);
    return square ? { kind: 'orchard-square', id: target.id, ...square } : null;
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
  if (target.kind === 'threshing-floor') {
    if (!scene.threshingFloors?.some((f) => f.id === target.id)) return null;
    const floor = view?.threshingFloors?.find((f) => f.id === target.id);
    return floor ? { kind: 'threshing-floor', ...floor } : null;
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
    ashParts: field.ashParts,
    ashBonus: field.ashBonus,
    overgrowingM2: field.overgrowingM2,
    founding: founding ? founding.progress : null,
    fieldIds: view?.fields.map((f) => f.id) ?? [],
  };
}

/** Kůň jezdce `riderId` z pohledu na ves (jede-li na koni); jinak null. */
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
): SelectionDetails | null {
  const person = scene.labor?.persons?.find((p) => p.id === id);
  if (!person) return null;
  const figure = state?.id === id ? state : null;
  const herding = figure?.job?.kind === 'herd';
  const home = scene.dwellings.find((d) => d.id === person.home) ?? null;
  const job = figure?.job ?? null;
  return {
    kind: 'person',
    id,
    portrait: personPortrait(person),
    role: ROLE_NAMES[herding && person.age < AGE.adult ? herdRole(person.sex) : person.role],
    activity: personActivity(figure, scene, draft),
    age: person.age,
    home: home ? home.id : null,
    homeIcon: home ? (home.craft ? CRAFT_LOOKS[home.craft].icon : home.type) : null,
    herd: herding ? (figure?.herd ?? null) : null,
    arms: person.arms ?? null,
    horse: person.horse === true,
    mount: mountOf(view, id),
    draft:
      job?.kind === 'plough'
        ? { kind: 'plough-team', team: job.team }
        : job?.kind === 'cart'
          ? { kind: 'cart', id: job.cart }
          : null,
  };
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
    sownYears: part.sownYears ?? null,
    fallowYears: part.fallowYears ?? null,
    overgrowthYears: shown.overgrowth ?? 0,
    grazed: shown.grazed ?? null,
    crop: part.work?.crop ?? null,
    mow: part.work?.mow ?? null,
    founding: part.founding ?? null,
    fieldIds: view?.fields.map((f) => f.id) ?? [],
  };
}

/**
 * Víc vybraných obydlí: domácnosti a lidé v nich a které domácnosti se můžou přestěhovat (jen
 * hotová obydlí s lidmi, které si nový dům nestaví ani nepřestavují). Žádné hotové → null.
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
  const relocatable = present.filter((id) =>
    households.some((h) => h.dwellingId === id && h.relocationBlock === null),
  );
  return {
    kind: 'dwellings',
    ids: present,
    households: inhabited.length,
    people: inhabited.reduce((sum, h) => sum + h.occupants, 0),
    relocatable,
    relocate: view && relocatable.length > 0 ? view.relocation : null,
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
   * Jídlo s sebou (kg) – kolik unesou lidé od 7 let a vůz (`cart`), nejvýš poměrný díl zásob.
   */
  foodKg: number;
  /** Vůz s voly, který si vezmou (migration.md – Vůz při odchodu); bez vozu null. */
  cart: CartKind | null;
  /** Na novou mapu po směrech – dny cesty, nebo proč tím směrem nejde. */
  directions: readonly LeaveDirection[];
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
  // odchází-li celá ves, vezme si vůz i s voly, které by jinak orali (migration.md)
  const cart = people >= total ? view.leave.allCart : view.leave.cart;
  const budget = carriers * LEAVING.carryKgPerPerson + (cart ? CARTS.loadKg[cart] : 0);
  return {
    households: leaving.map((h) => h.dwellingId),
    people,
    foodKg: Math.min(budget, Math.max(0, food) * share),
    cart,
    directions: view.leave.directions,
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
  // ves výrobek dílny dokupuje u souseda (vlastní řemeslník nemá vstupy – crafts.md)
  const source = view.crafts.sources?.find((s) => PRODUCT_CRAFT[s.product] === workshop.craft);
  const buying =
    source && !source.own && source.direction !== null && source.days !== null
      ? { direction: source.direction, days: source.days }
      : null;
  return {
    ...(buying ? { buying } : {}),
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
    };
  }
  const site = scene.sacred?.buildings.find((b) => b.id === id);
  if (!site) return null;
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
  };
}
