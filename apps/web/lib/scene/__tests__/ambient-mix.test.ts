import { describe, it, expect } from 'vitest';
import {
  AMBIENT_LAYERS,
  ambientMix,
  streamSpeedWeights,
  type AmbientEnvironment,
  type AmbientGains,
} from '../ambient-mix';

const NEAR = 150;
const FAR = 1400;

/** Rovný potok podél osy z (x = 0), poloviční šířka 8 m, všude stejná rychlost proudu. */
function straightStream(speed: number): AmbientEnvironment['stream'] {
  const points = [];
  for (let z = -1000; z <= 1000; z += 7.5) {
    points.push({ x: 0, z, speed, halfLeft: 8, halfRight: 8 });
  }
  return { points };
}

/** Les na kladné straně osy x od hranice FOREST_EDGE_X dál (kladná vzdálenost = v lese). */
const FOREST_EDGE_X = 400;
const halfPlaneForest: AmbientEnvironment['forest'] = {
  distanceAt: (x) => x - FOREST_EDGE_X,
};
const noForest: AmbientEnvironment['forest'] = { distanceAt: () => -10_000 };

const environment = (
  speed = 0.45,
  forest: AmbientEnvironment['forest'] = halfPlaneForest,
): AmbientEnvironment => ({ stream: straightStream(speed), forest });

const total = (gains: AmbientGains): number =>
  AMBIENT_LAYERS.reduce((sum, layer) => sum + gains[layer], 0);
const streamLoudness = (gains: AmbientGains): number =>
  Math.hypot(gains.streamSlow, gains.streamMedium, gains.streamFast);

describe('streamSpeedWeights', () => {
  it('líný proud je jen pomalá voda, peřej jen rychlá', () => {
    expect(streamSpeedWeights(0.05)).toEqual({ slow: 1, medium: 0, fast: 0 });
    expect(streamSpeedWeights(0.95)).toEqual({ slow: 0, medium: 0, fast: 1 });
    const medium = streamSpeedWeights(0.45);
    expect(medium.medium).toBeCloseTo(1);
  });

  it('prolínání drží stejný výkon (součet čtverců je 1) a s rychlostí plynule přechází', () => {
    let previousFast = 0;
    for (let speed = 0; speed <= 1; speed += 0.01) {
      const w = streamSpeedWeights(speed);
      expect(w.slow ** 2 + w.medium ** 2 + w.fast ** 2).toBeCloseTo(1, 6);
      expect(w.fast).toBeGreaterThanOrEqual(previousFast - 1e-9);
      previousFast = w.fast;
    }
  });
});

