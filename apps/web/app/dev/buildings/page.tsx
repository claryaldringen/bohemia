import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { BuildingShowcaseView } from './BuildingShowcaseView';

/**
 * Vývojový náhled modelů staveb (obydlí a řemeslné dílny) vedle sebe na louce se světlem hry –
 * bez přihlášení a databáze. V produkci neexistuje.
 */
export default function DevBuildingsPage(): ReactElement {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="h-screen overflow-hidden">
      <BuildingShowcaseView />
    </main>
  );
}
