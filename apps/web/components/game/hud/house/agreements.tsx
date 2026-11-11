'use client';

import { useState, type ReactElement } from 'react';
import {
  NEGOTIATION,
  type PanelAgreement,
  type TermItem,
  type Verdict,
  type HungerLevel,
} from '@bohemia/game';
import type { HouseLinkView, DisputeView } from '@/lib/house-view';
import { emptyBundle, termChips, termItemsOf } from '@/lib/terms-view';
import { termRows } from '@/lib/negotiation-view';
import { DisputeCard } from '../DisputeCard';
import { Chip, TermsForm, type TermsContext } from '../TermsForm';
import { Tooltip } from '../Tooltip';
import { HouseLink, Icon, PlayerAction, StatusMarks } from './parts';

/** Pán nebo vazal s dohodou: portrét, ikony podmínek, neplnění a hlad; odsazení podle hloubky. */
export function AgreementEntry({
  house,
  testId,
  depth = 0,
  terms,
  breaches,
  hunger,
  villageName,
  selected,
  levy = null,
  onClick,
}: {
  house: HouseLinkView;
  testId: string;
  depth?: number;
  terms: PanelAgreement['terms'] | null;
  breaches: number;
  hunger: HungerLevel | null;
  villageName: (id: string) => string | null;
  selected: boolean;
  /** Čeká dialog Odvody: pán vidí přesýpací hodiny, vazal pečeť, která dialog otevře. */
  levy?: { role: 'lord' | 'vassal'; years: number; onOpen?: () => void } | null;
  onClick?: () => void;
}): ReactElement {
  return (
    <div
      data-testid={`${testId}-entry`}
      data-depth={depth}
      className="flex w-full items-center gap-2"
      style={{ paddingLeft: depth > 1 ? (depth - 1) * 16 : 0 }}
    >
      <HouseLink house={house} testId={testId} selected={selected} onClick={onClick} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {terms && termChips(terms, villageName).map((c) => <Chip key={c.key} chip={c} />)}
        <StatusMarks breaches={breaches} hunger={hunger} />
        {levy && <LevyMark levy={levy} />}
      </div>
    </div>
  );
}

/** Čekající Odvody u dohody: pánovi přesýpací hodiny u vazala, vazalovi pečeť otevírající dialog. */
function LevyMark({
  levy,
}: {
  levy: { role: 'lord' | 'vassal'; years: number; onOpen?: () => void };
}): ReactElement {
  const label =
    levy.role === 'lord'
      ? 'Vazal ještě neodvedl'
      : levy.years > 1
        ? `Odvody čekají už ${levy.years} roky`
        : 'Odvody čekají';
  if (levy.role === 'lord') {
    return (
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} data-testid="house-levy-wait" className="inline-flex">
          <Icon name="hourglass" size={18} />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        data-testid="house-levy-open"
        onClick={levy.onOpen}
        className="hud-icon-button inline-flex h-7 w-7 items-center justify-center"
      >
        <Icon name="seal" size={20} />
      </button>
    </Tooltip>
  );
}

/**
 * Akce nad dohodou po kliku na pána nebo vazala: Nové podmínky (pečeť s perem – formulář nad
 * dohodou, do přijetí platí staré) a Vypovědět (rozetnutý řetěz – vzkaz a potvrzení druhým
 * tlačítkem, ne dialogem prohlížeče).
 */
export function AgreementActions({
  agreement,
  house,
  ownHouseId,
  busy,
  context,
  disputes = [],
  onNewTerms,
  onRenounce,
  onAnswer,
  onJudge,
}: {
  agreement: PanelAgreement;
  house: HouseLinkView;
  ownHouseId: string;
  busy: boolean;
  context: TermsContext;
  /** Spory tohoto vazala před hráčem jako pánem (tlačítko Rozsudek). */
  disputes?: DisputeView[];
  onNewTerms: (items: TermItem[], message: string | null) => void;
  onRenounce: (message: string | null) => void;
  onAnswer?: (disputeId: string, statement: string) => void;
  onJudge?: (disputeId: string, verdict: Verdict) => void;
}): ReactElement {
  const [mode, setMode] = useState<'terms' | 'renounce' | 'aid' | 'judgment' | null>(null);
  const open = disputes.filter((d) => d.status === 'filed');
  const [message, setMessage] = useState('');
  return (
    <div data-testid="agreement-actions" className="flex w-full flex-col gap-1.5 pb-1">
      <div className="flex items-center gap-1.5">
        <PlayerAction
          label="Nové podmínky"
          icon="seal-pen"
          testId="agreement-new-terms"
          reason={null}
          busy={busy}
          onClick={() => setMode(mode === 'terms' ? null : 'terms')}
        />
        {!context.lordIsOwn && (
          <PlayerAction
            label="Požádat o pomoc"
            icon="aid"
            testId="agreement-request-aid"
            reason={null}
            busy={busy}
            onClick={() => setMode(mode === 'aid' ? null : 'aid')}
          />
        )}
        {context.lordIsOwn && (
          <PlayerAction
            label="Rozsudek"
            icon="scales"
            testId="agreement-judgment"
            reason={open.length === 0 ? 'Žádný spor k souzení.' : null}
            busy={busy}
            onClick={() => setMode(mode === 'judgment' ? null : 'judgment')}
          />
        )}
        <PlayerAction
          label="Vypovědět"
          icon="chain-broken"
          testId="agreement-renounce"
          reason={null}
          busy={busy}
          onClick={() => setMode(mode === 'renounce' ? null : 'renounce')}
        />
      </div>
      {mode === 'terms' && (
        <TermsForm
          rows={termRows(termItemsOf(agreement.terms), ownHouseId, house)}
          submitLabel="Nové podmínky"
          submitIcon="seal-pen"
          busy={busy}
          context={context}
          onCancel={() => setMode(null)}
          onSubmit={(items, text) => {
            setMode(null);
            onNewTerms(items, text);
          }}
        />
      )}
      {mode === 'aid' && (
        <TermsForm
          rows={termRows(
            [
              {
                kind: 'aid-request',
                bundle: { ...emptyBundle(), grainKg: 100 },
                villageId: context.villages[0]?.id ?? '',
              },
            ],
            ownHouseId,
            house,
          )}
          submitLabel="Požádat o pomoc"
          submitIcon="aid"
          busy={busy}
          context={context}
          onCancel={() => setMode(null)}
          onSubmit={(items, text) => {
            setMode(null);
            onNewTerms(items, text);
          }}
        />
      )}
      {mode === 'judgment' &&
        open.map((d) => (
          <DisputeCard
            key={d.id}
            dispute={d}
            busy={busy}
            onAnswer={(id, text) => onAnswer?.(id, text)}
            onJudge={(id, verdict) => {
              setMode(null);
              onJudge?.(id, verdict);
            }}
          />
        ))}
      {mode === 'renounce' && (
        <div data-testid="renounce-form" className="flex flex-col gap-1.5">
          <textarea
            aria-label="Vzkaz"
            data-testid="renounce-message"
            value={message}
            rows={2}
            maxLength={NEGOTIATION.messageMaxChars}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <PlayerAction
              label="Potvrdit vypovězení"
              icon="chain-broken"
              testId="renounce-confirm"
              reason={null}
              busy={busy}
              onClick={() => {
                setMode(null);
                onRenounce(message.trim() === '' ? null : message);
              }}
            />
            <PlayerAction
              label="Zrušit"
              icon="cross"
              testId="renounce-cancel"
              reason={null}
              busy={false}
              onClick={() => setMode(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
