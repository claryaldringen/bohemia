import type { WorldClock } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import type { NewVillageEvent } from '../village/inbox';
import type { PersonRef, VillageState } from '../village/types';
import type { GridCell } from '../village/world-grid';
import type { Pos } from './march-grid';

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
  /** Zdraví 0–100 (`WAR.combat.health`). */
  health: number;
  /** Podíl plné síly 0–1 (mráz – `frostDay`). */
  vigor: number;
  /** Pěší raněný – zpomalí skupinu (war.md – Ztráty); nastaví boj (Ú6.8). */
  wounded: boolean;
  /** Má v cílové vsi blízké příbuzné – dezertuje častěji a cíl varuje (war.md – Vojsko). */
  kin?: true;
  /** Id skupiny (`CampaignGroup.id`). */
  group: number;
  status: CampaignMemberStatus;
}

/** Rozkaz skupiny (war.md – Boj; zapojí Ú6.8). */
export type GroupOrder = 'follow-leader' | 'attack-all' | 'hold-place';

/** Místo ve světě: políčko mřížky a bod na jeho mapě (m). */
export interface CampaignPlace {
  cell: GridCell;
  pos: Pos;
}

/** Ves tažení (shromaždiště, cíl) – id vsi a její místo. */
export interface CampaignVillage extends CampaignPlace {
  villageId: string;
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
}

/** Proč se tažení vrací. */
export type CampaignReturnReason = 'arrived' | 'supplies' | 'order';

/** Tažení – celý stav, ze kterého se počítá další takt. */
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
  /** Objevené stavby cílové vsi (Ú6.14 – mlha války). */
  discovered: number[];
  /** Proč se vrací (od fáze `returning`). */
  returnReason: CampaignReturnReason | null;
}

/**
 * Záměr hráče – úkon tažení. Úloha 6.5: vyrazit ze shromaždiště, jít na místo (živé vedení),
 * obrátit domů. Rozkazy skupin, útok a vzdané doplní Ú6.8, Ú6.11 a Ú6.14.
 */
export type IntentBody =
  { kind: 'set-out' } | { kind: 'march'; to: CampaignPlace } | { kind: 'turn-back' };

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
  /** Stav vsi pro den `day` (Ú6.7: ke konci dne `day − 1`, jinak null). */
  villageAt(villageId: string, day: number): VillageState | null;
}

/** Druhy upozornění tažení (aplikace je přidá do `PlayerNoticeKind`). */
export type CampaignNoticeKind = 'campaign-returned';

/** Upozornění pro hráče z taktu tažení. */
export interface CampaignNotice {
  playerId: string;
  kind: CampaignNoticeKind;
  payload: Record<string, unknown>;
  gameDay: number;
}

/** Události do vsí a upozornění spočtené do kontrolního bodu, které ještě nejsou doručené. */
export interface CampaignOutbox {
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
}

/** Výsledek `stepCampaign`. */
export interface CampaignStep {
  state: CampaignState;
  /** Události do schránek vsí – `ref` = `camp:<id>:<takt>:<n>` (opakování se zahodí). */
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
  /** Takt se zastavil – chybí tyto mapy a vsi; null = spočteno do `toTick`. */
  waiting: { cells: GridCell[]; villageIds: string[] } | null;
}
