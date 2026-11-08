import { describe, expect, it } from 'vitest';
import { dropLanguage } from '../auth-hooks';

describe('dropLanguage', () => {
  it('změna účtu jazyk zahodí přímo z dat změny, ostatní pole nechá', () => {
    const data: Record<string, unknown> = { name: 'Bořivoj', language: 'de' };
    expect(dropLanguage(data)).toEqual({ name: 'Bořivoj' });
    // Better Auth výsledek hooku jen přimíchá – pole musí zmizet i z původního objektu
    expect(data).toEqual({ name: 'Bořivoj' });
    expect(dropLanguage({ name: 'Bořivoj' })).toEqual({ name: 'Bořivoj' });
  });
});
