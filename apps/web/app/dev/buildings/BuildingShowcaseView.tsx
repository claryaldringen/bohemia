'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/buildings (v produkci stránka vrací 404): prohlídka modelů
// staveb bez přihlášení a databáze, i stavba po fázích (posuvník a přehrání) – obydlí, řemesla,
// modla a svatyně, za nimi pole, hřbitov a sad, vpravo posvátný dub a dubový háj, vlevo orá
// spřežení volů s rádlem a vedle zemnice ohrada s přístřeškem (voli a kráva), vpravo vzadu na
// pahorku vozy se spřežením (dvoukoláky dokola, čtyřkoláky tam a zpět, s různým nákladem). Orba
// volů, ohrada ani vozy zatím nejsou ve hře – jen modely. Přepínač zimy ukáže sníh.
// Před pozemky rozpad obydlí: posuvník stavu opuštěné zemnice a polozemnice 100 → 0 % a zbytek
// jámy po zániku, za nimi řada všech stupňů rozpadu. Přepínač Oprava ukáže u opuštěných staveb (modla, svatyně, hřbitov,
// ohrada) místo rozpadu jejich opravu – posuvník je průběh opravy (abandonment.md – Oprava).
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  MILIR_OFFSET_M,
  SHOWCASE_BUILDINGS,
  SHOWCASE_CARTS,
  SHOWCASE_DECAY,
  SHOWCASE_ROADS,
  SHOWCASE_DECOR,
  SHOWCASE_GROUNDS,
  SHOWCASE_PEN,
  decayLabel,
  structureDecayLabel,
  structureRepairLabel,
  showcaseGrounds,
} from '@/lib/scene/building-showcase-layout';
import { penPhase } from '@/lib/scene/pen-layout';
import type { BuildingShowcase } from '@/lib/scene/building-showcase';
import { constructionPhase, type ConstructionKind } from '@/lib/scene/village-construction';

/** Jak dlouho trvá přehrání celé stavby od 0 do 100 % (s). */
const BUILD_SECONDS = 40;
/** Jak dlouho trvá přehrání rozpadu – od celého domu po zarostlý zbytek jámy (s). */
const DECAY_SECONDS = 40;
const KIND_LABELS: Record<ConstructionKind, string> = {
  zemnice: 'Zemnice',
  polozemnice: 'Polozemnice',
  dvorec: 'Dvorec vojvody',
  hrncir: 'Hrnčíř',
  kovar: 'Kovář',
  uhlir: 'Uhlíř',
  milir: 'Milíř',
  modla: 'Modla',
  svatyne: 'Svatyně',
};
const KINDS = [...new Set(SHOWCASE_BUILDINGS.flatMap((b) => b.models.map((m) => m.kind)))];

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
  const [following, setFollowing] = useState(false);
  const [followingCart, setFollowingCart] = useState(false);
  const [winter, setWinter] = useState(false);
  const [decay, setDecay] = useState(0);
  const [decaying, setDecaying] = useState(false);
  const [repair, setRepair] = useState(false);

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

  useEffect(() => {
    showcase?.setDecay(decay);
  }, [showcase, decay]);

  useEffect(() => {
    showcase?.setRepair(repair);
  }, [showcase, repair]);

  // přehrání rozpadu: od celého domu po zarostlý zbytek jámy
  useEffect(() => {
    if (!decaying) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      setDecay((t) => Math.min(1, t + dt / DECAY_SECONDS));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [decaying]);

  useEffect(() => {
    if (decaying && decay >= 1) setDecaying(false);
  }, [decaying, decay]);

  const toggleDecay = (): void => {
    if (!decaying && decay >= 1) setDecay(0);
    setDecaying(!decaying);
  };

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
      <nav className="fixed top-0 left-0 z-10 flex max-w-[calc(100%-20rem)] flex-wrap items-center gap-2 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="mr-2 font-serif text-lg text-stone-900 dark:text-stone-100">
          Náhled staveb
        </span>
        {[
          ...SHOWCASE_BUILDINGS,
          ...SHOWCASE_GROUNDS,
          ...SHOWCASE_DECOR,
          SHOWCASE_PEN,
          ...SHOWCASE_DECAY,
          SHOWCASE_ROADS,
          SHOWCASE_CARTS,
        ].map((target) => (
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
          onClick={() => {
            setFollowing(false);
            setFollowingCart(false);
            showcase?.followTeam(false);
            showcase?.followCart(false);
            showcase?.focusTeam();
          }}
        >
          Spřežení zblízka
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!showcase}
          aria-pressed={following}
          onClick={() => {
            setFollowingCart(false);
            showcase?.followCart(false);
            setFollowing(showcase?.followTeam(!following) ?? false);
          }}
        >
          {following ? 'Nesledovat spřežení' : 'Sledovat spřežení'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!showcase}
          onClick={() => {
            setFollowing(false);
            showcase?.followTeam(false);
            showcase?.focusCart();
          }}
        >
          Další vůz zblízka
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!showcase}
          aria-pressed={followingCart}
          onClick={() => {
            setFollowing(false);
            showcase?.followTeam(false);
            setFollowingCart(showcase?.followCart(!followingCart) ?? false);
          }}
        >
          {followingCart ? 'Nesledovat vůz' : 'Sledovat vůz'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!showcase}
          onClick={() => showcase?.gameView()}
        >
          Herní náklon
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!showcase}
          aria-pressed={winter}
          onClick={() => setWinter(showcase?.setWinter(!winter) ?? false)}
        >
          {winter ? 'Léto' : 'Zima'}
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
          <li>
            <span className="text-stone-900 dark:text-stone-100">{SHOWCASE_PEN.label}:</span>{' '}
            {progress >= 1 ? 'hotovo – dva voli a kráva' : penPhase(progress).label}
          </li>
          {SHOWCASE_GROUNDS.map((ground) => (
            <li key={ground.id}>
              <span className="text-stone-900 dark:text-stone-100">{ground.label}:</span>{' '}
              {groundLabels[ground.id]}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-2 border-t border-stone-300 pt-2 dark:border-stone-700">
          <button type="button" className={buttonClass} disabled={!showcase} onClick={toggleDecay}>
            {decaying ? '❚❚ Pauza' : repair ? '▶ Oprava' : '▶ Rozpad'}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!showcase}
            aria-pressed={repair}
            onClick={() => {
              setDecaying(false);
              setDecay(0);
              setRepair(!repair);
            }}
          >
            {repair ? '✓ Oprava staveb' : 'Oprava staveb'}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={Math.round(decay * 200) / 2}
            disabled={!showcase}
            aria-label="Rozpad obydlí"
            className="min-w-0 flex-1 accent-stone-700"
            onChange={(event) => {
              setDecaying(false);
              setDecay(Number(event.target.value) / 100);
            }}
          />
        </div>
        <p className="mt-1 text-xs">
          <span className="text-stone-900 dark:text-stone-100">Opuštěná obydlí:</span>{' '}
          {decayLabel(decay)}
        </p>
        <p className="mt-1 text-xs">
          <span className="text-stone-900 dark:text-stone-100">
            {repair ? 'Oprava staveb:' : 'Opuštěné stavby:'}
          </span>{' '}
          {repair ? structureRepairLabel(decay) : structureDecayLabel(decay)}
        </p>
      </section>
      <p className="fixed bottom-0 left-0 z-10 rounded-tr bg-stone-100/80 px-4 py-2 text-xs text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        Levé tlačítko otáčí, pravé posouvá, kolečko přibližuje. Milíř stojí {distance} m od uhlířovy
        zemnice (doporučeno 8–12 m, vpředu stranou).
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
