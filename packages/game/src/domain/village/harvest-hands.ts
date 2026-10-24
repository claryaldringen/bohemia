// Žně a výmlat všemi rukama (fields.md – Žně všemi rukama; Martin 24. 10. 2026: „Dílny i vojvodova
// rodina“) – jedno místo pravdy pro plán osevu (`sowingCapacity`) i práci dne (`work()`).
import { dateOfDayIndex } from '../calendar';
import { CROP_ORDER, CROP_WINDOWS, type WindowSegment } from './rules';
import { sheafWork, THRESHED_CROPS } from './threshing';
import type { VillageState } from './types';
import { activeTasks, neededTaskRemaining, planCrops } from './year-plan';

const EPSILON = 1e-9;

const inSegments = (segments: readonly WindowSegment[], month: number): boolean =>
  segments.some(([from, to]) => month >= from && month <= to);

/**
 * Měsíce oken žní a výmlatu všech plodin (CROP_WINDOWS – ozim a luštěniny žeň v červenci, výmlat
 * v srpnu, jař žeň v srpnu, výmlat v září).
 */
export const HARVEST_HANDS_MONTHS: ReadonlySet<number> = new Set(
  CROP_ORDER.flatMap((crop) =>
    Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (month) =>
        inSegments(CROP_WINDOWS[crop].harvest, month) ||
        inSegments(CROP_WINDOWS[crop].thresh, month),
    ),
  ),
);

/**
 * Je dnes žňový den (fields.md – Žně všemi rukama)? Měsíc okna žní nebo výmlatu a ves má v jeho
 * okně ještě co sklízet (plán) nebo mlátit (snopy) – pak jdou na pole i řemeslníci se syny
 * a cvičící muži vojvodovy rodiny; jinak dělají řemeslo a cvičí.
 */
export function harvestHandsDay(
  state: Pick<VillageState, 'plan' | 'sheaves'>,
  day: number,
): boolean {
  const { month } = dateOfDayIndex(day);
  if (!HARVEST_HANDS_MONTHS.has(month)) return false;
  if (state.plan) {
    for (const { crop, work } of planCrops(state.plan)) {
      if (
        activeTasks(work, day, crop).includes('harvest') &&
        neededTaskRemaining(work, 'harvest') > 0
      ) {
        return true;
      }
    }
  }
  return THRESHED_CROPS.some(
    (crop) => inSegments(CROP_WINDOWS[crop].thresh, month) && sheafWork(state, crop) > EPSILON,
  );
}
