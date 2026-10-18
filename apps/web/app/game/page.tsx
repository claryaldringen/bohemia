import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { VillageGame } from '@/components/game/VillageGame';
import { enterGameForPlayer, playerToday } from '@/lib/game';
import { encodeLandscape } from '@/lib/landscape-transfer';
import { getSession } from '@/lib/session';
import { villageViewForSeat } from '@/lib/village';
import { currentWorld } from '@/lib/world';

export default async function GamePage(): Promise<ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const [seat, today] = await Promise.all([
    enterGameForPlayer(session.user.id),
    playerToday(session.user.id),
  ]);
  const village = await villageViewForSeat(seat, today);

  return (
    <main className="h-screen overflow-hidden select-none">
      <VillageGame
        landscape={encodeLandscape(seat.landscape)}
        seed={seat.settlement.landscapeSeed}
        initialVillage={village}
        world={currentWorld()}
        timeOffsetDays={today.ok ? today.offsetDays : 0}
        devMode={session.user.devMode === true}
        email={session.user.email}
        initialNowMs={Date.now()}
      />
    </main>
  );
}
