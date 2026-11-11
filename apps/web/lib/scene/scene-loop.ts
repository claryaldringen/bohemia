import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Scene } from '@babylonjs/core/scene';
import { animationFps, loopStep, nextTick, tickDue } from './render-loop';
import type { ScenePerf } from './scene-perf';

/** Vstupy hráče, po kterých jdou animace zase plně (nižší plynulost po nečinnosti). */
const INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Klidová smyčka scény (docs/code/scene.md – Klidová smyčka): vlastní `requestAnimationFrame`
 * místo `engine.runRenderLoop`, příznak „překreslit“ (`requestRender`), dokreslování po načtení
 * (`renderBurst`), takt animací a plynulost na pozadí (fokus okna, nečinnost hráče, omezený
 * pohyb). Co se ve snímku děje, skládá `LandscapeScene.frame` – smyčka drží jen stav kreslení.
 */
export class SceneLoop {
  /** Scénu je třeba překreslit – kreslí se jen při změně. */
  private needsRender = true;
  /** Do kdy kreslit každý snímek (shadery a textury se po načtení dokončují asynchronně). */
  private renderBurstUntil = 0;
  /**
   * Poslední takt animací a dokreslování (ms) – voda, zvířata a lidé se překreslují nejvýš
   * WATER_FPS za sekundu a stejně často se kontroluje, jestli se v záběru něco hýbe.
   */
  private lastAnimationTick = Number.NEGATIVE_INFINITY;
  /** Smyčka kreslení (requestAnimationFrame) a čas jejího posledního průchodu. */
  private loopHandle = 0;
  private lastLoopAt: number | null = null;
  /** WebGL ztratil kontext – do obnovení se nekreslí (jako ve smyčce Babylonu). */
  private contextLost = false;
  /**
   * Okno má fokus a kdy hráč naposledy něco udělal (myš, klávesy, kolečko, dotyk) – na pozadí
   * jdou animace pomaleji (`animationFps`).
   */
  private focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  private lastInputAt = performance.now();
  /**
   * Systémové „omezit pohyb“ – voda pak stojí a scéna se kreslí jen při změně. Hodnota se mění
   * živě (MediaQueryList). Zapínají ho i e2e testy: bezhlavý prohlížeč kreslí softwarově
   * a nepřetržité kreslení by zdrželo vstupy myši.
   */
  private readonly reducedMotionQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  private disposed = false;

  constructor(
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    /** Vývojový ukazatel výkonu (jen když je zapnutý). */
    private readonly perf: () => ScenePerf | null,
  ) {
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, this.onInput, { capture: true, passive: true });
    }
  }

  /** Systémové „omezit pohyb“ je zapnuté – animace stojí. */
  get reducedMotion(): boolean {
    return this.reducedMotionQuery?.matches ?? false;
  }

  /** Překreslit v příštím snímku smyčky. */
  requestRender(): void {
    this.needsRender = true;
  }

  /**
   * Chvíli kreslit v taktu animací (WATER_FPS): WebGL kompiluje shadery paralelně a první snímky
   * po načtení nebo změně velikosti nemusí obsahovat vše – bez toho by na obrazovce zůstal
   * neúplný obraz. Hned teď se kreslí vždy.
   */
  renderBurst(durationMs: number): void {
    this.renderBurstUntil = Math.max(this.renderBurstUntil, performance.now() + durationMs);
    this.needsRender = true;
  }

  /**
   * Překreslit hned a znovu, až budou hotové shadery a textury nových meshů (kompilují se
   * a stahují asynchronně – bez toho by do dalšího pohybu kamery zůstal neúplný obraz).
   */
  renderWhenReady(): void {
    this.renderBurst(300);
    void this.scene.whenReadyAsync().then(() => {
      if (!this.disposed) this.renderBurst(300);
    });
  }

  /**
   * Plynulost animací (snímků za sekundu) – při omezeném pohybu stojí, na pozadí méně
   * (render-loop.ts – `animationFps`).
   */
  animationFps(): number {
    if (this.reducedMotion) return 0;
    return animationFps({
      focused: this.focused,
      idleMs: performance.now() - this.lastInputAt,
    });
  }

  /**
   * Spustí smyčku: `frame` jednou za snímek displeje. Vlastní smyčka místo
   * `engine.runRenderLoop`: ta otevírá a uzavírá snímek enginu (`beginFrame` / `endFrame`) při
   * každém snímku displeje, i když se nic nekreslí – WebGPU pak pokaždé odešle příkazy
   * (`flushFramebuffer`). Tady vzniká snímek enginu jen při kreslení (`draw`).
   */
  start(frame: () => void): void {
    this.engine.onContextLostObservable.add(() => {
      this.contextLost = true;
    });
    this.engine.onContextRestoredObservable.add(() => {
      this.contextLost = false;
      this.renderBurst(300);
    });
    const tick = (): void => {
      this.loopHandle = 0;
      if (this.disposed) return;
      frame();
      if (!this.disposed) this.loopHandle = requestAnimationFrame(tick);
    };
    this.loopHandle = requestAnimationFrame(tick);
  }

  /** Začátek snímku smyčky: čas od minulého průchodu (s) pro pohyb kamery. */
  step(now: number): number {
    const step = loopStep(now, this.lastLoopAt);
    this.lastLoopAt = now;
    this.perf()?.loop(now);
    return step;
  }

  /**
   * Takt animací (`fps` za sekundu): když nastal, posune ho (při každé kontrole – kontroly
   * animací nejvýš `fps` za sekundu), během dokreslování po načtení si řekne o snímek a vrátí
   * true – pak je čas zkontrolovat animace.
   */
  animationTick(now: number, fps: number): boolean {
    if (!tickDue(now, this.lastAnimationTick, fps)) return false;
    this.lastAnimationTick = nextTick(now, this.lastAnimationTick, fps);
    if (now < this.renderBurstUntil) this.needsRender = true;
    return true;
  }

  /** Konec snímku smyčky: nakreslí scénu, jen když se něco změnilo. */
  draw(now: number): void {
    if (!this.needsRender || this.contextLost || this.engine.isDisposed) return;
    this.needsRender = false;
    this.engine.beginFrame();
    this.scene.render(false);
    this.engine.endFrame();
    this.perf()?.frameDrawn(now);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);
    for (const type of INPUT_EVENTS) {
      window.removeEventListener(type, this.onInput, { capture: true });
    }
    if (this.loopHandle !== 0) cancelAnimationFrame(this.loopHandle);
    this.loopHandle = 0;
  }

  private readonly onFocus = (): void => {
    this.focused = true;
    this.lastInputAt = performance.now();
  };

  private readonly onBlur = (): void => {
    this.focused = false;
  };

  private readonly onInput = (): void => {
    this.lastInputAt = performance.now();
  };
}
