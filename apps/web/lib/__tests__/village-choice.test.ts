import { describe, expect, it } from 'vitest';
import { VILLAGE_COOKIE, villageCookie } from '../village-choice';

// Vybraná ves v cookie (migration.md – Víc vsí jednoho hráče).

describe('villageCookie', () => {
  it('cookie s id vsi pro celý web na rok', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(villageCookie(id)).toBe(
      `${VILLAGE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`,
    );
  });
});
