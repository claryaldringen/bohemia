/**
 * Takt smyčky kreslení scény (landscape-scene.ts) – čisté funkce bez Babylonu. Smyčka běží
 * s displejem (requestAnimationFrame), ale animace a dokreslování po načtení jdou jen v taktu
 * `WATER_FPS`; snímek enginu (`beginFrame` / `endFrame`) vzniká jen tehdy, když se opravdu kreslí.
 */

/**
 * O kolik ms smí takt přijít dřív: snímky displeje sedí na interval jen se zaokrouhlením
 * (120 Hz má 8,33 ms) – bez tolerance by čtvrtý snímek o zlomek ms nestačil a 30 fps spadlo na 24.
 */
const EARLY_MS = 1;
/** Nejdelší krok kamery (s) – po skryté záložce nebo zaseknutí neposkočí o kus krajiny. */
const MAX_STEP_S = 0.1;

/** Je čas na další takt (`fps` za sekundu)? Při `fps` 0 nikdy. */
export function tickDue(nowMs: number, lastTickMs: number, fps: number): boolean {
  if (fps <= 0) return false;
  return nowMs - lastTickMs >= 1000 / fps - EARLY_MS;
}

/**
 * Čas právě proběhlého taktu: takty jdou po intervalu (na displeji 144 Hz střídavě po 4 a 5
 * snímcích, v průměru přesně `fps`); kdo zaostal o víc než dva intervaly (skrytá záložka,
 * zaseknutí), začne znovu od teď – žádné dohánění.
 */
export function nextTick(nowMs: number, lastTickMs: number, fps: number): number {
  const interval = 1000 / fps;
  const next = lastTickMs + interval;
  return nowMs - next > interval ? nowMs : next;
}

/** Krok kamery (s) od posledního průchodu smyčky; první průchod 0, nejvýš MAX_STEP_S. */
export function loopStep(nowMs: number, lastLoopMs: number | null): number {
  if (lastLoopMs === null) return 0;
  return Math.min(MAX_STEP_S, Math.max(0, (nowMs - lastLoopMs) / 1000));
}
