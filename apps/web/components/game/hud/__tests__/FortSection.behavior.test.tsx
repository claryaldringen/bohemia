// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FortAssaultView, FortWorkOption } from '@/lib/fort-view';
import type { SelectionDetails } from '@/lib/selection-details';
import { FortGateBody, FortSectionBody, formatAssaultHours } from '../selection/fortification';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Panel úseku a brány (fortifications.md – Hradby a obrana, Rozhraní a scéna; plán hradeb,
// Úloha 17): nabídka Vylepšit podle možností úseku (zašedlá s důvodem), Doplnit val, Napustit
// příkop, ikony postupů útočníka s časem se 4 muži (zašedlé, kde postup nejde), obsazení hradby;
// u brány Klešťová brána a Věž.

type Section = Extract<SelectionDetails, { kind: 'fortification-section' }>;
type Gate = Extract<SelectionDetails, { kind: 'fortification-gate' }>;

const NO_COST = { laborManDays: 0, logs: 0 };
const OK: FortWorkOption = { cost: { laborManDays: 90, logs: 12 }, blocked: null };

const ASSAULT: FortAssaultView[] = [
  { icon: 'ladder', method: 'ladder', hours4: 1.5 },
  { icon: 'cut', method: 'cut', hours4: 30 },
  { icon: 'burn', method: 'burn', hours4: 6 },
  { icon: 'dig', method: null, hours4: null },
];

const section = (over: Partial<Section['section']> = {}): Section => ({
  kind: 'fortification-section',
  id: 7,
  fortKind: 'palisade',
  section: {
    segments: [4, 5, 6],
    gateSegment: 4,
    lengthM: 40,
    parts: 3,
    builtParts: 3,
    weakest: 1,
    oldParts: 0,
    ageYears: 2,
    demolish: { work: 'demolish', cost: { laborManDays: 16, logs: 6 }, blocked: null },
    upgrades: [
      { target: 'walkway', option: { ...OK, cost: { ...OK.cost, stoneM3: 0 } } },
      {
        target: 'crib',
        option: {
          cost: { laborManDays: 420, logs: 130, stoneM3: 40 },
          blocked: 'Chybí 40 m³ kamene.',
        },
      },
    ],
    assault: ASSAULT,
    rampartAdd: { cost: { laborManDays: 60, logs: 0 }, blocked: null },
    moat: null,
    ...over,
  },
  occupancy: { men: 8, lengthM: 160, share: 0.25 },
});

const gate = (over: Partial<Gate['gate']> = {}): Gate => ({
  kind: 'fortification-gate',
  id: 7,
  fortKind: 'palisade',
  gate: {
    segment: 4,
    state: 1,
    old: false,
    ageYears: 2,
    pincer: { cost: { laborManDays: 108, logs: 19 }, blocked: null },
    tower: { cost: NO_COST, blocked: 'Věž stojí jen na klešťové bráně.' },
    assault: ASSAULT.slice(0, 3),
    ...over,
  },
  road: null,
  reroutes: [],
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

const byId = (id: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const buttonOf = (id: string): HTMLButtonElement => byId(id) as HTMLButtonElement;

it('nabídka Vylepšit podle možností úseku – zašedlá s důvodem, klik pošle cíl a díl úseku', () => {
  const onAction = vi.fn(() => Promise.resolve());
  act(() => root.render(<FortSectionBody details={section()} onAction={onAction} />));
  expect(buttonOf('fort-upgrade-walkway').disabled).toBe(false);
  expect(buttonOf('fort-upgrade-walkway').getAttribute('aria-label')).toBe(
    'Vylepšit na palisádu s ochozem',
  );
  expect(buttonOf('fort-upgrade-crib').disabled).toBe(true);
  expect(byId('fort-upgrade-chamber')).toBeNull();
  expect(host.textContent).toContain('Chybí 40 m³ kamene.');
  act(() => buttonOf('fort-upgrade-walkway').click());
  expect(onAction).toHaveBeenCalledWith(7, 4, { kind: 'upgrade', target: 'walkway' });
});

it('Doplnit val a Napustit příkop – jen co úsek nabízí; klik pošle akci', () => {
  const onAction = vi.fn(() => Promise.resolve());
  act(() => root.render(<FortSectionBody details={section()} onAction={onAction} />));
  expect(byId('fort-moat')).toBeNull();
  act(() => buttonOf('fort-rampart-add').click());
  expect(onAction).toHaveBeenCalledWith(7, 4, { kind: 'rampart' });
  act(() =>
    root.render(
      <FortSectionBody
        details={section({
          rampartAdd: null,
          moat: { cost: { laborManDays: 0, logs: 0 }, blocked: 'Příkop nedosáhne k vodě.' },
        })}
        onAction={onAction}
      />,
    ),
  );
  expect(byId('fort-rampart-add')).toBeNull();
  expect(buttonOf('fort-moat').disabled).toBe(true);
  expect(host.textContent).toContain('Příkop nedosáhne k vodě.');
});

it('ikony postupů útočníka s časem se 4 muži, postup, který nejde, zašedlý; obsazení', () => {
  act(() => root.render(<FortSectionBody details={section()} />));
  expect(byId('selection-fort-assault-ladder')!.textContent).toBe('2 h');
  expect(byId('selection-fort-assault-cut')!.textContent).toBe('1 d 6 h');
  expect(byId('selection-fort-assault-burn')!.textContent).toBe('6 h');
  expect(byId('selection-fort-assault-dig')!.dataset.blocked).toBe('true');
  expect(host.textContent).toContain('Žebříky – 2 h se 4 muži');
  expect(byId('selection-fort-occupancy')!.textContent).toBe('25 %');
  expect(host.textContent).toContain('Obsazení hradby – 8 mužů na 160 m');
  expect(formatAssaultHours(48)).toBe('2 d');
});

it('brána: Klešťová brána pošle úroveň s dílem brány, Věž zašedlá s důvodem', () => {
  const onAction = vi.fn(() => Promise.resolve());
  act(() => root.render(<FortGateBody details={gate()} onAction={onAction} />));
  expect(buttonOf('fort-gate-tower').disabled).toBe(true);
  expect(host.textContent).toContain('Věž stojí jen na klešťové bráně.');
  act(() => buttonOf('fort-gate-pincer').click());
  expect(onAction).toHaveBeenCalledWith(7, 4, { kind: 'gate', level: 'pincer' });
  // u plotu klešťová brána zašedlá (důvod z jádra), hotová věž tlačítko nemá
  act(() =>
    root.render(
      <FortGateBody
        details={gate({
          pincer: { cost: NO_COST, blocked: 'Bránu jde vylepšit až u palisády.' },
          tower: null,
        })}
        onAction={onAction}
      />,
    ),
  );
  expect(buttonOf('fort-gate-pincer').disabled).toBe(true);
  expect(byId('fort-gate-tower')).toBeNull();
});
