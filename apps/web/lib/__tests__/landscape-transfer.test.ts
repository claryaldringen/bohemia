import { describe, it, expect } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  generateLandscapeAttempt,
  generateObstacles,
  hasPremiumPass,
  INITIAL_LAYER_VERSIONS,
  OBSTACLE_SOURCES,
  obstaclesOf,
  premiumFeaturesOf,
  promontoriesOf,
  transferPrecision,
  type ObstacleLayer,
} from '@bohemia/game';
import { decodeLandscape, encodeLandscape } from '../landscape-transfer';

describe('přenos krajiny ze serveru do prohlížeče', () => {
  const landscape = generateLandscape(1);

  it('encode → decode zachová povrch a úrodnost přesně a výšky s chybou ≤ 0,005 m', () => {
    const decoded = decodeLandscape(encodeLandscape(landscape));
    expect(decoded.size).toBe(landscape.size);
    expect(decoded.cellSizeM).toBe(landscape.cellSizeM);
    expect(decoded.villageSite).toEqual(landscape.villageSite);
    expect(decoded.surface).toEqual(landscape.surface);
    expect(decoded.fertility).toEqual(landscape.fertility);
    let worst = 0;
    for (let i = 0; i < landscape.heights.length; i++) {
      worst = Math.max(worst, Math.abs(decoded.heights[i]! - landscape.heights[i]!));
    }
    // Půl centimetru ze zaokrouhlení plus nepřesnost Float32 (výšky do ~40 m → ~4e-6 m).
    expect(worst).toBeLessThanOrEqual(0.005 + 1e-5);
  });

  it('přenese osu potoka – polohu, šířky břehů, hladinu a mělčiny', () => {
    const decoded = decodeLandscape(encodeLandscape(landscape));
    expect(decoded.stream).toHaveLength(landscape.stream.length);
    landscape.stream.forEach((p, k) => {
      const q = decoded.stream[k]!;
      expect(q.x).toBeCloseTo(p.x, 4);
      expect(q.y).toBeCloseTo(p.y, 4);
      expect(q.halfWidthLeft).toBeCloseTo(p.halfWidthLeft, 4);
      expect(q.halfWidthRight).toBeCloseTo(p.halfWidthRight, 4);
      expect(q.level).toBeCloseTo(p.level, 4);
      expect(q.shallow).toBe(p.shallow);
    });
  });

  it('zakódovaná krajina má po JSON.stringify méně než 150 kB', () => {
    expect(JSON.stringify(encodeLandscape(landscape)).length).toBeLessThan(150_000);
  });

  it('prohlížeč dostane přesně krajinu s přesností transferPrecision (i se seedem překážek)', () => {
    const decoded = decodeLandscape(encodeLandscape(landscape));
    const expected = transferPrecision(landscape);
    expect(decoded.heights).toEqual(expected.heights);
    expect(decoded.stream).toEqual(expected.stream);
    expect(decoded.obstacleLayer).toEqual(landscape.obstacleLayer);
  });

  it('vrstva překážek vygenerovaná v prohlížeči je přesně ta ze serveru', () => {
    const server = generateObstacles(landscape);
    const browser = generateObstacles(decodeLandscape(encodeLandscape(landscape)));
    const columns = ['id', 'x', 'z', 'kind', 'look', 'rotation', 'scale', 'impostor'] as const;
    const differences = (a: ObstacleLayer, b: ObstacleLayer): number => {
      let count = Math.abs(a.count - b.count);
      for (const key of columns) {
        for (let i = 0; i < Math.min(a.count, b.count); i++) if (a[key][i] !== b[key][i]) count++;
      }
      return count;
    };
    expect(browser.count).toBeGreaterThan(40_000);
    expect(differences(browser, server)).toBe(0);
  });

  it('týž přenos dekóduje na týž objekt – scéna i rozhraní sdílí krajinu a její překážky', () => {
    const transfer = encodeLandscape(landscape);
    expect(decodeLandscape(transfer)).toBe(decodeLandscape(transfer));
    expect(decodeLandscape(encodeLandscape(landscape))).not.toBe(decodeLandscape(transfer));
  });
});

