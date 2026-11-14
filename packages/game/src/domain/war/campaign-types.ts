import type { WorldClock } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import type { AssaultMethod } from '../village/fortification/assault';
import type { NewVillageEvent } from '../village/core/inbox';
import type { Person, PersonRef, Prisoner, RaidLoot, VillageState } from '../village/types';
import type { FlightMode } from '../village/types';
import type { GridCell } from '../village/people/world-grid';
import type { AlarmOwner, CampaignAlarm } from './alarm-types';
import type { BattleState } from './battle';
import type { MarchGridMemo, Pos } from './march-grid';
import type { KnowledgeOut, SeenCell } from './seen';

// Stav tažení (war.md – Velení a příprava tažení, Pohyb; plán 2026-11-03 – Úloha 6.5). Stav je
// JSON (kontrolní bod v úložišti): po načtení z JSON musí tažení pokračovat bit po bitu stejně.

/**
 * Fáze tažení: shromaždiště → pochod → nájezd na mapě cíle → návrat → konec. `disbanded` =
 * výprava se rozpadla (Ú6.12), lidé jdou domů po hloučcích.
 */
export type CampaignPhase =
  'assembling' | 'marching' | 'raiding' | 'returning' | 'disbanded' | 'done';

/**
 * Stav muže tažení. Úloha 6.5 zná jen `active`; padlé, zajaté a dezertéry doplní boj (Ú6.8),
 * zajetí (Ú6.11) a dezerce (Ú6.6).
 */
export type CampaignMemberStatus = 'active' | 'fallen' | 'captive' | 'deserted';

/** Muž tažení – osoba zůstává ve stavu domovské vsi (`away: campaign`), tady je její stav v poli. */
export interface CampaignMember {
  ref: PersonRef;
  /** Hráč, kterému muž patří (vůdce, nebo vazal ve službě) – záměry jen za vlastní muže (Ú6.14). */
  playerId: string;
  /** Muž rodu (jinak vesničan). */
  line: boolean;
  /** Na svém koni (war.md – Vojsko). */
  mounted: boolean;
  /** Nucený vesničan (war.md – Vojsko – Dobrovolníci a rozkaz). */
  forced: boolean;
  /** Síla při vyslání (`lineManStrength`, `villagerStrength`). */
  strength: number;
  /**
   * Dovednost luku muže rodu při vyslání (`bowSkillOf`) – kruh rozptylu střelby (`aim.ts`); u
   * vesničanů a starších stavů chybí (jako vesničan).
   */
  bowSkill?: number;
  /** Zdraví 0–100 (`WAR.combat.health`). */
  health: number;
  /** Podíl plné síly 0–1 (mráz – `frostDay`). */
  vigor: number;
  /** Pěší raněný – zpomalí skupinu (war.md – Ztráty); nastaví boj (Ú6.8). */
  wounded: boolean;
  /** Den, kdy byl raněn (60 dní bez práce a los smrti od něj – Ú6.10); u starších stavů chybí. */
  woundedDay?: number;
  /** Má v cílové vsi blízké příbuzné – dezertuje častěji a cíl varuje (war.md – Vojsko). */
  kin?: true;
  /** Id skupiny (`CampaignGroup.id`). */
  group: number;
  status: CampaignMemberStatus;
}

/** Rozkaz skupiny (war.md – Boj; zapojí Ú6.8). */
export type GroupOrder = 'follow-leader' | 'attack-all' | 'hold-place';

/**
 * Postup přes hradbu, který skupině zvolil hráč (fortifications.md – Přechod hradby; Martin
 * 8. 11. 2026 – „ano“, volí hráč rozkazem skupině). Bez volby – i u NPC – nejrychlejší postup
 * místa. Postup prolomení platí, nabízí-li ho místo (jinak nejrychlejší – `battle.ts`).
 */
export type GroupAssault = Exclude<AssaultMethod, 'open' | 'climb'>;

