import { NOT_PLAYER_VILLAGE } from '@bohemia/game';
import { getAuth } from '@/lib/auth';
import { commandCampaignForPlayer } from '@/lib/campaign';
import { gameDeps, notePlayerActive } from '@/lib/game';
import { serverEventsHub } from '@/lib/server-events/hub';
import { parseEventScope } from '@/lib/server-events/protocol';
import { resolveConnectionScope } from '@/lib/server-events/scope';
import { openEventStream } from '@/lib/server-events/stream';
import { getSession } from '@/lib/session';

// Události ze serveru (docs/code/server-events.md – Spojení /api/events; plán 2026-11-15): jedno
// spojení SSE na viditelný panel, server posílá změny z LISTEN/NOTIFY místo dotazování. Rozsah
// (ves, tažení, cizí mapa) se ověří při připojení – cizí ves 403, cizí tažení se tiše zahodí.
// Otevřené spojení je přítomnost hráče (tep po 20 s) a s otevřeným tažením i přítomnost jeho vůdce
// (záměr `presence`); session se ověří znovu každých 5 min.
//   GET /api/events?village=<id>&campaign=<id>&scene=<id>@<x>,<y>   → text/event-stream

const NO_STORE = { 'Cache-Control': 'no-store' };

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  // `no-transform` – komprese Next.js (next/dist/compiled/compression) odpověď přeskočí, jinak by
  // události držela v bufferu a poslala pozdě a najednou
  'Cache-Control': 'no-cache, no-transform',
  // proxy (nginx, Caddy s `flush_interval`) odpověď nebufferuje
  'X-Accel-Buffering': 'no',
};

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Nejsi přihlášený.' }, { status: 401, headers: NO_STORE });
  }
  const scope = parseEventScope(new URL(request.url).searchParams);
  if (!scope) {
    return Response.json({ error: 'Neplatný dotaz.' }, { status: 400, headers: NO_STORE });
  }
  const playerId = session.user.id;
  const resolved = await resolveConnectionScope(gameDeps(), playerId, scope);
  if (resolved === 'forbidden') {
    return Response.json({ error: NOT_PLAYER_VILLAGE }, { status: 403, headers: NO_STORE });
  }
  // session se dál ověřuje z cookie zachycené při připojení (Rozhodnutí 10), práva rozsahu
  // s ní znovu (sesazený správce, ztracené sídlo – revize Úlohy 2)
  const cookie = request.headers.get('cookie') ?? '';
  const stream = openEventStream({
    hub: serverEventsHub(),
    scope: resolved,
    signal: request.signal,
    onHeartbeat: () => notePlayerActive(playerId),
    // odmítnutí (hráč tažení nevede živě, skončilo) se zahodí – jen vůdce živého tažení
    campaignPresence: (campaignId) =>
      commandCampaignForPlayer(playerId, campaignId, { kind: 'presence' }),
    sessionValid: async () =>
      (await getAuth().api.getSession({ headers: new Headers({ cookie }) })) !== null,
    rescope: () => resolveConnectionScope(gameDeps(), playerId, scope),
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
