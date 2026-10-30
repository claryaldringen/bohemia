'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { VILLAGE_NAME_MAX_LENGTH, checkVillageName } from '@bohemia/game';
import type { VillageListItem } from '@/lib/village-list';
import { StewardBadge, StewardToggle } from './StewardToggle';
import { Tooltip } from './Tooltip';

// Jméno vsi v horní liště je přepínač vsí (migration.md – Víc vsí jednoho hráče): klik otevře
// seznam vsí hráče (jméno a lidé), klik na ves ji přepne. Přejmenování dvojklikem na jméno nebo
// ikonou tužky vedle něj (návrh Clauda) – Enter uloží, Esc zruší.

/** Stav vsi v seznamu – žije, na cestě, opuštěná, vymřelá (pro testy a vzhled). */
function villageState(village: VillageListItem): string {
  if (village.extinct) return 'extinct';
  if (village.abandoned) return 'abandoned';
  if (village.travelling) return 'travelling';
  return 'living';
}

/**
 * Seznam vsí hráče pod jménem vsi: jméno a lidé (ikona s číslem), vybraná ves označená, vymřelá
 * a opuštěná zašedlá, lidé na cestě s poznámkou (migration.md). Klik na jinou ves ji přepne.
 * Seznam je široký jako nejdelší jméno (bez zalomení, zkrátí se až na šířce okna).
 */
export function VillageList({
  villages,
  currentId,
  onSelect,
  onSetSteward,
}: {
  villages: readonly VillageListItem[];
  currentId: string;
  onSelect: (village: VillageListItem) => void;
  /** Zapne / vypne správce vsi (server action); bez něj se přepínače neukážou. */
  onSetSteward?: (villageId: string, on: boolean) => Promise<unknown>;
}): ReactElement {
  return (
    <ul
      role="listbox"
      aria-label="Vsi"
      data-testid="village-list"
      data-hud-block
      className="hud-panel absolute top-full left-0 z-30 mt-1 flex w-max max-w-[calc(100vw-1rem)] min-w-56 flex-col p-1 whitespace-nowrap"
    >
      {villages.map((village) => {
        const current = village.id === currentId;
        return (
          <li
            key={village.id}
            role="option"
            aria-selected={current}
            data-village={village.id}
            data-state={villageState(village)}
            className="flex"
          >
            <button
              type="button"
              data-testid="village-select"
              onClick={() => onSelect(village)}
              className={`flex flex-1 items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#f3cf86] ${current ? 'bg-white/10 text-[#ffe9b8]' : 'text-[#f3dfb0]'} ${village.extinct || village.abandoned ? 'opacity-50' : ''}`}
            >
              <span className="truncate font-serif text-base">{village.name}</span>
              {village.travelling && (
                <span className="text-xs text-[#bfa77a] italic">na cestě</span>
              )}
              {village.abandoned && <span className="text-xs text-[#bfa77a] italic">opuštěná</span>}
              <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                <img src="/icons/resources/people.png" alt="Lidé" width={18} height={18} />
                <span data-testid="village-list-people">{village.people}</span>
              </span>
            </button>
            {onSetSteward && !village.extinct && !village.abandoned && !village.travelling && (
              <StewardToggle
                on={village.steward === true}
                onToggle={(on) => onSetSteward(village.id, on)}
                testId="village-steward-toggle"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Přejmenování vsi na místě – Enter uloží, Esc zruší; neplatné jméno červeně s důvodem. */
function RenameInput({
  name,
  onRename,
  onDone,
}: {
  name: string;
  onRename: (name: string) => Promise<string | null>;
  onDone: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
          if (!saving) onDone();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onDone();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (!check.ok || saving) return;
            setSaving(true);
            void onRename(draft).then((failure) => {
              setSaving(false);
              if (failure === null) onDone();
              else setError(failure);
            });
          }
        }}
        className={`w-56 rounded border bg-[#15100b] px-2 py-0.5 font-serif text-lg text-[#f3dfb0] outline-none ${reason ? 'border-red-500' : 'border-[#8a6a3c] focus:border-[#e0b062]'}`}
      />
    </Tooltip>
  );
}

/**
 * Jméno vybrané vsi jako přepínač: klik otevře seznam vsí (`VillageList`), klik mimo nebo Esc ho
 * zavře; dvojklik na jméno nebo tužka vedle něj ves přejmenuje.
 */
export function VillageSwitcher({
  name,
  currentId,
  villages,
  onSelect,
  onRename,
  steward = false,
  onSetSteward,
}: {
  name: string;
  currentId: string;
  villages: readonly VillageListItem[];
  /** Přepne na jinou ves hráče. */
  onSelect: (village: VillageListItem) => void;
  onRename: (name: string) => Promise<string | null>;
  /** Správce vybrané vsi je zapnutý – ikona vedle jména. */
  steward?: boolean;
  onSetSteward?: (villageId: string, on: boolean) => Promise<unknown>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // klik mimo přepínač a Esc seznam zavřou
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const startRename = (): void => {
    setOpen(false);
    setRenaming(true);
  };

  if (renaming) {
    return <RenameInput name={name} onRename={onRename} onDone={() => setRenaming(false)} />;
  }
  return (
    <div ref={root} data-hud-block className="relative flex items-center">
      <button
        type="button"
        data-testid="village-name"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onDoubleClick={startRename}
        className="flex max-w-56 items-center gap-1 rounded px-2 py-0.5 font-serif text-lg text-[#f3dfb0] hover:text-[#ffe9b8] focus-visible:outline-2 focus-visible:outline-[#f3cf86] aria-expanded:text-[#ffe9b8]"
      >
        <span className="truncate">{name}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0"
          fill="currentColor"
        >
          <path d="M6 9l6 6 6-6z" />
        </svg>
      </button>
      {steward && <StewardBadge />}
      <Tooltip content="Přejmenovat" placement="below">
        <button
          type="button"
          data-testid="village-rename"
          aria-label="Přejmenovat ves"
          onClick={startRename}
          className="flex h-7 w-7 items-center justify-center rounded text-[#bfa77a] hover:bg-white/5 hover:text-[#ffe9b8] focus-visible:outline-2 focus-visible:outline-[#f3cf86]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 20h4L19 9l-4-4L4 16z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <VillageList
          villages={villages}
          currentId={currentId}
          onSetSteward={onSetSteward}
          onSelect={(village) => {
            setOpen(false);
            onSelect(village);
          }}
        />
      )}
    </div>
  );
}
