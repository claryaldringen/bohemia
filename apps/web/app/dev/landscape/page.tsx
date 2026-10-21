import { randomInt } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  INITIAL_LAYER_VERSIONS,
  PREMIUM_CATALOG,
  PREMIUM_TYPES,
  PREVIOUS_LAYER_VERSIONS,
  type PremiumType,
} from '@bohemia/game';
import { parseSeed } from '@/lib/dev-seed';
import { encodeLandscape } from '@/lib/landscape-transfer';
import { DevVillagePreview } from './DevVillagePreview';
import { PROMONTORY_SEEDS } from './dev-promontory';
import { parsePremium } from './dev-premium';

interface Props {
  searchParams: Promise<{ seed?: string; layers?: string; premium?: string }>;
}

const linkClass = 'underline hover:text-stone-900 dark:hover:text-stone-100';

/** Verze vrstev náhledu podle `?layers=` – nové (výchozí), předchozí (bez skal u potoka), původní. */
const LAYERS = {
  current: { versions: CURRENT_LAYER_VERSIONS, label: '' },
  previous: { versions: PREVIOUS_LAYER_VERSIONS, label: ' · předchozí vrstvy (bez skal)' },
  initial: { versions: INITIAL_LAYER_VERSIONS, label: ' · původní vrstvy' },
} as const;
type Layers = keyof typeof LAYERS;

/**
 * Vývojový náhled krajiny bez přihlášení a databáze – pro ladění vzhledu a generátoru;
 * dole lišta pro zkoušku umisťování staveb a vzhledu vsi (DevVillagePreview). V produkci
 * neexistuje. `?layers=initial` ukáže krajinu z verzí vrstev sídel založených do 18. 10. 2026,
 * `?layers=previous` nová sídla do 20. 10. 2026 (bez skal u potoka) – na stejném seedu se dají
 * porovnat s novými vrstvami. `?premium=<typ>` ukáže prémiovou krajinu (premium-landscapes.md) –
 * odkazy typů a „průměrná“ pro porovnání na stejném seedu (jen nové vrstvy).
 */
export default async function DevLandscapePage({ searchParams }: Props): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const seed = parseSeed(params.seed);
  const layers: Layers =
    params.layers === 'initial' || params.layers === 'previous' ? params.layers : 'current';
  const { versions, label } = LAYERS[layers];
  // prémiový typ jen s novými vrstvami (průměrná krajina prémiových sídel)
  const premium = layers === 'current' ? parsePremium(params.premium) : undefined;
  const href = (
    nextSeed: number,
    nextLayers: Layers = layers,
    nextPremium: PremiumType | undefined = premium,
  ): string =>
    `/dev/landscape?seed=${nextSeed}${nextLayers === 'current' ? '' : `&layers=${nextLayers}`}${
      nextPremium && nextLayers === 'current' ? `&premium=${nextPremium}` : ''
    }`;

  return (
    <main className="h-screen overflow-hidden">
      <DevVillagePreview landscape={encodeLandscape(generateLandscape(seed, versions, premium))} />
      <nav className="fixed top-0 left-0 z-10 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-x-4 gap-y-1 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="font-serif text-lg text-stone-900 dark:text-stone-100">
          Náhled krajiny · seed {seed}
          {label}
          {premium ? ` · ${PREMIUM_CATALOG[premium].name}` : ''}
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
        {(Object.keys(LAYERS) as Layers[])
          .filter((other) => other !== layers)
          .map((other) => (
            <Link key={other} href={href(seed, other)} className={linkClass}>
              {other === 'current' ? 'nové vrstvy' : other === 'previous' ? 'předchozí' : 'původní'}
            </Link>
          ))}
        <span>
          ostrožna:{' '}
          {PROMONTORY_SEEDS.map((s) => (
            <Link key={s} href={href(s, 'current', undefined)} className={`${linkClass} ml-1`}>
              {s}
            </Link>
          ))}
        </span>
        <span className="basis-full text-xs" data-testid="dev-premium-types">
          prémiová:{' '}
          <Link
            href={href(seed, 'current', undefined)}
            className={`${linkClass} ml-1 ${premium ? '' : 'font-bold'}`}
          >
            průměrná
          </Link>
          {PREMIUM_TYPES.map((type) => (
            <Link
              key={type}
              href={href(seed, 'current', type)}
              className={`${linkClass} ml-2 ${type === premium ? 'font-bold' : ''}`}
            >
              {PREMIUM_CATALOG[type].name}
            </Link>
          ))}
        </span>
      </nav>
    </main>
  );
}
