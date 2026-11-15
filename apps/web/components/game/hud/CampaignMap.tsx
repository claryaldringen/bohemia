'use client';

import { useState, type CSSProperties, type MouseEvent, type ReactElement } from 'react';
import type { GroupOrder, LeaderTarget, Pos, SurrenderOrder } from '@bohemia/game';
import { useCampaign } from '@/hooks/use-campaign';
import { useArmyActions } from '@/hooks/use-army';
import { useEventScope } from '@/hooks/use-server-events';
import type { CampaignView, CampaignViewFlight } from '@/lib/campaign-view';
import { watchCellOf } from '@/lib/war-scene-view';
import { Tooltip } from './Tooltip';

// Mapa tažení (war.md – Na mapě s vojskem, Mlha války; plán 2026-11-03 – Úloha 6.14): minimální
// pohled shora na mapu, na které stojí velitel – vlastní muži, spojenci, cizí v dohledu a objevené
// stavby jako značky. Klik na mapu = velitel jde (záměr na takt teď + 2), klik na cizího = napadne,
// klik na stavbu = jde k ní. Uprchlíci a poslové cizích vsí v dohledu jsou ikony varování (plán
// 2026-11-09 – Ú14, Ú15). Tlačítko oka přepne 3D scénu na cizí mapu, na které vojsko stojí,
// a zpět na ves (war.md – Ve scéně – cizí mapa; `ArmyActions.scene` z kontextu). Otevřená mapa
// dá tažení do rozsahu spojení událostí: pohled nese událost `campaign` a server z tepu spojení
// hlásí přítomnost vůdce (server-events.md – Válka).

/** Odpověď serveru – přijatý pokyn nese takt záměru (`tick`), odmítnutý důvod u kurzoru. */
type Result = Promise<{ ok: true; tick?: number } | { error: string }>;

/**
 * Cíl z kliku, než ho tažení zpracuje: do taktu záměru (`until`; null = odpověď ještě nepřišla)
 * ho mapa ukazuje na místě kliku, potom cíl ze stavu – posunutý z vody na nejbližší dosažitelné
 * místo (war.md – Pohyb – Cíl v neprůchodné buňce).
 */
interface PendingGoal {
  pos: Pos;
  until: number | null;
}

