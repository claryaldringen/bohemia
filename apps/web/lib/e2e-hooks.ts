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
  /** Bod krajiny (x, z) na obrazovce v CSS px, nebo null mimo záběr – kam kliknout myší. */
  projectToScreen?: (x: number, z: number) => { x: number; y: number } | null;
  /** Meshe porážky ve scéně (`slaughter-*`) a jestli jsou připravené ke kreslení. */
  slaughterMeshes?: () => { name: string; ready: boolean }[];
  /** Meshe divoké zvěře (`wild-*`) a kusy, které jsou teď vidět (druh, poloha) – kam kliknout. */
  wildAnimals?: () => {
    meshes: { name: string; ready: boolean }[];
    animals: { species: string; model: string; x: number; z: number }[];
    /** Naplánované skupiny (první stanoviště) – modely se načtou až se zvěří v záběru. */
    groups: { species: string; x: number; z: number }[];
  };
  /** Posune kameru nad bod krajiny (x, z) – zvěř bývá u lesa mimo výchozí záběr. */
  moveCameraTo?: (x: number, z: number) => void;
  /** Zeptá se na ves hned (dotazování jinak čeká na další herní den – v testech ≈ 86 s). */
  pollVillage?: () => void;
  /** Vybere člověka vsi (id), jako by hráč klikl na jeho postavu – postavy ve scéně chodí. */
  selectPerson?: (id: number) => void;
  /** Vybere cestu hráče (id kteréhokoli úseku) – úzký pás cesty se v softwarovém kreslení špatně trefuje. */
  selectRoad?: (id: number) => void;
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