/** Místo ve světě: políčko mřížky a bod na jeho mapě (m). */
export interface CampaignPlace {
  cell: GridCell;
  pos: Pos;
}

/** Ves tažení (shromaždiště, cíl) – id vsi a její místo. */
export interface CampaignVillage extends CampaignPlace {
  villageId: string;
  /** Jméno vsi do kroniky nájezdu (Ú6.10); u starších stavů chybí. */
  name?: string;
}

/** Úsek pochodu po jedné mapě (`MarchPath` bez buněk) a ušlé metry louky po něm. */
export interface CampaignLeg {
  points: Pos[];
  meadowM: number[];
  walkedM: number;
}

/** Skupina tažení – hlouček mužů, který jde spolu tempem nejpomalejšího. */
export interface CampaignGroup {
  id: number;
  order: GroupOrder;
  /** Políčko mapy, na které skupina je, a poloha na ní. */
  cell: GridCell;
  pos: Pos;
  /** Kam skupina jde; null = stojí. */
  goal: CampaignPlace | null;
  /** Zbývající políčka světa k cíli (bez `cell`) – `worldRoute`. */
  route: GridCell[];
  /** Úsek po současné mapě – k okraji ve směru `route[0]`, nebo k cíli; null = spočte se. */
  leg: CampaignLeg | null;
  /** Skupina došla do cíle (nebo dál nemůže) a stojí. */
  arrived: boolean;
  /** Rozkaz „držet místo“ – místo na mapě cíle (war.md – Boj – Skupiny); jinak chybí. */
  holdAt?: Pos;
  /** Postup přes hradbu zvolený hráčem; chybí = nejrychlejší (`GroupAssault`). */
  assault?: GroupAssault;
}

/** Zásoby tažení (war.md – Pohyb – Zásoby); píci a nosnost doplní příprava (Ú6.6). */
export interface CampaignSupplies {
  /** Jídlo v kg obilí (1 kg na muže a den – `WAR.foodKgPerManDay`). */
  foodKg: number;
}

/** Rozkaz ke vzdaným (war.md – Velení, bod 8): pobít / odvést / nechat; zapojí Ú6.11. */
export type SurrenderOrder = 'kill' | 'lead' | 'leave';

/** Kořist (war.md – Kořist; plní Ú6.10). Stádo zpomalí skupinu (`marchSpeed`). */
export interface CampaignLoot {
  foodKg: number;
  herd: number;
  /** Rozpis kořisti po druzích (`foodKg` a `herd` jsou jeho součty); chybí – nic nevzali. */
  detail?: RaidLoot;
  /**
   * Odvedení lidé – snímek ze stavu napadené vsi v den nájezdu (id patří jí), i chycení poslové
   * (Úloha 5 plánu 2026-11-09 – snímek z jejich vsi); ve vsi útočníka přijdou jako noví vesničané
   * s novými id (`campaign-return`). Chybí – nikdo.
   */
  people?: Person[];
  /**
   * Zajatí muži rodu a šlechtici (z nájezdu i chycení poslové) – přibudou do `VillageState.prisoners`
   * vsi shromaždiště.
   */
  prisoners?: Prisoner[];
}

/** Proč se tažení vrací; `routed` = útočníci v boji poraženi (war.md – Bod zlomu). */
export type CampaignReturnReason = 'arrived' | 'supplies' | 'order' | 'routed';

/** Tažení – celý stav, ze kterého se počítá další takt. */
/** Host (z ochrany pánem nebo ze svolání) v boji: záporné číslo bojovníka, domovská osoba a co potřebuje zajetí. */
export interface CampaignGuard {
  id: number;
  /**
   * Druh hosta; chybí = ochrana (starší stav tažení); `refuge` – muž uprchlíků v hradišti (war.md –
   * Varování, poslové a útěk do hradiště – Místo v hradišti).
   */
  kind?: 'service' | 'refuge';
  ref: PersonRef;
  name?: string;
  noble?: true;
  /**
   * Muž uprchlíků, který není muž rodu ani šlechtic – vzdaného útočník nezajme (pobít = padne;
   * odvést ho z hradiště zatím nelze – jako ženy a děti uprchlíků, Později).
   */
  villager?: true;
}

