// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenePerson } from '@/lib/person-view';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { OrderMode } from '@/lib/scene/scene-pointer';
import type { VillageTarget } from '@/lib/scene/village-picking';

const commandExpedition = vi.fn();
vi.mock('@/app/game/actions/journey', () => ({
  commandExpedition: (input: unknown): unknown => commandExpedition(input),
}));

import { useExpeditionOrders, type ExpeditionOrders } from '../use-expedition-orders';

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
function fakeScene(): { scene: LandscapeScene; mode: () => OrderMode | null } {
  let mode: OrderMode | null = null;
  const scene = {
    setOrderMode: (m: OrderMode | null): void => {
      mode = m;
    },
    onSelect: () => () => undefined,
    setSelection: () => undefined,
  } as unknown as LandscapeScene;
  return { scene, mode: () => mode };
}

let latest: ExpeditionOrders | null = null;
function Probe(props: {
  selection: VillageTarget | null;
  persons: readonly ScenePerson[];
  scene: LandscapeScene;
  setSelected: (t: VillageTarget | null) => void;
}): null {
  latest = useExpeditionOrders({
    villageId: 'v1',
    selection: props.selection,
    setSelected: props.setSelected,
    views: [],
    persons: props.persons,
    scene: props.scene,
    lord: null,
    homeCell: { x: 2, y: 3 },
    mapSizeM: 1920,
    refresh: () => undefined,
  });
  return null;
}

const flush = (): Promise<void> => act(async () => void (await Promise.resolve()));

function mount(selection: VillageTarget | null, persons: ScenePerson[]) {
  const { scene, mode } = fakeScene();
  const setSelected = vi.fn();
  act(() => root.render(<Probe {...{ selection, persons, scene, setSelected }} />));
  return { mode, setSelected };
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
