'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { HouseLinkView, HouseView, InviteView, PortraitView } from '@/lib/house-view';
import { Tooltip } from './Tooltip';

// Panel „Rod a vazalové“ – první verze (vassalage.md – Co hráč vidí): rod, páni, vazalové, hráči
// podle vzdálenosti a pozvánky. Jako v 0 A.D. jen ikony s čísly, slova v popiscích; výjimkou je
// pozvánkový kód a odkaz (text). Jednání, podmínky a tlačítka akcí přijdou v dalších fázích.

const ICON = '/icons/house';

function Icon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  return <img src={`${ICON}/${name}.svg`} alt="" width={size} height={size} draggable={false} />;
}

function Portrait({ icon, size = 36 }: { icon: string; size?: number }): ReactElement {
  return (
    <img
      src={`/icons/resources/${icon}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="rounded-sm border border-[#5c4526] bg-[#15100b]"
    />
  );
}

/** Řádek panelu: značka vlevo (popisek řádku) a ikony vpravo. */
function Row({
  label,
  marker,
  testId,
  children,
}: {
  label: string;
  marker: ReactNode;
  testId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-2 border-t border-[#5c4526] py-2 first:border-t-0"
    >
      <Tooltip content={label} placement="left">
        <span
          tabIndex={0}
          aria-label={label}
          className="flex h-7 w-7 shrink-0 items-center justify-center opacity-80"
        >
          {marker}
        </span>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Man({ man }: { man: PortraitView }): ReactElement {
  return (
    <Tooltip content={man.label}>
      <span tabIndex={0} aria-label={man.label} data-testid="house-own-man">
        <Portrait icon={man.icon} />
      </span>
    </Tooltip>
  );
}

/** Cizí rod: portrét hlavy rodu a štít s počtem mužů. */
function HouseLink({
  house,
  testId,
  tip,
}: {
  house: HouseLinkView;
  testId: string;
  tip?: string;
}): ReactElement {
  const label = tip ? `${house.label} – ${tip}` : house.label;
  return (
    <Tooltip content={label}>
      <span
        tabIndex={0}
        aria-label={label}
        data-testid={testId}
        data-house-id={house.houseId}
        className="relative inline-flex"
      >
        <Portrait icon={house.icon} />
        <span className="absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center">
          <img
            src={`${ICON}/shield.svg`}
            alt=""
            width={20}
            height={20}
            className="absolute inset-0"
          />
          <span className="relative text-[11px] leading-none font-bold tabular-nums">
            {house.men}
          </span>
        </span>
      </span>
    </Tooltip>
  );
}

/** Odkaz pozvánky: absolutní adresa registrace s kódem (z adresy prohlížeče). */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/register?pozvanka=${code}`;
}

function InviteRow({
  invite,
  onRevoke,
  link,
}: {
  invite: InviteView;
  onRevoke: (code: string) => void;
  link: string | null;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  if (invite.state === 'used') {
    return (
      <div data-testid="house-invite-used" className="flex items-center gap-1.5">
        {invite.invitee ? (
          <HouseLink house={invite.invitee} testId="house-invite-invitee" />
        ) : (
          <Tooltip content={invite.label}>
            <span tabIndex={0} aria-label={invite.label}>
              <Portrait icon="man" />
            </span>
          </Tooltip>
        )}
        {invite.played && (
          <Tooltip content={invite.label}>
            <span tabIndex={0} aria-label={invite.label} data-testid="house-invite-played">
              <Icon name="succession" />
            </span>
          </Tooltip>
        )}
      </div>
    );
  }
  return (
    <div data-testid="house-invite-open" className="flex items-center gap-1.5">
      <Tooltip content={invite.label}>
        <span tabIndex={0} aria-label={invite.label} className="flex items-center gap-0.5">
          <Icon name="hourglass" size={18} />
          <span className="text-xs tabular-nums">{invite.daysLeft}</span>
        </span>
      </Tooltip>
      <span data-testid="house-invite-code" className="font-mono text-sm tracking-wider select-all">
        {invite.display}
      </span>
      {link && (
        <Tooltip content={copied ? 'Zkopírováno' : 'Kopírovat odkaz'}>
          <button
            type="button"
            aria-label="Kopírovat odkaz"
            data-testid="house-invite-copy"
            className="hud-icon-button flex h-6 w-6 items-center justify-center"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            <Icon name="copy" size={16} />
          </button>
        </Tooltip>
      )}
      <Tooltip content="Zrušit pozvánku">
        <button
          type="button"
          aria-label="Zrušit pozvánku"
          data-testid="house-invite-revoke"
          className="hud-icon-button flex h-6 w-6 items-center justify-center"
          onClick={() => onRevoke(invite.code)}
        >
          <Icon name="cross" size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * Panel „Rod a vazalové“. `view` je null, dokud se načítá; `error` je důvod selhání česky (u
 * kurzoru jako text pod řadou pozvánek). `onIssue` vydá kód (vrací kód, nebo chybu), `onRevoke`
 * zruší kód; po obou si rodič obnoví `view`.
 */
export function HousePanel({
  view,
  error,
  origin,
  onIssue,
  onRevoke,
  onClose,
}: {
  view: HouseView | null;
  error: string | null;
  /** Adresa webu pro odkaz pozvánky (`window.location.origin`); bez ní se odkaz nenabízí. */
  origin: string | null;
  onIssue: () => Promise<unknown>;
  onRevoke: (code: string) => Promise<unknown>;
  onClose: () => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const run = (task: () => Promise<unknown>): void => {
    setBusy(true);
    void task().finally(() => setBusy(false));
  };
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Rod a vazalové"
      data-testid="house-panel"
      data-hud-block
      className="hud-panel fixed top-12 right-2 z-40 w-[22rem] max-w-[calc(100vw-1rem)] p-3"
    >
      {!view ? (
        <div className="py-4 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : (
        <>
          <Row label="Rod" testId="house-own" marker={<Portrait icon="people" size={22} />}>
            {view.own.map((m, i) => (
              <Man key={i} man={m} />
            ))}
          </Row>
          <Row label="Páni" testId="house-lords" marker={<Icon name="banner" />}>
            {view.lords.length === 0 ? (
              <Tooltip content="Nezávislý">
                <span tabIndex={0} aria-label="Nezávislý" data-testid="house-independent">
                  <Icon name="banner" size={32} />
                </span>
              </Tooltip>
            ) : (
              view.lords.map((h) => <HouseLink key={h.houseId} house={h} testId="house-lord" />)
            )}
          </Row>
          {view.vassals.length > 0 && (
            <Row label="Vazalové" testId="house-vassals" marker={<Icon name="shield" />}>
              {view.vassals.map((h) => (
                <HouseLink key={h.houseId} house={h} testId="house-vassal" />
              ))}
            </Row>
          )}
          {view.others.length > 0 && (
            <Row label="Hráči" testId="house-others" marker={<Portrait icon="man" size={22} />}>
              {view.others.map((h) => (
                <HouseLink
                  key={h.houseId}
                  house={h}
                  testId="house-other"
                  tip={`${h.distance} ${h.distance === 1 ? 'pole' : 'polí'} daleko`}
                />
              ))}
            </Row>
          )}
          <Row label="Pozvánky" testId="house-invites" marker={<Icon name="seal" />}>
            <div className="flex w-full flex-col gap-1.5">
              <Tooltip content={error ?? 'Vydat pozvánku'}>
                <button
                  type="button"
                  aria-label="Vydat pozvánku"
                  data-testid="house-invite-issue"
                  disabled={busy || view.freeInviteSlots === 0}
                  className="hud-icon-button flex h-8 w-14 items-center justify-center gap-1"
                  onClick={() => run(onIssue)}
                >
                  <Icon name="seal" size={22} />
                  <span
                    data-testid="house-invite-slots"
                    className="text-sm font-semibold tabular-nums"
                  >
                    {view.freeInviteSlots}
                  </span>
                </button>
              </Tooltip>
              {error && (
                <span data-testid="house-error" className="text-xs text-red-400">
                  {error}
                </span>
              )}
              {view.invites.map((invite) => (
                <InviteRow
                  key={invite.code}
                  invite={invite}
                  link={origin ? inviteLink(origin, invite.code) : null}
                  onRevoke={(code) => run(() => onRevoke(code))}
                />
              ))}
            </div>
          </Row>
        </>
      )}
    </div>
  );
}
