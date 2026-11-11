// Umístění kostela (churches.md – Stavba, Velikost a cena): čisté funkce tahu, rozměrů a ceny
// u kurzoru. Tah začíná u vstupu (západ) a končí u kněžiště – délka lodi (rotunda: průměr)
// a směr osy přichycený po 15° (`snapChurchRotation`); krátký klik = natočení na východ.
import {
  CHURCH,
  CHURCH_DIMS_STEP_M,
  CHURCH_EAST_ROTATION,
  churchCost,
  clampChurchDims,
  snapChurchRotation,
  type ChurchDims,
  type ChurchType,
  type Position,
} from '@bohemia/game';
import type { PlacementCost } from './scene/village-types';
import { formatDecimal } from './village-format';

/** Kostel v náhledu – typ, rozměry a poloha (střed hlavní lodi, natočení osy vstup → kněžiště). */
export interface ChurchLayout {
  dims: ChurchDims;
  position: Position;
}

/** Míra, kterou hráč mění tlačítky +/− (rotunda průměr, jinak šířka lodi; vždy výška). */
export type ChurchMeasure = 'diameter' | 'width' | 'length' | 'height';

/** Délka lodi v ose (rotunda: průměr), m. */
export function churchAxisLength(dims: ChurchDims): number {
  return dims.kind === 'round' ? dims.diameter : dims.length;
}

/** Kostel u kurzoru: střed lodi pod kurzorem, kněžištěm na východ (`CHURCH_EAST_ROTATION`). */
export function churchAtCursor(
  type: ChurchType,
  dims: ChurchDims,
  at: { x: number; z: number },
): ChurchLayout {
  return {
    dims: clampChurchDims(type, dims),
    position: { x: at.x, z: at.z, rotation: CHURCH_EAST_ROTATION },
  };
}

/**
 * Kostel z tahu: `from` = vstup (západní konec lodi), `to` = kněžiště – délka lodi (rotunda
 * průměr) ořezaná `clampChurchDims`, osa přichycená po 15°; vstup zůstane, kde tah začal. Místní
 * +x míří do (cos r, −sin r) jako u budov (`churchLocalToWorld`).
 */
export function churchFromDrag(
  type: ChurchType,
  dims: ChurchDims,
  from: { x: number; z: number },
  to: { x: number; z: number },
): ChurchLayout {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const along = Math.hypot(dx, dz);
  const rotation = snapChurchRotation(Math.atan2(-dz, dx));
  const stretched: ChurchDims =
    dims.kind === 'round' ? { ...dims, diameter: along } : { ...dims, length: along };
  const next = clampChurchDims(type, stretched);
  const half = churchAxisLength(next) / 2;
  return {
    dims: next,
    position: {
      x: from.x + Math.cos(rotation) * half,
      z: from.z - Math.sin(rotation) * half,
      rotation,
    },
  };
}

/** Míry, které jdou měnit tlačítky +/− podle druhu (rotunda průměr a výška, jinak šířka, délka a výška). */
export function churchMeasures(dims: ChurchDims): readonly ChurchMeasure[] {
  return dims.kind === 'round' ? ['diameter', 'height'] : ['width', 'length', 'height'];
}

/** Hodnota míry (m). */
export function churchMeasureValue(dims: ChurchDims, measure: ChurchMeasure): number {
  if (measure === 'height') return dims.height;
  if (dims.kind === 'round') return dims.diameter;
  return measure === 'width' ? dims.width : dims.length;
}

/** Míra o krok (`CHURCH_DIMS_STEP_M`) větší nebo menší, ořezaná do mezí (`clampChurchDims`). */
export function stepChurchDims(
  type: ChurchType,
  dims: ChurchDims,
  measure: ChurchMeasure,
  direction: 1 | -1,
): ChurchDims {
  const value = churchMeasureValue(dims, measure) + direction * CHURCH_DIMS_STEP_M;
  if (measure === 'height') return clampChurchDims(type, { ...dims, height: value });
  if (dims.kind === 'round') return clampChurchDims(type, { ...dims, diameter: value });
  return clampChurchDims(
    type,
    measure === 'width' ? { ...dims, width: value } : { ...dims, length: value },
  );
}

/** Rozměry u kurzoru – jen čísla (rotunda „Ø 6,5 × 6 m“, jinak „5 × 8 × 7 m“: šířka × délka × výška). */
export function churchDimsText(dims: ChurchDims): string {
  const m = (n: number): string => (Number.isInteger(n) ? String(n) : formatDecimal(n, 1));
  return dims.kind === 'round'
    ? `Ø ${m(dims.diameter)} × ${m(dims.height)} m`
    : `${m(dims.width)} × ${m(dims.length)} × ${m(dims.height)} m`;
}

/**
 * Cena kostela u kurzoru (`churchCost`): kámen m³, vápno t, písek m³, dřevo v kládách
 * (`CHURCH.woodKgPerLog`) a práce celkem (čd – lámání bez vzdálenosti lomu, i překážky na místě).
 */
export function churchPlacementCost(
  type: ChurchType,
  dims: ChurchDims,
  obstacleCost = 0,
): PlacementCost {
  const cost = churchCost(type, dims);
  const work = Object.values(cost.work).reduce((sum, w) => sum + w, 0);
  return {
    laborManDays: Math.round(work + obstacleCost),
    trees: 0,
    logs: Math.ceil(cost.woodKg / CHURCH.woodKgPerLog),
    stoneM3: Math.round(cost.stoneM3),
    limeT: Math.round(cost.limeT * 10) / 10,
    sandM3: Math.round(cost.sandM3),
  };
}
