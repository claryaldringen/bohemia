'use client';

import { createContext, useContext, useEffect, type CSSProperties, type ReactElement } from 'react';
import type { GridCell } from '@bohemia/game';
import {
  knownEyeState,
  UNKNOWN_MAP,
  type KnownStatus,
  type KnownVillage,
} from '@/lib/journey-view';
import { Tooltip } from './Tooltip';

// Oko u rodu a u cíle tažení (lord-control.md – Co hráč vidí: Známá mapa; journey.md – Známá
// mapa): otevře mapu rodu tak, jak ji rod zná. Rod bez známé mapy má oko zašedlé s důvodem
// u kurzoru (dokud se seznam nenačte nebo když dotaz selže, je zašedlé bez důvodu); má-li map víc, každý další klik otevře další.

/**
 * Co oko potřebuje od hry: mapy, které rod zná, naposled otevřenou mapu každého rodu (scéna
 * panel zruší, takže si ji drží hra – jinak by další klik šel pořád na první) a otevření mapy.
 */
export interface KnownMapActions {
  /** Stav seznamu: oko bez načteného seznamu nesmí tvrdit, že mapu rod nezná. */
  status: KnownStatus;
  known: readonly KnownVillage[];
  last: Readonly<Record<string, GridCell>>;
  open: (houseId: string, cell: GridCell) => void;
  /**
   * Panel s oky je otevřený – seznam se načte (při každém otevření panelu, ne na pozadí); vrátí
   * odhlášení při zavření panelu (`useKnownMapList`).
   */
  register: () => () => void;
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

/**
 * Panel s oky (Rod a vazalové, Vojsko): dokud je otevřený, hra drží seznam známých map – načte ho
 * při otevření panelu a po návratu ze známé mapy (journey.md – Známá mapa).
 */
export function useKnownMapList(): void {
  const register = useContext(KnownMapContext)?.register;
  useEffect(() => register?.(), [register]);
}

export function KnownMapEye({
  houseId,
  testId = 'known-map-eye',
}: {
  /** Rod, jehož mapu oko otevře; null – není rod (cíl tažení nevybraný), oko se nezobrazí. */
  houseId: string | null;
  testId?: string;
}): ReactElement | null {
  const actions = useContext(KnownMapContext);
  if (!actions) return null;
  const state = knownEyeState(
    actions.status,
    actions.known,
    houseId,
    houseId === null ? null : (actions.last[houseId] ?? null),
  );
  if (state.kind === 'hidden' || houseId === null) return null;
  const cell = state.kind === 'open' ? state.cell : null;
  const label = state.kind === 'open' ? 'Známá mapa' : state.kind === 'unknown' ? UNKNOWN_MAP : '';
  return (
    <Tooltip content={label} off={state.kind === 'pending'}>
      <button
        type="button"
        data-testid={testId}
        data-house-id={houseId}
        data-known={cell ? 'yes' : 'no'}
        aria-label={label || 'Známá mapa'}
        aria-disabled={cell === null}
        onClick={() => {
          if (cell) actions.open(houseId, cell);
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
