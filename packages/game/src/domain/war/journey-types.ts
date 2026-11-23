import type { NewVillageEvent } from '../village/core/inbox';
import type { GridCell } from '../village/people/world-grid';
import type { PersonRef } from '../village/types';
import type { CampaignGroup, CampaignNotice, CampaignVillage } from './campaign-types';
import type { HuntBeaters, HuntStart } from './hunt-beaters';
import type { HuntFight } from './hunt-fight';
import type { Pos } from './march-grid';
import type { KnowledgeOut, SeenCell } from './seen';

// Stav výpravy (expeditions.md; plán 2026-11-14 – Úloha 1; dřív výjezd vojvody – lord-control.md).
// Výprava stojí vedle tažení – nemá válku ani cílovou ves – a sdílí s ním takty, pohyb po mapách
// a svět. Jedna výprava na domovskou ves hráče, v ní libovolně skupin hráče (`parties`) a jejich
// hloučků (`groups` – lidé na jednom místě). Stav je JSON (kontrolní bod v úložišti): po načtení
// z JSON musí výprava pokračovat bit po bitu stejně. Starší body (jedna skupina) převede
// `upgradeJourney` (`journey-upgrade.ts`).

/**
 * Fáze skupiny, jak ji vidí hráč: venku (jde nebo čeká na místě) → návrat domů → konec (pohled
 * `expeditionViewsFor`; fáze celého stavu ve starších bodech).
 */
export type JourneyPhase = 'out' | 'returning' | 'done';

/**
 * Kůň u jezdce (expeditions.md – Koně): `ridden` – jezdec na něm sedí, `led` – sesedl mimo ves
 * a vede ho za uzdu (jde pěšky).
 */
export type MemberHorse = 'ridden' | 'led';

/** Člověk výpravy – osoba zůstává ve stavu domovské vsi (`away: journey`), tady je její stav na cestě. */
export interface JourneyMember {
  ref: PersonRef;
  /** Vojvoda – hráčův muž; skupina, která ho ztratí, se vrací sama a rozkazy hráče neplatí. */
  lord: boolean;
  /** Na svém koni (lord-control.md – Kdo jede: Kůň); vždy s `horse: 'ridden'`. */
  mounted: boolean;
  /**
   * Jezdec – id jeho jezdeckého koně v ohradě domovské vsi (`Horse.riderId`; `riderHorse`). Chybí –
   * není jezdec, nebo starší bod (ves o koni neví).
   */
  horseId?: number;
  /** Kůň u sebe (`MemberHorse`); chybí – kůň je v ohradě a jezdec jde pěšky. */
  horse?: MemberHorse;
  /** Síla při vyslání (`lineManStrength`). */
  strength: number;
  /** Síla na koni se svým koněm (`lineManStrength`); chybí – jako pěšky. */
  strengthMounted?: number;
  /** Dovednost boje 0–100 při vyslání (šelmy – lord-control.md, Nebezpečí). */
  fight: number;
  /** Zdraví 0–100 (`WAR.combat.health`); zima ani hlad ho na výpravě neubírají. */
  health: number;
  /** Pěší raněný zpomalí skupinu jako u vojska (war.md – Ztráty). */
  wounded: boolean;
  /** Den, kdy byl raněn; chybí – není raněný. */
  woundedDay?: number;
  /** `fallen` – padl, nebo zemřel doma (stáří, hlad) a ve stavu domovské vsi už není. */
  status: 'active' | 'fallen';
  /** Hlouček (`JourneyGroup.id`), ve kterém je. */
  group: number;
  /** Jméno do upozornění („Bořivoj se vrátil.“); chybí = beze jména. */
  name?: string;
  /** Žena („Dobrava se vrátila.“); chybí = muž. */
  female?: true;
  /** Den narození – vůdce skupiny je nejstarší (`partyLeader`); chybí = nejmladší. */
  bornDay?: number;
  /** Dovednost luku 0–100 (`ArmsSkills.bow` – jen muž rodu, `line`); chybí = 0. Boj je `fight`. */
  bow?: number;
  /** Jízda 0–100 (`ArmsSkills.riding`); chybí = 0. */
  riding?: number;
  /** Muž rodu (`isLineMan`) – na lovu nosí luk a padlý zemře 1 : 3; chybí = vesničan. */
  line?: true;
  /**
   * Ves ho počítá jako útočníka lovu `huntId` (`away.huntId` – práce vsi ho bere jako doma;
   * plán 2026-11-22-hunting – Rozhodnutí 3): nový člověk ze vsi, který přišel povelem `strike`.
   * Zůstane-li venku jako běžná výprava (rozkaz ven), ves dostane `hunt-leave` a značka zmizí;
   * chybí – ves ho počítá jako pryč (kdo byl ve výpravě už předtím).
   */
  huntId?: number;
}

