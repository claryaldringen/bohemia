// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHURCH, churchCost, defaultChurchDims, type ChurchDims } from '@bohemia/game';
import type { SelectionDetails } from '@/lib/selection-details';
import { ChurchConfirm } from '../ChurchConfirm';
import { ChurchDimsPanel } from '../ChurchDimsPanel';
import { ChurchBody } from '../selection/church';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (id: string): HTMLElement | null => container.querySelector(`[data-testid="${id}"]`);

const work = { foundation: 1, quarry: 1, lime: 0.25, sand: 1, walls: 0.104, roof: 0, decor: 0 };
const site: Extract<SelectionDetails, { kind: 'church' }> = {
  kind: 'church',
  id: 40,
  type: 'rotunda',
  dims: defaultChurchDims('rotunda'),
  built: false,
  decorated: false,
  site: { work, blocked: 'limeBurner' },
  capacity: 44,
  coverage: 0.6,
  graves: { used: 0, total: 60 },
};

it('staveniště: postup po druzích práce v %, chybějící mistr, kapacita a hroby', () => {
  act(() => root.render(<ChurchBody details={site} />));
  expect(q('selection-church-work-lime')?.textContent).toContain('25 %');
  expect(q('selection-church-work-walls')?.textContent).toContain('10 %');
  expect(q('selection-church-blocked')).not.toBeNull();
  expect(q('selection-church-capacity')?.textContent).toContain('44');
  expect(q('selection-church-graves')?.textContent).toContain('0 / 60');
  expect(q('selection-church-priest')).toBeNull();
  expect(q('selection-church-coverage')).toBeNull();
});

it('dostavěný kostel: bez postupu, s knězem', () => {
  const built = { ...site, built: true, site: undefined, priest: true };
  act(() => root.render(<ChurchBody details={built} />));
  expect(q('selection-church-work')).toBeNull();
  expect(q('selection-church-blocked')).toBeNull();
  expect(q('selection-church-priest')?.textContent).toContain('1');
  expect(q('selection-church-coverage')?.textContent).toContain('60 %');
  expect(q('selection-church-graves')?.textContent).toContain('0 / 60');
});

it('panel u potvrzení: +/− mění míry v mezích, kladivo zašedlé s důvodem', () => {
  const onDims = vi.fn();
  const onConfirm = vi.fn();
  const dims = { kind: 'long', width: CHURCH.limits.width.max, length: 8, height: 7 } as const;
  act(() =>
    root.render(
      <ChurchConfirm
        type="chancel"
        dims={dims}
        reason="Kostel se překrývá s obydlím."
        onDims={onDims}
        onConfirm={onConfirm}
      />,
    ),
  );
  expect(q('church-width-value')?.textContent).toBe(String(CHURCH.limits.width.max));
  expect((q('church-width-more') as HTMLButtonElement).disabled).toBe(true);
  act(() => (q('church-height-more') as HTMLButtonElement).click());
  expect(onDims).toHaveBeenCalledWith({ ...dims, height: 7.5 });
  act(() => (q('church-confirm') as HTMLButtonElement).click());
  expect(onConfirm).not.toHaveBeenCalled();
  // rotunda: průměr a výška, bez šířky
  act(() =>
    root.render(
      <ChurchConfirm
        type="rotunda"
        dims={defaultChurchDims('rotunda')}
        reason={null}
        onDims={onDims}
        onConfirm={onConfirm}
      />,
    ),
  );
  expect(q('church-measure-diameter')).not.toBeNull();
  expect(q('church-measure-width')).toBeNull();
  act(() => (q('church-confirm') as HTMLButtonElement).click());
  expect(onConfirm).toHaveBeenCalled();
});

it('panel rozměrů: cena se mění s rozměry, Umístit a Enter jdou k umisťování, Esc zavře', () => {
  const onPlace = vi.fn();
  const onClose = vi.fn();
  let dims: ChurchDims = defaultChurchDims('chancel');
  const render = (): void =>
    act(() =>
      root.render(
        <ChurchDimsPanel
          type="chancel"
          dims={dims}
          onDims={(next) => {
            dims = next;
          }}
          onPlace={onPlace}
          onClose={onClose}
        />,
      ),
    );
  render();
  const costText = (): string => q('church-dims-cost')?.textContent ?? '';
  const before = costText();
  expect(before).not.toBe('');
  act(() => (q('church-length-more') as HTMLButtonElement).click());
  expect(dims).toMatchObject({ length: 8.5 });
  render();
  expect(costText()).not.toBe(before);
  expect(churchCost('chancel', dims).stoneM3).toBeGreaterThan(
    churchCost('chancel', defaultChurchDims('chancel')).stoneM3,
  );
  act(() => (q('church-dims-place') as HTMLButtonElement).click());
  expect(onPlace).toHaveBeenCalledTimes(1);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
  });
  expect(onPlace).toHaveBeenCalledTimes(2);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});
