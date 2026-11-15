// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { FortGateBody } from '../selection/fortification';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Panel brány (demolition.md – Rozhodnutí, Martin 14. 11. 2026): Opustit / Vrátit a Zbořit jako
// u stavby a úseku, „Postavit jinudy“ z panelu brány zmizelo – mezeru hráč zastaví běžnou stavbou.

type Gate = Extract<SelectionDetails, { kind: 'fortification-gate' }>;

const gate = (over: Partial<Gate['gate']> = {}): Gate => ({
  kind: 'fortification-gate',
  id: 7,
  fortKind: 'palisade',
  gate: {
    segment: 2,
    state: 1,
    old: false,
    ageYears: 3,
    pincer: null,
    tower: null,
    assault: [],
    abandoned: false,
    abandonBlocked: null,
    demolish: { work: 'demolish', cost: { laborManDays: 2.5, logs: 3 }, blocked: null },
    ...over,
  },
  road: null,
});

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

const button = (id: string): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

it('brána má Opustit a Zbořit, Postavit jinudy ne', async () => {
  const onAction = vi.fn(() => Promise.resolve());
  act(() => root.render(<FortGateBody details={gate()} onAction={onAction} />));
  expect(button('fort-reroute')).toBeNull();
  expect(button('fort-gate-restore')).toBeNull();
  expect(button('fort-gate-abandon')?.getAttribute('aria-label')).toBe(
    'Opustit bránu – přestane se udržovat a rozpadne se na mezeru',
  );
  expect(button('fort-gate-demolish')?.getAttribute('aria-label')).toBe('Zbořit bránu');
  await act(async () => button('fort-gate-demolish')!.click());
  expect(onAction).toHaveBeenLastCalledWith(7, 2, { kind: 'gate-demolish' });
  await act(async () => button('fort-gate-abandon')!.click());
  expect(onAction).toHaveBeenLastCalledWith(7, 2, { kind: 'gate-abandon', abandoned: true });
});

it('opuštěná brána má Vrátit, zboření s důvodem je zašedlé', async () => {
  const onAction = vi.fn(() => Promise.resolve());
  const details = gate({
    abandoned: true,
    demolish: {
      work: 'demolish',
      cost: { laborManDays: 0, logs: 0 },
      blocked: 'Stavba už běží.',
    },
  });
  act(() => root.render(<FortGateBody details={details} onAction={onAction} />));
  expect(button('fort-gate-abandon')).toBeNull();
  expect(button('fort-gate-demolish')?.disabled).toBe(true);
  await act(async () => button('fort-gate-restore')!.click());
  expect(onAction).toHaveBeenLastCalledWith(7, 2, { kind: 'gate-abandon', abandoned: false });
});
