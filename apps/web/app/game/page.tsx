import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { GameDateBadge } from '@/components/GameDateBadge';
import { SignOutButton } from '@/components/SignOutButton';
import { getSession } from '@/lib/session';
import { currentWorld } from '@/lib/world';

export default async function GamePage(): Promise<ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <main className="min-h-screen px-4 py-3">
      <header className="flex items-center gap-4 text-sm text-stone-600 dark:text-stone-400">
        <span className="font-serif text-lg text-stone-900 dark:text-stone-100">Bohemia</span>
        <span>{session.user.email}</span>
        <SignOutButton />
      </header>
      <GameDateBadge world={currentWorld()} initialNowMs={Date.now()} />
      <p className="mt-32 text-center font-serif text-xl text-stone-500">
        Tady jednou bude tvoje panství.
      </p>
    </main>
  );
}
