import type { Point } from '../polygon';
import type { FortKind, FortTop, SquareGrid, TileCell } from '../types';
import type { FortGate } from './gates';

// Opevnění ve stavu vsi (fortifications.md – Obvod, Cena a stavba): body obvodu, druh, nástavba,
// úseky se dnem dokončení a brány. Tvar (křivka, úseky, pás) se z bodů vždy znovu spočítá stejnou
// funkcí (`fortificationOutline`, `fortSegments`) – ukládá se jen to, co tvar neurčí. Opevnění
// nakreslená dřív po čtvercích (`grid`, `cells`) se při načtení vsi převedou na body (`convert.ts`).

/** Úsek opevnění ve stavu vsi – `FortSegmentShape.index` (stejně dlouhé úseky ≈ 15 m). */
export interface FortSegment {
  index: number;
  /** Den dokončení úseku (stáří); dokud se staví nebo po zrušení stavby nedostavěný, null. */
  builtDay: number | null;
  /** Nástavba na valu (`Fortification.top`) – den dokončení na úseku; bez nástavby chybí. */
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
}

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
 * nástavba na val, přestavba dožilých úseků (`rebuild`) a obnova valu (`restore`).
 */
export type FortBuildWork = 'build' | 'upgrade' | 'top' | 'rebuild' | 'restore';

/** Úsek v plánu stavby – pořadí práce a práce úseku (čd bez kácení). */
export interface FortSegmentWork {
  index: number;
  cost: number;
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