export interface CampaignState {
  id: string;
  warId: string;
  /** Seed tažení – náhoda taktu jen z něj a čísla taktu (`tickRandom`). */
  seed: number;
  /** Poslední spočtený takt (stav na jeho konci). */
  tick: number;
  /** Herní den posledního spočteného taktu – denní krok (jídlo, mráz) jednou za den. */
  day: number;
  phase: CampaignPhase;
  /** Vůdce tažení (hráč) a jméno hlavy rodu do kroniky. */
  playerId: string;
  leaderName: string;
  commander: PersonRef;
  deputy: PersonRef | null;
  assembly: CampaignVillage;
  target: CampaignVillage;
  members: CampaignMember[];
  groups: CampaignGroup[];
  supplies: CampaignSupplies;
  loot: CampaignLoot;
  /** Odvedení a zajatí (Ú6.10, Ú6.11). */
  captives: PersonRef[];
  /** Co se vzdanými (u tažení vedeného NPC rozkaz, u živého vedení výchozí volba). */
  surrendered?: SurrenderOrder;
  /** Velí hráčův muž – hráč vede živě (war.md – Velení). */
  liveCommand: boolean;
  /** Přepadení bez opovědi (kronika nájezdu); chybí – s opovědí, nebo neznámo (starší stav). */
  ambush?: true;
  /** Den, kdy tažení poslalo výsledek nájezdu do vsí (`raid-result`) – jen jednou; chybí – ještě ne. */
  raidDay?: number;
  /** Objevené stavby cílové vsi (Ú6.14 – mlha války). */
  discovered: number[];
  /**
   * Rod vůdce – znalost z tažení dostane jen on (plán 2026-11-13 – Úloha 11; muži vazalů ve službě
   * ji svému rodu nedoplní). Chybí – bod z doby před Úlohou 11, rod se dohledá podle `playerId`.
   */
  houseId?: string;
  /**
   * Co muži tažení viděli na cizích mapách (Úloha 11 a kolo oprav – jako `JourneyState.seen`):
   * políčko `x,y` → `SeenCell` (stopa po `JOURNEY.trailStepM`, naposled viděné stavby včetně
   * opevnění, `since`). Jen záznam pro znalost rodu – boj ani pohyb ji nečtou. Takt ji nekopíruje:
   * mění se jen novým objektem. Shromaždiště tu není (hráč ho zná). Chybí – muži zatím cizí mapu
   * neviděli, nebo bod znalost nezapisuje (`recordsKnowledge`).
   */
  seen?: Record<string, SeenCell>;
  /** Proč se vrací (od fáze `returning`). */
  returnReason: CampaignReturnReason | null;
  /**
   * Ves cíle se vzdala (Začít znovu obránce – záměr `turn-back` se `surrender`) a vojsko se obrátilo
   * domů; podle něj opakovaný restart po pádu pozná nájezd, kterému se ves už vzdala. Chybí – ne.
   */
  yielded?: true;
  /** Boj na mapě cíle (war.md – Boj; Ú6.8) – od prvního taktu nájezdu; chybí – zatím nebojovali. */
  battle?: BattleState;
  /**
   * Hosté z ochrany pánem, kteří se v boji bránili se vsí (vassalage.md – Ochrana vojskem): číslo
   * v boji (záporné) → osoba v domovské vsi. Chybí – žádní hosté nebo boj ještě nezačal.
   */
  guards?: CampaignGuard[];
  /**
   * Dny nájezdu (Ú6.7 – war.md, Ves během nájezdu nepracuje): ves → poslední den, na který tažení
   * poslalo `raid-day` (vojsko na její mapě). Chybí – žádná ves vojsko neviděla.
   */
  raidDays?: Record<string, number>;
  /**
   * Poslední den, jehož takty jsou do `tick` všechny spočtené (`dayOfTick(tick + 1) − 1`) – mez
   * bariéry vsí u tažení (Ú6.7, `holdDay`); úložiště ji čte bez hodin. Chybí (bod z doby před
   * Ú6.7) – bere se `day − 1` a doplní ji první takt.
   */
  throughDay?: number;
  /**
   * Posel do cílové vsi už šel (`army-seen` – war.md, Obránci: Kdy); chybí – ještě ne. Jen ze starých
   * bodů – od Úlohy 2 plánu 2026-11-09 se nezapisuje.
   */
  messengerSent?: true;
  /**
   * Domovské vsi mužů (id vsi → místo) – kam jdou hloučky po rozpadu (war.md – Velení: Rozpad);
   * ves, která tu chybí, nahradí shromaždiště.
   */
  homes?: Record<string, CampaignPlace>;
  /**
   * Poslední takt, kdy byl hráč u tažení (záměr `presence` nebo jiný jeho záměr) – živé vedení
   * (war.md – Velení: Hráč odejde od tažení). Chybí – počítá se od prvního taktu pochodu.
   */
  presenceTick?: number;
  /** Hráč je pryč déle než 1 herní den a vede zástupce (NPC); po návratu hráč velení převezme. */
  absent?: true;
  /**
   * Varování, poslové a útěk do hradiště (war.md; plán 2026-11-09): vsi, které vojsko spatřily,
   * jejich poslové a skupiny uprchlíků. Chybí – nikdo vojsko zatím nespatřil (i starší bod).
   */
  alarm?: CampaignAlarm;
}