describe('ambientMix', () => {
  it('všechny vrstvy jsou v rozsahu 0–1 i pro nesmyslný pohled', () => {
    const env = environment();
    const views = [
      { x: 0, z: 0, radius: NEAR },
      { x: 5000, z: -5000, radius: FAR },
      { x: 10, z: 10, radius: 10 },
      { x: 10, z: 10, radius: 100_000 },
      { x: 10, z: 10, radius: Number.NaN },
    ];
    for (const view of views) {
      const gains = ambientMix(view, env);
      for (const layer of AMBIENT_LAYERS) {
        expect(Number.isFinite(gains[layer]), `${layer} ${JSON.stringify(view)}`).toBe(true);
        expect(gains[layer]).toBeGreaterThanOrEqual(0);
        expect(gains[layer]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('potok je hlasitější blízko vody a z blízka, daleko od vody utichne', () => {
    const env = environment();
    const onWater = streamLoudness(ambientMix({ x: 0, z: 0, radius: NEAR }, env));
    const nearBank = streamLoudness(ambientMix({ x: 60, z: 0, radius: NEAR }, env));
    const away = streamLoudness(ambientMix({ x: 300, z: 0, radius: NEAR }, env));
    const zoomedOut = streamLoudness(ambientMix({ x: 0, z: 0, radius: FAR }, env));
    expect(onWater).toBeGreaterThan(0.5);
    expect(nearBank).toBeLessThan(onWater);
    expect(nearBank).toBeGreaterThan(0.2);
    expect(away).toBe(0);
    expect(zoomedOut).toBeLessThan(onWater / 3);
    expect(zoomedOut).toBeGreaterThan(0);
  });

  it('při oddálení je potok slyšet i z větší vzdálenosti, protože je v záběru', () => {
    const env = environment();
    expect(streamLoudness(ambientMix({ x: 300, z: 0, radius: NEAR }, env))).toBe(0);
    expect(streamLoudness(ambientMix({ x: 300, z: 0, radius: 650 }, env))).toBeGreaterThan(0);
  });

  it('rychlost proudu volí vrstvu: tůň pomalá, peřej rychlá', () => {
    const view = { x: 0, z: 0, radius: NEAR };
    const slow = ambientMix(view, environment(0.1));
    expect(slow.streamSlow).toBeGreaterThan(0.5);
    expect(slow.streamMedium).toBe(0);
    expect(slow.streamFast).toBe(0);
    const fast = ambientMix(view, environment(0.9));
    expect(fast.streamFast).toBeGreaterThan(0.5);
    expect(fast.streamSlow).toBe(0);
    expect(fast.streamMedium).toBe(0);
    const medium = ambientMix(view, environment(0.45));
    expect(medium.streamMedium).toBeGreaterThan(medium.streamSlow);
    expect(medium.streamMedium).toBeGreaterThan(medium.streamFast);
    // Celková síla potoka nezávisí na rychlosti – mění se jen barva zvuku.
    expect(streamLoudness(slow)).toBeCloseTo(streamLoudness(fast), 6);
  });

  it('v krajině bez potoka je potok potichu', () => {
    const gains = ambientMix(
      { x: 0, z: 0, radius: NEAR },
      { stream: { points: [] }, forest: halfPlaneForest },
    );
    expect(gains.streamSlow + gains.streamMedium + gains.streamFast).toBe(0);
  });

  it('vítr v listí šumí v lese a u lesa, uprostřed louky ne', () => {
    const env = environment(0.45, halfPlaneForest);
    const inForest = ambientMix({ x: FOREST_EDGE_X + 150, z: 0, radius: NEAR }, env).leaves;
    const atEdge = ambientMix({ x: FOREST_EDGE_X, z: 0, radius: NEAR }, env).leaves;
    const meadow = ambientMix({ x: FOREST_EDGE_X - 250, z: 0, radius: NEAR }, env).leaves;
    expect(inForest).toBeGreaterThan(0.5);
    expect(atEdge).toBeGreaterThan(0.2);
    expect(atEdge).toBeLessThan(inForest);
    expect(meadow).toBe(0);
  });

  it('ptáci zpívají všude, u okraje lesa víc než uprostřed louky', () => {
    const env = environment(0.45, halfPlaneForest);
    const meadow = ambientMix({ x: FOREST_EDGE_X - 250, z: 0, radius: NEAR }, env);
    const edge = ambientMix({ x: FOREST_EDGE_X, z: 0, radius: NEAR }, env);
    expect(meadow.birds).toBeGreaterThan(0.2);
    expect(edge.birds).toBeCloseTo(meadow.birds);
    expect(edge.birdsong).toBeGreaterThan(0.5);
    expect(meadow.birdsong).toBeLessThan(edge.birdsong / 4);
    const noTrees = ambientMix({ x: 0, z: 0, radius: NEAR }, environment(0.45, noForest));
    expect(noTrees.birds).toBeGreaterThan(0.2);
    expect(noTrees.birdsong).toBe(0);
    expect(noTrees.leaves).toBe(0);
  });

  it('při oddálení je celkově tišší, ale krajina úplně neztichne', () => {
    const env = environment();
    for (const x of [0, FOREST_EDGE_X, FOREST_EDGE_X + 200, -300]) {
      const near = ambientMix({ x, z: 0, radius: NEAR }, env);
      const far = ambientMix({ x, z: 0, radius: FAR }, env);
      // Jednotlivá vrstva může při oddálení zesílit (potok nebo les se dostane do záběru),
      // celek ale ztiší.
      expect(total(far), `x=${x}`).toBeLessThan(total(near));
      expect(total(far)).toBeGreaterThan(0.15);
      expect(far.birds).toBeLessThan(near.birds);
      expect(far.birds).toBeGreaterThan(near.birds / 2);
    }
  });

  it('tentýž zdroj pod kamerou je při oddálení tišší', () => {
    const forestEverywhere: AmbientEnvironment['forest'] = { distanceAt: () => 300 };
    const env = environment(0.45, forestEverywhere);
    const near = ambientMix({ x: 0, z: 0, radius: NEAR }, env);
    const far = ambientMix({ x: 0, z: 0, radius: FAR }, env);
    for (const layer of AMBIENT_LAYERS) {
      expect(far[layer], layer).toBeLessThanOrEqual(near[layer]);
    }
    expect(far.leaves).toBeLessThan(near.leaves);
    expect(far.birdsong).toBeLessThan(near.birdsong);
    expect(streamLoudness(far)).toBeLessThan(streamLoudness(near));
  });

  it('s přibližováním se hlasitost mění plynule (bez skoků)', () => {
    const env = environment();
    for (const x of [30, FOREST_EDGE_X - 100]) {
      let previous = ambientMix({ x, z: 0, radius: FAR }, env);
      for (let radius = FAR / 1.03; radius >= NEAR; radius /= 1.03) {
        const next = ambientMix({ x, z: 0, radius }, env);
        for (const layer of AMBIENT_LAYERS) {
          expect(Math.abs(next[layer] - previous[layer]), `${layer} r=${radius}`).toBeLessThan(
            0.05,
          );
        }
        previous = next;
      }
    }
  });

  it('při posunu kamery se hlasitost mění plynule (bez skoků)', () => {
    const env = environment();
    for (const radius of [NEAR, 650]) {
      let previous = ambientMix({ x: -600, z: 0, radius }, env);
      for (let x = -595; x <= 900; x += 5) {
        const next = ambientMix({ x, z: 0, radius }, env);
        for (const layer of AMBIENT_LAYERS) {
          expect(Math.abs(next[layer] - previous[layer]), `${layer} x=${x}`).toBeLessThan(0.05);
        }
        previous = next;
      }
    }
  });
});
