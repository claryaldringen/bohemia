'use client';

import { useState, type MouseEvent, type ReactElement } from 'react';
import type { GroupOrder, LeaderTarget, Pos, SurrenderOrder } from '@bohemia/game';
import { useCampaign } from '@/hooks/use-campaign';
import type { CampaignView } from '@/lib/campaign-view';
import { Tooltip } from './Tooltip';

// Mapa tažení (war.md – Na mapě s vojskem, Mlha války; plán 2026-11-03 – Úloha 6.14): minimální
// pohled shora na mapu, na které stojí velitel – vlastní muži, spojenci, cizí v dohledu a objevené
// stavby jako značky. Klik na mapu = velitel jde (záměr na takt teď + 2), klik na cizího = napadne,
// klik na stavbu = jde k ní. Scénu vojska kreslí `lib/scene` (jiná úloha) ze stejného `CampaignView`.

type Result = Promise<{ ok: true } | { error: string }>;

/** Volání serveru pro živé vedení (server actions) – z kontextu, aby šla mapa vykreslit v testech. */
export interface CampaignActions {
  lead: (input: { campaignId: string; target: LeaderTarget }) => Result;
  order: (input: { campaignId: string; group: number; order: GroupOrder; at?: Pos }) => Result;
  surrendered: (input: { campaignId: string; group: number; choice: SurrenderOrder }) => Result;
  presence: (campaignId: string) => Result;
}

/** Půl strany mapy (m) – mapa má 128 × 15 m. */
const HALF_M = 960;

const ORDERS: readonly { order: GroupOrder; icon: string; label: string }[] = [
  { order: 'follow-leader', icon: '🛡', label: 'Za velitelem' },
  { order: 'attack-all', icon: '⚔', label: 'Útočit na vše' },
  { order: 'hold-place', icon: '⚑', label: 'Držet místo' },
];

const CHOICES: readonly { choice: SurrenderOrder; icon: string; label: string }[] = [
  { choice: 'kill', icon: '🗡', label: 'Pobít' },
  { choice: 'lead', icon: '⛓', label: 'Odvést' },
  { choice: 'leave', icon: '🏳', label: 'Nechat' },
];

/** Políčko, jehož mapu ukázat: velitelovo, jinak prvního vlastního muže, jinak mapa cíle. */
function shownCell(view: CampaignView): { x: number; y: number } {
  const own = view.men.find((m) => m.commander) ?? view.men[0];
  return own ? own.cell : view.target.cell;
}

