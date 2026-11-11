'use client';

import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { INVITE_LODGE_REASONS, type MasonCraft, type MasonryCircle } from '@bohemia/game';
import type { LodgeView } from '@/lib/person-view';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

// Stavební huť u vojvody (stone-masonry.md – Stavební huť; churches.md – Typy podle okruhu huti):
// tlačítko „Pozvat stavební huť“ → výběr okruhu ikonami, huť na cestě s počtem dní, „Pozvat mistra“
// u každého chybějícího oboru. Slova jen v popiscích (UI jako 0 A.D.); odmítnutí u kurzoru.

/** Obory mistrů: název a ikona (`tools/blender/icons.py`). */
export const MASON_CRAFT_LABELS: Record<MasonCraft, { name: string; icon: string }> = {
  builder: { name: 'Stavbyvedoucí', icon: '/icons/house/mason-builder.png' },
  limeBurner: { name: 'Vápeník', icon: '/icons/house/mason-limeburner.png' },
  stonemason: { name: 'Kameník', icon: '/icons/house/mason-stonemason.png' },
  mason: { name: 'Zedník', icon: '/icons/house/mason-mason.png' },
  plasterer: { name: 'Štukatér a malíř', icon: '/icons/house/mason-plasterer.png' },
};

/** Okruhy huti: název, typy kostelů (churches.md) a ikona. */
export const MASONRY_CIRCLE_LABELS: Record<
  MasonryCircle,
  { name: string; churches: string; icon: string }
> = {
  adriatic: {
    name: 'Adriatický okruh',
    churches: 'jednolodní kostel s pravoúhlým kněžištěm, trojlodní bazilika',
    icon: '/icons/house/circle-adriatic.png',
  },
  carolingian: {
    name: 'Karolinský okruh',
    churches: 'jednolodní kostel s půlkruhovou apsidou, rotunda se dvěma apsidami',
    icon: '/icons/house/circle-carolingian.png',
  },
};

export const LODGE_ICON = '/icons/house/lodge.png';
export const PRIEST_ICON = '/icons/house/priest.png';
export const INVITE_LODGE_LABEL = 'Pozvat stavební huť';
export const INVITE_MASTER_LABEL = 'Pozvat mistra';

/** Ikona v tlačítku (128 px zdroj, zobrazená malá). */
function Icon({ src, size = 128 }: { src: string; size?: number }): ReactElement {
  return <img src={src} alt="" width={size} height={size} className="h-full w-full" />;
}

/** Počet dní do příchodu česky („1 den“, „5 dní“). */
function daysText(days: number): string {
  return days === 1 ? '1 den' : `${days} dní`;
}

/** Ikona oboru mistra (panel osoby mistra): tooltip s názvem oboru a okruhem huti. */
export function MasonBadge({
  craft,
  circle,
}: {
  craft: MasonCraft;
  circle: MasonryCircle | null;
}): ReactElement {
  const label = MASON_CRAFT_LABELS[craft];
  const text = circle ? `${label.name} – ${MASONRY_CIRCLE_LABELS[circle].name}` : label.name;
  return (
    <Tooltip content={text} placement="above">
      <span
        data-testid="selection-person-mason"
        data-craft={craft}
        tabIndex={0}
        className="h-6 w-6 shrink-0"
      >
        <Icon src={label.icon} size={24} />
      </span>
    </Tooltip>
  );
}

/** Ikona kněze v panelu osoby. */
export function PriestBadge(): ReactElement {
  return (
    <Tooltip content="Kněz" placement="above">
      <span data-testid="selection-person-priest" tabIndex={0} className="h-6 w-6 shrink-0">
        <Icon src={PRIEST_ICON} size={24} />
      </span>
    </Tooltip>
  );
}

/**
 * Huť a mistři u vojvody. Bez práva rozhodnutí rodu (`ennoble`) a s důvodem z jádra
 * (`INVITE_LODGE_REASONS`) jsou tlačítka zašedlá; odmítnutí serveru se ukáže u kurzoru.
 */
