import '@babylonjs/core/Culling/ray';
import { Ray as PickingRay } from '@babylonjs/core/Culling/ray.core';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { premiumFeaturesOf, surfaceAt, tileOfWorldPoint, type Landscape } from '@bohemia/game';
import type { TileInfo } from '../tile-info';
import type { SceneVillage } from '../village-view';
import type { RtsCamera } from './camera';
import { isDrag, nextClick, type ClickRecord } from './camera-input';
import { draftHitTarget } from './draft-pick';
import { pickPremiumSite } from './premium-picking';
import type { ScenePerf } from './scene-perf';
import { screenProjector } from './scene-projection';
import type { TerrainMesh } from './terrain-mesh';
import { tileAt } from './tile-at';
import type { VillageVillagers } from './villagers';
import { pickVillageTarget, type Ray, type VillageTarget } from './village-picking';
import type { ActivePlacement } from './village-placement';
import type { VillageRenderer } from './village-renderer';
import type { VillageWildlife } from './wildlife';

export type HoverListener = (tile: TileInfo | null) => void;
/**
 * Výběr kliknutím: co je pod kurzorem, jestli hráč držel Ctrl (Cmd) nebo Shift – přidá / ubere
 * obydlí z výběru (migration.md – Výběr víc obydlí) – a dvojklik (`double` – druhé kliknutí řady,
 * celé pole či sad – fields.md, Co hráč vidí).
 */
export type SelectListener = (
  target: VillageTarget | null,
  additive: boolean,
  double: boolean,
) => void;
/** Bod terénu pro bránu opevnění (null – zrušení). */
export type GatePick = (point: { x: number; z: number } | null) => void;

/** Vstupy kurzoru – části scény vznikají postupně v `setLandscape`, proto přes getter. */
export interface PointerDeps {
  scene: Scene;
  canvas: HTMLCanvasElement;
  engine: AbstractEngine;
  camera: () => RtsCamera | null;
  landscape: () => Landscape | null;
  /** Terén s pickem po výškové síti (terrain-pick.ts). */
  terrain: () => TerrainMesh | null;
  /** Běžící umisťování – kurzor nad zemí, kliknutí nevybírá. */
  placement: () => ActivePlacement | null;
  perf: () => ScenePerf | null;
  groundHeight: () => ((x: number, z: number) => number) | null;
  /** Co jde vybrat kliknutím: stav vsi, spřežení a vozy, lidé a divoká zvěř. */
  village: () => SceneVillage | null;
  villageRenderer: () => VillageRenderer | null;
  villagers: () => VillageVillagers | null;
  wildlife: () => VillageWildlife | null;
}

/**
 * Kurzor a kliknutí do scény: políčko pod kurzorem (pick jednou za snímek – `pickHoveredTile`),
 * kurzor umisťování, výběr kliknutím a dvojklikem (jako v 0 A.D.), brána opevnění a pick terénu
 * po výškové síti (`pickGround`, nikdy `scene.pick` na terénu).
 */
export class ScenePointer {
  private readonly hoverListeners = new Set<HoverListener>();
  private readonly selectListeners = new Set<SelectListener>();
  /**
   * Brána opevnění (fortifications.md – Rozhraní): dokud je nastavená, levé kliknutí do krajiny
   * ohlásí bod terénu (místo výběru) a pravé zruší; null = běžný výběr.
   */
  private gatePick: GatePick | null = null;
  /** Stisknutá tlačítka myši nad plátnem: kde a jestli zrovna běželo umisťování. */
  private readonly downs = new Map<number, { x: number; y: number; placing: boolean }>();
  /** Poslední kliknutí levým tlačítkem mimo umisťování – dvojklik (`nextClick`). */
  private lastClick: ClickRecord | null = null;
  private hovered: TileInfo | null = null;
  private pointerMoved = false;
  private pointerInside = false;
  /** Paprsek pro pick terénu pod kurzorem (bez alokace při každém pohybu myši). */
  private readonly pickRay = PickingRay.Zero();

