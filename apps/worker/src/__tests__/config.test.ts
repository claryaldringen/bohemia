import { describe, expect, it } from 'vitest';
import { readConfig, redactedUrl } from '../config';

describe('readConfig', () => {
  it('bez proměnných vrátí výchozí hodnoty a lokální databázi', () => {
    const config = readConfig({});
    expect(config).toMatchObject({
      stepDays: 10,
      limit: 50,
      idleMs: 5000,
      landscapes: 128,
      logLevel: 'info',
    });
    expect(config.databaseUrl).toContain('/bohemia');
  });

  it('čte proměnné z prostředí', () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://x@h/db',
      WORKER_STEP_DAYS: '3',
      WORKER_LOG: 'debug',
    });
    expect(config).toMatchObject({
      databaseUrl: 'postgres://x@h/db',
      stepDays: 3,
      logLevel: 'debug',
    });
  });

  it('chyby hlásí česky', () => {
    expect(() => readConfig({ WORKER_LIMIT: 'abc' })).toThrow(/WORKER_LIMIT musí být celé číslo/);
    expect(() => readConfig({ WORKER_IDLE_MS: '5' })).toThrow(/od 100/);
    expect(() => readConfig({ WORKER_LOG: 'x' })).toThrow(/WORKER_LOG musí být/);
  });

  it('z adresy odstraní heslo', () => {
    expect(redactedUrl('postgres://u:tajne@h:5432/db')).not.toContain('tajne');
  });
});
