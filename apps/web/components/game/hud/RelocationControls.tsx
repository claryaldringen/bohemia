'use client';

import { useState, type ReactElement } from 'react';
import type { DwellingType } from '@bohemia/game';
import { RELOCATION_TYPES } from '@/lib/relocation-view';
import { formatInteger, formatManDays, formatPercent } from '@/lib/village-format';
import { DWELLING_NAMES, type BuildOption } from '@/lib/village-view';
import { RESOURCE_ICONS } from './BuildGrid';
import { Tooltip } from './Tooltip';

// Přestěhování domácnosti v panelu výběru (migration.md – Přestěhování domácnosti, Výběr víc
// obydlí): tlačítka Přestěhovat (nový dům – zemnice, nebo polozemnice), Odejít (zatím zašedlé –
// odchod do nové vsi je fáze 3 a 4) a průběh rozestavěného stěhování se zrušením.

/** Popisek tlačítka Přestěhovat: co a kolik to stojí – chybějící dřevo červeně (jako 0 A.D.). */
function RelocateTooltip({
  type,
  option,
  households,
}: {
  type: DwellingType;
  option: BuildOption;
  households: number;
}): ReactElement {
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
        Přestěhovat – {DWELLING_NAMES[type].nominative.toLowerCase()}
      </span>
      {households > 1 && <span className="text-[#bfa77a]"> ×{households}</span>}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-1">
          <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
          {formatManDays(option.laborManDays)}
        </span>
        {option.upfront.map((cost) => (
          <span
            key={cost.resource}
            data-resource={cost.resource}
            data-missing={cost.missing > 0}
            className={`flex items-center gap-1 ${cost.missing > 0 ? 'font-semibold text-red-400' : ''}`}
          >
            <img
              src={RESOURCE_ICONS[cost.resource].src}
              alt={RESOURCE_ICONS[cost.resource].name}
              width={16}
              height={16}
            />
            {formatInteger(cost.amount)}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Tlačítka Přestěhovat – jedno na typ nového domu (ikona zemnice / polozemnice, cena v popisku).
 * Bez dřeva předem zašedlé. U víc domácností se nové domy umisťují postupně, jeden za druhým.
 */
export function RelocateButtons({
  options,
  households,
  onRelocate,
}: {
  options: Record<DwellingType, BuildOption>;
  /** Kolik domácností se stěhuje (po jedné umístí hráč nový dům každé). */
  households: number;
  onRelocate?: (type: DwellingType) => void;
}): ReactElement {
  return (
    <div role="group" aria-label="Přestěhovat" className="flex items-center gap-1">
      {RELOCATION_TYPES.map((type) => {
        const option = options[type];
        return (
          <Tooltip
            key={type}
            content={<RelocateTooltip type={type} option={option} households={households} />}
            placement="above"
          >
            <button
              type="button"
              data-testid={`relocate-${type}`}
              aria-label={`Přestěhovat – ${DWELLING_NAMES[type].nominative.toLowerCase()}`}
              disabled={!option.affordable || !onRelocate}
              onClick={() => onRelocate?.(type)}
              className="hud-icon-button h-9 w-9"
            >
              <img
                src={`/icons/build/${type}.png`}
                alt=""
                width={128}
                height={128}
                draggable={false}
                className="h-full w-full object-cover"
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Tlačítko Odejít – odchod do nové vsi; zatím zašedlé (migration.md – fáze 3 a 4). */
export function LeaveButton(): ReactElement {
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
            Odejít do nové vsi
          </span>
          <span className="mt-0.5 block font-semibold text-red-400">Zatím nejde</span>
        </span>
      }
      placement="above"
    >
      <button
        type="button"
        data-testid="leave-village"
        disabled
        className="hud-button px-2 py-0.5 font-serif text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
      >
        Odejít
      </button>
    </Tooltip>
  );
}

/**
 * Rozestavěné stěhování: průběh stavby nového domu a tlačítko Zrušit (dřevo se vrátí na
 * hromadu). Dokud server nezrušení nepotvrdí, tlačítko čeká.
 */
export function RelocationProgress({
  constructionId,
  progress,
  onCancel,
}: {
  constructionId: number;
  progress: number;
  onCancel?: (constructionId: number) => Promise<void>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div data-testid="selection-relocation" className="flex items-center gap-2">
      <Tooltip content={`Stěhování – nový dům ${formatPercent(progress)}`} placement="above">
        <span
          role="progressbar"
          aria-label="Stěhování"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          tabIndex={0}
          className="hud-bar block h-2.5 w-28"
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      </Tooltip>
      <button
        type="button"
        data-testid="cancel-relocation"
        disabled={busy || !onCancel}
        aria-busy={busy}
        onClick={() => {
          if (!onCancel || busy) return;
          setBusy(true);
          void onCancel(constructionId).finally(() => setBusy(false));
        }}
        className="hud-button px-2 py-0.5 font-serif text-sm whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
      >
        Zrušit
      </button>
    </div>
  );
}
