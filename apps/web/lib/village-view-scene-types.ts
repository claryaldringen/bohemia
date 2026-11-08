// Typy dat scény (`SceneVillage` a jeho části).

import { Landscape } from '@bohemia/game';
import type { CartWorld, LogStack, UsableStructure } from '@bohemia/game';
import type { PathFortification } from '@bohemia/game';
import type { SceneFortification } from './fort-view';
import type { CartGoal } from './cart-routes';
import { GraveMound } from '@bohemia/game';
import { DwellingPlot } from '@bohemia/game';
import { KilnStage } from '@bohemia/game';
import { MoundSize } from '@bohemia/game';
import { tileCenterWorld } from '@bohemia/game';
import { PlotVariant } from '@bohemia/game';
import {
  type HailStrip,
  type TornadoStrength,
  type TornadoTrack,
  type RoadProfilePoint,
  type HerdSpecies,
  type FamilyCounts,
  type CartKind,
  type Craft,
  type Direction8,
  type DwellingType,
  type FieldSurface,
  type LaborShare,
  type ObstacleChanges,
  type PartStage,
  type Position,
  type Road,
  type RoadJunction,
  type RoadAppleStage,
  type RoadGrade,
  type RoadTree,
  type RoadTreeLook,
  type SacredBuildingKind,
  type SquareGrid,
  type StoredRoute,
  type TileCell,
  type HorseKind,
  type PenSpecies,
  type SummerWeather,
  type WinterWeather,
} from '@bohemia/game';
import { type SceneGrainPit } from './grain-pit-view';

import { type SceneFuneral } from './funeral-view';

import { type ScenePerson } from './person-view';

import { type SceneWedding } from './wedding-view';

/** Bourání ve scéně – id stavby `demolition`, druh bourané stavby a u obydlí typ a řemeslo. */
export interface SceneDemolition {
  id: number;
  structure: UsableStructure;
  type?: DwellingType;
  craft?: Craft;
}

