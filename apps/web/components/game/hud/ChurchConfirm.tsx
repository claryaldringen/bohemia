'use client';

import type { ReactElement } from 'react';
import type { ChurchDims, ChurchType } from '@bohemia/game';
import {
  churchMeasureValue,
  churchMeasures,
  stepChurchDims,
  type ChurchMeasure,
} from '@/lib/church-placement';
import { formatDecimal } from '@/lib/village-format';
import { Tooltip } from './Tooltip';

/** Značka a popisek míry – slova jen v popisku (UI jako 0 A.D.). */
const MEASURES: Record<ChurchMeasure, { mark: string; name: string }> = {
  diameter: { mark: 'Ø', name: 'Průměr lodi' },
  width: { mark: '↕', name: 'Šířka lodi' },
  length: { mark: '↔', name: 'Délka lodi' },
  height: { mark: '⤒', name: 'Výška lodi' },
};

const metres = (n: number): string => (Number.isInteger(n) ? String(n) : formatDecimal(n, 1));

/**
 * Panel u potvrzení kostela (churches.md – Stavba; vzor `FortConfirm`): míry lodi tlačítky +/−
 * (rotunda průměr a výška, jinak šířka, délka a výška – ořezané `clampChurchDims`) a ikona
 * kladiva, která kostel položí jako Enter. Délku a osu dá tah ve scéně; neprošlé místo – kladivo
 * zašedlé s důvodem v popisku.
 */
export function ChurchConfirm({
  type,
  dims,
  reason,
  onDims,
  onConfirm,
}: {
  type: ChurchType;
  dims: ChurchDims;
  /** Proč kostel nejde položit; null – projde. */
  reason: string | null;
  onDims: (dims: ChurchDims) => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div
      className="hud-panel fixed bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 p-1.5"
      data-hud-block
      data-testid="church-confirm-panel"
    >
      {churchMeasures(dims).map((measure) => {
        const { mark, name } = MEASURES[measure];
        const value = churchMeasureValue(dims, measure);
        const step = (direction: 1 | -1): ChurchDims =>
          stepChurchDims(type, dims, measure, direction);
        const less = step(-1);
        const more = step(1);
        return (
          <Tooltip key={measure} content={`${name} (m)`} placement="above">
            <span className="flex items-center gap-0.5" data-testid={`church-measure-${measure}`}>
              <button
                type="button"
                aria-label={`${name} −`}
                data-testid={`church-${measure}-less`}
                disabled={churchMeasureValue(less, measure) === value}
                className="hud-icon-button h-7 w-6 text-sm font-semibold disabled:opacity-40"
                onClick={() => onDims(less)}
              >
                −
              </button>
              <span className="min-w-12 text-center font-serif text-sm font-semibold text-[#f3dfb0] tabular-nums">
                <span aria-hidden className="mr-0.5 text-[#bfa77a]">
                  {mark}
                </span>
                <span data-testid={`church-${measure}-value`}>{metres(value)}</span>
              </span>
              <button
                type="button"
                aria-label={`${name} +`}
                data-testid={`church-${measure}-more`}
                disabled={churchMeasureValue(more, measure) === value}
                className="hud-icon-button h-7 w-6 text-sm font-semibold disabled:opacity-40"
                onClick={() => onDims(more)}
              >
                +
              </button>
            </span>
          </Tooltip>
        );
      })}
      <Tooltip content="Postavit kostel (Enter)" denied={reason} placement="above">
        <button
          type="button"
          data-testid="church-confirm"
          aria-label="Postavit kostel"
          aria-disabled={reason !== null}
          onClick={() => {
            if (reason === null) onConfirm();
          }}
          className={`hud-icon-button h-9 w-9 ${reason === null ? '' : 'opacity-40'}`}
        >
          <img
            src="/icons/resources/labor.png"
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
