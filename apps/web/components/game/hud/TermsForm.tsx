'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { NEGOTIATION, type MacroBundle, type MacroSpare, type TermItem } from '@bohemia/game';
import { termRowLabel, type TermRowView } from '@/lib/negotiation-view';
import {
  BUNDLE_SLOTS,
  bundleValue,
  emptyBundle,
  formatAmount,
  lineChips,
  serviceLabel,
  withBundleValue,
  type TermChip,
  type TermIcon,
} from '@/lib/terms-view';
import { Tooltip } from './Tooltip';

// Formulář podmínek jednání (vassalage.md – Co hráč vidí): řádky podmínek jako ikony s čísly
// (obilí s kg, kláda s počtem, meč s muži × dny, ves s klíčem), u dávek výhled „kolik můžu
// postrádat“ šedým číslem; vzkaz je textové pole (výjimka z pravidla „bez popisků“ – vzkaz je
// text hráče) a tlačítka odeslat / zrušit.

const ICON = '/icons/house';

export function HouseIcon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  return <img src={`${ICON}/${name}.svg`} alt="" width={size} height={size} draggable={false} />;
}

/** Ikona podmínky: kresba rodu, nebo ikona zdroje. */
export function TermIconImg({ icon, size = 20 }: { icon: TermIcon; size?: number }): ReactElement {
  const src =
    icon.set === 'house' ? `${ICON}/${icon.name}.svg` : `/icons/resources/${icon.name}.png`;
  return <img src={src} alt="" width={size} height={size} draggable={false} />;
}

/** Ikona s číslem a popiskem u kurzoru. */
export function Chip({ chip, size = 18 }: { chip: TermChip; size?: number }): ReactElement {
  return (
    <Tooltip content={chip.label}>
      <span
        tabIndex={0}
        aria-label={chip.label}
        data-testid="term-chip"
        data-chip={chip.key}
        className={`inline-flex items-center gap-0.5 ${chip.reward ? 'opacity-70' : ''}`}
      >
        <TermIconImg icon={chip.icon} size={size} />
        {chip.text !== '' && <span className="text-xs tabular-nums">{chip.text}</span>}
      </span>
    </Tooltip>
  );
}

/** Co o dohodě ví formulář: čí je rod, které vsi smí vybrat a odkud vzít výhled. */
export interface TermsContext {
  /** Hráčův rod je pánem dohody (jemu patří cílová ves, odměnu platí on). */
  lordIsOwn: boolean;
  /** Vsi hráče (cílová ves pána). */
  villages: readonly { id: string; name: string }[];
  /** Výhled „kolik můžu postrádat“ (jen na vyžádání); null = nedostupný. */
  loadSpare?: (targetVillageId: string | null) => Promise<MacroSpare | null>;
}

/** Platí tuhle podmínku hráčův rod? (dávku vazal, odměnu pán) */
function ownPays(kind: TermItem['kind'], lordIsOwn: boolean): boolean {
  return kind === 'tribute' ? !lordIsOwn : kind === 'reward' ? lordIsOwn : false;
}

/** Řádek podmínek: `label` je popisek, `onChange` chybí u řádku jen ke čtení (karta jednání). */
export interface TermRowProps {
  item: TermItem;
  label: string;
  onChange?: (item: TermItem) => void;
  context?: TermsContext;
  /** Výhled pro dávku / odměnu, kterou platí hráč; jinak null. */
  spare?: MacroSpare | null;
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

/** Celé nezáporné číslo z políčka (kg smí mít jen celá čísla také – kila jsou celá). */
const countOf = (text: string): number => Math.max(0, Math.floor(Number(text)) || 0);

function NumberInput({
  value,
  label,
  testId,
  onChange,
}: {
  value: number;
  label: string;
  testId: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <input
      type="number"
      min={0}
      aria-label={label}
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(countOf(event.target.value))}
      className="w-16 rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs tabular-nums"
    />
  );
}