export interface SceneVillage {
  /**
   * Hotová obydlí (`built: true`, id obydlí) i rozestavěná (`built: false`, id stavby); řemeslná
   * dílna nese řemeslo (`craft` – model dílny, u uhlíře i milíř).
   */
  dwellings: {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    progress: number;
    /** Řemeslná dílna (crafts.md) – `type` je pak obydlí, na kterém stojí. */
    craft?: Craft;
    /**
     * Hotová dílna dnes vyrábí – z pece nebo výhně stoupá dým (uhlíř topí jen v milíři – ten je
     * samostatná stavba). Bez údaje ne.
     */
    working?: boolean;
    /** Bydlí v něm někdo – jen z obydlí s obyvateli stoupá dým. Bez údaje = obývané. */
    inhabited?: boolean;
    /**
     * Dvůr hotové dílny (production-chains.md – Kovář; crafts.md – Hlína hrnčíře): co dnes kovář
     * dělá, houba a hřivny u kovárny, u hrnčíře jáma s hlínou. Bez údaje nic z toho.
     */
    yard?: SceneCraftYard;
    /**
     * Pozemek (polozemnice) – políčko krajiny, jeho střed (x, z) ve světě, strana v m a varianta
     * (kde na něm dům stojí). Volná obydlí (zemnice, starší polozemnice) ho nemají.
     */
    plot?: ScenePlot;
    /**
     * Herní den, od kdy obydlí stojí (hotové – dostavění, staveniště – zahájení stavby): pěšiny
     * domácnosti se vyšlapávají postupně (paths.md). Bez údaje = odjakživa.
     */
    since?: number;
    /**
     * Stav hotového obydlí 0–1 (population.md – Chátrání) – podle něj se dům ve scéně rozpadá
     * (dwelling-decay.ts). Bez údaje = celý (100 %).
     */
    condition?: number;
    /**
     * Dnešní tvar bez varianty rozměrů (population.md – Varianty rozměrů); bez údaje má dům
     * variantu podle polohy (`dwellingShape`).
     */
    plainShape?: true;
  }[];
  /**
   * Zbytky jam po zaniklých obydlích (population.md – Po zániku): typ, poloha, den zániku
   * (`since`), u polozemnice pozemek, jak zarostly 0–1 (`overgrowth`). Bez údaje žádné.
   */
  ruins?: {
    id: number;
    type: DwellingType;
    position: Position;
    since: number;
    overgrowth: number;
    plot?: ScenePlot;
    craft?: Craft;
    plainShape?: true;
    /**
     * Shořelo (disasters.md – Požár, Ve scéně): ohořelé trosky – tmavší odstín, dokud hráč na
     * místě nepostaví nový dům (pak zbytek zmizí jako každý). Bez údaje zbytek po rozpadu.
     */
    charred?: true;
  }[];
  /**
   * Rudiště kovářů (crafts.md – Uhlí a ruda kováře): místo (m), kovárna, vykopaná ruda na hromadě
   * u jámy (kg, po celých) a jestli se tu právě kope (rozdělaná dávka). Bez údaje žádná.
   */
  oreSites?: SceneOreSite[];
  /**
   * Jámy po kopání rudy (crafts.md – Uhlí a ruda kováře): poloha, kolik rudy z nich vzešlo (kg, po
   * celých – velikost jámy) a jak zarostly 0–1 (po dvacetinách; po SMITH_SUPPLY.pitYears zmizí).
   * Bez údaje žádné.
   */
  orePits?: SceneOrePit[];
  /**
   * Pole po čtvercích – díl = políčko krajiny `cell`, jeho střed (x, z) ve světě, strana
   * políčka `size` v m a stadium.
   */
  fields: {
    id: number;
    /**
     * Natočená mřížka pole (fields.md – Natočené stavby) – díly nesou střed a natočení, malování
     * rozšíření jde v ní. Bez údaje mřížka krajiny.
     */
    grid?: SquareGrid;
    parts: SceneFieldPart[];
    /**
     * Pole orá spřežení rádlem (oxen.md – Jen rádlo: ves se spřežením orá všechno, nic nekope) –
     * ve vnějších rozích má pole kulaté rohy podle obratu spřežení (Kulaté rohy). Ve vsi platí pro
     * všechna pole vsi, která letos orá (`ploughsThisYear` z jádra). Bez údaje ostré rohy.
     */
    ard?: true;
  }[];
  /**
   * Pohřby posledních dnů (cemetery.md – Pohřeb ve scéně, funeral-view.ts): průvod od domu
   * zemřelého na hřbitov a hranice na místě mohyly – mohylu scéna kreslí až po dohoření. Bez
   * údaje žádné.
   */
  funerals?: SceneFuneral[];
  /**
   * Svatby posledních dnů (kinship.md – Svatba ve scéně, wedding-view.ts): průvod od domu nevěsty
   * (nevěsta nebo ženich z okolí se svými lidmi od kraje mapy) na posvátné místo, obřad a cesta
   * do nového domova. Bez údaje žádné.
   */
  weddings?: SceneWedding[];
  /**
   * Hřbitovy po čtvercích (střed políčka ve světě a strana jako u pole) – průběh stavby
   * (založení, u hotového rozšíření; `built` hotový), počet obsazených hrobů a čtverce
   * rozšíření ve stavbě (`pending`). Bez údaje žádné.
   */
  cemeteries?: {
    id: number;
    /** Natočená mřížka hřbitova (fields.md – Natočené stavby); bez údaje mřížka krajiny. */
    grid?: SquareGrid;
    squares: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      /** Natočení čtverce natočeného hřbitova (rad); bez údaje 0. */
      rotation?: number;
      pending?: boolean;
    }[];
    built: boolean;
    progress: number;
    /**
     * Staré hroby – pohřbení před mohylami podle významu: běžné mohylky po řadách od prvního
     * hotového čtverce jako dřív (`gravePlacements`).
     */
    graves: number;
    /**
     * Mohyly podle významu (cemetery.md): místo v mřížce čtverce, velikost a čerstvá (holá hlína
     * – první rok po pohřbu). Bez údaje žádné.
     */
    mounds?: SceneGraveMound[];
    /**
     * Stav plotu 0–1 (abandonment.md) – plot se rozpadá jako plot opuštěného pozemku, mohylky
     * zarůstají; spadlý (0) zmizí úplně. Jen pod 1; bez údaje celý.
     */
    fence?: number;
  }[];
  /**
   * Jabloňové sady po čtvercích (střed políčka ve světě a strana jako u pole): průběh výsadby
   * čtverce 0–1, velikost stromů 0–1 (mladé stromky rostou – orchard-look.ts) a jestli na
   * stromech visí jablka (pozdní léto a podzim, než se sklidí). Velikost a jablka jsou po
   * čtvercích – obnovený čtverec má mladé stromky, zbytek sadu staré (orchard.md – Obnova sadu).
   * Bez údaje žádné.
   */
  orchards?: {
    id: number;
    /** Natočená mřížka sadu (fields.md – Natočené stavby); bez údaje mřížka krajiny. */
    grid?: SquareGrid;
    squares: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      /** Natočení čtverce natočeného sadu (rad); bez údaje 0. */
      rotation?: number;
      planting: number;
      growth: number;
      fruit: boolean;
      /**
       * Čtverec obnovy, který se sází znovu (staré stromy jsou skácené) – vytyčuje se jen on,
       * ne celý sad. U ostatních čtverců chybí.
       */
      renewal?: true;
    }[];
  }[];
  /**
   * Stromy, keře a kameny vrstvy překážek, které ves odstranila (pole, obydlí, hřbitovy, sady) nebo
   * pokácela (pařez, později nálet) – id z vrstvy. Bez údaje žádné.
   */
  obstacles?: ObstacleChanges;
  /**
   * Stromy vyhrazené rozestavěnými stavbami (forest.md) – kontrola umístění v prohlížeči podle
   * nich počítá klády z mýcení stejně jako server. Bez údaje žádné.
   */
  reservedTrees?: number[];
  /**
   * Klády bez hromady v kusech (`pileLogs` – jen ves před převodem na hromady u cesty) – scéna je
   * složí u obydlí nejblíž lesu jako dřívější hromadu u vsi. Bez údaje žádné.
   */
  woodLogs?: number;
  /**
   * Hromady klád (forest.md – Mýcení a hromada klád): id, místo z jádra (`LogStack` – u cesty
   * `road` nejblíž místu kácení, bez cesty místo kácení), bývalá hromada u vsi s obydlím
   * `dwellingId` a klády v celých kusech – scéna je složí na volném místě u místa. Bez údaje žádné.
   */
  logStacks?: (Pick<LogStack, 'id' | 'x' | 'z' | 'road' | 'dwellingId'> & { logs: number })[];
  /**
   * Rozestavěná bourání (demolition.md – Bourání): id stavby bourání a co se boří – popisek práce
   * u člověka („bourá zemnici“). Bez údaje se nic nebourá.
   */
  demolitions?: SceneDemolition[];
  /**
   * Kde ves dnes pracuje – postavy ve scéně (docs/design/villagers.md). Bez údaje (ves uložená
   * před rozdělením práce, ještě nedopočítaný den) nikdo.
   */
  labor?: SceneLabor;
  /** Posvátná místa (happiness.md) – bez údaje žádná. */
  sacred?: SceneSacred;
  /**
   * Humna i rozestavěná (production-chains.md – Humno) – id (= id stavby), střed s natočením
   * a průběh stavby 0–1 (`built` = hotové). Kontrola umístění v prohlížeči podle nich zná půdorys
   * humna; kreslí je scéna humna. Bez údaje žádná.
   */
  threshingFloors?: SceneThreshingFloor[];
  /**
   * Pokrytí nástroji 0–1 (crafts.md) – kontrola umístění pole v prohlížeči podle něj počítá cenu
   * založení jako server. Bez údaje 0.
   */
  toolCoverage?: number;
  /**
   * Ves má vycvičené spřežení s rádlem (oxen.md – Jen rádlo) – kontrola umístění pole v prohlížeči
   * počítá louku bez motyky (jen překážky) jako server. Bez údaje ne.
   */
  ploughTeam?: true;
  /**
   * Páry volů s rádlem doma (oxen.md – Voli po kusech, `ploughPairsHome`) – kolik spřežení scéna
   * pošle k orbě; bez údaje (ukázky) ohrady s vycvičenými voly.
   */
  ploughPairs?: number;
  /**
   * Milíře uhlířů (crafts.md – Milíř u skácených buků) – samostatné stavby u skácených buků: id
   * milíře, dílna, střed (m), fáze a její průběh 0–1 (stavba po fázích staveniště, pálení kouří).
   * Bez údaje žádné.
   */
  kilns?: SceneKiln[];
  /** Milířiště po rozebraných milířích – černá zem, která zarůstá. Bez údaje žádná. */
  kilnRemnants?: SceneKilnRemnant[];
  /**
   * Otevřené obilné jámy (production-chains.md – Obilné jámy) – id, střed (m) a jak je plná:
   * kreslí je scéna a jdou vybrat; k otevřené jámě vede pěšina (domácnosti si berou zrno).
   * Zapečetěné jámy nejsou vidět – nejsou tu. Bez údaje žádné.
   */
  grainPits?: SceneGrainPit[];
  /**
   * Mladé buky, které zasadil uhlíř (crafts.md – Uhlíř, obnova lesa): id stromu z vrstvy
   * překážek a velikost 0–1 podle stáří (za 60 let dospělý). Bez údaje žádné – ostatní nálet
   * má pevnou velikost.
   */
  plantedSaplings?: { id: number; growth: number }[];
  /**
   * Pevné cesty (roads.md) – úseky mezi rozcestími: osa a stupeň. Kreslí se stále stejně (ne
   * podle pěšin dne) a pěšiny dne se k nim stahují. Bez údaje žádné.
   */
  roads?: SceneRoad[];
  /**
   * Křižovatky (paths.md – Křižovatky) – střed, tvar, natočení, ramena (id úseků) a znamení.
   * Kreslí je scéna křižovatek (plán cest v2, Úloha 12); do té doby udusaný kruh ve středu, kde
   * končí aspoň tři úseky (`roadJunctions`). Bez údaje žádné.
   */
  junctions?: SceneJunction[];
  /**
   * Zemské stezky (trade.md) – osa od dvorce ke kraji mapy (úseky pevných cest za sebou) a jestli
   * je dostavěná; nosiči výpravy po ní chodí (`villager-plan.ts`). Bez údaje žádné.
   */
  trails?: SceneTrail[];
  /**
   * Výpravy k sousedům na cestě (trade.md – Ve scéně): karavana po zemské stezce – kdo jde tam
   * a kdo zpátky, vozy a postup (`caravan.ts`). Bez údaje karavany nejsou (nosiči podle práce dne).
   */
  expeditions?: SceneExpedition[];
  /**
   * Stromy u pevných cest (roads.md) – stadium (keř, strom, souš, pařez) a velikost 0–1 v den
   * pohledu. Bez údaje žádné.
   */
  roadTrees?: SceneRoadTree[];
  /**
   * Jabloně podél pevných cest (roads.md – Vysazení jabloní): čekající na výsadbu (vytyčené
   * kolíkem), strom s velikostí 0–1 a plody jako v sadu (orchard-look.ts), souš. Bez údaje žádné.
   */
  roadApples?: SceneRoadApple[];
  /**
   * Stáda na pastvě (diet.md – skutečné počty, zaokrouhleně): ovce, kozy, prasata a krávy mimo
   * ohradu (v zimě stojí krávy v ohradě, když ves nějakou má). Bez údaje se odvodí z domácností.
   */
  livestock?: Record<HerdSpecies, number>;
  /**
   * Divoká zvěř pro scénu (wildlife.md – Ve scéně): kolik kusů ukázat podle stupně stavu (ne
   * jedinci simulace), díl s největší škodou, hejna vran a podíl ryb. Bez údaje bez zvěře.
   */
  wildlife?: SceneWildlife;
  /** Ohrady (oxen.md) – čtverec, stavba a zvířata v ní. Bez údaje žádné. */
  pens?: ScenePen[];
  /**
   * Les vsi (fields.md – Les vsi) – čtverce polí zarostlé lesem: políčko, povrch při založení
   * a stáří lesa v celých letech (od 30). Stromy jsou mezi překážkami přidanými vsí
   * (`obstacles.added`, id lesa vsi – `isWoodTreeId`). Bez údaje žádný.
   */
  woods?: SceneWood[];
  /**
   * Přirozené louky letošní seče (oxen.md – Seno; ozdobné louky na seno nahradila data):
   * políčko, střed a strana jako u dílu pole a vzhled `meadow` / `mown` / `haystacks` (rozpracované
   * s `work` a `before`). Bez údaje žádné.
   */
  hayMeadows?: SceneHayMeadow[];
  /**
   * Vozy vsi (wagons.md – Vůz): kde stojí (u ohrady), kam dnes jedou a kudy (fáze 3 – scéna je
   * kreslí se spřežením, cart-renderer.ts). Bez údaje žádné.
   */
  carts?: SceneCart[];
  /**
   * Cesty spřežení dne (oxen.md – Spřežení zůstane na poli): výjezd nebo přesun k bloku a návrat
   * do ohrady, jen ve dny, kdy k nim došlo. Bez cest chybí – spřežení je na poli (nebo doma).
   */
  ploughLegs?: ScenePloughLegs;
  /**
   * Vstup vozových tras (`cartWorldOf` z jádra) – z něj a z cílů (`SceneCart.goal`,
   * `ScenePloughLegs`) spočítá trasy prohlížeč (cart-routes.ts). Jen u vsi s jízdou dne.
   * Změny překážek `'obstacles'` = tytéž jako `obstacles` scény, `fieldsAsScene` – pole se
   * sestaví z polí scény (`cartFieldsOf`), `earthworksAsScene` – valy ze zemních prací scény
   * (`cartEarthworksOf`, u Vlkova 200 kB); nic se neposílá dvakrát.
   */
  cartWorld?: Omit<CartWorld, 'changes'> & {
    changes: CartWorld['changes'] | 'obstacles';
    fieldsAsScene?: true;
    earthworksAsScene?: true;
  };
  /**
   * Zemní práce vozových cest (roads.md – Vozová cesta) – úvozy a náspy: terén scény, síť pěšin
   * a vozů jedou po upraveném terénu (`PathVillage.earthworks`). Bez údaje žádné.
   */
  earthworks?: SceneEarthwork[];
  /**
   * Stojící opevnění (fortifications.md – Brány) – stěny a brány jako na serveru
   * (`pathFortificationsOf` – `PathVillage.fortifications`): náhled vozové cesty a trasy vozů
   * ve scéně projedou jen branou. Bez údaje žádné.
   */
  fortifications?: PathFortification[];
  /**
   * Opevnění vsi – plocha, druh, úseky a brány s obrysem a pásem (fortifications.md – Rozhraní):
   * minimapa, výběr kliknutím, zvýraznění a kontrola umístění dalšího opevnění. Bez údaje žádné.
   */
  forts?: SceneFortification[];
  /**
   * Trasy lidí (paths.md – Trasy) – pěšiny ve scéně vedou po nich. `list` je při dotazu na ves
   * `null`, když klient už má trasy téhož `key` (klient drží poslední – `keepSceneData`).
   */
  routes?: SceneRoutes;
  /** Vyšlapanost (síla pěšin) – `cells` je `null` při dotazu, když klient má týž `day`. */
  wear?: SceneWear;
  /** Střed vsi (dvorec) – vozová cesta se staví od konce blíž k němu (náhled). */
  home?: { x: number; z: number };
  /**
   * Počasí roku, které už je vidět (disasters.md – Ve scéně) – barvy, světlo a sníh scény. Bez
   * údaje normální rok (nebo zlé počasí ještě není vidět).
   */
  weather?: SceneWeather;
  /**
   * Krupobití (disasters.md – Kroupy, Ve scéně) – jen v jeho den a po něm do konce roku (pruh
   * potlučených polí do žní). Nikdy budoucí rozpis.
   */
  hail?: SceneHail;
  /** Povodeň (disasters.md – Povodeň potoka, Ve scéně) – jen od jejího dne do konce bahna. */
  flood?: SceneFlood;
  /**
   * Požár (disasters.md – Požár, Hašení – řetěz s vědry, Ve scéně) – jen v jeho den: hořící
   * stavby a řetěz s vědry. Nikdy budoucí rozpis.
   */
  fire?: SceneFire;
  /**
   * Smršť (disasters.md – Smršť, Ve scéně) – jen v její den a po něm do konce roku: trychtýř,
   * ztmavení, polehlá pole a rozmetané stohy ve stopě, padlé kmeny. Nikdy budoucí rozpis.
   */
  tornado?: SceneTornado;
}

