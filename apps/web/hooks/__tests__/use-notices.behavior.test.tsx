// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayIndexOf, type PlayerNotice } from '@bohemia/game';
import { noticePage, type NoticePage } from '@/lib/notice-page';
import { useNotices, type NoticesControl } from '../use-notices';

// server action se v testu nevolá – hook dostane `load`
vi.mock('@/app/game/actions', () => ({ getNotices: vi.fn() }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const notice = (id: number): PlayerNotice => ({
  id,
  playerId: 'p1',
  kind: 'invitee-played',
  payload: { name: 'Ctibor' },
  gameDay: dayIndexOf({ year: 507, month: 3, day: 12 }),
  createdAt: new Date(0),
  readAt: null,
});

type Props = Omit<Parameters<typeof useNotices>[0], 'load' | 'closeOthers'>;

function setup(newest: () => number): {
  draw: (props: Props) => void;
  control: () => NoticesControl;
  load: ReturnType<typeof vi.fn>;
  closeOthers: ReturnType<typeof vi.fn>;
} {
  let current: NoticesControl | null = null;
  const load = vi.fn((input: { before: number | null }): Promise<NoticePage> => {
    const top = input.before === null ? newest() : input.before - 1;
    const rows = Array.from({ length: Math.min(top, 31) }, (_, i) => notice(top - i));
    return Promise.resolve(noticePage(rows));
  });
  const closeOthers = vi.fn();
  function Probe(props: Props): null {
    current = useNotices({ ...props, load, closeOthers });
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
const base = { tick: 0, enabled: true, othersOpen: false };

describe('stav panelu Upozornění', () => {
  it('první stránka se načte hned a nová upozornění ukáže jako číslo u ikony', async () => {
    const { draw, control, load } = setup(() => 3);
    draw(base);
    await flush();
    expect(load).toHaveBeenCalledWith({ before: null });
    expect(control().unread).toBe(3);
  });

  it('otevření zavře ostatní, zvýrazní nová a vynuluje číslo; po zavření zůstane nula', async () => {
    let top = 3;
    const { draw, control, closeOthers } = setup(() => top);
    draw(base);
    await flush();
    act(() => control().toggle());
    await flush();
    expect(closeOthers).toHaveBeenCalledTimes(1);
    expect(control().open).toBe(true);
    expect(control().highlightAfter).toBe(0);
    expect(control().unread).toBe(0);
    expect(window.localStorage.getItem('bohemia:notices-seen')).toBe('3');
    act(() => control().close());
    await flush();
    expect(control().unread).toBe(0);
    // nové upozornění po zavření: tick, číslo 1
    top = 4;
    draw({ ...base, tick: 1 });
    await flush();
    expect(control().unread).toBe(1);
    act(() => control().toggle());
    await flush();
    expect(control().highlightAfter).toBe(3);
  });

  it('poslední viděné se pamatuje mezi návštěvami', async () => {
    window.localStorage.setItem('bohemia:notices-seen', '2');
    const { draw, control } = setup(() => 3);
    draw(base);
    await flush();
    expect(control().unread).toBe(1);
  });

  it('starší stránka se připojí a jiný panel upozornění zavře', async () => {
    const { draw, control, load } = setup(() => 60);
    draw(base);
    await flush();
    act(() => control().toggle());
    await flush();
    act(() => control().loadOlder());
    await flush();
    expect(load).toHaveBeenLastCalledWith({ before: 31 });
    expect(control().page?.items).toHaveLength(60);
    draw({ ...base, othersOpen: true });
    expect(control().open).toBe(false);
  });

  it('bez přihlášení (enabled = false) se nic nenačítá', async () => {
    const { draw, load } = setup(() => 3);
    draw({ ...base, enabled: false });
    await flush();
    expect(load).not.toHaveBeenCalled();
  });
});