/**
 * Záměr hráče – úkon tažení. Úloha 6.5: vyrazit ze shromaždiště, jít na místo (živé vedení),
 * obrátit domů. Rozkazy skupin, útok a vzdané doplní Ú6.8, Ú6.11 a Ú6.14.
 */
export type IntentBody =
  | { kind: 'set-out' }
  | { kind: 'march'; to: CampaignPlace }
  /**
   * Obrat domů; `reason` dává NPC velitel (bod zlomu, jídlo, nosnost), hráč obrací rozkazem.
   * `restart` – vůdce dal Začít znovu (war.md – Začít znovu během nájezdu; `restartGame`): obrat
   * platí, ať vede kdokoli (i NPC velitel nebo zástupce), a ze shromaždiště pošle muže domů.
   * `surrender` (jen s `restart`) – Začít znovu dal obránce: ves cíle se vzdala a připadla vůdci
   * (`restartGame` – `surrenderRaidedVillages`). Je to záměr obránce (`isDefenderIntent` – od vůdce
   * se zahodí), přítomnost vůdce nemění a tažení si zapíše `yielded`.
   */
  | { kind: 'turn-back'; reason?: CampaignReturnReason; restart?: true; surrender?: true }
  /** Rozkaz skupině (war.md – Změna rozkazu); `at` = místo pro „držet místo“. */
  | { kind: 'set-order'; group: number; order: GroupOrder; at?: Pos }
  /** Velitel v boji napadne muže (id bojovníka – `Fighter.id`). */
  | { kind: 'strike'; target: string }
  /**
   * Volba ke vzdaným (war.md – Velení, bod 8; Vzdaní, zajetí a výkupné): pobít / odvést / nechat
   * – platí pro vzdané, které vojsko ve skupině `group` dostane; šlechtice a muže rodu u NPC
   * velitele útočník vždy zajme.
   */
  | { kind: 'choose-surrendered'; group: number; choice: SurrenderOrder }
  /** Hráč je u tažení (otevřené tažení ve hře – Ú6.14); bez něj 1 herní den → zástupce, nebo rozpad. */
  | { kind: 'presence' }
  /**
   * Jen NPC velitel (Ú6.12): silné opevnění nenapadne a vezme, co je venku – boj končí, útočníci
   * drží ves mimo útočiště (war.md – Velení; fortifications.md – Postoje vsi s opevněním).
   */
  | { kind: 'plunder' }
  /**
   * Rozkaz obráncům napadené vsi „Probít se“ (fortifications.md – Obrana bez násobku 3, Bod zlomu
   * a probíjení): obránci opevnění `fort` (pořadí na bojišti) se probijí branou na úseku `segment`,
   * bez něj tou s nejméně útočníky (`breakoutGate` – i hlídanou). Dává ho přítomný držitel
   * napadené vsi use-casem `orderBreakout` (jediný cizí záměr, který tažení přijme).
   */
  | { kind: 'breakout'; fort: number; segment?: number }
  /*
   * Záměry obránce varované vsi (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09):
   * dává je hráč, kterému ves patří (`AlarmVillage.owner`), ne vůdce tažení – jako `breakout`.
   */
  /**
   * „Poslat posla“ – ves `village` pošle posla do hradiště pána: `personId` = muž, kterého hráč
   * vybral (muž rodu, který umí jezdit, jede na koni – Martin 9. 11. 2026); chybí – vesničan pěšky
   * (`messengerOf`).
   */
  | { kind: 'alarm-messenger'; village: string; personId?: number }
  /** „Ukrýt v lese“, „Do hradiště – jen lidé“, „Do hradiště – se vším“. */
  | { kind: 'alarm-flee'; village: string; mode: FlightMode }
  /** Hradiště `village` hráče pošle posly do vybraných vsí domény `to`. */
  | { kind: 'alarm-domain'; village: string; to: string[] };