/**
 * Smršť vsi pro scénu: den (pořadí dne světa), síla, stopa (`disasters.tornado` z jádra) a prvních
 * pár dní vývraty – id stromů vrstvy překážek, které leží jako padlé kmeny.
 */
export interface SceneTornado {
  day: number;
  strength: TornadoStrength;
  track: TornadoTrack;
  trunks?: number[];
}

/** Hořící stavba v den požáru: id obydlí, střed, typ a natočení; `started` – tady chytlo. */
export interface SceneBurningHouse {
  id: number;
  x: number;
  z: number;
  type: DwellingType;
  rotation: number;
  started?: true;
}

/**
 * Řetěz s vědry (`disasters.fireFight` z jádra – platí jen v jeho den): bod vody na břehu,
 * hořící stavba, kolik dospělých hasí a rozestup mezi nimi (m) – do 2,5 m si vědra podávají,
 * jinak každý chodí po svém úseku.
 */
export interface SceneFireChain {
  water: { x: number; z: number };
  target: { x: number; z: number };
  people: number;
  spacingM: number;
}

/** Požár vsi pro scénu: den (pořadí dne světa), hořící stavby a řetěz (bez vody chybí). */
export interface SceneFire {
  day: number;
  burning: SceneBurningHouse[];
  chain?: SceneFireChain;
}

/** Krupobití vsi pro scénu: den a pruh (`hailZone` z jádra). */
export interface SceneHail {
  /** Herní den krupobití (pořadí dne světa – `gameDayAt`). */
  day: number;
  strip: HailStrip;
}

/** Povodeň pro scénu: den, výška vody nad hladinou potoka (m) a jarní / letní voda. */
export interface SceneFlood {
  /** Herní den povodně (pořadí dne světa). */
  day: number;
  heightM: number;
  season: 'spring' | 'summer';
}

/**
 * Počasí roku pro scénu (`revealedWeather` z jádra): jen odhalené zlé léto a zima – nikdy seed
 * počasí ani budoucí rok. Normální léto a zima chybí.
 */
export interface SceneWeather {
  /** Rok počasí – scéna ho použije jen ve stejném herním roce. */
  year: number;
  /** Zlé nebo dobré léto, už vidět (sucho od 1. 5., ostatní od 1. 6.). */
  summer?: Exclude<SummerWeather, 'normal'>;
  /** Zlá zima, už vidět (holomráz od 1. 2., dlouhá zima od 1. 3.). */
  winter?: Exclude<WinterWeather, 'normal'>;
  /** Síla zlého léta 0–1 (sucho 0,6, kruté sucho 1, deštivé léto 0,6, mokré žně 1). */
  strength?: number;
  /**
   * Ochrana dílů proti odhalenému zlému létu po stupních 0–4 (klíč = id dílu; disasters.md –
   * Ochrana dílu) – díl za stromy je v suchu zelenější. Jen v suchém a mokrém létě, díly se
   * stupněm 0 chybí.
   */
  parts?: Record<string, number>;
}

