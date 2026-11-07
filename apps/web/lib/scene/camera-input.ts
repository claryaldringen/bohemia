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
 * Dvojklik (fields.md – Co hráč vidí): druhé kliknutí do tolika ms po prvním a do CLICK_SLOP_PX od
 * něj (jako výchozí dvojklik systémů – Windows 500 ms, uživatelé zvládnou ≈ 300 ms).
 */
export const DOUBLE_CLICK_MS = 400;

/** Kliknutí v řadě rychle po sobě: kde (CSS px), kdy (ms) a kolikáté v řadě (1 = samotné). */
export interface ClickRecord {
  x: number;
  y: number;
  at: number;
  count: number;
}

/**
 * Další kliknutí řady: do DOUBLE_CLICK_MS a CLICK_SLOP_PX od předchozího pokračuje řadu (2 =
 * dvojklik, 3 = trojklik…), jinak začne novou. Čas se měří od předchozího kliknutí řady.
 */
export function nextClick(
  previous: ClickRecord | null,
  click: { x: number; y: number; at: number },
): ClickRecord {
  const continues =
    previous !== null &&
    click.at - previous.at >= 0 &&
    click.at - previous.at <= DOUBLE_CLICK_MS &&
    !isDrag(previous, click);
  return { ...click, count: continues ? previous.count + 1 : 1 };
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

/**
 * O kolik (m ve scéně) zvednout cíl kamery, aby kamera zůstala aspoň `clearance` nad terénem pod
 * sebou – jinak 0. Kamera obíhá cíl jako Babylon ArcRotateCamera (alpha, beta, radius). Hory
 * prémiových krajin (průsmyk, posvátná hora) jsou vyšší, než kamera ve výchozím přiblížení nad
 * cílem letí: u úpatí by se zabořila do svahu a místo krajiny by byla vidět obloha. Kamera nad
 * terénem (každá krajina, kde se do svahu nezaboří) se nemění.
 */
export function cameraTerrainLift(
  target: { x: number; y: number; z: number },
  orbit: { alpha: number; beta: number; radius: number },
  groundHeight: (x: number, z: number) => number,
  clearance: number,
): number {
  const across = orbit.radius * Math.sin(orbit.beta);
  const x = target.x + across * Math.cos(orbit.alpha);
  const z = target.z + across * Math.sin(orbit.alpha);
  const y = target.y + orbit.radius * Math.cos(orbit.beta);
  return Math.max(0, groundHeight(x, z) + clearance - y);
}
