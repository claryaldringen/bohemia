// Kronika plánu 5 (markets.md – Rozhodnutí plánu 5, bod 1 a 11): odvedení z tažení – otroci a křesťané.
import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

const text = (event: Record<string, unknown>): string =>
  chronicleText({ day: 100, ...event } as unknown as ChronicleEvent, 'Vlkov', 7);

describe('kronika – odvedení z tažení', () => {
  it('otroci a křesťané v 4. pádě, nulová část se vynechá', () => {
    const led = (slaves: number, free: number): string =>
      text({ kind: 'led-settled', slaves, free });
    expect(led(3, 1)).toBe('Z tažení přivedli 3 otroky a 1 křesťana.');
    expect(led(1, 0)).toBe('Z tažení přivedli 1 otroka.');
    expect(led(5, 0)).toBe('Z tažení přivedli 5 otroků.');
    expect(led(0, 2)).toBe('Z tažení přivedli 2 křesťany.');
    expect(led(0, 5)).toBe('Z tažení přivedli 5 křesťanů.');
  });
});
