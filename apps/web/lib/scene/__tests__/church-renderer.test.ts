import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { churchFootprintWorld, churchLocalToWorld, defaultChurchDims } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { churchModelRotationY } from '../church-renderer';

describe('natočení modelu kostela', () => {
  it('model natočený o 45° sedí s obrysem churchFootprintWorld (konvence budov)', () => {
    const position = { x: 40, z: 15, rotation: Math.PI / 4 };
    const m = Matrix.RotationY(churchModelRotationY(position.rotation));
    // místní bod modelu (osa vstup → kněžiště, napříč) → svět jako Babylon u sítě s rotation.y
    const local = { x: 3.5, z: -1.25 };
    const v = Vector3.TransformCoordinates(new Vector3(local.x, 0, local.z), m);
    const world = churchLocalToWorld(position, local.x, local.z);
    expect(position.x + v.x).toBeCloseTo(world.x, 3);
    expect(position.z + v.z).toBeCloseTo(world.z, 3);
    // roh obrysu rotundy se otočí stejně
    const dims = defaultChurchDims('rotunda');
    const flat = churchFootprintWorld('rotunda', dims, { x: 0, z: 0, rotation: 0 })[0]![0]!;
    const turned = churchFootprintWorld('rotunda', dims, position)[0]![0]!;
    const u = Vector3.TransformCoordinates(new Vector3(flat.x, 0, flat.z), m);
    expect(turned.x).toBeCloseTo(position.x + u.x, 3);
    expect(turned.z).toBeCloseTo(position.z + u.z, 3);
  });
});
