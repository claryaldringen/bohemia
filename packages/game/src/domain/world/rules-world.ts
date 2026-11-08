// Čísla pravidel mapy světa – jediné místo (vassalage.md – Místo na mapě světa, Doprava a cílová ves).

export const WORLD = {
  /** Nezávislý nováček: aspoň tolik políček od map ostatních hráčů (vassalage.md – Místo na mapě světa). */
  independentGap: 3,
  /** Pozvaný: aspoň tolik políček od map ostatních hráčů, sousední zůstávají sousedům (tamtéž). */
  invitedGap: 2,
  /** Dny cesty na políčko vzdálenosti, tam i zpět (vassalage.md – Doprava a cílová ves). */
  travelDaysPerCell: 2,
  /**
   * Pojistka hledání místa s podmínkou políčka (suchá políčka, místo kostry – world-skeleton.md –
   * Hustota a stejné podmínky): nejvýš tolik prstenců za posledním obsazeným políčkem. Suchých map
   * je ≈ 4 z 5, takže se hledání v praxi zastaví o pár prstenců dál.
   */
  searchRings: 64,
  /**
   * Ves syna jen na suché mapě (world-skeleton.md – Otevřené otázky 3): když políčkem ve směru
   * odchodu vede kostra, ves vznikne na nejbližším suchém políčku nejvýš tolik prstenců od něj.
   */
  sonDryRings: 2,
} as const;

/** Nabídka pánů nováčkovi (newcomers.md – Nabídka pánů). */
export const NEWCOMERS = {
  /** Kolik rodů smí nováček vybrat. */
  maxChoices: 5,
  /** Týden na odpověď: skutečné dny od první žádosti. */
  waitDays: 7,
} as const;

/** Pozvánkové kódy (vassalage.md – Čísla). */
export const INVITES = {
  /** Nevyužité kódy najednou: nezrušené, nevyužité a ještě platné. */
  maxUnused: 3,
  /** Platnost kódu ve skutečných dnech od vydání. */
  validDays: 14,
  /** Pozvaný „začal hrát“ po tolika různých skutečných dnech ve hře (úloha 1.9). */
  playedDays: 3,
} as const;

/** Uspání vsí nečinných hráčů (absence.md – Zátěž serveru). */
export const ABSENCE = {
  /**
   * Hráč, který nehraje déle než tolik skutečných dnů, má vsi uspané: worker je průběžně
   * nepočítá a dopočítají se, až se jich něco dotkne (Martin 8. 11. 2026: „A“; 3 dny – návrh Clauda).
   */
  sleepDays: 3,
} as const;
