import { describe, expect, it } from 'vitest';
import { LANGUAGE_GROUPS, isLanguageGroup } from '../languages';

describe('jazykové skupiny', () => {
  it('je jich sedm ve stanoveném pořadí', () => {
    expect(LANGUAGE_GROUPS).toEqual(['cs', 'en', 'de', 'pl', 'it', 'fr', 'es']);
  });

  it('isLanguageGroup přijme známý jazyk a odmítne ostatní', () => {
    expect(isLanguageGroup('de')).toBe(true);
    expect(isLanguageGroup('ru')).toBe(false);
    expect(isLanguageGroup(undefined)).toBe(false);
    expect(isLanguageGroup(3)).toBe(false);
  });
});
