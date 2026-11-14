import { notePlayerPresent } from '@/lib/game';
import { getSession } from '@/lib/session';
import type { WarSceneResponse } from '@/lib/war-scene-view';
import { warSceneForPlayer } from '@/lib/war-scene';

// Válka ve scéně vlastní mapy (war.md – Ve scéně – napojení na hru): scéna hry se ptá, co z války
// je vidět na mapě sídla, kterou hráč právě má – napadená ves (obránce) i vlastní vojsko na mapě.
// Mlhu války počítá server; cizí sídlo i sídlo bez války = { war: null } (nic se neprozradí).
//   GET /api/war-scene/<sídlo>   → { war: WarSceneView | null }

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(
  _request: Request,
  context: { params: Promise<{ settlementId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Nejsi přihlášený.' } satisfies WarSceneResponse, {
      status: 401,
      headers: NO_STORE,
    });
  }
  // scéna se ptá po 5 s, dokud je hra otevřená – hráč je u hry (war.md – Hráč ve vsi a mimo ni)
  await notePlayerPresent(session.user.id);
  const { settlementId } = await context.params;
  // id sídla je uuid – cokoli jiného se do úložiště vůbec neposílá
  const war = /^[0-9a-f-]{36}$/i.test(settlementId)
    ? await warSceneForPlayer(session.user.id, settlementId)
    : null;
  return Response.json({ war } satisfies WarSceneResponse, { headers: NO_STORE });
}
