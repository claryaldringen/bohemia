import type { CampaignNoticeKind } from '../domain/war';

/**
 * Druhy upozornění mezi hráči. Další úlohy plánu (nástupnictví, jednání, kampaně…) přidávají své
 * druhy do této unie; web k nim doplní text v `playerNoticeLine`.
 */
export type PlayerNoticeKind =
  /** Pozvaný hráč přijal pozvánku a je vazalem pána (úloha 1.8). */
  | 'invite-accepted'
  /** Pozvaný hráč se rozehrál – pán se dozví, že pozvánka nepřišla vniveč (úloha 1.9). */
  | 'invitee-played'
  /** Hráčův muž zemřel – hráč hraje za jiného (nástupnictví hráče, úloha 2.4). */
  | 'player-succession'
  /** Jednání mezi rody (úloha 3.3) – payload `{ negotiationId, houseId, name }`, jen veřejné údaje. */
  | 'negotiation-offer'
  | 'negotiation-counter'
  | 'negotiation-accepted'
  | 'negotiation-rejected'
  | 'negotiation-withdrawn'
  /**
   * Vazalství vypovězeno (úloha 4.2) – dostane ho celý strom kolem obou stran. Payload jen veřejné:
   * `{ lordHouseId, vassalHouseId, lordName, vassalName, byHouseId }`; druhá strana má navíc
   * `message` (vzkaz vypovídajícího).
   */
  | 'vassalage-renounced'
  /**
   * Roční Odvody (úloha 4.4): pánovi dorazí odvod – payload `{ vassalName, parts, arrivesDay,
   * years, message? }` (`parts` = `LevyPart[]`, jen odeslané řádky).
   */
  | 'levy-sent'
  /** Vazalovi se otevřel dialog Odvody – payload `{ lordName, years }`. */
  | 'levy-pending'
  /** Spor (vassalage.md – Mír a spory): pánovi dorazila žaloba – payload `{ disputeId, name, otherName }`. */
  | 'complaint-filed'
  /** Obžalovaný se vyjádřil – payload `{ disputeId, name }`. */
  | 'complaint-answered'
  /**
   * Pán vynesl rozsudek – payload `{ disputeId, lordName, otherName, verdict, asDefendant }`
   * (`verdict` = `Verdict['kind']`).
   */
  | 'judgment-given'
  /** Druhý rod tě zablokoval – payload `{ houseId, name }`. */
  | 'blocked'
  /** Rod ti opověděl válku (war.md – Začátek války) – payload `{ houseId, name }`. */
  | 'war-declared'
  /** Ochrana nového rodu brzy skončí (war.md – Ochrana nového hráče) – payload `{ daysLeft }`. */
  | 'protection-ending'
  /**
   * Průchod (war.md – Pohyb): `passage-announced` – rod ohlásil průchod tvým územím, payload
   * `{ passageId, houseId, name, etaDay }`; `passage-answered` – odpověď, `{ name, trust, message }`.
   */
  | 'passage-announced'
  | 'passage-answered'
  /**
   * Svolání (vassalage.md – Svolání): `summons-open` – pán svolává, `{ name }`; `summons-sent` –
   * vazal poslal muže, `{ name, men, message }`; `summons-lapsed` – nepřišel, `{ name }`.
   */
  | 'summons-open'
  | 'summons-sent'
  | 'summons-lapsed'
  /**
   * Ochrana pánem (vassalage.md – Ochrana vojskem): `protection-requested` – vazal žádá,
   * `{ name, villageId, villageName, message }`; `protection-sent` – pán poslal muže, `{ name, men }`;
   * `protection-recalled` – pán muže odvolal, `{ name }`.
   */
  | 'protection-requested'
  | 'protection-sent'
  | 'protection-recalled'
  /**
   * Tažení (`stepCampaigns`): `campaign-returned` – vojsko se vrátilo domů, payload
   * `{ campaignId, reason }` (`CampaignReturnReason`).
   */
  | CampaignNoticeKind;

/** Upozornění pro hráče – řádek ve frontě; `id` roste, na něm stojí `after`. */
export interface PlayerNotice {
  id: number;
  playerId: string;
  kind: PlayerNoticeKind;
  /** Data podle druhu (jména, čísla); jen JSON. */
  payload: Record<string, unknown>;
  /** Herní den, ve kterém upozornění vzniklo. */
  gameDay: number;
  createdAt: Date;
  /** Kdy je hráč označil za přečtená, jinak null. */
  readAt: Date | null;
}

/** Nové upozornění – `id`, `createdAt` a `readAt` doplní úložiště. */
export type NewPlayerNotice = Omit<PlayerNotice, 'id' | 'createdAt' | 'readAt'>;

/** Port repozitáře upozornění mezi hráči. */
export interface NoticeRepository {
  post(notice: NewPlayerNotice): Promise<void>;
  /** Upozornění hráče s `id` větším než `afterId`, rostoucí podle `id`, nejvýš `limit`. */
  after(playerId: string, afterId: number, limit: number): Promise<PlayerNotice[]>;
  /**
   * Nepřečtená upozornění hráče od nejstaršího, nejvýš `limit`, a zároveň je označí za přečtená
   * (doručí se jen jednou, ani souběžné volání je nevrátí dvakrát).
   */
  takeUnread(playerId: string, limit: number): Promise<PlayerNotice[]>;
  /** Označí za přečtená upozornění hráče s `id` do `upToId` (včetně). */
  markRead(playerId: string, upToId: number): Promise<void>;
}
