'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ServerEventsChannel } from '@/lib/server-events/client';
import type { EventScope, ServerEventName, ServerEvents } from '@/lib/server-events/protocol';

// Události ze serveru v Reactu (docs/code/server-events.md – Klient): `ServerEventsProvider` dá
// klienta do kontextu, hooky se na něj přihlásí. Bez poskytovatele (testy, jiné stránky) hooky
// nedělají nic.

export const ServerEventsContext = createContext<ServerEventsChannel | null>(null);

/** Obslouží událost `name`; obsluha se smí měnit při každém vykreslení. */
export function useServerEvent<K extends ServerEventName>(
  name: K,
  handler: (data: ServerEvents[K]) => void,
): void {
  const channel = useContext(ServerEventsContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => {
    if (channel === null) return;
    return channel.on(name, (data) => handlerRef.current(data));
  }, [channel, name]);
}

/**
 * Část rozsahu spojení, kterou tato komponenta ukazuje (ves, tažení, cizí mapa). Při odpojení
 * nebo změně vrátí své klíče na null – klient výměny jednoho vykreslení sloučí.
 */
export function useEventScope(part: Partial<EventScope>): void {
  const channel = useContext(ServerEventsContext);
  // klíč místo objektu – nový objekt při každém vykreslení rozsah nemění
  const key = JSON.stringify(part);
  useEffect(() => {
    if (channel === null) return;
    const value = JSON.parse(key) as Partial<EventScope>;
    channel.setScope(value);
    const cleared = Object.fromEntries(Object.keys(value).map((k) => [k, null]));
    return () => channel.setScope(cleared as Partial<EventScope>);
  }, [channel, key]);
}

/** Obnova všeho, co komponenta ukazuje – po `sync` s mezerou a v kole pojistky. */
export function useServerResync(refresh: () => void): void {
  const channel = useContext(ServerEventsContext);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (channel === null) return;
    return channel.onResync(() => refreshRef.current());
  }, [channel]);
}

/**
 * Dotaz na server se slučováním: jeden běh naráz, volání během běhu dají nejvýš jeden další po
 * něm (náraz událostí nevyvolá nával dotazů). Po odpojení komponenty nic. Chyba jde do konzole
 * s textem `failure`.
 */
export function useSerialRefresh(run: () => Promise<void>, failure: string): () => void {
  const runRef = useRef(run);
  const failureRef = useRef(failure);
  const aliveRef = useRef(false);
  useEffect(() => {
    runRef.current = run;
    failureRef.current = failure;
  }, [run, failure]);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [refresh] = useState(() => {
    let running = false;
    let again = false;
    const go = (): void => {
      if (!aliveRef.current) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      let done: Promise<void>;
      try {
        done = runRef.current();
      } catch (error) {
        done = Promise.reject(error);
      }
      void done
        .catch((error: unknown) => console.warn(failureRef.current, error))
        .finally(() => {
          running = false;
          if (again) {
            again = false;
            go();
          }
        });
    };
    return go;
  });
  return refresh;
}