export function CampaignMap({
  campaignId,
  actions,
  onClose,
}: {
  campaignId: string;
  actions: CampaignActions;
  onClose: () => void;
}): ReactElement {
  const { view, gone, refresh } = useCampaign(campaignId, actions.presence);
  const [pending, setPending] = useState<Pos | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const send = (result: Result): void => {
    void result.then((r) => {
      setReason('error' in r ? r.error : null);
      refresh();
    });
  };

  if (gone || !view) {
    return (
      <div data-testid="campaign-map" className="hud-panel hud-popup p-2 text-xs" data-hud-block>
        {gone ? '–' : '…'}
      </div>
    );
  }
  const cell = shownCell(view);
  const here = (c: { x: number; y: number }): boolean => c.x === cell.x && c.y === cell.y;
  const commander = view.men.find((m) => m.commander && m.status === 'active');
  const group = commander ? view.groups.find((g) => g.id === commander.group) : undefined;
  const goal =
    pending ?? (group?.goal && here(group.goal.cell) && !group.arrived ? group.goal.pos : null);
  const live = view.liveCommand;
  const onTarget = here(view.target.cell);

  const clickMap = (e: MouseEvent<SVGSVGElement>): void => {
    if (!live) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pos = {
      x: ((e.clientX - r.left) / r.width) * 2 * HALF_M - HALF_M,
      z: ((e.clientY - r.top) / r.height) * 2 * HALF_M - HALF_M,
    };
    setPending(pos);
    send(actions.lead({ campaignId, target: { kind: 'place', place: { cell, pos } } }));
  };
  const lead =
    (target: LeaderTarget) =>
    (e: MouseEvent): void => {
      e.stopPropagation();
      if (live) send(actions.lead({ campaignId, target }));
    };
  const denied = live ? null : 'Velí jiný muž.';

  return (
    <div
      data-testid="campaign-map"
      data-phase={view.phase}
      data-live={live ? '1' : '0'}
      className="hud-panel hud-popup flex w-[22rem] flex-col gap-1 p-2 text-xs"
      data-hud-block
    >
      <div className="flex items-center gap-1">
        <Tooltip content="Domů" denied={denied}>
          <button
            type="button"
            data-testid="campaign-home"
            aria-label="Domů"
            disabled={!live}
            onClick={lead({ kind: 'home' })}
            className="hud-inset rounded px-1.5 disabled:opacity-45 disabled:grayscale"
          >
            ⌂
          </button>
        </Tooltip>
        {group &&
          ORDERS.map((o) => (
            <Tooltip key={o.order} content={o.label} denied={denied}>
              <button
                type="button"
                data-testid={`campaign-order-${o.order}`}
                aria-label={o.label}
                aria-pressed={group.order === o.order}
                disabled={!live}
                onClick={() =>
                  send(
                    actions.order({
                      campaignId,
                      group: group.id,
                      order: o.order,
                      at: commander?.pos,
                    }),
                  )
                }
                className={`hud-inset rounded px-1.5 disabled:opacity-45 disabled:grayscale ${group.order === o.order ? 'ring-1 ring-[#f3cf86]' : ''}`}
              >
                {o.icon}
              </button>
            </Tooltip>
          ))}
        {group &&
          view.battle &&
          CHOICES.map((c) => (
            <Tooltip key={c.choice} content={c.label} denied={denied}>
              <button
                type="button"
                data-testid={`campaign-surrendered-${c.choice}`}
                aria-label={c.label}
                aria-pressed={view.surrendered === c.choice}
                disabled={!live}
                onClick={() =>
                  send(actions.surrendered({ campaignId, group: group.id, choice: c.choice }))
                }
                className="hud-inset rounded px-1.5 disabled:opacity-45 disabled:grayscale"
              >
                {c.icon}
              </button>
            </Tooltip>
          ))}
        <span className="flex-1" />
        <Tooltip content="Zavřít" placement="below-left">
          <button
            type="button"
            data-testid="campaign-close"
            aria-label="Zavřít"
            onClick={onClose}
            className="hud-inset rounded px-1.5"
          >
            ✕
          </button>
        </Tooltip>
      </div>
      <svg
        data-testid="campaign-svg"
        viewBox={`${-HALF_M} ${-HALF_M} ${2 * HALF_M} ${2 * HALF_M}`}
        className={`aspect-square w-full rounded bg-[#4b5a33] ${live ? 'cursor-crosshair' : ''}`}
        onClick={clickMap}
      >
        {onTarget &&
          view.discovered.map((b) => (
            <rect
              key={b.id}
              data-testid="campaign-building"
              x={b.pos.x - 18}
              y={b.pos.z - 18}
              width={36}
              height={36}
              className="cursor-pointer fill-[#8a6a43] stroke-[#2b2116]"
              strokeWidth={4}
              onClick={lead({ kind: 'building', id: b.id })}
            />
          ))}
        {view.allies
          .filter((m) => here(m.cell) && m.status === 'active')
          .map((m) => (
            <circle
              key={`a${m.member}`}
              cx={m.pos.x}
              cy={m.pos.z}
              r={18}
              className="fill-[#7fb0d8]"
            />
          ))}
        {view.men
          .filter((m) => here(m.cell) && m.status === 'active' && !m.commander)
          .map((m) => (
            <circle
              key={`m${m.member}`}
              data-testid="campaign-man"
              cx={m.pos.x}
              cy={m.pos.z}
              r={20}
              className="fill-[#e8d9a8]"
            />
          ))}
        {onTarget &&
          view.foreign.map((f) => (
            <circle
              key={f.id}
              data-testid="campaign-foreign"
              cx={f.pos.x}
              cy={f.pos.z}
              r={20}
              className={`fill-[#c0392b] ${f.state === 'down' ? 'opacity-40' : 'cursor-pointer'}`}
              onClick={lead({ kind: 'fighter', id: f.id })}
            />
          ))}
        {goal && (
          <g data-testid="campaign-goal" data-x={goal.x.toFixed(0)} data-z={goal.z.toFixed(0)}>
            <line
              x1={goal.x - 30}
              y1={goal.z - 30}
              x2={goal.x + 30}
              y2={goal.z + 30}
              stroke="#f3cf86"
              strokeWidth={10}
            />
            <line
              x1={goal.x - 30}
              y1={goal.z + 30}
              x2={goal.x + 30}
              y2={goal.z - 30}
              stroke="#f3cf86"
              strokeWidth={10}
            />
          </g>
        )}
        {commander && here(commander.cell) && (
          <circle
            data-testid="campaign-commander"
            data-x={commander.pos.x.toFixed(1)}
            data-z={commander.pos.z.toFixed(1)}
            cx={commander.pos.x}
            cy={commander.pos.z}
            r={34}
            className="fill-[#f3cf86] stroke-[#2b2116]"
            strokeWidth={6}
          />
        )}
      </svg>
      {reason && (
        <span data-testid="campaign-reason" className="font-semibold text-red-400">
          {reason}
        </span>
      )}
    </div>
  );
}
