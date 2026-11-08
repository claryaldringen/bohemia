import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { VillageGame } from '@/components/game/VillageGame';
import { gameEntryForPlayer, languageChoiceForPlayer, playerToday } from '@/lib/game';
import { encodeLandscape } from '@/lib/landscape-transfer';
import { getSession } from '@/lib/session';
import { villageViewForEntry } from '@/lib/village';
import { selectedVillageId } from '@/lib/village-cookie';
import { currentWorld } from '@/lib/world';

export default async function GamePage(): Promise<ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  // vybraná ves z přepínače (cookie) – když hráči nepatří, otevře se jeho první ves
  const preferred = await selectedVillageId();
  const [entry, today] = await Promise.all([
    gameEntryForPlayer(session.user.id, preferred),
    playerToday(session.user.id),
  ]);
  const village = await villageViewForEntry(entry, today, session.user.id);
  const languageChoice = await languageChoiceForPlayer(session.user.id, entry.villageId !== null);

  return (
    <main className="h-screen overflow-hidden select-none">
      <VillageGame
        landscape={encodeLandscape(entry.landscape)}
        seed={entry.settlement.landscapeSeed}
        settlementId={entry.settlement.id}
        initialVillage={village}
        world={currentWorld()}
        timeOffsetDays={today.ok ? today.offsetDays : 0}
        devMode={session.user.devMode === true}
        email={session.user.email}
        languageChoice={languageChoice}
        homeCell={
          entry.settlement.worldCell
            ? { x: entry.settlement.worldCell.x, y: entry.settlement.worldCell.y }
            : null
        }
        initialNowMs={Date.now()}
      />
    </main>
  );
}
