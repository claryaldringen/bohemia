'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { menuKeyAction, nextFocusIndex, type GameMenuStep } from '@/lib/game-menu';
import { DevMenuPanel, type DevMenuControl } from './DevMenu';
import { Dialog } from './Dialog';
import { Tooltip } from './Tooltip';

/** Co v nabídce právě běží na serveru – tlačítka jsou pak zamčená. */
export type GameMenuBusy = 'restart' | 'signOut' | null;

/** Varování před Začít znovu se živou vsí (nezlomitelná mezera – „v“ nezůstane na konci řádku). */
export const RESTART_WARNING = 'Ves i rod zaniknou, začneš v\u00a0nové krajině.';

function MenuButton({
  onClick,
  disabled,
  autoFocus,
  busy,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  busy?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`hud-button w-full px-3 py-1.5 font-serif text-base whitespace-nowrap ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
    >
      {children}
    </button>
  );
}

/**
 * Panel nabídky (bez stavu): položky Začít znovu, Odhlásit a Zpět do hry, nebo potvrzení
 * Začít znovu s krátkým varováním na jeden řádek (panel se kvůli němu rozšíří). Nabídka smí mít
 * slova – zbytek rozhraní jsou ikony s čísly.
 */
export function GameMenuPanel({
  step,
  busy,
  error,
  canRestart,
  email,
  panelRef,
  onRestart,
  onConfirmRestart,
  onCancelRestart,
  onSignOut,
  onSettings,
  soundOn,
  onToggleSound,
  onBackFromSettings,
  devMenu = null,
  onDevMenu,
  onForce,
  onClose,
}: {
  step: GameMenuStep;
  busy: GameMenuBusy;
  /** Chyba restartu nebo odhlášení česky. */
  error: string | null;
  /** Je co začínat znovu – hráč má ves (při zakládání vsi není). */
  canRestart: boolean;
  /** E-mail přihlášeného hráče – popisek Odhlásit. */
  email: string;
  panelRef?: Ref<HTMLElement>;
  onRestart: () => void;
  onConfirmRestart: () => void;
  onCancelRestart: () => void;
  onSignOut: () => void;
  /** Otevře Nastavení. */
  onSettings: () => void;
  /** Zvuky krajiny zapnuté (Nastavení). */
  soundOn: boolean;
  onToggleSound: () => void;
  /** Z Nastavení zpět na položky. */
  onBackFromSettings: () => void;
  /** Vývojový režim: Vývojářské menu (Vynutit pohromu); bez něj null a položka se neukáže. */
  devMenu?: DevMenuControl | null;
  onDevMenu?: () => void;
  onForce?: DevMenuControl['onForce'];
  onClose: () => void;
}): ReactElement {
  const locked = busy !== null;
  return (
    <Dialog
      title="Nabídka"
      onClose={onClose}
      locked={locked}
      closeOnEscape={false}
      widthClass="w-max min-w-72"
      testId="game-menu"
      describedBy={step === 'confirm' ? 'game-menu-warning' : undefined}
      panelRef={panelRef}
    >
      {step === 'main' ? (
        <div className="flex flex-col gap-2">
          <MenuButton onClick={onSettings} disabled={locked}>
            Nastavení
          </MenuButton>
          {devMenu && (
            <MenuButton onClick={() => onDevMenu?.()} disabled={locked}>
              Vývojářské menu
            </MenuButton>
          )}
          <MenuButton onClick={onRestart} disabled={!canRestart || locked}>
            Začít znovu
          </MenuButton>
          <Tooltip
            content={<span className="whitespace-nowrap">{email}</span>}
            placement="left"
            block
          >
            <MenuButton onClick={onSignOut} disabled={locked} busy={busy === 'signOut'}>
              Odhlásit
            </MenuButton>
          </Tooltip>
          <span aria-hidden className="my-0.5 border-t border-[#5c4526]" />
          <MenuButton onClick={onClose} disabled={locked}>
            Zpět do hry
          </MenuButton>
        </div>
      ) : step === 'dev' && devMenu ? (
        <div className="flex flex-col gap-2">
          <DevMenuPanel pending={devMenu.pending} onForce={(choice) => onForce?.(choice)} />
          <span aria-hidden className="my-0.5 border-t border-[#5c4526]" />
          <MenuButton onClick={onBackFromSettings} autoFocus>
            Zpět
          </MenuButton>
        </div>
      ) : step === 'settings' ? (
        <div data-testid="game-settings" className="flex flex-col gap-2">
          <h2 className="px-1 text-center font-serif text-lg text-[#f0c987]">Nastavení</h2>
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            aria-label="Zvuky krajiny"
            data-testid="setting-sound"
            onClick={onToggleSound}
            className="hud-button flex w-full items-center justify-between gap-6 px-3 py-1.5 font-serif text-base whitespace-nowrap"
          >
            <span>Zvuky krajiny</span>
            <span className="tabular-nums">{soundOn ? 'Zapnuto' : 'Vypnuto'}</span>
          </button>
          <span aria-hidden className="my-0.5 border-t border-[#5c4526]" />
          <MenuButton onClick={onBackFromSettings} autoFocus>
            Zpět
          </MenuButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p
            id="game-menu-warning"
            data-testid="game-menu-warning"
            className="px-1 text-center font-serif text-[0.95rem] leading-snug whitespace-nowrap text-[#f0c987]"
          >
            {RESTART_WARNING}
          </p>
          <div className="flex gap-2">
            <MenuButton onClick={onConfirmRestart} disabled={locked} busy={busy === 'restart'}>
              Začít znovu
            </MenuButton>
            <MenuButton onClick={onCancelRestart} disabled={locked} autoFocus>
              Zrušit
            </MenuButton>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center text-sm text-[#ff7a66]">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/**
 * Nabídka hry jako v 0 A.D. (tlačítko vpravo v horní liště, F10) – modální okno uprostřed
 * obrazovky: Nastavení (zvuky krajiny), Začít znovu (se živou vsí
 * po potvrzení v panelu – žádné dialogy prohlížeče), Odhlásit a Zpět do hry. Dokud je otevřená,
 * klávesy hry neběží (zachytí je dřív než kamera, zkratky staveb i umisťování), Esc ji zavře
 * (z potvrzení vrátí zpět) a kliknutí mimo panel ji zavře, aniž by došlo do krajiny.
 */
export function GameMenu({
  canRestart,
  email,
  onClose,
  onRestart,
  onSignOut,
  soundOn,
  onToggleSound,
  devMenu = null,
}: {
  canRestart: boolean;
  /** Vývojový režim: Vývojářské menu s Vynutit pohromu; jinak null. */
  devMenu?: DevMenuControl | null;
  email: string;
  /** Zvuky krajiny zapnuté – přepínač v Nastavení. */
  soundOn: boolean;
  onToggleSound: () => void;
  onClose: () => void;
  /** Začít znovu na serveru – chyba česky, nebo null (stránka se pak načte znovu). */
  onRestart: () => Promise<string | null>;
  /** Odhlásí hráče – chyba česky, nebo null (prohlížeč pak odejde na úvodní stránku). */
  onSignOut: () => Promise<string | null>;
}): ReactElement {
  const [step, setStep] = useState<GameMenuStep>('main');
  const [busy, setBusy] = useState<GameMenuBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [forced, setForced] = useState(false);
  const devPending = devMenu?.pending ?? false;

  // Po vynucení pohromy se nabídka zavře, jakmile server doběhne (pending true → false).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !devPending && forced) onClose();
    wasPending.current = devPending;
  }, [forced, devPending, onClose]);

  // Fokus do panelu – Tab pak jde po položkách, Enter / mezerník je stiskne.
  useEffect(() => {
    if (step === 'main') panelRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Zachytávací fáze na window – ke kameře, zkratkám staveb ani umisťování klávesa nedojde.
      // Výchozí akce (Enter / mezerník na tlačítku) zůstane.
      event.stopPropagation();
      if (event.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        event.preventDefault();
        const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = buttons.findIndex((button) => button === document.activeElement);
        buttons[nextFocusIndex(current, buttons.length, event.shiftKey)]?.focus();
        return;
      }
      const action = menuKeyAction(event.key, step, busy !== null);
      if (action === null) return;
      event.preventDefault();
      if (action === 'close') onClose();
      else {
        setStep('main');
        setError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [step, busy, onClose]);

  const run = (kind: Exclude<GameMenuBusy, null>, action: () => Promise<string | null>): void => {
    if (busy !== null) return;
    setBusy(kind);
    setError(null);
    void action().then((failure) => {
      // po úspěchu prohlížeč odchází (nové načtení, úvodní stránka) – nabídka zůstane zamčená
      if (failure === null) return;
      setError(failure);
      setBusy(null);
    });
  };

  return (
    <>
      <GameMenuPanel
        step={step}
        busy={busy}
        error={error}
        canRestart={canRestart}
        email={email}
        panelRef={panelRef}
        onRestart={() => {
          setStep('confirm');
          setError(null);
        }}
        onConfirmRestart={() => run('restart', onRestart)}
        onCancelRestart={() => {
          setStep('main');
          setError(null);
        }}
        onSignOut={() => run('signOut', onSignOut)}
        onSettings={() => setStep('settings')}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
        onBackFromSettings={() => setStep('main')}
        devMenu={devMenu}
        onDevMenu={() => setStep('dev')}
        onForce={(choice) => {
          if (!devMenu || devMenu.pending) return;
          setForced(true);
          devMenu.onForce(choice);
        }}
        onClose={onClose}
      />
    </>
  );
}
