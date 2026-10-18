import { useState, type ReactElement, type ReactNode } from 'react';
import type { Direction8, TrailOption } from '@bohemia/game';
import type { VillageManor } from '@/lib/manor-view';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { formatDecimal, formatInteger } from '@/lib/village-format';
import { Tooltip } from './Tooltip';

// Dvorec vojvody v panelu výběru (trade.md – Dvorec vojvody): vylepšení celé vsi – zemská stezka
// do jednoho z 8 směrů (růžice šipek) a obchod se sousedy po hotových stezkách. Jako v 0 A.D.:
// ikony, cena v popisku, zašedlé s důvodem červeně.

/** Rozložení růžice 3 × 3 – sever nahoře, uprostřed dvorec. */
const COMPASS: readonly (Direction8 | null)[] = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];

const iconButton = (busy: boolean): string =>
  `hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`;

/** Ikona s číslem v popisku (práce, dřevo, dny cesty). */
function Cost({ icon, children }: { icon: string; children: ReactNode }): ReactElement {
  return (
    <span className="flex items-center gap-1">
      <img src={`/icons/resources/${icon}.png`} alt="" width={16} height={16} />
      {children}
    </span>
  );
}

/** Popisek směru stezky: název, cena (práce, dřevo), délka a dny cesty nosičů, důvod červeně. */
function TrailTooltip({ option }: { option: TrailOption }): ReactElement {
  const name = DIRECTION_NAMES[option.direction].name;
  return (
    <span className="flex flex-col gap-0.5">
      <span>Zemská stezka – {name}</span>
      {option.status === 'none' && option.lengthM !== null && (
        <span className="flex items-center gap-2 tabular-nums">
          <Cost icon="labor">{formatDecimal(option.laborManDays, 0)}</Cost>
          {option.trees > 0 && <Cost icon="wood">{option.trees}</Cost>}
          <span>{formatInteger(option.lengthM)} m</span>
          {option.tripDays !== null && <Cost icon="date">{option.tripDays}</Cost>}
        </span>
      )}
      {option.status === 'building' && (
        <span className="tabular-nums">{Math.round(option.progress * 100)} %</span>
      )}
      {option.status === 'none' && option.blocked && (
        <span data-testid="trail-blocked" className="font-semibold text-red-400">
          {option.blocked}
        </span>
      )}
    </span>
  );
}

/**
 * Růžice stezek: 8 šipek kolem dvorce. Hotová stezka zlatě, rozestavěná s průběhem, kam stezka
 * nevede nebo chybí dřevo, zašedlé s důvodem v popisku.
 */
export function TrailCompass({
  trails,
  busy = false,
  onBuild,
}: {
  trails: readonly TrailOption[];
  busy?: boolean;
  onBuild?: (direction: Direction8) => void;
}): ReactElement {
  return (
    <div
      data-testid="trail-compass"
      role="group"
      aria-label="Zemská stezka"
      className="grid grid-cols-3 gap-1"
    >
      {COMPASS.map((direction, i) => {
        if (direction === null) {
          return (
            <img
              key={i}
              src="/icons/build/dvorec.png"
              alt=""
              width={40}
              height={40}
              className="hud-inset h-10 w-10 rounded"
            />
          );
        }
        const option = trails.find((t) => t.direction === direction);
        if (!option) return <span key={i} />;
        const { arrow, name } = DIRECTION_NAMES[direction];
        const done = option.status === 'built';
        return (
          <Tooltip key={i} placement="above" content={<TrailTooltip option={option} />}>
            <button
              type="button"
              data-testid={`trail-${direction}`}
              data-status={option.status}
              aria-label={`Zemská stezka – ${name}`}
              disabled={option.status !== 'none' || option.blocked !== null || busy || !onBuild}
              aria-busy={busy}
              onClick={() => onBuild?.(direction)}
              className={`${iconButton(busy)} relative text-xl font-bold ${done ? 'text-[#f3cf86] ring-2 ring-[#c9a14a]' : 'text-[#ecdfc4]'}`}
            >
              {arrow}
              {option.status === 'building' && (
                <span className="absolute inset-x-1 bottom-1 h-1 rounded bg-black/50">
                  <span
                    className="block h-full rounded bg-[#d8b25c]"
                    style={{ width: `${Math.round(option.progress * 100)}%` }}
                  />
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Vylepšení vsi ve dvorci: tlačítko zemské stezky (otevře růžici směrů) a obchodu (otevře panel
 * obchodu – jen s hotovou stezkou). `trade` – obsah panelu obchodu (TradePanel).
 */
export function ManorUpgrades({
  manor,
  onBuildTrail,
  trade,
}: {
  manor: VillageManor;
  onBuildTrail?: (direction: Direction8) => Promise<void>;
  trade?: (close: () => void) => ReactNode;
}): ReactElement {
  const [open, setOpen] = useState<'trail' | 'trade' | null>(null);
  const [busy, setBusy] = useState(false);
  const build = (direction: Direction8): void => {
    if (!onBuildTrail || busy) return;
    setBusy(true);
    void onBuildTrail(direction).finally(() => setBusy(false));
  };
  const anyBuilt = manor.trails.some((t) => t.status === 'built');
  const toggle = (what: 'trail' | 'trade'): void => setOpen((o) => (o === what ? null : what));
  return (
    <div data-testid="manor-upgrades" className="relative flex items-center gap-1.5">
      <Tooltip placement="above" content="Zemská stezka">
        <button
          type="button"
          data-testid="manor-trail"
          aria-label="Zemská stezka"
          aria-expanded={open === 'trail'}
          onClick={() => toggle('trail')}
          className={iconButton(false)}
        >
          <img
            src="/icons/build/stezka.png"
            alt=""
            width={40}
            height={40}
            className="h-full w-full"
          />
        </button>
      </Tooltip>
      <Tooltip
        placement="above"
        content={
          <span className="flex flex-col gap-0.5">
            <span>Obchod</span>
            {!anyBuilt && (
              <span data-testid="trade-blocked" className="font-semibold text-red-400">
                Nejdřív je potřeba postavit zemskou stezku.
              </span>
            )}
          </span>
        }
      >
        <button
          type="button"
          data-testid="manor-trade"
          aria-label="Obchod"
          aria-expanded={open === 'trade'}
          disabled={!anyBuilt || !trade}
          onClick={() => toggle('trade')}
          className={iconButton(false)}
        >
          <img
            src="/icons/build/obchod.png"
            alt=""
            width={40}
            height={40}
            className="h-full w-full"
          />
        </button>
      </Tooltip>
      {open === 'trail' && (
        <div className="hud-panel absolute bottom-full left-0 z-30 mb-3 p-2" data-hud-block>
          <TrailCompass trails={manor.trails} busy={busy} onBuild={build} />
        </div>
      )}
      {open === 'trade' && trade && (
        <div className="hud-panel absolute bottom-full left-0 z-30 mb-3 p-2" data-hud-block>
          {trade(() => setOpen(null))}
        </div>
      )}
    </div>
  );
}