/** Dávka nebo odměna: ve formuláři políčka svazku s výhledem, jinak ikony s čísly. */
function BundleRow({ item, label, onChange, context, spare }: TermRowProps): ReactElement {
  if (item.kind !== 'tribute' && item.kind !== 'reward') return <span />;
  const kind = item.kind;
  const bundle: MacroBundle = item.goods;
  if (!onChange) {
    return (
      <span
        data-testid={`term-row-${kind}`}
        className="inline-flex flex-wrap items-center gap-1.5"
        aria-label={label}
      >
        {lineChips(item).map((chip) => (
          <Chip key={chip.key} chip={chip} />
        ))}
      </span>
    );
  }
  const showSpare = spare != null && context !== undefined && ownPays(kind, context.lordIsOwn);
  return (
    <div data-testid={`term-row-${kind}`} className="flex flex-wrap items-start gap-1.5">
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} className="inline-flex pt-0.5 opacity-70">
          <HouseIcon name={kind === 'tribute' ? 'banner' : 'throne'} size={20} />
        </span>
      </Tooltip>
      {BUNDLE_SLOTS.map((slot) => {
        const value = bundleValue(bundle, slot.key);
        const room = showSpare ? bundleValue(spare, slot.key) : null;
        return (
          <label key={slot.key} className="flex flex-col items-start gap-0.5">
            <Tooltip content={slot.label}>
              <span className="inline-flex items-center gap-0.5">
                <TermIconImg icon={slot.icon} size={18} />
                <NumberInput
                  value={value}
                  label={slot.label}
                  testId={`term-${kind}-${slot.key}`}
                  onChange={(v) =>
                    onChange({ ...item, goods: withBundleValue(bundle, slot.key, v) })
                  }
                />
              </span>
            </Tooltip>
            {room !== null && (
              <span
                data-testid={`term-${kind}-${slot.key}-spare`}
                className="pl-5 text-[10px] text-[#8a7a60] tabular-nums"
              >
                {formatAmount(room)}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Vojenská služba: meč s muži × dny. */
function ServiceRow({ item, label, onChange }: TermRowProps): ReactElement {
  if (item.kind !== 'service') return <span />;
  if (!onChange) {
    const [chip] = lineChips(item);
    return (
      <span data-testid="term-row-service" aria-label={label}>
        {chip && <Chip chip={chip} />}
      </span>
    );
  }
  return (
    <div data-testid="term-row-service" className="flex items-center gap-1">
      <Tooltip content={`Vojenská služba: ${serviceLabel(item.men, item.days)}`}>
        <span tabIndex={0} aria-label={label} className="inline-flex">
          <HouseIcon name="sword" size={20} />
        </span>
      </Tooltip>
      <NumberInput
        value={item.men}
        label="Muži"
        testId="term-service-men"
        onChange={(men) => onChange({ ...item, men })}
      />
      <span className="text-xs">×</span>
      <NumberInput
        value={item.days}
        label="Dny"
        testId="term-service-days"
        onChange={(days) => onChange({ ...item, days })}
      />
    </div>
  );
}

/** Cílová ves pána: ves s klíčem; pán ji vybírá ze svých vsí. */
function TargetVillageRow({ item, label, onChange, context }: TermRowProps): ReactElement {
  if (item.kind !== 'target-village') return <span />;
  const name = context?.villages.find((v) => v.id === item.villageId)?.name ?? null;
  const [chip] = lineChips(item, name);
  if (!onChange || !context?.lordIsOwn || context.villages.length === 0) {
    return (
      <span data-testid="term-row-target-village" aria-label={label}>
        {chip && <Chip chip={chip} />}
      </span>
    );
  }
  return (
    <div data-testid="term-row-target-village" className="flex items-center gap-1">
      <Tooltip content={chip?.label ?? label}>
        <span tabIndex={0} aria-label={chip?.label ?? label} className="inline-flex">
          <HouseIcon name="village-key" size={20} />
        </span>
      </Tooltip>
      <select
        aria-label="Ves"
        data-testid="term-target-village-select"
        value={item.villageId}
        onChange={(event) => onChange({ ...item, villageId: event.target.value })}
        className="rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs"
      >
        {context.villages.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Registr řádků podle druhu podmínky. */
export const TERM_ROWS: Record<TermItem['kind'], TermRowComponent> = {
  oath: OathRow,
  tribute: BundleRow,
  service: ServiceRow,
  'target-village': TargetVillageRow,
  reward: BundleRow,
};

/** Řádky podmínek (formulář i karta jednání); `onRemove` přidá křížek u řádků bez přísahy. */
export function TermRows({
  rows,
  onChange,
  onRemove,
  context,
  spare,
}: {
  rows: readonly TermRowView[];
  onChange?: (index: number, item: TermItem) => void;
  onRemove?: (index: number) => void;
  context?: TermsContext;
  spare?: MacroSpare | null;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const Row = TERM_ROWS[row.kind];
        return (
          <div key={i} className="flex items-start gap-1">
            <Row
              item={row.item}
              label={row.label}
              onChange={onChange ? (item) => onChange(i, item) : undefined}
              context={context}
              spare={spare}
            />
            {onRemove && row.kind !== 'oath' && (
              <Tooltip content="Odebrat řádek">
                <button
                  type="button"
                  aria-label="Odebrat řádek"
                  data-testid={`term-remove-${row.kind}`}
                  className="hud-icon-button flex h-5 w-5 shrink-0 items-center justify-center"
                  onClick={() => onRemove(i)}
                >
                  <HouseIcon name="cross" size={12} />
                </button>
              </Tooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ADDABLE: { kind: Exclude<TermItem['kind'], 'oath'>; icon: string; label: string }[] = [
  { kind: 'tribute', icon: 'grain', label: 'Přidat roční dávku' },
  { kind: 'service', icon: 'sword', label: 'Přidat vojenskou službu' },
  { kind: 'target-village', icon: 'village-key', label: 'Přidat správu vsi' },
  { kind: 'reward', icon: 'log', label: 'Přidat roční odměnu' },
];

/** Nový řádek podmínky s rozumnou výchozí hodnotou, nebo null, když ho nejde přidat. */
function newRow(kind: Exclude<TermItem['kind'], 'oath'>, context?: TermsContext): TermItem | null {
  switch (kind) {
    case 'tribute':
    case 'reward':
      return { kind, goods: { ...emptyBundle(), grainKg: 100 } };
    case 'service':
      return { kind, men: 1, days: 30 };
    case 'target-village': {
      const first = context?.villages[0];
      return context?.lordIsOwn && first ? { kind, villageId: first.id } : null;
    }
  }
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
  context,
  onSubmit,
  onCancel,
}: {
  rows: readonly TermRowView[];
  submitLabel: string;
  submitIcon: string;
  busy: boolean;
  context?: TermsContext;
  onSubmit: (items: TermItem[], message: string | null) => void;
  onCancel: () => void;
}): ReactElement {
  const [rows, setRows] = useState<TermRowView[]>([...initial]);
  const [message, setMessage] = useState('');
  const [spare, setSpare] = useState<MacroSpare | null>(null);
  const tooLong = message.length > NEGOTIATION.messageMaxChars;
  const loadSpare = context?.loadSpare;
  const lordIsOwn = context?.lordIsOwn ?? false;
  const paysSomething = rows.some((r) => ownPays(r.kind, lordIsOwn));
  const target = rows.find((r) => r.item.kind === 'target-village')?.item;
  const targetId = target?.kind === 'target-village' ? target.villageId : null;
  // výhled „kolik můžu postrádat“ jen na vyžádání: při otevření formuláře s dávkou, kterou platím
  useEffect(() => {
    if (!loadSpare || !paysSomething) return;
    let current = true;
    void loadSpare(targetId).then((result) => {
      if (current) setSpare(result);
    });
    return () => {
      current = false;
    };
  }, [loadSpare, paysSomething, targetId]);
  const present = new Set(rows.map((r) => r.kind));
  return (
    <div data-testid="terms-form" className="flex w-full flex-col gap-1.5">
      <TermRows
        rows={rows}
        context={context}
        spare={spare}
        onChange={(index, item) =>
          setRows((current) => current.map((r, i) => (i === index ? { ...r, item } : r)))
        }
        onRemove={(index) => setRows((current) => current.filter((_, i) => i !== index))}
      />
      <div className="flex items-center gap-1.5">
        {ADDABLE.filter((a) => !present.has(a.kind) && newRow(a.kind, context) !== null).map(
          (a) => (
            <Tooltip key={a.kind} content={a.label}>
              <button
                type="button"
                aria-label={a.label}
                data-testid={`terms-add-${a.kind}`}
                className="hud-icon-button flex h-7 w-9 items-center justify-center"
                onClick={() => {
                  const item = newRow(a.kind, context);
                  if (!item) return;
                  setRows((current) => [
                    ...current,
                    { kind: item.kind, item, label: termRowLabel(item, '', { lordName: null }) },
                  ]);
                }}
              >
                <HouseIcon name={a.icon} size={20} />
              </button>
            </Tooltip>
          ),
        )}
      </div>
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
