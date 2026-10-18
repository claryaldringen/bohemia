import { randomInt } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { CURRENT_LAYER_VERSIONS, generateLandscape, INITIAL_LAYER_VERSIONS } from '@bohemia/game';
import { parseSeed } from '@/lib/dev-seed';
import { encodeLandscape } from '@/lib/landscape-transfer';
import { DevVillagePreview } from './DevVillagePreview';

interface Props {
  searchParams: Promise<{ seed?: string; layers?: string }>;
}

const linkClass = 'underline hover:text-stone-900 dark:hover:text-stone-100';

/**
 * Vývojový náhled krajiny bez přihlášení a databáze – pro ladění vzhledu a generátoru;
 * dole lišta pro zkoušku umisťování staveb a vzhledu vsi (DevVillagePreview). V produkci
 * neexistuje. `?layers=initial` ukáže krajinu z verzí vrstev sídel založených do 18. 10. 2026.
 */
export default async function DevLandscapePage({ searchParams }: Props): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const seed = parseSeed(params.seed);
  const initial = params.layers === 'initial';
  const versions = initial ? INITIAL_LAYER_VERSIONS : CURRENT_LAYER_VERSIONS;
  const href = (nextSeed: number, layersInitial = initial): string =>
    `/dev/landscape?seed=${nextSeed}${layersInitial ? '&layers=initial' : ''}`;

  return (
    <main className="h-screen overflow-hidden">
      <DevVillagePreview landscape={encodeLandscape(generateLandscape(seed, versions))} />
      <nav className="fixed top-0 left-0 z-10 flex items-center gap-4 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="font-serif text-lg text-stone-900 dark:text-stone-100">
          Náhled krajiny · seed {seed}
          {initial ? ' · původní vrstvy' : ''}
        </span>
        <Link href={href(Math.max(0, seed - 1))} className={linkClass}>
          ← předchozí
        </Link>
        <Link href={href(seed + 1)} className={linkClass}>
          další →
        </Link>
        <Link href={href(randomInt(0, 2 ** 31))} className={linkClass}>
          náhodná
        </Link>
        <Link href={href(seed, !initial)} className={linkClass}>
          {initial ? 'nové vrstvy' : 'původní vrstvy'}
        </Link>
      </nav>
    </main>
  );
}
