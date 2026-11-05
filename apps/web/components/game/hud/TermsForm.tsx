'use client';

import { useState, type ReactElement } from 'react';
import { NEGOTIATION, type TermItem } from '@bohemia/game';
import type { TermRowView } from '@/lib/negotiation-view';
import { Tooltip } from './Tooltip';

// Formulář podmínek jednání (vassalage.md – Co hráč vidí): řádky podmínek jako ikony, vzkaz jako
// textové pole (výjimka z pravidla „bez popisků“ – vzkaz je text hráče) a tlačítka odeslat /
// zrušit. Další druhy řádků (dávky, služba, ves) se přidají do `TERM_ROWS`.

const ICON = '/icons/house';

export function HouseIcon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  return <img src={`${ICON}/${name}.svg`} alt="" width={size} height={size} draggable={false} />;
}

/** Řádek podmínek: `label` je popisek, `onChange` chybí u řádku jen ke čtení (karta jednání). */
export interface TermRowProps {
  item: TermItem;
  label: string;
  onChange?: (item: TermItem) => void;
}
export type TermRowComponent = (props: TermRowProps) => ReactElement;

/** Přísaha: pečeť; role (kdo je pán) se v protinávrhu nemění, proto se zatím neupravuje. */
function OathRow({ label }: TermRowProps): ReactElement {
  return (
    <Tooltip content={label}>
      <span
        tabIndex={0}
        aria-label={label}
        data-testid="term-row-oath"
        className="inline-flex items-center"
      >
        <HouseIcon name="seal" size={26} />
      </span>
    </Tooltip>
  );
}

/** Registr řádků podle druhu podmínky – rozšiřuje se v dalších fázích. */
export const TERM_ROWS: Record<TermItem['kind'], TermRowComponent> = {
  oath: OathRow,
};

/** Řádky podmínek (formulář i karta jednání). */
export function TermRows({
  rows,
  onChange,
}: {
  rows: readonly TermRowView[];
  onChange?: (index: number, item: TermItem) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rows.map((row, i) => {
        const Row = TERM_ROWS[row.kind];
        return (
          <Row
            key={i}
            item={row.item}
            label={row.label}
            onChange={onChange ? (item) => onChange(i, item) : undefined}
          />
        );
      })}
    </div>
  );
}

/**
 * Formulář podmínek: řádky, vzkaz a tlačítka. `submitLabel` a `submitIcon` popisují odeslání
 * („Nabídnout vazalství“ + pečeť, „Protinávrh“ + pero).
 */
export function TermsForm({
  rows: initial,
  submitLabel,
  submitIcon,
  busy,
  onSubmit,
  onCancel,
}: {
  rows: readonly TermRowView[];
  submitLabel: string;
  submitIcon: string;
  busy: boolean;
  onSubmit: (items: TermItem[], message: string | null) => void;
  onCancel: () => void;
}): ReactElement {
  const [rows, setRows] = useState<TermRowView[]>([...initial]);
  const [message, setMessage] = useState('');
  const tooLong = message.length > NEGOTIATION.messageMaxChars;
  return (
    <div data-testid="terms-form" className="flex w-full flex-col gap-1.5">
      <TermRows
        rows={rows}
        onChange={(index, item) =>
          setRows((current) => current.map((r, i) => (i === index ? { ...r, item } : r)))
        }
      />
      <textarea
        aria-label="Vzkaz"
        data-testid="terms-message"
        value={message}
        rows={2}
        maxLength={NEGOTIATION.messageMaxChars}
        onChange={(event) => setMessage(event.target.value)}
        className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
      />
      <div className="flex items-center gap-1.5">
        <Tooltip content={submitLabel}>
          <button
            type="button"
            aria-label={submitLabel}
            data-testid="terms-submit"
            disabled={busy || tooLong || rows.length === 0}
            className="hud-icon-button flex h-8 w-10 items-center justify-center"
            onClick={() =>
              onSubmit(
                rows.map((r) => r.item),
                message.trim() === '' ? null : message,
              )
            }
          >
            <HouseIcon name={submitIcon} size={22} />
          </button>
        </Tooltip>
        <Tooltip content="Zrušit">
          <button
            type="button"
            aria-label="Zrušit"
            data-testid="terms-cancel"
            className="hud-icon-button flex h-8 w-10 items-center justify-center"
            onClick={onCancel}
          >
            <HouseIcon name="cross" size={18} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