/** Uložené trasy vsi pro scénu (`VillageRoutes`); `list` null = beze změny oproti klientovi. */
export interface SceneRoutes {
  key: string;
  list: StoredRoute[] | null;
}

/** Vyšlapanost vsi pro scénu (`RoadWear` bez práce); `cells` null = beze změny oproti klientovi. */
export interface SceneWear {
  day: number;
  /** Strana políčka vyšlapanosti (`RoadWear.cellM`) – chybí u políček 7,5 m z doby před převodem. */
  cellM?: number;
  cells: string | null;
}

/**
 * Dvůr dílny ve scéně (production-chains.md – Kovář; crafts.md – Hlína hrnčíře; stupně 0–3 –
 * `yardStage` ve village-view-crafts.ts): kovář dnes taví v redukční peci před kovárnou (`smelt`
 * – s měchařem `bellows`, jinak sám), překovává houbu na hřivny (`refine`), nebo kove nástroje
 * (`forge`); houba z tavby (`bloom`) a hromádka hřiven (`bars`) u kovárny; u hrnčíře hlína v jámě
 * před dílnou (`clay`) a šlapání hlíny (`treading` – hrnčíř dnes vyrábí).
 */
export interface SceneCraftYard {
  task?: 'smelt' | 'refine' | 'forge';
  bellows?: true;
  bloom?: number;
  bars?: number;
  clay?: number;
  treading?: true;
  /**
   * Tesař (wagons.md – Tesař; villagers.md – Fáze činností, Tesař): rozdělaný vůz u dílny po
   * fázích stavby – 1 korba bez kol na špalcích, 2 korba s koly, 3 dřevěná práce hotová (čeká
   * na kování); stupně `CART_BUILD_STAGES` ve village-view-crafts.ts. Bez údaje vůz nevzniká.
   */
  cart?: { kind: CartKind; stage: 1 | 2 | 3 };
}

/** Rudiště kováře ve scéně (crafts.md – Uhlí a ruda kováře). */
export interface SceneOreSite {
  dwellingId: number;
  x: number;
  z: number;
  heapKg: number;
  digging: boolean;
  /** Hliniště hrnčíře (crafts.md – Hlína hrnčíře) – hromada hlíny místo rudy. */
  clay?: true;
}

/** Jáma po kopání rudy (nebo hlíny – `clay`) ve scéně (crafts.md – Uhlí a ruda kováře). */
export interface SceneOrePit {
  x: number;
  z: number;
  kg: number;
  overgrowth: number;
  clay?: true;
}

/** Vůz ve scéně (wagons.md – Vůz). */
export interface SceneCart {
  id: number;
  kind: CartKind;
  /** Kde vůz stojí – u ohrady se spřežením (střed ohrady, m). */
  x: number;
  z: number;
  /** Stav vozu 0–1 po desetinách (opotřebení – po CARTS.lifespanYears doslouží). */
  condition: number;
  /**
   * Co vůz dnes dělá – svoz (`haul`: pole, louka, stromy; i jízdy mimo svoz – uhlí od milíře,
   * osivo na pole, voda od břehu, wagons.md – Co vozy vozí) nebo výprava po stezce (`trade`)
   * s cílem z rozdělení práce dne a nákladem, který veze (snopy ze žně, seno ze seče, klády ke
   * stavbě, zboží výpravy, uhlí a osivo jako zboží, voda v sudech); náklad veze zpátky, osivo tam
   * (`outbound`). Stojí-li u ohrady, null.
   */
  job: {
    activity: 'haul' | 'trade';
    target: LaborShare['target'];
    load: CartLoad;
    outbound?: true;
    /**
     * Kolik kg nákladu vůz veze při jedné jízdě výpravy (wagons.md – Obchod, Opakované jízdy
     * vozu) – jen u výpravy; jinde chybí (kolik veze, hlásí jen druh nákladu).
     */
    loadKg?: number;
  } | null;
  /**
   * Kam vůz dnes jede – cíl jízdy ze serveru, trasu z něj spočítá prohlížeč (`withCartRoutes`
   * – cart-routes.ts). Bez jízdy chybí.
   */
  goal?: CartGoal;
  /**
   * Kudy vůz dnes jede (wagons.md – fáze 3): osa vozové sítě od ohrady k cíli svozu
   * (`cartGoalRoute` – stejné hledání jako `villageCartRoutes`, zjednodušená, po cm), u výpravy
   * od ohrady na zemskou stezku a po ní ke kraji mapy. Počítá ji prohlížeč z `goal` – server ji
   * neposílá. Bez jízdy, nebo když vůz k cíli nedojede, chybí – vůz stojí u ohrady.
   */
  route?: { x: number; z: number }[];
  /**
   * Svoz snopů s hotovým humnem (villagers.md – Fáze činností; Zjednodušení a co chybí): od konce
   * `route` (pole) plný k humnu (`drop` – kde skládá) a odtud prázdný zpět k ohradě – osa vozové
   * sítě z `goal.via`.
   * Bez humna, nebo když k němu vůz nedojede, chybí – vůz veze snopy zpět k ohradě jako dřív.
   */
  viaRoute?: { points: { x: number; z: number }[]; drop: { x: number; z: number } };
}

/**
 * Náklad vozu na cestě zpátky (u výpravy tam i zpět, osivo tam); voda v sudech – sudy jsou na voze
 * tam i zpět (wagons.md – Co vozy vozí); ruda z rudiště (crafts.md – Uhlí a ruda kováře).
 */
export type CartLoad = 'sheaves' | 'hay' | 'logs' | 'goods' | 'water' | 'ore' | 'clay' | 'apples';

/** Čtverec lesa vsi ve scéně (fields.md – Les vsi). */
export interface SceneWood {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  /** Les z natočeného pole (fields.md – Natočené stavby) – mřížka pole a natočení čtverce. */
  grid?: SquareGrid;
  rotation?: number;
  surface: FieldSurface;
  /** Stáří lesa v celých letech – stromy rostou do 70 let (VILLAGE_WOOD). */
  age: number;
}

/** Políčko přirozené louky v seči pro scénu. */
export interface SceneHayMeadow {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  look: FieldLook;
  work?: number;
  before?: FieldLook;
}

/**
 * Ohrada ve scéně: políčko (střed a strana jako u pole), průběh stavby 0–1 (`built` hotová)
 * a zvířata v ní – voli spřežení (když dnes neorá – orbu ukazuje `labor`), telata ve výcviku
 * a krávy (v zimě).
 */
export interface ScenePen {
  id: number;
  /**
   * Druh zvířat ohrady (oxen.md – Ohrady podle druhu); bez údaje (ukázky) jako u starých ohrad –
   * se spřežením nebo výcvikem spřežení, jinak skot (`scenePenSpecies`).
   */
  species?: PenSpecies;
  /** První čtverec ohrady (přístřešek a jesle) v mřížce `grid`; bez ní políčko krajiny. */
  cell: TileCell;
  /**
   * Další čtverce ohrady (`pending` – rozšíření ve stavbě, plot kolem nich se teprve staví); bez
   * údaje jen první.
   */
  extraSquares?: { cell: TileCell; x: number; z: number; pending?: true }[];
  /**
   * Kolik zvířat svého druhu v ohradě stojí v noci (oxen.md – Na noc v ohradě, `penOccupancy`) –
   * pro zahánění stád ve scéně (den a noc); u spřežení voli a telata. Bez údaje 0.
   */
  night?: number;
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez údaje mřížka krajiny. */
  grid?: SquareGrid;
  x: number;
  z: number;
  size: number;
  /** Natočení čtverce natočené ohrady (rad); bez údaje 0. */
  rotation?: number;
  built: boolean;
  progress: number;
  /** Rozšíření ve stavbě (čtverce `pending`) – průběh 0–1; bez rozšíření chybí. */
  extension?: number;
  oxen: number;
  trainees: number;
  cows: number;
  /**
   * Koně ohrady koní (horses.md – Ve scéně; jen `species: 'horse'`): id, věk (hříbě / klisna /
   * jezdecký kůň – `horseKind` z jádra) a jezdec, který na koni jezdí. Kde stojí (ohrada,
   * pastva, pod jezdcem), rozhoduje scéna z těchto údajů a z roku – `penHerds`, `grazingHorses`.
   */
  horses?: { id: number; kind: HorseKind; riderId?: number }[];
  /** Stav hotové ohrady 0–1 (abandonment.md – rozpad); jen pod 1, bez údaje celá. */
  condition?: number;
  /**
   * Hotová ohrada bez zvířat (spřežení, výcvik, zimní krávy) – krmit se do ní nechodí (síť
   * pěšin jako na serveru – `PathVillage.pens`). Ohrada se zvířaty údaj nemá.
   */
  stocked?: false;
  /**
   * Stoh sena u ohrady (villagers.md – Fáze činností, Rolník: odvoz sena na stoh) – stupeň 0–3
   * zásoby sena vsi na hotovou ohradu (`HAY_STACK_KG` ve village-view-buildings.ts): po svozu
   * roste, přes zimu ubývá, 0 = stoh není. Bez údaje plný stoh (ukázky, starší data).
   */
  hay?: number;
}

