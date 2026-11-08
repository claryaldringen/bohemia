import type { Point } from '../polygon';
import type { FortKind, FortTop, SquareGrid, TileCell } from '../types';
import type { FortGate } from './gates';

// Opevnění ve stavu vsi (fortifications.md – Obvod, Cena a stavba): body obvodu, druh, nástavba,
// úseky se dnem dokončení a brány. Tvar (křivka, úseky, pás) se z bodů vždy znovu spočítá stejnou
// funkcí (`fortificationOutline`, `fortSegments`) – ukládá se jen to, co tvar neurčí. Opevnění
// nakreslená dřív po čtvercích (`grid`, `cells`) se při načtení vsi převedou na body (`convert.ts`).

/**
 * Úsek opevnění ve stavu vsi – `FortSegmentShape.index` (stejně dlouhé úseky ≈ 15 m). Úsek má dvě
 * vrstvy – hradbu a val s příkopem (fortifications.md – Hradby a obrana); čte se přes vrstvy
 * `segmentWall` / `segmentRampart` (`fortification/life.ts`), ne přímo z `builtDay`.
 */
export interface FortSegment {
  index: number;
  /**
   * Den dokončení základu úseku (stáří) – val, bez valu hradba; dokud se staví nebo po zrušení
   * stavby nedostavěný, null. Hradba na valu může stát i s nedostavěným valem (`topBuiltDay`).
   */
  builtDay: number | null;
  /** Hradba na valu (`Fortification.top`) – den dokončení na úseku; bez hradby chybí. */
  topBuiltDay?: number | null;
  /** Stav úseku 0–1 (chátrání – `segmentState`); nový úsek 1. */
  state: number;
  /** Den průlomu (válka – další úlohy F5); chybí = celý. */
  breachedDay?: number;
  /**
   * Druh, který na úseku stojí, když se liší od `Fortification.kind` – rozdělané vylepšení plotu
   * na palisádu (úsek s hotovou palisádou `'palisade'`, ostatní dál plot). Chybí = druh opevnění.
   */
  kind?: FortKind;
  /**
   * Den zboření dílu hráčem (demolition.md – Opevnění): plot a palisáda zbořené, val srovnaný.
   * Zbořený díl je mezera jako průlom, nestárne a obyvatelé ho nepřestaví. Chybí = nezbořený.
   */
  demolishedDay?: number;
  /**
   * Den zboření části dílu s branou před bránou (od začátku dílu po okraj brány) – zboření
   * úseku sousedního s dílem brány zboří jen hradbu úseku, brána a zbytek dílu stojí
   * (demolition.md – Opevnění; návrh Clauda). Mezera jako zbořený díl; chybí = část stojí.
   * Mají ji jen díly s branou.
   */
  demolishedBeforeGate?: number;
  /** Totéž pro část dílu za bránou (od okraje brány po konec dílu). */
  demolishedAfterGate?: number;
  /**
   * Nástavba valu na dílu, když se liší od `Fortification.top` – `'none'` = nástavba zbořená
   * (val bez nástavby). Chybí = nástavba opevnění (`segmentTop`).
   */
  top?: FortTop | 'none';
  /**
   * Val doplněný vně stojící hradby (fortifications.md – Hradby a obrana, Druhy): pás dílu sahá
   * ven přes křivku (`segmentBand`). Chybí = val pod hradbou na křivce, nebo bez valu.
   */
  rampartOutside?: true;
  /** Výška valu dílu 0–1 (údržba valu); chybí = `Fortification.rampartHeight`. */
  rampartHeight?: number;
  /** Den napuštění vodního příkopu (Hradby a obrana – Druhy); chybí = suchý příkop. */
  moatDay?: number;
  /** Stárnutí hradby navíc za nedodělanou údržbu (dny; Životnost a údržba); chybí = 0. */
  extraAgeDays?: number;
  /** Den průlomu ohněm (válka – scéna kreslí ohořelý průlom); chybí = ne. */
  burnedDay?: number;
  /**
   * Vlastní hradba části dílu s branou před bránou (od začátku dílu po okraj brány), když se liší
   * od dílu – vylepšení úseku sahá přesně po okraj brány (Martin 8. 11. 2026: „Hradba je hradba,
   * brána je brána.“; návrh Clauda). Vrstvy dílu pak drží bránu a část bez vlastní hradby. Čte
   * se přes `gatePartView` (`fortification/gate-parts.ts`). Chybí = hradba dílu.
   */
  beforeGate?: FortGatePart;
  /** Totéž pro část dílu za bránou (od okraje brány po konec dílu). */
  afterGate?: FortGatePart;
}

