'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  CORVEE_NO_HANDS,
  VASSALAGE,
  corveeStints,
  dateOfDayIndex,
  NEGOTIATION,
  type LevyDialogView,
  type MacroBundle,
} from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import { plural } from '@/lib/village-format';
import {
  BUNDLE_SLOTS,
  GOODS_SLOTS,
  bundleValue,
  emptyBundle,
  formatAmount,
  withBundleValue,
  type BundleKey,
  type BundleSlot,
} from '@/lib/terms-view';
import type { SummonsDialogView } from '@/lib/summons';
import { HouseIcon, TermIconImg } from './TermsForm';
import { Tooltip } from './Tooltip';

// Dialog Odvody (vassalage.md – Roční dialog 1. 11.): řádek na pána, u každého zboží domluvené
// číslo s posuvníkem míň / víc, pod ním rozdělení po vsích rodu (předvyplněné podle přebytku),
// vzkaz je textové pole a Odeslat je vůz. Slova jen v popiscích; součet rozdělení je vždy číslo
// u posuvníku – posuvník rozdělení přepočte, úprava vsi změní součet.

/** Rozdělení po vsích: svazek na ves. */
type Split = Record<string, MacroBundle>;

/** Kolikrát domluvené číslo smí posuvník dosáhnout (víc než domluveno je dobrovolné). */
const SLIDER_FACTOR = 2;

/** Řádky dialogu: zboží, které je v dávce domluveno. */
function agreedSlots(dialog: LevyDialogView): BundleSlot[] {
  // splátku půjčky lze zaplatit i jiným zbožím (platí podle hodnoty) – nabídne všechno zboží
  if (dialog.kind === 'repay') return [...GOODS_SLOTS];
  return BUNDLE_SLOTS.filter((slot) => bundleValue(dialog.agreed, slot.key) > 0);
}

/** Předvyplněné rozdělení: návrh serveru po vsích rodu. */
function initialSplit(dialog: LevyDialogView): Split {
  const split: Split = {};
  for (const village of dialog.villages) split[village.villageId] = village.suggested;
  return split;
}

/** Součet zboží přes všechny vsi. */
export function splitTotal(split: Split, key: BundleKey): number {
  return Object.values(split).reduce((sum, bundle) => sum + bundleValue(bundle, key), 0);
}

/**
 * Přerozdělí nový součet `total` zboží `key` mezi vsi podle dosavadních dílů (jsou-li samé nuly,
 * podle návrhu, nakonec rovným dílem); celá čísla, zbytek po největších zlomcích.
 */
export function redistribute(split: Split, suggested: Split, key: BundleKey, total: number): Split {
  const ids = Object.keys(split);
  if (ids.length === 0) return split;
  const weightsOf = (source: Split): number[] => ids.map((id) => bundleValue(source[id]!, key));
  let weights = weightsOf(split);
  if (weights.every((w) => w <= 0)) weights = weightsOf(suggested);
  if (weights.every((w) => w <= 0)) weights = ids.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const { index } of order) {
    if (rest <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    rest--;
  }
  const out: Split = {};
  ids.forEach((id, i) => {
    out[id] = withBundleValue(split[id]!, key, parts[i] ?? 0);
  });
  return out;
}

/**
 * Robota po vsích (vassalage.md – Lidé a robota): kolik lidí půjde a nejvýš na kolik dní
 * (`corveeStints` – stejné rozdělení jako server), bez ves s nulou. Ves, která tolik lidí nemá,
 * dostane varování v popisku.
 */
