// Typy stavu vsi – Dobytek, ohrady, seno, strava a štěstí.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { CartReach } from './types-construction';
import type { SquareGrid, StructureWear, TileCell } from './types-land';

/** Druh stáda (diet.md – Dobytek); slepice patří k obydlím, voli k ohradám. */
export type HerdSpecies = 'sheep' | 'goat' | 'pig' | 'cow';

/**
 * Stáda vsi (diet.md – Dobytek). Počty mohou být neceločíselné – mláďata a porážka se počítají
 * podílem stáda; panel a scéna je zaokrouhlí.
 */
export interface LivestockState {
  herds: Record<HerdSpecies, number>;
  /** Mláďata letošního jara (přibyla 1. 4.) – z nich ves v listopadu bere maso navíc. */
  young: Record<HerdSpecies, number>;
  /**
   * Louka a les (ha) do LIVESTOCK.reachM od vsi podle krajiny (simulace krajinu nemá) – pastva
   * a žaludy. Bez údaje výchozí hodnoty typické krajiny (LIVESTOCK.defaultLand).
   */
  land?: { meadowHa: number; forestHa: number };
  /**
   * Kusy poražené v den `day` (i zlomky) – jen pro hlášení (`LaborDay.slaughterHeads`), simulace
   * je nečte; starý den se přepíše.
   */
  slaughtered?: { day: number; heads: Partial<Record<HerdSpecies, number>> };
  /**
   * Porážka a uzení (listopad) – potřebné a odvedené člověkodny; chybí = žádná. `emergency` –
   * práce nouzové porážky mimo listopad (diet.md – Nouzová porážka), dělá se hned.
   */
  slaughterWork?: { required: number; done: number; emergency?: boolean } | null;
  /**
   * Pasení od poslední porážky (diet.md – Pasáci): součet denní potřeby pasáků a co z ní
   * výrostci uhlídali (v plných pasácích). Chybí = zatím nic (vsi uložené dřív).
   */
  herding?: { needDays: number; watchedDays: number };
  /**
   * Na jaký podíl oděvu dají vlnu ovce přezimující od poslední porážky (diet.md – Oděv; 0–1,
   * `recordWool`). Chybí = dost (vsi uložené dřív a nové vsi do první porážky).
   */
  wool?: number;
  /**
   * Kusy na maso, které čekají na zimní porážku (diet.md – Porážka v zimě): rozhodne je porážka
   * 1. 11., žijí ve stádech (`herds`) a žerou seno nebo les, ves je porazí po dnech podle čerstvé
   * spotřeby do konce zimy. Chybí = žádné (i vsi uložené dřív).
   */
  culling?: Record<HerdSpecies, number>;
  /**
   * Od kterého dne stádo omezují místa ohrad a u domů (oxen.md – Ohrady podle druhu, roční
   * odklad – návrh Clauda): rok po založení vsi, u vsi uložené dřív rok po zavedení pravidla
   * (`withPenSpecies`). Chybí = platí hned (testy, vsi bez převodu).
   */
  pensFromDay?: number;
}

/** Seno (oxen.md – Seno): zásoba, letošní seč a zima. */
export interface HayState {
  kg: number;
  /** Sečení (červen–červenec) – díly úhoru ve fázi louky v pořadí seče; null = letos se neseče. */
  mowing: HayMowing | null;
  /**
   * Zima (listopad–březen): kolik sena voli potřebovali a dostali do včerejška – pokrytí rozhodne
   * o jarní orbě a úhynu (oxen.md) – a totéž pro krávy, ovce a kozy (`herdNeedKg`,
   * `herdEatenKg` – zimní úhyn, diet.md; zimy začaté před senem pro ovce a kozy je nemají)
   * a koně (`horsesNeedKg`, `horsesEatenKg` – horses.md, Krmení; jen ves s koňmi). Chybí mimo zimu.
   */
  winter?: {
    oxenNeedKg: number;
    oxenEatenKg: number;
    herdNeedKg?: number;
    herdEatenKg?: number;
    horsesNeedKg?: number;
    horsesEatenKg?: number;
  };
  /**
   * Volná práce na seč letošních oken (oxen.md – Stáda podle práce na seč): práce, která po
   * polních pracích zbyla na seč (nutná seč, stavby, seč navíc i nevyužitá), převedená na seno
   * podle dnešní seče (kg) – v 1. seči a v otavě zvlášť. Začne 25. 5., 1. 10. se uzavře do
   * `mowCapacityKg`. Chybí = mimo sezónu (i seč rozjetá před 25. 10. 2026 – letos bez stropu).
   */
  mowFree?: { first: number; second: number };
  /**
   * Kolik sena (kg ze seče) ves v obou oknech loni stihla posekat prací po polních pracích – strop
   * cílových stád (`mowingCapacityKg`). Chybí = ves ještě sezónu nezapsala, stáda bez stropu.
   */
  mowCapacityKg?: number;
}

