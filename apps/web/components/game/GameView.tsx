'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { TileInfo } from '@/lib/tile-info';
import { TileInfoPanel } from './TileInfoPanel';

/** Herní plocha: 3D scéna krajiny přes celé okno a info o políčku pod kurzorem. */
export function GameView({ landscape }: { landscape: LandscapeTransfer }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState<TileInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Plátno vzniká pro každé spuštění efektu zvlášť – v dev režimu (StrictMode) se efekt
    // spouští dvakrát a dva enginy na jednom plátně by si přebíjely kontext.
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none outline-none';
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
      const scene = await LandscapeScene.create(canvas, { renderer: preferred });
      if (cancelled) {
        scene.dispose();
        return;
      }
      dispose = () => scene.dispose();
      canvas.dataset.renderer = scene.renderer;
      scene.onTileHover(setTile);
      await scene.setLandscape(decodeLandscape(landscape));
      if (!cancelled) canvas.dataset.sceneReady = 'true';
    })().catch((error: unknown) => {
      console.error('Krajinu se nepodařilo zobrazit.', error);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      dispose?.();
      canvas.remove();
      html.style.overscrollBehavior = previousOverscroll;
      setTile(null);
    };
  }, [landscape]);

  return (
    <>
      <div ref={containerRef} className="fixed inset-0" />
      <TileInfoPanel tile={tile} />
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
