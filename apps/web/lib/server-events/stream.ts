import 'server-only';
import type { Hub, Sink } from './hub';
import {
  SERVER_EVENTS_PROTOCOL,
  formatServerEvent,
  type ServerEventName,
  type ServerEvents,
} from './protocol';
import { sameScope, type ConnectionScope } from './routing';

// Proud jednoho spojení SSE (docs/code/server-events.md – Spojení /api/events; plán 2026-11-15 –
// Rozhodnutí 6, 7 a 10): `retry`, přidání do rozbočovače, `sync`, tep s přítomností hráče (a vůdce
// u otevřeného tažení), kontrola session a práv rozsahu. Úklid (rozbočovač, časovače) proběhne
// jednou – při odpojení, zrušení, chybě zápisu, přetečení fronty, neplatné session, změně rozsahu
// i zavření rozbočovačem.

/** Za jak dlouho se prohlížeč po přerušení připojí sám (`retry:`). */
export const SSE_RETRY_MS = 3_000;
/** Tep – komentář `: ping` drží spojení přes proxy a zapíše přítomnost hráče (`absentTicks` ≈ 86 s). */
export const SSE_HEARTBEAT_MS = 20_000;
/** Kontrola session z cookie zachycené při připojení a znovu ověření rozsahu (práva se mění). */
export const SESSION_RECHECK_MS = 300_000;
/** Nejvíc bajtů ve frontě nepřečtených událostí – pomalé spojení se nad ní zavře. */
export const MAX_QUEUED_BYTES = 1_048_576;

const encoder = new TextEncoder();

export function openEventStream(input: {
  hub: Hub;
  scope: ConnectionScope;
  signal: AbortSignal;
  onHeartbeat(): Promise<void>;
  /**
   * Přítomnost vůdce u tažení otevřeného v rozsahu (záměr `presence` – war.md – Velení): při
   * připojení a v každém tepu, jen s `scope.campaignId`. Odmítnutí (hráč nevede živě) i chyba se
   * zahodí – nahrazuje maják, který dřív posílal prohlížeč po 20 s.
   */
  campaignPresence(campaignId: string): Promise<unknown>;
  sessionValid(): Promise<boolean>;
  /**
   * Rozsah znovu ověřený (`resolveConnectionScope`) – sesazený správce, ztracené sídlo nebo
   * skončené tažení; `'forbidden'` i jiný rozsah než při připojení spojení zavře (revize Úlohy 2).
   */
  rescope(): Promise<ConnectionScope | 'forbidden'>;
}): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let sink: Sink | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let recheck: ReturnType<typeof setInterval> | null = null;
  let finished = false;

  /**
   * Konec spojení, nejvýš jednou: `close` – fronta se ještě dočte, `error` – fronta se zahodí
   * (přetečení), null – proud už skončil sám (zrušení čtenářem, chyba zápisu).
   */
  const end = (how: 'close' | 'error' | null): void => {
    if (finished) return;
    finished = true;
    if (heartbeat) clearInterval(heartbeat);
    if (recheck) clearInterval(recheck);
    input.signal.removeEventListener('abort', onAbort);
    if (sink) input.hub.remove(sink.id);
    if (how === null || !controller) return;
    try {
      if (how === 'close') controller.close();
      else controller.error(new Error('Fronta událostí přetekla.'));
    } catch {
      // proud už je zavřený nebo zrušený
    }
  };
  const onAbort = (): void => end('close');

  const write = (text: string): void => {
    if (finished || !controller) return;
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      end(null);
      return;
    }
    if ((controller.desiredSize ?? 0) < 0) end('error');
  };

  /** Spustí zápis a chybu zahodí – přítomnost je jen nápověda, výpadek databáze ukáže jiný log. */
  const quietly = (run: () => Promise<unknown>): void => {
    try {
      run().catch(() => {
        // přítomnost je jen nápověda pro workera
      });
    } catch {
      // totéž pro chybu vyhozenou hned
    }
  };

  const beat = (): void => {
    quietly(() => input.onHeartbeat());
    const campaignId = input.scope.campaignId;
    if (campaignId !== null) quietly(() => input.campaignPresence(campaignId));
  };

  /** Session a pak práva rozsahu; neplatné spojení zavře (prohlížeč se připojí s čerstvým). */
  const checkAccess = async (): Promise<void> => {
    let valid = true;
    try {
      valid = await input.sessionValid();
      if (valid) {
        const scope = await input.rescope();
        valid = scope !== 'forbidden' && sameScope(input.scope, scope);
      }
    } catch {
      // výpadek databáze – spojení zůstane, další kontrola za SESSION_RECHECK_MS
    }
    if (!valid) end('close');
  };

  return new ReadableStream<Uint8Array>(
    {
      start(streamController): void {
        controller = streamController;
        if (input.signal.aborted) {
          end('close');
          return;
        }
        write(`retry: ${SSE_RETRY_MS}\n\n`);
        if (finished) return;
        // napřed do rozbočovače, pak `sync` – změna mezi tím se neztratí
        sink = input.hub.add({
          scope: input.scope,
          send: (name, data) =>
            write(formatServerEvent(name, data as ServerEvents[ServerEventName])),
          close: () => end('close'),
        });
        sink.send('sync', { protocol: SERVER_EVENTS_PROTOCOL });
        // zápis mohl spojení ukončit – časovače už nezakládat
        if (finished) return;
        beat();
        heartbeat = setInterval(() => {
          write(': ping\n\n');
          beat();
        }, SSE_HEARTBEAT_MS);
        recheck = setInterval(() => void checkAccess(), SESSION_RECHECK_MS);
        input.signal.addEventListener('abort', onAbort, { once: true });
      },
      cancel(): void {
        end(null);
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: MAX_QUEUED_BYTES }),
  );
}