describe('přenos krajiny se skalami u potoka (terén 2)', () => {
  // Seed 16: ostrožna nad zaříznutým meandrem, skalní stěny, skály a suť ve vrstvě překážek 2.
  const rocky = generateLandscape(16);

  it('přenese výšky stěn u potoka (Float32) a ostrožny', () => {
    const transfer = encodeLandscape(rocky);
    expect(transfer.banks).toBeDefined();
    const decoded = decodeLandscape(transfer);
    expect(decoded.stream).toEqual(transferPrecision(rocky).stream);
    expect(decoded.stream.some((p) => (p.bankLeft ?? 0) > 3)).toBe(true);
    expect(promontoriesOf(decoded)).toEqual(promontoriesOf(rocky));
    expect(promontoriesOf(decoded)).toHaveLength(1);
  });

  it('prohlížeč vygeneruje přesně tytéž skály a suť na stěnách jako server', () => {
    const server = generateObstacles(rocky);
    const browser = generateObstacles(decodeLandscape(encodeLandscape(rocky)));
    const cliffRocks = [...server.id].filter(
      (id) => Math.floor(id / 4_194_304) === OBSTACLE_SOURCES.cliffRock,
    );
    expect(cliffRocks.length).toBeGreaterThan(50);
    expect(browser.count).toBe(server.count);
    for (const key of ['id', 'x', 'z', 'kind', 'look', 'rotation', 'scale'] as const) {
      expect(browser[key]).toEqual(server[key]);
    }
  });

  it('krajina terénu 1 jde přenosem jako dřív – bez výšek stěn a ostrožen', () => {
    const plain = generateLandscape(16, INITIAL_LAYER_VERSIONS);
    const transfer = encodeLandscape(plain);
    expect('banks' in transfer).toBe(false);
    expect('promontories' in transfer).toBe(false);
    const decoded = decodeLandscape(transfer);
    expect(decoded.stream.every((p) => !('bankLeft' in p))).toBe(true);
    expect('promontories' in decoded).toBe(false);
  });
});

describe('přenos prémiové krajiny', () => {
  // Pokus bez kontroly pásma – typ ještě nemusí mít průchod (pak je krajina průměrná a bez prvků).
  const premium = generateLandscapeAttempt(42, CURRENT_LAYER_VERSIONS, 'mountain-pass');

  it('přenos nese prémiový typ', () => {
    const transfer = encodeLandscape(premium);
    expect(transfer.premium).toBe('mountain-pass');
    expect(decodeLandscape(transfer).premium).toBe('mountain-pass');
  });

  it('prohlížeč dostane stejnou prémiovou krajinu – prvky typu i vrstvu překážek', () => {
    const decoded = decodeLandscape(encodeLandscape(premium));
    // Jakmile má typ průchod, prvky musí existovat – jinak by se porovnávalo null s null.
    if (hasPremiumPass('mountain-pass')) expect(premiumFeaturesOf(premium)).not.toBeNull();
    expect(premiumFeaturesOf(decoded)).toEqual(premiumFeaturesOf(premium));
    const server = obstaclesOf(premium);
    const browser = obstaclesOf(decoded);
    expect(browser.count).toBe(server.count);
    for (const key of ['id', 'x', 'z', 'kind', 'look', 'rotation', 'scale', 'impostor'] as const) {
      expect(browser[key]).toEqual(server[key]);
    }
  });

  // Typy, které mění vrstvu překážek (rozmisťovače čtou typ krajiny): dřeviny lesa a brtě.
  for (const type of ['oak-beech', 'wild-bees'] as const) {
    it(`${type} – prohlížeč dostane stejné prvky i vrstvu překážek jako server`, () => {
      const server = generateLandscape(42, CURRENT_LAYER_VERSIONS, type);
      const decoded = decodeLandscape(encodeLandscape(server));
      expect(premiumFeaturesOf(server)).not.toBeNull();
      expect(premiumFeaturesOf(decoded)).toEqual(premiumFeaturesOf(server));
      const a = obstaclesOf(server);
      const b = obstaclesOf(decoded);
      expect(b.count).toBe(a.count);
      for (const key of [
        'id',
        'x',
        'z',
        'kind',
        'look',
        'rotation',
        'scale',
        'impostor',
      ] as const) {
        expect(b[key]).toEqual(a[key]);
      }
    });
  }

  it('průměrná krajina jde přenosem bez typu', () => {
    const transfer = encodeLandscape(generateLandscape(42));
    expect('premium' in transfer).toBe(false);
    expect('premium' in decodeLandscape(transfer)).toBe(false);
    expect(premiumFeaturesOf(decodeLandscape(transfer))).toBeNull();
  });
});
