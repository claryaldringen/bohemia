import { describe, expect, it } from 'vitest';
import { journeyActivity, personActivity, type PersonFigureState } from '../person-activity';
import type { LodgeView } from '../person-view';
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
    // bourání (demolition.md – Bourání): práce u stavby bourání podle toho, co se boří
    const demolishing = (d: NonNullable<SceneVillage['demolitions']>): string =>
      personActivity(
        state({ kind: 'share', activity: 'build', target: { kind: 'site', id: 95 } }),
        { ...VILLAGE, demolitions: d },
      );
    expect(demolishing([{ id: 95, structure: 'dwelling', targetId: 1, type: 'zemnice' }])).toBe(
      'bourá zemnici',
    );
    expect(
      demolishing([
        { id: 95, structure: 'dwelling', targetId: 1, type: 'zemnice', craft: 'smith' },
      ]),
    ).toBe('bourá kovárnu');
    expect(demolishing([{ id: 95, structure: 'pen', targetId: 1 }])).toBe('bourá ohradu');
    expect(demolishing([{ id: 95, structure: 'shrine', targetId: 1 }])).toBe('bourá svatyni');
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
    expect(personActivity(state({ kind: 'funeral', bearer: true }), VILLAGE)).toBe('nese máry');
    expect(
      personActivity(state({ kind: 'funeral', bearer: true }, { stage: 'ring' }), VILLAGE),
    ).toBe('stojí u pohřební hranice');
  });

  it('svatba (kinship.md – Svatba ve scéně): jde na svatbu, je oddávána, stojí u obřadu, domů', () => {
    const guest: PersonJob = { kind: 'wedding', role: 'guest' };
    expect(personActivity(state(guest), VILLAGE)).toBe('jde na svatbu');
    expect(personActivity(state(guest, { stage: 'wait' }), VILLAGE)).toBe('jde na svatbu');
    expect(personActivity(state(guest, { stage: 'ring' }), VILLAGE)).toBe('stojí u obřadu');
    expect(personActivity(state(guest, { stage: 'home' }), VILLAGE)).toBe('vrací se ze svatby');
    expect(
      personActivity(state({ kind: 'wedding', role: 'bride' }, { stage: 'ring' }), VILLAGE),
    ).toBe('je oddávána');
    expect(
      personActivity(state({ kind: 'wedding', role: 'groom' }, { stage: 'ring' }), VILLAGE),
    ).toBe('je oddáván');
    expect(
      personActivity(state({ kind: 'wedding', role: 'bride' }, { stage: 'home' }), VILLAGE),
    ).toBe('vrací se ze svatby');
    expect(personActivity(state(guest, { hidden: true }), VILLAGE)).toBe('doma');
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

  it('člověk ve skupině výpravy: činnost podle jeho skupiny', () => {
    const parties = [
      {
        id: 0,
        phase: 'out',
        waitDaysLeft: 2,
        horseWork: null,
        groups: [],
        people: [{ personId: 202 }],
      },
      {
        id: 1,
        phase: 'returning',
        waitDaysLeft: null,
        horseWork: null,
        groups: [],
        people: [{ personId: 901 }],
      },
    ] as unknown as Parameters<typeof selectionDetails>[5];
    const on = selectionDetails(null, VILLAGE, { kind: 'person', id: 202 }, null, null, parties);
    expect(on).toMatchObject({ activity: 'čeká (2 dny)' });
    const back = selectionDetails(null, VILLAGE, { kind: 'person', id: 901 }, null, null, parties);
    expect(back).toMatchObject({ activity: 'vrací se domů' });
    // člověk mimo skupiny – obvyklá činnost
    const off = selectionDetails(null, VILLAGE, { kind: 'person', id: 901 }, null, null, []);
    expect(off).toMatchObject({ activity: 'doma' });
  });

  it('huť: mistr nese obor a okruh, kněz příznak, vojvoda stav huti', () => {
    const lodge: LodgeView = {
      invite: 'already',
      circle: 'adriatic',
      daysToArrival: 3,
      missing: [],
    };
    const village: SceneVillage = {
      ...VILLAGE,
      labor: {
        ...VILLAGE.labor!,
        persons: [
          {
            id: 1,
            age: 30,
            sex: 'male',
            home: 2,
            role: 'farmer',
            mason: 'builder',
            lodgeCircle: 'adriatic',
          },
          { id: 2, age: 40, sex: 'male', home: 2, role: 'farmer', priest: true },
          { id: 3, age: 45, sex: 'male', home: 2, role: 'voivode', lodge },
          { id: 4, age: 20, sex: 'male', home: 2, role: 'farmer' },
        ],
      },
    };
    const details = (id: number): ReturnType<typeof selectionDetails> =>
      selectionDetails(null, village, { kind: 'person', id }, null);
    expect(details(1)).toMatchObject({ mason: 'builder', lodgeCircle: 'adriatic', lodge: null });
    expect(details(2)).toMatchObject({ priest: true, mason: null });
    expect(details(3)).toMatchObject({ lodge, mason: null, priest: false });
    expect(details(4)).toMatchObject({ mason: null, priest: false, lodge: null });
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

// Panel vojvody a synů (lord.md – Ve scéně): věta podle toho, co postava v den rodiny právě dělá
// (lord-day.ts – úsek dne v `stage`), ne vždy „cvičí lukostřelbu“.
describe('vojvodova rodina – co právě dělá', () => {
  const lord = (stage: PersonFigureState['stage'], hidden = false): string =>
    personActivity(
      { id: 101, job: { kind: 'lord', household: false }, stage, hidden, herd: null },
      VILLAGE,
    );
  it('jde, stojí u dvorce, cvičí, u koně, jede, u manželky', () => {
    expect(lord('bow')).toBe('cvičí lukostřelbu');
    expect(lord('combat')).toBe('cvičí boj');
    expect(lord('out')).toBe('jde na cvičiště');
    expect(lord('back')).toBe('jde ke dvorci');
    expect(lord('rest')).toBe('stojí u dvorce');
    expect(lord('hitch')).toBe('jde ke koni');
    expect(lord('wait')).toBe('čeká u koně');
    expect(lord('ride')).toBe('jede na koni');
    expect(lord('hunt')).toBe('je na lovu');
    expect(lord('visit')).toBe('jde za manželkou');
    expect(lord('visit', true)).toBe('je u manželky');
    expect(lord(null, true)).toBe('doma');
  });
});

describe('journeyActivity (skupina výpravy)', () => {
  it('jede = „je na cestě“, na místě „čeká (N dny)“, domů „vrací se domů“', () => {
    expect(journeyActivity({ phase: 'out', waitDaysLeft: null })).toBe('je na cestě');
    expect(journeyActivity({ phase: 'out', waitDaysLeft: 2 })).toBe('čeká (2 dny)');
    expect(journeyActivity({ phase: 'out', waitDaysLeft: 3 })).toBe('čeká (3 dny)');
    expect(journeyActivity({ phase: 'out', waitDaysLeft: 1 })).toBe('čeká (1 den)');
    expect(journeyActivity({ phase: 'returning', waitDaysLeft: null })).toBe('vrací se domů');
  });
});