/**
 * Pevná cesta pro scénu (roads.md): osa, stupeň, mokřina a brody na ose a rozestavěné
 * vylepšení (na jaký stupeň a průběh samotné stavby bez kácení 0–1 – fáze staveniště).
 */
/** Zemská stezka ve scéně (trade.md) – osa od dvorce ke kraji mapy. */
export interface SceneTrail {
  id: number;
  direction: Direction8;
  points: { x: number; z: number }[];
  built: boolean;
}

/**
 * Výprava k sousedovi pro karavanu ve scéně (trade.md – Ve scéně, `scene/caravan.ts`; i skupina
 * nákupu u souseda – crafts.md, Nákup u sousedů): stezka (bez ní čára krajinou ke kraji mapy),
 * kolik lidí jde (nosiči, s vozy honáci a pomocníci – `cartCrew` na vůz), vozy (id), kdo odchází
 * k sousedovi a kdo s výpravou přijde (pohlaví a věk z jádra), jestli se nese náklad tam a zpátky,
 * postup 0–1 na konci dne `day`, denní přírůstek postupu (dnešní tempo, výprava vyslaná dnes plné)
 * a podíl cesty na mapě (bez dne za krajem mapy).
 */
export interface SceneExpedition {
  /** Výprava (id z jádra), nebo skupina nákupu u souseda (`purchase:<směr>:<den>`). */
  id: number | string;
  /** Hotová zemská stezka, po které karavana jde; null – jde po čáře `line`. */
  trailId: number | null;
  /**
   * Cesta krajinou bez stezky – od vsi rovně ke kraji mapy (nákup u souseda – crafts.md); jen
   * s `trailId` null.
   */
  line?: { x: number; z: number }[];
  porters: number;
  carts: number[];
  cartCrew: number;
  /** Kolikrát vozy výpravy jedou tam a zpět; `progress` a `rate` platí pro právě běžící jízdu. */
  trips?: number;
  leaving: { sex: 'male' | 'female'; age: number }[];
  coming: { sex: 'male' | 'female'; age: number }[];
  carriesOut: boolean;
  carriesBack: boolean;
  /**
   * Dobytek, který jde s karavanou po svých (trade.md – Dobytek ve třech druzích): tam prodaný,
   * zpátky koupený – krávy a voli (mladí i vycvičení). Chybí = žádný.
   */
  cattle?: { out: { cows: number; oxen: number }; back: { cows: number; oxen: number } };
  progress: number;
  rate: number;
  day: number;
  /**
   * Herní den, kdy právě běžící cesta začala – scéna karavanu hraje ve skutečném čase od začátku
   * toho dne (scene/caravan.ts – `caravanTimeline`). Chybí (ukázky) = `day`.
   */
  startDay?: number;
  onMap: number;
  /**
   * Co je to za cestu (villagers.md – Výběr postavy): výprava k sousedovi, nákup u souseda, nebo
   * cesta pro kování k vozu; do které vsi (jméno) a u kování kdo jde (id tesaře nebo syna – jeho
   * postava jde s karavanou). Bez údaje (ukázky) se neví.
   */
  trip?: { kind: 'trade' | 'purchase' | 'iron'; to: string; travellerId?: number };
}

/** Křižovatka pro scénu – data jádra beze změny. */
export type SceneJunction = RoadJunction;

export type SceneRoad = Pick<
  Road,
  | 'id'
  | 'points'
  | 'grade'
  | 'unbridged'
  | 'ground'
  | 'openEnds'
  | 'cart'
  | 'swath'
  | 'lined'
  | 'abandoned'
> & {
  /**
   * Bledé kusy zarůstající cesty (paths.md – Zarůstání): střed kusu a krytí pásu 0–1 (na desetiny –
   * od poloviny plného stavu úměrně klesá). Plné kusy chybí; bez zarůstání pole chybí.
   */
  fade?: { x: number; z: number; strength: number }[];
  /**
   * Rozestavěné vylepšení úseku – stupeň a průběh 0–1 na tomto úseku (vylepšení cesty hráče jde
   * po úsecích – `roadUpgradeProgress`); `fromEnd` – úsek leží v cestě obráceně, práce jde od
   * konce jeho osy.
   */
  upgrade?: { grade: RoadGrade; progress: number; fromEnd?: true };
  /**
   * Loňské jízdy vozů po úseku (jízd za den, na setiny – `Road.cartTraffic`) – náhled vozové cesty
   * podle nich váží čas jízdy (roads.md – Vozová cesta). Bez vozů chybí.
   */
  cartTrips?: number;
};

/**
 * Zemní práce vozové cesty pro scénu (roads.md – Vozová cesta): profil osy, brody, hotová délka
 * po celých úsecích (`reachedM` – terén sítě pěšin a vozů jako na serveru) a podle průběhu stavby
 * (`shownM` – terén, svahy a vytyčení ve scéně), úseky stavby se stářím (svahy úvozu a náspu
 * zarůstají trávou – celé roky; null = ještě se staví) a jestli se ještě staví.
 */
export interface SceneEarthwork {
  id: number;
  profile: RoadProfilePoint[];
  fords?: number[];
  reachedM: number;
  shownM: number;
  pieces: { toM: number; ageYears: number | null }[];
  building?: true;
  /** Stavba, která zemní práci dělá (cíl práce `wagon` nese její id) – jen když se staví. */
  constructionId?: number;
  /**
   * Celé roky od chvíle, kdy zemní práce přestala patřit cestě (přestavba sítě – terén zůstává,
   * svahy zarůstají; `RoadEarthwork.abandonedDay`); u zemní práce vozové cesty chybí.
   */
  abandonedYears?: number;
}
/** Strom u pevné cesty pro scénu – poloha, druh a vzhled v den pohledu (`roadTreeLook`). */
export type SceneRoadTree = Pick<RoadTree, 'id' | 'x' | 'z' | 'species'> & RoadTreeLook;
/** Jabloň u pevné cesty pro scénu – stadium, velikost stromu 0–1 (po setinách) a plody. */
export interface SceneRoadApple {
  id: number;
  roadId: number;
  x: number;
  z: number;
  stage: RoadAppleStage;
  growth: number;
  fruit: boolean;
}

/**
 * Posvátný dub ve scéně: id stromu z vrstvy překážek a kmen. `growth` = násobek velikosti dubu
 * (a obětin u kmene) – ušetřené duby se postupně zvětší (`sacredOakGrowth`, jen vzhled; souš od
 * uschnutí už neroste); bez údaje 1. `snag` – dub uschl, místo stromu stojí posvátná souš
 * (obětiny u ní zůstávají). `sizeM` – velikost dubu (výška modelu × měřítko) pro souš a padlý
 * kmen; bez údaje odhad.
 */
