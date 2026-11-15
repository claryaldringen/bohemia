import { getSession } from '@/lib/session';
import {
  journeyMapForPlayer,
  expeditionViewsForPlayer,
  knownMapForPlayer,
  knownVillagesForPlayer,
  expeditionVisitorsOnVillage,
} from '@/lib/journey';
import type { JourneyResponse } from '@/lib/journey-view';
import { parseVillageId } from '@/lib/village-input';

// Pohled na výpravy (expeditions.md; plán 2026-11-14 – Úloha 7): pohyb nese událost serveru `journeys`
// (server-events.md); route zůstává pro dotaz při otevření, po `sync` a pro pojistku. Route Handler, ne server action – Next řadí server actions jednoho klienta za sebe,
// takže by dotaz čekal za rozkazem hráče. Hráč vidí jen své výpravy; cizí i neexistující = stejná
// odpověď (nic se neprozradí).
//   GET /api/journey                  → { views } – pohledy na všechny výpravy hráče (prázdné = žádnou nemá)
//   GET /api/journey?map=<x>,<y>      → { map } – krajina políčka hloučku a jeho sousedů, jinak 404
//   GET /api/journey?known=<x>,<y>    → { map, seen } – mapa, jak ji zná rod hráče, jinak 404
//   GET /api/journey?known=villages   → { known } – mapy, které rod zná, a rod na nich
//   GET /api/journey?visitors=<id>    → { visitors } – skupiny výprav na mapě vsi hráče

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
  const known = query.get('known');
  if (known === 'villages') {
    return Response.json({ known: await knownVillagesForPlayer(playerId) }, { headers: NO_STORE });
  }
  if (known !== null) {
    const cell = cellOf(known);
    const found = cell ? await knownMapForPlayer(playerId, cell) : null;
    return found ? Response.json(found, { headers: NO_STORE }) : notFound();
  }
  const visitors = query.get('visitors');
  if (visitors !== null) {
    const villageId = parseVillageId(visitors);
    if (villageId === null) return notFound();
    return Response.json(
      { visitors: await expeditionVisitorsOnVillage(playerId, villageId) },
      { headers: NO_STORE },
    );
  }
  const views = await expeditionViewsForPlayer(playerId);
  return Response.json({ views } satisfies JourneyResponse, { headers: NO_STORE });
}

/** Políčko světa z dotazu `x,y`; jinak null. */
function cellOf(text: string): { x: number; y: number } | null {
  const match = /^(-?\d{1,4}),(-?\d{1,4})$/.exec(text);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}
