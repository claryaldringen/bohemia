// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TimeSkip } from '@bohemia/game';
import { SKIP_PROGRESS_URL } from '@/hooks/use-skip-progress';
import {
  fakeServerEvents,
  type FakeServerEvents,
} from '@/hooks/__tests__/server-events-test-utils';
import { DevTimeButtons } from '../TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 1. 11. 2026: „Když hru posunu o rok, pořád to dost trvá. Můžeš udělat nějaký progressbar,
// abych viděl průběh přepočtu?“ – během přeskoku tlačítka dostávají průběh od serveru (dotaz při
// zapnutí, pak události `skip`) a pod nimi běží tenký ukazatel; procenta a dny jsou jen v popisku.

let host: HTMLDivElement;
let root: Root;
let events: FakeServerEvents;
let answers: unknown[];
const fetchMock = vi.fn(async (): Promise<Response> => {
  const body = answers.length > 1 ? answers.shift() : answers[0];
  return new Response(JSON.stringify(body), { status: 200 });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  answers = [{ progress: null }];
  events = fakeServerEvents();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(pending: TimeSkip | null): void {
  act(() => root.render(events.wrap(<DevTimeButtons pending={pending} onSkip={() => {}} />)));
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function skip(progress: { doneDays: number; totalDays: number } | null): void {
  act(() => events.emit('skip', { progress }));
}

const bar = (): HTMLElement | null => host.querySelector('[data-testid="dev-skip-progress"]');
const tips = (): string[] =>
  [...host.querySelectorAll('[role="tooltip"]')].map((tip) => tip.textContent ?? '');

it('během přeskoku ukazuje průběh ze serveru, po konci ukazatel zmizí a nic se neptá', async () => {
  render(null);
  expect(bar()).toBeNull();
  expect(tips()).toEqual(['+1 měsíc', '+1 rok', '+10 let']);
  await flush();
  expect(fetchMock).not.toHaveBeenCalled();

  render('year');
  // před první odpovědí prázdný ukazatel
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(SKIP_PROGRESS_URL, { cache: 'no-store' });
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  skip({ doneDays: 146, totalDays: 365 });
  expect(bar()?.getAttribute('aria-valuenow')).toBe('40');
  expect(bar()?.querySelector('span')?.style.width).toBe('40%');
  // bez textu – procenta a dny jen v popisku
  expect(bar()?.textContent).toBe('');
  expect(tips()[1]).toBe('Přepočet 40 %146 / 365 dní');

  render(null);
  expect(bar()).toBeNull();
  expect(tips()).toEqual(['+1 měsíc', '+1 rok', '+10 let']);
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('další přeskok začíná od nuly – průběh minulého se neukáže', async () => {
  render('year');
  await flush();
  skip({ doneDays: 365, totalDays: 365 });
  expect(bar()?.getAttribute('aria-valuenow')).toBe('100');
  render(null);
  render('month');
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  expect(tips()[0]).toBe('Přepočet 0 %');
});

it('nesmyslnou odpověď (chyba, špatná čísla) ignoruje', async () => {
  render('decade');
  skip({ doneDays: 50, totalDays: 10 });
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  await flush();
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
});
