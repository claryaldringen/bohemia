'use client';

import { useState, type SubmitEvent, type ReactElement } from 'react';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { LANGUAGE_GROUPS, DEFAULT_LANGUAGE } from '@bohemia/game';
import { LANGUAGE_NAMES } from '@/lib/language-names';
import { checkInviteAction } from '@/app/register/actions';
import { Field, FormError, Notice, SubmitButton } from './form';

export function RegisterForm({ initialInvite = '' }: { initialInvite?: string }): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [inviteError, setInviteError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    setPending(true);
    setError(undefined);
    setInviteError(undefined);
    // Neplatná pozvánka registraci nezastaví – jen se ozve u pole a pokračuje se bez ní.
    const invite = String(form.get('invite') ?? '').trim();
    const checked = await checkInviteAction(invite);
    if (invite && checked.error) setInviteError(checked.error);
    const { error } = await authClient.signUp.email({
      email,
      password: String(form.get('password')),
      // Jméno se při registraci nezadává – hráč si později pojmenuje rod.
      name: '',
      language: String(form.get('language')),
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
        <FormError message={inviteError && `${inviteError} Registrace proběhla bez ní.`} />
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
      <label className="block">
        <span className="mb-1 block text-sm text-stone-700 dark:text-stone-300">Jazyk</span>
        <select
          name="language"
          defaultValue={DEFAULT_LANGUAGE}
          className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
        >
          {LANGUAGE_GROUPS.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Pozvánka"
        name="invite"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={16}
        defaultValue={initialInvite}
      />
      <FormError message={inviteError} />
      <FormError message={error} />
      <SubmitButton pending={pending}>Zaregistrovat se</SubmitButton>
    </form>
  );
}
