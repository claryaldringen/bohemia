'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  formatRemaining,
  MAX_NEWCOMER_REQUESTS,
  MAX_REQUESTS_REASON,
  newcomerWaiting,
  type NewcomerStatusView,
} from '@/lib/newcomer-view';
import { LanguageIcon } from './LanguageChoice';
import { Tooltip } from './Tooltip';

// Panel nováčka v odříznuté krajině (newcomers.md – Rozhraní): dvě ikony „Vybrat pána“ a
// „Svobodný“, nabídka rodů se zaškrtnutím nejvýš 5 a čekání na odpověď s odpočtem. Čistá
// komponenta nad props – server volá až rodič (callbacky). Slova jen v popiscích (`Tooltip`).

const ICON = '/icons/newcomer';
const HOUSE_ICON = '/icons/house';

type IsolatedStatus = Extract<NewcomerStatusView, { phase: 'isolated' }>;

function IconButton({
  label,
  testId,
  src,
  onClick,
  disabled = false,
  size = 56,
}: {
  label: string;
  testId: string;
  src: string;
  onClick: () => void;
  disabled?: boolean;
  size?: number;
}): ReactElement {
  return (
    <Tooltip content={label} placement="below">
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onClick={onClick}
        className="hud-icon-button p-1 disabled:opacity-40"
      >
        <img src={src} alt="" width={size} height={size} />
      </button>
    </Tooltip>
  );
}

/**
 * Čekání nováčka na odpověď pánů (newcomers.md – Čekání): odpočet do konce týdne, žádosti se
 * stavem ikonou a „Stáhnout žádosti“ (= svobodný). Panel nováčka i panel Rod a vazalové.
 */
export function NewcomerWaiting({
  status,
  onWithdraw,
  busy = false,
  now = Date.now,
}: {
  status: IsolatedStatus;
  /** Stáhne žádosti a začne svobodný. */
  onWithdraw: () => void;
  busy?: boolean;
  /** Hodiny odpočtu (testy). */
  now?: () => number;
}): ReactElement {
  const [nowMs, setNowMs] = useState(() => now());
  const { deadline } = status;

  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => setNowMs(now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline, now]);

  const remaining = deadline === null ? null : Date.parse(deadline) - nowMs;
  return (
    <div data-testid="newcomer-wait" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Tooltip content="Do konce čekání" placement="above">
          <span
            tabIndex={0}
            data-testid="newcomer-countdown"
            className="inline-flex items-center gap-1 font-serif text-[#f3dfb0]"
          >
            <img src="/icons/resources/hourglass.png" alt="" width={24} height={24} />
            {remaining === null ? '' : formatRemaining(remaining)}
          </span>
        </Tooltip>
        <IconButton
          label="Stáhnout žádosti"
          testId="newcomer-withdraw"
          src={`${ICON}/banner-free.png`}
          size={40}
          disabled={busy}
          onClick={onWithdraw}
        />
      </div>
      <ul className="flex flex-col gap-1">
        {status.requests.map((request) => {
          const label = request.state === 'pending' ? 'Čeká na odpověď' : 'Odmítl';
          return (
            <li
              key={request.houseId}
              data-testid={`newcomer-request-${request.houseId}`}
              data-state={request.state}
              className="flex items-center gap-2 text-[#f3dfb0]"
            >
              <img src={`${HOUSE_ICON}/banner.png`} alt="" width={24} height={24} />
              <span className="font-serif">{request.lordName}</span>
              <Tooltip content={label} placement="above">
                <img
                  src={
                    request.state === 'pending'
                      ? '/icons/resources/hourglass.png'
                      : `${HOUSE_ICON}/cross.png`
                  }
                  alt={label}
                  width={20}
                  height={20}
                  tabIndex={0}
                />
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewcomerPanel({
  status,
  onRequest,
  onStartFree,
  error = null,
  now = Date.now,
}: {
  status: NewcomerStatusView;
  /** Důvod, proč server žádost nebo volbu odmítl (česky); null – bez chyby. */
  error?: string | null;
  /** Pošle žádosti vybraným rodům (nejvýš 5). */
  onRequest: (houseIds: string[]) => void;
  /** Začne svobodný (i „Stáhnout žádosti“). */
  onStartFree: () => void;
  /** Hodiny odpočtu (testy). */
  now?: () => number;
}): ReactElement | null {
  const [offering, setOffering] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  if (status.phase !== 'isolated') return null;
  const isolated: IsolatedStatus = status;
  const waiting = newcomerWaiting(isolated);

  const shell = (children: ReactElement, testId: string): ReactElement => (
    <div
      role="dialog"
      aria-label="Nováček"
      data-testid={testId}
      data-hud-block
      className="hud-panel fixed top-1/2 left-1/2 z-30 flex max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 p-3"
    >
      {children}
      {error !== null && (
        <span role="alert" data-testid="newcomer-error" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );

  if (waiting) {
    return shell(
      <NewcomerWaiting status={isolated} onWithdraw={onStartFree} now={now} />,
      'newcomer-waiting',
    );
  }

  const canOffer = isolated.offer.length > 0;
  if (!offering || !canOffer) {
    return shell(
      <div className="flex items-center gap-3">
        {canOffer && (
          <IconButton
            label="Vybrat pána"
            testId="newcomer-choose-lord"
            src={`${ICON}/banner-crown.png`}
            onClick={() => setOffering(true)}
          />
        )}
        <IconButton
          label="Svobodný"
          testId="newcomer-free"
          src={`${ICON}/banner-free.png`}
          onClick={onStartFree}
        />
      </div>,
      'newcomer-choice',
    );
  }

  const full = picked.length >= MAX_NEWCOMER_REQUESTS;
  const toggle = (houseId: string): void =>
    setPicked((current) =>
      current.includes(houseId) ? current.filter((id) => id !== houseId) : [...current, houseId],
    );

  return shell(
    <>
      <ul className="flex flex-col gap-1">
        {isolated.offer.map((row) => {
          const on = picked.includes(row.houseId);
          const blocked = full && !on;
          return (
            <li key={row.houseId}>
              <Tooltip content={blocked ? MAX_REQUESTS_REASON : row.lordName} placement="above">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-disabled={blocked}
                  aria-label={row.lordName}
                  data-testid={`newcomer-offer-${row.houseId}`}
                  data-blocked={blocked || undefined}
                  onClick={() => {
                    if (!blocked) toggle(row.houseId);
                  }}
                  className={`hud-inset flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#f3dfb0] ${
                    on ? 'outline-2 outline-[#f3cf86]' : ''
                  } ${blocked ? 'opacity-40' : ''}`}
                >
                  <img src={`${HOUSE_ICON}/banner.png`} alt="" width={24} height={24} />
                  <span className="grow font-serif">{row.lordName}</span>
                  <LanguageIcon language={row.language} />
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <IconButton
          label="Zpět"
          testId="newcomer-back"
          src={`${HOUSE_ICON}/cross.png`}
          size={32}
          onClick={() => {
            setOffering(false);
            setPicked([]);
          }}
        />
        <IconButton
          label="Požádat vybrané rody"
          testId="newcomer-send"
          src={`${HOUSE_ICON}/seal-pen.png`}
          size={40}
          disabled={picked.length === 0}
          onClick={() => onRequest(picked)}
        />
      </div>
    </>,
    'newcomer-offer',
  );
}
