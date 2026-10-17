import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { VillageGame } from '@/components/game/VillageGame';
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
    <main className="h-screen overflow-hidden select-none">
      <VillageGame
        landscape={encodeLandscape(seat.landscape)}
        seed={seat.settlement.landscapeSeed}
        initialVillage={village}
        world={currentWorld()}
        email={session.user.email}
        initialNowMs={Date.now()}
      />
    </main>
  );
}
