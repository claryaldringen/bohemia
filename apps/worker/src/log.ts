import type { LogLevel } from './config';

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  debug: (message: string) => void;
}

function stamp(now: Date): string {
  return now.toTimeString().slice(0, 8);
}

/** Stručné řádky `[worker] HH:MM:SS – …` na konzoli; `debug` jen při `WORKER_LOG=debug`. */
export function createLogger(level: LogLevel, now: () => Date = () => new Date()): Logger {
  const line = (message: string): string => `[worker] ${stamp(now())} – ${message}`;
  return {
    info: (message) => console.log(line(message)),
    warn: (message) => console.warn(line(message)),
    debug: (message) => {
      if (level === 'debug') console.log(line(message));
    },
  };
}
