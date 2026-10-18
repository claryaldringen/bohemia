// Kontrolní bod dlouhé kalibrace (measure-village.ts --out): soubor JSON lines – první řádek
// hlavička s nastavením běhu, pak jeden řádek na každou hotovou úlohu (ves nebo sondu). Běh jde
// kdykoli přerušit (Ctrl+C) a stejným příkazem pustit znovu – hotové úlohy přeskočí a výsledná
// tabulka se počítá ze souboru. Mapy a nekonečná čísla JSON neumí – kódují se zvlášť.
import { appendFileSync, existsSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';

const VERSION = 1;

type Encoded = { $map: [unknown, unknown][] } | { $num: string };

/** JSON s mapami a NaN / ±Infinity (výsledky kalibrace je obsahují). */
export function encode(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown): unknown => {
    if (v instanceof Map) return { $map: [...v.entries()] } satisfies Encoded;
    if (typeof v === 'number' && !Number.isFinite(v)) return { $num: String(v) } satisfies Encoded;
    return v;
  });
}

export function decode<T>(text: string): T {
  return JSON.parse(text, (_key, v: unknown): unknown => {
    if (typeof v !== 'object' || v === null) return v;
    if ('$map' in v && Array.isArray(v.$map)) return new Map(v.$map as [unknown, unknown][]);
    if ('$num' in v && typeof v.$num === 'string') return Number(v.$num);
    return v;
  }) as T;
}

interface HeaderLine {
  type: 'header';
  version: number;
  config: Record<string, unknown>;
}
interface TaskLine<T> {
  type: 'task';
  key: string;
  result: T;
}

/**
 * Otevře kontrolní bod: nový soubor založí s hlavičkou, existující načte (hlavička musí sedět
 * s nastavením – jinak chyba, aby se nesmíchaly různé běhy). Neúplný poslední řádek (běh
 * přerušený uprostřed zápisu) se zahodí. Vrací hotové úlohy podle klíče.
 */
export function openCheckpoint<T>(path: string, config: Record<string, unknown>): Map<string, T> {
  if (!existsSync(path)) {
    writeFileSync(path, `${encode({ type: 'header', version: VERSION, config })}\n`);
    return new Map();
  }
  const text = readFileSync(path, 'utf8');
  const complete = text.lastIndexOf('\n') + 1;
  if (complete < text.length) truncateSync(path, Buffer.byteLength(text.slice(0, complete)));
  return parseCheckpoint<T>(text.slice(0, complete), path, config);
}

/**
 * Hotové úlohy ze souboru jen ke čtení – soubor nemění, neúplný poslední řádek přeskočí (jde
 * číst i kontrolní bod běhu, který zrovna běží nebo stojí).
 */
export function readCheckpoint<T>(path: string, config: Record<string, unknown>): Map<string, T> {
  if (!existsSync(path)) throw new Error(`${path} neexistuje.`);
  const text = readFileSync(path, 'utf8');
  return parseCheckpoint<T>(text.slice(0, text.lastIndexOf('\n') + 1), path, config);
}

function parseCheckpoint<T>(
  text: string,
  path: string,
  config: Record<string, unknown>,
): Map<string, T> {
  const lines = text.split('\n').filter((line) => line.length > 0);
  const header = lines[0] === undefined ? null : decode<HeaderLine>(lines[0]);
  if (header?.type !== 'header' || header.version !== VERSION) {
    throw new Error(`${path} není kontrolní bod kalibrace (chybí hlavička).`);
  }
  if (encode(header.config) !== encode(config)) {
    throw new Error(
      `${path} patří jinému běhu (${encode(header.config)}), teď ${encode(config)} – použij jiný soubor.`,
    );
  }
  const done = new Map<string, T>();
  for (const line of lines.slice(1)) {
    const task = decode<TaskLine<T>>(line);
    if (task.type === 'task') done.set(task.key, task.result);
  }
  return done;
}

/** Připíše hotovou úlohu – jeden zápis celého řádku. */
export function appendCheckpoint<T>(path: string, key: string, result: T): void {
  appendFileSync(path, `${encode({ type: 'task', key, result } satisfies TaskLine<T>)}\n`);
}
