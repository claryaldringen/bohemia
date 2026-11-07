/**
 * Čísla pravidel jednání – docs/design/vassalage.md, „Meze – jedno jednání, pauza, blokování“.
 */
export const NEGOTIATION = {
  /** Pauza po odmítnutí: odmítnutý smí témuž rodu poslat nový návrh za 1 skutečný den. */
  pauseAfterRejectMs: 86_400_000,
  /** Nejdelší vzkaz u kola jednání ve znacích. */
  messageMaxChars: 500,
} as const;

/** Důvody odmítnutí akce (texty pro hráče; vassalage.md – Vznik a jednání). */
export const NEGOTIATION_REASONS = {
  isYourLord: 'Je tvým pánem.',
  alreadyVassal: 'Dohoda už trvá.',
  negotiating: 'Jednáte už.',
  rejectedPause: 'Odmítl – zkus zítra.',
  blocked: 'Zablokoval tě.',
  extinct: 'Rod vymřel.',
  yourselfOnly: 'Sám se sebou jednat nelze.',
  notParty: 'Nejsi stranou jednání.',
  notYourTurn: 'Nejsi na tahu.',
  finished: 'Jednání už skončilo.',
  onlyAuthorWithdraws: 'Stáhnout smí jen autor posledního kola.',
  oathChanged: 'Role přísahy se v protinávrhu nemění.',
  badOath: 'Přísaha musí být mezi oběma stranami jednání.',
  messageTooLong: 'Vzkaz je příliš dlouhý.',
} as const;
