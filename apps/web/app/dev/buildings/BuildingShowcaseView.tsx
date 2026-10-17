'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/buildings (v produkci stránka vrací 404): prohlídka modelů
// staveb bez přihlášení a databáze. Řemesla zatím nejsou ve hře – jen modely.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { MILIR_OFFSET_M, SHOWCASE_BUILDINGS } from '@/lib/scene/building-showcase-layout';
import type { BuildingShowcase } from '@/lib/scene/building-showcase';

const buttonClass =
  'rounded bg-stone-800 px-2 py-0.5 text-stone-50 hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300';

interface ShowcaseWindow extends Window {
  __bohemiaShowcase?: BuildingShowcase;
}

export function BuildingShowcaseView(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showcase, setShowcase] = useState<BuildingShowcase | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // plátno pro každé spuštění efektu zvlášť (StrictMode spouští efekt dvakrát)
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none outline-none';
    container.appendChild(canvas);
    const preferred =
      new URLSearchParams(window.location.search).get('renderer') === 'webgl' ? 'webgl' : 'auto';
    let cancelled = false;
    let created: BuildingShowcase | null = null;
    void (async () => {
      // Babylon až tady – nedostane se do SSR ani do JS jiných stránek
      const { BuildingShowcase } = await import('@/lib/scene/building-showcase');
      if (cancelled) return;
      const scene = await BuildingShowcase.create(canvas, { renderer: preferred });
      if (cancelled) {
        scene.dispose();
        return;
      }
      created = scene;
      // přístup ke scéně pro snímky z Playwrightu (jen tato vývojová stránka)
      (window as ShowcaseWindow).__bohemiaShowcase = scene;
      canvas.dataset.renderer = scene.renderer;
      canvas.dataset.sceneReady = 'true';
      setShowcase(scene);
    })().catch((error: unknown) => {
      console.error('Náhled staveb se nepodařilo zobrazit.', error);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      delete (window as ShowcaseWindow).__bohemiaShowcase;
      created?.dispose();
      setShowcase(null);
      canvas.remove();
    };
  }, []);

  const distance = Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z).toLocaleString('cs-CZ', {
    maximumFractionDigits: 1,
  });

  return (
    <>
      <div ref={containerRef} className="fixed inset-0 bg-[#a1bfd9]" />
      <nav className="fixed top-0 left-0 z-10 flex max-w-full flex-wrap items-center gap-2 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="mr-2 font-serif text-lg text-stone-900 dark:text-stone-100">
          Náhled staveb
        </span>
        {SHOWCASE_BUILDINGS.map((building) => (
          <button
            key={building.id}
            type="button"
            className={buttonClass}
            disabled={!showcase}
            onClick={() => showcase?.focus(building.id)}
          >
            {building.label}
          </button>
        ))}
        <button
          type="button"
          className={buttonClass}
          disabled={!showcase}
          onClick={() => showcase?.gameView()}
        >
          Herní náklon
        </button>
      </nav>
      <p className="fixed bottom-0 left-0 z-10 rounded-tr bg-stone-100/80 px-4 py-2 text-xs text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        Levé tlačítko otáčí, pravé posouvá, kolečko přibližuje. Milíř stojí {distance} m od uhlířovy
        zemnice (doporučeno 8–12 m, vpředu stranou). Řemesla zatím nejsou ve hře.
      </p>
      {failed && (
        <div className="fixed inset-0 flex items-center justify-center px-4">
          <p className="max-w-md rounded bg-stone-100/90 px-5 py-4 text-center text-stone-800 dark:bg-stone-900/90 dark:text-stone-200">
            Náhled se nepodařilo zobrazit – prohlížeč nepodporuje 3D grafiku (WebGPU ani WebGL 2).
          </p>
        </div>
      )}
    </>
  );
}