  constructor(private readonly deps: PointerDeps) {
    const canvas = deps.canvas;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  onTileHover(listener: HoverListener): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  onSelect(listener: SelectListener): () => void {
    this.selectListeners.add(listener);
    return () => this.selectListeners.delete(listener);
  }

  setGatePick(handler: GatePick | null): void {
    this.gatePick = handler;
    this.deps.canvas.style.cursor = handler ? 'crosshair' : '';
  }

  /** Pod nehybným kurzorem je po pohybu kamery jiné políčko. */
  cameraMoved(): void {
    if (this.pointerInside) this.pointerMoved = true;
  }

  /** Nové umisťování (nebo jeho model naskočil) – kurzor nad plátnem se znovu napíchne. */
  repick(): void {
    this.pointerMoved = this.pointerInside;
  }

  /** Bod terénu pod pixelem plátna (CSS px) jako [x, z], nebo null mimo krajinu. */
  pickGround(x: number, y: number): [number, number] | null {
    const ground = this.deps.terrain();
    const camera = this.deps.camera()?.camera;
    const landscape = this.deps.landscape();
    if (!ground || !camera || !landscape) return null;
    const perf = this.deps.perf();
    const started = perf ? performance.now() : 0;
    // Stejný paprsek jako `scene.pick` a stejné trojúhelníky, jen po výškové síti – jen políčka
    // pod paprskem místo celé sítě terénu (terrain-pick.ts).
    this.deps.scene.createPickingRayToRef(x, y, Matrix.Identity(), this.pickRay, camera, false);
    const point = ground.pick(this.pickRay);
    perf?.pick(performance.now() - started);
    if (!point || !tileAt(landscape, point.x, point.z)) return null;
    return [point.x, point.z];
  }

  /** Pick jednou za snímek, ne při každém pohybu myši – políčko pod kurzorem i umisťování. */
  pickHoveredTile(): void {
    const l = this.deps.landscape();
    if (!this.pointerMoved || !l || !this.deps.terrain()) return;
    this.pointerMoved = false;
    const { pointerX, pointerY } = this.deps.scene;
    const point = this.pickGround(pointerX, pointerY);
    this.deps.placement()?.setCursor(point, point ? { x: pointerX, y: pointerY } : null);
    const tile = point ? tileAt(l, point[0], point[1]) : null;
    if (!tile) {
      this.emit(null);
      return;
    }
    const i = tile.y * l.size + tile.x;
    this.emit({
      x: tile.x,
      y: tile.y,
      surface: surfaceAt(l, tile.x, tile.y),
      fertility: l.fertility[i]!,
      heightM: l.heights[i]!,
    });
  }

  dispose(): void {
    this.hoverListeners.clear();
    this.selectListeners.clear();
    const canvas = this.deps.canvas;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
  }

  private readonly onPointerMove = (): void => {
    this.pointerInside = true;
    this.pointerMoved = true;
  };

  private readonly onPointerLeave = (): void => {
    this.pointerInside = false;
    this.pointerMoved = false;
    this.deps.placement()?.setCursor(null, null);
    this.emit(null);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.downs.set(event.button, {
      x: event.offsetX,
      y: event.offsetY,
      placing: this.deps.placement() !== null,
    });
  };

  /** Kliknutí mimo umisťování vybírá (levé) a ruší výběr (pravé); tah krajinou nevybírá. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.downs.get(event.button);
    this.downs.delete(event.button);
    const at = { x: event.offsetX, y: event.offsetY };
    const clicked =
      down !== undefined &&
      !down.placing &&
      this.deps.placement() === null &&
      !isDrag(down, at) &&
      !(event.button === 0 && this.deps.camera()?.leftPressPanned());
    // dvojklik jen ze dvou levých kliknutí po sobě – tah, pravé tlačítko i umisťování řadu přeruší
    if (!clicked || event.button !== 0) this.lastClick = null;
    if (!clicked) return;
    if (this.gatePick) {
      if (event.button === 0) {
        const ground = this.pickGround(at.x, at.y);
        this.gatePick(ground ? { x: ground[0], z: ground[1] } : null);
      } else if (event.button === 2) this.gatePick(null);
      return;
    }
    if (event.button === 0) {
      this.lastClick = nextClick(this.lastClick, { ...at, at: event.timeStamp });
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      this.emitSelect(this.pickTarget(at.x, at.y), additive, this.lastClick.count >= 2);
    } else if (event.button === 2) this.emitSelect(null, false, false);
  };

  private emitSelect(target: VillageTarget | null, additive: boolean, double: boolean): void {
    for (const listener of this.selectListeners) listener(target, additive, double);
  }

  /**
   * Postava, obydlí, pole nebo hřbitov pod pixelem plátna (CSS px) – postavy mají přednost před
   * stavbami pod nimi (villagers.md – Výběr postavy).
   */
  private pickTarget(x: number, y: number): VillageTarget | null {
    const camera = this.deps.camera()?.camera;
    const landscape = this.deps.landscape();
    const groundHeight = this.deps.groundHeight();
    const villageState = this.deps.village();
    if (!camera || !landscape || !groundHeight || !villageState) return null;
    const project = screenProjector(this.deps.engine, this.deps.canvas, camera);
    const villagers = this.deps.villagers();
    // postava, nebo spřežení a vůz (i oráč, honák a vozka u nich) – bližší průmět vyhraje
    const person = villagers?.pickHit(x, y, project) ?? null;
    const draft = this.deps.villageRenderer()?.pickDraft(x, y, project) ?? null;
    // divoké zvíře – klik vybere druh (panel druhu); bližší průmět než postava a spřežení vyhraje
    const wild = this.deps.wildlife()?.pickHit(x, y, project) ?? null;
    if (
      wild &&
      (!person || wild.distance < person.distance) &&
      (!draft || wild.distance < draft.distance)
    ) {
      return { kind: 'wildlife', species: wild.species };
    }
    if (person && (!draft || person.distance <= draft.distance)) {
      return { kind: 'person', id: person.person };
    }
    if (draft) return draftHitTarget(draft, villagers);
    const pick = this.deps.scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
    const ray: Ray = {
      origin: { x: pick.origin.x, y: pick.origin.y, z: pick.origin.z },
      direction: { x: pick.direction.x, y: pick.direction.y, z: pick.direction.z },
    };
    const ground = this.pickGround(x, y);
    const at = ground ? { x: ground[0], z: ground[1] } : null;
    return (
      pickVillageTarget(villageState, ray, {
        ground: at,
        groundHeight,
        cellOf: (wx, wz) => tileOfWorldPoint(landscape, wx, wz),
      }) ??
      // prvek prémiové krajiny – jen když tu není nic ze vsi (premium-picking.ts)
      pickPremiumSite(landscape, premiumFeaturesOf(landscape), at)
    );
  }

  private emit(tile: TileInfo | null): void {
    const same =
      tile === this.hovered ||
      (tile !== null &&
        this.hovered !== null &&
        tile.x === this.hovered.x &&
        tile.y === this.hovered.y);
    if (same) return;
    this.hovered = tile;
    for (const listener of this.hoverListeners) listener(tile);
  }
}
