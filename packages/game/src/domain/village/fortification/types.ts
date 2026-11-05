import type { FortKind, FortTop, SquareGrid, TileCell } from '../types';
import type { FortGate } from './gates';

// Opevnění ve stavu vsi (fortifications.md – Obvod, Cena a stavba): plocha po čtvercích, druh,
// nástavba, úseky se dnem dokončení a brány. Tvar (obvod, úseky, pás) se z plochy vždy znovu
// spočítá stejnou funkcí (`fortificationArea`, `fortificationOutline`, `fortSegments`) – ukládá
// se jen to, co tvar neurčí.

/** Úsek opevnění ve stavu vsi – jedna strana okrajového čtverce (`FortSegmentShape.index`). */
export interface FortSegment {
  index: number;
  /** Den dokončení úseku (stáří); dokud se staví nebo po zrušení stavby nedostavěný, null. */
  builtDay: number | null;
  /** Nástavba na valu (`Fortification.top`) – den dokončení na úseku; bez nástavby chybí. */
  topBuiltDay?: number | null;
  /** Stav úseku 0–1 (chátrání – další úlohy F5); nový úsek 1. */
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
  /** Mřížka čtverců plochy; null = mřížka krajiny. */
  grid: SquareGrid | null;
  /** Nakreslené čtverce plochy (díry se zaplní při výpočtu tvaru). */
  cells: TileCell[];
  kind: FortKind;
  /** Plot nebo palisáda na koruně valu (jen u valu); chybí = val bez nástavby. */
  top?: FortTop;
  /** Úseky v pořadí obvodu (po směru hodin od severu). */
  segments: FortSegment[];
  /** Brány seřazené podle úseku (`autoGates`, `addGate`). */
  gates: FortGate[];
  /** Výška valu 0–1 (údržba valu – další úlohy F5); chybí = plná. */
  rampartHeight?: number;
}

/**
 * Co stavba opevnění dělá (`Construction.fortWork`): nové opevnění, vylepšení plotu na palisádu,
 * nástavba na val; přestavba dožilého úseku a obnova valu jsou další úlohy F5.
 */
export type FortBuildWork = 'build' | 'upgrade' | 'top' | 'rebuild' | 'restore';

/** Úsek v plánu stavby – pořadí práce a práce úseku (čd bez kácení). */
export interface FortSegmentWork {
  index: number;
  cost: number;
}
