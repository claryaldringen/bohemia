import type {
  PeaceLine,
  RansomLine,
  TradeLine,
  VillageGiftLine,
  WarDemandLine,
} from '../domain/negotiation';
import type { AidLine } from '../domain/vassalage/loan';
import type { House } from './houses';

// Schránka účinků přijatého jednání (audit A2, vassalage.md – Přijetí a schránka účinků): co se po
// transakci přijetí provede – pomoc, dar odúmrti, výkupné, mír, dialogy obchodu a kronika. Zapíše
// se v téže transakci jako přijetí (JSON v úložišti), provede ji web hned po commitu, po pádu
// worker (`deliverPendingAcceptances`). Proto jen data bez tříd a dat (`Date`) – rody jako odkazy.

/** Rod ve schránce: id, hráč (dialogy) a hlava rodu (jméno a vlastní ves pro kroniku). */
export type HouseRef = Pick<House, 'id' | 'playerId' | 'lord'>;

/** Odkaz na rod pro schránku – jen to, co účinky po transakci čtou. */
export const houseRef = (house: HouseRef): HouseRef => ({
  id: house.id,
  playerId: house.playerId,
  lord: house.lord,
});

/** Strany přijetí: kdo přijal (`actor`) a autor posledního kola (`other`). */
export interface Actors {
  actor: HouseRef;
  other: HouseRef;
}

/** Co a komu posílá jedna strana obchodu (dialog `trade-send`). */
export interface TradeSending {
  fromHouse: HouseRef;
  toHouse: HouseRef;
  goods: TradeLine['give'];
  /** Ves příjemce, kam zásilka dojde (domluvená, jinak ves hlavy rodu); null – nemá kam. */
  toVillageId: string | null;
}

/** Poplatek a postoupení míru – připraví se v transakci, provedou se po ní. */
export interface PeaceLater {
  line: PeaceLine;
  sendings: { fromHouse: HouseRef; toHouse: HouseRef; toVillageId: string }[];
  cede: { fromHouseId: string; toHouseId: string; villageIds: string[] } | null;
}

/** Výkupné – zaplatí se a zajatci se propustí po transakci. */
export interface Ransoming {
  line: RansomLine;
  captorHouseId: string;
  payerHouseId: string;
}

/** Dar nebo půjčka zboží – pošle věřitel po transakci. */
export interface AidSending {
  line: Extract<AidLine, { kind: 'gift' | 'loan' }>;
  toVillageId: string | null;
}

/** Darovaná ves – dárce je autor posledního kola. */
export interface VillageGift {
  line: VillageGiftLine;
  fromHouseId: string;
  toHouseId: string;
}

/** Schránka přijetí (`acceptedOf`) – co se po transakci pošle, provede a zapíše do kroniky. */
export interface Accepted {
  negotiationId: string;
  /** Počet kol přijatého jednání – klíč kroniky (`neg:<jednání>:<kola>:…`). */
  rounds: number;
  /** Herní den přijetí – den zápisu do kroniky, i když schránku dokončí worker později. */
  day: number;
  actors: Actors;
  oath: { lord: string; vassal: string } | null;
  aid: AidSending | null;
  trading: { sendings: TradeSending[] } | null;
  gift: VillageGift | null;
  peace: WarDemandLine | PeaceLine | null;
  ransoming: Ransoming | null;
  newcomerHouseId: string | null;
  peaceLater: PeaceLater | null;
}
