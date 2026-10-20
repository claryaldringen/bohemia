import { describe, expect, it } from 'vitest';
import {
  cartActivityText,
  cartPen,
  crewActivityText,
  sameDraftState,
  teamActivityText,
  teamPen,
  type DraftFigureState,
} from '../draft-activity';
import { personActivity, type PersonFigureState } from '../person-activity';
import { selectionDetails } from '../selection-details';
import { presentTarget } from '../scene/village-selection';
import type { SceneCart, SceneVillage } from '../village-view';

// Panel spřežení s rádlem, vozu a lidí u nich (oxen.md – Výběr spřežení, wagons.md – Výběr vozu,
// villagers.md – Výběr postavy): co dělají, odkud jsou voli a kdo je u nich.

const pen = (id: number, x: number, oxen: number): NonNullable<SceneVillage['pens']>[number] => ({
  id,
  cell: { x: 0, y: 0 },
  x,
  z: 0,
  size: 15,
  built: true,
  progress: 1,
  oxen,
  trainees: 0,
  cows: 0,
});

const charcoal: SceneCart = {
  id: 3,
  kind: 'two-wheel',
  x: 30,
  z: 0,
  condition: 0.8,
  job: { activity: 'haul', target: { kind: 'kiln', id: 800, x: 90, z: 0 }, load: 'goods' },
  route: [
    { x: 30, z: 0 },
    { x: 90, z: 0 },
  ],
};
const parked: SceneCart = { id: 4, kind: 'four-wheel', x: 60, z: 0, condition: 0.4, job: null };
const trade: SceneCart = {
  id: 6,
  kind: 'four-wheel',
  x: 60,
  z: 0,
  condition: 1,
  job: { activity: 'trade', target: { kind: 'trail', id: 1 }, load: 'goods' },
  route: [
    { x: 60, z: 0 },
    { x: 400, z: 0 },
  ],
};

