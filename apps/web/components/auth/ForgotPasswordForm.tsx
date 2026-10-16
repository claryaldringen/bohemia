'use client';

import { useState, type SubmitEvent, type ReactElement } from 'react';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Field, FormError, Notice, SubmitButton } from './form';

export function ForgotPasswordForm(): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get('email')),
      redirectTo: '/reset-password',
    });
    setPending(false);
    if (error) setError(authErrorMessage(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <Notice title="Zkontroluj e-mail">
        Pokud k adrese existuje účet, poslali jsme na ni odkaz na nastavení nového hesla.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <FormError message={error} />
      <SubmitButton pending={pending}>Poslat odkaz</SubmitButton>
    </form>
  );
}
