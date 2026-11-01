import { DEV_MODE_ONLY } from '@bohemia/game';
import { getSession } from '@/lib/session';
import { skipProgressOf, type SkipProgressResponse } from '@/lib/skip-progress';

// Průběh přeskoku času přihlášeného hráče (vývojový režim – accounts.md, Průběh přeskoku). Route
// Handler, ne server action: Next řadí server actions jednoho klienta za sebe, takže by dotaz
// čekal, až přeskok (sám server action) skončí. Hráč vidí jen svůj průběh – id je ze session.

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Nejsi přihlášený.' }, { status: 401, headers: NO_STORE });
  }
  if (session.user.devMode !== true) {
    return Response.json({ error: DEV_MODE_ONLY }, { status: 403, headers: NO_STORE });
  }
  const body: SkipProgressResponse = { progress: skipProgressOf(session.user.id) };
  return Response.json(body, { headers: NO_STORE });
}
