import { describe, expect, it } from 'vitest';
import { journeyMarks, partyKeyOf, selectedPartyKeys } from '../journey-marker';
import type { SceneJourney } from '../journey-riders';

// Praporek cíle vybrané skupiny (expeditions.md – Ve scéně; journey.md – Scéna vsi).

function journey(over: Partial<SceneJourney> = {}): SceneJourney {
  return {
    journeyId: 'j1:0',
    partyId: 1,
    own: true,
    leader: 'Bořivoj',
    house: 'Kněžičtí',
    tick: 1,
    pos: { x: 0, z: 0 },
    goal: { x: 40, z: 5 },
    men: [
      {
        key: '1',
        personId: 1,
        lord: true,
        mounted: true,
        wounded: false,
        look: 'line',
        led: false,
      },
    ],
    arrived: false,
    phase: 'out',
    waitDaysLeft: null,
    home: null,
    ...over,
  };
}

const picked = new Set(['j1:1']);

describe('journeyMarks', () => {
  it('praporek na cíli vybrané skupiny, která jede ven', () => {
    expect(journeyMarks([journey()], picked)).toEqual({ goal: { x: 40, z: 5 } });
  });

  it('dvě skupiny, vybraná jedna – jeden praporek; bez výběru žádný', () => {
    const a = journey();
    const b = journey({ journeyId: 'j1:1', partyId: 2, goal: { x: -30, z: 8 } });
    expect(journeyMarks([a, b], picked)).toEqual({ goal: { x: 40, z: 5 } });
    expect(journeyMarks([a, b], new Set(['j1:2']))).toEqual({ goal: { x: -30, z: 8 } });
    expect(journeyMarks([a, b], new Set())).toEqual({ goal: null });
  });

  it('čekající skupina má praporek dál, hodiny nad ní nejsou (Martin 14. 11. 2026)', () => {
    const waiting = journey({ arrived: true, pos: { x: 40, z: 5 }, waitDaysLeft: 2 });
    expect(journeyMarks([waiting], picked)).toEqual({ goal: { x: 40, z: 5 } });
  });

  it('cizí výjezd, návrat domů a cíl na jiné mapě praporek nemají', () => {
    expect(journeyMarks([journey({ own: false, phase: null })], picked)).toEqual({ goal: null });
    expect(journeyMarks([journey({ phase: 'returning' })], picked).goal).toBeNull();
    expect(journeyMarks([journey({ goal: null })], picked).goal).toBeNull();
    expect(journeyMarks([], picked)).toEqual({ goal: null });
  });
});

describe('skupina vybraných lidí', () => {
  it('klíč skupiny je výprava a skupina bez čísla hloučku', () => {
    expect(partyKeyOf(journey())).toBe('j1:1');
    expect(partyKeyOf(journey({ partyId: undefined }))).toBeNull();
  });

  it('vybraný člověk vlastního hloučku vybírá jeho skupinu, cizí ne', () => {
    const j = journey();
    expect([...selectedPartyKeys([j], [1])]).toEqual(['j1:1']);
    expect(selectedPartyKeys([j], [2]).size).toBe(0);
    expect(selectedPartyKeys([{ ...j, own: false }], [1]).size).toBe(0);
    expect(selectedPartyKeys([j], []).size).toBe(0);
  });
});