/**
 * Seč jednoho léta – díly úhoru (`partIds`) a v pořadí seče i čtverce přirozených luk
 * (`squares`; bez nich jen díly), potřebné a odvedené člověkodny a seno při plné seči (kg).
 */
export interface HayMowing {
  partIds: number[];
  /** Louky v pořadí seče (od obydlí) – díl úhoru (`partId`), nebo políčko přirozené louky. */
  squares?: HaySquare[];
  required: number;
  /**
   * Kolik sena zbylé louky po krupobití nebo povodni zbylo (0–1, disasters.md – Kroupy, Povodeň
   * potoka) – násobí seno další seče; chybí = pohroma nebyla.
   */
  hailFactor?: number;
  done: number;
  yieldKg: number;
  /**
   * Práce seče na seno pro zimní stádo (člověkodny, prvních louk od obydlí) – po polních pracích,
   * před stavbami; zbytek luk jen z práce po stavbách (oxen.md – Seno, dvě seče). Chybí = celá
   * seč (uložená před 24. 10. 2026).
   */
  needed?: number;
  /**
   * Kolik práce ze seče ves letos chce (člověkodny – do stropu stád, oxen.md, Seno, dvě seče);
   * zbytek luk zůstane. U otavy jsou v seči všechny louky posečené v 1. seči a strop se zvedne, když
   * přibude dobytek (`cattle`). Chybí = celá seč.
   */
  wanted?: number;
  /** U otavy: krávy a voli (i na cestě), se kterými plán počítal – víc = plán znovu. */
  cattle?: number;
  /** Svoz sena, který převzaly vozy (wagons.md – Vůz; člověkodny seče); chybí = 0. */
  hauled?: number;
  /** Kam vůz při seči dojede – spočítá se při prvním svozu (wagons.md). Chybí = ještě ne. */
  cartReach?: CartReach;
  /** Kam při seči dojede čtyřkolák (ne na zoraný díl, širší oblouk). Chybí = ještě ne. */
  cartReach4?: CartReach;
  /**
   * Která seč (oxen.md – Seno, dvě seče): 2 = otava (1. 8. – 30. 9.) jen na loukách posečených
   * v 1. seči; chybí = 1. seč (25. 5. – 30. 6.; i seč uložená před 25. 10. 2026).
   */
  cut?: 2;
  /** U otavy, co se letos posekalo v 1. seči – díly, plocha přirozených luk a seno (kg). */
  firstCut?: { partIds: number[]; naturalM2: number; yieldKg: number };
}

/** Louka v seči: díl úhoru ve fázi louky, nebo políčko přirozené louky krajiny (oxen.md – Seno). */
export interface HaySquare {
  partId?: number;
  cell?: TileCell;
  areaM2: number;
  /**
   * Vzdálenost chůze z nejbližšího obydlí po pěšinách při plánu seče (m, paths.md – Pěšiny
   * a práce; díl `partWalkDistance`, políčko ke středu); bez pěšin přímá.
   */
  distanceM: number;
}