/** Záměr s taktem, ve kterém platí (teď + 2), a pořadím zápisu `seq` (v taktu podle něj). */
export interface CampaignIntent {
  tick: number;
  seq: number;
  byPlayer: string;
  body: IntentBody;
}

/** Mapa políčka pro tažení: krajina, vrstva překážek a vsi na ní. */
export interface CampaignMap {
  landscape: Landscape;
  obstacles: ObstacleLayer | null;
  /** Vsi na mapě – mřížka pochodu bere cesty a opevnění první z nich (víc vsí doplní Ú6.7). */
  villageIds: readonly string[];
}

/**
 * Svět tažení – čte ho čistá `stepCampaign`, proto synchronní. `null` = data ještě nejsou
 * (nenačtená mapa, ves bez potřebného dne – bariéra Ú6.7): takt se zastaví a volající je načte
 * a pokračuje; výsledek se tím nezmění.
 */
export interface CampaignWorld {
  clock: WorldClock;
  landscapeOf(cell: GridCell): CampaignMap | null;
  /**
   * Stav vsi pro den `day` – ke konci dne `day − 1` (bariéra Ú6.7: ves ještě bez dne `day − 1`
   * → null). Ves dopočtená dál (dřív, než ji tažení drželo) dá svůj stav.
   */
  villageAt(villageId: string, day: number): VillageState | null;
  /**
   * Ves `villageId` neexistuje – svět ji zkusil načíst a není (zanikla). Odliší „ves ještě nemá
   * den“ (`villageAt` vrátí null a krok čeká) od „ves není“: výjezd, jehož domovská ves zanikla,
   * skončí (`stepJourney`). Neví-li svět (ves ještě nenačítal, nebo dotaz nemá), false – krok čeká.
   * Tažení se neptá.
   */
  villageGone?(villageId: string): boolean;
  /**
   * Hráč, kterému ves na mapě cíle patří (upozornění „Cizí vojsko u …!“), a jméno vsi; neví-li
   * svět, null a nikdo se nevaruje.
   */
  watcherOf?(villageId: string): { playerId: string; name: string } | null;
  /**
   * Je vojsko hráče `armyPlayerId` pro ves neškodné (vlastní, pána nebo vazalů – `isHarmlessArmy`)?
   * Neví-li svět, vojsko škodí.
   */
  harmless?(villageId: string, armyPlayerId: string): boolean;
  /*
   * Varování, poslové a útěk do hradiště (plán 2026-11-09 – Úloha 6; worker je skládá z portu
   * `AlarmOwnerPort`): `null` = svět ještě nenačetl (takt se zastaví a volající je načte). Bez portu
   * rod vsi neznámý (rozhoduje pravidlo), hradiště ani doména žádné.
   */
  /** Kdo za ves rozhoduje (hráč, NPC rod). */
  alarmOf?(villageId: string): AlarmOwner | null;
  /**
   * Kandidáti hradišť vsi – vsi vlastního rodu (kromě ní) a přímých pánů (Otevřené 1); tažení si
   * vybere ty do `WAR.alarm.refugeMaxCells` políček.
   */
  refugeHostsOf?(villageId: string): { villageId: string; cell: GridCell }[] | null;
  /**
   * Vsi domény hradiště – vlastní rod a přímí vazalové (Otevřené 5); tažení si vybere ty do
   * `WAR.alarm.domainRadiusCells` políček od místa spatření.
   */
  domainOf?(villageId: string): { villageId: string; cell: GridCell }[] | null;
  /**
   * Jméno vsi (kronika a upozornění – „Lidé odešli do hradiště {jméno}.“; Úloha 8). Svět ho zná
   * s načteným stavem vsi; neví-li, null – text bez jména.
   */
  villageNameOf?(villageId: string): string | null;
  /**
   * Mřížky pochodu napříč voláními (worker) – jen zrychlení; bez ní se mřížka staví jednou na
   * volání.
   */
  grids?: MarchGridMemo;
}

