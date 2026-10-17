import type { PlacementResult } from './scene/village-types';

// Háčky pro Playwright testy (apps/web/e2e). Existují jen v buildu s NEXT_PUBLIC_E2E_HOOKS=1 –
// nastavuje ho playwright.config.ts pro svůj `next build`. Next proměnnou při buildu vepíše jako
// konstantu, v běžném buildu je podmínka vždy false a háček se do prohlížeče vůbec nedostane.
//
// Proč: bezhlavý Chromium kreslí scénu softwarově a s náhodnou krajinou nového hráče by test
// musel hledat volné místo klikáním po plátně. Háček potvrdí umístění přímo (se stejnou kontrolou
// jako kliknutí do scény) – zbytek cesty (rozhraní, server action, panel, scéna) běží naostro.

export const E2E_HOOKS_ENABLED = process.env.NEXT_PUBLIC_E2E_HOOKS === '1';

export interface E2EHooks {
  /** Potvrdí běžící umisťování, jako by hráč klikl do scény; neprojde-li kontrolou, vyhodí chybu. */
  confirmPlacement?: (result: PlacementResult) => void;
}

declare global {
  interface Window {
    __bohemiaE2E?: E2EHooks;
  }
}

export function setE2EHook<K extends keyof E2EHooks>(key: K, value: E2EHooks[K]): void {
  if (!E2E_HOOKS_ENABLED) return;
  window.__bohemiaE2E ??= {};
  window.__bohemiaE2E[key] = value;
}
