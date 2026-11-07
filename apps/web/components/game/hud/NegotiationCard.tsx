'use client';

import { useState, type ReactElement } from 'react';
import type { TermItem } from '@bohemia/game';
import type { NegotiationView } from '@/lib/negotiation-view';
import { HouseIcon, TermRows, TermsForm, type TermsContext } from './TermsForm';
import { Tooltip } from './Tooltip';

// Karta jednání (vassalage.md – Co hráč vidí, „jednání“): druhá strana, řádky podmínek jako ikony,
// vzkaz a tlačítka podle role – na tahu: Přijmout (podaná ruka), Odmítnout (křížek), Protinávrh
// (pero); jinak autor posledního kola smí Stáhnout (křížek).

export type NegotiationReply =
  | { answer: 'accept' | 'reject' | 'withdraw' }
  | { answer: 'counter'; items: TermItem[]; message: string | null };

function ActionButton({
  label,
  icon,
  testId,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        className="hud-icon-button flex h-8 w-10 items-center justify-center"
        onClick={onClick}
      >
        <HouseIcon name={icon} size={22} />
      </button>
    </Tooltip>
  );
}

export function NegotiationCard({
  negotiation,
  portrait,
  busy,
  context,
  onReply,
}: {
  negotiation: NegotiationView;
  /** Portrét druhé strany se štítem (komponenta panelu). */
  portrait: ReactElement;
  busy: boolean;
  /** Čí je rod v dohodě, vsi hráče a výhled (formulář protinávrhu). */
  context?: TermsContext;
  onReply: (negotiationId: string, reply: NegotiationReply) => void;
}): ReactElement {
  const [countering, setCountering] = useState(false);
  const { id, myTurn } = negotiation;
  return (
    <div
      data-testid="house-negotiation"
      data-negotiation-id={id}
      data-my-turn={myTurn}
      className="flex w-full flex-col gap-1.5"
    >
      <div className="flex items-center gap-2">
        <Tooltip content={negotiation.label}>
          <span tabIndex={0} aria-label={negotiation.label} className="inline-flex">
            {portrait}
          </span>
        </Tooltip>
        <TermRows rows={negotiation.rows} context={context} />
      </div>
      {negotiation.message !== null && (
        <p
          data-testid="house-negotiation-message"
          className="rounded-sm border border-[#5c4526] bg-[#15100b] px-1.5 py-1 text-xs italic"
        >
          {negotiation.message}
        </p>
      )}
      {countering ? (
        <TermsForm
          rows={negotiation.rows}
          submitLabel="Protinávrh"
          submitIcon="pen"
          busy={busy}
          context={context}
          onCancel={() => setCountering(false)}
          onSubmit={(items, message) => {
            setCountering(false);
            onReply(id, { answer: 'counter', items, message });
          }}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          {myTurn && negotiation.newcomer ? (
            // žádost nováčka (newcomers.md – Pán): jen přijmout, nebo odmítnout
            <>
              <ActionButton
                label="Přijmout"
                icon="handshake"
                testId="newcomer-accept"
                disabled={busy}
                onClick={() => onReply(id, { answer: 'accept' })}
              />
              <ActionButton
                label="Odmítnout"
                icon="cross"
                testId="newcomer-reject"
                disabled={busy}
                onClick={() => onReply(id, { answer: 'reject' })}
              />
            </>
          ) : myTurn ? (
            <>
              <ActionButton
                label="Přijmout"
                icon="handshake"
                testId="negotiation-accept"
                disabled={busy}
                onClick={() => onReply(id, { answer: 'accept' })}
              />
              <ActionButton
                label="Odmítnout"
                icon="cross"
                testId="negotiation-reject"
                disabled={busy}
                onClick={() => onReply(id, { answer: 'reject' })}
              />
              <ActionButton
                label="Protinávrh"
                icon="pen"
                testId="negotiation-counter"
                disabled={busy}
                onClick={() => setCountering(true)}
              />
            </>
          ) : (
            <ActionButton
              label="Stáhnout"
              icon="cross"
              testId="negotiation-withdraw"
              disabled={busy}
              onClick={() => onReply(id, { answer: 'withdraw' })}
            />
          )}
        </div>
      )}
    </div>
  );
}
