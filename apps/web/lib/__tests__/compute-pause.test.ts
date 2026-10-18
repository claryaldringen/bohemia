import { describe, expect, it } from 'vitest';
import { computePause } from '../compute-pause';

describe('computePause', () => {
  it('pokračuje hned, dokud nepočítá déle než kousek; pak počká a měří znovu', async () => {
    let clock = 0;
    let yields = 0;
    const pause = computePause(
      50,
      () => clock,
      async () => {
        yields++;
      },
    );
    clock = 30;
    expect(pause()).toBeNull();
    clock = 55;
    const wait = pause();
    expect(wait).not.toBeNull();
    await wait;
    expect(yields).toBe(1);
    clock = 90;
    expect(pause()).toBeNull();
    clock = 106;
    await pause();
    expect(yields).toBe(2);
  });

  it('opravdu pustí ke slovu jinou práci (setImmediate)', async () => {
    let clock = 0;
    const pause = computePause(10, () => clock);
    let other = false;
    setImmediate(() => {
      other = true;
    });
    clock = 20;
    await pause();
    expect(other).toBe(true);
  });
});
