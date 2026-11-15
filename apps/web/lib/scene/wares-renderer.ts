// Klát a rám s kůží u obydlí ve scéně (hides-honey.md – Ve scéně): u každého hotového obydlí stojí
// včelí klát (od května do září se včelami u česna), před obývanými domy rámy s napnutou kůží, dokud
// se kůže zpracovává. Modely z models/wares/ v instancích; přestaví se jen při změně, kterou je
// vidět (klíč podle domů a zboží), a pak dá vědět, že je co překreslit.
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { sceneFrame } from './village-layout';
import { instanceMatrices, loadMergedModel, type ModelInstance } from './instanced-model';
import type { HeightFn } from './ore-site-layout';
import type { SceneVillage } from '../village-view';
import { hideFrameDwellings, hideFramePlacement, hivePlacement } from './wares-placement';

const MODEL_BASE_URL = '/models/wares/';
type WareModel = 'hive' | 'hive-bees' | 'hide-frame';
const WARE_MODELS: readonly WareModel[] = ['hive', 'hive-bees', 'hide-frame'];

/** Stav scény, ze kterého se klát a rámy kreslí. */
export interface WaresInput {
  dwellings: SceneVillage['dwellings'];
  wares: SceneVillage['wares'];
}

export class WaresRenderer {
  private key = '';
  private input: WaresInput | null = null;
  private readonly models = new Map<WareModel, Mesh>();
  private loading: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      groundHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      onAsyncChange(): void;
      prepareMaterial(material: Material): void;
    },
  ) {}

  /** Postaví klát a rámy podle scény; vrátí true při změně. */
  update(input: WaresInput): boolean {
    if (this.disposed) return false;
    const key = waresKey(input);
    if (key === this.key) return false;
    this.key = key;
    this.input = input;
    if (key !== '') void this.load();
    this.apply();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const mesh of this.models.values()) mesh.dispose();
    this.models.clear();
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        for (const name of WARE_MODELS) {
          const mesh = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${name}.glb`,
            `village-ware-${name}`,
            (m) => this.context.prepareMaterial(m),
          );
          if (!mesh) return;
          if (this.disposed) {
            mesh.dispose();
            return;
          }
          mesh.setEnabled(false);
          this.context.addShadowCaster(mesh);
          this.models.set(name, mesh);
        }
        this.apply();
        this.context.onAsyncChange();
      } catch (error) {
        console.warn('Klát a rám s kůží se nepodařilo načíst.', error);
      }
    })();
    return this.loading;
  }

  /** Rozmístí instance podle poslední scény. */
  private apply(): void {
    if (!this.input) return;
    const { dwellings, wares } = this.input;
    const built = dwellings.filter((d) => d.built);
    const hives: ModelInstance[] = [];
    const frames: ModelInstance[] = [];
    for (const d of built) {
      const at = hivePlacement(d.type, sceneFrame(d), d.position);
      hives.push(this.instance(at));
    }
    const owners = new Set(hideFrameDwellings(built, wares?.frames ?? 0, wares?.day ?? 0));
    for (const d of built) {
      if (!owners.has(d.id)) continue;
      frames.push(this.instance(hideFramePlacement(d.type, sceneFrame(d), d.position)));
    }
    const beesOut = wares?.beesOut ?? false;
    this.show('hive', beesOut ? [] : hives);
    this.show('hive-bees', beesOut ? hives : []);
    this.show('hide-frame', frames);
  }

  private instance(at: { x: number; z: number; rotationY: number }): ModelInstance {
    return {
      x: at.x,
      y: this.context.groundHeight(at.x, at.z),
      z: at.z,
      rotationY: at.rotationY,
      scale: 1,
    };
  }

  private show(name: WareModel, instances: readonly ModelInstance[]): void {
    const mesh = this.models.get(name);
    if (!mesh) return;
    if (instances.length === 0) {
      mesh.setEnabled(false);
      return;
    }
    mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
    mesh.setEnabled(true);
  }
}

/** Klíč toho, co je vidět: hotová obydlí (poloha, tvar), včely, rámy a den (rotace rámů). */
export function waresKey(input: WaresInput): string {
  const built = input.dwellings.filter((d) => d.built);
  if (built.length === 0) return '';
  const frames = input.wares?.frames ?? 0;
  const houses = built
    .map((d) => {
      const f = sceneFrame(d);
      return [
        d.id,
        d.type,
        d.position.x,
        d.position.z,
        d.position.rotation,
        d.inhabited === false ? 0 : 1,
        f.kx,
        f.sz,
      ].join(',');
    })
    .join(';');
  return `${houses}|${input.wares?.beesOut ? 1 : 0}|${frames}|${frames > 0 ? (input.wares?.day ?? 0) : 0}`;
}
