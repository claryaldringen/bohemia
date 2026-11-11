import { restartGame } from '@/app/game/actions';
import { authClient } from '@/lib/auth-client';
import { rememberLordName } from '@/lib/lord-name-memory';
import type { VillageView } from '@/lib/village-view';
import { CONNECTION_FAILED } from './village-data';

const SIGN_OUT_FAILED = 'Odhlášení selhalo – zkus to prosím znovu.';

/**
 * Začít znovu – nové sídlo s novou krajinou, proto se stránka načte znovu. Po konci hry
 * (obrazovka porážky) bez `abandon`, z nabídky se živou vsí s `abandon` (hráč to potvrdil).
 * `shown` je právě zobrazená ves.
 */
export async function restartFrom(
  shown: VillageView | null,
  abandon: boolean,
): Promise<string | null> {
  // nový začátek předvyplní poslední jméno vojvody (lord.md – Kde se jméno zadává); po konci
  // rodu žádný vojvoda není – jméno zakladatele, které hráč zadal (lord.md – Konec rodu)
  rememberLordName(shown?.dynasty?.lordName ?? shown?.lineEnded?.lords[0]?.name);
  try {
    const result = await restartGame(abandon ? { abandon: true } : undefined);
    if ('error' in result) return result.error;
    window.location.reload();
    return null;
  } catch (error) {
    console.error('Nový začátek selhal.', error);
    return CONNECTION_FAILED;
  }
}

/** Odhlášení z nabídky – i se session už neplatnou (odhlášení v jiném panelu) na úvod. */
export async function signOutToHome(): Promise<string | null> {
  try {
    await authClient.signOut();
  } catch (error) {
    console.error('Odhlášení selhalo.', error);
    return SIGN_OUT_FAILED;
  }
  window.location.assign('/');
  return null;
}
