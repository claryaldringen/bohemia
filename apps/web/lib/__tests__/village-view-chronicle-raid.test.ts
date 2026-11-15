import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

// Kronika nájezdu (war.md – Co hráč vidí: Kronika) – věcně, bez hodnocení, v kronikách obou rodů.

const raid = (extra: Partial<Extract<ChronicleEvent, { kind: 'raid' }>> = {}): ChronicleEvent => ({
  day: 1,
  kind: 'raid',
  leader: 'Bořivoj',
  from: 'Lhota',
  target: 'Kněžice',
  declared: false,
  fallen: 3,
  wounded: 2,
  led: 5,
  loot: {
    grainKg: 400.2,
    legumesKg: 0,
    meatKg: 0,
    cheeseKg: 0,
    livestock: { sheep: 6, goat: 0, pig: 0, cow: 0 },
  },
  ...extra,
});

describe('kronika – nájezd', () => {
  it('přepadení bez opovědi s padlými, raněnými, odvedenými a kořistí', () => {
    expect(chronicleText(raid(), 'Ves')).toBe(
      'Nájezd Bořivoje ze vsi Lhota na ves Kněžice bez opovědi: padli 3, raněni 2, odvedeno 5, vzato 400 kg obilí a 6 ovcí.',
    );
  });

  it('s opovědí bez „bez opovědi“; nulové části chybí', () => {
    const none = {
      grainKg: 0,
      legumesKg: 0,
      meatKg: 0,
      cheeseKg: 0,
      livestock: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    expect(
      chronicleText(raid({ declared: true, fallen: 1, wounded: 0, led: 0, loot: none }), 'Ves'),
    ).toBe('Nájezd Bořivoje ze vsi Lhota na ves Kněžice: padl 1.');
    expect(chronicleText(raid({ fallen: 0, wounded: 0, led: 0, loot: none }), 'Ves')).toBe(
      'Nájezd Bořivoje ze vsi Lhota na ves Kněžice bez opovědi.',
    );
  });

  it('padlý v boji a zemřelý na rány', () => {
    const death = (cause: 'war' | 'wounds', name?: string): ChronicleEvent => ({
      day: 1,
      kind: 'death',
      group: 'adult',
      cause,
      ...(name ? { name, personId: 10 } : {}),
    });
    expect(chronicleText(death('war', 'Bořivoj'), 'Ves')).toBe('Bořivoj padl v boji.');
    expect(chronicleText(death('wounds'), 'Ves')).toBe('Jeden z dospělých zemřel na rány.');
  });
});