/** Volání serveru pro živé vedení (server actions) – z kontextu, aby šla mapa vykreslit v testech. */
export interface CampaignActions {
  lead: (input: { campaignId: string; target: LeaderTarget }) => Result;
  order: (input: { campaignId: string; group: number; order: GroupOrder; at?: Pos }) => Result;
  surrendered: (input: { campaignId: string; group: number; choice: SurrenderOrder }) => Result;
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

/**
 * Oko „Ve scéně“ – jednobarevná ikona (`public/icons/war/eye.svg`, CC0) jako maska v barvě textu,
 * stejně jako znaky ostatních tlačítek (⌂, ⚔, ✕).
 */
const EYE_ICON: CSSProperties = {
  maskImage: 'url(/icons/war/eye.svg)',
  WebkitMaskImage: 'url(/icons/war/eye.svg)',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
  verticalAlign: '-0.125em',
};

/** Strana ikony uprchlíků a posla na mapě (m) – mapa má 1920 m, velitel má průměr 68 m. */
const FLIGHT_ICON_M = 110;

/** Ikona skupiny – stejné jako volby v panelu vsi (`AlarmButtons`), jen zmenšené. */
function flightIcon(f: CampaignViewFlight): string {
  if (f.kind === 'messenger') return '/icons/war/alarm-messenger.png';
  return f.herd > 0 ? '/icons/war/alarm-all.png' : '/icons/war/alarm-people.png';
}

/** Popisek ikony (jen při najetí myší – `title`). */
function flightLabel(f: CampaignViewFlight): string {
  if (f.kind === 'messenger') return f.mounted ? 'Posel na koni' : 'Posel';
  return f.herd > 0
    ? `Uprchlíci – lidí ${f.people}, dobytka ${f.herd}`
    : `Uprchlíci – lidí ${f.people}`;
}

/**
 * Skupiny uprchlíků a běžící poslové cizích vsí v dohledu vlastních mužů na ukázané mapě
 * (`CampaignView.flights`, war.md – Varování, poslové a útěk do hradiště): ikona varování na
 * místě skupiny, počty jen v popisku.
 */
export function FlightMarks({
  flights,
  here,
}: {
  flights: readonly CampaignViewFlight[] | undefined;
  here: (c: { x: number; y: number }) => boolean;
}): ReactElement | null {
  const shown = (flights ?? []).filter((f) => here(f.cell));
  if (shown.length === 0) return null;
  const h = FLIGHT_ICON_M / 2;
  return (
    <g data-testid="campaign-flights">
      {shown.map((f) => (
        <image
          key={f.refId}
          data-testid={`campaign-flight-${f.kind}`}
          data-people={f.people}
          data-herd={f.herd}
          href={flightIcon(f)}
          x={f.pos.x - h}
          y={f.pos.z - h}
          width={FLIGHT_ICON_M}
          height={FLIGHT_ICON_M}
          aria-label={flightLabel(f)}
        >
          <title>{flightLabel(f)}</title>
        </image>
      ))}
    </g>
  );
}

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
  useEventScope({ campaignId });
  const { view, gone, refresh } = useCampaign(campaignId);
  const sceneWatch = useArmyActions()?.scene ?? null;
  const [pending, setPending] = useState<PendingGoal | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  /** Pošle pokyn; `place` = cíl z kliku čekající na odpověď (odmítnutý zmizí). */
  const send = (result: Result, place: PendingGoal | null = null): void => {
    void result.then((r) => {
      setReason('error' in r ? r.error : null);
      if (place) {
        setPending((p) =>
          p !== place ? p : 'error' in r ? null : { pos: place.pos, until: r.tick ?? null },
        );
      }
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
  const clicked =
    pending && (pending.until === null || view.tick < pending.until) ? pending.pos : null;
  const goal =
    clicked ?? (group?.goal && here(group.goal.cell) && !group.arrived ? group.goal.pos : null);
  const live = view.liveCommand;
  const onTarget = here(view.target.cell);

  const clickMap = (e: MouseEvent<SVGSVGElement>): void => {
    if (!live) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pos = {
      x: ((e.clientX - r.left) / r.width) * 2 * HALF_M - HALF_M,
      z: ((e.clientY - r.top) / r.height) * 2 * HALF_M - HALF_M,
    };
    const place: PendingGoal = { pos, until: null };
    setPending(place);
    send(actions.lead({ campaignId, target: { kind: 'place', place: { cell, pos } } }), place);
  };
  const lead =
    (target: LeaderTarget) =>
    (e: MouseEvent): void => {
      e.stopPropagation();
      if (!live) return;
      // jiný cíl než místo – dřívější klik už mapa neukazuje
      setPending(null);
      send(actions.lead({ campaignId, target }));
    };
  const denied = live ? null : 'Velí jiný muž.';
  const watching = sceneWatch?.watching?.campaignId === campaignId;
  const watchCell = sceneWatch ? watchCellOf(view, sceneWatch.home) : null;
  const toggleWatch = (): void => {
    if (!sceneWatch) return;
    if (watching) sceneWatch.back();
    else if (watchCell) sceneWatch.watch({ campaignId, cell: watchCell });
  };

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
        {sceneWatch && (
          <Tooltip
            content={watching ? 'Zpět na ves' : 'Ve scéně'}
            denied={watching || watchCell ? null : 'Vojsko není na cizí mapě.'}
            placement="below-left"
          >
            <button
              type="button"
              data-testid="campaign-watch"
              aria-label={watching ? 'Zpět na ves' : 'Ve scéně'}
              aria-pressed={watching}
              disabled={!watching && !watchCell}
              onClick={toggleWatch}
              className={`hud-inset rounded px-1.5 disabled:opacity-45 disabled:grayscale ${watching ? 'ring-1 ring-[#f3cf86]' : ''}`}
            >
              <span aria-hidden className="inline-block size-[1em] bg-current" style={EYE_ICON} />
            </button>
          </Tooltip>
        )}
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
        <FlightMarks flights={view.flights} here={here} />
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
