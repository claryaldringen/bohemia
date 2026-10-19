import { describe, expect, it } from 'vitest';
import {
  INITIAL_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../landscape';
import { createRandom } from '../../landscape/random';
import { NO_OBSTACLE_CHANGES } from '../obstacles';
import {
  computePathNetwork,
  pathBounds,
  type PathNetwork,
  type PathVillage,
} from '../paths/network';
import { nearestByScan, nearestPartFinder } from '../paths/nearest';
import { obstaclePosition, pathTerrainOf, pathWindowFor, withObstacles } from '../paths/terrain';

/** Otisk FNV-1a 32 bitů – čísla po bitech (Float64), ať se pozná i nejmenší změna. */
function fingerprint(values: readonly number[]): string {
  const bytes = new Uint8Array(Float64Array.from(values).buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 0x01000193);
  return `${values.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function networkFingerprint(network: PathNetwork): string {
  const values: number[] = [network.trips];
  for (const line of network.lines) {
    values.push(line.points.length, line.openStart ? 1 : 0, line.openEnd ? 1 : 0);
    for (const p of line.points) values.push(p.x, p.z);
    values.push(...line.strength, ...line.years);
  }
  values.push(...network.traffic.values, ...network.traffic.raw);
  for (const [id, errands] of [...network.errands].sort((a, b) => a[0] - b[0])) {
    values.push(id, errands.water?.x ?? NaN, errands.water?.z ?? NaN);
    values.push(errands.wood?.x ?? NaN, errands.wood?.z ?? NaN);
  }
  return fingerprint(values);
}

describe('nejbližší díl přes přihrádky (nearestPartFinder)', () => {
  it('dá stejný díl jako průchod všemi – i na hranách a rozích políček (shody)', () => {
    // pole 30 × 20 políček 15 m se středy na 7,5 + 15 k, bez několika políček
    const parts = [];
    for (let j = 0; j < 20; j++) {
      for (let i = 0; i < 30; i++) {
        if ((i * 7 + j * 3) % 11 === 0) continue;
        parts.push({ x: -142.5 + i * 15, z: -97.5 + j * 15, id: parts.length });
      }
    }
    const nearest = nearestPartFinder(parts, 15);
    // body po 3,75 m (buňky sítě pěšin) – padají přesně na hrany i rohy políček
    for (let z = -110; z <= 200; z += 3.75) {
      for (let x = -160; x <= 310; x += 3.75) {
        expect(nearest(x, z)).toBe(nearestByScan(parts, x, z));
      }
    }
  });

  it('nepravidelné díly, přihrádka menší i větší než rozestup, body daleko od dílů', () => {
    const rng = createRandom(7);
    const random = (): number => rng.next();
    const parts = Array.from({ length: 300 }, (_, id) => ({
      x: Math.round((random() * 400 - 200) * 4) / 4,
      z: Math.round((random() * 300 - 150) * 4) / 4,
      id,
    }));
    for (const bucket of [3.75, 15, 40]) {
      const nearest = nearestPartFinder(parts, bucket);
      for (let k = 0; k < 4000; k++) {
        const x = Math.round((random() * 1200 - 600) * 4) / 4;
        const z = Math.round((random() * 900 - 450) * 4) / 4;
        expect(nearest(x, z)).toBe(nearestByScan(parts, x, z));
      }
    }
  });

  it('pár dílů, neplatná přihrádka i bod mimo čísla – průchod všemi', () => {
    const few = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ];
    expect(nearestPartFinder(few, 15)(5, 1)).toBe(few[0]);
    const many = Array.from({ length: 20 }, (_, i) => ({ x: i * 15, z: 0 }));
    expect(nearestPartFinder(many, 0)(31, 0)).toBe(many[2]);
    expect(nearestPartFinder(many, 15)(NaN, 0)).toBe(many[0]);
  });
});

describe('síť pěšin na skutečné krajině – zlatý otisk', () => {
  // Síť počítá server (vzdálenost chůze dílů – simulace) i prohlížeč (vzhled). Zrychlení výpočtu
  // ji nesmí změnit ani o bit; otisk je z doby před indexem nejbližšího dílu (18. 10. 2026).
  // Spadne-li po záměrné změně pravidel sítě, otisk se vědomě přepíše.
  it('ves s polem 12 × 9 dílů v různých stadiích a prací na poli', () => {
    const landscape = generateLandscape(42, INITIAL_LAYER_VERSIONS);
    const layer = obstaclesOf(landscape);
    const site = landscape.villageSite;
    const home = tileCenterWorld(landscape, site.x, site.y);
    const stages = ['sown', 'young-fallow', 'ready', 'meadow', 'founding'] as const;
    const parts = [];
    for (let j = 0; j < 9; j++) {
      for (let i = 0; i < 12; i++) {
        const cell = { x: site.x + 2 + i, y: site.y - 4 + j };
        const c = tileCenterWorld(landscape, cell.x, cell.y);
        const stage = stages[(i * 3 + j * 2 + Math.floor(i / 4)) % stages.length]!;
        parts.push({ cell, x: c.x, z: c.z, size: landscape.cellSizeM, stage });
      }
    }
    const village: PathVillage = {
      dwellings: [
        { id: 1, type: 'zemnice', position: { x: home.x, z: home.z, rotation: 0 }, built: true },
        {
          id: 2,
          type: 'polozemnice',
          position: { x: home.x - 14, z: home.z + 6, rotation: 1.2 },
          built: true,
        },
        {
          id: 3,
          type: 'zemnice',
          position: { x: home.x + 4, z: home.z - 16, rotation: 3 },
          built: true,
        },
      ],
      fields: [{ id: 7, parts }],
      labor: {
        day: 40000,
        month: 4,
        people: { children: 5, adults: 9, elders: 2 },
        shares: [{ target: { kind: 'field', id: 7 }, manDays: 7.5 }],
      },
    };
    const terrain = withObstacles(
      pathTerrainOf(landscape, pathWindowFor(landscape, pathBounds(village)!)),
      layer,
      NO_OBSTACLE_CHANGES,
    );
    const network = computePathNetwork({
      village,
      terrain,
      tree: (id) => obstaclePosition(layer, id),
    });
    expect(network.lines.length).toBeGreaterThan(0);
    // 19. 10. 2026 přepsáno záměrně: pole lidi nezdržuje (Martin – osetý, zoraný a zakládaný díl
    // stojí jako úhor, dřív 12 a 3); v otisku jsou díly ve všech stadiích, cena se změnila
    expect(networkFingerprint(network)).toBe('75243:c7d79a96');
  }, 30_000);
});
