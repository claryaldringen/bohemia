// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlarmView } from '@bohemia/game';
import { useAlarm, type AlarmHandle } from '../use-alarm';
import { fakeServerEvents, type FakeServerEvents } from './server-events-test-utils';

// Varování vsi z událostí serveru (war.md – Varování, poslové a útěk do hradiště; server-events.md –
// Klient): žádné dotazování – dotaz hned při změně vsi, na `alarm` téže vsi, na `village` téže vsi
// (jen když už je co ukazovat), na obnovu po mezeře a na `refresh`.

vi.mock('@/app/game/actions', () => ({ getAlarmView: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let handle: AlarmHandle;
let events: FakeServerEvents;

type Load = Parameters<typeof useAlarm>[1] & {};

function Probe({ villageId, load }: { villageId: string | null; load: Load }): null {
  handle = useAlarm(villageId, load);
  return null;
}

const alarm = (villageId: string): AlarmView => ({ villageId, warned: true }) as AlarmView;

const flush = (): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  events = fakeServerEvents();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('useAlarm', () => {
  it('za 60 s bez události jde jen první dotaz', async () => {
    const load = vi.fn<Load>().mockResolvedValue(alarm('v1'));
    act(() => root.render(events.wrap(<Probe villageId="v1" load={load} />)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ villageId: 'v1' });
    expect(handle.view).toEqual(alarm('v1'));
  });

  it('`alarm` téže vsi = další dotaz, jiné vsi nic', async () => {
    const load = vi.fn<Load>().mockResolvedValue(alarm('v1'));
    act(() => root.render(events.wrap(<Probe villageId="v1" load={load} />)));
    await flush();
    act(() => events.emit('alarm', { villageId: 'v2' }));
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    act(() => events.emit('alarm', { villageId: 'v1' }));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('`village` téže vsi jen s pohledem; bez pohledu (null) nic', async () => {
    const load = vi.fn<Load>().mockResolvedValue(null);
    act(() => root.render(events.wrap(<Probe villageId="v1" load={load} />)));
    await flush();
    expect(handle.view).toBeNull();
    act(() => events.emit('village', { villageId: 'v1', version: 4 }));
    await flush();
    expect(load).toHaveBeenCalledTimes(1);

    // pohled je – změna téže vsi se zeptá, jiné vsi ani změna sídla ne
    load.mockResolvedValue(alarm('v1'));
    act(() => handle.refresh());
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(handle.view).toEqual(alarm('v1'));
    act(() => events.emit('village', { villageId: 'v2', version: 4 }));
    act(() => events.emit('village', { villageId: null, version: null }));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    act(() => events.emit('village', { villageId: 'v1', version: 5 }));
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('obnova po mezeře se zeptá; bez vsi nic a žádní posluchači po odpojení', async () => {
    const load = vi.fn<Load>().mockResolvedValue(alarm('v1'));
    act(() => root.render(events.wrap(<Probe villageId="v1" load={load} />)));
    await flush();
    act(() => events.resync());
    await flush();
    expect(load).toHaveBeenCalledTimes(2);

    act(() => root.render(events.wrap(<Probe villageId={null} load={load} />)));
    await flush();
    expect(handle.view).toBeNull();
    act(() => events.resync());
    act(() => events.emit('alarm', { villageId: 'v1' }));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);

    act(() => root.render(<p />));
    expect(events.listeners('alarm')).toBe(0);
    expect(events.listeners('village')).toBe(0);
  });

  it('události v rychlém sledu: jeden dotaz naráz, nejvýš jeden další po něm', async () => {
    let finish: (value: AlarmView) => void = () => undefined;
    const load = vi.fn<Load>(
      () =>
        new Promise<AlarmView>((resolve) => {
          finish = resolve;
        }),
    );
    act(() => root.render(events.wrap(<Probe villageId="v1" load={load} />)));
    await flush();
    for (let i = 0; i < 10; i++) act(() => events.emit('alarm', { villageId: 'v1' }));
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(alarm('v1'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish(alarm('v1'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
