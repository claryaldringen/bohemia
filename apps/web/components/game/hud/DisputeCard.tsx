'use client';

import { useState, type ReactElement } from 'react';
import { NEGOTIATION, type Verdict } from '@bohemia/game';
import type { DisputeView } from '@/lib/house-view';
import { emptyBundle } from '@/lib/terms-view';
import { Tooltip } from './Tooltip';

// Spor v panelu „Rod a vazalové“ (vassalage.md – Mír a spory): žaloba, vyjádření a rozsudek pána.
// Rozsudek je jen de iure – nic se nevynucuje. Slova jen v popiscích; text žaloby a vyjádření je
// text hráčů.

type VerdictKind = Verdict['kind'];

const KINDS: { kind: VerdictKind; label: string; icon: string }[] = [
  { kind: 'compensation', label: 'Náhrada zbožím', icon: '/icons/house/gift.png' },
  { kind: 'return-people', label: 'Vrácení lidí', icon: '/icons/resources/people.png' },
  { kind: 'peace', label: 'Mír', icon: '/icons/house/handshake.png' },
  { kind: 'dismiss', label: 'Zamítnout', icon: '/icons/house/cross.png' },
];

const GOODS_FIELDS = [
  { key: 'grainKg', label: 'Obilí (kg)' },
  { key: 'hayKg', label: 'Seno (kg)' },
  { key: 'cows', label: 'Krávy' },
  { key: 'horses', label: 'Koně' },
  { key: 'logs', label: 'Klády' },
] as const;

const PEOPLE_FIELDS = [
  { key: 'families', label: 'Rodiny' },
  { key: 'men', label: 'Muži' },
  { key: 'women', label: 'Ženy' },
] as const;

/** Rozsudek jedním slovem do popisku rozsouzeného sporu. */
export function verdictLabel(verdict: Verdict): string {
  return KINDS.find((k) => k.kind === verdict.kind)?.label ?? '';
}

function NumberField({
  label,
  value,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  testId: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <Tooltip content={label}>
      <input
        type="number"
        min={0}
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="w-16 rounded-sm border border-[#5c4526] bg-[#15100b] p-0.5 text-xs tabular-nums"
      />
    </Tooltip>
  );
}

function VerdictForm({
  busy,
  onJudge,
}: {
  busy: boolean;
  onJudge: (verdict: Verdict) => void;
}): ReactElement {
  const [kind, setKind] = useState<VerdictKind>('compensation');
  const [goods, setGoods] = useState({ grainKg: 100, hayKg: 0, cows: 0, horses: 0, logs: 0 });
  const [people, setPeople] = useState({ families: 0, men: 0, women: 0 });
  const verdict = (): Verdict => {
    if (kind === 'compensation') {
      const bundle = emptyBundle();
      return {
        kind,
        bundle: {
          ...bundle,
          grainKg: goods.grainKg,
          hayKg: goods.hayKg,
          horses: goods.horses,
          logs: goods.logs,
          cattle: { ...bundle.cattle, cows: goods.cows },
        },
      };
    }
    return kind === 'return-people' ? { kind, people } : { kind };
  };
  return (
    <div data-testid="verdict-form" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {KINDS.map((k) => (
          <Tooltip key={k.kind} content={k.label}>
            <button
              type="button"
              aria-label={k.label}
              aria-pressed={kind === k.kind}
              data-testid={`verdict-kind-${k.kind}`}
              onClick={() => setKind(k.kind)}
              className={`hud-icon-button flex h-8 w-10 items-center justify-center ${
                kind === k.kind ? 'outline-2 outline-[#f3cf86]' : ''
              }`}
            >
              <img src={k.icon} alt="" width={22} height={22} draggable={false} />
            </button>
          </Tooltip>
        ))}
      </div>
      {kind === 'compensation' && (
        <div className="flex flex-wrap gap-1">
          {GOODS_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              testId={`verdict-${f.key}`}
              value={goods[f.key]}
              onChange={(value) => setGoods({ ...goods, [f.key]: value })}
            />
          ))}
        </div>
      )}
      {kind === 'return-people' && (
        <div className="flex flex-wrap gap-1">
          {PEOPLE_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              testId={`verdict-${f.key}`}
              value={people[f.key]}
              onChange={(value) => setPeople({ ...people, [f.key]: value })}
            />
          ))}
        </div>
      )}
      <Tooltip content="Vynést rozsudek">
        <button
          type="button"
          aria-label="Vynést rozsudek"
          data-testid="verdict-submit"
          disabled={busy}
          onClick={() => onJudge(verdict())}
          className="hud-icon-button flex h-8 w-10 items-center justify-center"
        >
          <img src="/icons/house/scales.png" alt="" width={22} height={22} draggable={false} />
        </button>
      </Tooltip>
    </div>
  );
}

function StatementForm({
  busy,
  onAnswer,
}: {
  busy: boolean;
  onAnswer: (statement: string) => void;
}): ReactElement {
  const [text, setText] = useState('');
  return (
    <div data-testid="statement-form" className="flex flex-col gap-1.5">
      <textarea
        aria-label="Vyjádření"
        data-testid="statement-text"
        value={text}
        rows={2}
        maxLength={NEGOTIATION.messageMaxChars}
        onChange={(event) => setText(event.target.value)}
        className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
      />
      <Tooltip content="Vyjádřit se">
        <button
          type="button"
          aria-label="Vyjádřit se"
          data-testid="statement-submit"
          disabled={busy || text.trim() === ''}
          onClick={() => onAnswer(text)}
          className="hud-icon-button flex h-8 w-10 items-center justify-center"
        >
          <img src="/icons/house/seal-pen.png" alt="" width={22} height={22} draggable={false} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Karta sporu: kdo koho žaluje, text žaloby a vyjádření, podle role vyjádření nebo rozsudek. */
export function DisputeCard({
  dispute,
  busy,
  onAnswer,
  onJudge,
}: {
  dispute: DisputeView;
  busy: boolean;
  onAnswer: (disputeId: string, statement: string) => void;
  onJudge: (disputeId: string, verdict: Verdict) => void;
}): ReactElement {
  return (
    <div
      data-testid="dispute-card"
      data-dispute-id={dispute.id}
      data-status={dispute.status}
      className="flex flex-col gap-1.5 rounded-sm border border-[#5c4526] p-1.5 text-xs"
    >
      <div className="flex items-center gap-1.5">
        <img src="/icons/house/scales.png" alt="" width={18} height={18} draggable={false} />
        <span data-testid="dispute-title" className="font-semibold">
          {dispute.plaintiffName} – {dispute.defendantName}
        </span>
        {dispute.verdict && (
          <Tooltip content={verdictLabel(dispute.verdict)}>
            <span
              tabIndex={0}
              data-testid="dispute-verdict"
              data-verdict={dispute.verdict.kind}
              className="ml-auto inline-flex"
            >
              <img
                src={KINDS.find((k) => k.kind === dispute.verdict?.kind)?.icon}
                alt=""
                width={18}
                height={18}
                draggable={false}
              />
            </span>
          </Tooltip>
        )}
      </div>
      <p data-testid="dispute-message" className="whitespace-pre-wrap">
        „{dispute.message}“
      </p>
      {dispute.statement !== null && (
        <p data-testid="dispute-statement" className="whitespace-pre-wrap opacity-80">
          „{dispute.statement}“
        </p>
      )}
      {dispute.canAnswer && <StatementForm busy={busy} onAnswer={(t) => onAnswer(dispute.id, t)} />}
      {dispute.canJudge && <VerdictForm busy={busy} onJudge={(v) => onJudge(dispute.id, v)} />}
    </div>
  );
}
