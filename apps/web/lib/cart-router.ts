// Výpočet tras vozů a spřežení ve Web Workeru (cart-routes.worker.ts), aby scéna při novém dni
// nestála (u Vlkova 150–250 ms za den v hlavním vlákně). Kde Worker není (testy, starý prohlížeč)
// nebo selže, spočítá se totéž v hlavním vlákně – výsledek je stejný, jen to chvíli trvá.
// Na trasy nic nečeká (D63): pohled vsi se použije hned s posledními známými trasami
// (`carriedCartRoutes`) a nové trasy scéna dostane, až dojdou – Worker, který mlčí, tak nezastaví
// frontu akcí ani dotazování na ves, jen vozy zůstanou u posledních tras.
import type { Landscape } from '@bohemia/game';
import { cartRoutesOf, type CartRoutesRequest, type CartRoutesResult } from './cart-routes';
import type { CartRoutesMessage, CartRoutesReply } from './cart-routes.worker';
import type { LandscapeTransfer } from './landscape-transfer';

export interface CartRouter {
  /**
   * Trasy k požadavku (ve Workeru, jinak v hlavním vlákně). Platí jen poslední požadavek – scéna
   * chce trasy nejnovějšího pohledu: dřívější, na který Worker ještě neodpověděl, skončí `null`;
   * `null` i po `dispose`.
   */
  routes(request: CartRoutesRequest): Promise<CartRoutesResult | null>;
  /** Ukončí Worker (nová krajina, odchod ze hry). */
  dispose(): void;
}

export function cartRouter(transfer: LandscapeTransfer, landscape: Landscape): CartRouter {
  let worker: Worker | null = null;
  let broken = typeof Worker === 'undefined';
  let nextId = 0;
  /** Jediný požadavek, na jehož odpověď se čeká (poslední). */
  let waiting: {
    id: number;
    request: CartRoutesRequest;
    resolve: (r: CartRoutesResult | null) => void;
  } | null = null;
  const local = (request: CartRoutesRequest): CartRoutesResult => cartRoutesOf(request, landscape);
  const settle = (result: (request: CartRoutesRequest) => CartRoutesResult | null): void => {
    const w = waiting;
    waiting = null;
    w?.resolve(result(w.request));
  };
  // Worker selhal – čekající požadavek (a všechny další) se spočítají v hlavním vlákně
  const fallBack = (reason: unknown): void => {
    if (!broken) console.error('Worker tras vozů selhal, trasy počítá hlavní vlákno.', reason);
    broken = true;
    worker?.terminate();
    worker = null;
    settle(local);
  };
  const start = (): Worker | null => {
    try {
      const created = new Worker(new URL('./cart-routes.worker.ts', import.meta.url), {
        type: 'module',
      });
      created.onmessage = (event: MessageEvent<CartRoutesReply>): void => {
        const reply = event.data;
        // odpověď na dřívější požadavek – mezitím přišel novější (ten už dostal `null`)
        if (waiting?.id !== reply.id) return;
        settle((request) => ('result' in reply ? reply.result : local(request)));
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
      // novější požadavek – na dřívější odpověď už nikdo nečeká
      settle(() => null);
      const id = ++nextId;
      return new Promise((resolve) => {
        waiting = { id, request, resolve };
        target.postMessage({ kind: 'routes', id, request } satisfies CartRoutesMessage);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      settle(() => null);
    },
  };
}
