import { describe, expect, it } from 'vitest';
import { doorPoint, houseDoor } from '../villager-plan-geometry';
import type { House } from '../villager-plan-types';

// D16: dům na oploceném pozemku má dveře uvnitř pozemku, ne u branky v plotu.

function house(own?: House['box']): House {
  return {
    id: 1,
    position: { x: 10, z: 20, rotation: 0 },
    built: true,
    progress: 1,
    inhabited: true,
    box: { minX: -6, maxX: 6, minZ: -6, maxZ: 6 },
    ...(own ? { own } : {}),
  };
}

describe('houseDoor', () => {
  it('na pozemku vede do domu uvnitř plotu, dál než branka', () => {
    const h = house({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 });
    const inner = houseDoor(h)!;
    const gate = doorPoint(h);
    expect(inner).not.toBeNull();
    expect(Math.hypot(gate.x - inner.x, gate.z - inner.z)).toBeGreaterThan(2.5);
  });

  it('bez plotu (bez vlastního obdélníku domu) je null – nic se nemění', () => {
    expect(houseDoor(house())).toBeNull();
  });
});
