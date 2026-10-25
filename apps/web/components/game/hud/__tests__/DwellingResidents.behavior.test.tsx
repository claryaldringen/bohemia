// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DwellingResidents } from '../selection/dwelling';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('klik na portrét obyvatele vybere osobu', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <DwellingResidents
        residents={[{ id: 7, portrait: 'man', role: 'Vojvoda', age: 40 }]}
        onSelect={onSelect}
      />,
    ),
  );
  act(() => host.querySelector('button')!.click());
  expect(onSelect).toHaveBeenCalledWith({ kind: 'person', id: 7 });
  act(() => root.unmount());
  host.remove();
});
