import { FORTIFICATIONS } from '../rules-fortifications';
import type { FortKind, FortTop } from '../types';
import type { FortSegment, Fortification } from './types';

// Stáří úseků opevnění (fortifications.md – Životnost a oprava): plot a palisáda hnijí, val ne.
// Čistá matematika bez závislosti na stavu vsi, aby ji směl používat i tvar stěn.

/** Dnů v roce pro stáří a údržbu (roční společná práce se dělí 365 dny jako u obydlí). */
export const FORT_DAYS_PER_YEAR = 365;

/** Druh, který na úseku stojí (rozdělané vylepšení – úsek s hotovou palisádou). */
function kindOf(fort: Pick<Fortification, 'kind'>, segment: Pick<FortSegment, 'kind'>): FortKind {
  return segment.kind ?? fort.kind;
}

/**
 * Nástavba valu na dílu (demolition.md – Opevnění): vlastní nástavba dílu (`FortSegment.top`),
 * jinak nástavba opevnění; `'none'` (zbořená nástavba) i val bez nástavby null. Jen údaj druhu –
 * zda nástavba na dílu stojí, říká `topBuiltDay`.
 */
export function segmentTop(
  fort: Pick<Fortification, 'top'>,
  segment: Pick<FortSegment, 'top'>,
): FortTop | null {
  const top = segment.top ?? fort.top;
  return top === undefined || top === 'none' ? null : top;
}

/**
 * Díl bez stěny (demolition.md – Opevnění): nedostavěný, prolomený nebo zbořený. Shnilý plot či
 * palisáda na nule je mezera taky, to ale rozhoduje stav (`segmentStands`, `segmentIsGap`).
 */
export function segmentIsOpen(
  segment: Pick<FortSegment, 'builtDay' | 'breachedDay' | 'demolishedDay'>,
): boolean {
  return (
    segment.builtDay === null ||
    segment.breachedDay !== undefined ||
    segment.demolishedDay !== undefined
  );
}

/**
 * Den dokončení části úseku, která hnije, a její životnost v letech: plot a palisáda sám úsek,
 * val s nástavbou jeho nástavbu; holý val nehnije (null).
 */
function rotting(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'top'>,
): { builtDay: number; years: number } | null {
  const kind = kindOf(fort, segment);
  if (kind === 'rampart') {
    const top = segmentTop(fort, segment);
    if (!top || segment.topBuiltDay === undefined || segment.topBuiltDay === null) return null;
    return { builtDay: segment.topBuiltDay, years: FORTIFICATIONS.lifeYears[top] };
  }
  if (segment.builtDay === null) return null;
  return { builtDay: segment.builtDay, years: FORTIFICATIONS.lifeYears[kind] };
}

/** Dožilý úsek – plot či palisáda (nebo nástavba valu) za koncem životnosti. */
export function segmentIsOld(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'top'>,
  day: number,
): boolean {
  const r = rotting(fort, segment);
  return r !== null && day - r.builtDay >= r.years * FORT_DAYS_PER_YEAR;
}

/**
 * Stav úseku 0–1 ke dni `day` (fortifications.md – Životnost a oprava): 100 % do konce životnosti,
 * bez přestavby za ní rovnoměrně na nulu za `decayYears`. Holý val a nestojící úsek: 1, resp. 0.
 */
export function segmentState(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'top'>,
  day: number,
): number {
  if (segment.builtDay === null) return 0;
  const r = rotting(fort, segment);
  if (!r) return 1;
  const over = day - r.builtDay - r.years * FORT_DAYS_PER_YEAR;
  if (over <= 0) return 1;
  return Math.max(0, 1 - over / (FORTIFICATIONS.decayYears * FORT_DAYS_PER_YEAR));
}

/**
 * Stojí úsek (brání a překáží v síti cest)? Hotový, neprolomený, nezbořený a – plot či palisáda –
 * ne shnilý na nulu (mezera). Val stojí i s shnilou či zbořenou nástavbou.
 */
export function segmentStands(
  fort: Pick<Fortification, 'kind'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'breachedDay' | 'demolishedDay'> & {
    state?: number;
  },
): boolean {
  if (segmentIsOpen(segment)) return false;
  return kindOf(fort, segment) === 'rampart' || (segment.state ?? 1) > 0;
}
