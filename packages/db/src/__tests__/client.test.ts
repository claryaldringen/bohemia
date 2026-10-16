import { describe, it, expect } from 'vitest';
import { databaseUrl } from '../client';

describe('databaseUrl', () => {
  it('použije DATABASE_URL, když je nastavená', () => {
    expect(
      databaseUrl({ DATABASE_URL: 'postgres://hra@db:5432/bohemia', NODE_ENV: 'production' }),
    ).toBe('postgres://hra@db:5432/bohemia');
  });

  it('lokálně bez DATABASE_URL použije Homebrew Postgres', () => {
    expect(databaseUrl({ NODE_ENV: 'development' })).toBe(
      'postgres://postgres@127.0.0.1:5432/bohemia',
    );
    expect(databaseUrl({})).toBe('postgres://postgres@127.0.0.1:5432/bohemia');
  });

  it('v produkci bez DATABASE_URL odmítne nastartovat', () => {
    expect(() => databaseUrl({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() => databaseUrl({ NODE_ENV: 'production', DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});
