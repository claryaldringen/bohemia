// Zboží vsi (hides-honey.md): kůže, kožešiny, med a vosk. Vzniká líně (`ensureWares`),
// chybějící hodnota znamená 0. Jmenuje se `wares`, ne `goods` – převod `foreign-goods` maže `goods`.

/**
 * Kůže a kožešiny pro domácnosti (hides-honey.md – Zpracování v domácnosti): kůže v kůžích skotu –
 * kozí a prasečí přepočtem plochou (`HIDES.smallHideM2 / HIDES.hideM2`), kožešiny v kusech.
 */
export interface HidesFurs {
  hides: number;
  furs: number;
}

/** Várka v práci: kůže a kožešiny, které se louhují, kvasí a udí – hotové v den `doneDay`. */
export interface CuringBatch extends HidesFurs {
  doneDay: number;
}

/** Zásoby zboží vsi; kusy jsou zlomkové jako stáda, med a vosk v kg. */
export interface WaresState {
  /** surové kůže skotu (krávy, voli) a jelení (kus) */
  hides: number;
  /** surové kůže koz, prasat a divočáků (kus); chybí = 0 */
  smallHides?: number;
  /** ovčí kožešiny (kus) */
  sheepFurs: number;
  /** kožešiny z lovu a ok – zajíc, liška (kus) */
  wildFurs: number;
  honeyKg: number;
  waxKg: number;
  /** Med a vosk v brtích, které ještě nikdo nevybral (kg); chybí = nic. */
  beeTrees?: { honeyKg: number; waxKg: number };
  /**
   * Co domácnostem letos ještě chybí hotové – roční spotřeba nastavená 1. 11. (`setWaresNeed`),
   * ubývá hotovými várkami. Chybí = nic.
   */
  need?: HidesFurs;
  /** Várky v práci – hotový výrobek vznikne až v den dokončení. Chybí = žádné. */
  curing?: CuringBatch[];
}
