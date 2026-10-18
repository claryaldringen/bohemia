// Vstupy kamery bez Babylonu – čisté funkce pro tah myší a gesto přiblížení na trackpadu.

/**
 * Kliknutí = stisk a puštění tlačítka bez tažení (CSS px). Delší tah levým tlačítkem posouvá
 * krajinu, takže stejná mez rozhoduje i o tom, jestli kliknutí ještě vybírá.
 */
export const CLICK_SLOP_PX = 6;

/** Ujel kurzor od stisku dál než mez kliknutí – je to tah? */
export function isDrag(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > CLICK_SLOP_PX;
}

/**
 * Rozevření prstů na trackpadu posílá Chrome i Firefox jako kolečko s Ctrl, deltaY ≈ −100 · ln
 * (změna měřítka). Kamera se tedy vzdálí e^(deltaY / 100)krát – krajina se roztahuje s prsty.
 * Krok je omezený, aby Ctrl + zub kolečka myši (deltaY 100) nepřiblížil skokem.
 */
const PINCH_DELTA_PER_E = 100;
const PINCH_MAX_STEP = 25;
/** Řádek a stránka kolečka v px (jako Babylon u kolečka). */
const LINE_PX = 40;
const PAGE_PX = 800;

/** Kolikrát se změní vzdálenost kamery po jedné události gesta přiblížení (kolečko s Ctrl). */
export function pinchZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * PAGE_PX : deltaY;
  const step = Math.max(-PINCH_MAX_STEP, Math.min(PINCH_MAX_STEP, px));
  return Math.exp(step / PINCH_DELTA_PER_E);
}