export interface SceneSacredOak {
  id: number;
  x: number;
  z: number;
  growth?: number;
  snag?: true;
  sizeM?: number;
}

/**
 * Posvátná místa pro scénu: ušetřené posvátné duby (id stromu z vrstvy překážek a kmen – obětiny
 * u kmene), dubové háje (id středového dubu, střed a čtverce s jejich středy a stranou – kamenný
 * kruh a obětiny na okraji) a modly a svatyně (hotové i rozestavěné – id stavby; `progress` je
 * průběh samotné stavby bez kácení dubů 0–1 pro fáze staveniště, vytyčení je vidět od 0).
 */
export interface SceneSacred {
  /** Živé posvátné duby a posvátné souše. */
  oaks: SceneSacredOak[];
  /**
   * Padlé posvátné souše (happiness.md – Posvátný dub): místo už není posvátný dub – strom se
   * skryje a leží padlý kmen. Bez údaje žádné.
   */
  fallenOaks?: SceneSacredOak[];
  groves: {
    id: number;
    x: number;
    z: number;
    squares: { cell: TileCell; x: number; z: number; size: number }[];
  }[];
  buildings: {
    id: number;
    kind: SacredBuildingKind;
    position: Position;
    built: boolean;
    progress: number;
    /**
     * Stav hotové stavby 0–1 (abandonment.md – chátrání, structure-decay.ts) – jen pod 1; bez
     * údaje celá.
     */
    condition?: number;
    /** Opuštěná stavba – chátrá (u svatyně vyhasnou ohniště). Bez údaje navštěvovaná. */
    abandoned?: true;
    /**
     * Vesničané stavbu opravují (abandonment.md – Oprava) – stav roste s prací, ohniště svatyně
     * zůstanou studená až do konce opravy. Bez údaje se neopravuje.
     */
    repairing?: true;
  }[];
  /**
   * Zbytky padlých model a svatyní (abandonment.md – Následky): padlá modla na zemi, zarostlý
   * příkop svatyně – jak zarostly 0–1 (`overgrowth`, po 5 %). Bez údaje žádné.
   */
  ruins?: { id: number; kind: SacredBuildingKind; position: Position; overgrowth: number }[];
}

/**
 * Co je na dílu pole vidět (fields.md – Co hráč vidí): rozrytý drn při zakládání (`bare`),
 * zorané (`plowed`), zavláčené a oseté (`sown`), vzcházející (`sprouted`), zelené (`green`)
 * a zralé obilí (`ripe`), žeň s panáky snopů (`harvesting`), strniště (`stubble`). Úhor: mladý
 * (1–2 roky) je strniště s plevelem, kde se pase (`young-fallow`), spasená pastvina (`pasture`);
 * úhor ve stadiu louky se kosí na seno (Martin) – vysoká tráva na jaře (`meadow`), posečená
 * s řádky sena a kupkami (`mown`), otava se stohy, které přes podzim a zimu mizí (`haystacks`).
 * Nepasený a nesečený příloh zarůstá (fields.md – Zarůstání): křoviny (`shrubs`) a mladý les
 * (`young-forest`) – bez obtisku pole, roste na něm keř a stromky (`overgrowth` dílu). Klučení
 * lesa (forest.md – Klučení lesa pro pole – postup): paseka s pařezy a větvemi (`slash`)
 * a spálenina s popelem (`burnt`).
 */
export type FieldLook =
  | 'bare'
  | 'plowed'
  | 'sown'
  | 'sprouted'
  | 'green'
  | 'ripe'
  | 'harvesting'
  | 'stubble'
  | 'young-fallow'
  | 'pasture'
  | 'meadow'
  | 'mown'
  | 'haystacks'
  | 'shrubs'
  | 'young-forest'
  | 'slash'
  | 'burnt';

/**
 * Díl pole ve scéně – políčko krajiny `cell`, jeho střed (x, z) ve světě, strana políčka `size`
 * v m a stadium. Vzhled (`look`, `work`, `before`) počítá herní jádro po čtvercích – práce mění
 * díl, až když k němu dojde (fronta práce: jeden rozpracovaný díl na úlohu; `fieldPartLooks`
 * v jádru). Bez `look` (starší příloh – pastvina a louka na seno) ho scéna odhadne ze stadia
 * a data (`estimateFieldLooks` ve field-look.ts).
 */
export interface SceneFieldPart {
  /** Id dílu v herním jádru – podle něj postavy najdou díly z fronty práce (`SceneLaborShare.parts`). */
  id?: number;
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  /**
   * Natočení čtverce natočeného pole (rad, po 15° – fields.md, Natočené stavby); `cell` je pak
   * čtverec v mřížce pole. Bez údaje 0 – díl je políčko krajiny.
   */
  rotation?: number;
  stage: PartStage;
  /** Co je na dílu vidět; u rozpracovaného dílu vzhled hotové části. */
  look?: FieldLook;
  /**
   * Rozpracovaný díl: kolik práce dnešní úlohy je na něm hotovo 0–1 – hotová část řádků má
   * `look`, zbytek `before`. Zakládaný díl s 0 je jen vytyčený (kolíky a provázek).
   */
  work?: number;
  /** Vzhled nehotové části rozpracovaného dílu; bez údaje povrch před prací (louka u zakládání). */
  before?: FieldLook;
  /**
   * Den dohoření paseky (forest.md – Klučení lesa pro pole – postup) – spálenina pak ještě
   * doutná (`isSmoldering`). Bez údaje díl nehořel.
   */
  burnedDay?: number;
  /**
   * Roky přílohu bez pastvy a seče (fields.md – Zarůstání) – podle nich ve scéně rostou keře
   * a stromky (hustota a velikost). Jen u přílohu, který zarůstá (aspoň rok).
   */
  overgrowth?: number;
  /**
   * Příloh ve fázi louky: pasou se na něm stáda (`pastureGrazedParts` – nejbližší napřed). Kam
   * stáda nedojdou, tam se ve scéně nepase a pasáček nechodí. Bez údaje se pase všude.
   */
  grazed?: boolean;
  /**
   * Plodina osetého dílu, když to není obilí – `legume` (hrách a čočka – fields.md,
   * Luštěniny), `flax` (len – fields.md, Len): zelené, zralé a sklizené luštěniny i len vypadají
   * jinak než obilí. Bez údaje obilí.
   */
  crop?: 'legume' | 'flax';
  /**
   * Osetý ozim (fields.md – Ozim a jař) – po holomrazu řídne a prosvítá hlína (disasters.md – Ve
   * scéně). Bez údaje jař nebo jiná plodina.
   */
  winter?: true;
  /** Zelený len v červnu kvete – pole zmodrá (fields.md – Len, Co hráč vidí). */
  bloom?: true;
  /**
   * Kousky dílu, které cesta oddělila od pole a zůstaly loukou (roads.md a fields.md – Cesta
   * přes pole; `FieldPart.roadCut` – řádky buněk po ROAD_LAND.cells bitech v mřížce dílu): scéna
   * na nich nekreslí obtisk, obilí ani korunu porostu. Bez údaje žádné.
   */
  roadCut?: number[];
  /**
   * Díl plodiny, kterou orá spřežení (oxen.md – Co nejdelší brázda): osa brázd v mřížce pole
   * (`x`, `y`) a směr, kterým orba (a setí za ní) postupuje napříč (+1 rostoucí souřadnice
   * mřížky, −1 klesající) – díly pásu se orají spolu, pruh po pruhu. Bez údaje práce jde od vsi.
   */
  furrow?: { axis: 'x' | 'y'; sweep: 1 | -1 };
  /**
   * Díl plodiny, kterou orá spřežení: vzhled před orbou (strniště, drn pastviny…) – ladicí orba
   * za den z něj kreslí ranní stav dílů dnešní orby (plough-day.ts).
   */
  unploughed?: FieldLook;
}

