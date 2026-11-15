// Praporek cíle výjezdu vojvody (lord-control.md – Co hráč vidí: „na zemi zůstane praporek cíle“;
// journey.md – Scéna vsi). Praporek stojí na zemi v cíli `group.goal` – jádro cíl ve vodě posune
// na nejbližší dosažitelné místo (`settleGoal`), takže praporek stojí tam. Dva meshe bez modelů
// (vlastní geometrie), kreslí se jen při změně. Přesýpací hodiny nad čekající skupinou Martin
// 14. 11. 2026 zrušil. Použije i scéna cizí mapy (Úloha 9).
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Pos } from '@bohemia/game';
import type { SceneJourney } from './journey-riders';

/** Co značky ukazují: praporek v cíli. */
export interface JourneyMarks {
  goal: Pos | null;
}

/**
 * Klíč skupiny výpravy `${journeyId}:${partyId}` (výběr celé skupiny); `journeyId` hloučku je
 * `${journeyId}:${groupId}` (journey-view.ts – `sceneJourneyKey`), skupina je v `partyId`.
 */
export function partyKeyOf(j: Pick<SceneJourney, 'journeyId' | 'partyId'>): string | null {
  if (j.partyId === undefined) return null;
  const cut = j.journeyId.lastIndexOf(':');
  return `${cut < 0 ? j.journeyId : j.journeyId.slice(0, cut)}:${j.partyId}`;
}

/**
 * Skupiny vlastních vybraných lidí: klíče skupin (`partyKeyOf`), v jejichž hloučcích je aspoň jeden
 * z `personIds` vsi `villageId` (chybí – ves scény; id osoby je jedinečné jen ve vsi).
 */
export function selectedPartyKeys(
  journeys: readonly SceneJourney[],
  personIds: readonly number[],
  villageId?: string,
): Set<string> {
  const out = new Set<string>();
  if (personIds.length === 0) return out;
  const ids = new Set(personIds);
  for (const j of journeys) {
    if (!j.own || j.villageId !== villageId) continue;
    if (!j.men.some((m) => m.personId !== null && ids.has(m.personId))) continue;
    const key = partyKeyOf(j);
    if (key) out.add(key);
  }
  return out;
}

/**
 * Značky vybrané skupiny vlastní výpravy (návrh Clauda; Martin 14. 11. 2026: praporek jen u vybrané
 * skupiny): praporek na cíli jejího hloučku, dokud skupina jede ven nebo na místě čeká a cíl je na
 * této mapě. Nevybraná skupina, cizí výjezd ani návrat domů praporek nemají – cíl je rozkaz hráče.
 */
export function journeyMarks(
  journeys: readonly SceneJourney[],
  selected: ReadonlySet<string>,
): JourneyMarks {
  const goal = journeys.find((j) => {
    const key = partyKeyOf(j);
    return j.own && j.phase === 'out' && j.goal !== null && key !== null && selected.has(key);
  })?.goal;
  return { goal: goal ? { x: goal.x, z: goal.z } : null };
}

/** Výška tyče praporku (m) – nad jezdce na koni, ať je cíl vidět i se skupinou na místě. */
export const BANNER_POLE_M = 3.4;

/**
 * Praporek ve scéně. `set` značky přepíše jen při změně a vrátí, jestli je co překreslit;
 * nic se samo nehýbe (žádné kreslení navíc).
 */
export class JourneyMarker {
  private pole: Mesh | null = null;
  private flag: Mesh | null = null;
  private marks: JourneyMarks = { goal: null };

  constructor(
    private readonly scene: Scene,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {}

  /** Nové značky; true – změnily se (překreslit). */
  set(marks: JourneyMarks): boolean {
    if (sameMarks(this.marks, marks)) return false;
    this.marks = marks;
    const goal = marks.goal;
    if (goal) {
      const { pole, flag } = this.ensureBanner();
      const y = this.groundHeight(goal.x, goal.z);
      pole.position.set(goal.x, y + BANNER_POLE_M / 2, goal.z);
      flag.position.set(goal.x, y + BANNER_POLE_M, goal.z);
    }
    this.pole?.setEnabled(goal !== null);
    this.flag?.setEnabled(goal !== null);
    return true;
  }

  /** Co značky ukazují (e2e): praporek. */
  stats(): { banner: Pos | null } {
    return { banner: this.marks.goal ? { ...this.marks.goal } : null };
  }

  dispose(): void {
    for (const mesh of [this.pole, this.flag]) {
      mesh?.material?.dispose(true, true);
      mesh?.dispose();
    }
  }

  private ensureBanner(): { pole: Mesh; flag: Mesh } {
    if (this.pole && this.flag) return { pole: this.pole, flag: this.flag };
    const pole = CreateBox(
      'journey-banner-pole',
      { width: 0.09, depth: 0.09, height: BANNER_POLE_M },
      this.scene,
    );
    pole.isPickable = false;
    pole.material = flatMaterial(this.scene, 'journey-banner-pole', new Color3(0.36, 0.25, 0.15));
    // praporek: trojúhelníkový cíp od tyče, rozkmit jen vzhledem (bez animace)
    const flag = new Mesh('journey-banner-flag', this.scene);
    const data = new VertexData();
    data.positions = [0, 0, 0, 1.15, -0.22, 0.08, 0, -0.7, 0];
    data.indices = [0, 1, 2];
    data.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    data.applyToMesh(flag);
    flag.isPickable = false;
    const cloth = flatMaterial(this.scene, 'journey-banner-flag', new Color3(0.72, 0.12, 0.1));
    cloth.backFaceCulling = false;
    flag.material = cloth;
    this.pole = pole;
    this.flag = flag;
    return { pole, flag };
  }
}

function flatMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.35);
  material.specularColor = Color3.Black();
  return material;
}

function sameMarks(a: JourneyMarks, b: JourneyMarks): boolean {
  const samePos = (p: Pos | null, q: Pos | null): boolean =>
    p === q || (p !== null && q !== null && p.x === q.x && p.z === q.z);
  return samePos(a.goal, b.goal);
}
