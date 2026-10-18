'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/buildings (v produkci stránka vrací 404): prohlídka modelů
// staveb bez přihlášení a databáze, i stavba po fázích (posuvník a přehrání) – obydlí, řemesla,
// modla a svatyně, za nimi pole, hřbitov a sad, vpravo posvátný dub a dubový háj. Řemesla
// a posvátná místa zatím nejsou ve hře – jen modely.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  MILIR_OFFSET_M,
  SHOWCASE_BUILDINGS,
  SHOWCASE_DECOR,
  SHOWCASE_GROUNDS,
  showcaseGrounds,
} from '@/lib/scene/building-showcase-layout';
import type { BuildingShowcase } from '@/lib/scene/building-showcase';
import { constructionPhase, type ConstructionKind } from '@/lib/scene/village-construction';

/** Jak dlouho trvá přehrání celé stavby od 0 do 100 % (s). */
const BUILD_SECONDS = 40;
const KIND_LABELS: Record<ConstructionKind, string> = {
  zemnice: 'Zemnice',
  polozemnice: 'Polozemnice',
  hrncir: 'Hrnčíř',
  kovar: 'Kovář',
  uhlir: 'Uhlíř',
  milir: 'Milíř',
  modla: 'Modla',
  svatyne: 'Svatyně',
};
const KINDS = SHOWCASE_BUILDINGS.flatMap((b) => b.models.map((m) => m.kind));

const buttonClass =
  'rounded bg-stone-800 px-2 py-0.5 text-stone-50 hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300';

interface ShowcaseWindow extends Window {
  __bohemiaShowcase?: BuildingShowcase;
}

export function BuildingShowcaseView(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showcase, setShowcase] = useState<BuildingShowcase | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);

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

  useEffect(() => {
    showcase?.setProgress(progress);
  }, [showcase, progress]);

  // přehrání stavby: průběh roste s časem až do 100 %
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      setProgress((p) => Math.min(1, p + dt / BUILD_SECONDS));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (playing && progress >= 1) setPlaying(false);
  }, [playing, progress]);

  const togglePlay = (): void => {
    if (!playing && progress >= 1) setProgress(0);
    setPlaying(!playing);
  };

  const distance = Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z).toLocaleString('cs-CZ', {
    maximumFractionDigits: 1,
  });
  const groundLabels = showcaseGrounds(progress).labels;

  return (
    <>
      <div ref={containerRef} className="fixed inset-0 bg-[#a1bfd9]" />
      <nav className="fixed top-0 left-0 z-10 flex max-w-full flex-wrap items-center gap-2 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="mr-2 font-serif text-lg text-stone-900 dark:text-stone-100">
          Náhled staveb
        </span>
        {[...SHOWCASE_BUILDINGS, ...SHOWCASE_GROUNDS, ...SHOWCASE_DECOR].map((target) => (
          <button
            key={target.id}
            type="button"
            className={buttonClass}
            disabled={!showcase}
            onClick={() => showcase?.focus(target.id)}
          >
            {target.label}
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
      <section className="fixed top-0 right-0 z-10 w-80 max-w-full rounded-bl bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <div className="flex items-center gap-2">
          <button type="button" className={buttonClass} disabled={!showcase} onClick={togglePlay}>
            {playing ? '❚❚ Pauza' : '▶ Stavět'}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={Math.round(progress * 200) / 2}
            disabled={!showcase}
            aria-label="Průběh stavby"
            className="min-w-0 flex-1 accent-stone-700"
            onChange={(event) => {
              setPlaying(false);
              setProgress(Number(event.target.value) / 100);
            }}
          />
          <span className="w-12 text-right tabular-nums">{Math.round(progress * 100)} %</span>
        </div>
        <ul className="mt-1 space-y-0.5 text-xs">
          {KINDS.map((kind) => (
            <li key={kind}>
              <span className="text-stone-900 dark:text-stone-100">{KIND_LABELS[kind]}:</span>{' '}
              {progress >= 1 ? 'hotovo' : constructionPhase(kind, progress).label}
            </li>
          ))}
          {SHOWCASE_GROUNDS.map((ground) => (
            <li key={ground.id}>
              <span className="text-stone-900 dark:text-stone-100">{ground.label}:</span>{' '}
              {groundLabels[ground.id]}
            </li>
          ))}
        </ul>
      </section>
      <p className="fixed bottom-0 left-0 z-10 rounded-tr bg-stone-100/80 px-4 py-2 text-xs text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        Levé tlačítko otáčí, pravé posouvá, kolečko přibližuje. Milíř stojí {distance} m od uhlířovy
        zemnice (doporučeno 8–12 m, vpředu stranou). Řemesla a posvátná místa zatím nejsou ve hře.
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
