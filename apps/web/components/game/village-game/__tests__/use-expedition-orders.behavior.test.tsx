// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpeditionView, MarchGrid } from '@bohemia/game';
import type { ScenePerson } from '@/lib/person-view';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { OrderMode } from '@/lib/scene/scene-pointer';
import type { VillageTarget } from '@/lib/scene/village-picking';

const commandExpedition = vi.fn();
vi.mock('@/app/game/actions/journey', () => ({
  commandExpedition: (input: unknown): unknown => commandExpedition(input),
}));

import {
  HOME_CURSOR,
  useExpeditionOrders,
  type ExpeditionOrders,
  type LordAway,
} from '../use-expedition-orders';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  commandExpedition.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const person = (id: number, age: number, refusal?: 'young'): ScenePerson => ({
  id,
  age,
  sex: 'male',
  home: 1,
  role: 'smith',
  expedition: { strength: 1, ...(refusal ? { refusal } : {}) },
});

/** Scéna jen s tím, co hook používá: režim rozkazu a výběr. */
/** Dvorec scény 10 × 10 m kolem (100, 100) – kurzor „Domů“. */
const MANOR = {
  position: { x: 100, z: 100, rotation: 0 },
  box: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
};

function fakeScene(grid: MarchGrid | null = null): {
  scene: LandscapeScene;
  mode: () => OrderMode | null;
} {
  let mode: OrderMode | null = null;
  const scene = {
    marchGrid: (): MarchGrid | null => grid,
    manorArea: () => MANOR,
    dwellingPoint: (): { x: number; z: number } => ({ x: -50, z: 0 }),
    setOrderMode: (m: OrderMode | null): void => {
      mode = m;
    },
    onSelect: () => () => undefined,
    setSelection: () => undefined,
  } as unknown as LandscapeScene;
  return { scene, mode: () => mode };
}

let latest: ExpeditionOrders | null = null;
const NO_VIEWS: readonly ExpeditionView[] = [];
function Probe(props: {
  selection: VillageTarget | null;
  persons: readonly ScenePerson[];
  scene: LandscapeScene;
  setSelected: (t: VillageTarget | null) => void;
  views?: readonly ExpeditionView[];
  lord?: LordAway | null;
}): null {
  latest = useExpeditionOrders({
    villageId: 'v1',
    selection: props.selection,
    setSelected: props.setSelected,
    views: props.views ?? NO_VIEWS,
    persons: props.persons,
    scene: props.scene,
    lord: props.lord ?? null,
    homeCell: { x: 2, y: 3 },
    mapSizeM: 1920,
    refresh: () => undefined,
  });
  return null;
}

const flush = (): Promise<void> => act(async () => void (await Promise.resolve()));

function mount(
  selection: VillageTarget | null,
  persons: ScenePerson[],
  extra: { views?: readonly ExpeditionView[]; lord?: LordAway | null } = {},
  grid: MarchGrid | null = null,
) {
  const { scene, mode } = fakeScene(grid);
  const setSelected = vi.fn();
  const render = (more: { views?: readonly ExpeditionView[]; lord?: LordAway | null }): void =>
    act(() => root.render(<Probe {...{ selection, persons, scene, setSelected, ...more }} />));
  render(extra);
  return { mode, setSelected, render };
}

/** Výprava vsi `villageId` s jednou skupinou lidí `ids` na mapě vsi scény. */
function expedition(villageId: string, journeyId: string, ids: number[]): ExpeditionView {
  return {
    journeyId,
    villageId,
    tick: 1,
    day: 1,
    home: { x: 2, y: 3 },
    homePos: { x: 0, z: 0 },
    hunt: null,
    parties: [
      {
        id: 0,
        phase: 'out',
        controllable: true,
        leaderId: ids[0] ?? null,
        waitDaysLeft: null,
        horseWork: null,
        groups: [{ id: 0, cell: { x: 2, y: 3 }, pos: { x: 1, z: 1 }, goal: null, arrived: true }],
        people: ids.map((personId) => ({
          personId,
          group: 0,
          lord: false,
          rider: false,
          mounted: false,
          horse: null,
          horseId: null,
          wounded: false,
          strength: 1,
          female: false,
          child: false,
        })),
      },
    ],
    seen: {},
  };
}

