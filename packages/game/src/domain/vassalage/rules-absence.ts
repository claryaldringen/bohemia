/**
 * Čísla povinností vazala, když hráč nehraje – docs/design/absence.md (Martin 8. 11. 2026: „ano“ –
 * za nepřítomného hráče jedná jeho formální správce podle dohodnutých podmínek; lhůty jsou návrh
 * Clauda). Lhůty jsou v herních dnech: svět je hlídá v kroku světa, ne podle toho, kdo je online –
 * hráč, který odpoví do lhůty, má přednost.
 */
export const ABSENT_VASSAL = {
  /**
   * Roční Odvody 1. 11. (dávka, splátka půjčky, tribut z míru): neodpoví-li hráč do konce roku
   * (60 dní od 1. 11. = 31. 12., ≈ 1,4 h skutečného času), odvede správce domluvené – kolik ves
   * může postrádat (předvyplnění dialogu).
   */
  levyAnswerDays: 60,
  /**
   * Svolání: neodpoví-li hráč do 30 herních dní (≈ 43 min skutečného času), pošle správce domluvené
   * muže rodu, kteří jsou doma a zdraví (jako NPC rod).
   */
  summonsAnswerDays: 30,
  /** Jednání: návrh, na který druhá strana neodpoví do 1 herního roku od posledního kola, vyprší. */
  negotiationExpiryDays: 365,
} as const;
