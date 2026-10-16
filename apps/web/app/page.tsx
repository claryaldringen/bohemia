import Link from 'next/link';
import type { ReactElement } from 'react';
import { getSession } from '@/lib/session';

const buttonClass =
  'rounded px-5 py-2 font-serif text-lg bg-stone-900 text-stone-50 hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300';
const secondaryButtonClass =
  'rounded px-5 py-2 font-serif text-lg border border-stone-400 hover:bg-stone-200 dark:border-stone-600 dark:hover:bg-stone-800';

export default async function HomePage(): Promise<ReactElement> {
  const session = await getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-sm tracking-[0.3em] text-stone-500 uppercase">Léta Páně 500–1500</p>
      <h1 className="font-serif text-6xl font-semibold sm:text-7xl">Bohemia</h1>
      <p className="max-w-md text-lg text-stone-700 dark:text-stone-300">
        Feudální strategie v prohlížeči. Buduj vesnice, hradiště, tvrze a hrady, rozšiřuj rodový
        majetek a prestiž a udrž svůj rod naživu – tisíc let za jediný rok.
      </p>
      <p className="font-serif text-xl">Spuštění 1. 1. 2027</p>
      <nav className="flex gap-3">
        {session ? (
          <Link href="/game" className={buttonClass}>
            Pokračovat do hry
          </Link>
        ) : (
          <>
            <Link href="/register" className={buttonClass}>
              Registrace
            </Link>
            <Link href="/login" className={secondaryButtonClass}>
              Přihlášení
            </Link>
          </>
        )}
      </nav>
    </main>
  );
}
