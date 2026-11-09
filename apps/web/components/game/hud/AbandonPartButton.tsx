'use client';

import { useState, type ReactElement } from 'react';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

// Opuštění dílu pole (fields.md – Opuštěný díl; Martin 8. 11. 2026: „A“): přepínač v panelu dílu
// – opuštěný díl svítí, díl v osevu je tlumený (jako přepínač správce). Slova jen v popisku.

const ICON = '/icons/resources/abandon-part.png';

/** Popisek přepínače podle stavu dílu – co klik udělá. */
export function abandonPartLabel(abandoned: boolean, sown: boolean): string {
  if (abandoned) {
    return sown ? 'Opuštěno po žních – vrátit do osevu' : 'Opuštěný díl – vrátit do osevu';
  }
  return sown
    ? 'Opustit díl – po žních se už neoseje a zaroste'
    : 'Opustit díl – už se neoseje a zaroste';
}

/**
 * Přepínač Opustit díl / Vrátit do osevu. Dokud akce běží, tlačítko stojí – dvojklik by poslal
 * dva protichůdné požadavky. Nezaložený díl (`block`) a chybějící právo `build` ho zašední
 * s důvodem u kurzoru.
 */
export function AbandonPartButton({
  partId,
  abandoned,
  sown,
  block,
  onToggle,
}: {
  partId: number;
  abandoned: boolean;
  /** Díl je oset – opustí se až po žních. */
  sown: boolean;
  /** Proč díl opustit nejde; jde-li, null. */
  block: string | null;
  /** Opustí díl (true), nebo ho vrátí do osevu (false) – server action. */
  onToggle?: ((partId: number, abandon: boolean) => Promise<void>) | undefined;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const rightDenied = useRightDenied('build');
  const denied = rightDenied ?? (abandoned ? null : block);
  return (
    <Tooltip content={abandonPartLabel(abandoned, sown)} denied={denied} placement="above">
      <button
        type="button"
        data-testid="abandon-part"
        aria-label={abandoned ? 'Vrátit díl do osevu' : 'Opustit díl'}
        aria-pressed={abandoned}
        disabled={busy || !onToggle || denied !== null}
        aria-busy={busy}
        onClick={() => {
          if (!onToggle || busy) return;
          setBusy(true);
          void onToggle(partId, !abandoned).finally(() => setBusy(false));
        }}
        className={`hud-icon-button h-7 w-7 shrink-0 ${abandoned ? '' : 'opacity-40'}`}
      >
        <img src={ICON} alt="" width={20} height={20} className="m-auto h-5 w-5" />
      </button>
    </Tooltip>
  );
}
