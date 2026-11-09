// Klávesové zkratky panelů horní lišty (absence.md – Návrat): J otevře a zavře Kroniku, U panel
// Upozornění. Martin 9. 11. 2026: „Na písmenech mi nezáleží, takže jo“ (k návrhu Clauda J a U).
// Ostatní písmena jsou obsazená: stavby Z X C V B N M F G H T K L O P (`BUILD_ITEMS`), kamera
// W A S D Q E R (`scene/camera.ts`).

/** Panel horní lišty se zkratkou. */
export type PanelHotkey = 'chronicle' | 'notices';

/** Klávesa (`KeyboardEvent.code`) a písmeno do popisku tlačítka. */
export const PANEL_HOTKEYS: Readonly<Record<PanelHotkey, { code: string; label: string }>> = {
  chronicle: { code: 'KeyJ', label: 'J' },
  notices: { code: 'KeyU', label: 'U' },
};

const PANELS: readonly PanelHotkey[] = ['chronicle', 'notices'];

interface KeyLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Panel na klávesovou zkratku – bez modifikátorů a bez opakování držené klávesy, jinak null. */
export function panelForKey(event: KeyLike): PanelHotkey | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  return PANELS.find((panel) => PANEL_HOTKEYS[panel].code === event.code) ?? null;
}
