import type { ReactElement } from 'react';
import { connection } from 'next/server';
import { resolveWorldClock } from '@bohemia/game';
import { GameDateBadge } from '@/components/GameDateBadge';

export default async function HomePage(): Promise<ReactElement> {
  // Svět i aktuální čas se čtou při každém požadavku, ne jednou při buildu.
  await connection();
  const world = resolveWorldClock({
    WORLD_START: process.env.WORLD_START,
    WORLD_END: process.env.WORLD_END,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      {/* Dočasně tady – patří do rohu herní plochy, až vznikne. */}
      <GameDateBadge world={world} initialNowMs={Date.now()} />
      <p className="text-sm tracking-[0.3em] text-stone-500 uppercase">Léta Páně 500–1500</p>
      <h1 className="font-serif text-6xl font-semibold sm:text-7xl">Bohemia</h1>
      <p className="max-w-md text-lg text-stone-700 dark:text-stone-300">
        Feudální strategie v prohlížeči. Buduj vesnice, hradiště, tvrze a hrady, rozšiřuj rodový
        majetek a prestiž a udrž svůj rod naživu – tisíc let za jediný rok.
      </p>
      <p className="font-serif text-xl">Spuštění 1. 1. 2027</p>
    </main>
  );
}
