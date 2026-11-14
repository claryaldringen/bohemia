'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ALARM_BLOCKED,
  ALARM_CHOICES,
  REFUGE_RETURN_REASONS,
  type AlarmCommand,
  type AlarmRunner,
} from '@bohemia/game';
import { useDismiss } from '@/hooks/use-dismiss';
import {
  ALARM_DOMAIN_LABEL,
  ALARM_LABELS,
  alarmOptionText,
  daysBadge,
  domainSendText,
  flightText,
  messengerText,
  returnText,
  runnerText,
  YIELD_LORD_LABEL,
  type AlarmChoice,
  type AlarmView,
} from '@/lib/alarm-view';
import { Tooltip } from './Tooltip';
import { useRightDenied } from './rights';

// Varování a útěk v panelu dvorce (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 13): řádek pod postojem vsi, jen když ves o cizím vojsku ví nebo má lidi na útěku. Jako
// v 0 A.D. jen ikony – název, odhad a důvod (červeně) v popisku. Po odeslání ikona zašedne, dokud
// server neukáže jiný stav (nejdéle 10 s – vzor `BreakoutButton`); bez práva `war` zašedne
// s důvodem práva.

/** Ikony (vlastní rendery z Blenderu – `tools/blender/icons.py`, `public/icons/LICENSES.md`). */
export const ALARM_ICONS: Readonly<Record<AlarmChoice | 'return' | 'domain', string>> = {
  messenger: '/icons/war/alarm-messenger.png',
  forest: '/icons/war/alarm-forest.png',
  people: '/icons/war/alarm-people.png',
  all: '/icons/war/alarm-all.png',
  return: '/icons/war/alarm-return.png',
  domain: '/icons/war/alarm-domain.png',
};
const DONE_ICON = '/icons/war/alarm-done.png';
const CAUGHT_ICON = '/icons/house/cross.png';
const WAIT_ICON = '/icons/resources/hourglass.png';
const YIELD_ICON = '/icons/war/white-flag.png';
const VILLAGE_ICON = '/icons/build/zemnice.png';

/** Data a akce řádku (VillageGame – `useAlarm` a server actions). */
export interface AlarmActions {
  /** Pohled na varování zobrazené vsi; null – ještě nic. */
  view: AlarmView | null;
  /** Příkaz obránce – vrátí důvod odmítnutí česky, nebo null. */
  onCommand: (command: AlarmCommand) => Promise<string | null>;
  /** Vrátit se – vrátí důvod odmítnutí česky, nebo null. */
  onReturn: () => Promise<string | null>;
}

/** Skupina příkazu – odeslaný příkaz zašedne jen svou skupinu ikon. */
type SentKey = 'messenger' | 'flee' | 'return' | 'domain' | 'yield';

/** Jak dlouho platí odeslaný příkaz či chyba, když server stav nezmění (ms). */
const SENT_HOLD_MS = 10_000;

/** Co odeslaný příkaz ukáže u kurzoru, než server stav změní (texty jádra). */
const SENT_TEXT: Readonly<Record<SentKey, string>> = {
  messenger: ALARM_BLOCKED.sent,
  flee: ALARM_BLOCKED.gone,
  return: REFUGE_RETURN_REASONS.returning,
  domain: 'Posli do domény už běží.',
  yield: 'Vojvoda se vzdal.',
};

const iconButton = (busy: boolean): string =>
  `hud-inset relative h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`;

/** Otisk stavu ze serveru – změní-li se, odeslané příkazy přestanou držet ikony zašedlé. */
function stateKey(view: AlarmView): string {
  return JSON.stringify([
    view.villageId,
    view.campaignId,
    ALARM_CHOICES.map((c) => view.options[c].blocked),
    view.messenger?.status ?? null,
    view.flight?.status ?? null,
    view.ret?.blocked ?? null,
    view.ret?.backInDays !== undefined,
    view.yieldLord?.blocked ?? (view.yieldLord === null ? 'none' : null),
    view.domainLeft ?? null,
    view.domain?.map((d) => d.warned) ?? null,
  ]);
}

