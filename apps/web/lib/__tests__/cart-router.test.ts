import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Landscape } from '@bohemia/game';
import type { CartRoutesRequest, CartRoutesResult } from '../cart-routes';
import type { LandscapeTransfer } from '../landscape-transfer';

const LOCAL: CartRoutesResult = { carts: [[{ x: 1, z: 2 }]] } as unknown as CartRoutesResult;
const cartRoutesOf = vi.fn((): CartRoutesResult => LOCAL);
vi.mock('../cart-routes', () => ({ cartRoutesOf: (): CartRoutesResult => cartRoutesOf() }));

import { CART_ROUTES_TIMEOUT_MS, cartRouter } from '../cart-router';

/** Worker, který zprávy přijme, ale nikdy neodpoví (zaseknutý nebo rozbitý bez `error`). */
class SilentWorker {
  static created = 0;
  static terminated = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    SilentWorker.created++;
  }
  postMessage(): void {}
  terminate(): void {
    SilentWorker.terminated++;
  }
}

const REQUEST = {} as CartRoutesRequest;
const router = (): ReturnType<typeof cartRouter> =>
  cartRouter({} as LandscapeTransfer, {} as Landscape);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('Worker', SilentWorker);
  SilentWorker.created = 0;
  SilentWorker.terminated = 0;
  cartRoutesOf.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cartRouter – Worker bez odpovědi (D60)', () => {
  it('po CART_ROUTES_TIMEOUT_MS spočítá trasy hlavní vlákno – pohled ani fronta akcí nestojí', async () => {
    const r = router();
    let result: CartRoutesResult | null = null;
    void r.routes(REQUEST).then((value) => (result = value));
    await vi.advanceTimersByTimeAsync(CART_ROUTES_TIMEOUT_MS - 1);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(LOCAL);
    expect(SilentWorker.terminated).toBe(1);
  });

  it('další požadavky po mlčícím Workeru jdou rovnou do hlavního vlákna', async () => {
    const r = router();
    const first = r.routes(REQUEST);
    await vi.advanceTimersByTimeAsync(CART_ROUTES_TIMEOUT_MS);
    await expect(first).resolves.toBe(LOCAL);
    await expect(r.routes(REQUEST)).resolves.toBe(LOCAL);
    expect(SilentWorker.created).toBe(1);
    expect(cartRoutesOf).toHaveBeenCalledTimes(2);
  });
});
