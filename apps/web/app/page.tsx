import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
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
