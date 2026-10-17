import { describe, expect, it } from 'vitest';
import { loginEmail } from '../dev-login';

describe('loginEmail', () => {
  it('ve vývoji doplní k samotnému jménu vývojovou doménu', () => {
    expect(loginEmail(' jarmil ', true)).toBe('jarmil@bohemia.test');
  });

  it('e-mail nechá, jak je', () => {
    expect(loginEmail('hrac@example.com', true)).toBe('hrac@example.com');
  });

  it('v produkci jméno nedoplňuje', () => {
    expect(loginEmail('jarmil', false)).toBe('jarmil');
  });

  it('prázdný vstup nechá prázdný', () => {
    expect(loginEmail('  ', true)).toBe('');
  });
});
