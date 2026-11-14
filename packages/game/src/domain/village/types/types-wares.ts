// Zboží vsi (hides-honey.md): kůže, kožešiny, med a vosk. Vzniká líně (`ensureWares`),
// chybějící hodnota znamená 0. Jmenuje se `wares`, ne `goods` – převod `foreign-goods` maže `goods`.

/** Zásoby zboží vsi; kusy jsou zlomkové jako stáda, med a vosk v kg. */
export interface WaresState {
  /** kůže skotu, koz a prasat (kus) */
  hides: number;
  /** ovčí kožešiny (kus) */
  sheepFurs: number;
  /** kožešiny z lovu a ok – zajíc, liška (kus) */
  wildFurs: number;
  honeyKg: number;
  waxKg: number;
}
