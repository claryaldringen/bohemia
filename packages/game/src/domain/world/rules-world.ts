// Čísla pravidel mapy světa – jediné místo (vassalage.md – Místo na mapě světa, Doprava a cílová ves).

export const WORLD = {
  /** Nezávislý nováček: aspoň tolik políček od map ostatních hráčů (vassalage.md – Místo na mapě světa). */
  independentGap: 3,
  /** Pozvaný: aspoň tolik políček od map ostatních hráčů, sousední zůstávají sousedům (tamtéž). */
  invitedGap: 2,
  /** Dny cesty na políčko vzdálenosti, tam i zpět (vassalage.md – Doprava a cílová ves). */
  travelDaysPerCell: 2,
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
