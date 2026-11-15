'use client';

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { ServerEventsContext } from '@/hooks/use-server-events';
import { setE2EHook } from '@/lib/e2e-hooks';
import {
  ServerEventsClient,
  type EventSourceLike,
  type ServerEventsDeps,
} from '@/lib/server-events/client';

// Jedno spojení událostí ze serveru na panel prohlížeče (docs/code/server-events.md – Klient):
// klient vznikne jednou při vykreslení (nic neotevírá) a běží od efektu – hooky dětí si mezitím
// nastaví rozsah a posluchače, takže první spojení má hned celý rozsah.

const BROWSER: ServerEventsDeps = {
  // obsluhy `onopen` / `onerror` klient jen nastavuje a událost, se kterou je EventSource volá,
  // nečte – typy prohlížeče je chtějí s argumentem
  open: (url) => new EventSource(url) as unknown as EventSourceLike,
  visible: () => document.visibilityState === 'visible',
  onVisibilityChange: (fn) => {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
  reload: () => window.location.reload(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (timer) => window.clearTimeout(timer as number),
};

export function ServerEventsProvider({ children }: { children: ReactNode }): ReactElement {
  const [client] = useState(() => new ServerEventsClient(BROWSER));
  useEffect(() => {
    client.start();
    // testovací háčky: stav spojení a výpadek sítě (e2e/server-events.spec.ts)
    setE2EHook('serverEvents', () => ({ status: client.status(), received: client.received() }));
    setE2EHook('dropServerEvents', () => client.drop());
    return () => {
      setE2EHook('serverEvents', undefined);
      setE2EHook('dropServerEvents', undefined);
      client.stop();
    };
  }, [client]);
  return <ServerEventsContext.Provider value={client}>{children}</ServerEventsContext.Provider>;
}
