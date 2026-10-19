import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { DevPanelsView } from './DevPanelsView';

interface Props {
  searchParams: Promise<{ panel?: string }>;
}

/**
 * Vývojový náhled panelu výběru s ukázkovými daty (`?panel=dvorec`, `ohrada`, `pole`…) mezi
 * minimapou a mřížkou staveb – bez přihlášení, databáze a scény. V produkci neexistuje.
 */
export default async function DevPanelsPage({ searchParams }: Props): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const { panel } = await searchParams;
  return (
    <main className="h-screen overflow-hidden">
      <DevPanelsView initial={panel ?? null} />
    </main>
  );
}
