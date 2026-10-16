'use client';

import Link from 'next/link';
import { useState, type SubmitEvent, type ReactElement } from 'react';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Field, FormError, Notice, SubmitButton } from './form';

export function ResetPasswordForm({ token }: { token: string }): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    const { error } = await authClient.resetPassword({
      newPassword: String(form.get('password')),
      token,
    });
    setPending(false);
    if (error) setError(authErrorMessage(error));
    else setDone(true);
  }

  if (done) {
    return (
      <Notice title="Heslo je změněné">
        <Link href="/login" className="underline">
          Přihlas se novým heslem
        </Link>
        .
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Nové heslo"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        required
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>Nastavit heslo</SubmitButton>
    </form>
  );
}
