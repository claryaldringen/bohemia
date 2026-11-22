import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { partRoom } from '../simulate-plan';

type FrontArg = Parameters<typeof partRoom>[0];

/** Čelo 15. 9. – ozim má okno přípravy půdy otevřené. */
function front(over: Partial<FrontArg>): FrontArg {
  return {
    day: dayIndexOf({ year: 600, month: 9, day: 15 }),
    people: {},
    plough: {},
    peopleRoom: 10,
    ploughRoom: 5,
    ...over,
  };
}

describe('místo na čele pro díl (fields.md – Pořadí dávek)', () => {
  it('díl s klučením stačí místo u lidí, i když spřežení orají naplno', () => {
    const f = front({ people: { winter: 0 }, plough: { winter: 5 } });
    expect(partRoom(f, 'winter', { reclaim: 2 })).toBe(true);
  });

  it('díl bez klučení (louka, díl v osevu) potřebuje místo i u spřežení', () => {
    const full = front({ people: { winter: 0 }, plough: { winter: 5 } });
    expect(partRoom(full, 'winter', { reclaim: 0 })).toBe(false);
    expect(partRoom(front({}), 'winter', { reclaim: 0 })).toBe(true);
  });

  it('lidé plní čelo – nepřibere se žádný díl', () => {
    const f = front({ people: { winter: 10 } });
    expect(partRoom(f, 'winter', { reclaim: 2 })).toBe(false);
    expect(partRoom(f, 'winter', { reclaim: 0 })).toBe(false);
  });
});
