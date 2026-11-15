import type { ReactElement, ReactNode } from 'react';
import type { ServerEventsChannel } from '@/lib/server-events/client';
import type { EventScope, ServerEventName, ServerEvents } from '@/lib/server-events/protocol';
import { ServerEventsContext } from '../use-server-events';

// Falešný kontext událostí ze serveru pro testy hooků (server-events.md – Klient): test pošle
// událost (`emit`) nebo obnovu po mezeře (`resync`) a čte rozsah, který si hooky nastavily
// (`scope`). Obal `wrap` dá hookům kontext jako `ServerEventsProvider`. Volání `emit` a `resync`
// mění stav Reactu – v testu patří do `act`.

export interface FakeServerEvents {
  channel: ServerEventsChannel;
  /** Událost od serveru všem posluchačům `name`. */
  emit<K extends ServerEventName>(name: K, data: ServerEvents[K]): void;
  /** `sync` s mezerou – zavolá obnovy (`useServerResync`). */
  resync(): void;
  /** Rozsah, jak ho teď skládají hooky (`useEventScope`). */
  scope(): EventScope;
  /** Kolik posluchačů má událost `name` (odhlášení po odpojení hooku). */
  listeners(name: ServerEventName): number;
  wrap(children: ReactNode): ReactElement;
}

export function fakeServerEvents(): FakeServerEvents {
  const handlers = new Map<ServerEventName, Set<(data: never) => void>>();
  const resyncs = new Set<() => void>();
  let scope: EventScope = { villageId: null, campaignId: null, scene: null };
  const channel: ServerEventsChannel = {
    on(name, fn) {
      const set = handlers.get(name) ?? new Set();
      handlers.set(name, set);
      const handler = fn as (data: never) => void;
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    onResync(fn) {
      resyncs.add(fn);
      return () => {
        resyncs.delete(fn);
      };
    },
    setScope(part) {
      scope = { ...scope, ...part };
    },
  };
  return {
    channel,
    emit(name, data) {
      for (const fn of [...(handlers.get(name) ?? [])]) (fn as (value: typeof data) => void)(data);
    },
    resync() {
      for (const fn of [...resyncs]) fn();
    },
    scope: () => scope,
    listeners: (name) => handlers.get(name)?.size ?? 0,
    wrap: (children) => (
      <ServerEventsContext.Provider value={channel}>{children}</ServerEventsContext.Provider>
    ),
  };
}