describe('useExpeditionOrders – pravé tlačítko pro vybrané lidi', () => {
  it('se dvěma vybranými pošle jedno volání s oběma lidmi a mapou scény', async () => {
    commandExpedition.mockResolvedValue({ ok: true });
    const { mode } = mount({ kind: 'people', ids: [5, 6] }, [person(5, 30), person(6, 20)]);
    await act(async () => mode()?.order({ x: 10, z: 20 }, { x: 1, y: 1 }));
    await flush();
    expect(commandExpedition).toHaveBeenCalledTimes(1);
    expect(commandExpedition).toHaveBeenCalledWith({
      villageId: 'v1',
      people: [5, 6],
      command: { kind: 'go', pos: { x: 10, z: 20 }, cell: { x: 2, y: 3 } },
    });
  });

  it('dvojité pravé kliknutí nevyšle dvakrát', async () => {
    let finish: (v: unknown) => void = () => undefined;
    commandExpedition.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { mode } = mount({ kind: 'person', id: 5 }, [person(5, 30)]);
    act(() => {
      mode()?.order({ x: 10, z: 20 }, { x: 1, y: 1 });
      mode()?.order({ x: 11, z: 21 }, { x: 1, y: 1 });
    });
    expect(commandExpedition).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
  });

  it('dítě do 12 let: důvod u kurzoru a žádné volání', async () => {
    const { mode } = mount({ kind: 'person', id: 8 }, [person(8, 8, 'young')]);
    act(() => mode()?.order({ x: 10, z: 20 }, { x: 5, y: 6 }));
    expect(commandExpedition).not.toHaveBeenCalled();
    expect(latest?.note).toMatchObject({
      text: 'Od 12 let.',
      tone: 'error',
      screen: { x: 5, y: 6 },
    });
  });

  it('odpověď s chybou ukáže důvod u kurzoru a výběr zůstane', async () => {
    commandExpedition.mockResolvedValue({ error: 'Tam nedojde.' });
    const { mode, setSelected } = mount({ kind: 'people', ids: [5, 6] }, [
      person(5, 30),
      person(6, 20),
    ]);
    await act(async () => mode()?.order({ x: 10, z: 20 }, { x: 7, y: 8 }));
    await flush();
    expect(latest?.note).toMatchObject({ text: 'Tam nedojde.', tone: 'error' });
    expect(setSelected).not.toHaveBeenCalled();
  });

  it('bez vybraných lidí režim rozkazu není (pravé tlačítko ruší výběr)', () => {
    const { mode } = mount({ kind: 'dwelling', id: 1 }, [person(5, 30)]);
    expect(mode()).toBeNull();
  });
});

