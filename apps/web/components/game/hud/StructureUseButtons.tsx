'use client';

import { useState, type ReactElement } from 'react';
import type { UsableStructure } from '@bohemia/game';
import type { StructureUseView } from '@/lib/village-view-types';
import { formatDecimal, plural } from '@/lib/village-format';
import { CancelConstructionButton } from './RelocationControls';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';
import { Bar } from './selection/parts';

// Opustit, zbourat a vrátit stavbu (demolition.md – Rozhraní; Martin 8. 11. 2026: „Hráč/správce
// může nechat stavbu opustit nebo zbourat.“): ikony v panelu vybrané stavby jako v 0 A.D. – slova
// jen v popisku, důvod, proč nejde, u kurzoru. V provozu Opustit + Zbourat, opuštěná Vrátit +
// Zbourat, bouraná jen Zrušit (bourání).

export type StructureUseAction = 'abandon' | 'demolish' | 'restore';

/** Akce panelu nad stavbou – server actions; hotovo, až se vrátí. */
export interface StructureUseActions {
  onStructureUse?: (
    action: StructureUseAction,
    structure: UsableStructure,
    id: number,
  ) => Promise<void>;
  /** Zruší rozestavěnou stavbu – tady bourání (stavba zůstane opuštěná). */
  onCancelConstruction?: (constructionId: number) => Promise<void>;
}

const ICONS: Record<StructureUseAction, string> = {
  abandon: '/icons/resources/abandon-structure.png',
  demolish: '/icons/resources/demolish.png',
  restore: '/icons/resources/restore.png',
};

const NAMES: Record<StructureUseAction, string> = {
  abandon: 'Opustit',
  demolish: 'Zbourat',
  restore: 'Vrátit',
};

/** Klády v popisku: „1 kláda“, „3 klády“, „5 klád“. */
export function logsText(logs: number): string {
  return `${logs} ${plural(logs, 'kláda', 'klády', 'klád')}`;
}

/** Popisek Zbourat: „Zbourat – 7,5 čd, 2 klády zpět na hromadu“ (bez klád „bez klád“). */
export function demolishLabel(cost: { laborManDays: number; logs: number }): string {
  const labor = formatDecimal(cost.laborManDays, 1).replace(/,0$/, '');
  const logs = cost.logs > 0 ? `${logsText(cost.logs)} zpět na hromadu` : 'bez klád';
  return `Zbourat – ${labor} čd, ${logs}`;
}

const LABELS: Record<Exclude<StructureUseAction, 'demolish'>, string> = {
  abandon: 'Opustit – stavba se přestane používat a začne chátrat',
  restore: 'Vrátit – stavba se zase bude používat',
};

/**
 * Tlačítka Opustit / Zbourat / Vrátit vybrané stavby. Dokud akce běží, stojí všechna (`busy`) –
 * dvojklik by poslal dva pokyny. Důvod stavby (`use.block` – obyvatelé nemají kam jít…)
 * a chybějící právo `build` je zašední s důvodem u kurzoru.
 */
export function StructureUseButtons({
  use,
  onStructureUse,
  onCancelConstruction,
}: { use: StructureUseView } & StructureUseActions): ReactElement {
  const [busy, setBusy] = useState(false);
  const rightDenied = useRightDenied('build');
  if (use.demolishing !== null) {
    return (
      <CancelConstructionButton
        constructionId={use.demolishing.constructionId}
        onCancel={onCancelConstruction}
      />
    );
  }
  const run = (action: StructureUseAction): void => {
    if (!onStructureUse || busy) return;
    setBusy(true);
    void onStructureUse(action, use.structure, use.id).finally(() => setBusy(false));
  };
  const button = (
    action: StructureUseAction,
    label: string,
    block: string | null,
  ): ReactElement => {
    const denied = rightDenied ?? block;
    return (
      <Tooltip key={action} content={label} denied={denied} placement="above">
        <button
          type="button"
          data-testid={`structure-${action}`}
          aria-label={NAMES[action]}
          disabled={busy || !onStructureUse || denied !== null}
          aria-busy={busy}
          onClick={() => run(action)}
          className="hud-icon-button h-7 w-7 shrink-0 disabled:opacity-40"
        >
          <img src={ICONS[action]} alt="" width={20} height={20} className="m-auto h-5 w-5" />
        </button>
      </Tooltip>
    );
  };
  const demolish = button(
    'demolish',
    use.demolition ? demolishLabel(use.demolition) : NAMES.demolish,
    use.block,
  );
  return (
    <>
      {use.state === 'abandoned'
        ? button('restore', LABELS.restore, null)
        : button('abandon', LABELS.abandon, use.block)}
      {demolish}
    </>
  );
}

/** Průběh bourání v těle panelu bourané stavby (prázdné, když se nebourá). */
export function DemolitionBar({ use }: { use: StructureUseView | undefined }): ReactElement | null {
  if (!use?.demolishing) return null;
  return <Bar value={use.demolishing.progress} name="Bourání" testId="selection-demolition" />;
}
