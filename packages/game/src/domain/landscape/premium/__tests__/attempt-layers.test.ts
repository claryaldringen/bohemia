// Kolikrát pokus prémiové krajiny generuje vrstvy (úloha 4 – rozhodnutí: typ, který mění terén,
// nepočítá průměrné vrstvy zbytečně). Uložené sídlo (`generateLandscapeAttempt`) potřebuje jen
// prémiovou krajinu, přijetí nového sídla (`generateAcceptedLandscape`) i průměrnou krajinu
// pokusu kvůli pásmu – terén se pak pro průchod jen zkopíruje, negeneruje znovu.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { landscapeHash } from '../../__tests__/landscape-checks';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { CURRENT_LAYER_VERSIONS } from '../../types';
import type { PremiumType } from '../types';

const calls = vi.hoisted(() => ({ terrain: 0, vegetation: 0, fertility: 0 }));

vi.mock('../../terrain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../terrain')>();
  return {
    ...actual,
    generateTerrain: (...args: Parameters<typeof actual.generateTerrain>) => {
      calls.terrain++;
      return actual.generateTerrain(...args);
    },
  };
});
vi.mock('../../vegetation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../vegetation')>();
  return {
    ...actual,
    generateVegetation: (...args: Parameters<typeof actual.generateVegetation>) => {
      calls.vegetation++;
      return actual.generateVegetation(...args);
    },
  };
});
vi.mock('../../fertility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../fertility')>();
  return {
    ...actual,
    computeFertility: (...args: Parameters<typeof actual.computeFertility>) => {
      calls.fertility++;
      return actual.computeFertility(...args);
    },
  };
});

/** Typy, jejichž průchod mění terén – řeka, reliéf a naleziště ve skále. */
const TERRAIN_TYPES = [
  'navigable-river',
  'ford-hill',
  'confluence',
  'mountain-pass',
  'sacred-mountain',
  'natural-fortress',
  'building-stone',
  'deep-gold',
] as const satisfies readonly PremiumType[];

const reset = (): void => {
  calls.terrain = 0;
  calls.vegetation = 0;
  calls.fertility = 0;
};

describe('vrstvy pokusu prémiové krajiny', () => {
  beforeEach(reset);

  it('uložené sídlo s typem, který mění terén, generuje každou vrstvu jednou', () => {
    for (const type of TERRAIN_TYPES) {
      reset();
      generateLandscapeAttempt(3, CURRENT_LAYER_VERSIONS, type);
      // přirozená pevnost má vlastní terén typu – úrodnost bere průměr souše průměrného terénu
      // pokusu (typy reliéfu), ten se u uloženého sídla spočítá navíc
      const terrain = type === 'natural-fortress' ? 2 : 1;
      expect({ ...calls }, type).toEqual({ terrain, vegetation: 1, fertility: 1 });
    }
  });

  it('uložené sídlo s typem vegetace nebo úrodnosti – každá vrstva jednou', () => {
    for (const type of ['floodplain', 'fertile', 'gold-stream', 'iron-ore', 'fine-clay'] as const) {
      reset();
      generateLandscapeAttempt(3, CURRENT_LAYER_VERSIONS, type);
      expect({ ...calls }, type).toEqual({ terrain: 1, vegetation: 1, fertility: 1 });
    }
  });

  it('průměrná krajina – každá vrstva jednou', () => {
    generateLandscapeAttempt(3, CURRENT_LAYER_VERSIONS);
    expect({ ...calls }).toEqual({ terrain: 1, vegetation: 1, fertility: 1 });
  });

  it('přijetí s typem terénu: terén jednou (pro průchod kopie), vegetace a úrodnost dvakrát', () => {
    const type: PremiumType = 'navigable-river';
    // Seed, jehož první pokus projde (průměrná krajina i prémiová).
    let seed = 1;
    for (; seed < 40; seed++) {
      reset();
      if (generateAcceptedLandscape(seed, CURRENT_LAYER_VERSIONS, type).seed === seed) break;
    }
    expect(seed).toBeLessThan(40);
    expect({ ...calls }).toEqual({ terrain: 1, vegetation: 2, fertility: 2 });
  });

  it('přijetí s vlastním terénem typu (přirozená pevnost): terén dvakrát – průměrný a typu', () => {
    const type: PremiumType = 'natural-fortress';
    let seed = 1;
    for (; seed < 40; seed++) {
      reset();
      if (generateAcceptedLandscape(seed, CURRENT_LAYER_VERSIONS, type).seed === seed) break;
    }
    expect(seed).toBeLessThan(40);
    expect({ ...calls }).toEqual({ terrain: 2, vegetation: 2, fertility: 2 });
  });

  it('přijatá prémiová krajina je bit po bitu krajina uloženého sídla (pokus bez pásma)', () => {
    for (const type of [...TERRAIN_TYPES, 'floodplain'] as const) {
      const accepted = generateAcceptedLandscape(5, CURRENT_LAYER_VERSIONS, type);
      const saved = generateLandscapeAttempt(accepted.seed, CURRENT_LAYER_VERSIONS, type);
      expect(landscapeHash(saved), type).toBe(landscapeHash(accepted.landscape));
      expect(saved.river, type).toEqual(accepted.landscape.river);
      expect(saved.stream, type).toEqual(accepted.landscape.stream);
      expect(saved.promontories, type).toEqual(accepted.landscape.promontories);
    }
  });
});
