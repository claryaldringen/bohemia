'use client';

import { useEffect, type ReactElement, type ReactNode, type Ref } from 'react';
import { Tooltip } from './Tooltip';

/**
 * Standardní dialog hry (Martin 14. 11. 2026 ke kronice: „ať je to prostě nějaký standardní
 * dialog“): modální okno uprostřed obrazovky se ztmaveným pozadím, nahoře titulek a vpravo
 * křížek (popisek „Zavřít (Esc)“). Zavírá křížek, Esc i klik mimo okno; obsah se posouvá a okno
 * nikdy nepřeteče obrazovku. Používá ho Kronika i nabídka hry.
 */
export function Dialog({
  title,
  icon,
  onClose,
  locked = false,
  closeOnEscape = true,
  widthClass = 'w-[26rem]',
  testId,
  backdropTestId,
  closeTestId,
  describedBy,
  panelRef,
  children,
}: {
  /** Titulek v záhlaví; slouží i jako název dialogu pro čtečky. */
  title: string;
  /** Ikona před titulkem. */
  icon?: ReactNode;
  onClose: () => void;
  /** Zamčený dialog (běží akce na serveru) se křížkem ani kliknutím mimo nezavře. */
  locked?: boolean;
  /** Esc zavírá dialog sám; volající, který klávesy zpracovává jinak, to vypne. */
  closeOnEscape?: boolean;
  /** Třídy šířky okna (vždy s `max-w-[92vw]`-podobnou mezí, ať se nepřetáhne mimo obrazovku). */
  widthClass?: string;
  testId?: string;
  backdropTestId?: string;
  closeTestId?: string;
  describedBy?: string;
  panelRef?: Ref<HTMLElement>;
  children: ReactNode;
}): ReactElement {
  useEffect(() => {
    if (!closeOnEscape || locked) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnEscape, locked, onClose]);
  return (
    <>
      {/* Kliknutí mimo okno dialog zavře a do krajiny ani lišty nedojde. Zavírá až click – po
          pointerdown by zmizelý závoj pustil pointerup / click na to, co leží pod ním. */}
      <div
        data-hud-block
        aria-hidden
        data-testid={backdropTestId}
        className="fixed inset-0 z-30 bg-black/40"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!locked) onClose();
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        data-testid={testId}
        data-hud-block
        tabIndex={-1}
        className={`hud-panel fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100vh-2rem)] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col p-3 outline-none ${widthClass}`}
      >
        <div className="flex items-center gap-1.5 pb-2">
          {icon}
          <h2 className="font-serif text-lg leading-6 text-[#f0c987]">{title}</h2>
          {/* křížek vpravo nahoře – `ml-auto` musí mít prvek řádku, ne tlačítko uvnitř obalu
              popisku (obal je položka flexu, tlačítko v něm by zůstalo hned za titulkem) */}
          <div className="ml-auto" data-testid="dialog-close-slot">
            <Tooltip content="Zavřít (Esc)">
              <button
                type="button"
                aria-label="Zavřít"
                data-testid={closeTestId ?? 'dialog-close'}
                disabled={locked}
                className="hud-icon-button flex h-6 w-6 items-center justify-center disabled:opacity-40"
                onClick={onClose}
              >
                <img src="/icons/house/cross.png" alt="" width={12} height={12} draggable={false} />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </section>
    </>
  );
}
