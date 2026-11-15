import { Client } from 'pg';
import { CHANGE_CHANNEL, parseChange, type DbChange } from '../changes';

// Posluchač oznámení změn (plán 2026-11-15 – události ze serveru, Úloha 1; docs/code/server-events.md –
// Oznámení v databázi): vlastní spojení `pg.Client` s `LISTEN bohemia_change`, mimo pool. Po chybě
// nebo konci spojení se připojí znovu s rostoucími odklady; po obnově zavolá `onReconnect`, protože
// mezitím mohla nějaká změna uniknout.

const DEFAULT_RETRY_MS: readonly number[] = [1000, 2000, 5000, 10000, 30000];
const DEFAULT_APPLICATION_NAME = 'bohemia-change-listener';

export interface ChangeHandlers {
  onChange(change: DbChange): void;
  /** Spojení se po výpadku obnovilo (ne po prvním připojení). */
  onReconnect(): void;
  /** Chyba spojení, vadný náklad nebo výjimka obsluhy – posluchač běží dál. */
  onError?(error: Error): void;
}

export interface ChangeListener {
  /** Splní se po prvním úspěšném `LISTEN`; při trvalé chybě připojení nikdy (pokusy běží dál, chyby jdou do `onError`). */
  ready: Promise<void>;
  /** Zavře spojení a další pokus už nedělá. */
  close(): Promise<void>;
}

/** Odběr oznámení změn přes vlastní spojení s automatickým novým připojením. */
export function listenChanges(
  url: string,
  handlers: ChangeHandlers,
  options: { retryMs?: readonly number[]; applicationName?: string } = {},
): ChangeListener {
  const retryMs = options.retryMs?.length ? options.retryMs : DEFAULT_RETRY_MS;
  const applicationName = options.applicationName ?? DEFAULT_APPLICATION_NAME;
  let closed = false;
  let current: Client | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let everReady = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const report = (error: unknown): void => {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    try {
      handlers.onError?.(wrapped);
    } catch {
      // chyba obsluhy chyb nesmí shodit posluchače
    }
  };

  const scheduleRetry = (): void => {
    if (closed || timer) return;
    const delay = retryMs[Math.min(failures, retryMs.length - 1)] ?? 1000;
    failures += 1;
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, delay);
  };

  const connect = async (): Promise<void> => {
    if (closed) return;
    const client = new Client({
      connectionString: url,
      keepAlive: true,
      application_name: applicationName,
    });
    current = client;
    let lost = false;
    const lose = (error?: Error): void => {
      if (lost) return;
      lost = true;
      if (error) report(error);
      if (current === client) current = null;
      client.end().catch(() => {});
      scheduleRetry();
    };
    client.on('error', (error) => lose(error));
    client.on('end', () => lose());
    client.on('notification', (message) => {
      if (message.channel !== CHANGE_CHANNEL || message.payload === undefined) return;
      const change = parseChange(message.payload);
      if (!change) {
        report(new Error(`Vadný náklad oznámení: ${message.payload.slice(0, 200)}`));
        return;
      }
      try {
        handlers.onChange(change);
      } catch (error) {
        report(error);
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANGE_CHANNEL}`);
    } catch (error) {
      lose(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (closed) {
      client.end().catch(() => {});
      return;
    }
    failures = 0;
    if (everReady) {
      try {
        handlers.onReconnect();
      } catch (error) {
        report(error);
      }
    } else {
      everReady = true;
      resolveReady();
    }
  };

  void connect();

  return {
    ready,
    async close(): Promise<void> {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const client = current;
      current = null;
      if (client) await client.end().catch(() => {});
    },
  };
}
