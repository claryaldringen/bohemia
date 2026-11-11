'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { formatTileInfo, type TileInfo } from '@/lib/tile-info';
import { SCENE_READY_MARK } from './ScenePerfPanel';
import { SceneLoading, type LoadingStep } from './SceneLoading';
import { SoundToggle, useSoundPreference } from './SoundToggle';
import { TileInfoPanel } from './TileInfoPanel';

const LOADING_START: { step: LoadingStep; done: number } = { step: 'engine', done: 0.05 };

/**
 * Herní plocha: 3D scéna krajiny přes celé okno. `onSceneReady` dostane hotovou scénu (ves,
 * umisťování staveb) a při jejím zrušení null. Vývojový náhled ukazuje i info o políčku pod
 * kurzorem a plovoucí přepínač zvuku; ve hře je přepínač v horní liště a políčko pod kurzorem
 * nese jen plátno (`data-tile`, `data-tile-info` – pro testy).
 */
export function GameView({
  landscape,
  onSceneReady,
  overlays = true,
}: {
  landscape: LandscapeTransfer;
  onSceneReady?: (scene: LandscapeScene | null) => void;
  /** Info o políčku a plovoucí přepínač zvuku (vývojový náhled); hra má vlastní rozhraní. */
  overlays?: boolean;
}): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState<TileInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(LOADING_START);
  const [ready, setReady] = useState(false);
  const [soundOn, setSoundOn] = useSoundPreference();
  const sceneRef = useRef<LandscapeScene | null>(null);
  const soundOnRef = useRef(soundOn);
  const onSceneReadyRef = useRef(onSceneReady);

  useEffect(() => {
    onSceneReadyRef.current = onSceneReady;
  }, [onSceneReady]);

  useEffect(() => {
    soundOnRef.current = soundOn;
    sceneRef.current?.setSoundEnabled(soundOn);
  }, [soundOn]);

  const toggleSound = (): void => {
    const next = !soundOn;
    setSoundOn(next);
    // Přímo v obsluze kliknutí – Safari pustí zvuk jen v gestu uživatele.
    sceneRef.current?.setSoundEnabled(next);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Plátno vzniká pro každé spuštění efektu zvlášť – v dev režimu (StrictMode) se efekt
    // spouští dvakrát a dva enginy na jednom plátně by si přebíjely kontext.
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none outline-none';
    // Plátno scény (rozhraní má další plátna – minimapu); testy ho hledají podle `data-scene`.
    canvas.dataset.scene = 'landscape';
    container.appendChild(canvas);
    // Gesta trackpadu (swipe zpět, přetažení přes okraj) nemají na herní ploše co dělat.
    const html = document.documentElement;
    const previousOverscroll = html.style.overscrollBehavior;
    html.style.overscrollBehavior = 'none';
    const preferred =
      new URLSearchParams(window.location.search).get('renderer') === 'webgl' ? 'webgl' : 'auto';

    let cancelled = false;
    let dispose: (() => void) | null = null;
    void (async () => {
      // Babylon se načítá až tady – nedostane se do JS jiných stránek ani do SSR.
      const { LandscapeScene } = await import('@/lib/scene/landscape-scene');
      if (cancelled) return;
      setProgress({ step: 'engine', done: 0.15 });
      const scene = await LandscapeScene.create(canvas, { renderer: preferred });
      if (cancelled) {
        scene.dispose();
        return;
      }
      dispose = () => scene.dispose();
      sceneRef.current = scene;
      scene.setSoundEnabled(soundOnRef.current);
      canvas.dataset.renderer = scene.renderer;
      scene.onTileHover((next) => {
        if (next) {
          canvas.dataset.tile = `${next.x},${next.y}`;
          canvas.dataset.tileInfo = formatTileInfo(next);
        } else {
          delete canvas.dataset.tile;
          delete canvas.dataset.tileInfo;
        }
        setTile(next);
      });
      setProgress({ step: 'engine', done: 0.25 });
      await scene.setLandscape(decodeLandscape(landscape), (next) => {
        if (cancelled) return;
        setProgress(next);
        // kroky načtení v profilu prohlížeče (User Timing) – měření načtení hry
        performance.mark(`scene:${next.step}`);
      });
      if (cancelled) return;
      performance.mark(SCENE_READY_MARK);
      canvas.dataset.sceneReady = 'true';
      setReady(true);
      onSceneReadyRef.current?.(scene);
    })().catch((error: unknown) => {
      console.error('Krajinu se nepodařilo zobrazit.', error);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      if (sceneRef.current) onSceneReadyRef.current?.(null);
      sceneRef.current = null;
      dispose?.();
      canvas.remove();
      html.style.overscrollBehavior = previousOverscroll;
      setTile(null);
      setProgress(LOADING_START);
      setReady(false);
    };
  }, [landscape]);

  return (
    <>
      {/* Barva oblohy scény – během načítání není vidět bílá plocha. */}
      <div ref={containerRef} className="fixed inset-0 bg-[#a1bfd9]" />
      {overlays && <TileInfoPanel tile={tile} />}
      {overlays && !failed && <SoundToggle enabled={soundOn} onToggle={toggleSound} />}
      {!failed && <SceneLoading step={progress.step} done={progress.done} hidden={ready} />}
      {failed && (
        <div className="fixed inset-0 flex items-center justify-center px-4">
          <p className="max-w-md rounded bg-stone-100/90 px-5 py-4 text-center text-stone-800 dark:bg-stone-900/90 dark:text-stone-200">
            Krajinu se nepodařilo zobrazit – prohlížeč nepodporuje 3D grafiku (WebGPU ani WebGL 2).
            Zkus prosím aktuální Chrome, Edge, Safari nebo Firefox.
          </p>
        </div>
      )}
    </>
  );
}
