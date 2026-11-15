// Výpočet tras vozů a spřežení ve Web Workeru (cart-routes.worker.ts), aby scéna při novém dni
// nestála (u Vlkova 150–250 ms za den v hlavním vlákně). Kde Worker není (testy, starý prohlížeč)
// nebo selže, spočítá se totéž v hlavním vlákně – výsledek je stejný, jen to chvíli trvá.
import type { Landscape } from '@bohemia/game';
import { cartRoutesOf, type CartRoutesRequest, type CartRoutesResult } from './cart-routes';
import type { CartRoutesMessage, CartRoutesReply } from './cart-routes.worker';
import type { LandscapeTransfer } from './landscape-transfer';

export interface CartRouter {
  /** Trasy k požadavku (ve Workeru, jinak v hlavním vlákně); pořadí odpovědí = pořadí požadavků. */
  routes(request: CartRoutesRequest): Promise<CartRoutesResult>;
  /** Ukončí Worker (nová krajina, odchod ze hry). */
  dispose(): void;
}

/**
 * Nejdéle čekání na odpověď Workeru (ms). Worker, který mlčí (zaseknutý, nebo po výměně kódu ve
 * vývoji bez chyby `error`), by jinak navždy zastavil použití pohledu na ves – a s ním frontu akcí
 * (další stavba se neodešle) i dotazování na ves (D60, 15. 11. 2026). Pak počítá hlavní vlákno.
 */
export const CART_ROUTES_TIMEOUT_MS = 5_000;

export function cartRouter(transfer: LandscapeTransfer, landscape: Landscape): CartRouter {
  let worker: Worker | null = null;
  let broken = typeof Worker === 'undefined';
  let nextId = 0;
  const waiting = new Map<
    number,
    {
      request: CartRoutesRequest;
      resolve: (r: CartRoutesResult) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const local = (request: CartRoutesRequest): CartRoutesResult => cartRoutesOf(request, landscape);
  // Worker selhal – čekající požadavky (a všechny další) se spočítají v hlavním vlákně
  const fallBack = (reason: unknown): void => {
    if (!broken) console.error('Worker tras vozů selhal, trasy počítá hlavní vlákno.', reason);
    broken = true;
    worker?.terminate();
    worker = null;
    for (const [id, w] of waiting) {
      waiting.delete(id);
      clearTimeout(w.timer);
      w.resolve(local(w.request));
    }
  };
  const start = (): Worker | null => {
    try {
      const created = new Worker(new URL('./cart-routes.worker.ts', import.meta.url), {
        type: 'module',
      });
      created.onmessage = (event: MessageEvent<CartRoutesReply>): void => {
        const reply = event.data;
        const w = waiting.get(reply.id);
        if (!w) return;
        waiting.delete(reply.id);
        clearTimeout(w.timer);
        w.resolve('result' in reply ? reply.result : local(w.request));
      };
      created.onerror = (event): void => fallBack(event.message);
      created.postMessage({ kind: 'landscape', landscape: transfer } satisfies CartRoutesMessage);
      return created;
    } catch (error) {
      fallBack(error);
      return null;
    }
  };
  return {
    routes(request) {
      if (!broken && !worker) worker = start();
      const target = worker;
      if (broken || !target) return Promise.resolve(local(request));
      const id = ++nextId;
      return new Promise((resolve) => {
        // mlčící Worker: tento i další požadavky spočítá hlavní vlákno (`CART_ROUTES_TIMEOUT_MS`)
        const timer = setTimeout(
          () => fallBack(`bez odpovědi do ${CART_ROUTES_TIMEOUT_MS} ms`),
          CART_ROUTES_TIMEOUT_MS,
        );
        waiting.set(id, { request, resolve, timer });
        target.postMessage({ kind: 'routes', id, request } satisfies CartRoutesMessage);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const [id, w] of waiting) {
        waiting.delete(id);
        clearTimeout(w.timer);
        w.resolve(local(w.request));
      }
    },
  };
}
