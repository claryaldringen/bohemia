import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { DefenseStance, Direction8, TrailOption } from '@bohemia/game';
import { usePanelOptions } from '@/hooks/use-panel-options';
import { useDismiss } from '@/hooks/use-dismiss';
import type { VillageManor } from '@/lib/manor-view';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { formatDecimal, formatInteger } from '@/lib/village-format';
import { useRightDenied, useVillageId } from './rights';
import { ArmyPanel } from './ArmyPanel';
import { Tooltip } from './Tooltip';
import { PrisonersPanel, type PrisonerAction } from './PrisonersPanel';

// Dvorec vojvody v panelu výběru (trade.md – Dvorec vojvody): vylepšení celé vsi – zemská stezka
// do jednoho z 8 směrů (růžice šipek) a obchod se sousedy po hotových stezkách. Jako v 0 A.D.:
// ikony, cena v popisku, zašedlé s důvodem červeně.

/** Rozložení růžice 3 × 3 – sever nahoře, uprostřed dvorec. */
const COMPASS: readonly (Direction8 | null)[] = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];

const iconButton = (busy: boolean): string =>
  `hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`;

/** Postoje vsi před cizím vojskem (war.md – Obránci): ikona, název a krátký popis v bublině. */
const STANCES: readonly {
  stance: DefenseStance;
  icon: string;
  label: string;
  hint: string;
}[] = [
  {
    stance: 'defend',
    icon: '/icons/war/shield-wall.svg',
    label: 'Bránit se',
    hint: 'Lidé se seběhnou do skupin domů a brání se do bodu zlomu.',
  },
  {
    stance: 'surrender',
    icon: '/icons/war/white-flag.svg',
    label: 'Vzdát se při přesile',
    hint: 'Skupina se vzdá, je-li útočníků víc než 1,5× obránců; jinak se brání.',
  },
  {
    stance: 'flee',
    icon: '/icons/war/forest.svg',
    label: 'Raději utéct',
    hint: 'Lidé s dobytkem a zásobami odejdou do nejbližšího lesa (výchozí).',
  },
];

/** Ikona s číslem v popisku (práce, dřevo, dny cesty). */
function Cost({ icon, children }: { icon: string; children: ReactNode }): ReactElement {
  return (
    <span className="flex items-center gap-1">
      <img src={`/icons/resources/${icon}.png`} alt="" width={16} height={16} />
      {children}
    </span>
  );
}

/**
 * Stromy v průseku lesem (roads.md – Průsek lesem) – vykácí se se stavbou, klády na hromadu.
 */
export function SwathTrees({ trees }: { trees: number }): ReactElement {
  return (
    <span className="flex items-center gap-1" data-testid="swath-trees">
      <img src="/icons/build/dub.png" alt="Průsek lesem" width={16} height={16} />
      {trees}
    </span>
  );
}

/**
 * Popisek směru stezky: název, cena (práce, dřevo hatě), stromy v průseku lesem, délka a dny
 * cesty nosičů, důvod červeně.
 */
