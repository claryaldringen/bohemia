'use client';

import { useState, type ReactElement } from 'react';
import type { InviteView } from '@/lib/house-view';
import { Tooltip } from '../Tooltip';
import { HouseLink, Icon, Portrait } from './parts';

/** Odkaz pozvánky: absolutní adresa registrace s kódem (z adresy prohlížeče). */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/register?pozvanka=${code}`;
}

export function InviteRow({
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
