// Nabídka hry (Martin, 18. 10. 2026: „Měl bych mít k dispozici menu, ve kterém bych mohl
// restartovat hru.“) – klávesy jako v 0 A.D. Čisté funkce, komponenta `hud/GameMenu.tsx`.

/** Klávesa nabídky jako v 0 A.D. (`KeyboardEvent.key`). */
export const MENU_HOTKEY = 'F10';

/** Krok nabídky: seznam položek, potvrzení Začít znovu, nebo Nastavení. */
export type GameMenuStep = 'main' | 'confirm' | 'settings';

/** Co udělá klávesa v otevřené nabídce: zavře ji, vrátí z potvrzení zpět, nebo nic. */
export type MenuKeyAction = 'close' | 'back' | null;

type KeyLike = Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey'>;

/** Otevře klávesa nabídku? F10 bez modifikátorů, ne opakování při držení. */
export function opensMenu(event: KeyLike): boolean {
  return (
    event.key === MENU_HOTKEY && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

/**
 * Klávesa v otevřené nabídce: F10 ji zavře, Esc zavře – z potvrzení a z nastavení jen vrátí k položkám.
 * Když na serveru běží restart nebo odhlášení, nabídka zůstane, jak je.
 */
export function menuKeyAction(key: string, step: GameMenuStep, busy: boolean): MenuKeyAction {
  if (busy) return null;
  if (key === MENU_HOTKEY) return 'close';
  if (key === 'Escape') return step === 'main' ? 'close' : 'back';
  return null;
}

/**
 * Tab v nabídce nepustí fokus ven (do lišty nebo krajiny): index tlačítka, které dostane fokus.
 * `current` = index tlačítka s fokusem, −1 když fokus není na žádném (panel sám).
 */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}