describe('useExpeditionOrders – dvě vsi hráče, stejné id osoby (id je jedinečné jen ve vsi)', () => {
  const views = [expedition('v1', 'j1', [7, 8]), expedition('v2', 'j2', [7, 9])];

  it('skupina člověka jen ve výpravě jeho vsi', () => {
    mount(null, [person(7, 30)], { views });
    expect(latest?.partyOf(7, undefined)).toEqual([7, 8]);
    expect(latest?.partyOf(7, 'v2')).toEqual([7, 9]);
    expect(latest?.partyOf(8, 'v2')).toBeNull();
  });

  it('rozkaz člověku jiné vsi jde do jeho vsi, člověku vsi scény do vsi scény', async () => {
    commandExpedition.mockResolvedValue({ ok: true });
    const far = mount({ kind: 'person', id: 7, villageId: 'v2' }, [person(7, 30)], { views });
    await act(async () => far.mode()?.order({ x: 10, z: 20 }, { x: 1, y: 1 }));
    await flush();
    expect(commandExpedition).toHaveBeenLastCalledWith(
      expect.objectContaining({ villageId: 'v2', people: [7] }),
    );
    expect(latest?.followed?.journeyId).toBe('j2');
    const near = mount({ kind: 'person', id: 7 }, [person(7, 30)], { views });
    await act(async () => near.mode()?.order({ x: 10, z: 20 }, { x: 1, y: 1 }));
    await flush();
    expect(commandExpedition).toHaveBeenLastCalledWith(
      expect.objectContaining({ villageId: 'v1', people: [7] }),
    );
    expect(latest?.followed?.journeyId).toBe('j1');
  });

  it('odznak vojvody zhasne, když jeho skupina z pohledů zmizí (doma), a vrátí se s další výpravou', () => {
    const lord: LordAway = { id: 7, name: 'Bořivoj', away: true };
    const { render } = mount(null, [person(7, 30)], { views, lord });
    expect(latest?.away).not.toBeNull();
    // skupina vojvody došla domů – ves to potvrdí až další den (`untilDay`)
    render({ views: [expedition('v2', 'j2', [7, 9])], lord });
    expect(latest?.away).toBeNull();
    // ves návrat potvrdila, pak vojvoda vyjel znovu
    render({ views: [], lord: { ...lord, away: false } });
    render({ views: [], lord });
    expect(latest?.away).not.toBeNull();
    render({ views, lord });
    expect(latest?.away).not.toBeNull();
    // ves potvrdí dřív, než dotazy skončí (pohledy ho ještě mají) – nová výprava odznak hned ukáže
    render({ views, lord: { ...lord, away: false } });
    render({ views: [], lord: { ...lord, away: false } });
    render({ views: [], lord });
    expect(latest?.away).not.toBeNull();
  });
});

describe('useExpeditionOrders – kurzor nad místem, kam se nedá dojít', () => {
  /** Mapa 200 × 200 m: levá půlka louka, od x = 0 pás hustého lesa (pace 0) široký 20 m, pak louka. */
  const grid = (): MarchGrid => {
    const width = 80;
    const pace = new Float32Array(width * width).fill(1);
    const flags = new Uint16Array(width * width);
    for (let j = 0; j < width; j++) {
      for (let i = 40; i < 48; i++) {
        pace[j * width + i] = 0;
        flags[j * width + i] = 1;
      }
    }
    return { width, height: width, originX: -100, originZ: -100, cellM: 2.5, pace, flags };
  };

  it('hustý les i louka za ním (bez spojení) mají kurzor zákazu, průchozí místo ne', () => {
    const { mode } = mount({ kind: 'people', ids: [5] }, [person(5, 30)], {}, grid());
    // les x = 0 .. 20; start (-50, 0) u domu
    expect(mode()?.hover({ x: 10, z: 0 }, { x: 1, y: 1 })).toBe('not-allowed');
    expect(mode()?.hover({ x: -20, z: 30 }, { x: 1, y: 1 })).toBe('');
    // okraj mapy: západní okraj je dosažitelný (šipka přechodu), východní za lesem ne
    expect(mode()?.hover({ x: -950, z: 0 }, { x: 1, y: 1 })).toBe('w-resize');
    expect(mode()?.hover({ x: 950, z: 0 }, { x: 1, y: 1 })).toBe('not-allowed');
  });

  it('nad dvorcem je s člověkem výpravy kurzor Domů, s lidmi doma ne (Martin 18. 11. 2026)', () => {
    const views = [expedition('v1', 'j1', [5])];
    const { mode } = mount({ kind: 'person', id: 5 }, [person(5, 30)], { views });
    expect(mode()?.hover({ x: 102, z: 97 }, { x: 1, y: 1 })).toBe(HOME_CURSOR);
    expect(mode()?.hover({ x: 120, z: 100 }, { x: 1, y: 1 })).toBe('');
    const home = mount({ kind: 'person', id: 6 }, [person(6, 30)], { views });
    expect(home.mode()?.hover({ x: 102, z: 97 }, { x: 1, y: 1 })).toBe('');
  });
});