/**
 * Podíl práce dne pro postavy. U polních prací může nést díly z fronty práce (`parts` – id
 * dílů v pořadí: nejdřív rozpracovaný, pak ty, na které práce přijde) – postavy pak pracují
 * přesně tam; bez nich je scéna odhadne z `work` a vzhledu dílů.
 */
export type SceneLaborShare = LaborShare & {
  parts?: readonly number[];
  /**
   * U orby ke každému dílu `parts`: kolik orby dílu bylo hotovo na začátku a na konci dne (0–1) –
   * scéna podle toho projede celou dnešní orbu (oxen.md – Orba za herní den).
   */
  progress?: readonly (readonly [number, number])[];
};

/**
 * Rozdělení práce posledního dne pro postavy: člověkodny po činnostech a místech (na setiny),
 * lidé podle věku a herní den s měsícem (v zimě je venku méně lidí; podle dne se ve scéně kosí
 * a pase na úhoru).
 */
export interface SceneLabor {
  day: number;
  month: number;
  /**
   * Lidé vsi podle věku a – když jsou známí – podle pohlaví (kinship.md): postavy ve scéně jsou
   * muži a ženy v poměru, jaký ves má (`villager-plan.ts`); bez údaje půl na půl.
   */
  people: { children: number; adults: number; elders: number } & Partial<FamilyCounts>;
  /**
   * Podíly práce dne – práce vsi i práce bokem (dojení, péče o zvířata a domácí výroba žen,
   * denní minimum, které pokryli starší – `LaborDay.aside`; population.md – Práce), jen pro postavy.
   */
  shares: SceneLaborShare[];
  /**
   * Výrostci 7–13 let, kteří dnes pasou (diet.md – Pasáci) – postavy u stád; starší (`elders`)
   * a dospělí pasáci (podíl `herding`) jen v rozdělení práce z doby před 19. 10. 2026. Bez údaje
   * (dřívější rozdělení práce) pasou děti.
   */
  herders?: { children: number; elders?: number };
  /**
   * Kusy poražené dnes (`LaborDay.slaughterHeads` – zimní den, 1. 11., nouzová porážka, porážka
   * pro seno; i zlomky kusů): scéna z nich udělá stanoviště porážky. Bez údaje se neporáželo.
   */
  slaughter?: Partial<Record<HerdSpecies, number>>;
  /**
   * Obydlené domácnosti pro provoz na cestách (villagers.md – Provoz na cestách): id obydlí, kolik
   * v něm bydlí lidí (cest pro vodu – WATER_FETCHING) a jakou část vody mu dnes přivezl vůz v sudech
   * (0–1 po desetinách – wagons.md, Co vozy vozí; bez údaje nic). Bez údaje (dřívější pohled) se
   * lidé rozdělí na obydlí rovným dílem.
   */
  homes?: SceneLaborHome[];
  /**
   * Lidé vsi (villagers.md – Výběr postavy): id, věk, pohlaví, domácnost a role – scéna každé
   * postavě přiřadí skutečného člověka (villager-roster.ts) a panel postavy ukáže, kdo to je
   * a co dělá. Bez údaje (dřívější pohled, ukázky) jsou postavy bez lidí a nejdou vybrat.
   */
  persons?: ScenePerson[];
  /**
   * Vojvodova rodina dne (lord.md – Ve scéně; z `LaborDay.lord` a `trainingFamily`): obydlí
   * vojvody, kdo dnes cvičí na dvorku (hodiny podle věku z jádra – `trainingHours`) a ženy, které
   * vedou domácnost dvorce. Kdo je dnes na poli, tu není – je mezi ostatními. Chybí, když rodina
   * pracuje jako ostatní (i dřívější rozdělení práce).
   */
  lord?: SceneLord;
  /**
   * Poslední kování jezdeckých koní za `SHOEING_VIEW_DAYS` dní (horses.md – Kování, Ve scéně; z jádra
   * `shoeingDay`): vlastní kovář dojde od kovárny k ohradě, cizí kovář přijde ze směru souseda
   * a stejnou cestou odejde – ve skutečném čase od začátku dne kování (villagers.md – Činnosti od
   * začátku do konce). Bez údaje se nekuje.
   */
  shoeing?: SceneShoeing;
}

/** Kování ve scéně (`SceneLabor.shoeing`). */
export interface SceneShoeing {
  /** Herní den kování – scéna ho hraje ve skutečném čase od začátku toho dne. */
  day: number;
  /** Vlastní kovář (z kovárny vsi), jinak kovář ze sousední vsi. */
  own: boolean;
  /** Okovaní koně – ohrada (id) a kůň (id), v pořadí kování. */
  horses: { pen: number; id: number }[];
  /** Cizí kovář jde po hotové zemské stezce (id)… */
  trailId?: number;
  /** …jinak krajinou po čáře od vsi ke kraji mapy (body, první u vsi). */
  line?: { x: number; z: number }[];
}

/** Vojvodova rodina dne ve scéně (`SceneLabor.lord`). */
export interface SceneLord {
  /** Obydlí vojvody (dvorec – id obydlí). */
  home: number;
  /** Cvičící muži a chlapci – id a hodiny výcviku dne (luk, boj, jízda). */
  trainees: { id: number; bow: number; combat: number; riding: number }[];
  /** Ženy rodiny u dvorce (id). */
  household: number[];
  /** Vojvoda (id) – mimo výcvik stojí a chodí jako vladař (úloha 10 scény). */
  lordId?: number;
  /**
   * Návštěvy vedlejších manželek (lord.md – Rod vojvody, Manželky; jen vzhled): vojvoda (id) jde
   * po výcviku k obydlí manželky a za čas se vrátí – manželky mimo dvorec (`homes`, obydlí v pořadí
   * podle id manželky) se střídají po cyklech dne rodiny ve skutečném čase (lord-day.ts). Jen když
   * vojvoda dnes cvičí.
   */
  visit?: { lordId: number; homes: number[] };
  /**
   * Jezdci dne (horses.md – Kdy a kam se jezdí, dokud není lov; z jádra `lordRides`): kdo jede, na
   * kterém koni (id), výcvik koně a hodiny jízdy dne; vojvoda první. Jen cvičící (ne na poli). Bez
   * údaje se dnes nejezdí – koně stojí v ohradě.
   */
  riders?: SceneRide[];
  /** Dnes jedou jezdci po hotové zemské stezce (id) k hranici mapy místo objížďky polí. */
  borderTrailId?: number;
  /** Doprovod výpravy, která dnes vyráží – jezdec po její stezce k hranici mapy a zpět. */
  escort?: SceneRide & { expeditionId: number; trailId: number };
}

/** Jezdec na koni ve scéně (`SceneLord.riders`). */
export interface SceneRide {
  /** Člověk (jezdec). */
  id: number;
  /** Kůň (id koně ohrady koní). */
  horseId: number;
  /** Výcvik koně 0–100. */
  training: number;
  /** Hodiny jízdy dne. */
  hours: number;
}

/** Domácnost v provozu na cestách (`SceneLabor.homes`). */
export interface SceneLaborHome {
  id: number;
  people: number;
  cartWater?: number;
}

/**
 * Pozemek obydlí ve scéně – políčko se středem a stranou jako čtverec pole a varianta. Natočený
 * pozemek (fields.md – Natočené stavby) má střed čtverce a natočení `rotation` (rad, po 15°) –
 * celý pozemek i s plotem, záhony a brankou je otočený; `cell` je pak políčko pod středem.
 */
export interface ScenePlot {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  variant: PlotVariant;
  rotation?: number;
  /** Dvůr dvorce vojvody (trade.md) – druhé políčko pozemku a jeho střed; jinak chybí. */
  yard?: { cell: TileCell; x: number; z: number };
}

