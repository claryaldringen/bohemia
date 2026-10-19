'use client';

import { useEffect, useState, type RefCallback } from 'react';

/**
 * Posouvat panel jen tehdy, když jeho obsah přeroste nejvyšší výšku (malé okno): posuv
 * (`overflow-y: auto`) by jinak ořízl popisky a nabídky, které vyčnívají nad panel. Vrátí ref
 * panelu a jestli se má posouvat; obsah panelu je jeho první potomek (blok s výškou obsahu).
 */
export function useOverflowScroll(): [RefCallback<HTMLElement>, boolean] {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [scroll, setScroll] = useState(false);

  useEffect(() => {
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const check = (): void => setScroll(panel.scrollHeight > panel.clientHeight + 1);
    const observer = new ResizeObserver(check);
    observer.observe(panel);
    if (panel.firstElementChild) observer.observe(panel.firstElementChild);
    check();
    return () => observer.disconnect();
  }, [panel]);

  return [setPanel, scroll];
}
