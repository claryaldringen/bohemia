import type { CartRoutesRequest, CartRoutesResult } from './cart-routes';
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
  /** Kolik čar místa problému (červená značka zatarasené branky, vody…) teď kreslí náhled opevnění. */
  paintProblems?: () => number;
  /** Body návrhu obvodu opevnění, který hráč právě upravuje (fortifications.md – Obvod). */
  fortPoints?: () => (readonly [number, number])[];
  /** Meshe porážky ve scéně (`slaughter-*`) a jestli jsou připravené ke kreslení. */
  slaughterMeshes?: () => { name: string; ready: boolean }[];
  /** Meshe divoké zvěře (`wild-*`) a kusy, které jsou teď vidět (druh, poloha) – kam kliknout. */
  wildAnimals?: () => {
    meshes: { name: string; ready: boolean }[];
    animals: { species: string; model: string; x: number; z: number }[];
    /** Naplánované skupiny (první stanoviště) – modely se načtou až se zvěří v záběru. */
    groups: { species: string; x: number; z: number }[];
  };
  /** Meshe vojska, které scéna kreslí, a počty instancí (war.md – Ve scéně – napojení na hru). */
  armyStats?: () => { name: string; count: number }[];
  /**
   * Výjezdy vojvody ve scéně vsi (journey.md – Scéna vsi): muži, jak jsou nakreslení (výjezd, klíč,
   * poloha, na koni, rychlost), praporek cíle a počet dní na přesýpacích hodinách.
   */
  journeyScene?: () => {
    riders: {
      journeyId: string;
      own: boolean;
      /** Klíč muže ve scéně (`sceneManKey` – výprava:osoba u vlastních). */
      key: string;
      /** Id osoby ve vsi (jen vlastní výprava). */
      personId: number | null;
      x: number;
      z: number;
      mounted: boolean;
      look: 'line' | 'man' | 'woman' | 'child';
      led: boolean;
      speed: number;
    }[];
    banner: { x: number; z: number } | null;
    /** Vlastní výprava ve scéně: sedlá, sesedá, noví lidé se připojují, jede, přijíždí; žádná – null. */
    phase: 'saddling' | 'unsaddling' | 'joining' | 'riding' | 'arriving' | null;
    /** Koně bez jezdce mezi ohradou a jezdcem (sedlání, sesednutí, příjezd). */
    led: { x: number; z: number }[];
    /** Vesničan, který vede koně (sedlání, sesednutí, příjezd); žádný – null. */
    groom: { x: number; z: number } | null;
    /** Brána dvorce, kudy výjezd vyjíždí; ves bez cvičiště – null. */
    gate: { x: number; z: number } | null;
    /** Id koní, které ohrada teď nekreslí (na jízdě, na výjezdu, cestou mezi ohradou a kůlem). */
    awayHorses: number[];
    /** Kroužek výběru pod vybraným mužem výjezdu (jede s ním); nikdo vybraný na výjezdu – null. */
    selected: { x: number; z: number } | null;
  };
  /**
   * Mlha cizí mapy výjezdu i tažení v bodě (x, z) (journey.md – Scéna cizí mapy): neobjevené,
   * objevené (šeré), v dohledu jezdců nebo vojska; bez závoje null.
   */
  journeyFog?: (x: number, z: number) => 'hidden' | 'explored' | 'seen' | null;
  /** Obydlí a staveniště cizí vsi, která scéna cizí mapy výjezdu nebo tažení kreslí (id, poloha). */
  foreignVillage?: () => { dwellings: { id: number; built: boolean; x: number; z: number }[] };
  /**
   * Posune kameru nad bod krajiny (x, z) – zvěř bývá u lesa mimo výchozí záběr; `radiusM` – vzdálenost
   * kamery (scéna cizí mapy výjezdu – snímek mlhy).
   */
  moveCameraTo?: (x: number, z: number, radiusM?: number) => void;
  /**
   * Pošle požadavek na trasy vozů tím samým routerem jako hra (Web Worker, jinak hlavní vlákno);
   * null – mezitím přišel novější požadavek (router platí jen pro poslední).
   */
  cartRoutes?: (request: CartRoutesRequest) => Promise<CartRoutesResult | null>;
  /** Zeptá se na ves hned (dotazování jinak čeká na další herní den – v testech ≈ 86 s). */
  pollVillage?: () => void;
  /** Vybere člověka vsi (id), jako by hráč klikl na jeho postavu – postavy ve scéně chodí. */
  selectPerson?: (id: number) => void;
  /** Vybere víc lidí vsi najednou (výsledek Shift + kliku) – postavy chodí a v e2e bývají uvnitř domů. */
  selectPeople?: (ids: readonly number[]) => void;
  /** Postava člověka vsi (id) na obrazovce v CSS px, nebo null, když není vidět – kam kliknout (i se Shiftem). */
  personOnScreen?: (id: number) => { x: number; y: number } | null;
  /** Vybere cestu hráče (id kteréhokoli úseku) – úzký pás cesty se v softwarovém kreslení špatně trefuje. */
  selectRoad?: (id: number) => void;
  /** Lomené čáry zvýraznění výběru na zemi (x, z) – co scéna právě kreslí; nic nevybráno – []. */
  selectionOutline?: () => (readonly [number, number])[][];
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
