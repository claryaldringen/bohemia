'use client';

import { useState, type SubmitEvent, type ReactElement } from 'react';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Field, FormError, SubmitButton } from './form';

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
      // Better Auth tuhle adresu dá i do nového ověřovacího e-mailu, když e-mail ještě není
      // potvrzený – bez ní by odkaz vedl na úvodní stránku.
      callbackURL: '/game',
    });
    if (error) {
      setPending(false);
      setError(authErrorMessage(error));
      return;
    }
    // Celé načtení, aby server při renderu herní plochy viděl novou session.
    window.location.assign('/game');
  }

  async function signInWithGoogle(): Promise<void> {
    setPending(true);
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/game' });
    if (error) {
      setPending(false);
      setError(authErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <Field
          label="Heslo"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError message={error} />
        <SubmitButton pending={pending}>Přihlásit se</SubmitButton>
      </form>
      {googleEnabled && (
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={pending}
          className="w-full rounded border border-stone-300 px-4 py-2 hover:bg-stone-200 disabled:opacity-60 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Přihlásit přes Google
        </button>
      )}
    </div>
  );
}
