// Typy stavu vsi – Kronika a rozdělení práce dne.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { ConstructionKind, LandTaker } from './types-construction';
import type { Craft } from './types-crafts';
import type { ChurchWork, MasonCraft } from './types-masonry';
import type { AbandonedStructure, Crop, TileCell, UsableStructure } from './types-land';
import type { HerdSpecies, PenSpecies } from './types-livestock';
import type { AwayKind, DwellingType } from './types-people';
import type { HuntKills, QuarryKind } from './types-wildlife';
import type { FloodLevel, SummerWeather, TornadoStrength, WinterWeather } from './types-disasters';
import type { CartJob, CartKind, JunctionShape } from './types-roads';
import type { OrderGood } from './types-market';
import type { Direction8 } from './types-state';
import type {
  CraftPurchaseGoods,
  CraftPurchasePay,
  ShipmentManifest,
  NewcomerGroup,
  TradeGoods,
  TradePeople,
  TripBy,
} from './types-trade';

/**
 * Postavení člověka v zápisu kroniky v den zápisu (úmrtí, návrat z tažení – Martin 15. 11. 2026:
 * „Ve věku 64 let zemřel sedlák Bořivoj.“; návrh Clauda – population.md, Kronika): `title` – čí je
 * domácnost (dvorec vojvody, dílna řemesla, jinak rolník), u kněze a mistra huti jeho úřad;
 * `kin` – vztah k hlavě domácnosti (hlava, její žena – i žena v čele domu bez muže, rodič, dítě,
 * snacha či zeť, vnouče, jiný člen); `headName` – jméno hlavy, je-li to muž (u rodiče, dítěte,
 * snachy a vnoučete; population.md – Jména).
 */
export interface ChronicleEstate {
  title: 'voivode' | 'farmer' | 'priest' | Craft | MasonCraft;
  /** Žena („selka“, „dcera sedláka“); chybí – muž. */
  female?: true;
  kin: 'head' | 'wife' | 'parent' | 'child' | 'in-law' | 'grandchild' | 'other';
  headName?: string;
}

/** Člověk v zápisu kroniky (návrat z tažení): postavení a jméno (starší zápisy jen u mužů rodu). */
export interface ChroniclePerson {
  estate: ChronicleEstate;
  name?: string;
}

/**
 * Konec cesty v kronice (roads.md – kronika; Martin 14. 11. 2026: „Podél cesty mezi dvorcem
 * a kovárnou byly vysazeny jabloně.“): co na konci cesty hráče leželo v den zápisu – uloží se,
 * ať popis sedí i po pozdější přestavbě sítě (`chronicleRoadEnds`).
 */
export type ChronicleRoadEnd =
  /** Obydlí – druh, u dílny řemeslo. */
  | { kind: 'dwelling'; type: DwellingType; craft?: Craft }
  /** Jiné místo – předpona klíče trasy (`cemetery`, `pen`, `field`, `water`, `wood`, `idol`…). */
  | { kind: 'place'; place: string }
  /**
   * Křižovatka nebo rozcestí (tvar) a nejbližší významné místo u ní (`near` – `roadEndLandmarks`;
   * starší zápisy ho nemají).
   */
  | { kind: 'junction'; shape: JunctionShape; near?: ChronicleLandmark }
  /** Kraj mapy – směr. */
  | { kind: 'edge'; direction: Direction8 }
  /** Jiná cesta bez křižovatky. */
  | { kind: 'road' };

/** Kde leží křižovatka vůči významnému místu: u něj, pod ním (níž), nad ním (výš). */
export type LandmarkRelation = 'at' | 'below' | 'above';

/**
 * Významné místo u křižovatky (D66; Martin 15. 11. 2026: „Podél cesty mezi křižovatkou a rozcestím
 * byly vysazeny jabloně – nešly by ty koncové body líp specifikovat? Třeba poblíž kterého
 * významného místa se nacházejí?“): nejbližší stavba, voda, brána nebo kraj mapy do `LANDMARK_M`
 * („rozcestí u kovárny“, „křižovatka pod dvorcem“, „rozcestí u hranice s Lhotskými“), bez nich
 * poloha vůči vsi („uprostřed vsi“, „na severní straně vsi“, „severně od vsi“).
 */
export type ChronicleLandmark =
  /** Dvorec nebo dílna (řemeslo). */
  | { kind: 'dwelling'; type: DwellingType; craft?: Craft; at: LandmarkRelation }
  /** Stavba nebo voda – `church`, `cemetery`, `threshing-floor`, `pen`, `orchard`, `quarry`, `idol`, `shrine`, `gate`, `water`, `water:river`. */
  | { kind: 'place'; place: string; at: LandmarkRelation }
  /** Kraj mapy – soused v tom směru. */
  | { kind: 'edge'; direction: Direction8 }
  /** Nic z toho blízko: směr od středu vsi (uprostřed vsi bez směru), `outside` = mimo zástavbu. */
  | { kind: 'village'; direction?: Direction8; outside?: true };

/**
 * Brána na konci zbořeného úseku opevnění v kronice (demolition.md – Opevnění): s věží, směr od
 * středu opevnění jen, když je bran stejného druhu víc (`fortGateNotes`).
 */
export interface ChronicleFortGate {
  tower?: true;
  direction?: Direction8;
}

/**
 * Kořist nájezdu (war.md – Kořist): jídlo ze zásob po druzích (kg) a dobytek (kusy). Stejný tvar
 * jde ve schránce (`raid-result`, `campaign-return`) i do kroniky.
 */
export interface RaidLoot {
  grainKg: number;
  legumesKg: number;
  meatKg: number;
  cheeseKg: number;
  livestock: Record<HerdSpecies, number>;
}

/**
 * Kdo se vzal (id ženicha a nevěsty) – u událostí svatby v kronice (kinship.md – Svatba ve scéně:
 * svatebčané ve scéně); události zapsané dřív je nemají.
 */
export interface WeddingCouple {
  groomId?: number;
  brideId?: number;
  /** Jméno ženicha – muže rodu (lord.md – Kde se jméno ukazuje: „Svatba – Bořivoj“); jinak chybí. */
  name?: string;
}

/**
 * Trvalé stavy vsi z upozornění, které se zapisují do kroniky (absence.md – Upozornění vsi do
 * kroniky): stupně hladu (vnořené – hladovějící ves i šetří; šetření jen kvůli osivu je
 * `seed-rationing`), stavby stojí, dílny bez vstupu,
 * stáda bez místa v ohradách (jeden stav za všechny druhy), voli a koně bez místa, koně a psi bez obilí, výmlat bez
 * humna a humno nestačí. Pořadí je pořadí zápisu v jednom dni.
 */
export type LastingNotice =
  | 'rationing'
  /** Ves šetří jen kvůli osivu, které nejí – půst do setí (`VillageState.seedRation`). */
  | 'seed-rationing'
  | 'hungry'
  | 'starving'
  | 'stalled'
  | 'no-charcoal'
  | 'no-ore'
  | 'no-clay'
  | 'no-wood'
  | 'carpenter-no-wood'
  | 'pen-short'
  | 'oxen-short'
  | 'horses-short'
  | 'horses-ungrained'
  | 'dogs-ungrained'
  | 'emergency-threshing'
  | 'threshing-floor-short';

/** Běžící trvalý stav vsi (`VillageState.noticeStates`). */
export interface LastingNoticeState {
  /** Den začátku stavu. */
  since: number;
  /** Začátek už je v kronice. */
  logged?: true;
  /**
   * První den, kdy stav neplatí; kratší přerušení než NOTICE_CHRONICLE_MIN_DAYS stav neukončí
   * (návrh Clauda). Stav, který platí, ho nemá.
   */
  off?: number;
}

/**
 * Zásoba po sklizni v kronice (kronika – Martin 17. 11. 2026: „kolik té plodiny má vesnice celkem
 * a na jak dlouho to vystačí při současném počtu obyvatel“): `kg` – kolik té potraviny má ves po
 * sklizni, `days` – na kolik dní vystačí při `people` lidech (`stockLastsDays`); null – nikdo z ní
 * nejí. Starší zápisy ji nemají.
 */
export interface HarvestStock {
  kg: number;
  days: number | null;
  people: number;
}

