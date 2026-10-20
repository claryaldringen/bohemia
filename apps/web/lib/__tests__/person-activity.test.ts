import { describe, expect, it } from 'vitest';
import { personActivity, type PersonFigureState } from '../person-activity';
import { selectionDetails } from '../selection-details';
import { presentTarget } from '../scene/village-selection';
import type { PersonJob } from '../scene/villager-roster';
import type { SceneVillage } from '../village-view';

// Panel postavy (villagers.md – Výběr postavy): kdo to je a co právě dělá.

const VILLAGE: SceneVillage = {
  dwellings: [
    { id: 2, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    {
      id: 9,
      type: 'zemnice',
      craft: 'burner',
      position: { x: 30, z: 0, rotation: 0 },
      built: true,
      progress: 1,
    },
    {
      id: 90,
      type: 'polozemnice',
      position: { x: 0, z: 30, rotation: 0 },
      built: false,
      progress: 0.2,
    },
  ],
  fields: [],
  kilns: [{ id: 800, burnerId: 9, x: 60, z: 10, stage: 'build', progress: 0.4 }],
  labor: {
    day: 1000,
    month: 7,
    people: { children: 1, adults: 2, elders: 0 },
    shares: [],
    persons: [
      { id: 202, age: 28, sex: 'female', home: 2, role: 'farmer-wife' },
      { id: 204, age: 10, sex: 'male', home: 2, role: 'farmer-son' },
      { id: 901, age: 36, sex: 'male', home: 9, role: 'burner' },
    ],
  },
};

const state = (
  job: PersonJob | null,
  over: Partial<PersonFigureState> = {},
): PersonFigureState => ({ id: 202, job, stage: null, hidden: false, herd: null, ...over });

describe('personActivity – co postava dělá', () => {
  it('pro vodu tam a zpět, doma mezi pochůzkami, bez postavy doma', () => {
    const water: PersonJob = { kind: 'traffic', traffic: 'water' };
    expect(personActivity(state(water, { stage: 'out' }), VILLAGE)).toBe('jde pro vodu');
    expect(personActivity(state(water, { stage: 'back' }), VILLAGE)).toBe('nese vodu');
    expect(personActivity(state(water, { stage: 'rest', hidden: true }), VILLAGE)).toBe('doma');
    expect(personActivity(state(null), VILLAGE)).toBe('doma');
    expect(personActivity(null, VILLAGE)).toBe('doma');
  });

  it('práce dne: stavba podle staveniště, uhlíř u milíře podle fáze, setí, kácení', () => {
    const share = (activity: PersonJob & { kind: 'share' }): string =>
      personActivity(state(activity), VILLAGE);
    expect(share({ kind: 'share', activity: 'build', target: { kind: 'site', id: 90 } })).toBe(
      'staví polozemnici',
    );
    expect(
      share({
        kind: 'share',
        activity: 'craft',
        target: { kind: 'kiln', id: 9, x: 60, z: 10, kiln: 800 },
      }),
    ).toBe('staví milíř');
    expect(share({ kind: 'share', activity: 'sow', target: { kind: 'field', id: 1 } })).toBe(
      'seje',
    );
    expect(share({ kind: 'share', activity: 'fell', target: { kind: 'trees', ids: [1] } })).toBe(
      'kácí strom',
    );
    expect(share({ kind: 'share', activity: 'idle', target: { kind: 'village' } })).toBe(
      'odpočívá',
    );
  });

  it('nosič kováře, pasák, karavana pro kování, pohřeb', () => {
    expect(
      personActivity(state({ kind: 'fetch', goods: 'charcoal' }, { stage: 'back' }), VILLAGE),
    ).toBe('nese uhlí od uhlíře');
    expect(personActivity(state({ kind: 'herd', herd: 0 }, { herd: 'sheep' }), VILLAGE)).toBe(
      'pase ovce',
    );
    const iron: PersonJob = {
      kind: 'caravan',
      trip: { kind: 'iron', to: 'Olšany', travellerId: 202 },
      porter: false,
    };
    expect(personActivity(state(iron, { stage: 'out' }), VILLAGE)).toBe(
      'jde do vesnice Olšany pro kování k vozu',
    );
    expect(personActivity(state(iron, { hidden: true }), VILLAGE)).toBe(
      'pryč – ve vesnici Olšany pro kování k vozu',
    );
    expect(personActivity(state({ kind: 'funeral', bearer: false }), VILLAGE)).toBe(
      'jde v pohřebním průvodu',
    );
    expect(
      personActivity(state({ kind: 'funeral', bearer: false }, { stage: 'home' }), VILLAGE),
    ).toBe('vrací se domů');
  });
});

describe('selectionDetails – postava', () => {
  it('role, portrét, věk, dům; výrostek, který pase, je pasáček', () => {
    const target = { kind: 'person', id: 202 } as const;
    const details = selectionDetails(
      null,
      VILLAGE,
      target,
      state({ kind: 'traffic', traffic: 'water' }, { stage: 'out' }),
    );
    expect(details).toMatchObject({
      kind: 'person',
      role: 'Žena rolníka',
      portrait: 'woman',
      activity: 'jde pro vodu',
      age: 28,
      home: 2,
      homeIcon: 'zemnice',
    });
    const boy = selectionDetails(
      null,
      VILLAGE,
      { kind: 'person', id: 204 },
      { id: 204, job: { kind: 'herd', herd: 0 }, stage: null, hidden: false, herd: 'pig' },
    );
    expect(boy).toMatchObject({ role: 'Pasáček', portrait: 'child', herd: 'pig' });
    // stav jiného člověka se nepočítá – doma
    expect(selectionDetails(null, VILLAGE, { kind: 'person', id: 901 }, state(null))).toMatchObject(
      { role: 'Uhlíř', activity: 'doma', homeIcon: 'uhlir' },
    );
  });

  it('výběr zůstane, i když postava zmizí; zemřelý člověk výběr zruší', () => {
    const target = { kind: 'person', id: 202 } as const;
    expect(presentTarget(VILLAGE, target)).toBe(target);
    const gone: SceneVillage = {
      ...VILLAGE,
      labor: { ...VILLAGE.labor!, persons: VILLAGE.labor!.persons!.slice(1) },
    };
    expect(presentTarget(gone, target)).toBeNull();
  });
});