/** Ikona v řádku: obrázek přes celé tlačítko a volitelný znak stavu vpravo dole. */
function Icon({ src, badge }: { src: string; badge?: ReactNode }): ReactElement {
  return (
    <>
      <img src={src} alt="" width={40} height={40} className="h-full w-full object-contain p-0.5" />
      {badge}
    </>
  );
}

/** Znak stavu: malá ikona (hodiny, fajfka, křížek) a číslo dnů. */
function Badge({
  icon,
  text,
  testId,
}: {
  icon?: string;
  text?: string;
  testId?: string;
}): ReactElement {
  return (
    <span
      data-testid={testId}
      className="pointer-events-none absolute right-0 bottom-0 flex items-center gap-px rounded-tl bg-[#15100b]/80 pr-0.5 pl-px"
    >
      {icon !== undefined && (
        <img src={icon} alt="" width={14} height={14} className="h-3.5 w-3.5" />
      )}
      {text !== undefined && (
        <span className="text-[10px] leading-none font-semibold text-[#f3e6c8]">{text}</span>
      )}
    </span>
  );
}

/** Popisek: název, odhad a stav šedě, důvod červeně. */
function Tip({
  label,
  lines,
  denied,
  testId,
}: {
  label: string;
  lines: readonly (string | null)[];
  denied: string | null;
  testId?: string;
}): ReactElement {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{label}</span>
      {lines
        .filter((l): l is string => l !== null)
        .map((l) => (
          <span key={l} className="text-[#cdbf9f]">
            {l}
          </span>
        ))}
      {denied !== null && (
        <span data-testid={testId} className="font-semibold text-red-400">
          {denied}
        </span>
      )}
    </span>
  );
}

/** Ikona posla v nabídce: vesničan pěšky, muž rodu pěšky (portrét) nebo na koni. */
function runnerIcon(runner: AlarmRunner): string {
  if (!runner.line) return ALARM_ICONS.messenger;
  return runner.mounted ? '/icons/resources/horse.png' : '/icons/resources/man.png';
}

/**
 * Řádek ikon varování v panelu dvorce: **Poslat posla** (víc možných poslů – nabídka, koho poslat),
 * **Ukrýt v lese**, **Do hradiště – jen lidé**, **Do hradiště – se vším**; po útěku místo nich stav
 * skupiny (hodiny s odhadem dnů, fajfka, křížek) a **Vrátit se**; hradiště hráče **Varovat doménu**
 * (nabídka vsí domény k zaškrtnutí). Bílá vlajka (vzdání vojvody): první stisk ji připraví, druhý vzdá.
 */
