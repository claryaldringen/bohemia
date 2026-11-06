import type { AidLine } from '../vassalage/loan';
import type { TermLine } from '../vassalage/terms';

/**
 * Řádek podmínek: přísaha (povinná u nové dohody; u změny podmínek existující dohody chybí)
 * a volitelné řádky – dávka, služba, cílová ves a odměna (`TermLine`, vassalage.md – Podmínky
 * dohody) nebo řádek jednání o pomoci (`AidLine` – žádost, dar, půjčka; vassalage.md – Pomoc na
 * žádost). Strany jsou **rody** (`house.id`), ne hráči (technické rozhodnutí 2 plánu).
 */
export type TermItem = { kind: 'oath'; lord: string; vassal: string } | TermLine | AidLine;

/** Jedno kolo jednání: podmínky jedné strany a volitelný vzkaz. */
export interface NegotiationRound {
  authorHouseId: string;
  items: TermItem[];
  message: string | null;
  at: Date;
}

export type NegotiationStatus = 'open' | 'accepted' | 'rejected' | 'withdrawn';

/** Jednání mezi dvěma rody; strany se střídají, kol je neomezeně. */
export interface Negotiation {
  id: string;
  /** Rod, který jednání zahájil. */
  initiatorHouseId: string;
  /** Rod, kterému byl poslán první návrh. */
  recipientHouseId: string;
  status: NegotiationStatus;
  rounds: NegotiationRound[];
  resolvedAt: Date | null;
}

export type NegotiationResult =
  { ok: true; negotiation: Negotiation } | { ok: false; reason: string };