/** Hlouček – lidé jedné skupiny na jednom místě (tvar tažení, bariéra vsí čte `groups[].cell`). */
export interface JourneyGroup extends CampaignGroup {
  /** Skupina hráče (`JourneyParty.id`), ke které hlouček patří. */
  party: number;
}

/**
 * Skupina hráče (expeditions.md – Výběr a skupina): lidé, kteří dostali společný rozkaz. Všechny
 * její hloučky jdou ke stejnému cíli tempem nejpomalejšího ze skupiny a splynou, když stojí na
 * stejném místě.
 */
export interface JourneyParty {
  id: number;
  /** Venku (jde nebo čeká na místě), nebo návrat domů. */
  phase: 'out' | 'returning';
  /**
   * Takt, od kterého stojí všechny hloučky skupiny – od něj běží čekání (`JOURNEY.waitDays`);
   * null = některý hlouček jde.
   */
  arrivedTick: number | null;
  /** Rozkaz „Přes okraj“ – hlouček zastaví, jakmile vstoupí na sousední mapu cíle. */
  crossing?: true;
  /** Skupina ztratila vojvodu – vrací se sama, rozkazy hráče neplatí, upozornění nejde. */
  leaderless?: true;
  /**
   * Práce s koňmi doma (osedlání, sesednutí – `journey-horses.ts`): do `untilTick` hloučky skupiny
   * stojí a rozkazy jen zapíší cíl; chybí – nikdo s koňmi nepracuje.
   */
  horseWork?: HorseWork;
  /**
   * Útočí na zvíře lovu (povel `strike`; plán 2026-11-22-hunting – Úloha 7): každý člen stojí ve
   * vlastním hloučku, jehož poloha je poloha bojovníka souboje; čekání (`waitDays`) neběží. Po konci
   * lovu jde skupina domů s honci; jiný rozkaz lov opustí (`leaveHunt`). Chybí – neloví.
   */
  hunting?: true;
}

/**
 * Osedlání nebo sesednutí doma (expeditions.md – Koně; plán 2026-11-14 – Rozhodnutí 7): vesničan
 * `groomId` dojde do ohrady `pen` a přivede koně jezdcům `riders` (`saddle`), nebo dojde k jezdcům
 * a odvede koně do ohrady (`unsaddle`). Nikdo doma (`groomId` null) – jezdec dojde pro koně sám.
 * Od taktu příkazu `fromTick` do `untilTick` (`horseWorkTicks`).
 */
export interface HorseWork {
  kind: 'saddle' | 'unsaddle';
  groomId: number | null;
  /** Id osob jezdců, kterým vesničan koně vede nebo odvádí. */
  riders: number[];
  fromTick: number;
  untilTick: number;
  /** Ohrada koně prvního jezdce (střed prvního čtverce). */
  pen: Pos;
}

