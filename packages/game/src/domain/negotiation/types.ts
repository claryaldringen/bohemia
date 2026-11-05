/**
 * Řádek podmínek. Zatím jen přísaha; dávky, služba a další řádky přibudou v úloze 4.2.
 * Strany jsou **rody** (`house.id`), ne hráči (technické rozhodnutí 2 plánu).
 */
export type TermItem = { kind: 'oath'; lord: string; vassal: string };

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
