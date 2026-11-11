import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { isDeciduousMesh } from './season-foliage';
import { addSunShadows, type SunShadows } from './sun-shadows';

/**
 * Vrhače stínu scény (sun-shadows.ts): stínová mapa slunce vzniká až po modelech krajiny – co
 * vznikne dřív (ves, pařezy, klády, kamení), počká. Listnáče v zimě stín nevrhají (`setBare`).
 */
export class ShadowCasters {
  private shadows: SunShadows | null = null;
  /** Vrhače stínu vsi, které vznikly dřív než stínová mapa. */
  private readonly pending: Mesh[] = [];
  /** Listnáče ve stínové mapě a jestli jsou zrovna vyřazené (holé). */
  private deciduous: Mesh[] = [];
  private bare = false;

  /** Stínová mapa slunce (null – ještě nevznikla). */
  get sun(): SunShadows | null {
    return this.shadows;
  }

  /** Vrhač stínu krajiny (pařezy, klády, kamení, větve) – hned, nebo až se stínovou mapou. */
  add(mesh: Mesh): void {
    if (this.shadows) this.shadows.addCaster(mesh);
    else this.pending.push(mesh);
  }

  /**
   * Vrhač stínu ze vsi (stavby, jabloně sadu – vznikají až po krajině). Listnáče (jabloně) se
   * zařadí mezi holé v zimě, ať nevrhají stín plného listí.
   */
  addVillage(mesh: Mesh): void {
    const deciduous = isDeciduousMesh(mesh.name) && !this.deciduous.includes(mesh);
    if (deciduous) this.deciduous.push(mesh);
    if (!this.shadows) {
      this.pending.push(mesh);
      return;
    }
    this.shadows.addCaster(mesh);
    if (deciduous && this.bare) this.shadows.setCastersEnabled([mesh], false);
  }

  /**
   * Stínová mapa slunce po načtení modelů krajiny: stromy, impostory a dekorace krajiny i čekající
   * vrhače; přijímá ji terén. Listnáče (bez impostorů – ty vrhají stín ze zimního atlasu) se
   * zapamatují pro zimu.
   */
  create(scene: Scene, terrain: Mesh | null, extentM: number): void {
    const sun = scene.getLightByName('sun');
    if (!(sun instanceof DirectionalLight)) return;
    this.shadows = addSunShadows(sun, {
      casters: [
        ...scene.meshes.filter(
          (mesh): mesh is Mesh =>
            mesh instanceof Mesh && /^(trees|impostors|decor)-/.test(mesh.name),
        ),
        ...this.pending.filter((mesh) => !mesh.isDisposed()),
      ],
      receivers: terrain ? [terrain] : [],
      extentM,
    });
    this.pending.length = 0;
    // impostory listnáčů v zimě nevypadnou – vrhají stín ze zimního atlasu (setBareShadows)
    this.deciduous = scene.meshes.filter(
      (mesh): mesh is Mesh =>
        mesh instanceof Mesh && isDeciduousMesh(mesh.name) && !mesh.name.startsWith('impostors-'),
    );
  }

  /** Překreslí stínovou mapu (nové nebo změněné vrhače). */
  refresh(): void {
    this.shadows?.refresh();
  }

  /**
   * Holé listnáče (zima) stín nevrhají – vyřadí je ze stínové mapy, nebo vrátí. Vrátí true při
   * změně (bez stínové mapy nic).
   */
  setBare(bare: boolean): boolean {
    if (!this.shadows || bare === this.bare) return false;
    this.bare = bare;
    this.shadows.setCastersEnabled(this.deciduous, !bare);
    return true;
  }
}
