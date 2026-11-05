// Čísla pravidel mapy světa – jediné místo (vassalage.md – Místo na mapě světa, Doprava a cílová ves).

export const WORLD = {
  /** Nezávislý nováček: aspoň tolik políček od map ostatních hráčů (vassalage.md – Místo na mapě světa). */
  independentGap: 3,
  /** Pozvaný: aspoň tolik políček od map ostatních hráčů, sousední zůstávají sousedům (tamtéž). */
  invitedGap: 2,
  /** Dny cesty na políčko vzdálenosti, tam i zpět (vassalage.md – Doprava a cílová ves). */
  travelDaysPerCell: 2,
} as const;
