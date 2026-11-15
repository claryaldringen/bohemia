// Stojící stavby do kroniky nepatří (Martin 15. 11. 2026: „Ano, vypusť to“) – upozornění zůstává.
import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { shownInChronicle } from '../chronicle-view';

describe('kronika – stojící stavby', () => {
  it('začátek a konec stojících staveb panel neukazuje', () => {
    const began: ChronicleEvent = { day: 10, kind: 'notice-began', notice: 'stalled' };
    const ended: ChronicleEvent = { day: 20, kind: 'notice-ended', notice: 'stalled' };
    expect(shownInChronicle(began)).toBe(false);
    expect(shownInChronicle(ended)).toBe(false);
  });

  it('jiné trvalé stavy vsi zůstávají', () => {
    const other: ChronicleEvent = { day: 10, kind: 'notice-began', notice: 'rationing' };
    expect(shownInChronicle(other)).toBe(true);
  });
});
