import { describe, expect, it } from 'vitest';
import { e2ePort, testDatabaseName, testDatabaseUrl } from '../test-database';

// Port e2e a testovací databáze z prostředí – bez proměnných dnešní 3011 a bohemia_test.

describe('testovací databáze a port e2e z prostředí', () => {
  it('bez proměnných míří na 3011 a bohemia_test', () => {
    expect(e2ePort({})).toBe(3011);
    expect(testDatabaseName({})).toBe('bohemia_test');
    expect(testDatabaseUrl({})).toBe('postgres://postgres@127.0.0.1:5432/bohemia_test');
    // prázdná proměnná = nenastavená
    expect(e2ePort({ E2E_PORT: '' })).toBe(3011);
    expect(testDatabaseName({ TEST_DATABASE: '' })).toBe('bohemia_test');
  });

  it('s proměnnými vezme port a databázi stromu', () => {
    const env = { E2E_PORT: '3012', TEST_DATABASE: 'bohemia_test_2' };
    expect(e2ePort(env)).toBe(3012);
    expect(testDatabaseUrl(env)).toBe('postgres://postgres@127.0.0.1:5432/bohemia_test_2');
  });

  it('vývojovou, měřicí ani systémovou databázi odmítne', () => {
    for (const name of ['bohemia', 'bohemia_measure', 'BOHEMIA', 'postgres', 'template1']) {
      expect(() => testDatabaseName({ TEST_DATABASE: name })).toThrow(/odmítnuto/);
      expect(() => testDatabaseUrl({ TEST_DATABASE: name })).toThrow(/odmítnuto/);
    }
  });

  it('neplatné jméno databáze a port odmítne', () => {
    for (const name of ['bohemia-test', 'x"; DROP DATABASE bohemia; --', '1test', 'Bohemia_Test']) {
      expect(() => testDatabaseName({ TEST_DATABASE: name })).toThrow(/není platné jméno/);
    }
    for (const port of ['abc', '0', '70000', '3011.5']) {
      expect(() => e2ePort({ E2E_PORT: port })).toThrow(/není platný port/);
    }
  });
});
