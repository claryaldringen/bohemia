// Trasy vozů a spřežení mimo hlavní vlákno prohlížeče (cart-routes.ts – `cartRoutesOf`): mřížka
// vozu se u velké vsi po kácení staví znovu až ≈ 250 ms, scéna by po dobu výpočtu stála. Worker
// dostane krajinu jednou (`landscape`) a pak požadavky po dnech; paměť mřížek (`cartWorldRoutes`)
// žije v něm. Výsledek je tentýž jako v hlavním vlákně – stejná deterministická funkce.
import type { Landscape } from '@bohemia/game';
import { cartRoutesOf, type CartRoutesRequest, type CartRoutesResult } from './cart-routes';
import { decodeLandscape, type LandscapeTransfer } from './landscape-transfer';

export type CartRoutesMessage =
  | { kind: 'landscape'; landscape: LandscapeTransfer }
  | { kind: 'routes'; id: number; request: CartRoutesRequest };

export type CartRoutesReply =
  { id: number; result: CartRoutesResult } | { id: number; error: string };

let landscape: Landscape | null = null;

self.onmessage = (event: MessageEvent<CartRoutesMessage>): void => {
  const message = event.data;
  if (message.kind === 'landscape') {
    landscape = decodeLandscape(message.landscape);
    return;
  }
  let reply: CartRoutesReply;
  try {
    if (!landscape) throw new Error('Worker tras nemá krajinu.');
    reply = { id: message.id, result: cartRoutesOf(message.request, landscape) };
  } catch (error) {
    reply = { id: message.id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};