export function LodgeActions({
  lodge,
  onInviteLodge,
  onInviteMaster,
}: {
  lodge: LodgeView;
  onInviteLodge: (circle: MasonryCircle) => Promise<string | null>;
  onInviteMaster: (craft: MasonCraft) => Promise<string | null>;
}): ReactElement | null {
  const denied = useRightDenied('ennoble');
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const run = (call: () => Promise<string | null>): void => {
    if (busy) return;
    setBusy(true);
    void call()
      .then(setRefusal)
      .finally(() => {
        setBusy(false);
        setChoosing(false);
      });
  };
  const circle = lodge.circle ?? null;
  // huť už je (nebo jde): důvod „už pozváno“ se ukazuje jen u ikony huti
  const blocked = lodge.invite === 'already' ? null : lodge.invite;
  const reason =
    denied ?? (blocked !== null ? INVITE_LODGE_REASONS[blocked] : null) ?? refusal ?? null;
  return (
    <>
      {circle === null ? (
        <Tooltip content={INVITE_LODGE_LABEL} denied={reason} placement="above">
          <button
            type="button"
            data-testid="selection-person-invite-lodge"
            aria-label={INVITE_LODGE_LABEL}
            aria-disabled={denied !== null || blocked !== null}
            disabled={busy}
            className={`hud-icon-button h-7 w-7 ${denied === null && blocked === null ? '' : 'opacity-40'}`}
            onClick={() => {
              if (denied !== null || blocked !== null || busy) return;
              setRefusal(null);
              setChoosing(true);
            }}
          >
            <Icon src={LODGE_ICON} />
          </button>
        </Tooltip>
      ) : (
        <Tooltip
          content={
            lodge.daysToArrival !== undefined
              ? `Stavební huť (${MASONRY_CIRCLE_LABELS[circle].name}) – mistři dorazí za ${daysText(lodge.daysToArrival)}`
              : `Stavební huť (${MASONRY_CIRCLE_LABELS[circle].name})`
          }
          placement="above"
        >
          <span
            data-testid="selection-person-lodge"
            data-circle={circle}
            tabIndex={0}
            className="flex shrink-0 items-center gap-1"
          >
            <span className="h-6 w-6">
              <Icon src={LODGE_ICON} size={24} />
            </span>
            {lodge.daysToArrival !== undefined && (
              <span
                data-testid="selection-person-lodge-days"
                className="text-sm font-semibold tabular-nums"
              >
                {lodge.daysToArrival}
              </span>
            )}
          </span>
        </Tooltip>
      )}
      {lodge.missing.length > 0 &&
        circle !== null &&
        lodge.missing.map((craft) => (
          <Tooltip
            key={craft}
            content={`${INVITE_MASTER_LABEL}: ${MASON_CRAFT_LABELS[craft].name}`}
            denied={denied ?? refusal}
            placement="above"
          >
            <button
              type="button"
              data-testid="selection-person-invite-master"
              data-craft={craft}
              aria-label={`${INVITE_MASTER_LABEL}: ${MASON_CRAFT_LABELS[craft].name}`}
              aria-disabled={denied !== null}
              disabled={busy}
              className={`hud-icon-button h-7 w-7 ${denied === null ? '' : 'opacity-40'}`}
              onClick={() => {
                if (denied !== null || busy) return;
                setRefusal(null);
                run(() => onInviteMaster(craft));
              }}
            >
              <Icon src={MASON_CRAFT_LABELS[craft].icon} />
            </button>
          </Tooltip>
        ))}
      {choosing &&
        createPortal(
          <CircleChoice
            busy={busy}
            onChoose={(c) => run(() => onInviteLodge(c))}
            onCancel={() => setChoosing(false)}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * Výběr okruhu huti (zároveň potvrzení): dvě ikony okruhů s popiskem – okruh a typy kostelů – a
 * křížek (zrušit). Okno jde do `body` jako potvrzení křtu (panel výběru je posunutý).
 */
function CircleChoice({
  busy,
  onChoose,
  onCancel,
}: {
  busy: boolean;
  onChoose: (circle: MasonryCircle) => void;
  onCancel: () => void;
}): ReactElement {
  const cancel = (): void => {
    if (!busy) onCancel();
  };
  return (
    <>
      <div
        data-hud-block
        aria-hidden
        className="fixed inset-0 z-30"
        onPointerDown={(event) => event.preventDefault()}
        onClick={cancel}
        onContextMenu={(event) => event.preventDefault()}
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-label={INVITE_LODGE_LABEL}
        data-testid="lodge-dialog"
        data-hud-block
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
        className="hud-panel fixed top-1/2 left-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 gap-2 p-3"
      >
        {(Object.keys(MASONRY_CIRCLE_LABELS) as MasonryCircle[]).map((circle) => {
          const label = MASONRY_CIRCLE_LABELS[circle];
          return (
            <Tooltip key={circle} content={`${label.name}: ${label.churches}`} placement="below">
              <button
                type="button"
                data-testid="lodge-circle"
                data-circle={circle}
                aria-label={`${INVITE_LODGE_LABEL}: ${label.name}`}
                aria-busy={busy}
                disabled={busy}
                onClick={() => onChoose(circle)}
                className="hud-icon-button h-12 w-12 disabled:cursor-wait disabled:opacity-60"
              >
                <Icon src={label.icon} />
              </button>
            </Tooltip>
          );
        })}
        <Tooltip content="Zrušit" placement="below">
          <button
            type="button"
            data-testid="lodge-cancel"
            aria-label="Zrušit"
            disabled={busy}
            autoFocus
            onClick={cancel}
            className="hud-icon-button h-12 w-12 disabled:opacity-60"
          >
            <Icon src="/icons/house/cross.png" />
          </button>
        </Tooltip>
      </section>
    </>
  );
}
