'use client';

import type { ReactElement } from 'react';
import { authClient } from '@/lib/auth-client';

export function SignOutButton(): ReactElement {
  async function signOut(): Promise<void> {
    await authClient.signOut();
    window.location.assign('/');
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="underline hover:text-stone-900 dark:hover:text-stone-100"
    >
      Odhlásit
    </button>
  );
}
