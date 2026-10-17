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

/** Peřej přes oblázky – štěrkové dno, potok zní naplno. */
const RIFFLE = 0.95;

/** Rovný potok podél osy z (x = 0), poloviční šířka 8 m; rychlost proudu podle z. */
function straightStream(
  speedAt: number | ((z: number) => number),
  pool = 0,
): AmbientEnvironment['stream'] {
  const points = [];
  for (let z = -1000; z <= 1000; z += 7.5) {
    const speed = typeof speedAt === 'number' ? speedAt : speedAt(z);
    points.push({ x: 0, z, speed, pool, halfLeft: 8, halfRight: 8 });
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
  speed = RIFFLE,
  forest: AmbientEnvironment['forest'] = halfPlaneForest,
): AmbientEnvironment => ({ stream: straightStream(speed), forest });

const total = (gains: AmbientGains): number =>
  AMBIENT_LAYERS.reduce((sum, layer) => sum + gains[layer], 0);
const streamLoudness = (gains: AmbientGains): number =>
  Math.hypot(gains.streamMedium, gains.streamFast);

describe('streamSpeedWeights', () => {
  it('mírný proud přes oblázky je střední voda, prudká peřej rychlá', () => {
    expect(streamSpeedWeights(0.55)).toEqual({ medium: 1, fast: 0 });
    expect(streamSpeedWeights(0.95)).toEqual({ medium: 0, fast: 1 });
  });

  it('prolínání drží stejný výkon (součet čtverců je 1) a s rychlostí plynule přechází', () => {
    let previousFast = 0;
    for (let speed = 0; speed <= 1; speed += 0.01) {
      const w = streamSpeedWeights(speed);
      expect(w.medium ** 2 + w.fast ** 2).toBeCloseTo(1, 6);
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

  it('potok zní jen tam, kde teče přes oblázky – nad bahnem, pískem a v tůni je ticho', () => {
    const view = { x: 0, z: 0, radius: NEAR };
    expect(streamLoudness(ambientMix(view, environment(0.1)))).toBe(0);
    expect(streamLoudness(ambientMix(view, environment(0.4)))).toBe(0);
    const pool = { stream: straightStream(RIFFLE, 1), forest: noForest };
    expect(streamLoudness(ambientMix(view, pool))).toBe(0);
    expect(streamLoudness(ambientMix(view, environment(RIFFLE)))).toBeGreaterThan(0.5);
  });

  it('rychlost proudu přes oblázky volí vrstvu: mírný proud střední voda, peřej rychlá', () => {
    const view = { x: 0, z: 0, radius: NEAR };
    const gentle = ambientMix(view, environment(0.6));
    expect(gentle.streamMedium).toBeGreaterThan(0);
    expect(gentle.streamFast).toBe(0);
    const riffle = ambientMix(view, environment(RIFFLE));
    expect(riffle.streamFast).toBeGreaterThan(0.5);
    expect(riffle.streamMedium).toBe(0);
    // Víc oblázků v rychlejším proudu – peřej zní silněji než mírný proud.
    expect(streamLoudness(riffle)).toBeGreaterThan(streamLoudness(gentle));
  });

  it('nad tichým úsekem je slyšet peřej opodál, slaběji než u ní, daleko od ní nic', () => {
    // Od z = 0 dál peřej přes oblázky, před ní líný proud nad bahnem.
    const env = {
      stream: straightStream((z) => (z < 0 ? 0.1 : RIFFLE)),
      forest: noForest,
    };
    const atRiffle = streamLoudness(ambientMix({ x: 0, z: 100, radius: NEAR }, env));
    const nearby = streamLoudness(ambientMix({ x: 0, z: -40, radius: NEAR }, env));
    const farAway = streamLoudness(ambientMix({ x: 0, z: -400, radius: NEAR }, env));
    expect(atRiffle).toBeGreaterThan(0.5);
    expect(nearby).toBeGreaterThan(0);
    expect(nearby).toBeLessThan(atRiffle);
    expect(farAway).toBe(0);
  });

  it('v krajině bez potoka je potok potichu', () => {
    const gains = ambientMix(
      { x: 0, z: 0, radius: NEAR },
      { stream: { points: [] }, forest: halfPlaneForest },
    );
    expect(gains.streamMedium + gains.streamFast).toBe(0);
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
    const env = environment(RIFFLE, forestEverywhere);
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
