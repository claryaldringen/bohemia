'use client';

import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

// Křest vojvody (christianity.md – Křest rodu; Martin: „U vojvody se objeví tlačítko s možností
// nechat se pokřtít.“): ikona kříže víry v panelu vojvody – slova jen v popisku (UI jako 0 A.D.).
// Krok nejde vzít zpět, proto napřed potvrzení (návrh Clauda); odmítnutí serveru (rod nezná, už
// pokřtěný, vojvoda jinde) u kurzoru.

/** Ikona kříže víry (z Blenderu – `tools/blender/icons.py`; `house/cross.png` je křížek „zavřít“). */
export const FAITH_CROSS_ICON = '/icons/house/faith-cross.png';

export const BAPTIZE_LABEL = 'Nechat se pokřtít';
export const BAPTIZE_WARNING = 'Křest nejde vzít zpět. Vedlejší manželky budou propuštěny.';

/** Kříž víry – tlačítko křtu, pokřtěný člověk v panelu, křesťané v popisku štěstí. */
export function FaithCross({
  size,
  className = 'h-full w-full',
}: {
  size: number;
  className?: string;
}): ReactElement {
  return <img src={FAITH_CROSS_ICON} alt="" width={size} height={size} className={className} />;
}

/**
 * Tlačítko „Nechat se pokřtít“ u vojvody (panel osoby). Bez práva rozhodnutí rodu (`ennoble` –
 * `ACTION_RIGHTS.baptizeLord`) zašedne s důvodem; klik otevře potvrzení, potvrzení zavolá
 * `onBaptize` (vrací důvod odmítnutí česky, nebo null).
 */
export function BaptizeButton({
  onBaptize,
}: {
  onBaptize: () => Promise<string | null>;
}): ReactElement {
  const denied = useRightDenied('ennoble');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const confirm = (): void => {
    if (busy) return;
    setBusy(true);
    void onBaptize()
      .then(setRefusal)
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  };
  return (
    <>
      <Tooltip content={BAPTIZE_LABEL} denied={denied ?? refusal} placement="above">
        <button
          type="button"
          data-testid="selection-person-baptize"
          aria-label={BAPTIZE_LABEL}
          aria-disabled={denied !== null}
          disabled={busy}
          className={`hud-icon-button h-7 w-7 ${denied === null ? '' : 'opacity-40'}`}
          onClick={() => {
            if (denied !== null || busy) return;
            setRefusal(null);
            setConfirming(true);
          }}
        >
          <FaithCross size={128} />
        </button>
      </Tooltip>
      {confirming &&
        createPortal(
          <BaptizeConfirm busy={busy} onConfirm={confirm} onCancel={() => setConfirming(false)} />,
          document.body,
        )}
    </>
  );
}

/**
 * Potvrzení křtu: věta, proč se ptáme, a dvě ikony – kříž víry (pokřtít) a křížek (zrušit).
 * Klik mimo okno nebo Esc ho zavře. Okno jde do `body` – panel výběru je posunutý (transform),
 * `fixed` by se v něm neměřilo od okna.
 */
function BaptizeConfirm({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
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
        aria-label={BAPTIZE_LABEL}
        aria-describedby="baptize-warning"
        data-testid="baptize-dialog"
        data-hud-block
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
        className="hud-panel fixed top-1/2 left-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 p-3"
      >
        <p
          id="baptize-warning"
          data-testid="baptize-warning"
          className="px-1 text-center font-serif text-[0.95rem] leading-snug whitespace-nowrap text-[#f0c987]"
        >
          {BAPTIZE_WARNING}
        </p>
        <div className="flex gap-2">
          <Tooltip content={BAPTIZE_LABEL} placement="below">
            <button
              type="button"
              data-testid="baptize-confirm"
              aria-label={BAPTIZE_LABEL}
              aria-busy={busy}
              disabled={busy}
              onClick={onConfirm}
              className="hud-icon-button h-9 w-9 disabled:cursor-wait disabled:opacity-60"
            >
              <FaithCross size={128} />
            </button>
          </Tooltip>
          <Tooltip content="Zrušit" placement="below">
            <button
              type="button"
              data-testid="baptize-cancel"
              aria-label="Zrušit"
              disabled={busy}
              autoFocus
              onClick={cancel}
              className="hud-icon-button h-9 w-9 disabled:opacity-60"
            >
              <img
                src="/icons/house/cross.png"
                alt=""
                width={128}
                height={128}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        </div>
      </section>
    </>
  );
}
