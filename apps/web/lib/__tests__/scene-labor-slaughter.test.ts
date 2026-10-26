import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage } from '@bohemia/game';
import { sceneLabor } from '../village-view-scene';

// Kusy poražené dnes jdou do scény (`SceneLabor.slaughter`).

const DAY = dayIndexOf({ year: 600, month: 11, day: 5 });
const people = { children: 1, adults: 2, elders: 0 };

describe('porážka v rozdělení práce pro scénu', () => {
  it('kusy dne se přenesou, bez porážky chybí', () => {
    const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    s.labor = {
      day: DAY,
      shares: [{ activity: 'slaughter', manDays: 2, target: { kind: 'village' } }],
      slaughterHeads: { pig: 1.4, sheep: 0.3 },
    };
    expect(sceneLabor(s, people)!.slaughter).toEqual({ pig: 1.4, sheep: 0.3 });
    s.labor = { day: DAY, shares: [] };
    expect(sceneLabor(s, people)!.slaughter).toBeUndefined();
  });
});
