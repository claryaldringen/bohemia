import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape } from '@bohemia/game';
import type { WildlifeSpecies } from '../wildlife-view';
import { loadGeometry, type FaunaGeometry } from './fauna';
import { createAnimalMesh, standOnGround, writeAnimalPose } from './livestock';
import {
  createHerdState,
  createLivestockPose,
  herdState,
  livestockClock,
  routeArea,
  type Area,
  type HerdState,
} from './livestock-motion';
import type { LivestockGround, LivestockVillage } from './livestock-placement';
import { distanceToSegment, type Project } from './villager-pick';
import {
  APPROACH,
  FLEE,
  createFlightState,
  flightAt,
  presenceWalk,
  flightCalming,
  nearestThreat,
  startFlight,
  wildAnimalPose,
  wildArea,
  wildPresent,
  type Flight,
  type FlightState,
} from './wildlife-motion';
import {
  planWildlife,
  type WildGroup,
  type WildModel,
  type WildlifeVillage,
} from './wildlife-placement';

/** Dál od kamery (m) se zvěř nehýbe – je pár pixelů a pohyb by jen zbytečně kreslil. */
const ANIMATE_RANGE_M = 900;
/** Výška obalu skupiny nad terénem (m) – nejvyšší je jelen s parožím. */
const HEAD_ROOM_M = 2.6;
/** Výška zvířete (m při měřítku 1) pro výběr kliknutím – průmět od nohou po hřbet. */
const PICK_HEIGHT_M: Record<WildModel, number> = {
  'wild-boar': 0.9,
  'wild-stag': 1.7,
  'wild-hind': 1.4,
  'wild-wolf': 0.8,
  'wild-bear': 1.2,
  'wild-fox': 0.45,
  'wild-hare': 0.35,
};
/** Klik do tolika CSS px od průmětu zvířete ho vybere. */
const PICK_PX = 14;

export interface WildlifeEnvironment {
  landscape: Landscape;
  /** Přesná výška vykresleného terénu ve scéně – zvěř na něm stojí. */
  groundHeight(x: number, z: number): number;
  /** Terén pro zvířata kolem vsi (rastr sdílený s dobytkem – `VillageLivestock.groundFor`). */
  ground(village: LivestockVillage): LivestockGround | null;
  /** Poslední polohy lidí ve scéně (x, y, z po postavách; NaN = není vidět) – zvěř před nimi utíká. */
  threats(): Float32Array;
  /** Adresa modelů (…/wild-boar.glb). */
  baseUrl: string;
  /** Dočetly se modely a zvěř se objevila – překreslit. */
  onLoaded(): void;
}

/** Jeden model: mesh s instancemi, matice a stav pózy (krok, hlava). */
interface Kind {
  mesh: Mesh;
  matrices: Float32Array;
  states: Float32Array;
  count: number;
  dirty: boolean;
}

/** Skupina ve scéně – stav stáda a útěku, kde byla naposled zapsaná. */
interface Live {
  group: WildGroup;
  slots: number[];
  state: HerdState;
  flight: Flight | null;
  flightState: FlightState;
  /** Příchod z lesa / odchod do lesa vzácných (`presenceWalk`). */
  walkState: FlightState;
  /** Skupina je zapsaná jako vidět (vzácní mizí s úseky skutečného času). */
  shown: boolean;
  written: BoundingInfo | null;
  current: BoundingInfo;
  /** Pevný obal všeho, kam se skupina dostane (trasa a útěk) – levný ořez před výpočtem. */
  reach: BoundingInfo;
}

/**
 * Divoká zvěř u vsi (wildlife.md – Ve scéně): pár kusů podle stupně stavu z jádra na okraji
 * lesa, na loukách, u kraje vsi a v létě na dílu se škodou (wildlife-placement.ts). Kreslí se
 * jako dobytek (livestock.ts) – mesh `wild-*` na model s instancemi, krok a hlava dolů jsou
 * klíčové pózy ve vertex shaderu. Pohyb je čistá funkce skutečného času, `animate` pohne jen
 * skupinami v záběru; před člověkem do 30 m skupina uteče (wildlife-motion.ts). Rozmístění se
 * přepočítá jen při změně zvěře nebo vsi; modely se stahují až s prvním kusem daného modelu.
 */