/**
 * Lov vsi ve výpravě (hunting.md; plán 2026-11-22-hunting – Rozhodnutí 1, 3, 4, 6): honci jdou ke
 * dveřím lesa a zpět (`beaters`), vyhnané zvíře a útočníci jsou souboj (`fight`). Nejvýš jeden
 * na výpravu; zmizí, až jsou honci po konci souboje doma (`journey-hunt.ts`).
 */
export interface JourneyHunt {
  /** Z `nextId` výpravy – `ref` výsledku `journey:<id>:hunt:<huntId>`. */
  id: number;
  /** Herní den vyhlášení (`HuntStart.day`). */
  day: number;
  /** Psi dvorce s honci – jen scéna. */
  dogs: number;
  /** Kam zvíře vyběhne z lesa, až honci dojdou ke dveřím. */
  out: Pos;
  beaters: HuntBeaters;
  fight: HuntFight;
  /** `hunt-result` už vydán. */
  reported?: true;
  /**
   * Útočníci při vstupu do souboje (`joinHunt`) – jméno a jezdecký kůň pro výsledek (`fightResult`):
   * padlého odebere `afterLosses` z lidí výpravy a padlému koni se `horseId` maže hned. Každý jednou.
   */
  strikers?: HuntStriker[];
}

/** Útočník lovu pro výsledek: osoba, jméno (chybí = beze jména) a jezdecký kůň (chybí = žádný). */
export interface HuntStriker {
  personId: number;
  name?: string;
  horseId?: number;
}

/** Výprava – celý stav, ze kterého se počítá další takt. */
export interface JourneyState {
  kind: 'journey';
  id: string;
  /** Seed výpravy – náhoda jen z něj a dne nebo taktu (šelmy). */
  seed: number;
  /** Poslední spočtený takt (stav na jeho konci). */
  tick: number;
  /** Herní den posledního spočteného taktu – denní krok (lidé doma) jednou za den. */
  day: number;
  /**
   * Poslední den, jehož takty jsou do `tick` všechny spočtené (`dayOfTick(tick + 1) − 1`) – mez
   * bariéry vsí jako u tažení (`CampaignState.throughDay`); úložiště ji čte bez hodin.
   */
  throughDay?: number;
  /** Běží, nebo skončila (žádná skupina ani lov). */
  phase: 'out' | 'done';
  /** Hráč, jehož lidé jdou – rozkazy jen od něj. */
  playerId: string;
  houseId: string;
  /** Jméno vojvody ze staršího bodu (jen převedené výjezdy); jména nesou lidé (`name`). */
  leaderName?: string;
  /** Domovská ves – odtud lidé vyšli a sem se vracejí. */
  home: CampaignVillage;
  members: JourneyMember[];
  /** Hloučky všech skupin. */
  groups: JourneyGroup[];
  /**
   * Verze mřížky pochodu, podle které vznikly úseky hloučků (`MARCH_GRID_VERSION`); chybí = starší
   * bod – `upgradeJourney` úseky zahodí (`replanLegs`).
   */
  marchGridVersion?: number;
  parties: JourneyParty[];
  /** Další volné id skupiny i hloučku (jedna řada). */
  nextId: number;
  /**
   * Co lidé cestou viděli (lord-control.md – Co vojvoda vidí; Úloha 6) – podle políčka `x,y`:
   * stopa a naposled viděné stavby a opevnění. Domovská mapa tu není – hráč ji zná celou. Chybí =
   * zatím nic (starší body výjezdů).
   */
  seen?: Record<string, SeenCell>;
  /** Lov vsi (plán 2026-11-22-hunting – Úloha 6); chybí – žádný neběží (i starší body). */
  hunt?: JourneyHunt;
}

/**
 * Kontrolní bod výjezdu vojvody před výpravami (jedna skupina, fáze a čekání v celém stavu) –
 * převede ho `upgradeJourney`.
 */
export interface LegacyJourneyState extends Omit<
  JourneyState,
  'phase' | 'leaderName' | 'members' | 'groups' | 'parties' | 'nextId'
