// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { premiumIntroNotice } from '@/lib/premium-view';
import { NOTICE_MS, NoticeLines, type NoticeLine } from '../NoticeLines';

// Představení prémiové krajiny při prvním vstupu do hry (premium-landscapes.md – Co hráč vidí):
// mizející řádek s ikonou typu – jediné místo se slovy.

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('hláška při prvním vstupu do hry', () => {
  it('řádek s ikonou typu a jednou větou, po NOTICE_MS zmizí', () => {
    const intro = premiumIntroNotice('gold-stream', false);
    expect(intro).not.toBeNull();
    let notices: NoticeLine[] = [{ ...intro!, id: 1 }];
    const draw = (): void =>
      root.render(
        <NoticeLines
          notices={notices}
          status={null}
          onExpire={(id) => {
            notices = notices.filter((n) => n.id !== id);
            draw();
          }}
        />,
      );
    act(draw);
    const line = host.querySelector('[data-testid="village-notice"]');
    expect(line?.getAttribute('data-kind')).toBe('premium-intro');
    expect(line?.textContent).toBe(
      'Krajina rodu: Zlatonosný potok – později rýžování zlata – málo, ale brzy.',
    );
    expect(host.querySelector('[data-testid="village-notice-icon"]')?.getAttribute('src')).toBe(
      '/icons/premium/gold-stream.png',
    );
    act(() => vi.advanceTimersByTime(NOTICE_MS));
    expect(host.querySelector('[data-testid="village-notice"]')).toBeNull();
  });

  it('ves už založená – žádná hláška', () => {
    expect(premiumIntroNotice('gold-stream', true)).toBeNull();
  });
});
