import type { WorldCell } from './settlements';

// Ohlášený průchod vojska územím cizího rodu (docs/design/war.md – Pohyb: Průchod územím
// neutrálního rodu). Ohlášení je vzkaz rodu – které mapy, zhruba kdy; odpověď nic nezavazuje.
// Martin 7. 11. 2026: ohlášení platí jen pro jedno tažení – po jeho návratu domů (nebo rozpadu)
// skončí (`voidOfCampaign`). Ohlášení před vysláním čeká (`campaignId` null) a vyslání ho naváže na
// nové tažení rodu (`bindToCampaign`). Válka mezi rody ho zruší dřív (`voidBetween`).

export interface Passage {
  id: string;
  /** Rod, jehož vojsko projde. */
  fromHouseId: string;
  /** Rod, jehož územím vojsko projde. */
  toHouseId: string;
  /** Políčka světa (mapy), kudy vojsko půjde. */
  cells: WorldCell[];
  /** Zhruba kdy – herní den (jen pro hráče, platnost neomezuje). */
  etaDay: number;
  message: string;
  announcedAt: Date;
  announcedDay: number;
  /** Tažení, pro které ohlášení platí; null – čeká na vyslání tažení rodu. */
  campaignId: string | null;
  /** Odpověď: true – věří, false – „Nevěřit“, null – bez odpovědi (věří, spící hráč nic nedělá). */
  trust: boolean | null;
  reply: string | null;
  answeredAt: Date | null;
  /** Kdy ohlášení přestalo platit (začala válka mezi rody); null – platí. */
  voidedAt: Date | null;
}

export type NewPassage = Pick<
  Passage,
  'fromHouseId' | 'toHouseId' | 'cells' | 'etaDay' | 'message' | 'announcedAt' | 'announcedDay'
>;

/** Port repozitáře ohlášených průchodů. */
export interface PassageRepository {
  announce(input: NewPassage): Promise<Passage>;
  byId(id: string): Promise<Passage | null>;
  /**
   * Podmíněně zapíše odpověď: jen dosud nezodpovězené a platné ohlášení – ze dvou souběžných
   * odpovědí projde jedna. True při zápisu.
   */
  answer(id: string, trust: boolean, reply: string | null, at: Date): Promise<boolean>;
  /** Platná ohlášení rodu `fromHouseId` rodu `toHouseId`, nejstarší napřed. */
  validBetween(fromHouseId: string, toHouseId: string): Promise<Passage[]>;
  /** Platná ohlášení rodu `toHouseId` bez odpovědi, nejstarší napřed (panel války). */
  openTo(toHouseId: string): Promise<Passage[]>;
  /** Vyslané tažení rodu `fromHouseId` převezme jeho čekající ohlášení. Vrací jejich počet. */
  bindToCampaign(fromHouseId: string, campaignId: string): Promise<number>;
  /** Tažení skončilo (vrátilo se domů, nebo se rozpadlo): jeho ohlášení přestanou platit. */
  voidOfCampaign(campaignId: string, at: Date): Promise<number>;
  /** Mezi rody začala válka: ohlášení v obou směrech přestanou platit. Vrací jejich počet. */
  voidBetween(a: string, b: string, at: Date): Promise<number>;
}

/** Kryje platné ohlášení tažení `campaignId`, kterému rod věří, políčko `cell`? */
export function passageCovers(
  passages: readonly Passage[],
  cell: WorldCell,
  campaignId: string,
): boolean {
  return passages.some(
    (p) =>
      p.voidedAt === null &&
      p.campaignId === campaignId &&
      p.trust !== false &&
      p.cells.some((c) => c.x === cell.x && c.y === cell.y),
  );
}