/**
 * Vrstvy části dílu s branou (`FortSegment.beforeGate` / `afterGate`): druh, nástavba valu, dny
 * dokončení, stav, stárnutí navíc a val vně hradby s příkopem – týž význam jako na dílu (chybějící
 * druh = druh opevnění). Průlom a zboření celého dílu zůstávají dílu.
 */
export type FortGatePart = Pick<
  FortSegment,
  | 'kind'
  | 'top'
  | 'builtDay'
  | 'topBuiltDay'
  | 'state'
  | 'extraAgeDays'
  | 'rampartOutside'
  | 'rampartHeight'
  | 'moatDay'
>;

/** Opevnění vsi – hotové i rozestavěné (úseky s `builtDay` null). */
export interface Fortification {
  id: number;
  /**
   * Body obvodu – hladká uzavřená křivka přes ně je vnější okraj (Obvod; Martin 7. 11. 2026).
   * Chybí jen u opevnění po čtvercích, která se ještě nepřevedla (`withFortPoints`).
   */
  points?: Point[];
  /** Staré opevnění po čtvercích – mřížka čtverců plochy (null = krajina); po převodu chybí. */
  grid?: SquareGrid | null;
  /** Staré opevnění po čtvercích – nakreslené čtverce plochy; po převodu chybí. */
  cells?: TileCell[];
  kind: FortKind;
  /** Plot nebo palisáda na koruně valu (jen u valu); chybí = val bez nástavby. */
  top?: FortTop;
  /** Úseky v pořadí obvodu (po směru hodin od severu). */
  segments: FortSegment[];
  /** Brány seřazené podle úseku (`autoGates`, `addGate`). */
  gates: FortGate[];
  /** Výška valu 0–1 (údržba valu – `rampartMaintenance`); chybí = plná. */
  rampartHeight?: number;
}

/**
 * Co stavba opevnění dělá (`Construction.fortWork`): nové opevnění, vylepšení plotu na palisádu,
 * nástavba na val, přestavba dožilých úseků (`rebuild`), obnova valu (`restore`), zboření plotu,
 * palisády či nástavby valu (`demolish`) a srovnání valu (`level`) v úseku mezi branami.
 */
export type FortBuildWork =
  | 'build'
  | 'upgrade'
  | 'top'
  | 'rebuild'
  | 'restore'
  | 'demolish'
  | 'level'
  /** Doplnění valu pod úsek (Hradby a obrana – Druhy; zatím nevzniká). */
  | 'rampart'
  /** Napuštění příkopu (Hradby a obrana – Druhy; zatím nevzniká). */
  | 'moat'
  /** Klešťová brána nebo věž nad branou (`Construction.fortGate`; zatím nevzniká). */
  | 'gate';

/** Úsek v plánu stavby – pořadí práce a práce úseku (čd bez kácení). */
export interface FortSegmentWork {
  index: number;
  cost: number;
  /**
   * Zboření jen části dílu s branou (`before` – před bránou, `after` – za ní); chybí = celý díl.
   */
  part?: 'before' | 'after';
  /**
   * Zboření (`demolish`): klády dílu zpět, necelé – podíl × klády dílu × stav v den zahájení
   * (demolition.md – Čísla); celé se dají na hromadu jednou za celou stavbu. Jinak chybí.
   */
  logs?: number;
}

/**
 * Signál hrozby vsi (fortifications.md – Hrozba): vnější událost, kterou ves dostane ze schránky
 * (`threat-signal`). `day` = den události, u `war` začátek války; `endDay` = den míru (chybí –
 * válka trvá).
 */
export interface ThreatSignal {
  kind: 'raid-here' | 'raid-house' | 'army-seen' | 'war';
  day: number;
  endDay?: number;
}
