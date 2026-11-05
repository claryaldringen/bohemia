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
  | 'player-succession';

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
