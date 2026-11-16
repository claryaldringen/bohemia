import { describe, expect, it } from 'vitest';
import { MASON_CRAFT_LABELS } from '../mason-crafts';
import { personRoles, ROLE_NAMES, type RolePerson } from '../person-roles';

const man = (id: number, home: number, over: Partial<RolePerson> = {}): RolePerson => ({
  id,
  age: 30,
  sex: 'male',
  home,
  ...over,
});

describe('role mistrů huti a kněze (D81)', () => {
  const homes = { manor: 1, craft: () => null };

  it('mistr v domě rolníka má roli podle oboru, jeho žena a děti podle něj', () => {
    const roles = personRoles(
      [
        man(10, 5, { master: 'stonemason' }),
        { ...man(11, 5, { spouse: 10 }), sex: 'female' },
        man(12, 5, { age: 10, father: 10 }),
        { ...man(13, 5, { age: 10, mother: 11 }), sex: 'female' },
      ],
      homes,
    );
    expect(ROLE_NAMES[roles.get(10)!]).toBe(MASON_CRAFT_LABELS.stonemason.name);
    expect(ROLE_NAMES[roles.get(11)!]).toBe('Kameníkova žena');
    expect(ROLE_NAMES[roles.get(12)!]).toBe('Kameníkův syn');
    expect(ROLE_NAMES[roles.get(13)!]).toBe('Kameníkova dcera');
    expect(roles.get(10)).toBe('stonemason');
    expect(roles.get(11)).toBe('stonemason-wife');
  });

  it('kněz je Kněz, jeho žena Žena kněze, syn Syn kněze', () => {
    const roles = personRoles(
      [
        man(20, 6, { master: 'priest' }),
        { ...man(21, 6, { spouse: 20 }), sex: 'female' },
        man(22, 6, { age: 15, father: 20 }),
      ],
      homes,
    );
    expect(ROLE_NAMES[roles.get(20)!]).toBe('Kněz');
    expect(ROLE_NAMES[roles.get(21)!]).toBe('Žena kněze');
    expect(ROLE_NAMES[roles.get(22)!]).toBe('Syn kněze');
  });

  it('mistr jako host ve dvorci má roli podle sebe a nebere vojvodovi hlavu domácnosti', () => {
    const roles = personRoles(
      [man(1, 1, { age: 40 }), man(30, 1, { age: 60, master: 'builder' })],
      homes,
    );
    expect(roles.get(30)).toBe('builder');
    expect(roles.get(1)).toBe('voivode');
  });

  it('mistr v dílně řemeslníka zůstává mistrem, kovář kovářem', () => {
    const roles = personRoles(
      [man(40, 7, { practice: { smith: 5 } }), man(41, 7, { master: 'mason' })],
      { manor: 1, craft: () => 'smith' },
    );
    expect(roles.get(40)).toBe('smith');
    expect(roles.get(41)).toBe('mason');
  });
});
