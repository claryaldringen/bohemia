import type { FlightMode, HerdSpecies, RefugeePerson } from '../village/types';
import type { GridCell } from '../village/people/world-grid';
import type { CampaignLeg, CampaignPlace } from './campaign-types';
import type { Pos } from './march-grid';

// Varování, poslové a útěk do hradiště v tažení útočníka (war.md – Varování, poslové a útěk do
// hradiště, schváleno 9. 11. 2026; plán 2026-11-09 – Rozhodnutí plánu). Co se hýbe v taktech
// (vesničan běžící domů, posel, skupina uprchlíků), žije v tažení – jen tam je poloha vojska
// a deterministický takt. Stav je JSON (kontrolní bod): žádné `Map`, `Set` ani `undefined` v polích,
// pořadí pevné – vsi podle `villageId`, poslové a skupiny podle `refId`.

/**
 * Kdo za ves rozhoduje (plán – Otevřené 6): hráč (`playerId`), nebo NPC rod (`npc`); `houseId` = rod
 * vsi. Zapíše se při prvním spatření ze světa (`CampaignWorld.alarmOf`); dokud ho svět nedodá,
 * `{ playerId: null, npc: true, houseId: null }` (návrh Clauda – rod neznámý).
 */
export interface AlarmOwner {
  playerId: string | null;
  npc: boolean;
  houseId: string | null;
}

/** Ves, která vojsko tažení spatřila, nebo se o něm dozvěděla od posla. */
export interface AlarmVillage {
  villageId: string;
  /** Kdo rozhoduje – zapsané při prvním spatření. */
  owner: AlarmOwner;
  /** Takt prvního spatření (vesničanem nebo poslem). */
  seenTick: number;
  /** Kde vojsko viděli – z toho ves odhaduje, zda útěk stihne (mlha války: trasu vojska nezná). */
  seenAt: CampaignPlace;
  /** Takt, kdy ves ví (doběh vesničana, příchod posla); větší než takt = ještě neví. */
  warnTick: number;
  by: 'villager' | 'messenger';
  /** `refId` posla, kterého ves poslala; chybí – žádného. */
  messenger?: string;
  /** `refId` skupiny uprchlíků vsi; chybí – nikdo neodešel. */
  flight?: string;
  /** Kdo volbu udělal (hráč, nebo pravidlo správce); chybí – zatím nikdo. */
  decided?: 'player' | 'steward';
  /**
   * Kandidáti hradišť do `WAR.alarm.refugeMaxCells` políček (id vsí – pro bariéru dopočtu; Úloha 6
   * je zapíše, jakmile ves do varování vstoupí); chybí – svět kandidáty nezná (bez portu).
   */
  hosts?: string[];
  /**
   * `refId` poslů, které ves (hradiště) rozeslala do vsí své domény (Úloha 6, Otevřené 5); chybí –
   * zatím nikoho. NPC hradiště rozešle posly jednou, hned jak doběhne posel vsi.
   */
  domain?: string[];
  /**
   * Políčko vsi (Úloha 5 – ves varovaná poslem vojsko na své mapě neviděla); chybí – políčko
   * spatření (`seenAt.cell` – vesničan vojsko viděl na mapě vsi).
   */
  cell?: GridCell;
}

/** Kdo se hýbe po mapách jako skupina vojska: políčko, poloha, zbývající políčka, úsek a cíl. */
export interface AlarmMover {
  cell: GridCell;
  pos: Pos;
  /** Zbývající políčka světa k cíli (bez `cell`). */
  route: GridCell[];
  /** Úsek po současné mapě; null = spočte se. */
  leg: CampaignLeg | null;
  target: CampaignPlace;
}

/** Posel z vsi do hradiště (plán – Otevřené 4). */
export interface AlarmMessenger extends AlarmMover {
  refId: string;
  fromVillageId: string;
  /** Osoba ve stavu `fromVillageId`. */
  personId: number;
  toVillageId: string;
  /**
   * Jede na koni (Martin 9. 11. 2026: jen muž rodu, který umí jezdit a má jezdeckého koně – volba
   * hráče; vesničan jde pěšky).
   */
  mounted: boolean;
  /**
   * `arrived` – doručil (domů za tolik, kolik běžel), `caught` – chycen, `recalled` – tažení skončilo
   * dřív, než doběhl (vojsko odtáhlo – vrátí se domů).
   */
  status: 'running' | 'arrived' | 'caught' | 'recalled';
  /** Takt odchodu z vsi. */
  departTick: number;
  /** Takt doručení, chycení nebo konce tažení; chybí – běží. */
  doneTick?: number;
}

/** Skupina uprchlíků z vsi do hradiště nebo do lesa (plán – Otevřené 7, 8). */
export interface AlarmFlight extends AlarmMover {
  refId: string;
  villageId: string;
  mode: FlightMode;
  /** Hradiště; null = les na mapě vsi. */
  hostVillageId: string | null;
  /** Kdo odešel (při odchodu, id vzestupně); kdo cestou padl nebo byl odveden, je v `lost`. */
  people: RefugeePerson[];
  /** Zásoby, které skupina nese (kg obilí); jedí z nich cestou. */
  foodKg: number;
  herd: Record<HerdSpecies, number>;
  /** Vozy se spřežením. */
  carts: number;
  /**
   * Co skupina z vsi odnesla při odchodu (`refuge-depart`) – v den odchodu to tažení samo odečte
   * od stavu vsi (`alarmTaken`; Úloha 8, Review Focus 2). Zapisuje `departFlight`; chybí – jako
   * `foodKg` a `herd`.
   */
  carried?: { foodKg: number; herd: Record<HerdSpecies, number> };
  /** Ranění ve skupině (zpomalí ji); chybí – nikdo. */
  wounded?: number;
  /**
   * `marching` – jde (i po dostižení se zbylými), `arrived` – v hradišti, `hidden` – v lese,
   * `caught` – dostižena a nikdo nejde dál.
   */
  status: 'marching' | 'arrived' | 'hidden' | 'caught';
  departTick: number;
  /** Takt příchodu, ukrytí nebo dostižení; chybí – jde. */
  doneTick?: number;
  /** Takt, kdy ji dostihlo vojsko a vzdala se (Otevřené 8 – jen jednou); chybí – nedostižena. */
  caughtTick?: number;
  /** Kdo ze skupiny při dostižení padl, byl odveden nebo zajat (id vzestupně); chybí – nikdo. */
  lost?: number[];
}

/** Varování v tažení (`CampaignState.alarm`); chybí – žádná ves vojsko zatím nespatřila. */
export interface CampaignAlarm {
  /** Seřazené podle `villageId`. */
  villages: AlarmVillage[];
  /** Seřazené podle `refId`. */
  messengers: AlarmMessenger[];
  /** Seřazené podle `refId`. */
  flights: AlarmFlight[];
  /** Další číslo – `refId` = `${campaignId}:a<nextRef>`. */
  nextRef: number;
}