function TrailTooltip({ option }: { option: TrailOption }): ReactElement {
  const name = DIRECTION_NAMES[option.direction].name;
  return (
    <span className="flex flex-col gap-0.5">
      <span>Zemská stezka – {name}</span>
      {option.status === 'none' && option.lengthM !== null && (
        <span className="flex items-center gap-2 tabular-nums">
          <Cost icon="labor">{formatDecimal(option.laborManDays, 0)}</Cost>
          {option.trees > 0 && <Cost icon="wood">{option.trees}</Cost>}
          {option.swathTrees > 0 && <SwathTrees trees={option.swathTrees} />}
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
  const denied = useRightDenied('build');
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
          <Tooltip
            key={i}
            denied={denied}
            placement="above"
            content={<TrailTooltip option={option} />}
          >
            <button
              type="button"
              data-testid={`trail-${direction}`}
              data-status={option.status}
              aria-label={`Zemská stezka – ${name}`}
              disabled={
                option.status !== 'none' ||
                option.blocked !== null ||
                busy ||
                !onBuild ||
                denied !== null
              }
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
 * obchodu – jen s hotovou stezkou). `trade` – obsah panelu obchodu (TradePanel). Růžice i obchod
 * se otevřou nad panelem výběru (`hud-popup` – panel se nezvětší) a zavře je stisk myši mimo ně.
 */
export function ManorUpgrades({
  manor,
  onBuildTrail,
  onDeclareHunt,
  onSetStance,
  onDecidePrisoner,
  trade,
}: {
  manor: VillageManor;
  onBuildTrail?: (direction: Direction8) => Promise<void>;
  onDeclareHunt?: () => Promise<string | null | void>;
  onSetStance?: (stance: DefenseStance) => Promise<string | null | void>;
  /** Rozhodnutí o zajatci (držet, propustit, popravit); vrací důvod odmítnutí. */
  onDecidePrisoner?: (id: string, action: PrisonerAction) => Promise<string | null | void>;
  trade?: (close: () => void) => ReactNode;
}): ReactElement {
  const [open, setOpen] = useState<'trail' | 'trade' | 'army' | null>(null);
  const warDenied = useRightDenied('war');
  const villageId = useVillageId();
  const [busy, setBusy] = useState(false);
  const huntDenied = useRightDenied('steward');
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(open !== null, rootRef, () => setOpen(null));
  const build = (direction: Direction8): void => {
    if (!onBuildTrail || busy) return;
    setBusy(true);
    void onBuildTrail(direction).finally(() => setBusy(false));
  };
  const anyBuilt = manor.trailBuilt;
  // stezky do 8 směrů server spočítá až pro otevřený kompas (panel-options.ts)
  const asked = usePanelOptions(open === 'trail' ? { panel: 'trails' } : null);
  const trails = asked?.panel === 'trails' ? asked.trails : null;
  const toggle = (what: 'trail' | 'trade' | 'army'): void =>
    setOpen((o) => (o === what ? null : what));
  return (
    <div ref={rootRef} data-testid="manor-upgrades" className="flex items-center gap-1.5">
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
        denied={huntDenied}
        content={
          <span className="flex flex-col gap-0.5">
            <span>Lov navíc</span>
            {manor.huntDenied !== null && (
              <span data-testid="hunt-blocked" className="font-semibold text-red-400">
                {manor.huntDenied}
              </span>
            )}
          </span>
        }
      >
        <button
          type="button"
          data-testid="manor-hunt"
          aria-label="Lov navíc"
          disabled={manor.huntDenied !== null || !onDeclareHunt || busy || huntDenied !== null}
          onClick={() => {
            if (!onDeclareHunt || busy) return;
            setBusy(true);
            void onDeclareHunt().finally(() => setBusy(false));
          }}
          className={iconButton(busy)}
        >
          <img
            src="/icons/resources/spear.png"
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-contain p-1"
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
      <Tooltip placement="above" denied={warDenied} content="Vojsko">
        <button
          type="button"
          data-testid="manor-army"
          aria-label="Vojsko"
          aria-expanded={open === 'army'}
          disabled={villageId === null || warDenied !== null}
          onClick={() => toggle('army')}
          className={iconButton(false)}
        >
          <img
            src="/icons/resources/boj.png"
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-contain p-1"
          />
        </button>
      </Tooltip>
      {open === 'army' && villageId !== null && (
        <ArmyPanel villageId={villageId} onClose={() => setOpen(null)} />
      )}
      <div data-testid="manor-stance" className="ml-1 flex items-center gap-1.5">
        {STANCES.map((st) => (
          <Tooltip
            key={st.stance}
            placement="above"
            denied={warDenied}
            content={
              <span className="flex flex-col gap-0.5">
                <span>{st.label}</span>
                <span className="text-[#cdbf9f]">{st.hint}</span>
              </span>
            }
          >
            <button
              type="button"
              data-testid={`stance-${st.stance}`}
              aria-label={st.label}
              aria-pressed={manor.stance === st.stance}
              disabled={!onSetStance || busy || warDenied !== null}
              onClick={() => {
                if (!onSetStance || busy || manor.stance === st.stance) return;
                setBusy(true);
                void onSetStance(st.stance).finally(() => setBusy(false));
              }}
              className={`${iconButton(busy)} ${manor.stance === st.stance ? 'ring-2 ring-[#c9a14a]' : ''}`}
            >
              <img
                src={st.icon}
                alt=""
                width={40}
                height={40}
                className="h-full w-full object-contain p-1"
              />
            </button>
          </Tooltip>
        ))}
      </div>
      {manor.prisoners && onDecidePrisoner && (
        <PrisonersPanel prisoners={manor.prisoners} onDecide={onDecidePrisoner} />
      )}
      {open === 'trail' && (
        <div className="hud-panel hud-popup p-2" data-hud-block>
          {trails && <TrailCompass trails={trails} busy={busy} onBuild={build} />}
        </div>
      )}
      {open === 'trade' && trade && (
        <div className="hud-panel hud-popup p-2" data-hud-block>
          {trade(() => setOpen(null))}
        </div>
      )}
    </div>
  );
}