/** Pozemek obydlí ze stavu vsi pro scénu (střed políčka ve světě, u dvorce i dvůr). */
export function scenePlot(landscape: Landscape, plot: DwellingPlot): ScenePlot {
  if (plot.square && !plot.yard) {
    return {
      cell: { x: plot.cell.x, y: plot.cell.y },
      x: plot.square.x,
      z: plot.square.z,
      size: landscape.cellSizeM,
      variant: plot.variant,
      rotation: plot.square.rotation,
    };
  }
  const center = tileCenterWorld(landscape, plot.cell.x, plot.cell.y);
  const yard = plot.yard ? tileCenterWorld(landscape, plot.yard.x, plot.yard.y) : null;
  return {
    cell: { x: plot.cell.x, y: plot.cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    variant: plot.variant,
    ...(plot.yard && yard
      ? { yard: { cell: { x: plot.yard.x, y: plot.yard.y }, x: yard.x, z: yard.z } }
      : {}),
  };
}

/**
 * Milíř uhlíře ve scéně (crafts.md – Milíř u skácených buků) – fáze, průběh a uhlí (`SceneKiln`).
 */
export interface SceneKilnState {
  /**
   * Fáze: kácení a příprava dřeva (hromada polen), stavba, pálení (kouří), vypálený milíř, který
   * se rozebírá podle odběru kováře.
   */
  stage: KilnStage;
  /** Průběh fáze 0–1 (stavba po fázích staveniště milíře, pálení po dnech). */
  progress: number;
  /**
   * Vypálený milíř: podíl uhlí, které v něm zbývá, 0–1 po 2 % – milíř se při rozebírání
   * zmenšuje. Bez údaje celý (ostatní fáze).
   */
  charcoal?: number;
}

/** Milíř uhlíře ve scéně – samostatná stavba u skácených buků (crafts.md – Milíř u skácených buků). */
export interface SceneKiln extends SceneKilnState {
  /** Id milíře (výběr `{ kind: 'kiln', id }`). */
  id: number;
  /** Dílna uhlíře (id obydlí). */
  burnerId: number;
  x: number;
  z: number;
}

/**
 * Milířiště po rozebraném milíři (crafts.md – Milíř u skácených buků): id milíře, střed (m) a jak
 * zarostlo 0–1 (po 5 % – černá uhlíkatá zem za 10 let zaroste).
 */
export interface SceneKilnRemnant {
  id: number;
  burnerId: number;
  x: number;
  z: number;
  overgrowth: number;
}

/**
 * Mohyla na hřbitově pro scénu (cemetery.md – Mohyly podle významu): čtverec hřbitova, první místo
 * mřížky 7 × 8 (sloupec, řada) a velikost – vojvoda a jeho žena `great` (2 × 2 místa, s kůlem),
 * dospělí z dvorce a hlava rodiny `large` (2 místa za sebou), dospělý a dítě z dvorce `normal`,
 * dítě `small`. Čerstvá = z holé hlíny.
 */
export interface SceneGraveMound {
  cell: TileCell;
  column: number;
  row: number;
  size: MoundSize;
  fresh?: true;
}

/** Jak dlouho je mohyla po pohřbu z holé hlíny, než zaroste trávou (herní dny – jen vzhled). */
export const FRESH_MOUND_DAYS = 365;

/** Mohyla ze stavu vsi pro scénu – čerstvá první rok po pohřbu. */
export function sceneMound(m: GraveMound, day: number): SceneGraveMound {
  return {
    cell: { x: m.cell.x, y: m.cell.y },
    column: m.column,
    row: m.row,
    size: m.size,
    ...(day - m.day < FRESH_MOUND_DAYS ? { fresh: true as const } : {}),
  };
}

/** Humno pro scénu (production-chains.md – Humno). */
export interface SceneThreshingFloor {
  id: number;
  position: Position;
  built: boolean;
  /** Průběh stavby 0–1 (hotové 1). */
  progress: number;
  /** Stoh slámy na kraji mlatu 0–1 (`threshingFloorStraw`); chybí = žádný. */
  straw?: number;
  /** Dnes se na humně mlátí – rozprostřené klasy a mlatci (production-chains.md – Humno). */
  threshing?: true;
  /** Vymlácené zrno na humně, které čeká na uložení do jam (kg na desítky); chybí = žádné. */
  grainKg?: number;
}

/**
 * Cesty spřežení dne (oxen.md – Spřežení zůstane na poli): osy vozové sítě (dvoukolák bez
 * nákladu – po cestě, nebo napříč přes neosetá pole), zjednodušené, po cm. `out` – v den výjezdu
 * z ohrady k bloku (nebo přesunu od konce předchozího bloku), `home` – v den návratu od konce
 * bloku do ohrady; `stand` – den bez orby, spřežení na poli stojí u čela orby. Kam spřežení
 * nedojede, chybí.
 */
export interface ScenePloughLegs {
  /**
   * Server: cíle cesty tam a zpět po plodinách – prohlížeč z nich spočítá `out` a `home` (první
   * cíl, kam spřežení dojede – `withCartRoutes`, cart-routes.ts).
   */
  outGoals?: CartGoal[];
  homeGoals?: CartGoal[];
  out?: { x: number; z: number }[];
  home?: { x: number; z: number }[];
  /** Den bez orby, spřežení na poli – kde stojí (díl na čele orby). */
  stand?: { x: number; z: number };
}

/** Divoká zvěř vsi pro scénu (wildlife.md – Ve scéně; `sceneWildlife` ve wildlife-view.ts). */
export interface SceneWildlife {
  /** Kolik kusů ukázat (podle stupně stavu druhu, s mezí scény – `SCENE_WILD_SHOWN`). */
  shown: SceneWildShown;
  /** Měsíc herního dne (1–12) – říje, zima vlků, medvěd duben–listopad, léto na polích. */
  month: number;
  /** Díl s největší škodou letos (jádro `damage.topPartId`, jen v okně škod); jinak chybí. */
  topPartId?: number;
  /** Hejna vran z jádra (`crowFlocks` – podle osetých ha). */
  crowFlocks: number;
  /** Ryby: biomasa ÷ strop (0–1) – kolik hejn ryb v tůních je vidět. */
  fishShare: number;
  /**
   * Lov dne (jádro `hunt.today` – wildlife.md, Lov rodu): cíl, jezdci (člověk a kůň), pěší lovci
   * a celé kusy úlovku (po lovu). Chybí = dnes se neloví.
   */
  hunt?: SceneHunt;
  /** Psi dvorce (celé kusy, jádro `dogs.count`, nejvýš 8). Chybí = dvorec psy nechová. */
  dogs?: number;
  /** Dnes jede jezdecká hlídka (jádro `patrol` dne se silou > 0) – psi běží s objížďkou. */
  patrol?: boolean;
  /** Díly noční hlídky letošní sezóny (jádro `watch.parts`) – ve dne na nich děti s řehtačkou. */
  watchParts?: number[];
  /**
   * Loviště dnešních rybářů (jádro `smallGame.today` – ryby): tůně od nejbližší (`fishingPools`),
   * index jako cíl práce `{ kind: 'pool', index }`. Chybí = dnes se nerybaří.
   */
  pools?: ScenePool[];
}

/**
 * Lov ve scéně (`SceneWildlife.hunt`) – hraje se ve skutečném čase od dne lovu `day` přes víc
 * herních dní (riders.ts – `huntSpan`); scéna si běžící lov pamatuje (activity-memory.ts), i když ho
 * data dalšího dne už nemají. Bez `day` (ukázky) den práce.
 */
export interface SceneHunt {
  day?: number;
  target: 'game' | 'wolves' | 'bear';
  riders: { id: number; horseId: number }[];
  foot: number[];
  kills: number;
}

/** Tůň – bod osy u nejhlubšího místa, směr toku a polovina šířky vody vlevo a vpravo (m). */
export interface ScenePool {
  x: number;
  z: number;
  flowX: number;
  flowZ: number;
  halfLeft: number;
  halfRight: number;
}

/** Viditelné kusy zvěře ve scéně. */
export interface SceneWildShown {
  stags: number;
  hinds: number;
  calves: number;
  boars: number;
  piglets: number;
  hares: number;
  foxes: number;
  wolves: number;
  bears: number;
}
