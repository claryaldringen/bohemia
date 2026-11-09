import { useEffect, useRef } from 'react';
import { panelForKey, type PanelHotkey } from '@/lib/panel-keys';

/**
 * Zkratky panelů horní lišty (J Kronika, U Upozornění – `lib/panel-keys.ts`): stisk panel přepne,
 * druhý stisk ho zavře. Při psaní do pole nic nedělá; `enabled` false (otevřená nabídka hry, konec
 * hry) zkratky vypne – otevřená nabídka navíc klávesy zachytí dřív (`GameMenu`).
 */
export function usePanelHotkeys(toggle: (panel: PanelHotkey) => void, enabled: boolean): void {
  const toggleRef = useRef(toggle);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    toggleRef.current = toggle;
    enabledRef.current = enabled;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!enabledRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const panel = panelForKey(event);
      if (!panel) return;
      event.preventDefault();
      toggleRef.current(panel);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
