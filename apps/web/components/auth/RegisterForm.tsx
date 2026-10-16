'use client';

import { useState, type SubmitEvent, type ReactElement } from 'react';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Field, FormError, Notice, SubmitButton } from './form';

export function RegisterForm(): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    setPending(true);
    setError(undefined);
    const { error } = await authClient.signUp.email({
      email,
      password: String(form.get('password')),
      // Jméno se při registraci nezadává – hráč si později pojmenuje rod.
      name: '',
      callbackURL: '/game',
    });
    setPending(false);
    if (error) setError(authErrorMessage(error));
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <Notice title="Zkontroluj e-mail">
        Na adresu {sentTo} jsme poslali odkaz. Po jeho otevření je registrace hotová a vstoupíš do
        hry.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <Field
        label="Heslo"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        required
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>Zaregistrovat se</SubmitButton>
    </form>
  );
}
