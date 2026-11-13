import { getSession } from '@/lib/session';
import { journeyMapForPlayer, journeyViewForPlayer, visitorsOnVillage } from '@/lib/journey';
import type { JourneyResponse } from '@/lib/journey-view';
import { parseVillageId } from '@/lib/village-input';

// Pohled na výjezd vojvody (lord-control.md; plán 2026-11-13 – Úloha 7): prohlížeč se ptá 2× za
// sekundu. Route Handler, ne server action – Next řadí server actions jednoho klienta za sebe,
// takže by dotaz čekal za rozkazem hráče. Hráč vidí jen svůj výjezd; cizí i neexistující = stejná
// odpověď (nic se neprozradí).
//   GET /api/journey                  → { view } – celý pohled, null = hráč žádný výjezd nemá
//   GET /api/journey?map=<x>,<y>      → { map } – krajina políčka skupiny a jeho sousedů, jinak 404
//   GET /api/journey?visitors=<id>    → { visitors } – jezdci na mapě vsi hráče

const NO_STORE = { 'Cache-Control': 'no-store' };
const NOT_FOUND = 'Tu mapu rod nezná.';

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Nejsi přihlášený.' }, { status: 401, headers: NO_STORE });
  }
  const playerId = session.user.id;
  const notFound = (): Response =>
    Response.json({ error: NOT_FOUND } satisfies JourneyResponse, {
      status: 404,
      headers: NO_STORE,
    });
  const query = new URL(request.url).searchParams;
  const map = query.get('map');
  if (map !== null) {
    const cell = cellOf(map);
    const foreign = cell ? await journeyMapForPlayer(playerId, cell) : null;
    return foreign ? Response.json({ map: foreign }, { headers: NO_STORE }) : notFound();
  }
  const visitors = query.get('visitors');
  if (visitors !== null) {
    const villageId = parseVillageId(visitors);
    if (villageId === null) return notFound();
    return Response.json(
      { visitors: await visitorsOnVillage(playerId, villageId) },
      { headers: NO_STORE },
    );
  }
  const view = await journeyViewForPlayer(playerId);
  return Response.json({ view } satisfies JourneyResponse, { headers: NO_STORE });
}

/** Políčko světa z dotazu `x,y`; jinak null. */
function cellOf(text: string): { x: number; y: number } | null {
  const match = /^(-?\d{1,4}),(-?\d{1,4})$/.exec(text);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}
