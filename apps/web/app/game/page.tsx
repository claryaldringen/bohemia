import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { GameDateBadge } from '@/components/GameDateBadge';
import { VillageGame } from '@/components/game/VillageGame';
import { SignOutButton } from '@/components/SignOutButton';
import { enterGameForPlayer } from '@/lib/game';
import { encodeLandscape } from '@/lib/landscape-transfer';
import { getSession } from '@/lib/session';
import { villageViewForSeat } from '@/lib/village';
import { currentWorld } from '@/lib/world';

export default async function GamePage(): Promise<ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const seat = await enterGameForPlayer(session.user.id);
  const village = await villageViewForSeat(seat);

  return (
    <main className="h-screen overflow-hidden">
      <VillageGame
        landscape={encodeLandscape(seat.landscape)}
        seed={seat.settlement.landscapeSeed}
        initialVillage={village}
      />
      <header className="fixed top-0 left-0 z-10 flex items-center gap-4 rounded-br bg-stone-100/80 px-4 py-2 text-sm text-stone-600 backdrop-blur dark:bg-stone-950/70 dark:text-stone-400">
        <span className="font-serif text-lg text-stone-900 dark:text-stone-100">Bohemia</span>
        <span>{session.user.email}</span>
        <SignOutButton />
      </header>
      <GameDateBadge world={currentWorld()} initialNowMs={Date.now()} />
    </main>
  );
}
