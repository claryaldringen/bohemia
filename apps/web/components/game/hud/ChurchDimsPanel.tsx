'use client';

import { useEffect, type ReactElement } from 'react';
import type { ChurchDims, ChurchType } from '@bohemia/game';
import { CHURCH_TYPE_NAMES, churchIcon } from '@/lib/build-items';
import { churchPlacementCost } from '@/lib/church-placement';
import { ChurchMeasureControls } from './ChurchConfirm';
import { CostIcons } from './CursorReason';
import { Tooltip } from './Tooltip';

/**
 * Panel rozměrů kostela před umístěním (churches.md – změna 16. 11. 2026, Martin: „Po kliknutí na
 * kostel si chci zadat rozměry a na základě nich rovnou vidět cenu kostela. Až pak kostel umístím
 * do scény“): míry lodi tlačítky +/− (`ChurchMeasureControls`), cena z rozměrů (`churchPlacementCost`
 * bez části závislé na místě – překážky a lom přidá náhled u kurzoru) a ikona kostela „Umístit“
 * (Enter) – přejde k umisťování ve scéně. Esc panel zavře.
 */
export function ChurchDimsPanel({
  type,
  dims,
  onDims,
  onPlace,
  onClose,
}: {
  type: ChurchType;
  dims: ChurchDims;
  onDims: (dims: ChurchDims) => void;
  onPlace: () => void;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        onPlace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPlace, onClose]);

  const cost = churchPlacementCost(type, dims);
  return (
    <div
      className="hud-panel fixed bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 p-1.5"
      data-hud-block
      data-testid="church-dims-panel"
    >
      <ChurchMeasureControls type={type} dims={dims} onDims={onDims} />
      <span
        data-testid="church-dims-cost"
        className="flex items-center gap-2 font-serif text-sm font-semibold text-[#f3dfb0] tabular-nums"
      >
        <CostIcons cost={cost} />
      </span>
      <Tooltip content={`${CHURCH_TYPE_NAMES[type]} – umístit (Enter)`} placement="above">
        <button
          type="button"
          data-testid="church-dims-place"
          aria-label="Umístit kostel"
          onClick={onPlace}
          className="hud-icon-button h-9 w-9"
        >
          <img
            src={`/icons/build/${churchIcon(type)}.png`}
            alt=""
            width={28}
            height={28}
            className="m-auto h-7 w-7"
          />
        </button>
      </Tooltip>
    </div>
  );
}
