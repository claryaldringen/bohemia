import { getSession } from '@/lib/session';
import { campaignViewForPlayer } from '@/lib/campaign';
import type { CampaignResponse } from '@/lib/campaign-view';
import { foreignMapForPlayer } from '@/lib/foreign-map';
import { warSceneOnMapForPlayer } from '@/lib/war-scene';
import type { WarSceneResponse } from '@/lib/war-scene-view';

// Pohled na tažení (war.md – Mlha války; plán 2026-11-03 – Úloha 6.14): pohled nese událost serveru `campaign`
// (server-events.md); route zůstává pro dotaz při otevření, po `sync` a pro pojistku. Route Handler, ne server action – Next řadí server actions jednoho klienta za sebe,
// takže by dotaz čekal za pokynem hráče. Hráč vidí jen tažení, ve kterém vede nebo má muže;
// cizí tažení i neexistující = stejná odpověď 404 (nic se neprozradí).
//   GET /api/campaign/<id>?since=<takt>   → { view }
//   GET /api/campaign/<id>?map=<x>,<y>    → { map } – krajina políčka, které vojsko zná
//   GET /api/campaign/<id>?scene=<x>,<y>  → { war } – válka na té mapě z pohledu útočníka (scéna
//                                           cizí mapy, war.md – Ve scéně); null = nic k vidění

const NO_STORE = { 'Cache-Control': 'no-store' };
const NOT_FOUND = 'To tažení neznáš.';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Nejsi přihlášený.' }, { status: 401, headers: NO_STORE });
  }
  const { id } = await context.params;
  const notFound = (): Response =>
    Response.json({ error: NOT_FOUND } satisfies CampaignResponse, {
      status: 404,
      headers: NO_STORE,
    });
  // id tažení je uuid – cokoli jiného se do úložiště vůbec neposílá
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
  const query = new URL(request.url).searchParams;
  const map = query.get('map');
  if (map !== null) {
    const cell = cellOf(map);
    if (!cell) return notFound();
    const foreign = await foreignMapForPlayer(session.user.id, id, cell);
    return foreign ? Response.json({ map: foreign }, { headers: NO_STORE }) : notFound();
  }
  const scene = query.get('scene');
  if (scene !== null) {
    const cell = cellOf(scene);
    // cizí tažení i mapa bez vojska = { war: null } – nic se neprozradí
    const war = cell ? await warSceneOnMapForPlayer(session.user.id, id, cell) : null;
    return Response.json({ war } satisfies WarSceneResponse, { headers: NO_STORE });
  }
  const since = Number(query.get('since') ?? '-1');
  const view = await campaignViewForPlayer(
    session.user.id,
    id,
    Number.isSafeInteger(since) ? since : -1,
  );
  if (!view) return notFound();
  return Response.json({ view } satisfies CampaignResponse, { headers: NO_STORE });
}

/** Políčko světa z dotazu `x,y`; jinak null. */
function cellOf(text: string): { x: number; y: number } | null {
  const match = /^(-?\d{1,4}),(-?\d{1,4})$/.exec(text);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}
