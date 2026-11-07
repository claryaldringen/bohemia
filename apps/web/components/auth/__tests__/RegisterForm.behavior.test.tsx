// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signUp = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })));
vi.mock('@/lib/auth-client', () => ({ authClient: { signUp: { email: signUp } } }));
vi.mock('@/app/register/actions', () => ({
  checkInviteAction: vi.fn(() => Promise.resolve({})),
}));

import { RegisterForm } from '../RegisterForm';

it('zvolený jazyk odejde v signUp.email, výchozí je čeština', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<RegisterForm />));
  const select = host.querySelector<HTMLSelectElement>('select[name="language"]')!;
  expect(select.value).toBe('cs');
  expect(select.options).toHaveLength(7);

  const set = (name: string, value: string): void => {
    const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
    const proto = input instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(input, value);
  };
  set('email', 'a@example.com');
  set('password', 'tajneheslo1');
  set('language', 'de');
  await act(async () => {
    host.querySelector('form')!.requestSubmit();
  });
  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ language: 'de' }));

  act(() => root.unmount());
  host.remove();
});
