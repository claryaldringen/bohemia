'use client';

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
  VILLAGE_NAME_MAX_LENGTH,
  checkVillageName,
  getWorldState,
  type WorldClock,
} from '@bohemia/game';
import { authClient } from '@/lib/auth-client';
import { formatWorldState } from '@/lib/game-date';
import { formatDecimal, formatInteger, formatPercent } from '@/lib/village-format';
import type { VillageView } from '@/lib/village-view';
import { Tooltip } from './Tooltip';

// Herní den trvá v ostrém světě ≈ 86 s, v zrychlených testovacích světech i zlomek sekundy.
const DATE_REFRESH_MS = 1000;

/** Stav nasycení pro barvu ikony: syto / hlad / velký hlad. */
export function satiationState(satiation: number): 'fed' | 'hungry' | 'starving' {
  if (satiation >= 0.995) return 'fed';
  return satiation >= 0.6 ? 'hungry' : 'starving';
}

const SATIATION_GLOW: Record<ReturnType<typeof satiationState>, string> = {
  fed: 'drop-shadow(0 0 3px rgb(120 210 110 / 0.9))',
  hungry: 'drop-shadow(0 0 3px rgb(240 180 60 / 0.95))',
  starving: 'drop-shadow(0 0 4px rgb(235 70 50 / 1)) saturate(0.6)',
};

function Resource({
  icon,
  name,
  testId,
  children,
  filter,
}: {
  icon: string;
  name: string;
  testId: string;
  children?: ReactNode;
  filter?: string;
}): ReactElement {
  return (
    <Tooltip content={name}>
      <span data-hud-block className="flex h-8 items-center gap-1 px-1.5" tabIndex={0}>
        <img
          src={`/icons/resources/${icon}.png`}
          alt=""
          width={26}
          height={26}
          className="h-[26px] w-[26px]"
          style={filter ? { filter } : undefined}
        />
        {children !== undefined && (
          <span data-testid={testId} className="text-sm font-semibold tabular-nums">
            {children}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

/** Jméno vsi – kliknutím se přepíše na místě, Enter uloží, Esc zruší. */
function VillageName({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => Promise<string | null>;
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft === null) {
    return (
      <button
        type="button"
        data-testid="village-name"
        data-hud-block
        onClick={() => {
          setDraft(name);
          setError(null);
        }}
        className="max-w-56 truncate rounded px-2 py-0.5 font-serif text-lg text-[#f3dfb0] hover:text-[#ffe9b8] focus-visible:outline-2 focus-visible:outline-[#f3cf86]"
      >
        {name}
      </button>
    );
  }
  const check = checkVillageName(draft);
  const reason = error ?? (check.ok ? null : check.reason);
  return (
    <Tooltip content={reason} placement="below">
      <input
        data-hud-block
        aria-label="Jméno vsi"
        aria-invalid={reason !== null}
        value={draft}
        autoFocus
        maxLength={VILLAGE_NAME_MAX_LENGTH}
        disabled={saving}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (!saving) setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(null);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (!check.ok || saving) return;
            setSaving(true);
            void onRename(draft).then((failure) => {
              setSaving(false);
              if (failure === null) setDraft(null);
              else setError(failure);
            });
          }
        }}
        className={`w-56 rounded border bg-[#15100b] px-2 py-0.5 font-serif text-lg text-[#f3dfb0] outline-none ${reason ? 'border-red-500' : 'border-[#8a6a3c] focus:border-[#e0b062]'}`}
      />
    </Tooltip>
  );
}

function IconButton({
  label,
  tooltip,
  pressed,
  onClick,
  children,
}: {
  label: string;
  tooltip: ReactNode;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip content={tooltip} placement="below-left">
      <button
        type="button"
        data-hud-block
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded text-[#d8c39a] hover:bg-white/5 hover:text-[#ffe9b8] focus-visible:outline-2 focus-visible:outline-[#f3cf86]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Horní lišta jako v 0 A.D.: jméno vsi (klik = přejmenovat), ikony s čísly – lidé, obilí,
 * volná práce, nasycení (jen barva ikony), herní datum – a vpravo zvuk a odhlášení.
 */
export function TopBar({
  view,
  world,
  initialNowMs,
  email,
  soundOn,
  onToggleSound,
  onRename,
}: {
  view: VillageView | null;
  world: WorldClock;
  /** Čas serveru při renderu – první render v prohlížeči tak sedí s HTML ze serveru. */
  initialNowMs: number;
  email: string;
  soundOn: boolean;
  onToggleSound: () => void;
  onRename: (name: string) => Promise<string | null>;
}): ReactElement {
  const [nowMs, setNowMs] = useState(initialNowMs);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), DATE_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const people = view ? view.people.children + view.people.adults + view.people.elders : 0;
  const satiation = view ? satiationState(view.satiation) : 'fed';

  return (
    <header
      data-testid="top-bar"
      className="hud-panel fixed inset-x-0 top-0 z-20 flex h-11 items-center gap-1 rounded-none border-x-0 border-t-0 px-2"
    >
      {view && <VillageName name={view.name} onRename={onRename} />}
      {view && (
        <div className="ml-2 flex items-center gap-1 border-l border-[#5c4526] pl-2">
          <Resource icon="people" name="Lidé" testId="village-people">
            {people}
          </Resource>
          <Resource icon="food" name="Obilí" testId="village-stores">
            {formatInteger(view.storesKg)}
          </Resource>
          <Resource icon="labor" name="Volná práce" testId="village-labor">
            {formatDecimal(Math.max(0, view.commonLaborPerDay), 1)}
          </Resource>
          <span data-testid="village-satiation" data-state={satiation} className="contents">
            <Resource
              icon="satiation"
              name={`Nasycení ${formatPercent(view.satiation)}`}
              testId="village-satiation-value"
              filter={SATIATION_GLOW[satiation]}
            />
          </span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Resource icon="date" name="Herní datum" testId="game-date">
          <span className="font-serif font-normal">
            {formatWorldState(getWorldState(nowMs, world), world)}
          </span>
        </Resource>
        <span className="mx-1 h-6 border-l border-[#5c4526]" aria-hidden />
        <IconButton
          label="Zvuky krajiny"
          tooltip={soundOn ? 'Zvuk' : 'Bez zvuku'}
          pressed={soundOn}
          onClick={onToggleSound}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
            {soundOn ? (
              <>
                <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
                <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
              </>
            ) : (
              <path d="M16 9.5l5 5m0-5l-5 5" />
            )}
          </svg>
        </IconButton>
        <IconButton
          label="Odhlásit"
          tooltip={<span className="whitespace-nowrap">Odhlásit · {email}</span>}
          onClick={() => {
            void authClient.signOut().then(() => window.location.assign('/'));
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
            <path d="M10 8l-4 4 4 4" />
            <path d="M6 12h10" />
          </svg>
        </IconButton>
      </div>
    </header>
  );
}