/**
 * Druh ohrady (oxen.md – Ohrady podle druhu; Martin 19. 10. 2026: „Každý druh zvířete by měl mít
 * vlastní ohradu, ať se nemíchají.“): ovce, kozy, prasata, skot (krávy a telata) a spřežení volů
 * (výcvik a voli – s kravami se nemíchají).
 */
export type PenSpecies = 'sheep' | 'goat' | 'pig' | 'cattle' | 'team' | 'horse';

/**
 * Kůň ohrady koní (horses.md – Koně po kusech): kus s vlastním dnem narození, pohlavím
 * a výcvikem. Hříbě do roku nemá vlastní místo. `riderId` – jezdec, který na koni jezdí (úloha 6).
 */
export interface Horse {
  id: number;
  bornDay: number;
  sex: 'male' | 'female';
  /** Výcvik pod sedlem (0 = nevycvičený). */
  training: number;
  riderId?: number;
}

/** Kůň v obchodu – bez id (dostane ho až ve vsi) a bez jezdce (horses.md – Nákup a prodej). */
export type TradedHorse = Omit<Horse, 'id' | 'riderId'>;

/**
 * Další čtverec ohrady za prvním (oxen.md – Ohrady podle druhu): ohrada se maluje po čtvercích
 * jako hřbitov, nejvýš PEN_SQUARES.max čtverců. Rozšíření ve stavbě nese `constructionId` – do
 * dokončení se čtverec nepočítá do kapacity.
 */
export interface PenSquare {
  /** Čtverec v mřížce ohrady (`Pen.grid`); bez ní políčko krajiny. */
  cell: TileCell;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
  /** Rozšíření ve stavbě – id stavby, která čtverec ohrazuje; bez údaje hotový s ohradou. */
  constructionId?: number;
}

/**
 * Ohrada s přístřeškem (oxen.md) – čtverce 15 × 15 m pro jeden druh zvířat; u spřežení voli
 * a výcvik nového. Stavba a rádlo jsou stavby (`Construction.penId`). První čtverec (`cell`, `x`,
 * `z`) nese přístřešek a jesle, další čtverce jsou v `extraSquares`.
 */
/**
 * Vůl v ohradě volů (oxen.md – Voli po kusech): od `trainedDay` je vycvičený a táhne rádlo nebo
 * vůz (do té doby je to tele ve výcviku – OXEN.trainingYears), slouží OXEN.serviceYears let, pak
 * jde na maso. `weak` – slabý vůl po zimě bez dost sena (pokrytí sena k 1. 3., 0,5–1): na jaře orá
 * jen tímto podílem své denní kapacity (oxen.md – Jen rádlo); chybí = plná síla.
 */
export interface Ox {
  trainedDay: number;
  weak?: number;
}

export interface Pen {
  id: number;
  /**
   * Druh zvířat (oxen.md – Ohrady podle druhu); ohrady uložené dřív ho dostanou při načtení
   * (`withPenSpecies` – se spřežením nebo výcvikem `team`, jinak `cattle`).
   */
  species?: PenSpecies;
  /** Koně ohrady koní (horses.md); u jiných ohrad chybí. */
  horses?: Horse[];
  /** První čtverec ohrady (přístřešek a jesle) v její mřížce (`grid`); bez ní políčko krajiny. */
  cell: TileCell;
  /** Další čtverce ohrady (rozšíření i čtverce namalované najednou); bez údaje jen první. */
  extraSquares?: PenSquare[];
  /**
   * Natočená mřížka ohrady (fields.md – Natočené stavby, oxen.md) – natočený čtverec ohrady je
   * její čtverec `cell`; bez ní políčko krajiny.
   */
  grid?: SquareGrid;
  /** Střed prvního čtverce ve světě (m). */
  x: number;
  z: number;
  /** Den dostavění; dokud se staví, null. */
  builtDay: number | null;
  /**
   * Voli ohrady volů po kusech (oxen.md – Voli po kusech, Martin 20. 10. 2026) – vycvičení
   * i telata ve výcviku; jiné druhy ohrad bez údaje. Ohrady uložené dřív mají místo nich
   * spřežení a výcvik (`team`, `training`) – převede je `withOxen`.
   */
  oxen?: Ox[];
  /**
   * Jen ohrady uložené před voly po kusech (do převodu `withOxen`): vycvičené spřežení (2 voli) –
   * den, kdy začalo orat, `weak` jako u vola.
   */
  team?: { readyDay: number; weak?: number } | null;
  /** Jen ohrady uložené před voly po kusech: výcvik dvou telat – den zadání. */
  training?: { startDay: number } | null;
  /** Překážky na čtverci (id z vrstvy) – zmizí se zahájením stavby. */
  obstacles?: number[];
  /** Chátrání ohrady bez zvířat, kam nikdo nechodí (abandonment.md); chybí = celá. */
  wear?: StructureWear;
  /**
   * Den pokynu „Opustit“ (demolition.md – Opuštění): od něj se stavba nepoužívá, ale stojí. Chybí =
   * stavba se používá. Vrátit stavbu = záznam smazat.
   */
  disusedDay?: number;
}