export type ChronicleEvent = { day: number } & (
  | { kind: 'village-founded' }
  /**
   * Narodilo se dítě (population.md – Jména): jméno a pohlaví (`female`); syn vojvody, který čeká
   * na jméno od hráče, a starší zápisy bez jména.
   */
  | { kind: 'birth'; name?: string; female?: true; population?: number }
  /** Vojvodovi se narodil syn (lord.md – Rod vojvody) – čeká na jméno od hráče. */
  | { kind: 'line-birth' }
  /** Hráč pojmenoval muže rodu (lord.md – Jména) – jméno je trvalé. */
  | {
      kind: 'line-named';
      name: string;
      /** Koho hráč pojmenoval – vojvodu, nebo syna vojvody; chybí – jiný muž rodu (starší záznam). */
      who?: 'lord' | 'son';
      /** Jméno dal rod, protože hráč do roku nepojmenoval (absence.md – Jména synů). */
      house?: true;
      /** Po kom: dědeček, strýc, praděd, jiný muž rodu; chybí – vygenerované. */
      after?: 'grandfather' | 'uncle' | 'great-grandfather' | 'kinsman';
    }
  /** Vojvodou se stal muž rodu `name` (lord.md – Nástupnictví); bez jména chybí. */
  | { kind: 'lord'; name?: string }
  /**
   * Muž rodu `name` odešel vládnout do vsi `villageName` (seniorate.md – Ves bez muže rodu –
   * dosazení vojvody); píše se ve vsi, odkud odešel.
   */
  | { kind: 'lord-sent'; villageName: string; name?: string }
  /**
   * Zásilka vyrazila do vsi `villageName` jiného hráče (vassalage.md – Doprava a cílová ves) –
   * co veze; `purpose` = popisek (dávka, dar…).
   */
  | { kind: 'shipment-sent'; villageName: string; goods: ShipmentManifest; purpose?: string }
  /** Zásilka z vsi `villageName` dorazila (do vsi, nebo zpět odesílateli – `returned`). */
  | {
      kind: 'shipment-received';
      villageName: string;
      goods: ShipmentManifest;
      purpose?: string;
      returned?: true;
    }
  /**
   * Lidé odešli na čas do vsi `villageName` (vassalage.md – Lidé a robota): `people` lidí, druh
   * `away`, vrátí se nejpozději v den `untilDay`.
   */
  | { kind: 'people-away'; away: AwayKind; people: number; villageName: string; untilDay: number }
  /** Lidé se vrátili domů (robota odpracovaná…) – `people` lidí, druh `away`. */
  | {
      kind: 'people-back';
      away: AwayKind;
      people: number;
      /**
       * Kdo se vrátil z tažení (Martin 15. 11. 2026: „Z tažení se vrátil sedlák Bořivoj.“) – lidé
       * v pořadí id; starší zápisy a jiné druhy bez nich.
       */
      who?: ChroniclePerson[];
      /** Z tažení utekli domů – dezertéři (war.md – Dezerce); chybí – řádný návrat. */
      deserted?: true;
      /** Uprchlíky vrátil domů správce (war.md – Varování: návrat; Úloha 10); chybí – hráč, jiný návrat. */
      steward?: true;
    }
  /** Do vsi přišli hosté z vsi `villageName` – `people` lidí na čas, druh `away`. */
  | { kind: 'guests-came'; away: AwayKind; people: number; villageName: string }
  /**
   * Útěk před vojskem (war.md – Varování, poslové a útěk do hradiště): `people` lidí odešlo skupinou
   * do hradiště `villageName` (bez jména – jméno neznámé).
   */
  | { kind: 'refuge-left'; people: number; villageName?: string }
  /** Skupina uprchlíků došla do lesa na mapě vsi a ukryla se – `people` lidí. */
  | { kind: 'refuge-hidden'; people: number }
  /** Vojsko dostihlo skupinu uprchlíků: `killed` padlo, `led` odvedlo, `captured` zajalo (muži rodu). */
  | { kind: 'refuge-caught'; killed: number; led: number; captured?: number }
  /** Vojsko chytilo posla `name` (bez jména vesničan): padl, odvedlo ho, nebo ho zajalo (muž rodu). */
  | { kind: 'messenger-caught'; fate: 'killed' | 'led' | 'captured'; name?: string }
  /**
   * Do vsi, která už vojvodu má, přišel z jiné vsi rodu muž `name` s rodinou (dosazení vojvody
   * přišlo pozdě) – žije v dvorci jako ostatní muži rodu.
   */
  | { kind: 'line-arrived'; name?: string }
  /**
   * Muž rodu `name` si vzal další manželku z okolí (lord.md – Manželky); bez jména chybí. `estate` –
   * postavení muže v den zápisu, `wife` – jméno ženy (Martin 15. 11. 2026: „Vojvoda Lutobor si vzal
   * Dobravu.“); starší zápisy bez nich. `villageName` / `villageId` – sousední ves, odkud přišla
   * (markets.md – Rozhodnutí plánu 3, body 12 a 15); zápisy smyšleného okolí je nemají.
   */
  | {
      kind: 'extra-wife';
      name?: string;
      estate?: ChronicleEstate;
      wife?: string;
      villageName?: string;
      villageId?: string;
    }
  /**
   * Muž rodu `name` má po smrti hlavní manželky novou hlavní (lord.md – Nová hlavní manželka);
   * `estate` a `wife` jako u `extra-wife` („Dobrava se stala hlavní manželkou vojvody Lutobora.“).
   */
  | { kind: 'main-wife'; name?: string; estate?: ChronicleEstate; wife?: string }
  /** Ženatý muž rodu `name` odešel z dvorce do vlastního domu (lord.md – Synové po sňatku). */
  | { kind: 'son-left-manor'; name?: string }
  /**
   * Ve vsi nezbyl žijící muž rodu (lord.md – Konec rodu) – `name` posledního vojvody vsi, bez
   * jména chybí. Hra končí, až rod nezbude v žádné vsi hráče.
   */
  | { kind: 'line-ended'; name?: string }
  /** Seniorem rodu se stal muž rodu `name` (seniorate.md – Seniorát; zapisuje se do všech vsí rodu). */
  | { kind: 'senior'; name?: string }
  /**
   * Jednání mezi rody (vassalage.md – Vznik a jednání): neutrální záznam do vlastní vsi obou rodů.
   * `self` = jméno hlavy rodu, do jehož vsi se píše, `other` = jméno druhé strany; nabídku
   * a protinávrh posílá ten, kdo je v textu první (`actor`), jinak je záznam stejný pro oba.
   */
  | {
      kind: 'negotiation';
      step:
        | 'offer'
        | 'counter'
        | 'rejected'
        | 'withdrawn'
        // návrh bez odpovědi vypršel (absence.md); `actor` = autor návrhu
        | 'expired'
        | 'terms-accepted'
        | 'aid-gift'
        | 'aid-loan'
        | 'trade-accepted';
      actor: string;
      other: string;
    }
  /**
   * Válka mezi rody (war.md – Začátek války, Konec války): neutrální věcný záznam do kronik obou
   * rodů, bez hodnocení. `actor` = ten, kdo válku začal (`declared`, `ambush`); u `quiet` a `peace`
   * jsou jména obou stran (`other` = druhá strana z pohledu vsi, do které se píše, doplní web).
   */
  | {
      kind: 'war';
      step: 'declared' | 'ambush' | 'quiet' | 'peace';
      actor: string;
      other: string;
    }
  /**
   * Tažení (war.md – Velení a příprava tažení): vojsko vůdce `leader` vyrazilo ze shromaždiště
   * (`set-out`), vrátilo se domů (`returned`), nebo se rozpadlo (`disbanded` – Ú6.12) – věcně, bez
   * hodnocení.
   */
  | { kind: 'campaign'; step: 'set-out' | 'returned' | 'disbanded'; leader: string }
  /**
   * Nájezd (war.md – Co hráč vidí: Kronika) – věcný zápis do kronik obou rodů: vůdce `leader` ze
   * vsi `from` na ves `target`, bez opovědi (`declared` false), padlí, ranění a odvedení obránci
   * a kořist. Jména vsí chybí, když je tažení nezná (starší stav).
   */
  | {
      kind: 'raid';
      leader: string;
      from?: string;
      target?: string;
      declared: boolean;
      fallen: number;
      wounded: number;
      led: number;
      loot: RaidLoot;
    }
  /** Rod se dozvěděl o křesťanství (christianity.md – Objev křesťanství) – ve vsi vojvody. */
  | { kind: 'christianity-known' }
  /**
   * Vojvoda se dal pokřtít (christianity.md – Křest rodu); jméno a postavení jako u žen muže rodu
   * (Martin 15. 11. 2026) – starší zápisy je nemají.
   */
  | { kind: 'lord-baptized'; name?: string; estate?: ChronicleEstate }
  /** Roční obrácení vesničanů na křesťanství (christianity.md – Obrácení). */
  | { kind: 'converted'; count: number }
  /** Pokřtěný vojvoda propustil vedlejší manželky (christianity.md – Jediná manželka). */
  | { kind: 'wives-released'; count: number; name?: string; estate?: ChronicleEstate }
  /** Dohoda z jednání: rod `vassal` přísahal rodu `lord` (jména hlav rodů). */
  | { kind: 'negotiation-accepted'; lord: string; vassal: string }
  /** Vazalství skončilo formálním vypovězením (jména hlav rodů; text je neutrální, bez viníka). */
  | { kind: 'vassalage-renounced'; lord: string; vassal: string }
  /**
   * Roční Odvody (vassalage.md – Roční dialog 1. 11.): vazal `vassal` odvedl pánovi `lord` řádky
   * `parts` (odvedeno z domluveného; `good` je řádek Odvodů – `LevyGood`, `years` – za kolik let).
   */
  | {
      kind: 'levy';
      lord: string;
      vassal: string;
      years: number;
      parts: { good: string; sent: number; agreed: number }[];
    }
  /**
   * Rod `name` neposlechl pána: nesplnil rozsudek, nebo rozpoutal válku přes rozsudek „mír“
   * (vassalage.md – Mír a spory); text je neutrální.
   */
  | { kind: 'disobeyed'; name: string }
  /**
   * Plátce `payer` neposlal příjemci `recipient` celý tribut z míru (war.md – Konec války:
   * neplnění se zapíše, řešení je na hráčích); text je neutrální, bez pána a vazala.
   */
  | { kind: 'tribute-short'; payer: string; recipient: string }
  /** Rod `name` ohlásil průchod vojska (war.md – Pohyb); do kronik obou rodů. */
  | { kind: 'passage-announced'; name: string }
  /** Vazal `name` nepřišel na svolání do války (vassalage.md – Svolání); do kronik obou rodů. */
  | { kind: 'no-show'; name: string }
  /** Rod `blocker` zablokoval rod `blocked` (vassalage.md – Meze); zapisuje se do kronik obou. */
  | { kind: 'blocked'; blocker: string; blocked: string }
  /** Vedlejší manželka odešla z přeplněného dvorce do vlastního domu (lord.md – Manželky). */
  | { kind: 'wife-left-manor' }
  /** Mistr huti odešel (hlad nebo neštěstí) i s rodinou – `people` včetně něj (stone-masonry.md). */
  | { kind: 'master-left'; craft: MasonCraft; people: number; name?: string }
  /** Nejzkušenější pomocník nebo syn se stal mistrem oboru (stone-masonry.md – Noví mistři). */
  | { kind: 'master-promoted'; craft: MasonCraft; name?: string }
  /**
   * `age` – věk zemřelého v celých letech (štěstí: starší ubere méně, happiness.md); starší
   * události bez něj. `cause: 'hunger'` – zemřel hlady (nahromaděný hlad, population.md); jinak
   * bez údaje. `name` – jméno zemřelého (lord.md – Kde se jméno ukazuje, population.md – Jména);
   * starší zápisy ho mají jen u mužů rodu.
   */
  | {
      kind: 'death';
      group: 'child' | 'adult' | 'elder';
      age?: number;
      /**
       * `war` – padl v boji (war.md – Ztráty), `wounds` – zemřel na rány, `beast` – zabila ho šelma
       * na výjezdu (`by`; lord-control.md – Nebezpečí).
       */
      cause?: 'hunger' | 'hunt' | 'flood' | 'tornado' | 'war' | 'wounds' | 'beast';
      /** Šelma, která muže zabila na cestě (`cause: 'beast'`). */
      by?: 'bear' | 'wolves';
      /**
       * Zvěř, na jejímž lovu muž zahynul (`cause: 'hunt'`) – kanec, bachyně, vlk, medvěd; jelen
       * a laň, když lovce zasáhl šíp druhého lovce (plán 2026-11-22-hunting – Rozhodnutí 5).
       * Starší zápisy jen `boar` (divočák) a `bear`.
       */
      prey?: QuarryKind;
      name?: string;
      /** Id zemřelého (vždy spolu s `name`) – den smrti muže rodu pro los nástupnictví hráče. */
      personId?: number;
      /** Postavení a pohlaví zemřelého v den smrti (`chronicleEstate`); starší zápisy bez něj. */
      estate?: ChronicleEstate;
      /** Počet obyvatel vsi po úmrtí (Martin 17. 11. 2026); starší zápisy bez něj. */
      population?: number;
    }
  /** Zemřel poslední člověk – ves vymřela (population.md – Hlad a vymření). */
  | { kind: 'village-extinct' }
  | { kind: 'household-founded'; dwellingId: number }
  | { kind: 'household-merged'; fromDwellingId: number; toDwellingId: number }
  /**
   * Svatba ve vsi (kinship.md – Sňatky) – nevěsta (s vlastními dětmi do 16 let) z domu `from` se
   * přestěhovala k muži do domu `to` (ze stejného domu from = to); `groomMoved` – naopak ženich se
   * přiženil k nevěstě, která drží dům; `widow` – vdávala se vdova (už má děti).
   */
  | ({
      kind: 'marriage';
      fromDwellingId: number;
      toDwellingId: number;
      groomMoved?: true;
      widow?: true;
      /**
       * Domy ženicha a nevěsty před svatbou (id obydlí – kinship.md, Svatba ve scéně: odkud jde
       * průvod); události zapsané dřív je nemají – odvodí se z `fromDwellingId` / `toDwellingId`.
       */
      groomFromDwellingId?: number;
      brideFromDwellingId?: number;
    } & WeddingCouple)
  /**
   * Muž z domu `dwellingId` si přivedl nevěstu z okolí (kinship.md – Sňatky z okolí);
   * `villageName` / `villageId` – sousední ves, odkud přišla (markets.md – Rozhodnutí plánu 3, body
   * 11 a 15); zápisy smyšleného okolí je nemají.
   */
  | ({
      kind: 'bride-from-outside';
      dwellingId: number;
      villageName?: string;
      villageId?: string;
    } & WeddingCouple)
  /**
   * K ženě z domu `dwellingId` se přiženil muž z okolí (kinship.md – Sňatky z okolí); `widow` –
   * k vdově; `villageName` / `villageId` jako u nevěsty.
   */
  | ({
      kind: 'groom-from-outside';
      dwellingId: number;
      widow?: true;
      villageName?: string;
      villageId?: string;
    } & WeddingCouple)
  /**
   * Dcera z domu `dwellingId` se vdala pryč – odešla ze vsi (kinship.md – Sňatky z okolí); `groom` –
   * syn se přiženil pryč; `villageName` / `villageId` – ves, kam odešel (markets.md – Rozhodnutí
   * plánu 3, body 11 a 15).
   */
  | {
      kind: 'married-away';
      dwellingId: number;
      groom?: true;
      villageName?: string;
      villageId?: string;
    }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
      /** Dostavěná řemeslná dílna (crafts.md); u ostatních staveb chybí. */
      craft?: Craft;
      /** Dostavěná vozová cesta (roads.md – Vozová cesta); u ostatních staveb chybí. */
      wagon?: true;
      /** Jabloně u cesty – konce cesty v den výsadby; u ostatních staveb a starších zápisů chybí. */
      roadEnds?: [ChronicleRoadEnd, ChronicleRoadEnd];
      /**
       * Vylepšení cesty (roads.md; Martin 15. 11. 2026: „Vojvoda Lutobor nechal vylepšit cestu
       * mezi dvorcem a potokem.“) – kdo ho nechal udělat: jméno vojvody v den dokončení (`lord`),
       * nebo správce (`bySteward`); starší zápisy bez obojího.
       */
      lord?: string;
      bySteward?: true;
      /** Ohrada – druh zvířat; u ostatních staveb a starších zápisů chybí. */
      penSpecies?: PenSpecies;
      /** Ohrada rozšířená o čtverce (oxen.md – Ohrady podle druhu), ne nová. */
      penExtended?: true;
    }
  /**
   * Zbořený úsek opevnění (demolition.md – Opevnění): plot, palisáda či nástavba valu, nebo
   * srovnaný val (`level`); `logs` klád přišlo na hromadu u cesty. Z rozkazu (`FortDemolitionNote`,
   * starší zápisy je nemají): jméno vojvody v den rozkazu, délka zbořených kusů (m) a brány na
   * koncích úseku po směru hodin (`around` – jediná brána, úsek obejde obvod; bez brány chybí).
   */
  | {
      kind: 'fortification-demolished';
      logs: number;
      level?: true;
      lord?: string;
      lengthM?: number;
      gates?: [ChronicleFortGate, ChronicleFortGate];
      around?: true;
      /** Zbořená brána (demolition.md – Rozhodnutí); chybí = úsek. */
      gate?: true;
    }
  /** Hráč zrušil rozestavěnou stavbu (cancel-construction.ts); dřevo se vrátilo na hromadu. */
  | {
      kind: 'construction-cancelled';
      constructionKind: ConstructionKind;
      craft?: Craft;
      /** Ohrada – druh zvířat; u ostatních staveb a starších zápisů chybí. */
      penSpecies?: PenSpecies;
    }
  /**
   * Opuštěné díly pole (fields.md – Opuštěný díl): kolik dílů vypadlo z osevu a zaroste (osetý až
   * po žních).
   */
  | { kind: 'parts-abandoned'; parts: number }
  /** Opuštěné díly pole se vrátily do osevního postupu (fields.md – Opuštěný díl). */
  | { kind: 'parts-returned'; parts: number }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  /** Domácnost obydlí `dwellingId` si začala stavět nový dům typu `type` (migration.md). */
  | { kind: 'relocation-started'; dwellingId: number; type: DwellingType }
  /** Hráč zrušil rozestavěné přestěhování domácnosti `dwellingId` (migration.md). */
  | { kind: 'relocation-cancelled'; dwellingId: number }
  /** Domácnost se přestěhovala do dostavěného domu – starý dům zůstal prázdný (migration.md). */
  | { kind: 'household-relocated'; fromDwellingId: number; toDwellingId: number }
  /**
   * Domácnosti odešly založit novou ves (migration.md – Odchod do nové vsi): kolik domácností
   * a lidí, na novou mapu i se směrem (na téže mapě bez směru).
   */
  | { kind: 'households-left'; households: number; people: number; direction?: Direction8 }
  /**
   * Syn vojvody odešel s poměrnou částí vsi založit ves (lord.md – Dělení vsi, Nová ves: „Bořivoj
   * odešel založit ves Lhota“): `name` jméno syna, `village` jméno nové vsi (bez něj chybí), kolik
   * celých domácností a lidí s ním odešlo (lidé i s jeho rodinou), na novou mapu i se směrem.
   */
  | {
      kind: 'son-left-village';
      name?: string;
      village?: string;
      households: number;
      people: number;
      direction?: Direction8;
    }
  /**
   * Odešli všichni – ves je opuštěná (migration.md); `reason: 'line-ended'` – rod vymřel a ves
   * zanikla s lidmi jako záznamem (lord.md – Konec rodu).
   */
  | { kind: 'village-abandoned'; reason?: 'line-ended' }
  /** Lidé vyrazili na novou mapu – dorazí v den `arrivalDay` (migration.md – fáze 4). */
  | { kind: 'journey-started'; direction: Direction8; arrivalDay: number }
  /**
   * Sklizeň – plodina, když ves seje ozim i jař (ozim v červenci, jař v srpnu); bez ní jen jař
   * (ves bez ozimu, starší sklizně). `legume` – luštěniny (kg do zásoby luštěnin, ne obilí).
   */
  | { kind: 'harvest'; kg: number; crop?: Crop; stock?: HarvestStock }
  /** Konec sklizně jablek (1. 11.) – kolik kg se sklidilo. */
  | { kind: 'apple-harvest'; kg: number; stock?: HarvestStock }
  /**
   * Sklizeň zahrádek u obydlí (31. 7. – fields.md, Zahrádka u obydlí): souhrn za ves – kg čistých
   * luštěnin (do zásoby luštěnin); `flaxKg` – třený len jen v zápisech z doby lnu na zahrádkách
   * (do 9. 11. 2026).
   */
  | { kind: 'garden-harvest'; legumeKg: number; flaxKg?: number; stock?: HarvestStock }
  /**
   * Při trhání lnu (31. 7.): ves sklidila jen `kg` třeného lnu z `neededKg`, které potřebuje na
   * oděv (fields.md – Len, diet.md – Oděv).
   */
  | { kind: 'linen-short'; kg: number; neededKg: number }
  /**
   * Odvedení z tažení se usadili ve vsi (markets.md – Rozhodnutí plánu 5, bod 1): `slaves` pohanů
   * se stalo otroky, `free` křesťanů zůstalo svobodných; počítají se jen ti, kdo dostali dům.
   */
  | { kind: 'led-settled'; slaves: number; free: number }
  /** Podzimní porážka (diet.md – 1. 11.): kolik kg masa a kolik kusů kterého druhu. */
  | {
      kind: 'slaughter';
      kg: number;
      animals: Partial<Record<HerdSpecies, number>>;
      /** Z toho maso kusů, které se porážejí po dnech přes zimu (diet.md – Porážka v zimě). */
      fresh?: number;
    }
  /**
   * Nouzová porážka (diet.md – Nouzová porážka): výhled jídla do sklizně nevycházel, ves porazila
   * zvířata navíc – kolik kg masa a kusů (na setiny) kterého druhu.
   */
  | { kind: 'emergency-slaughter'; kg: number; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Zbytek uzeného masa se zkazil (diet.md – Trvanlivost masa, 1. 9.) – kolik kg; méně než kilo
   * se nezapíše.
   */
  | { kind: 'meat-spoiled'; kg: number }
  /**
   * Přes zimu chybělo přes polovinu sena – část stáda uhynula (diet.md – Zimní úhyn, 1. 3.); kusy
   * po druzích na setiny. Jen kronika uložená před 24. 10. 2026 – od té doby ves poráží
   * (`hay-slaughter`).
   */
  | { kind: 'herd-starved'; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Seno do konce března nevystačí – ves hned porazila kusy, na které nezbude (oxen.md – Co nejvíc
   * sena a co největší stáda): kolik kg masa a kusů (na setiny) kterého druhu.
   */
  | { kind: 'hay-slaughter'; kg: number; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Při porážce: ovce, které ves nechala přes zimu (`sheep`, na desetiny), nedají vlnu na oděv pro
   * všechny – potřeba by byla `needed` ovcí (diet.md – Oděv).
   */
  | { kind: 'wool-short'; sheep: number; needed: number }
  /**
   * Voli v ohradě jsou vycvičení – táhnou rádla a vozy (oxen.md; `oxen` – kolik, chybí = pár ve
   * vsích uložených dřív).
   */
  | { kind: 'team-ready'; penId: number; oxen?: number }
  /** Voli dosloužili – zestárli (oxen.md, ≈ 10 let), šli na maso (`oxen` jako u `team-ready`). */
  | { kind: 'team-retired'; penId: number; oxen?: number }
  /**
   * Přes zimu chybělo přes polovinu sena – voli (`training` – telata ve výcviku) uhynuli
   * (`oxen` – kolik; chybí = spřežení se rozpadlo ve vsích uložených dřív).
   */
  | { kind: 'ox-died'; penId?: number; training: boolean; oxen?: number }
  /** Koně uhynuli 1. 3. pro nedostatek sena (horses.md – Krmení) – jen když je porážka (`horse-retired` s důvodem `hay`) nestihla. */
  | { kind: 'horse-starved'; penId: number; horses: number }
  /** Klisny ohrady porodily 1. 5. hříbata (horses.md – Chov; `foals` – kolik). */
  | { kind: 'foal-born'; penId: number; foals: number }
  /** Do nově dostavěné ohrady koní přivedli hřebce a dvě klisny (horses.md – Koně se stavbou ohrady). */
  | { kind: 'horses-arrived'; penId: number; horses: number }
  /** Kůň pod jezdcem došel plného výcviku (horses.md – Výcvik koně a jezdec). */
  | { kind: 'horse-trained'; penId: number; horseId: number }
  /**
   * Jezdecké koně podkovali (horses.md – Kování; `own` – vlastní kovář, jinak kovář souseda –
   * markets.md, Rozhodnutí plánu 3, bod 9). Cizí kovář přišel od souseda ve směru `direction`;
   * chybí u vlastního kováře a u zápisů starších než 14. 11. 2026. Kovář souseda nese i ves, odkud
   * přišel (`villageName`, `villageId` – Rozhodnutí plánu 3, bod 15); starší zápisy je nemají.
   */
  | {
      kind: 'horses-shod';
      horses: number;
      own: boolean;
      direction?: Direction8;
      villageName?: string;
      villageId?: string;
    }
  /**
   * Koně šli 1. 11. na maso (horses.md – Chov): dosloužili ve 20 letech (`age`), nebo jich ves má
   * víc, než chce (`surplus` – nejdřív nejstarší).
   */
  | { kind: 'horse-retired'; penId: number; horses: number; reason: 'age' | 'surplus' | 'hay' }
  /** Do kraje přišel nový medvěd (wildlife.md – Roční přepočet: ulovený se vrací za 3 roky). */
  | { kind: 'bear-returned' }
  /** Šelmy strhly dobytek (wildlife.md – Vlci na dobytku; `heads` – celé kusy dne). */
  | { kind: 'predator-kill'; species: HerdSpecies; by: 'wolf' | 'bear'; heads: number }
  /**
   * Úlovek lovu (hunting.md – Pravidla 7; `applyHuntResult`): kus zvěře, maso do zásoby a útočníci
   * – první složil zvíře. Starší zápisy jsou úlovek dne kalendářního lovu rodu (nejlepší lovec).
   */
  | { kind: 'hunt'; kills: HuntKills; meatKg: number; names: string[] }
  /**
   * Lovec byl zraněn a 60 dní nepracuje (hunting.md – Pravidla 6): zvířetem, nebo šípem druhého
   * lovce (i na lovu jelena a laně). Starší zápisy jen `boar` (divočák) a `bear`.
   */
  | { kind: 'hunt-injury'; prey: QuarryKind; name?: string }
  /** Po žních: zvěř a vrány zničily `kg` obilí na polích (wildlife.md – Škody). */
  | { kind: 'wildlife-damage'; kg: number }
  /** Sad dosloužil (60. rok) a vrátil se v louku. */
  | { kind: 'orchard-gone'; orchardId: number }
  /** Vesničané zařadili čtverce starého sadu do obnovy (orchard.md – Obnova sadu). */
  | { kind: 'orchard-renewal-started'; orchardId: number; squares: number }
  /**
   * Pole nebo sad ustoupil stavbě obydlí (population.md – Obydlí na poli a v sadu): o kolik m² se
   * zmenšil, a jestli tím zanikl (dům sebral poslední čtverec).
   */
  | {
      kind: 'land-taken';
      land: 'field' | 'orchard';
      id: number;
      areaM2: number;
      gone: boolean;
      /** Co půdu vzalo (fields.md – Pole jako krajina); bez údaje obydlí (starší události). */
      by?: LandTaker;
    }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  /**
   * Trvalý stav vsi z upozornění (absence.md – Upozornění vsi do kroniky): začátek – `day` je den
   * začátku, zapíše se, až stav trvá NOTICE_CHRONICLE_MIN_DAYS dní; konec – `day` je první den bez
   * stavu, zapíše se, až chybí NOTICE_CHRONICLE_MIN_DAYS dní (`lasting-notices.ts`).
   */
  | { kind: 'notice-began' | 'notice-ended'; notice: LastingNotice }
  /** Vojvodova rodina jde na pole – hrozí hlad (lord.md – Kdy jde rodina na pole). */
  | { kind: 'lord-to-field'; reason: 'hunger' | 'sowing' }
  /** Vojvodova rodina se vrací k výcviku – 30 dní plného přídělu (lord.md). */
  | { kind: 'lord-to-training' }
  /**
   * Nepasený a nesečený příloh zarostl lesem a z pole vypadl (fields.md – Zarůstání): první díl,
   * pole, kolik dílů a jestli pole zaniklo. U událostí ze staršího pravidla (do 18. 10. 2026)
   * je jen `partId`.
   */
  | {
      kind: 'part-became-forest';
      partId: number;
      fieldId?: number;
      parts?: number;
      gone?: boolean;
    }
  /** Vesničané při mýcení ušetřili posvátný dub nebo dubový háj (happiness.md) – id místa. */
  | { kind: 'sacred-spared'; site: 'oak' | 'grove'; id: number }
  /** Ušetřený posvátný dub stářím uschl – zůstala posvátná souš (happiness.md) – id dubu. */
  | { kind: 'sacred-oak-died'; id: number }
  /** Posvátná souš padla – místo už není posvátný dub (happiness.md) – id dubu. */
  | { kind: 'sacred-snag-fell'; id: number }
  /** Pokřtěný rod vykácel posvátný dub nebo dubový háj (christianity.md – Co křest rodu umožní). */
  | { kind: 'sacred-felled'; site: 'oak' | 'grove' }
  /** Pokřtěný rod zbořil (zaoral) starý hřbitov (christianity.md – Co křest rodu umožní). */
  | { kind: 'cemetery-ploughed' }
  /**
   * Z dlouhodobého provozu vznikla pevná cesta (roads.md) – id úseku. Konce cesty hráče po úklidu
   * měsíce a roky chůze od vzniku pěšiny (`roadFormedNote`); starší zápisy je nemají.
   */
  | {
      kind: 'road-formed';
      roadId: number;
      ends?: [ChronicleRoadEnd, ChronicleRoadEnd];
      years?: number;
    }
  /**
   * Nepoužívaná vyšlapaná cesta zarostla (roads.md – Zarůstání) – id úseku. Konce cesty hráče
   * před zánikem (D67, Martin 15. 11. 2026: „tohle také neříká nic o tom, která to byla cesta“)
   * a `part` – zarostla jen část cesty (zbytek žije); starší zápisy je nemají.
   */
  | {
      kind: 'road-overgrown';
      roadId: number;
      ends?: [ChronicleRoadEnd, ChronicleRoadEnd];
      part?: true;
    }
  /** Zemská stezka ke kraji mapy je dostavěná – obchod se sousedem (trade.md). */
  | { kind: 'trail-built'; trailId: number; direction: Direction8 }
  /**
   * Výprava nosičů vyrazila k sousedovi – co nesou (trade.md – Obchod) a kdo s ní odešel do
   * sousední vsi (`people` – trade.md, Výměna lidí; chybí = nikdo).
   */
  | { kind: 'trade-departed'; direction: Direction8; give: TradeGoods; people?: TradePeople }
  /**
   * Výprava se vrátila – co přinesla (trade.md – Obchod) a kdo s ní přišel (`people`; chybí =
   * nikdo).
   */
  | { kind: 'trade-returned'; direction: Direction8; get: TradeGoods; people?: TradePeople }
  /**
   * Na trh vsi přišla výprava z jiné vsi (markets.md – Pravidla 3) – odkud a co veze (koně jako
   * počty po druzích; výprava jen na pivo bez zboží).
   */
  | {
      kind: 'market-arrived';
      villageName: string;
      goods: TradeGoods;
      /** Ves výpravy (Rozhodnutí plánu 3, bod 15); chybí = zápis z doby před ním. */
      villageId?: string;
      /** Přišel kovář kovat koně (`MarketArrival.service`), ne obchodník; jinak chybí. */
      smith?: true;
    }
  /**
   * Na trh vsi u stezky přijeli cizí kupci (markets.md – Rozhodnutí plánu 4, bod 5) – co prodávají,
   * co shánějí a kolik mincí mají v měšci; odkud jsou, hra neví. Jen první příjezd v herním roce
   * (`VillageMarket.merchantsYear`).
   */
  | { kind: 'merchants-arrived'; sells: TradeGoods; buys: TradeGoods; coins: number }
  /** Tržní den – co ves na svém trhu prodala a koupila (markets.md – Pravidla 3 a 5). */
  | { kind: 'market-held'; sold: TradeGoods; bought: TradeGoods }
  /**
   * Výprava vyrazila na trh vsi `villageName` (markets.md – Pravidla 2 a 3) – co veze na prodej
   * (koně jako počty po druzích), co shání a první den doma (`returnDay`).
   */
  | {
      kind: 'market-departed';
      villageName: string;
      give: TradeGoods;
      wants: TradeGoods;
      returnDay: number;
      /** Kdo výpravu poslal (`TripBy`, Rozhodnutí plánu 3, bod 14); chybí = hráč. */
      by?: TripBy;
      /** Hostitel (Rozhodnutí plánu 3, bod 15); chybí = zápis z doby před ním. */
      villageId?: string;
    }
  /**
   * Výprava se vrátila z trhu vsi `villageName` (markets.md – Pravidla 3) – co prodala, koupila
   * a co se neprodalo; `returned` – hostitelská ves zanikla a výprava přivezla, co drží
   * (Rozhodnutí plánu 2, bod 6). Prázdné `villageName` – záznam výpravy chyběl. Mince (Rozhodnutí
   * plánu 4, bod 9) jsou jako v `market-held`: zaplacené v `sold.coins`, přijaté v `bought.coins`;
   * mince, které se vrátily, neprodané zboží nejsou (`unsold` je bez nich).
   */
  | {
      kind: 'market-returned';
      villageName: string;
      sold: TradeGoods;
      bought: TradeGoods;
      unsold: TradeGoods;
      returned?: true;
      /** Kdo výpravu poslal (`TripBy`); chybí = hráč. */
      by?: TripBy;
      /** Hostitel (Rozhodnutí plánu 3, bod 15); chybí = zápis z doby před ním nebo bez výpravy. */
      villageId?: string;
    }
  /**
   * Zakázka ve vsi `villageName` (`villageId`) je hotová – hostitel ji ohlásil zprávou
   * `order-ready` (markets.md – Rozhodnutí plánu 3, bod 6).
   */
  | { kind: 'order-ready'; villageName: string; villageId: string; good: OrderGood }
  /**
   * Vesničané koupili výrobky řemeslníků u souseda (crafts.md – Nákup u sousedů; nový nákup
   * zrušen – markets.md, Pravidla 1, zápis přibude jen s návratem nákupu uloženého na cestě) – kg
   * nástrojů, keramiky a dřevěného nářadí, čím platili (kg obilí a luštěnin).
   */
  | {
      kind: 'crafts-bought';
      direction: Direction8;
      get: CraftPurchaseGoods;
      pay: CraftPurchasePay;
      /** Koupený vůz (crafts.md – Nákup u sousedů, Vozy); chybí = žádný. */
      cart?: CartKind;
    }
  /**
   * Ves koupila u sousedů osivo na setí nutných dílů (fields.md – Osivo pro ves bez zásob; jen
   * starší zápisy – nákup osiva zrušen, markets.md – Pravidla 1): kg obilí na osivo, obilí do zásob
   * za přeplatek posledního kusu dobytka (`changeKg`; chybí = nic) a čím platila – hřivny (kg)
   * a krávy (kusy).
   */
  | {
      kind: 'seed-bought';
      seedKg: number;
      changeKg?: number;
      pay: { ironBarsKg?: number; cows?: number };
    }
  /**
   * Ves nemá osivo na setí nutných dílů (fields.md – Osivo pro ves bez zásob): kolik osiva chybí
   * (kg). Bez `reason` = bez nákupu (nákup osiva u sousedů zrušen – markets.md, Pravidla 1);
   * starší zápisy nesou, proč ho ves nekoupila – nemá čím zaplatit (`pay`), nebo sousedé obilí
   * nemají (`supply`).
   */
  | { kind: 'seed-short'; shortKg: number; reason?: 'pay' | 'supply' }
  /** Tesař vyrobil vůz (wagons.md – Tesař). */
  | { kind: 'cart-made'; cart: CartKind }
  /**
   * Ves nemá kováře – tesař (`son` – jeho syn) šel pro kování k vozu do nejbližší vsi s kovářem
   * `to` (jméno; soused za krajem mapy ve směru `direction` – wagons.md, Kování vozů).
   */
  | {
      kind: 'iron-trip';
      cart: CartKind;
      to: string;
      son: boolean;
      direction?: Direction8;
      /** Kolik nosičů šlo s tesařem; `byCart` – platbu vezl vůz se sedlákem. */
      porters?: number;
      byCart?: true;
    }
  /** Tesař (`son` – jeho syn) přinesl kování k vozu – vůz je hotový (wagons.md – Kování vozů). */
  | { kind: 'iron-brought'; cart: CartKind; son: boolean }
  /** Vůz dosloužil (wagons.md – Vůz) – tesař vyrobí nový, když ho ves potřebuje. */
  | { kind: 'cart-worn-out'; cart: CartKind }
  /**
   * S výpravou přišli lidé od souseda (trade.md – Výměna lidí): rodina, svobodný muž nebo žena,
   * kolik jich je a do kterého obydlí šli. Lidé z trhu (markets.md – Rozhodnutí plánu 3, bod 10)
   * nesou ves, odkud přišli (`villageName`, `villageId`); starší záznamy je nemají. `returned` –
   * vrátili se lidé, které ves sama prodala: ves kupce zanikla dřív, než je dovedla domů
   * (`stranded-people`, Rozhodnutí plánu 3, bod 13); chybí – noví lidé. `coins` – měšec výpravy
   * zaniklé vsi, který přišel s lidmi (první zápis zprávy; Rozhodnutí plánu 4, bod 9 – preflight
   * M14); chybí – žádné mince.
   */
  | {
      kind: 'newcomer';
      direction: Direction8;
      group: NewcomerGroup;
      people: number;
      dwellingId: number;
      villageName?: string;
      villageId?: string;
      returned?: true;
      coins?: number;
      /** Otrokyně (skupina `slave` se ženou) – věta v ženském rodě (vzor `birth`); jinak chybí. */
      female?: true;
    }
  /**
   * Měšec výpravy z vsi `villageName` (`villageId`), jejíž domovská ves zanikla, přišel do vsi bez
   * lidí – `coins` mincí (`stranded-people`; Rozhodnutí plánu 4, bod 9 – preflight M14).
   */
  | { kind: 'stranded-coins'; coins: number; villageName: string; villageId: string }
  /**
   * Opuštěná stavba, ke které léta nikdo nechodil, se rozpadla (abandonment.md): modla padla,
   * svatyně se rozpadla, plot hřbitova se rozpadl, ohrada se rozpadla – id stavby.
   */
  | { kind: 'structure-fell'; structure: AbandonedStructure; id: number }
  /**
   * Hráč nebo správce stavbu opustil, nebo opuštěnou vrátil (demolition.md – Opuštění): obydlí,
   * ohrada, modla nebo svatyně – id stavby.
   */
  | { kind: 'structure-abandoned' | 'structure-restored'; structure: UsableStructure; id: number }
  /**
   * Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava): modlu, svatyni,
   * plot hřbitova (i spadlý postavili znovu) nebo ohradu – id stavby.
   */
  | { kind: 'structure-repaired'; structure: AbandonedStructure; id: number }
  /**
   * Humno bez výmlatu zaroste trávou, opuštěná obilná jáma se zasype (demolition.md – Rozhodnutí) –
   * stavba zmizí bez zříceniny.
   */
  | { kind: 'structure-overgrown'; structure: 'threshing-floor' | 'grain-pit'; id: number }
  /** Stavba zbourána (demolition.md – Bourání): `logs` klád na hromadě u cesty. */
  | { kind: 'structure-demolished'; structure: UsableStructure; id: number; logs: number }
  /**
   * Ukázalo se počasí roku kraje (disasters.md – Léto, Zima, „Kdy je vidět“): zlá zima, nebo
   * neobvyklé léto (mokré žně jsou 1. 6. deštivé léto, 15. 7. mokré žně).
   */
  | { kind: 'weather'; summer?: SummerWeather; winter?: WinterWeather }
  /**
   * Požár (disasters.md – Požár): chytlo obydlí `startedDwellingId`, shořela obydlí
   * `burnedDwellingIds` (včetně něj); ztráty zásob v kg (zrno mimo jámy, maso, sýr, seno).
   */
  | {
      kind: 'fire';
      startedDwellingId: number;
      burnedDwellingIds: number[];
      /** Z nich zřícená (dům na nulu) – ostatní stojí ohořelé; chybí v kronice uložené dřív (všechna). */
      collapsedDwellingIds?: number[];
      lostGrainKg: number;
      lostMeatKg: number;
      lostCheeseKg: number;
      lostHayKg: number;
      /** Zásoby shořelých dílen (kg): uhlí a železo kovárny, keramika hrnčířství; starší zápisy chybí. */
      lostCharcoalKg?: number;
      lostIronKg?: number;
      lostPotteryKg?: number;
    }
  /**
   * Kroupy (disasters.md – Kroupy): pruh potloukl nesklizené díly `partIds` a střechy staveb
   * `dwellingIds`; `meadowShare` = podíl sena nesečené louky, který ubyl, `appleShare` = podíl
   * letošních jablek, který ubyl (chybí = nic).
   */
  | {
      kind: 'hail';
      partIds: number[];
      dwellingIds: number[];
      meadowShare?: number;
      appleShare?: number;
    }
  /**
   * Povodeň (disasters.md – Povodeň potoka): voda kraje stupně `level` (`heightM` nad hladinou
   * potoka) zatopila díly `partIds` a stavby `dwellingIds`, z nich `collapsedDwellingIds` se
   * zřítily; `meadowShare` = podíl sena nesečené louky, který ubyl, `lostGrainKg` = zrno, které
   * zateklo do jam. Úmrtí jsou zvlášť (`death`, `cause: 'flood'`).
   */
  | {
      kind: 'flood';
      level: FloodLevel;
      heightM: number;
      partIds: number[];
      dwellingIds: number[];
      collapsedDwellingIds: number[];
      meadowShare?: number;
      lostGrainKg?: number;
    }
  /**
   * Smršť (disasters.md – Smršť (tornádo)) síly `strength`: pás poničil stavby `dwellingIds`,
   * z nich `collapsedDwellingIds` se zřítily, polehlé nesklizené díly `partIds`; `uprootedTrees`
   * = vyvrácené stromy v okolí vsi (kmeny na hromadě klád), `orchardSquares` = vyvrácené čtverce
   * sadů, `roadApples` = vyvrácené jabloně u cest, `meadowShare` = podíl sena nesečené louky,
   * který ubyl, `lostHayKg` = rozmetané seno stohů. Úmrtí jsou zvlášť (`death`, `cause: 'tornado'`).
   */
  | {
      kind: 'tornado';
      strength: TornadoStrength;
      partIds: number[];
      dwellingIds: number[];
      collapsedDwellingIds: number[];
      uprootedTrees: number;
      orchardSquares?: number;
      roadApples?: number;
      meadowShare?: number;
      lostHayKg?: number;
    }
  /**
   * Rýžovník vyrýžoval náplav (gold.md – Pravidla 1; plán 6): `left` – kolik náplavů krajiny
   * ještě má zlato (0 – poslední).
   */
  | { kind: 'placer-exhausted'; left: number }
  | {
      kind: 'cemetery-full';
      cemeteryId: number;
      /** Jiný hotový hřbitov má volný hrob. */
      othersFree: boolean;
      /** Nějaký hřbitov nebo rozšíření se právě staví (u starších událostí chybí). */
      othersBuilding?: boolean;
    }
);
// Rozdělení práce dne po činnostech a místech (labor-report.ts) – jen pro zobrazení postav.
/** Činnost, na kterou šla práce dne. */
export type LaborActivity =
  /** Polní práce plánu (fields.md – Práce); sklizeň srpem a odnos v nůších zvlášť. */
  | 'reclaim'
  | 'dig'
  | 'sow'
  | 'weed'
  | 'harvest'
  | 'carry'
  | 'thresh'
  /** Orba rádlem – oráč a honáček se spřežením (oxen.md). */
  | 'plough'
  /** Sečení, sušení a stohování sena (oxen.md – Seno). */
  | 'mow'
  /** Porážka a uzení masa (diet.md). */
  | 'slaughter'
  /**
   * Dojení a zpracování mléka na sýr (diet.md – Práce se zvířaty) – bokem, ne z práce vsi
   * (`LaborDay.aside`).
   */
  | 'milking'
  /**
   * Pasení dospělým z práce vsi – ves bez výrostků (diet.md – Pasáci, Dospělý pasák; od 2. 11. 2026)
   * a v rozdělení práce z doby před 19. 10. 2026.
   */
  | 'herding'
  /**
   * Péče o zvířata – zimní krmení, voda a kydání krav a volů, prasata a slepice; bokem
   * (`LaborDay.aside`).
   */
  | 'animal-care'
  /** Péče o koně u ohrady koní – krmení, voda a kydání, hodina denně na koně (horses.md – Péče). */
  | 'horse-care'
  /** Kování jezdeckých koní vlastním kovářem u ohrady koní (horses.md – Kování). */
  | 'horse-shoeing'
  /** Rybaření vesničanů u tůně (wildlife.md – Drobná zvěř a ryby; rybář s prutem). */
  | 'fish'
  /** Noční hlídka polí dospělými (wildlife.md – Obrana polí; `allocation.tasks.watch`). */
  | 'watch'
  /** Oka na zajíce v zimě (wildlife.md – Drobná zvěř a ryby). */
  | 'snare'
  /** Sezónní práce v sadech (orchard.md). */
  | 'orchard-care'
  | 'orchard-harvest'
  /** Společná práce do staveb: stavba obydlí, kácení jeho dřeva, zakládání pole, výsadba sadu, hřbitov. */
  | 'build'
  /** Stavba ohrady a výroba rádla (oxen.md). */
  | 'pen'
  | 'fell'
  | 'found-field'
  | 'orchard-plant'
  | 'cemetery'
  /** Opravy obydlí (population.md), oprava modly a svatyně (abandonment.md – Oprava). */
  | 'repair'
  /** Řemeslník v dílně (crafts.md) – výroba uhlí, nástrojů nebo keramiky. */
  | 'craft'
  /** Uhlíř sází mladé buky na pařezy (crafts.md – Uhlíř, obnova lesa). */
  | 'plant'
  /**
   * Kopání, praní a pražení bahenní rudy na rudišti – kovář a synové od 14 let (crafts.md – Uhlí
   * a ruda kováře).
   */
  | 'ore'
  /** Kopání hlíny na hliništi – hrnčíř a synové od 14 let (crafts.md – Hlína hrnčíře). */
  | 'clay'
  /**
   * Lámání kamene v lomu a jeho nošení v nůších na stavbu – kostel, hradba, zásoba
   * (fortifications.md – Kámen, Nošení kamene a vůz); cíl je lom (`LaborTarget` `quarry`).
   */
  | 'quarry'
  /**
   * Obilné jámy (production-chains.md – Obilné jámy): vesničané kopou jámu, vypalují ji, nosí do
   * ní vymlácené zrno z humna a zapečetí ji.
   */
  | 'grain-pit'
  /**
   * Nošení rudy z rudiště do kovárny v koších – kovář a synové od 14 let (crafts.md – Uhlí a ruda
   * kováře; hlína hrnčíře stejně) – a odnos uhlí od milíře do kovárny v košatině na tyči ve dvou
   * (workshops.md – Uhlíř – odnos uhlí na tyči; `LaborShare.pole`); kdo nese, je v
   * `LaborShare.ages`.
   */
  | 'fetch'
  /**
   * Denní minimum domácností (fields.md – Práce, bod 1); domácí výroba žen jde bokem
   * (`LaborDay.aside`).
   */
  | 'domestic'
  /** Nosiči výpravy k sousedovi po zemské stezce (trade.md – Obchod). */
  | 'trade'
  /**
   * Svoz vozem (wagons.md – Vůz): honák a nakladač s vozem – snopy z pole, seno z luk, klády ke
   * stavbám, a co vozy vozí mimo svoz (Co vozy vozí – `LaborShare.job`): uhlí z milíře, osivo na
   * pole, vodu v sudech. Kolik vozů jede, je v `LaborShare.carts`.
   */
  | 'haul'
  /** Společná práce, na kterou nezbyla žádná stavba ani oprava (propadla). */
  | 'idle';

/** Kde se práce dělá. */
export type LaborTarget =
  /**
   * Pole (id) – osévané díly plánu, zakládané díly. U polních prací `parts` = díly pole, přes
   * které dnes práce postoupila (čelo práce, v pořadí postupu); bez nich celé pole.
   */
  | {
      kind: 'field';
      id: number;
      parts?: number[];
      /**
       * U orby: kolik orby dílu bylo hotovo na začátku a na konci dne (0–1, ke každému dílu
       * `parts`) – kudy dnes spřežení prošlo (scéna projede celou dnešní orbu – oxen.md).
       */
      progress?: [number, number][];
    }
  /** Loviště ryb – tůň do 1 km od vsi (pořadí od nejbližší; wildlife.md – Drobná zvěř a ryby). */
  | { kind: 'pool'; index: number }
  /** Hotové obydlí (id) – opravy, přestavba, práce řemeslníka v dílně. */
  | { kind: 'dwelling'; id: number }
  /** Staveniště nového obydlí – id stavby. */
  | { kind: 'site'; id: number }
  /** Sad (id) – výsadba, péče, sklizeň. */
  | { kind: 'orchard'; id: number }
  /** Hřbitov (id) – zakládání, rozšíření a oprava plotu (abandonment.md – Oprava). */
  | { kind: 'cemetery'; id: number }
  /** Hotová modla nebo svatyně (id stavby) – oprava (abandonment.md – Oprava). */
  | { kind: 'sacred'; id: number }
  /** Ohrada (id) – stavba, rádlo, péče o krávy a voly v zimě. */
  | { kind: 'pen'; id: number }
  /** Pevná cesta (id úseku) – vylepšení a jabloně podél ní (roads.md). */
  | { kind: 'road'; id: number }
  /**
   * Stavba vozové cesty (roads.md – Vozová cesta) – id stavby a čelo práce na ose (m): úsek, který
   * ještě není cestou.
   */
  | { kind: 'wagon'; id: number; x: number; z: number }
  /** Přirozená louka – políčka, na kterých se dnes seče seno (oxen.md – Seno). */
  | { kind: 'meadow'; cells: TileCell[] }
  /** Stromy z vrstvy překážek, které se pro stavbu nebo dílnu právě kácejí (i pařezy k sázení). */
  | { kind: 'trees'; ids: number[] }
  /**
   * Milíř uhlíře (crafts.md – Milíř u skácených buků) – dílna (id obydlí), střed milíře ve světě (m)
   * a id milíře (`kiln`; chybí jen u rozdělení práce ze starší vsi); odkud se nosí uhlí ke kováři
   * (`from` = id kovárny – nosí se z milíře do ní; crafts.md – Uhlí a ruda kováře).
   */
  | { kind: 'kiln'; id: number; x: number; z: number; from?: number; kiln?: number }
  /**
   * Rudiště kováře (crafts.md – Uhlí a ruda kováře) – kovárna (id obydlí) a místo, kde se kope
   * (m): kopání u jámy, nošení rudy z něj do kovárny, jízda vozu pro rudu.
   */
  | { kind: 'ore'; id: number; x: number; z: number }
  /**
   * Hliniště hrnčíře (crafts.md – Hlína hrnčíře) – dílna (id obydlí) a místo, kde se kope (m):
   * kopání u jámy, nošení hlíny k dílně, jízda vozu pro hlínu.
   */
  | { kind: 'clay'; id: number; x: number; z: number }
  /** Zemská stezka (id) – nosiči výpravy k sousedovi (trade.md – Obchod). */
  | { kind: 'trail'; id: number }
  /**
   * Lom (id skalního výchozu – `Quarry.outcropId`): lámání kamene a jeho nošení na stavbu, jízda
   * vozu s kamenem (fortifications.md – Kámen, Nošení kamene a vůz).
   */
  | { kind: 'quarry'; id: number }
  /**
   * Cesta krajinou ke kraji mapy ve směru (bez zemské stezky) – nákup u souseda (crafts.md –
   * Nákup u sousedů); bod na kraji mapy (m).
   */
  | { kind: 'edge'; direction: Direction8; x: number; z: number }
  /** Břeh vody, kam vůz jezdí pro vodu v sudech (wagons.md – Co vozy vozí); bod ve světě (m). */
  | { kind: 'water'; x: number; z: number }
  /**
   * Hotové humno (id) – výmlat snopů a odvívání zrna (production-chains.md – Humno); snopy se na
   * něj nosí z polí, zrno z něj do zásob.
   */
  | { kind: 'threshing-floor'; id: number }
  /**
   * Obilná jáma (production-chains.md – Obilné jámy) – id jámy (i nové, kterou vesničané teprve
   * kopou) a její střed (m): kopání, plnění a pečetění jámy.
   */
  | { kind: 'grain-pit'; id: number; x: number; z: number }
  /**
   * Ves celkově – nouzový výmlat na udusané zemi u domů (rok odkladu starší vsi), porážka, domácí
   * práce, nevyužitá společná práce.
   */
  | { kind: 'village' };

/**
 * Kdo nese s uhlířem košatinu s uhlím na tyči do kovárny (workshops.md – Uhlíř – odnos uhlí na
 * tyči): jeho syn, nebo – když syna nemá – syn kováře či kovář, pro kterého si uhlíř dojde.
 */
export type PolePartnerKind = 'burner-son' | 'smith-son' | 'smith';

export interface LaborShare {
  activity: LaborActivity;
  target: LaborTarget;
  /** Člověkodny (na tisíciny). */
  manDays: number;
  /**
   * Stavba, do které práce šla (stavba i kácení jejího dřeva, zakládání pole, výsadba sadu,
   * hřbitov) – scéna podle ní ukáže u každé stavby, která dnes dostala práci, aspoň jednoho
   * člověka. U ostatní práce (a u rozdělení uložených dřív) chybí.
   */
  construction?: number;
  /**
   * Stavba kostela (churches.md – Stavba): druhy práce, na které dnes došlo (lámání, písek, vápno,
   * zdi…) – scéna podle nich postaví mistry huti k jejich práci. U ostatní práce chybí.
   */
  churchWork?: ChurchWork[];
  /** Svoz a výprava s vozy (wagons.md): kolik vozů tu dnes jezdí; u ostatní práce chybí. */
  carts?: number;
  /** Z nich čtyřkoláky (svoz, kam dojedou – wagons.md, Co se vozí a na čem); chybí = žádný. */
  fourWheel?: number;
  /**
   * Co vůz veze, když nesváží úrodu, seno ani klády (wagons.md – Co vozy vozí): uhlí z milíře,
   * osivo na pole, vodu v sudech. U svozu a ostatní práce chybí.
   */
  job?: CartJob;
  /**
   * Kdo práci dělá (věk v letech, od nejstaršího) – u kopání a nošení kováře (crafts.md – Uhlí
   * a ruda kováře): kovář, nebo jeho synové; postavy pod 14 let jsou děti. U odnosu uhlí na tyči
   * (`pole`) uhlíř a druhý z dvojice v tomto pořadí. U ostatní práce chybí.
   */
  ages?: number[];
  /**
   * Odnos uhlí na tyči (workshops.md – Uhlíř – odnos uhlí na tyči): kdo nese s uhlířem – podíl
   * `fetch` u milíře je práce celé dvojice a cesta uhlíře pro kováře. U ostatní práce chybí.
   */
  pole?: PolePartnerKind;
  /**
   * Podíl žen mezi dospělými, kteří práci dělají (0–1) – u pletí dospělých (fields.md – Pletí
   * jednou a rychle: plejí napřed ženy vsi, muži jen zbytek). U ostatní práce chybí – scéna vezme
   * podíl podle činnosti.
   */
  women?: number;
}

/** Rozdělení práce jednoho dne – uložené ve stavu vsi (`VillageState.labor`). */
export interface LaborDay {
  day: number;
  shares: LaborShare[];
  /**
   * Kolik výrostků 7–13 let dnes pase (diet.md – Pasáci) – pasou bez práce vsi, proto nejsou
   * v `shares`. Starší (`elders`) jen v rozdělení práce z doby před 19. 10. 2026. Bez údaje se
   * neví (dřívější rozdělení).
   */
  herders?: { children: number; elders?: number };
  /**
   * Práce bokem – mimo práci vsi (population.md – Práce; Martin 19. 10. 2026): dojení a péče
   * o zvířata a domácí výroba (ženy), denní minimum, které pokryli starší – jen pro postavy ve
   * scéně, v `shares` nejsou.
   */
  aside?: LaborShare[];
  /**
   * Vojvodova rodina mimo práci vsi (lord.md – Den rodiny; počty lidí – pro scénu a lištu): kolik
   * jich cvičí, kolik je na poli a kolik žen vede domácnost dvorce. Chybí, když rodina pracuje
   * jako ostatní (i dřívější rozdělení).
   */
  lord?: { training: number; field: number; household: number };
  /**
   * Kusy poražené dnes (zimní den, 1. 11., nouzová porážka, porážka pro seno; i zlomky kusů) –
   * jen hlášení pro scénu (porážka ve scéně), simulace ho nečte. Chybí, když se dnes neporáželo.
   */
  slaughterHeads?: Partial<Record<HerdSpecies, number>>;
}