export class VillageWildlife {
  private key = '';
  private village: WildlifeVillage | null = null;
  private plan: { groups: WildGroup[]; free(x: number, z: number): boolean } | null = null;
  private lives: Live[] = [];
  private readonly kinds = new Map<WildModel, Kind>();
  private readonly geometries = new Map<WildModel, FaunaGeometry | null>();
  private readonly loading = new Set<WildModel>();
  /** Poslední polohy kusů (x, y, z po kusech skupin; NaN = není vidět) a jejich druh a model. */
  private spots = new Float32Array(0);
  private spotOwners: { species: WildlifeSpecies; model: WildModel; scale: number }[] = [];
  private readonly pose = createLivestockPose();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: WildlifeEnvironment,
  ) {}

  /**
   * Zvěř podle vsi – přepočet jen při změně zvěře, obydlí nebo polí. Vrátí true, když se ve
   * scéně něco změnilo (je co překreslit).
   */
  update(village: WildlifeVillage & LivestockVillage, nowMs: number): boolean {
    if (this.disposed) return false;
    const key = wildlifeKey(village);
    if (key === this.key) return false;
    this.key = key;
    this.village = village;
    const ground = village.wildlife ? this.env.ground(village) : null;
    this.plan = ground ? planWildlife(village, ground, villageSeed(this.env.landscape)) : null;
    return this.rebuild(nowMs);
  }

  /**
   * Posune zvěř v záběru `camera` na okamžik `nowMs` (bez kamery všechnu). Vrátí true, když se
   * v záběru něco pohnulo.
   */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.lives.length === 0) return false;
    const clock = livestockClock(nowMs);
    const s = clock.seconds;
    const threats = this.env.threats();
    let moved = false;
    for (const live of this.lives) {
      if (!wildPresent(live.group, s)) {
        // vzácní (vlci, medvěd, liška) teď nejsou – jednou se zapíšou s nulovým měřítkem
        if (live.shown) {
          this.hide(live);
          moved = true;
        }
        continue;
      }
      // mimo záběr a dál než ANIMATE_RANGE_M se nepočítá nic (ani útěk a obal)
      if (camera && live.shown && this.outOfRange(live, camera)) continue;
      herdState(live.group.herd, clock, live.state);
      let flight: FlightState | null = null;
      if (live.flight) {
        if (flightAt(live.flight, s, live.flightState)) flight = live.flightState;
        else live.flight = null;
      }
      // vzácní na začátku úseku vyjdou z lesa a na konci do něj odejdou – posun se přičte
      // k útěku; cestou z lesa a do lesa se nový útěk nespouští
      const walking = presenceWalk(live.group, s, live.walkState);
      if (walking && flight) {
        flight.x += live.walkState.x;
        flight.z += live.walkState.z;
      } else if (walking) {
        flight = live.walkState;
      }
      // útěk před člověkem (jezdcem) blíž než 30 m – jen scéna
      if (!walking && (!live.flight || flightCalming(live.flight, s))) {
        const cx = live.state.x + (flight?.x ?? 0);
        const cz = live.state.z + (flight?.z ?? 0);
        const threat = nearestThreat(cx, cz, threats, FLEE.triggerM);
        const free = this.plan?.free;
        if (threat && free) {
          const next = startFlight(
            s,
            { x: flight?.x ?? 0, z: flight?.z ?? 0 },
            { x: cx, z: cz },
            threat,
            live.group.fleeSpeed,
            free,
          );
          if (next) {
            live.flight = next;
            flightAt(next, s, live.flightState);
            flight = live.flightState;
          }
        }
      }
      this.setBounds(live.current, wildArea(live.group, live.state, flight));
      if (camera && live.shown) {
        const visible =
          camera.isInFrustum(live.current) ||
          (live.written !== null && camera.isInFrustum(live.written));
        if (!visible) continue;
        const center = live.current.boundingSphere.centerWorld;
        if (Vector3.Distance(camera.globalPosition, center) > ANIMATE_RANGE_M) continue;
      }
      this.write(live, clock, flight);
      moved = true;
    }
    for (const kind of this.kinds.values()) {
      if (!kind.dirty) continue;
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('livestockState');
      kind.dirty = false;
    }
    return moved;
  }

  /**
   * Zvíře pod kurzorem (x, y): nejbližší průmět kusu ke kurzoru do `PICK_PX` – druh a vzdálenost
   * (px), scéna ji porovná s postavou a spřežením. Nic – null.
   */
  pickHit(
    x: number,
    y: number,
    project: Project,
  ): { species: WildlifeSpecies; distance: number } | null {
    let best: { species: WildlifeSpecies; distance: number } | null = null;
    this.spotOwners.forEach((owner, i) => {
      const o = i * 3;
      const wx = this.spots[o]!;
      if (Number.isNaN(wx)) return;
      const wy = this.spots[o + 1]!;
      const wz = this.spots[o + 2]!;
      const foot = project(wx, wy, wz);
      const top = project(wx, wy + PICK_HEIGHT_M[owner.model] * owner.scale, wz);
      if (!foot || !top) return;
      const d = distanceToSegment(x, y, foot, top);
      if (d <= PICK_PX && (!best || d < best.distance))
        best = { species: owner.species, distance: d };
    });
    return best;
  }

  /** Naplánované skupiny zvěře (druh a první stanoviště) – i před načtením modelů, pro e2e testy. */
  plannedGroups(): { species: WildlifeSpecies; x: number; z: number }[] {
    return (this.plan?.groups ?? []).flatMap((g) => {
      const spot = g.herd.route[0];
      return spot ? [{ species: g.species, x: spot.x, z: spot.z }] : [];
    });
  }

  /** Kusy, které jsou teď vidět (druh, model a poloha) – pro e2e testy (výběr kliknutím). */
  visibleAnimals(): { species: WildlifeSpecies; model: WildModel; x: number; z: number }[] {
    const out: { species: WildlifeSpecies; model: WildModel; x: number; z: number }[] = [];
    this.spotOwners.forEach((owner, i) => {
      const x = this.spots[i * 3]!;
      if (Number.isNaN(x)) return;
      out.push({ species: owner.species, model: owner.model, x, z: this.spots[i * 3 + 2]! });
    });
    return out;
  }

  dispose(): void {
    this.disposed = true;
    for (const kind of this.kinds.values()) {
      kind.mesh.material?.dispose();
      kind.mesh.dispose();
    }
    this.kinds.clear();
    this.lives = [];
  }

  /** Nové skupiny podle posledního plánu (po změně vsi a po načtení modelu). */
  private rebuild(nowMs: number): boolean {
    const had = this.lives.length > 0;
    const groups = this.plan?.groups ?? [];
    // modely líně – jen ty, které plán potřebuje
    for (const group of groups) for (const model of group.models) this.load(model);
    const ready = groups.filter((g) => g.models.every((m) => this.geometries.get(m)));
    if (ready.length === 0) {
      this.lives = [];
      this.spots = new Float32Array(0);
      this.spotOwners = [];
      for (const kind of this.kinds.values()) kind.mesh.setEnabled(false);
      return had;
    }
    const counts = new Map<WildModel, number>();
    const areas = new Map<WildModel, Area[]>();
    const lives: Live[] = [];
    // rozběhlý útěk přežije přestavbu (dočtení dalšího modelu) – skupiny se poznají podle seedu
    const running = new Map<number, Flight>();
    for (const old of this.lives) if (old.flight) running.set(old.group.herd.seed, old.flight);
    this.spotOwners = [];
    for (const group of ready) {
      const route = routeArea(group.herd);
      // i kam až skupina uteče nebo odkud vyjde z lesa
      const far = Math.max(FLEE.distanceM, APPROACH.distanceM);
      const reach: Area = {
        minX: route.minX - far,
        maxX: route.maxX + far,
        minZ: route.minZ - far,
        maxZ: route.maxZ + far,
      };
      const slots = group.models.map((model, i) => {
        const slot = counts.get(model) ?? 0;
        counts.set(model, slot + 1);
        const list = areas.get(model);
        if (list) list.push(reach);
        else areas.set(model, [reach]);
        this.spotOwners.push({
          species: group.species,
          model,
          scale: group.herd.animals[i]!.scale,
        });
        return slot;
      });
      const reachBox = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
      this.setBounds(reachBox, reach);
      lives.push({
        group,
        slots,
        state: createHerdState(),
        flight: running.get(group.herd.seed) ?? null,
        flightState: createFlightState(),
        walkState: createFlightState(),
        shown: false,
        written: null,
        current: new BoundingInfo(Vector3.Zero(), Vector3.Zero()),
        reach: reachBox,
      });
    }
    this.spots = new Float32Array(this.spotOwners.length * 3).fill(NaN);
    for (const [model, kind] of this.kinds) {
      if (!counts.has(model)) kind.mesh.setEnabled(false);
    }
    for (const [model, count] of counts) {
      const geometry = this.geometries.get(model);
      if (!geometry) continue;
      let kind = this.kinds.get(model);
      if (!kind) {
        kind = {
          mesh: createAnimalMesh(this.scene, model, geometry),
          matrices: new Float32Array(0),
          states: new Float32Array(0),
          count: 0,
          dirty: false,
        };
        this.kinds.set(model, kind);
      }
      kind.count = count;
      kind.matrices = new Float32Array(count * 16);
      kind.states = new Float32Array(count * 2);
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer('livestockState', kind.states, 2, false);
      // pevný obal přes všechna místa, kam se zvěř modelu dostane – podle něj se ořezává
      const box = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
      this.setBounds(box, mergeAreas(areas.get(model) ?? []));
      kind.mesh.setBoundingInfo(box);
      kind.mesh.setEnabled(true);
    }
    this.lives = lives;
    // póza v tomto okamžiku – při omezeném pohybu zvěř takhle zůstane
    this.animate(nowMs, null);
    return true;
  }

  /** Celý dosah skupiny je mimo záběr nebo dál než `ANIMATE_RANGE_M` od kamery. */
  private outOfRange(live: Live, camera: Camera): boolean {
    if (!camera.isInFrustum(live.reach)) return true;
    const sphere = live.reach.boundingSphere;
    return (
      Vector3.Distance(camera.globalPosition, sphere.centerWorld) - sphere.radiusWorld >
      ANIMATE_RANGE_M
    );
  }

  /** Zapíše kusy skupiny (výška a náklon podle terénu) a jejich polohy pro výběr. */
  private write(
    live: Live,
    clock: ReturnType<typeof livestockClock>,
    flight: FlightState | null,
  ): void {
    const height = this.env.groundHeight;
    const first = this.firstSpot(live);
    live.group.models.forEach((model, index) => {
      const kind = this.kinds.get(model);
      if (!kind) return;
      const pose = wildAnimalPose(live.group, index, clock, live.state, flight, this.pose);
      const scale = live.group.herd.animals[index]!.scale;
      writeAnimalPose(kind, live.slots[index]!, pose, scale, height);
      const o = (first + index) * 3;
      this.spots[o] = pose.x;
      this.spots[o + 1] = height(pose.x, pose.z);
      this.spots[o + 2] = pose.z;
    });
    live.shown = true;
    const written = live.written ?? new BoundingInfo(Vector3.Zero(), Vector3.Zero());
    written.reConstruct(live.current.minimum, live.current.maximum);
    live.written = written;
  }

  /** Skupina teď není vidět – kusy s nulovým měřítkem, výběr je nenajde. */
  private hide(live: Live): void {
    const first = this.firstSpot(live);
    live.group.models.forEach((model, index) => {
      const kind = this.kinds.get(model);
      if (!kind) return;
      kind.matrices.fill(0, live.slots[index]! * 16, live.slots[index]! * 16 + 16);
      kind.dirty = true;
      this.spots[(first + index) * 3] = NaN;
    });
    live.shown = false;
  }

  /** Pořadí prvního kusu skupiny v polohách pro výběr. */
  private firstSpot(live: Live): number {
    let first = 0;
    for (const other of this.lives) {
      if (other === live) return first;
      first += other.group.models.length;
    }
    return first;
  }

  private load(model: WildModel): void {
    if (this.geometries.has(model) || this.loading.has(model)) return;
    this.loading.add(model);
    void loadGeometry(this.scene, `${this.env.baseUrl}${model}.glb`).then(
      (geometry) => {
        if (this.disposed) return;
        this.loading.delete(model);
        this.geometries.set(model, geometry ? standOnGround(geometry) : null);
        if (geometry && this.rebuild(Date.now())) this.env.onLoaded();
      },
      (error: unknown) => {
        this.loading.delete(model);
        this.geometries.set(model, null);
        console.warn(`Model zvěře ${model} se nepodařilo načíst.`, error);
      },
    );
  }

  /** Obal oblasti s výškou terénu (vzorky v mřížce) a místem na zvěř nad ním. */
  private setBounds(box: BoundingInfo, area: Area): void {
    let low = Infinity;
    let high = -Infinity;
    for (let j = 0; j <= 4; j++) {
      for (let i = 0; i <= 4; i++) {
        const h = this.env.groundHeight(
          area.minX + ((area.maxX - area.minX) * i) / 4,
          area.minZ + ((area.maxZ - area.minZ) * j) / 4,
        );
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
    }
    box.reConstruct(
      new Vector3(area.minX, low - 1, area.minZ),
      new Vector3(area.maxX, high + HEAD_ROOM_M, area.maxZ),
    );
  }
}

