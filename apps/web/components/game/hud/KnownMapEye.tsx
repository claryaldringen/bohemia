'use client';

import { createContext, useContext, type CSSProperties, type ReactElement } from 'react';
import type { GridCell } from '@bohemia/game';
import { nextKnownCell, UNKNOWN_MAP, type KnownVillage } from '@/lib/journey-view';
import { Tooltip } from './Tooltip';

// Oko u rodu a u cíle tažení (lord-control.md – Co hráč vidí: Známá mapa; journey.md – Známá
// mapa): otevře mapu rodu tak, jak ji rod zná. Rod bez známé mapy má oko zašedlé s důvodem
// u kurzoru; má-li map víc, každý další klik otevře další.

/**
 * Co oko potřebuje od hry: mapy, které rod zná, naposled otevřenou mapu každého rodu (scéna
 * panel zruší, takže si ji drží hra – jinak by další klik šel pořád na první) a otevření mapy.
 */
export interface KnownMapActions {
  known: readonly KnownVillage[];
  last: Readonly<Record<string, GridCell>>;
  open: (houseId: string, cell: GridCell) => void;
}

/** Oko jako maska v barvě textu – táž ikona jako v `CampaignMap` (`public/icons/war/eye.svg`, CC0). */
const EYE_ICON: CSSProperties = {
  maskImage: 'url(/icons/war/eye.svg)',
  WebkitMaskImage: 'url(/icons/war/eye.svg)',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
};

export const KnownMapContext = createContext<KnownMapActions | null>(null);

export function KnownMapEye({
  houseId,
  testId = 'known-map-eye',
}: {
  /** Rod, jehož mapu oko otevře; null – nic se neví. */
  houseId: string | null;
  testId?: string;
}): ReactElement | null {
  const actions = useContext(KnownMapContext);
  if (!actions) return null;
  const cell =
    houseId === null ? null : nextKnownCell(actions.known, houseId, actions.last[houseId] ?? null);
  const label = cell ? 'Známá mapa' : UNKNOWN_MAP;
  return (
    <Tooltip content={label}>
      <button
        type="button"
        data-testid={testId}
        data-house-id={houseId ?? ''}
        data-known={cell ? 'yes' : 'no'}
        aria-label={label}
        aria-disabled={cell === null}
        onClick={() => {
          if (cell && houseId !== null) actions.open(houseId, cell);
        }}
        className={`hud-inset inline-flex h-6 w-6 items-center justify-center rounded ${
          cell ? 'cursor-pointer text-[#f3cf86]' : 'cursor-not-allowed text-[#6b5a40] opacity-50'
        }`}
      >
        <span aria-hidden className="inline-block size-4 bg-current" style={EYE_ICON} />
      </button>
    </Tooltip>
  );
}