const VILLAGE: SceneVillage = {
  dwellings: [
    { id: 2, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
  ],
  fields: [
    {
      id: 7,
      parts: [
        { id: 71, cell: { x: 4, y: 2 }, x: 67.5, z: 37.5, size: 15, stage: 'sown', look: 'plowed' },
      ],
    },
  ],
  pens: [pen(12, 30, 3), pen(13, 60, 4)],
  carts: [charcoal, parked, trade],
  expeditions: [
    {
      id: 1,
      day: 1000,
      trailId: 1,
      carts: [6],
      trip: { kind: 'trade', to: 'Olšany' },
    } as unknown as NonNullable<SceneVillage['expeditions']>[number],
  ],
  labor: {
    day: 1000,
    month: 9,
    people: { children: 1, adults: 3, elders: 0 },
    shares: [{ activity: 'plough', target: { kind: 'field', id: 7 }, manDays: 2 }],
    persons: [
      { id: 201, age: 31, sex: 'male', home: 2, role: 'farmer' },
      { id: 203, age: 12, sex: 'male', home: 2, role: 'farmer-son' },
      { id: 301, age: 40, sex: 'male', home: 2, role: 'farmer' },
    ],
  },
};

const team = (
  over: Partial<Extract<DraftFigureState, { kind: 'team' }>> = {},
): DraftFigureState => ({
  kind: 'team',
  team: 0,
  activity: { kind: 'plough', part: { fieldId: 7, partId: 71 } },
  ploughman: 201,
  leader: 203,
  ...over,
});

const person = (id: number, job: PersonFigureState['job']): PersonFigureState => ({
  id,
  job,
  stage: null,
  hidden: false,
  herd: null,
});

describe('co dělá spřežení, vůz a lidé u nich', () => {
  it('spřežení: orá díl, jde na pole, přechází, vrací se, stojí', () => {
    expect(teamActivityText({ kind: 'plough', part: null })).toBe('orá díl pole');
    expect(teamActivityText({ kind: 'to-field' })).toBe('jde na pole');
    expect(teamActivityText({ kind: 'between' })).toBe('přechází na další díl');
    expect(teamActivityText({ kind: 'to-pen' })).toBe('vrací se do ohrady');
    expect(teamActivityText({ kind: 'done', atPen: true })).toBe('stojí v ohradě');
  });

  it('oráč „orá“, honák „vede spřežení“ – i cestou na pole a do ohrady', () => {
    const ploughman = { kind: 'plough', team: 0, role: 'ploughman' } as const;
    const leader = { kind: 'plough', team: 0, role: 'leader' } as const;
    expect(crewActivityText(ploughman, team(), VILLAGE)).toBe('orá');
    expect(crewActivityText(leader, team(), VILLAGE)).toBe('vede spřežení');
    expect(crewActivityText(leader, team({ activity: { kind: 'to-field' } }), VILLAGE)).toBe(
      'vede spřežení na pole',
    );
    expect(crewActivityText(ploughman, team({ activity: { kind: 'to-pen' } }), VILLAGE)).toBe(
      'vede spřežení do ohrady',
    );
    // stav jiného spřežení se nepočítá – oráč prostě orá
    expect(
      crewActivityText(ploughman, team({ team: 1, activity: { kind: 'to-pen' } }), VILLAGE),
    ).toBe('orá');
    expect(personActivity(person(201, ploughman), VILLAGE, team())).toBe('orá');
  });

  it('vůz a vozka: jede pro uhlí, nakládá, veze uhlí ke kováři, skládá; stojí u ohrady', () => {
    expect(cartActivityText(VILLAGE, 3, 'out')).toBe('jede pro uhlí k milíři');
    expect(cartActivityText(VILLAGE, 3, 'load')).toBe('nakládá uhlí');
    expect(cartActivityText(VILLAGE, 3, 'back')).toBe('veze uhlí ke kováři');
    expect(cartActivityText(VILLAGE, 3, 'unload')).toBe('skládá uhlí');
    expect(cartActivityText(VILLAGE, 4, 'parked')).toBe('stojí u ohrady');
    expect(cartActivityText(VILLAGE, 4, null)).toBe('stojí u ohrady');
    // výprava: zboží do sousední vsi, za krajem mapy pryč
    expect(cartActivityText(VILLAGE, 6, 'out')).toBe('veze zboží do vesnice Olšany');
    expect(cartActivityText(VILLAGE, 6, 'away')).toBe('pryč – ve vesnici Olšany');
    const drover: DraftFigureState = {
      kind: 'cart',
      cart: 3,
      leg: 'back',
      loaded: true,
      hidden: false,
      drover: 301,
    };
    expect(personActivity(person(301, { kind: 'cart', cart: 3 }), VILLAGE, drover)).toBe(
      'veze uhlí ke kováři',
    );
  });

  it('náklady: snopy, seno, klády, voda, ruda, hlína, osivo, jablka', () => {
    const job = (j: SceneCart['job']): SceneVillage => ({
      ...VILLAGE,
      carts: [{ ...charcoal, job: j }],
    });
    const field = { kind: 'field', id: 7 } as const;
    expect(
      cartActivityText(job({ activity: 'haul', target: field, load: 'sheaves' }), 3, 'back'),
    ).toBe('veze snopy');
    expect(cartActivityText(job({ activity: 'haul', target: field, load: 'hay' }), 3, 'out')).toBe(
      'jede pro seno',
    );
    expect(
      cartActivityText(
        job({ activity: 'haul', target: { kind: 'trees', ids: [1] }, load: 'logs' }),
        3,
        'back',
      ),
    ).toBe('veze klády ke stavbě');
    expect(
      cartActivityText(
        job({ activity: 'haul', target: { kind: 'water', x: 0, z: 0 }, load: 'water' }),
        3,
        'load',
      ),
    ).toBe('nabírá vodu');
    expect(
      cartActivityText(
        job({ activity: 'haul', target: field, load: 'goods', outbound: true }),
        3,
        'out',
      ),
    ).toBe('veze osivo na pole');
    expect(
      cartActivityText(job({ activity: 'haul', target: field, load: 'apples' }), 3, 'back'),
    ).toBe('veze jablka');
  });

  it('ohrada volů: vůz od své ohrady, spřežení z ohrad v pořadí id po volech vozů', () => {
    expect(cartPen(VILLAGE, 3)).toBe(12);
    expect(cartPen(VILLAGE, 4)).toBe(13);
    expect(cartPen(VILLAGE, 99)).toBeNull();
    // ohrada 12: 3 voli, 1 táhne dvoukolák → 2 na pár; ohrada 13: 4 voli, 2 táhnou výpravu
    expect(teamPen(VILLAGE, 0)).toBe(12);
    expect(teamPen(VILLAGE, 1)).toBe(13);
  });

  it('stav se liší jen při změně', () => {
    expect(sameDraftState(team(), team())).toBe(true);
    expect(sameDraftState(team(), team({ leader: null }))).toBe(false);
    expect(sameDraftState(null, null)).toBe(true);
    expect(sameDraftState(team(), null)).toBe(false);
  });
});

describe('panel výběru spřežení a vozu', () => {
  it('spřežení: co dělá, díl, voli, ohrada, oráč a honák; bez stavu scény nic', () => {
    const details = selectionDetails(null, VILLAGE, { kind: 'plough-team', team: 0 }, null, team());
    expect(details).toEqual({
      kind: 'plough-team',
      team: 0,
      activity: 'orá díl pole',
      part: { fieldId: 7, cell: { x: 4, y: 2 } },
      oxen: 2,
      pen: 12,
      ploughman: { id: 201, portrait: 'man' },
      leader: { id: 203, portrait: 'child' },
    });
    expect(selectionDetails(null, VILLAGE, { kind: 'plough-team', team: 0 })).toBeNull();
    expect(
      selectionDetails(null, VILLAGE, { kind: 'plough-team', team: 1 }, null, team()),
    ).toBeNull();
  });

  it('vůz: druh, co dělá, náklad (jen naložený), stav, voli, ohrada a vozka', () => {
    const state: DraftFigureState = {
      kind: 'cart',
      cart: 3,
      leg: 'back',
      loaded: true,
      hidden: false,
      drover: 301,
    };
    expect(selectionDetails(null, VILLAGE, { kind: 'cart', id: 3 }, null, state)).toEqual({
      kind: 'cart',
      id: 3,
      cartKind: 'two-wheel',
      activity: 'veze uhlí ke kováři',
      cargo: 'charcoal',
      condition: 0.8,
      oxen: 1,
      pen: 12,
      drover: { id: 301, portrait: 'man' },
    });
    // stojící vůz – bez volů a vozky
    expect(selectionDetails(null, VILLAGE, { kind: 'cart', id: 4 })).toMatchObject({
      activity: 'stojí u ohrady',
      oxen: 0,
      drover: null,
      cargo: null,
    });
  });

  it('přechod: oráč má tlačítko spřežení, spřežení tlačítko oráče; výběr trvá, dokud se orá', () => {
    const ploughman = person(201, { kind: 'plough', team: 0, role: 'ploughman' });
    const details = selectionDetails(null, VILLAGE, { kind: 'person', id: 201 }, ploughman, team());
    expect(details).toMatchObject({
      kind: 'person',
      activity: 'orá',
      draft: { kind: 'plough-team', team: 0 },
    });
    const teamPanel = selectionDetails(
      null,
      VILLAGE,
      { kind: 'plough-team', team: 0 },
      null,
      team(),
    );
    expect(teamPanel).toMatchObject({ ploughman: { id: 201 } });
    // spřežení zmizí, když se dnes neorá; vůz, který ves nemá, taky
    const target = { kind: 'plough-team', team: 0 } as const;
    expect(presentTarget(VILLAGE, target)).toBe(target);
    const noPlough = { ...VILLAGE, labor: { ...VILLAGE.labor!, shares: [] } };
    expect(presentTarget(noPlough, target)).toBeNull();
    expect(presentTarget(VILLAGE, { kind: 'cart', id: 99 })).toBeNull();
  });
});