/** Co rozhoduje o zvěři: zvěř z jádra, obydlí, díly polí, hřbitovy, sady a ohrady. */
function wildlifeKey(village: WildlifeVillage): string {
  if (!village.wildlife) return '';
  const dwellings = village.dwellings
    .map((d) => `${d.position.x.toFixed(1)},${d.position.z.toFixed(1)}:${d.built ? 1 : 0}`)
    .join(';');
  const parts = village.fields
    .map((f) =>
      f.parts
        .map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}:${p.look === 'stubble' ? 1 : 0}`)
        .join(','),
    )
    .join('|');
  const plots = village.dwellings.map((d) => (d.plot ? JSON.stringify(d.plot) : '')).join(';');
  const forest = `${village.obstacles?.removed.length ?? 0}/${village.obstacles?.stumps.length ?? 0}`;
  const squares = [
    ...(village.cemeteries ?? []).map((c) => c.squares.length),
    ...(village.orchards ?? []).map((o) => o.squares.length),
    ...(village.pens ?? []).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`),
  ].join(',');
  // lov, psi, hlídky a rybáři dne (W11) zvěř nepřeplánují
  const { shown, month, topPartId, crowFlocks, fishShare } = village.wildlife;
  const wild = { shown, month, topPartId, crowFlocks, fishShare };
  return `${JSON.stringify(wild)}#${dwellings}#${plots}#${parts}#${squares}#${forest}`;
}

function villageSeed(l: Landscape): number {
  return (l.villageSite.x * 131 + l.villageSite.y * 7919 + 4099) | 0;
}

function mergeAreas(areas: readonly Area[]): Area {
  return {
    minX: Math.min(...areas.map((a) => a.minX)),
    maxX: Math.max(...areas.map((a) => a.maxX)),
    minZ: Math.min(...areas.map((a) => a.minZ)),
    maxZ: Math.max(...areas.map((a) => a.maxZ)),
  };
}
