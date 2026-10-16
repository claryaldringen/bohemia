'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { TileInfo } from '@/lib/tile-info';
import { TileInfoPanel } from './TileInfoPanel';

/** Herní plocha: 3D scéna krajiny přes celé okno a info o políčku pod kurzorem. */
export function GameView({ landscape }: { landscape: LandscapeTransfer }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState<TileInfo | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Plátno vzniká pro každé spuštění efektu zvlášť – v dev režimu (StrictMode) se efekt
    // spouští dvakrát a dva enginy na jednom plátně by si přebíjely kontext.
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none outline-none';
    container.appendChild(canvas);
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
    })().catch((error: unknown) => console.error('Krajinu se nepodařilo zobrazit.', error));

    return () => {
      cancelled = true;
      dispose?.();
      canvas.remove();
      setTile(null);
    };
  }, [landscape]);

  return (
    <>
      <div ref={containerRef} className="fixed inset-0" />
      <TileInfoPanel tile={tile} />
    </>
  );
}
