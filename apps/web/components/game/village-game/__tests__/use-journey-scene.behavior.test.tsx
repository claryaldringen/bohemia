// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpeditionView } from '@/lib/journey-view';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { useJourneyScene } from '../use-journey-scene';

// Lov ve scéně vsi (plán 2026-11-22-hunting – Úloha 10; závěrečná kontrola B – Important 1): nový
// pohled `own` každý takt lovu scéně lov jen předá – `setHunt(null)` by zahodil plynulý pohyb
// zvířete a prach zásahu a ves by se přestavěla. Lov ze scény zmizí až s odpojením.

vi.mock('@/hooks/use-journey-visitors', () => ({ useJourneyVisitors: (): unknown[] => [] }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setHunt = vi.fn();
const scene = {
  setJourneys: vi.fn(),
  setHunt,
  journeyStats: vi.fn(),
} as unknown as LandscapeScene;
let root: Root;

/** Pohled na výpravu vsi `v1` s lovem v taktu `tick` – jelen utíká na východ. */
function view(tick: number): ExpeditionView {
  return {
    journeyId: 'j1',
    villageId: 'v1',
    tick,
    day: 7,
    home: { x: 0, y: 0 },
    homePos: { x: 5, z: 5 },
    parties: [],
    seen: {},
    hunt: {
      quarry: {
        kind: 'stag',
        pos: { x: tick, z: 0 },
        heading: { x: 1, z: 0 },
        state: 'flee',
        hits: 0,
      },
      beaters: {
        from: { x: 5, z: 5 },
        door: { x: -95, z: 5 },
        startTick: 0,
        arriveTick: 40,
        end: null,
        homeTick: null,
      },
      dogs: 2,
      strikers: [],
      outcome: 'ongoing',
      tick,
    },
  };
}

function Probe({ own }: { own: readonly ExpeditionView[] }): null {
  useJourneyScene({ scene, villageId: 'v1', cell: { x: 0, y: 0 }, own });
  return null;
}

function show(own: readonly ExpeditionView[]): void {
  act(() => root.render(<Probe own={own} />));
}

beforeEach(() => {
  setHunt.mockClear();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('useJourneyScene – lov ve scéně', () => {
  it('nový pohled každý takt lov jen předá, setHunt(null) až při odpojení – jednou', () => {
    show([view(100)]);
    show([view(101)]);
    show([view(102)]);
    expect(setHunt).toHaveBeenCalledTimes(3);
    expect(setHunt).not.toHaveBeenCalledWith(null);
    expect(setHunt).toHaveBeenLastCalledWith(
      expect.objectContaining({ journeyId: 'j1', tick: 102 }),
    );
    act(() => root.unmount());
    expect(setHunt).toHaveBeenCalledTimes(4);
    expect(setHunt).toHaveBeenLastCalledWith(null);
    expect(setHunt.mock.calls.filter(([hunt]) => hunt === null)).toHaveLength(1);
    // úklid po testu odpojí znovu – kořen už je prázdný
    root = createRoot(document.createElement('div'));
  });

  it('lov skončil (pohled bez lovu) – scéna dostane null z pohledu, ne z úklidu', () => {
    show([view(100)]);
    show([{ ...view(101), hunt: null }]);
    expect(setHunt.mock.calls.map(([hunt]) => (hunt === null ? null : 'hunt'))).toEqual([
      'hunt',
      null,
    ]);
  });
});
