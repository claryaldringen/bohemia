import { describe, expect, it } from 'vitest';
import { hourglassPixels, journeyMarks } from '../journey-marker';
import type { SceneJourney } from '../journey-riders';

// Praporek cíle a přesýpací hodiny výjezdu (lord-control.md – Co hráč vidí; journey.md – Scéna vsi).

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
    expect(journeyMarks([journey()])).toEqual({ goal: { x: 40, z: 5 }, wait: null });
  });

  it('čekající skupina má nad sebou přesýpací hodiny s počtem dní', () => {
    const marks = journeyMarks([journey({ arrived: true, pos: { x: 40, z: 5 }, waitDaysLeft: 2 })]);
    expect(marks.wait).toEqual({ pos: { x: 40, z: 5 }, days: 2 });
    expect(marks.goal).toEqual({ x: 40, z: 5 });
  });

  it('cizí výjezd, návrat domů a cíl na jiné mapě praporek nemají', () => {
    expect(journeyMarks([journey({ own: false, phase: null })])).toEqual({
      goal: null,
      wait: null,
    });
    expect(journeyMarks([journey({ phase: 'returning' })]).goal).toBeNull();
    expect(journeyMarks([journey({ goal: null })]).goal).toBeNull();
    expect(journeyMarks([])).toEqual({ goal: null, wait: null });
  });
});

describe('hourglassPixels', () => {
  const PX = 64;
  const alphaCount = (p: Uint8Array): number => {
    let n = 0;
    for (let i = 3; i < p.length; i += 4) if (p[i]! > 0) n++;
    return n;
  };

  it('RGBA čtverec s hodinami a číslicí – jiný počet dní, jiný obrázek', () => {
    const three = hourglassPixels(3, PX);
    expect(three).toHaveLength(PX * PX * 4);
    expect(alphaCount(three)).toBeGreaterThan(PX * 4);
    expect(alphaCount(three)).toBeLessThan(PX * PX);
    expect(hourglassPixels(1, PX)).not.toEqual(three);
    expect(hourglassPixels(3, PX)).toEqual(three);
  });
});
