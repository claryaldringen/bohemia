import { FORTIFICATIONS } from '../rules-fortifications';
import type { FortKind, FortTop, WallKind } from '../types';
import type { FortSegment, Fortification } from './types';

// Vrstvy a stáří úseků opevnění (fortifications.md – Hradby a obrana, Životnost a oprava). Úsek má
// dvě vrstvy – hradbu (stupeň 1–5) a val s příkopem; všechno čtení úseku jde přes `segmentWall`
// a `segmentRampart`, takže uložené hodnoty zůstávají platné (staré vsi se nepřevádějí) a díl, kde
// hradba stojí a val pod ní se teprve staví (`builtDay` null, `topBuiltDay` den), se nikde nečte
// jako nedostavěný. Hradby hnijí, val ne. Čistá matematika bez závislosti na stavu vsi, aby ji
// směl používat i tvar stěn.

/** Dnů v roce pro stáří a údržbu (roční společná práce se dělí 365 dny jako u obydlí). */
export const FORT_DAYS_PER_YEAR = 365;

/** Stupně hradby od nejnižšího (Hradby a obrana – Druhy a postup vylepšení: 1 plot … 5 komorová). */
export const WALL_ORDER: readonly WallKind[] = ['fence', 'palisade', 'walkway', 'crib', 'chamber'];

/** Hradba úseku: druh, den dokončení (null – staví se nebo nedostavěná) a stav 0–1. */
export interface WallLayer {
  kind: WallKind;
  builtDay: number | null;
  state: number;
}

/**
 * Val s příkopem úseku: den dokončení (null – staví se nebo nedostavěný), výška 0–1, doplněný vně
 * hradby (`rampartOutside`) a příkop s vodou (`moatDay`).
 */
export interface RampartLayer {
  builtDay: number | null;
  height: number;
  outside: boolean;
  water: boolean;
}

/**
 * Druh základu úseku – val, bez valu hradba (rozdělané vylepšení – úsek s hotovou palisádou).
 * Jediné místo, kde se čte `kind` úseku; ostatní čtou vrstvy.
 */
export function segmentKind(
  fort: Pick<Fortification, 'kind'>,
  segment: Pick<FortSegment, 'kind'>,
): FortKind {
  return segment.kind ?? fort.kind;
}

/**
 * Nástavba valu na dílu (demolition.md – Opevnění): vlastní nástavba dílu (`FortSegment.top`),
 * jinak nástavba opevnění; `'none'` (zbořená nástavba) i val bez nástavby null. Jen údaj druhu –
 * zda nástavba na dílu stojí, říká `topBuiltDay`. Mimo vrstvy číst `segmentWall`.
 */
export function segmentTop(
  fort: Pick<Fortification, 'top'>,
  segment: Pick<FortSegment, 'top'>,
): FortTop | null {
  const top = segment.top ?? fort.top;
  return top === undefined || top === 'none' ? null : top;
}

/**
 * Hradba úseku, nebo null – úsek je holý val (i se zbořenou nástavbou). Bez valu je hradbou úsek
 * sám (`builtDay`), na valu nástavba (`segmentTop`, `topBuiltDay`). Stav chybí = 1.
 */
export function segmentWall(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'top' | 'builtDay' | 'topBuiltDay'> & { state?: number },
): WallLayer | null {
  const kind = segmentKind(fort, segment);
  const state = segment.state ?? 1;
  if (kind !== 'rampart') return { kind, builtDay: segment.builtDay, state };
  const top = segmentTop(fort, segment);
  if (!top) return null;
  return { kind: top, builtDay: segment.topBuiltDay ?? null, state };
}

/**
 * Val s příkopem úseku, nebo null – úsek je jen hradba. Výška valu dílu, jinak opevnění, jinak
 * plná.
 */
export function segmentRampart(
  fort: Pick<Fortification, 'kind' | 'rampartHeight'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'rampartHeight' | 'rampartOutside' | 'moatDay'>,
): RampartLayer | null {
  if (segmentKind(fort, segment) !== 'rampart') return null;
  return {
    builtDay: segment.builtDay,
    height: segment.rampartHeight ?? fort.rampartHeight ?? 1,
    outside: segment.rampartOutside === true,
    water: segment.moatDay !== undefined,
  };
}

/** Vrstva je a je dostavěná. */
export function layerBuilt(layer: { builtDay: number | null } | null): boolean {
  return layer !== null && layer.builtDay !== null;
}

/**
 * Stojí na dílu aspoň jedna dostavěná vrstva – val, nebo hradba (i na valu, který se teprve staví)?
 * Nezáleží na průlomu ani zboření (`segmentIsOpen`).
 */
export function segmentBuilt(segment: Pick<FortSegment, 'builtDay' | 'topBuiltDay'>): boolean {
  return (
    segment.builtDay !== null || (segment.topBuiltDay !== undefined && segment.topBuiltDay !== null)
  );
}

/**
 * Díl bez stěny (demolition.md – Opevnění): nestojí na něm ani val, ani hradba (nedostavěný),
 * prolomený nebo zbořený. Shnilá hradba na nule je mezera taky, to ale rozhoduje stav
 * (`segmentStands`, `segmentIsGap`).
 */
export function segmentIsOpen(
  segment: Pick<FortSegment, 'builtDay' | 'topBuiltDay' | 'breachedDay' | 'demolishedDay'>,
): boolean {
  return (
    !segmentBuilt(segment) ||
    segment.breachedDay !== undefined ||
    segment.demolishedDay !== undefined
  );
}

/**
 * Den dokončení hradby úseku a její životnost v letech – hnije jen hradba (i na valu); holý val
 * a nedostavěná hradba null.
 */
function rotting(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'top' | 'extraAgeDays'>,
): { builtDay: number; years: number } | null {
  const wall = segmentWall(fort, segment);
  if (!wall || wall.builtDay === null) return null;
  // nedodělaná údržba hradbu postarší (`extraAgeDays`), jako by byla dřív postavená
  return {
    builtDay: wall.builtDay - (segment.extraAgeDays ?? 0),
    years: FORTIFICATIONS.lifeYears[wall.kind],
  };
}

/** Dožilý úsek – hradba (i na valu) za koncem životnosti. */
export function segmentIsOld(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'top' | 'extraAgeDays'>,
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
  segment: Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'top' | 'extraAgeDays'>,
  day: number,
): number {
  if (!segmentBuilt(segment)) return 0;
  const r = rotting(fort, segment);
  if (!r) return 1;
  const over = day - r.builtDay - r.years * FORT_DAYS_PER_YEAR;
  if (over <= 0) return 1;
  return Math.max(0, 1 - over / (FORTIFICATIONS.decayYears * FORT_DAYS_PER_YEAR));
}

/**
 * Stojí úsek (brání a překáží v síti cest)? Neotevřený (`segmentIsOpen`) a – bez dostavěného valu
 * – hradba ne shnilá na nulu (mezera). Val stojí i s shnilou či zbořenou nástavbou.
 */
export function segmentStands(
  fort: Pick<Fortification, 'kind'>,
  segment: Pick<
    FortSegment,
    'kind' | 'builtDay' | 'topBuiltDay' | 'breachedDay' | 'demolishedDay'
  > & {
    state?: number;
  },
): boolean {
  if (segmentIsOpen(segment)) return false;
  return layerBuilt(segmentRampart(fort, segment)) || (segment.state ?? 1) > 0;
}
