'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { perfStatsRows, type ScenePerfStats } from '@/lib/scene/perf-stats';

/** Jak často se čísla ukazatele obnoví (ms). */
const REFRESH_MS = 1000;

/** Značka User Timing, kterou herní plocha položí, když je scéna hotová (`GameView`). */
export const SCENE_READY_MARK = 'scene-ready';

/**
 * Ukazatel výkonu ve hře: jen s `?perf=1` v adrese. Platí i v produkčním buildu – vývojový
 * režim Next.js a React kreslení zkresluje, měřit se musí i produkce; bez příznaku nic nestojí
 * (měření zapne až panel) a hráč ho neuvidí, rozhraní hry zůstává bez popisků.
 */
export function usePerfFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // až po hydrataci – adresa na serveru není a stav se musí shodovat
    setOn(new URLSearchParams(window.location.search).get('perf') === '1');
  }, []);
  return on;
}

/** Od otevření stránky do hotové scény (ms), dokud scéna není hotová null. */
function loadMs(): number | null {
  return performance.getEntriesByName(SCENE_READY_MARK, 'mark')[0]?.startTime ?? null;
}

/**
 * Vývojový ukazatel výkonu scény (/dev/landscape, hra s `?perf=1`) – kolik snímků scéna opravdu kreslí, průchody
 * smyčky, doba snímku na CPU a GPU, draw cally, trojúhelníky a pick terénu. Měření zapne až
 * tenhle panel (stojí to trochu výkonu), čísla se obnoví jednou za sekundu.
 */
export function ScenePerfPanel({
  scene,
  showLoad = false,
}: {
  scene: LandscapeScene | null;
  /** Ukázat i dobu načtení (hra – stránka se otevře rovnou se scénou). */
  showLoad?: boolean;
}): ReactElement {
  const [stats, setStats] = useState<ScenePerfStats | null>(null);
  useEffect(() => {
    if (!scene) return;
    scene.enablePerfStats();
    const timer = setInterval(() => {
      const next = scene.perfStats();
      setStats(next && showLoad ? { ...next, loadMs: loadMs() } : next);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [scene, showLoad]);
  return <ScenePerfReadout stats={stats} />;
}

/** Čísla výkonu (bez stavu – statický test). */
export function ScenePerfReadout({ stats }: { stats: ScenePerfStats | null }): ReactElement {
  return (
    <div
      data-testid="dev-perf"
      className="pointer-events-none fixed right-2 bottom-2 z-30 rounded border border-stone-500/60 bg-stone-950/75 px-2 py-1 font-mono text-[11px] leading-4 text-stone-100"
    >
      {stats ? (
        <dl className="grid grid-cols-[auto_auto] gap-x-2">
          {perfStatsRows(stats).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-stone-400">{label}</dt>
              <dd className="text-right tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="text-stone-400">Výkon: měří se…</span>
      )}
    </div>
  );
}
