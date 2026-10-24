import { describe, expect, it } from 'vitest';
import {
  horse,
  horsePen,
  horseVillage,
  START,
} from '../../../../packages/game/src/domain/village/__tests__/horse-fixtures';
import { horsesView } from '../horse-view';

// Koně pro panel ohrady (horses.md – Co hráč vidí): druhy, věk, výcvik, hřebec, obilí a seno.

describe('horsesView', () => {
  it('ves bez ohrady koní údaj nemá', () => {
    expect(horsesView(horseVillage(), START)).toBeNull();
  });

  it('koně po kusech – druh, věk, výcvik 0–1, hřebec je nejstarší samec od 3 let', () => {
    const s = horseVillage(
      [horse(1, 8, 'male', 50), horse(2, 5), horse(3, 6, 'female'), horse(4, 0.4, 'male')],
      2,
    );
    const view = horsesView(s, START)!;
    expect(view.count).toBe(4);
    expect(view.kinds).toEqual({ riding: 2, mares: 1, foals: 1 });
    expect(view.places).toBe(8);
    const byId = (id: number) => view.horses.find((h) => h.id === id)!;
    expect(byId(1)).toMatchObject({ kind: 'riding', ageYears: 8, training: 0.5, stallion: true });
    expect(byId(2).stallion).toBe(false);
    expect(byId(1).riderId).toBeUndefined();
    expect(byId(3)).toMatchObject({ kind: 'mare', stallion: false });
    expect(byId(4)).toMatchObject({ kind: 'foal', ageYears: 0 });
  });

  it('obilí koní za den jen pro jezdecké koně; bez obilí podle stavu vsi; seno na zimu', () => {
    const s = horseVillage([horse(1, 8), horse(2, 5), horse(3, 6, 'female')], 2);
    const fed = horsesView(s, START)!;
    expect(fed.grainKgPerDay).toBe(3);
    expect(fed.fed).toBe(true);
    // 2 jezdečtí koně + klisna po 6 kg, 151 dní zimy
    expect(fed.hayWinterKg).toBe(18 * 151);
    s.horsesFed = false;
    const hungry = horsesView(s, START)!;
    expect(hungry.fed).toBe(false);
    expect(hungry.hayWinterKg).toBe(20 * 151);
  });

  it('kolik ves chce a zda se vejdou', () => {
    const view = horsesView(horseVillage([horse(1, 4)], 1), START)!;
    expect(view.wanted).toEqual({ riding: 3, mares: 1, foals: 0 });
    expect(view.overRoom).toBe(true);
    expect(horsesView(horseVillage([horse(1, 4)], 2), START)!.overRoom).toBe(false);
    expect(horsePen).toBeDefined();
  });
});
