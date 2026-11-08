// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { FortGateBody } from '../selection/fortification';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Úsek od brány k bráně jinudy (demolition.md – Rozhodnutí; Martin 8. 11. 2026): zbořený úsek
// nejde kliknout (mezera), proto tlačítko „Postavit jinudy“ nese brána u něj – klik otevře editor
// trasy (`onReroute` s dílem úseku a hradbou); během stavby na opevnění je zašedlé.

type Gate = Extract<SelectionDetails, { kind: 'fortification-gate' }>;

const gate = (over: Partial<Gate> = {}): Gate => ({
  kind: 'fortification-gate',
  id: 7,
  fortKind: 'palisade',
  gate: { segment: 2, state: 1, old: false, ageYears: 3 },
  road: null,
  reroutes: [{ segment: 2, target: 'palisade' }],
  busy: false,
  ...over,
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

function render(details: Gate, onReroute?: Parameters<typeof FortGateBody>[0]['onReroute']): void {
  act(() => root.render(<FortGateBody details={details} onReroute={onReroute} />));
}

const reroute = (): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('[data-testid="fort-reroute"]');

it('brána u zbořeného úseku – Postavit jinudy otevře editor s dílem úseku a hradbou', () => {
  const onReroute = vi.fn();
  render(gate(), onReroute);
  const button = reroute()!;
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-label')).toContain('Postavit úsek jinudy');
  act(() => button.click());
  expect(onReroute).toHaveBeenCalledWith(7, 2, 'palisade');
});

it('na opevnění se staví nebo se u hradby bojuje – zašedlé; bez zbořeného úseku tlačítko není', () => {
  const onReroute = vi.fn();
  render(gate({ busy: true }), onReroute);
  expect(reroute()!.disabled).toBe(true);
  act(() => reroute()!.click());
  expect(onReroute).not.toHaveBeenCalled();
  // u hradby se bojuje (cizí vojsko dnes na mapě vsi) – zašedlé
  render(gate({ contested: true }), onReroute);
  expect(reroute()!.disabled).toBe(true);
  render(gate({ reroutes: [] }), onReroute);
  expect(reroute()).toBeNull();
});
