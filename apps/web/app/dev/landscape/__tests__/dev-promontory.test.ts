import { describe, it, expect } from 'vitest';
import { generateLandscape, PREVIOUS_LAYER_VERSIONS } from '@bohemia/game';
import { PROMONTORY_SEEDS, promontoryFocus, promontoryOverlay } from '../dev-promontory';

describe('náhled ostrožny na /dev/landscape', () => {
  it('každý seed ze seznamu má v nových vrstvách ostrožnu – obrys a šíji', () => {
    for (const seed of PROMONTORY_SEEDS) {
      const l = generateLandscape(seed);
      const overlay = promontoryOverlay(l);
      expect(overlay, `seed ${seed}`).toHaveLength(2);
      expect(overlay[0]!.lines![0]!.length).toBeGreaterThan(10);
      expect(overlay[1]!.open).toBe(true);
      expect(promontoryFocus(l), `seed ${seed}`).not.toBeNull();
    }
  });

  it('krajina bez ostrožny (předchozí vrstvy) nemá co ukázat', () => {
    const l = generateLandscape(PROMONTORY_SEEDS[0], PREVIOUS_LAYER_VERSIONS);
    expect(promontoryOverlay(l)).toEqual([]);
    expect(promontoryFocus(l)).toBeNull();
  });
});
