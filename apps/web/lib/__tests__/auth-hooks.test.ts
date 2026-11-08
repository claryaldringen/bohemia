import { describe, expect, it } from 'vitest';
import { withoutLanguage } from '../auth-hooks';

describe('withoutLanguage', () => {
  it('změna účtu jazyk zahodí, ostatní pole nechá', () => {
    expect(withoutLanguage({ name: 'Bořivoj', language: 'de' })).toEqual({ name: 'Bořivoj' });
    expect(withoutLanguage({ name: 'Bořivoj' })).toEqual({ name: 'Bořivoj' });
  });
});
