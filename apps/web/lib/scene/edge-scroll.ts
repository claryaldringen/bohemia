// Posun krajiny myší u okraje okna (jako v 0 A.D.) – čistá funkce, bez Babylonu.

/** Jak blízko okraje okna (CSS px) kurzor krajinu posouvá. */
export const EDGE_SCROLL_PX = 12;

/**
 * Směr posunu podle polohy kurzoru v okně: x −1 vlevo / 1 vpravo, y −1 nahoru / 1 dolů, 0 = nic.
 * Kurzor mimo okno (záporné souřadnice, za šířkou) se bere jako u okraje.
 */
export function edgeScrollDirection(
  pointer: { x: number; y: number },
  viewport: { width: number; height: number },
  edgePx = EDGE_SCROLL_PX,
): { x: number; y: number } {
  const axis = (value: number, size: number): number => {
    if (size <= edgePx * 2) return 0;
    if (value < edgePx) return -1;
    if (value >= size - edgePx) return 1;
    return 0;
  };
  return { x: axis(pointer.x, viewport.width), y: axis(pointer.y, viewport.height) };
}