/** Druhy upozornění tažení a výjezdu vojvody (aplikace je přidá do `PlayerNoticeKind`). */
export type CampaignNoticeKind =
  | 'campaign-returned'
  | 'foreign-army'
  | 'campaign-disbanded'
  /** Varování, poslové a útěk do hradiště (war.md): ves ví o vojsku, uprchlíci došli / dostiženi, posel chycen. */
  | 'army-warned'
  | 'refuge-arrived'
  | 'refuge-caught'
  | 'messenger-caught'
  /** Výjezd vojvody (lord-control.md – Na místě a návrat): vojvoda se vrátil domů (`stepJourney`). */
  | 'journey-returned';

/** Upozornění pro hráče z taktu tažení nebo výjezdu. */
export interface CampaignNotice {
  playerId: string;
  kind: CampaignNoticeKind;
  payload: Record<string, unknown>;
  gameDay: number;
  /**
   * Klíč upozornění – `camp:<id>:<takt>:n<pořadí>` / `journey:<id>:<takt>:n<pořadí>` doplní krok
   * po každém taktu; doručení téhož klíče podruhé (pád workeru před smazáním schránky) se zahodí.
   */
  ref?: string;
}

/** Události do vsí a upozornění spočtené do kontrolního bodu, které ještě nejsou doručené. */
export interface CampaignOutbox {
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
  /**
   * Znalost map pro rod (výjezd – plán 2026-11-13, Úloha 10; tažení – Úloha 11): sloučí se do
   * úložiště znalosti rodu; sloučení je idempotentní, takže doručení po pádu znovu je bezpečné.
   */
  knowledge?: { houseId: string; cell: GridCell; seen: SeenCell }[];
}

/** Výsledek `stepCampaign`. */
export interface CampaignStep {
  state: CampaignState;
  /** Události do schránek vsí – `ref` = `camp:<id>:<takt>:<n>` (opakování se zahodí). */
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
  /**
   * Znalost map pro rod vůdce (Úloha 11): mapa cíle se stopou a objevenými obydlími, když nájezd
   * skončí, a stopy všech cizích map na konci tažení; bez vydání chybí.
   */
  knowledge?: KnowledgeOut[];
  /** Takt se zastavil – chybí tyto mapy a vsi; null = spočteno do `toTick`. */
  waiting: { cells: GridCell[]; villageIds: string[] } | null;
}
