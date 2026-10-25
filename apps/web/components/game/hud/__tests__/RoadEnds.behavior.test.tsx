// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RoadEndIcon } from '../selection/roads';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Konce cesty (paths.md – pravidlo 11; Martin 25. 10. 2026: „… a moci je také označit.“)
it('klik na ikonu konce cesty vybere stavbu nebo křižovatku na konci', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <RoadEndIcon
        end={{
          kind: 'junction',
          name: 'Křižovatka',
          icon: '/icons/build/krizovatka-kriz.png',
          arrow: null,
          target: { kind: 'junction', id: 565 },
          log: 'junction 565',
        }}
        testId="end"
        onSelectTarget={onSelect}
      />,
    ),
  );
  act(() => host.querySelector<HTMLButtonElement>('[data-testid="end"]')!.click());
  expect(onSelect).toHaveBeenCalledWith({ kind: 'junction', id: 565 });
  act(() => root.unmount());
  host.remove();
});

it('kraj mapy a konec nikam nejsou tlačítka – nic nevyberou', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RoadEndIcon
        end={{
          kind: 'none',
          alert: true,
          name: 'Cesta tu nikam nevede.',
          icon: null,
          arrow: null,
          target: null,
          log: 'nikam',
        }}
        testId="end"
      />,
    ),
  );
  expect(host.querySelector('button')).toBeNull();
  expect(host.querySelector('[data-testid="end"]')!.getAttribute('data-alert')).toBe('true');
  act(() => root.unmount());
  host.remove();
});

it('jiná cesta bez křižovatky je klikatelná, ale s varováním', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RoadEndIcon
        end={{
          kind: 'road',
          name: 'Cesta končí na jiné cestě bez křižovatky.',
          icon: '/icons/build/cesta.png',
          arrow: null,
          target: { kind: 'road', id: 3 },
          alert: true,
          log: 'road 3 (!)',
        }}
        testId="end"
      />,
    ),
  );
  expect(host.querySelector('button')).not.toBeNull();
  expect(host.querySelector('[data-end-kind="road"]')!.getAttribute('data-alert')).toBe('true');
  act(() => root.unmount());
  host.remove();
});