function CorveePlan({
  testId,
  dialog,
  split,
}: {
  testId: string;
  dialog: LevyDialogView;
  split: Split;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-7">
      {dialog.villages.map((village) => {
        const days = bundleValue(split[village.villageId] ?? emptyBundle(), 'laborDays');
        if (days <= 0) return null;
        const stints = corveeStints(days, village.corveeHands);
        const longest = stints[0] ?? 0;
        const ok = stints.length > 0 && longest <= VASSALAGE.corvee.maxDaysPerPerson;
        const tip = ok
          ? `${village.name} – ${stints.length} ${plural(stints.length, 'člověk', 'lidé', 'lidí')} na robotě, nejvýš ${longest} ${plural(longest, 'den', 'dny', 'dní')}`
          : `${village.name} – ${CORVEE_NO_HANDS}`;
        return (
          <Tooltip key={village.villageId} content={tip}>
            <span
              tabIndex={0}
              aria-label={tip}
              data-testid={`${testId}-corvee-${village.villageId}`}
              className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${ok ? '' : 'text-[#e07a5f]'}`}
            >
              <TermIconImg icon={{ set: 'resources', name: 'man' }} size={18} />
              {ok ? `${stints.length} × ${longest}` : '!'}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Jeden pán: posuvníky zboží, rozdělení po vsích, vzkaz a Odeslat. */
function LevyRow({
  dialog,
  onAnswer,
}: {
  dialog: LevyDialogView;
  onAnswer: (input: {
    dialogId: string;
    lines: { good: BundleKey; amount: number }[];
    split: Split;
    message: string | null;
  }) => Promise<{ ok: true; arrivesDay: number | null } | { error: string }>;
}): ReactElement {
  const slots = agreedSlots(dialog);
  const suggested = useRef<Split>(initialSplit(dialog));
  const [split, setSplit] = useState<Split>(() => initialSplit(dialog));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ arrivesDay: number | null } | null>(null);
  const tooLong = message.length > NEGOTIATION.messageMaxChars;
  const testId = `levy-${dialog.dialogId}`;

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const lines = slots.map((slot) => ({
        good: slot.key,
        amount: splitTotal(split, slot.key),
      }));
      const result = await onAnswer({
        dialogId: dialog.dialogId,
        lines,
        split,
        message: message.trim() === '' ? null : message,
      });
      if ('error' in result) setError(result.error);
      else setSent({ arrivesDay: result.arrivesDay });
    } catch {
      setError('Spojení se nezdařilo.');
    } finally {
      setBusy(false);
    }
  };

  const arrival =
    sent?.arrivesDay != null
      ? `Dorazí ${formatGameDate(dateOfDayIndex(sent.arrivesDay))}`
      : 'Odesláno';
  // čeká víc let; po lhůtě odvede za nepřítomného hráče předvyplněné správce (absence.md)
  const waitTip = [
    dialog.years > 1 ? `Čeká už ${dialog.years} roky.` : null,
    dialog.stewardDay !== undefined
      ? `Neodpovíš-li, odvede ${formatGameDate(dateOfDayIndex(dialog.stewardDay))} předvyplněné správce.`
      : null,
  ]
    .filter((line) => line !== null)
    .join(' ');

  return (
    <div data-testid={testId} className="flex flex-col gap-1.5 border-t border-[#5c4526] pt-2">
      <div className="flex items-center gap-2">
        <Tooltip
          content={
            dialog.kind === 'repay'
              ? 'Splátka půjčky'
              : dialog.kind === 'trade-send'
                ? 'Obchod'
                : dialog.kind === 'fee-send'
                  ? 'Poplatek z míru'
                  : dialog.kind === 'tribute-send'
                    ? 'Tribut z míru'
                    : dialog.kind === 'judgment'
                      ? 'Rozsudek pána'
                      : 'Roční dávka'
          }
        >
          <span tabIndex={0} data-testid={`${testId}-kind`} className="inline-flex">
            {dialog.kind === 'trade-send' ||
            dialog.kind === 'fee-send' ||
            dialog.kind === 'tribute-send' ? (
              <img src="/icons/resources/cart.png" alt="" width={22} height={22} />
            ) : (
              <HouseIcon
                name={
                  dialog.kind === 'repay'
                    ? 'loan'
                    : dialog.kind === 'judgment'
                      ? 'scales'
                      : 'banner'
                }
                size={22}
              />
            )}
          </span>
        </Tooltip>
        <span data-testid={`${testId}-lord`} className="text-sm font-semibold">
          {dialog.lordName}
        </span>
        {waitTip !== '' && !sent && (
          <Tooltip content={waitTip}>
            <span
              tabIndex={0}
              aria-label={waitTip}
              data-testid={`${testId}-wait`}
              className="inline-flex"
            >
              <HouseIcon name="hourglass" size={18} />
            </span>
          </Tooltip>
        )}
      </div>
      {sent ? (
        <Tooltip content={arrival}>
          <span
            tabIndex={0}
            aria-label={arrival}
            data-testid={`${testId}-sent`}
            className="inline-flex items-center gap-1"
          >
            <img src="/icons/resources/cart.png" alt="" width={24} height={24} />
            <span className="text-xs">{arrival}</span>
          </span>
        </Tooltip>
      ) : (
        <>
          {slots.map((slot) => {
            const agreed = bundleValue(dialog.agreed, slot.key);
            const total = splitTotal(split, slot.key);
            const owed = dialog.kind === 'repay' ? (dialog.owedKg ?? 0) : 0;
            const max = Math.max(
              agreed * SLIDER_FACTOR,
              total,
              slot.unit === 'kg' ? owed * 4 : Math.ceil(owed / 40),
            );
            return (
              <div key={slot.key} className="flex flex-col gap-0.5">
                <Tooltip content={slot.label}>
                  <label className="flex items-center gap-1.5">
                    <TermIconImg icon={slot.icon} size={22} />
                    <input
                      type="range"
                      min={0}
                      max={max}
                      step={1}
                      value={total}
                      aria-label={slot.label}
                      data-testid={`${testId}-slider-${slot.key}`}
                      onChange={(event) =>
                        setSplit((current) =>
                          redistribute(
                            current,
                            suggested.current,
                            slot.key,
                            Number(event.target.value),
                          ),
                        )
                      }
                      className="w-28 accent-[#d8b25c]"
                    />
                    <span
                      data-testid={`${testId}-total-${slot.key}`}
                      className="min-w-20 text-right text-xs whitespace-nowrap tabular-nums"
                    >
                      {formatAmount(total)}
                      <span className="opacity-60"> / {formatAmount(agreed)}</span>
                      {slot.unit !== '' && <span className="opacity-60"> {slot.unit}</span>}
                    </span>
                  </label>
                </Tooltip>
                {slot.key === 'laborDays' && (
                  <CorveePlan testId={testId} dialog={dialog} split={split} />
                )}
                {dialog.villages.length > 1 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-7">
                    {dialog.villages.map((village) => (
                      <Tooltip key={village.villageId} content={village.name}>
                        <input
                          type="number"
                          min={0}
                          aria-label={`${village.name} – ${slot.label}`}
                          data-testid={`${testId}-${slot.key}-${village.villageId}`}
                          value={bundleValue(split[village.villageId] ?? emptyBundle(), slot.key)}
                          onChange={(event) => {
                            const value = Math.max(0, Math.floor(Number(event.target.value)) || 0);
                            setSplit((current) => ({
                              ...current,
                              [village.villageId]: withBundleValue(
                                current[village.villageId] ?? emptyBundle(),
                                slot.key,
                                value,
                              ),
                            }));
                          }}
                          className="w-14 rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs tabular-nums"
                        />
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <textarea
            aria-label="Vzkaz"
            data-testid={`${testId}-message`}
            value={message}
            rows={2}
            maxLength={NEGOTIATION.messageMaxChars}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
          />
          {error && (
            <span data-testid={`${testId}-error`} className="text-xs text-red-400">
              {error}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <Tooltip content="Odeslat">
              <button
                type="button"
                aria-label="Odeslat"
                data-testid={`${testId}-send`}
                disabled={busy || tooLong}
                onClick={() => void send()}
                className="hud-icon-button flex h-8 w-10 items-center justify-center disabled:opacity-40"
              >
                <img src="/icons/resources/cart.png" alt="" width={24} height={24} />
              </button>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}

/** Panel Odvody: jeden řádek na pána s čekajícím dialogem. */
type SummonsAnswer = (input: {
  dialogId: string;
  men: { villageId: string; personId: number }[];
  message: string | null;
}) => Promise<{ ok: true; sent: number; arrivesDay: number | null } | { error: string }>;

/**
 * Svolání do války (vassalage.md – Svolání): muži rodu schopní služby, předvybraní nejzdatnější
 * v domluveném počtu; vazal smí ubrat i přidat a připojit vzkaz.
 */
function SummonsRow({
  dialog,
  onAnswer,
}: {
  dialog: SummonsDialogView;
  onAnswer: SummonsAnswer;
}): ReactElement {
  const key = (m: { villageId: string; personId: number }): string =>
    `${m.villageId}:${m.personId}`;
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(dialog.candidates.slice(0, dialog.men).map(key)),
  );
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: string): void => {
    const next = new Set(picked);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setPicked(next);
  };
  const send = async (): Promise<void> => {
    setState('sending');
    const men = dialog.candidates
      .filter((m) => picked.has(key(m)))
      .map((m) => ({ villageId: m.villageId, personId: m.personId }));
    const result = await onAnswer({
      dialogId: dialog.dialogId,
      men,
      message: message.trim() === '' ? null : message.trim(),
    });
    if ('error' in result) {
      setError(result.error);
      setState('idle');
    } else setState('sent');
  };
  return (
    <div
      data-testid="summons-row"
      className="flex flex-col gap-1 border-t border-[#5c4526] py-2 text-sm first:border-t-0"
    >
      <div className="flex items-center gap-1.5">
        <Tooltip
          content={
            `${dialog.lordName} svolává do vsi ${dialog.targetName}.` +
            (dialog.stewardDay === undefined
              ? ''
              : ` Neodpovíš-li, pošle ${formatGameDate(dateOfDayIndex(dialog.stewardDay))} domluvené muže správce.`)
          }
        >
          <span tabIndex={0} className="inline-flex items-center gap-1">
            <img src="/icons/house/horn.svg" alt="" width={18} height={18} draggable={false} />
            <span className="font-semibold">{dialog.lordName}</span>
          </span>
        </Tooltip>
        <Tooltip content="Domluvení muži">
          <span tabIndex={0} className="ml-auto inline-flex items-center gap-0.5 text-xs">
            <img src="/icons/house/shield.svg" alt="" width={14} height={14} draggable={false} />
            {picked.size}/{dialog.men}
          </span>
        </Tooltip>
        <Tooltip content="Dny služby">
          <span tabIndex={0} className="inline-flex items-center gap-0.5 text-xs">
            <img src="/icons/house/hourglass.svg" alt="" width={14} height={14} draggable={false} />
            {dialog.days}
          </span>
        </Tooltip>
      </div>
      {state === 'sent' ? (
        <Tooltip content="Muži vyrazili.">
          <span tabIndex={0} data-testid="summons-sent" className="inline-flex self-end">
            <img src="/icons/house/shield.svg" alt="" width={18} height={18} draggable={false} />
          </span>
        </Tooltip>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {dialog.candidates.map((m) => (
              <li key={key(m)}>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    data-testid="summons-man"
                    checked={picked.has(key(m))}
                    onChange={() => toggle(key(m))}
                  />
                  <span className="flex-1 truncate">{m.name ?? 'Bezejmenný'}</span>
                  <span className="opacity-70">{m.age}</span>
                  <Tooltip content="Síla">
                    <span tabIndex={0} className="inline-flex items-center gap-0.5">
                      <img
                        src="/icons/house/sword.svg"
                        alt=""
                        width={12}
                        height={12}
                        draggable={false}
                      />
                      {m.strength}
                    </span>
                  </Tooltip>
                </label>
              </li>
            ))}
          </ul>
          <textarea
            aria-label="Vzkaz"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            className="h-10 w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
          />
          <Tooltip content="Odeslat">
            <button
              type="button"
              aria-label="Odeslat"
              data-testid="summons-send"
              disabled={state === 'sending'}
              onClick={() => void send()}
              className="hud-icon-button flex h-8 w-10 items-center justify-center self-end disabled:opacity-40"
            >
              <img src="/icons/house/horn.svg" alt="" width={22} height={22} draggable={false} />
            </button>
          </Tooltip>
        </>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function LevyDialog({
  dialogs,
  error,
  onAnswer,
  summons = [],
  onAnswerSummons,
  onClose,
}: {
  /** Otevřená Svolání do války (vassalage.md – Svolání). */
  summons?: readonly SummonsDialogView[];
  onAnswerSummons?: SummonsAnswer;
  /** Otevřené dialogy; null = ještě se načítají. */
  dialogs: readonly LevyDialogView[] | null;
  error?: string | null;
  onAnswer: (input: {
    dialogId: string;
    lines: { good: BundleKey; amount: number }[];
    split: Split;
    message: string | null;
  }) => Promise<{ ok: true; arrivesDay: number | null } | { error: string }>;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label="Odvody"
      data-testid="levy-dialog"
      data-hud-block
      className="hud-panel fixed top-12 right-2 z-40 w-[22rem] max-w-[calc(100vw-1rem)] p-3"
    >
      <div className="flex items-center justify-between pb-1">
        <Tooltip content="Odvody">
          <span tabIndex={0} aria-label="Odvody" className="inline-flex">
            <HouseIcon name="seal" size={26} />
          </span>
        </Tooltip>
        <Tooltip content="Zavřít">
          <button
            type="button"
            aria-label="Zavřít"
            data-testid="levy-close"
            onClick={onClose}
            className="hud-icon-button flex h-7 w-7 items-center justify-center"
          >
            <HouseIcon name="cross" size={16} />
          </button>
        </Tooltip>
      </div>
      {error && (
        <span data-testid="levy-error" className="block pb-1 text-xs text-red-400">
          {error}
        </span>
      )}
      {dialogs === null ? (
        <div className="py-4 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : (
        dialogs.map((dialog) => (
          <LevyRow key={dialog.dialogId} dialog={dialog} onAnswer={onAnswer} />
        ))
      )}
      {onAnswerSummons &&
        summons.map((dialog) => (
          <SummonsRow key={dialog.dialogId} dialog={dialog} onAnswer={onAnswerSummons} />
        ))}
    </div>
  );
}
