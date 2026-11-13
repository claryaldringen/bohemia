import type { NewVillageEvent } from '../village/core/inbox';
import type { GridCell } from '../village/people/world-grid';
import type { PersonRef } from '../village/types';
import type { CampaignGroup, CampaignNotice, CampaignVillage } from './campaign-types';
import type { Pos } from './march-grid';
import type { KnowledgeOut, SeenCell } from './seen';

// Stav výjezdu vojvody (lord-control.md – Pravidla; plán 2026-11-13 – Úloha 1). Výjezd stojí vedle
// tažení – nemá válku ani cílovou ves – a sdílí s ním takty, pohyb po mapách a svět. Stav je JSON
// (kontrolní bod v úložišti): po načtení z JSON musí výjezd pokračovat bit po bitu stejně.

/** Fáze výjezdu: venku (jede nebo čeká na místě) → návrat domů → konec. */
export type JourneyPhase = 'out' | 'returning' | 'done';

/** Muž výjezdu – osoba zůstává ve stavu domovské vsi (`away: journey`), tady je její stav na cestě. */
export interface JourneyMember {
  ref: PersonRef;
  /** Vojvoda – hráčův muž; bez něj se zbytek vrací sám a rozkazy hráče neplatí. */
  lord: boolean;
  /** Na svém koni (lord-control.md – Kdo jede: Kůň). */
  mounted: boolean;
  /** Síla při vyslání (`lineManStrength`). */
  strength: number;
  /** Dovednost boje 0–100 při vyslání (šelmy – lord-control.md, Nebezpečí). */
  fight: number;
  /** Zdraví 0–100 (`WAR.combat.health`); zima ani hlad ho na výjezdu neubírají. */
  health: number;
  /** Pěší raněný zpomalí skupinu jako u vojska (war.md – Ztráty). */
  wounded: boolean;
  /** Den, kdy byl raněn; chybí – není raněný. */
  woundedDay?: number;
  /** `fallen` – padl, nebo zemřel doma (stáří, hlad) a ve stavu domovské vsi už není. */
  status: 'active' | 'fallen';
}

/** Výjezd – celý stav, ze kterého se počítá další takt. */
export interface JourneyState {
  kind: 'journey';
  id: string;
  /** Seed výjezdu – náhoda jen z něj a dne nebo taktu (šelmy). */
  seed: number;
  /** Poslední spočtený takt (stav na jeho konci). */
  tick: number;
  /** Herní den posledního spočteného taktu – denní krok (členové doma) jednou za den. */
  day: number;
  /**
   * Poslední den, jehož takty jsou do `tick` všechny spočtené (`dayOfTick(tick + 1) − 1`) – mez
   * bariéry vsí jako u tažení (`CampaignState.throughDay`); úložiště ji čte bez hodin.
   */
  throughDay?: number;
  phase: JourneyPhase;
  /** Hráč, jehož vojvoda jede – rozkazy jen od něj. */
  playerId: string;
  houseId: string;
  /** Jméno vojvody do upozornění („Bořivoj se vrátil.“). */
  leaderName: string;
  /** Domovská ves – odtud výjezd vyjel a sem se vrací. */
  home: CampaignVillage;
  members: JourneyMember[];
  /** Právě jedna skupina – tvar tažení, ať bariéra vsí čte `groups[].cell` stejně. */
  groups: CampaignGroup[];
  /**
   * Takt posledního dojetí – od něj běží čekání na místě (`JOURNEY.waitDays`); null = skupina jede.
   */
  arrivedTick: number | null;
  /**
   * Co muži za jízdy viděli (lord-control.md – Co vojvoda vidí; Úloha 6) – podle políčka `x,y`:
   * stopa a naposled viděné stavby a opevnění. Domovská mapa tu není – hráč ji zná celou. Chybí =
   * zatím nic (starší body výjezdů).
   */
  seen?: Record<string, SeenCell>;
}

/** Rozkaz hráče (lord-control.md – Rozkazy); nový rozkaz kdykoli nahradí starý. */
export type JourneyOrder =
  /** „Jdi sem“ – místo na mapě, na které skupina právě je. */
  | { kind: 'go'; pos: Pos }
  /**
   * „Přes okraj“ – sousední políčko (8 směrů): skupina dojde k okraji, objeví se na opačném okraji
   * sousední mapy a tam zastaví. Nesousední políčko se zahodí.
   */
  | { kind: 'cross'; cell: GridCell }
  /** „Domů“ – nejkratší cestou do vlastní vsi. */
  | { kind: 'home' };

/** Rozkaz s taktem, ve kterém platí, a pořadím zápisu `seq` (v taktu podle něj) – jako u tažení. */
export interface JourneyIntent {
  tick: number;
  seq: number;
  byPlayer: string;
  body: JourneyOrder;
}

/** Výsledek `stepJourney`. */
export interface JourneyStep {
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
