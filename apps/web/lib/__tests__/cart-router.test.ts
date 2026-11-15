import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Landscape } from '@bohemia/game';
import type { CartRoutesRequest, CartRoutesResult } from '../cart-routes';
import type { LandscapeTransfer } from '../landscape-transfer';

const LOCAL: CartRoutesResult = { carts: [[{ x: 1, z: 2 }]] } as unknown as CartRoutesResult;
const cartRoutesOf = vi.fn((): CartRoutesResult => LOCAL);
vi.mock('../cart-routes', () => ({ cartRoutesOf: (): CartRoutesResult => cartRoutesOf() }));

import { cartRouter } from '../cart-router';

/** Worker, který zprávy přijme, ale nikdy neodpoví (zaseknutý nebo rozbitý bez `error`). */
class SilentWorker {
  static created = 0;
  static terminated = 0;
  static last: SilentWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    SilentWorker.created++;
    SilentWorker.last = this;
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

describe('cartRouter – platí jen poslední požadavek (D63)', () => {
  it('mlčící Worker: dřívější požadavek skončí null s novějším, nic se nepočítá v hlavním vlákně', async () => {
    const r = router();
    const first = r.routes(REQUEST);
    const second = r.routes(REQUEST);
    await expect(first).resolves.toBeNull();
    let last: CartRoutesResult | null | undefined;
    void second.then((value) => (last = value));
    // žádný časový limit – na trasy nic nečeká, takže Worker může mlčet libovolně dlouho
    await vi.advanceTimersByTimeAsync(60_000);
    expect(last).toBeUndefined();
    r.dispose();
    await expect(second).resolves.toBeNull();
    expect(cartRoutesOf).not.toHaveBeenCalled();
    expect(SilentWorker.created).toBe(1);
    expect(SilentWorker.terminated).toBe(1);
  });

  it('chyba Workeru: čekající i další požadavky spočítá hlavní vlákno', async () => {
    const r = router();
    const pending = r.routes(REQUEST);
    const worker = SilentWorker.last!;
    worker.onerror?.({ message: 'rozbitý' } as ErrorEvent);
    await expect(pending).resolves.toBe(LOCAL);
    await expect(r.routes(REQUEST)).resolves.toBe(LOCAL);
    expect(SilentWorker.created).toBe(1);
    expect(cartRoutesOf).toHaveBeenCalledTimes(2);
  });
});