> {
  phase: JourneyPhase;
  leaderName: string;
  members: Omit<JourneyMember, 'group' | 'name' | 'female' | 'bornDay'>[];
  /** Právě jedna skupina. */
  groups: CampaignGroup[];
  arrivedTick: number | null;
}

/** Rozkaz hráče (lord-control.md – Rozkazy); nový rozkaz kdykoli nahradí starý. */
export type JourneyOrder =
  /** „Jdi sem“ – místo na mapě `cell` (chybí = mapa, na které je vůdce výběru). */
  | { kind: 'go'; pos: Pos; cell?: GridCell }
  /**
   * „Přes okraj“ – sousední políčko (8 směrů) hloučku vůdce: skupina dojde k okraji, objeví se na
   * opačném okraji sousední mapy a tam zastaví. Nesousední políčko se zahodí.
   */
  | { kind: 'cross'; cell: GridCell }
  /** „Domů“ – nejkratší cestou do vlastní vsi. */
  | { kind: 'home' };

/**
 * Nový člověk ze vsi do výpravy – data z vyslání; jezdec nese `horseId` a `strengthMounted`, muž rodu
 * `line` a luk, kdo cvičil, jízdu.
 */
export type JourneyRecruit = Pick<
  JourneyMember,
  'ref' | 'lord' | 'strength' | 'fight' | 'name' | 'female' | 'bornDay' | 'bow' | 'riding' | 'line'
> & { horseId?: number; strengthMounted?: number };

/**
 * Příkaz kroku výpravy: rozkaz lidem `people` (id osob; chybí = všem, koho hráč řídí) s novými lidmi
 * ze vsi `recruits`, odvolání domů (`recall` – worker a válka) skupin na políčkách `cells`,
 * Osedlat (`saddle` – noví lidé stojí doma v nové skupině) a Sesednout (`dismount`) lidem `people`
 * (`journey-horses.ts`), lov vsi (`hunt` – `startHunt`; běží-li jiný, zahodí se), nebo útok lidí
 * `people` a nových lidí `recruits` na vyhnané zvíře (`strike` – `journey-parties.ts`).
 */
export type JourneyCommand =
  | { kind: 'order'; order: JourneyOrder; people?: number[]; recruits?: JourneyRecruit[] }
  | { kind: 'recall'; cells: GridCell[] }
  | { kind: 'saddle'; people?: number[]; recruits?: JourneyRecruit[] }
  | { kind: 'dismount'; people?: number[] }
  | { kind: 'hunt'; start: HuntStart }
  | { kind: 'strike'; people?: number[]; recruits?: JourneyRecruit[] };

/** Tělo záměru – příkaz, nebo starý záměr (rozkaz bez lidí = všem; čte ho `commandOf`). */
export type JourneyIntentBody = JourneyCommand | JourneyOrder;

/** Rozkaz s taktem, ve kterém platí, a pořadím zápisu `seq` (v taktu podle něj) – jako u tažení. */
export interface JourneyIntent {
  tick: number;
  seq: number;
  byPlayer: string;
  body: JourneyIntentBody;
}

/** Výsledek `stepJourney`. */
export interface JourneyStep {
  /** Stav na konci posledního spočteného taktu (vždy nový tvar – i ze staršího bodu). */
  state: JourneyState;
  /** Události do schránek vsí – `ref` = `journey:<id>:<takt>:<n>` (opakování se zahodí). */
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
  /**
   * Znalost map pro úložiště rodu (Úloha 10): vydá se při přechodu okrajem (mapa, kterou skupina
   * opouští), při dojetí (mapa, na které stojí) a na konci výjezdu; bez změn chybí. Totéž vydání
   * podruhé je bezpečné – `mergeKnowledge` je idempotentní.
   */
  knowledge?: KnowledgeOut[];
  /** Krok se zastavil – chybí tyto mapy a vsi; null = spočteno do `toTick`. */
  waiting: { cells: GridCell[]; villageIds: string[] } | null;
}