export function AlarmButtons({ view, onCommand, onReturn }: AlarmActions): ReactElement | null {
  const warDenied = useRightDenied('war');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Partial<Record<SentKey, string>>>({});
  const [open, setOpen] = useState<'runners' | 'domain' | null>(null);
  const [armed, setArmed] = useState(false);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(open !== null || armed, rootRef, () => {
    setOpen(null);
    setArmed(false);
  });
  const key = view ? stateKey(view) : null;
  useEffect(() => {
    setSent({});
    setArmed(false);
  }, [key]);
  useEffect(() => {
    if (open !== 'domain') setChosen([]);
  }, [open]);
  // pojistka: příkaz, který takt nepřijal, nezamkne ikony natrvalo
  const anySent = Object.keys(sent).length > 0;
  useEffect(() => {
    if (!anySent) return;
    const timer = setTimeout(() => setSent({}), SENT_HOLD_MS);
    return () => clearTimeout(timer);
  }, [anySent, sent]);

  if (!view || (!view.warned && view.ret === null)) return null;

  const run = (what: SentKey, order: () => Promise<string | null>): void => {
    if (busy) return;
    setBusy(true);
    setOpen(null);
    void order()
      .then((error) => setSent((s) => ({ ...s, [what]: error ?? SENT_TEXT[what] })))
      .finally(() => setBusy(false));
  };
  const reasonOf = (what: SentKey): string | null => warDenied ?? sent[what] ?? null;

  const choiceButton = (choice: AlarmChoice): ReactElement => {
    const text = alarmOptionText(view, choice);
    const group: SentKey = choice === 'messenger' ? 'messenger' : 'flee';
    const own = reasonOf(group);
    const messenger = choice === 'messenger';
    const many = messenger && view.runners.length > 1;
    const lines = messenger
      ? [
          !many && view.runners[0] ? runnerText(view.runners[0]) : null,
          text.detail,
          messengerText(view),
        ]
      : [text.detail];
    const status = messenger ? view.messenger?.status : undefined;
    const badge =
      status === 'running' ? (
        <Badge icon={WAIT_ICON} testId="alarm-messenger-running" />
      ) : status === 'arrived' ? (
        <Badge icon={DONE_ICON} testId="alarm-messenger-arrived" />
      ) : status === 'caught' ? (
        <Badge icon={CAUGHT_ICON} testId="alarm-messenger-caught" />
      ) : undefined;
    return (
      <Tooltip
        key={choice}
        placement="above"
        denied={own}
        off={many && open === 'runners'}
        content={
          <Tip
            label={text.label}
            lines={lines}
            denied={text.denied}
            testId={`alarm-denied-${choice}`}
          />
        }
      >
        <button
          type="button"
          data-testid={`alarm-${choice}`}
          aria-label={text.label}
          aria-expanded={many ? open === 'runners' : undefined}
          disabled={busy || own !== null || text.denied !== null}
          onClick={() => {
            if (many) setOpen((o) => (o === 'runners' ? null : 'runners'));
            else if (messenger) run('messenger', () => onCommand({ kind: 'messenger' }));
            else
              run('flee', () =>
                onCommand({ kind: 'flee', mode: choice as Exclude<AlarmChoice, 'messenger'> }),
              );
          }}
          className={iconButton(busy)}
        >
          <Icon src={ALARM_ICONS[choice]} badge={badge} />
        </button>
      </Tooltip>
    );
  };

  const flight = view.flight;
  const flightStatus = flight && (
    <Tooltip
      placement="above"
      content={<Tip label={ALARM_LABELS[flight.mode]} lines={[flightText(view)]} denied={null} />}
    >
      <span
        tabIndex={0}
        data-testid="alarm-flight"
        data-status={flight.status}
        aria-label={ALARM_LABELS[flight.mode]}
        className="hud-inset relative block h-10 w-10 overflow-hidden rounded"
      >
        <Icon
          src={ALARM_ICONS[flight.mode]}
          badge={
            flight.status === 'marching' ? (
              <Badge
                icon={WAIT_ICON}
                text={flight.etaDays === null ? undefined : daysBadge(flight.etaDays)}
              />
            ) : flight.status === 'caught' ? (
              <Badge icon={CAUGHT_ICON} />
            ) : (
              <Badge icon={DONE_ICON} />
            )
          }
        />
      </span>
    </Tooltip>
  );

  const ret = view.ret;
  const retText = ret && returnText(ret);
  const retButton = ret && retText && (
    <Tooltip
      placement="above"
      denied={reasonOf('return')}
      content={
        <Tip
          label={retText.label}
          lines={[retText.detail]}
          denied={retText.denied}
          testId="alarm-denied-return"
        />
      }
    >
      <button
        type="button"
        data-testid="alarm-return"
        aria-label={retText.label}
        disabled={busy || reasonOf('return') !== null || retText.denied !== null}
        onClick={() => run('return', onReturn)}
        className={iconButton(busy)}
      >
        <Icon
          src={ALARM_ICONS.return}
          badge={
            ret.backInDays !== undefined ? (
              <Badge icon={WAIT_ICON} text={daysBadge(ret.backInDays)} />
            ) : undefined
          }
        />
      </button>
    </Tooltip>
  );

  const domain = view.domain;
  const left = Math.max(0, view.domainLeft ?? 0);
  const domainDenied =
    domain && (left === 0 || domain.every((d) => d.warned)) ? ALARM_BLOCKED['no-domain'] : null;
  const domainButton = domain && (
    <Tooltip
      placement="above"
      denied={reasonOf('domain')}
      off={open === 'domain'}
      content={
        <Tip
          label={ALARM_DOMAIN_LABEL}
          lines={[]}
          denied={domainDenied}
          testId="alarm-denied-domain"
        />
      }
    >
      <button
        type="button"
        data-testid="alarm-domain"
        aria-label={ALARM_DOMAIN_LABEL}
        aria-expanded={open === 'domain'}
        disabled={busy || reasonOf('domain') !== null || domainDenied !== null}
        onClick={() => setOpen((o) => (o === 'domain' ? null : 'domain'))}
        className={iconButton(busy)}
      >
        <Icon src={ALARM_ICONS.domain} badge={<Badge text={String(left)} />} />
      </button>
    </Tooltip>
  );

  const yieldLord = view.yieldLord;
  const yieldDenied = yieldLord
    ? yieldLord.blocked
      ? ALARM_BLOCKED[yieldLord.blocked]
      : null
    : null;
  const yieldButton = yieldLord && (
    <Tooltip
      placement="above"
      denied={reasonOf('yield')}
      content={
        <Tip
          label={YIELD_LORD_LABEL}
          lines={[]}
          denied={yieldDenied}
          testId="alarm-denied-yield-lord"
        />
      }
    >
      <button
        type="button"
        data-testid="alarm-yield-lord"
        data-armed={armed ? 'true' : undefined}
        aria-label={YIELD_LORD_LABEL}
        disabled={busy || reasonOf('yield') !== null || yieldDenied !== null}
        onClick={() => {
          if (!armed) setArmed(true);
          else {
            setArmed(false);
            run('yield', () => onCommand({ kind: 'yield-lord' }));
          }
        }}
        className={`${iconButton(busy)}${armed ? ' ring-2 ring-red-400' : ''}`}
      >
        <Icon src={YIELD_ICON} />
      </button>
    </Tooltip>
  );

  return (
    <div ref={rootRef} data-testid="alarm-buttons" className="flex items-center gap-1.5">
      {view.warned && choiceButton('messenger')}
      {view.warned && (flight ? flightStatus : ALARM_CHOICES.slice(1).map(choiceButton))}
      {retButton}
      {view.warned && domainButton}
      {view.warned && yieldButton}
      {open === 'runners' && (
        <div
          data-testid="alarm-runners"
          className="hud-panel hud-popup flex gap-1.5 p-2"
          data-hud-block
        >
          {view.runners.map((r) => (
            <Tooltip key={r.personId} placement="above" content={runnerText(r)}>
              <button
                type="button"
                data-testid={`alarm-runner-${r.personId}`}
                aria-label={runnerText(r)}
                disabled={busy}
                onClick={() =>
                  run('messenger', () =>
                    onCommand(
                      r.line ? { kind: 'messenger', personId: r.personId } : { kind: 'messenger' },
                    ),
                  )
                }
                className={iconButton(busy)}
              >
                <Icon src={runnerIcon(r)} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      {open === 'domain' && domain && (
        <div
          data-testid="alarm-domain-list"
          className="hud-panel hud-popup flex flex-col gap-1 p-2 text-xs"
          data-hud-block
        >
          {domain.map((d) => {
            const checked = d.warned || chosen.includes(d.villageId);
            const full = !checked && chosen.length >= left;
            return (
              <label
                key={d.villageId}
                data-testid={`alarm-domain-${d.villageId}`}
                className={`flex items-center gap-1.5 ${d.warned || full ? 'opacity-55' : 'cursor-pointer'}`}
              >
                <img
                  src={VILLAGE_ICON}
                  alt=""
                  width={22}
                  height={22}
                  className="h-5.5 w-5.5 rounded"
                />
                <span className="grow">{d.name}</span>
                {d.warned && (
                  <img src={DONE_ICON} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                )}
                <input
                  type="checkbox"
                  aria-label={d.name}
                  checked={checked}
                  disabled={d.warned || full}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setChosen((list) =>
                      on ? [...list, d.villageId] : list.filter((id) => id !== d.villageId),
                    );
                  }}
                />
              </label>
            );
          })}
          <Tooltip placement="above" content={domainSendText(chosen.length, left)}>
            <button
              type="button"
              data-testid="alarm-domain-send"
              aria-label={domainSendText(chosen.length, left)}
              disabled={busy || chosen.length === 0}
              onClick={() => {
                const to = [...chosen];
                run('domain', () => onCommand({ kind: 'domain', to }));
              }}
              className={`${iconButton(busy)} mt-1 self-end`}
            >
              <Icon src={ALARM_ICONS.messenger} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