/**
 * Jídlo jednoho dne (diet.md) – energie a bílkoviny proti potřebě, kvalita stravy a podíly zdrojů
 * na energii.
 */
export interface DietDay {
  /** Pokrytí energie 0–1 (obilí, maso, mléko a sýr, vejce, ovoce v obilních ekvivalentech). */
  energy: number;
  /** Pokrytí bílkovin 0–1 (1,6 g na kg tělesné váhy – Martin). */
  protein: number;
  /** Kvalita stravy 0,6–1 z bílkovin a ovoce (`dietQuality`). */
  diversity: number;
  /** Nasycení = energie × kvalita stravy. */
  satiation: number;
  /**
   * Podíly na potřebě energie 0–1 – obilí, maso, mléko a sýr, vejce, ovoce a luštěniny (chybí
   * u jídla uloženého před luštěninami = 0).
   */
  shares: {
    grain: number;
    meat: number;
    dairy: number;
    eggs: number;
    fruit: number;
    legumes?: number;
    /** Z toho čerstvé maso ze zimní porážky (diet.md – Porážka v zimě); chybí = žádné. */
    freshMeat?: number;
  };
}

/**
 * Jídlo z pole za hospodářský rok (fields.md – Kolik ves oseje, Osev podle stravy). Součty běží od
 * 1. 9. (začnou prvním 1. 9. po založení vsi, takže vždy pokrývají celý rok): potřeba energie
 * a z ní část, kterou nepokrylo maso, mléko a sýr, vejce a ovoce – tu musí dát pole (obilí
 * a luštěniny), i když ves zrovna hladověla. 1. 9. se z nich spočítá podíl uplynulého roku.
 */
export interface FieldFoodYear {
  /** Potřeba energie od 1. 9. (kg obilí). */
  needKg: number;
  /** Z toho potřeba jídla z pole (kg obilí). */
  fieldKg: number;
  /** Podíl jídla z pole za poslední celý hospodářský rok (0–1); chybí po prvním 1. 9. */
  share?: number;
  /**
   * Dlouhodobý podíl jídla z pole (0–1) – klouzavý průměr ročních podílů, každý rok o třetinu
   * rozdílu (FIELD_STORES.balanceYears; fields.md – Osev podle zásob, plynulost). Podle něj ves
   * seje. Chybí u vsí uložených dřív – začne posledním ročním podílem.
   */
  longShare?: number;
}

/**
 * Štěstí obyvatel (happiness.md): hodnota 0–100 a paměť pro cílovou hodnotu – úmrtí za poslední
 * rok a dny dřiny za posledních 60 dní. Simulace ji vede den po dni (na kouscích nezávisí).
 */
export interface HappinessState {
  value: number;
  /** Úmrtí posledního roku: den a kolik ubírá (dítě 5, dospělý a starší 3). */
  deaths: { day: number; points: number }[];
  /**
   * Dřina posledních dní (nejstarší první, nejvýš HAPPINESS_PENALTY.toilWindowDays): 1 = ves ten
   * den nestíhala polní práce v období, 0 = stíhala.
   */
  toil: number[];
}
