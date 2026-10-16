import { randomInt } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { generateLandscape } from '@bohemia/game';
import { GameView } from '@/components/game/GameView';
import { parseSeed } from '@/lib/dev-seed';
import { encodeLandscape } from '@/lib/landscape-transfer';

interface Props {
  searchParams: Promise<{ seed?: string }>;
}

const linkClass = 'underline hover:text-stone-900 dark:hover:text-stone-100';

/**
 * Vývojový náhled krajiny bez přihlášení a databáze – pro ladění vzhledu a generátoru.
 * V produkci neexistuje.
 */
export default async function DevLandscapePage({ searchParams }: Props): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const seed = parseSeed((await searchParams).seed);

  return (
    <main className="h-screen overflow-hidden">
      <GameView landscape={encodeLandscape(generateLandscape(seed))} />
      <nav className="fixed top-0 left-0 z-10 flex items-center gap-4 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="font-serif text-lg text-stone-900 dark:text-stone-100">
          Náhled krajiny · seed {seed}
        </span>
        <Link href={`/dev/landscape?seed=${Math.max(0, seed - 1)}`} className={linkClass}>
          ← předchozí
        </Link>
        <Link href={`/dev/landscape?seed=${seed + 1}`} className={linkClass}>
          další →
        </Link>
        <Link href={`/dev/landscape?seed=${randomInt(0, 2 ** 31)}`} className={linkClass}>
          náhodná
        </Link>
      </nav>
    </main>
  );
}
