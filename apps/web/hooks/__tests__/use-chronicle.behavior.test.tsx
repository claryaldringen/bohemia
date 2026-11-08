// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayIndexOf, type ChronicleEvent } from '@bohemia/game';
import { chroniclePage, type ChroniclePage } from '@/lib/chronicle-view';
import { useChronicle, type ChronicleControl } from '../use-chronicle';

// server action se v testu nevolá – hook dostane `load`
vi.mock('@/app/game/actions', () => ({ getChronicle: vi.fn() }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const day = (year: number): number => dayIndexOf({ year, month: 5, day: 1 });

function chronicle(to: number): ChronicleEvent[] {
  const list: ChronicleEvent[] = [{ day: day(500), kind: 'village-founded' }];
  for (let year = 500; year <= to; year++) {
    for (let i = 0; i < 25; i++) list.push({ day: day(year) + i, kind: 'birth' });
  }
  return list;
}

type Props = Omit<Parameters<typeof useChronicle>[0], 'load' | 'closeOthers'>;

function setup(events: () => ChronicleEvent[]): {
  draw: (props: Props) => void;
  control: () => ChronicleControl;
  load: ReturnType<typeof vi.fn>;
  closeOthers: ReturnType<typeof vi.fn>;
} {
  let current: ChronicleControl | null = null;
  const load = vi.fn(
    (input: { villageId: string; before: number | null }): Promise<ChroniclePage> =>
      Promise.resolve(chroniclePage(events(), 'Lhota', { before: input.before })),
  );
  const closeOthers = vi.fn();
  function Probe(props: Props): null {
    current = useChronicle({ ...props, load, closeOthers });
    return null;
  }
  return {
    draw: (props) => act(() => root.render(<Probe {...props} />)),
    control: () => current!,
    load,
    closeOthers,
  };
}

const flush = (): Promise<void> => act(async () => {});

describe('stav panelu Kronika', () => {
  it('otevření zavře ostatní panely a načte první stránku vsi', async () => {
    const { draw, control, load, closeOthers } = setup(() => chronicle(504));
    const props = { villageId: 'v1', latest: undefined, othersOpen: false };
    draw(props);
    expect(load).not.toHaveBeenCalled();
    act(() => control().toggle());
    draw(props);
    await flush();
    expect(closeOthers).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ villageId: 'v1', before: null });
    expect(control().open).toBe(true);
    expect(control().page?.years.map((y) => y.year)).toEqual([504, 503]);
  });

  it('starší stránka se připojí pod zobrazené roky', async () => {
    const { draw, control, load } = setup(() => chronicle(504));
    const props = { villageId: 'v1', latest: undefined, othersOpen: false };
    draw(props);
    act(() => control().toggle());
    await flush();
    act(() => control().loadOlder());
    await flush();
    expect(load).toHaveBeenLastCalledWith({ villageId: 'v1', before: 503 });
    expect(control().page?.years.map((y) => y.year)).toEqual([504, 503, 502, 501]);
  });

  it('nový zápis v pohledu obnoví první stránku a načtené starší roky nechá', async () => {
    let to = 504;
    const { draw, control, load } = setup(() => chronicle(to));
    const props = { villageId: 'v1', latest: undefined, othersOpen: false };
    draw(props);
    act(() => control().toggle());
    await flush();
    act(() => control().loadOlder());
    await flush();
    to = 505;
    draw({
      ...props,
      latest: { day: day(505), kind: 'birth', dateLabel: '', text: 'Narodilo se dítě.' },
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
    expect(control().page?.years.map((y) => y.year)).toEqual([505, 504, 503, 502, 501]);
  });

  it('otevření jiného panelu kroniku zavře', async () => {
    const { draw, control } = setup(() => chronicle(504));
    draw({ villageId: 'v1', latest: undefined, othersOpen: false });
    act(() => control().toggle());
    await flush();
    draw({ villageId: 'v1', latest: undefined, othersOpen: true });
    expect(control().open).toBe(false);
  });

  it('jiná ves – stránka předchozí vsi se neukáže', async () => {
    const { draw, control, load } = setup(() => chronicle(504));
    draw({ villageId: 'v1', latest: undefined, othersOpen: false });
    act(() => control().toggle());
    await flush();
    draw({ villageId: 'v2', latest: undefined, othersOpen: false });
    expect(control().page).toBeNull();
    await flush();
    expect(load).toHaveBeenLastCalledWith({ villageId: 'v2', before: null });
    expect(control().page).not.toBeNull();
  });
});
