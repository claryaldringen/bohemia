// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewcomerStatusView } from '@/lib/newcomer-view';
import { LanguageChoice } from '../LanguageChoice';
import { NewcomerPanel } from '../NewcomerPanel';

// Chování panelu nováčka v DOM: dvě ikony, nabídka s nejvýš 5 zaškrtnutými rody, prázdná
// nabídka jen se „Svobodný“, odeslání žádostí, odpočet a řádek jazyků pro účet přes Google.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const offer = (n: number): NewcomerStatusView => ({
  phase: 'isolated',
  offer: Array.from({ length: n }, (_, i) => ({
    houseId: `h${i + 1}`,
    lordName: `Pán ${i + 1}`,
    language: 'de' as const,
  })),
  requests: [],
  deadline: null,
});

const q = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`);
const click = (id: string): void => {
  act(() => {
    q(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('NewcomerPanel', () => {
  it('nabízí dvě ikony', () => {
    act(() =>
      root.render(<NewcomerPanel status={offer(2)} onRequest={vi.fn()} onStartFree={vi.fn()} />),
    );
    expect(q('newcomer-choose-lord')).not.toBeNull();
    expect(q('newcomer-free')).not.toBeNull();
  });

  it('prázdná nabídka ukáže jen Svobodný a ten volá onStartFree', () => {
    const onStartFree = vi.fn();
    act(() =>
      root.render(
        <NewcomerPanel status={offer(0)} onRequest={vi.fn()} onStartFree={onStartFree} />,
      ),
    );
    expect(q('newcomer-choose-lord')).toBeNull();
    click('newcomer-free');
    expect(onStartFree).toHaveBeenCalledTimes(1);
  });

  it('zaškrtne nejvýš 5, šestý zašedne s důvodem a odeslání pošle vybraná id', () => {
    const onRequest = vi.fn();
    act(() =>
      root.render(<NewcomerPanel status={offer(6)} onRequest={onRequest} onStartFree={vi.fn()} />),
    );
    click('newcomer-choose-lord');
    expect(q('newcomer-send')!.hasAttribute('disabled')).toBe(true);
    for (let i = 1; i <= 5; i++) click(`newcomer-offer-h${i}`);
    const sixth = q('newcomer-offer-h6')!;
    expect(sixth.getAttribute('aria-disabled')).toBe('true');
    expect(sixth.closest('span')!.querySelector('[role="tooltip"]')!.textContent).toBe(
      'Nejvýš 5 rodů.',
    );
    click('newcomer-offer-h6');
    expect(q('newcomer-offer-h6')!.getAttribute('aria-pressed')).toBe('false');
    click('newcomer-offer-h2');
    click('newcomer-offer-h6');
    click('newcomer-send');
    expect(onRequest).toHaveBeenCalledWith(['h1', 'h3', 'h4', 'h5', 'h6']);
  });

  it('čekání ukáže odpočet a stav žádostí, Stáhnout žádosti volá onStartFree', () => {
    const onStartFree = vi.fn();
    const status: NewcomerStatusView = {
      phase: 'isolated',
      offer: (offer(2) as Extract<NewcomerStatusView, { phase: 'isolated' }>).offer,
      requests: [
        { houseId: 'h1', state: 'pending' },
        { houseId: 'h2', state: 'rejected' },
      ],
      deadline: new Date(10_000 + (2 * 86400 + 3 * 3600) * 1000).toISOString(),
    };
    act(() =>
      root.render(
        <NewcomerPanel
          status={status}
          onRequest={vi.fn()}
          onStartFree={onStartFree}
          now={() => 10_000}
        />,
      ),
    );
    expect(q('newcomer-countdown')!.textContent).toBe('2 d 3 h');
    expect(q('newcomer-request-h1')!.getAttribute('data-state')).toBe('pending');
    expect(q('newcomer-request-h2')!.getAttribute('data-state')).toBe('rejected');
    click('newcomer-withdraw');
    expect(onStartFree).toHaveBeenCalledTimes(1);
  });

  it('umístěný nováček nemá panel', () => {
    act(() =>
      root.render(
        <NewcomerPanel status={{ phase: 'placed' }} onRequest={vi.fn()} onStartFree={vi.fn()} />,
      ),
    );
    expect(host.innerHTML).toBe('');
  });
});

describe('LanguageChoice', () => {
  it('klik na jazyk zavolá akci se zvoleným jazykem', async () => {
    const onChoose = vi.fn().mockResolvedValue(null);
    act(() => root.render(<LanguageChoice onChoose={onChoose} />));
    expect(host.querySelectorAll('button').length).toBe(7);
    await act(async () => {
      q('language-choice-pl')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChoose).toHaveBeenCalledWith('pl');
    expect(q('language-choice-pl')!.getAttribute('aria-pressed')).toBe('true');
  });
});
