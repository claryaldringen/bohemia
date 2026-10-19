'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Rozbalená nabídka (růžice, obchod) se zavře stiskem myši mimo `ref` – mimo nabídku i její
 * tlačítko, třeba na jiné tlačítko panelu nebo do krajiny. Dvě nabídky panelu výběru tak nikdy
 * nejsou otevřené naráz (otevírají se na stejném místě nad panelem).
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const root = ref.current;
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      dismissRef.current();
    };
    // zachytávací fáze – scéna ani jiné panely stisk nezastaví dřív
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [open, ref]);
}
