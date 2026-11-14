import { describe, expect, it } from 'vitest';
import { journeyMarks } from '../journey-marker';
import type { SceneJourney } from '../journey-riders';

// Praporek cíle výjezdu (lord-control.md – Co hráč vidí; journey.md – Scéna vsi).

function journey(over: Partial<SceneJourney> = {}): SceneJourney {
  return {
    journeyId: 'j1',
    own: true,
    leader: 'Bořivoj',
    house: 'Kněžičtí',
    tick: 1,
    pos: { x: 0, z: 0 },
    goal: { x: 40, z: 5 },
    men: [{ key: '1', personId: 1, lord: true, mounted: true, wounded: false }],
    arrived: false,
    phase: 'out',
    waitDaysLeft: null,
    home: null,
    ...over,
  };
}

describe('journeyMarks', () => {
  it('praporek na cíli vlastního výjezdu, který jede ven', () => {
    expect(journeyMarks([journey()])).toEqual({ goal: { x: 40, z: 5 } });
  });

  it('čekající skupina má praporek dál, hodiny nad ní nejsou (Martin 14. 11. 2026)', () => {
    const marks = journeyMarks([journey({ arrived: true, pos: { x: 40, z: 5 }, waitDaysLeft: 2 })]);
    expect(marks).toEqual({ goal: { x: 40, z: 5 } });
  });

  it('cizí výjezd, návrat domů a cíl na jiné mapě praporek nemají', () => {
    expect(journeyMarks([journey({ own: false, phase: null })])).toEqual({ goal: null });
    expect(journeyMarks([journey({ phase: 'returning' })]).goal).toBeNull();
    expect(journeyMarks([journey({ goal: null })]).goal).toBeNull();
    expect(journeyMarks([])).toEqual({ goal: null });
  });
});
