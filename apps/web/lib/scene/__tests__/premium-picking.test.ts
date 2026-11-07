import { describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  premiumFeaturesOf,
  type PremiumFeatures,
} from '@bohemia/game';
import { LINE_PICK_M, pickPremiumSite, POINT_PICK_M } from '../premium-picking';
import { beeYard, villageCenter } from '../premium-sites-layout';

// Výběr prvku prémiové krajiny kliknutím (premium-landscapes.md – Co hráč vidí; vzor rudiště).

const bees = generateAcceptedLandscape(42, CURRENT_LAYER_VERSIONS, 'wild-bees').landscape;

const features: PremiumFeatures = {
  type: 'ford-hill',
  sites: [
    {
      kind: 'river',
      x: 0,
      z: 0,
      line: [
        [-300, 0],
        [300, 0],
      ],
    },
    { kind: 'ford', x: 100, z: 0 },
    {
      kind: 'promontory',
      x: -150,
      z: 150,
      outline: [
        [-200, 100],
        [-100, 100],
        [-100, 200],
        [-200, 200],
      ],
    },
    {
      kind: 'meadow',
      x: 200,
      z: -200,
      outline: [
        [100, -300],
        [300, -300],
        [300, -100],
        [100, -100],
      ],
    },
    {
      kind: 'deposit',
      x: -200,
      z: -200,
      line: [
        [-250, -200],
        [-150, -200],
      ],
    },
  ],
};

describe('výběr prvku prémiové krajiny', () => {
  it('brod u bodu prvku, ostrožna uvnitř obrysu, žíla podél osy', () => {
    expect(pickPremiumSite(bees, features, { x: 100 + POINT_PICK_M - 1, z: 0 })).toEqual({
      kind: 'premium-site',
      type: 'ford-hill',
      site: 'ford',
      index: 1,
    });
    expect(pickPremiumSite(bees, features, { x: -120, z: 180 })?.site).toBe('promontory');
    expect(pickPremiumSite(bees, features, { x: -170, z: -200 + LINE_PICK_M - 1 })?.site).toBe(
      'deposit',
    );
  });

  it('řeka ani louka (plocha kolem vsi) se obrysem nevybírají – klik na zem zruší výběr', () => {
    expect(pickPremiumSite(bees, features, { x: -50, z: 1 })).toBeNull();
    expect(pickPremiumSite(bees, features, { x: 150, z: -150 })).toBeNull();
    // u bodu louky ano
    expect(pickPremiumSite(bees, features, { x: 200, z: -205 })?.site).toBe('meadow');
  });

  it('bez prvků nebo mimo terén nic', () => {
    expect(pickPremiumSite(bees, null, { x: 100, z: 0 })).toBeNull();
    expect(pickPremiumSite(bees, features, null)).toBeNull();
  });

  it('brtě – klik u úlů na okraji lesa', () => {
    const real = premiumFeaturesOf(bees);
    expect(real?.type).toBe('wild-bees');
    const site = real!.sites.find((s) => s.kind === 'bee-trees')!;
    const yard = beeYard(bees, site, villageCenter(bees));
    expect(yard).not.toBeNull();
    expect(pickPremiumSite(bees, real, { x: yard!.x + 2, z: yard!.z })).toMatchObject({
      kind: 'premium-site',
      type: 'wild-bees',
      site: 'bee-trees',
    });
  });
});
