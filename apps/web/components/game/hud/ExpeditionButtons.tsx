import type { ReactElement } from 'react';
import type { ExpeditionCommand } from '@bohemia/game';
import {
  expeditionButtons,
  type ButtonState,
  type ExpeditionPersonState,
} from '@/lib/expedition-buttons';
import { Tooltip } from './Tooltip';

export { expeditionButtons };
export type { ButtonState, ExpeditionPersonState };

/** Ikony (vlastní rendery z Blenderu – `tools/blender/icons.py`, `public/icons/LICENSES.md`). */
const ICONS = {
  saddle: '/icons/expedition/saddle.png',
  dismount: '/icons/expedition/dismount.png',
  home: '/icons/war/alarm-return.png',
} as const;

const LABELS = { saddle: 'Osedlat', dismount: 'Sesednout', home: 'Domů' } as const;

const COMMANDS: Record<keyof typeof ICONS, ExpeditionCommand> = {
  saddle: { kind: 'saddle' },
  dismount: { kind: 'dismount' },
  home: { kind: 'order', order: { kind: 'home' } },
};

/**
 * Osedlat, Sesednout a Domů pro vybrané lidi (expeditions.md – Co hráč vidí). Jako v 0 A.D. jen
 * ikony – název a důvod zašedlí v popisku; rozkaz posílá `command` (`useExpeditionOrders`) i s místem
 * kliknutí – důvod odmítnutí ukáže u kurzoru.
 */
export function ExpeditionButtons({
  people,
  command,
  placement = 'above',
}: {
  people: readonly ExpeditionPersonState[];
  command: (c: ExpeditionCommand, screen?: { x: number; y: number }) => void;
  placement?: 'above' | 'below';
}): ReactElement | null {
  const states = expeditionButtons(people);
  const kinds = (['saddle', 'dismount', 'home'] as const).filter((k) => states[k] !== 'hidden');
  if (kinds.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5" data-testid="expedition-buttons">
      {kinds.map((kind) => {
        const state = states[kind];
        const reason = typeof state === 'object' ? state.disabled : null;
        return (
          <Tooltip
            key={kind}
            content={reason === null ? LABELS[kind] : `${LABELS[kind]} – ${reason}`}
            placement={placement}
          >
            <button
              type="button"
              data-testid={`expedition-${kind}`}
              aria-label={LABELS[kind]}
              disabled={reason !== null}
              className="hud-icon-button h-9 w-9 disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
              onClick={(e) => command(COMMANDS[kind], { x: e.clientX, y: e.clientY })}
            >
              <img src={ICONS[kind]} alt="" width={64} height={64} className="h-full w-full" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
