// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TimeSkip } from '@bohemia/game';
import { SKIP_PROGRESS_POLL_MS, SKIP_PROGRESS_URL } from '@/hooks/use-skip-progress';
import { DevTimeButtons } from '../TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 1. 11. 2026: „Když hru posunu o rok, pořád to dost trvá. Můžeš udělat nějaký progressbar,
// abych viděl průběh přepočtu?“ – během přeskoku se tlačítka ptají serveru na průběh a pod nimi
// běží tenký ukazatel; procenta a dny jsou jen v popisku.

let host: HTMLDivElement;
let root: Root;
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
  act(() => root.render(<DevTimeButtons pending={pending} onSkip={() => {}} />));
}

async function poll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SKIP_PROGRESS_POLL_MS);
  });
}

const bar = (): HTMLElement | null => host.querySelector('[data-testid="dev-skip-progress"]');
const tips = (): string[] =>
  [...host.querySelectorAll('[role="tooltip"]')].map((tip) => tip.textContent ?? '');

it('během přeskoku ukazuje průběh ze serveru, po konci ukazatel zmizí a dotazy přestanou', async () => {
  render(null);
  expect(bar()).toBeNull();
  expect(tips()).toEqual(['+1 měsíc', '+1 rok', '+10 let']);
  await poll();
  expect(fetchMock).not.toHaveBeenCalled();

  render('year');
  // před první odpovědí prázdný ukazatel
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  answers = [{ progress: null }, { progress: { doneDays: 146, totalDays: 365 } }];
  await poll();
  expect(fetchMock).toHaveBeenCalledWith(SKIP_PROGRESS_URL, { cache: 'no-store' });
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  await poll();
  expect(bar()?.getAttribute('aria-valuenow')).toBe('40');
  expect(bar()?.querySelector('span')?.style.width).toBe('40%');
  // bez textu – procenta a dny jen v popisku
  expect(bar()?.textContent).toBe('');
  expect(tips()[1]).toBe('Přepočet 40 %146 / 365 dní');

  render(null);
  expect(bar()).toBeNull();
  expect(tips()).toEqual(['+1 měsíc', '+1 rok', '+10 let']);
  const calls = fetchMock.mock.calls.length;
  await poll();
  await poll();
  expect(fetchMock.mock.calls.length).toBe(calls);
});

it('další přeskok začíná od nuly – průběh minulého se neukáže', async () => {
  render('year');
  answers = [{ progress: { doneDays: 365, totalDays: 365 } }];
  await poll();
  expect(bar()?.getAttribute('aria-valuenow')).toBe('100');
  render(null);
  render('month');
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  expect(tips()[0]).toBe('Přepočet 0 %');
});

it('nesmyslnou odpověď (chyba, špatná čísla) ignoruje', async () => {
  render('decade');
  answers = [{ progress: { doneDays: 50, totalDays: 10 } }];
  await poll();
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
  await poll();
  expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
});
