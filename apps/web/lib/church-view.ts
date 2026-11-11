// Kostely pro scénu (churches.md – Scéna): typy odvozené z jádra, bez vlastních rozměrů.
import type { Church, ChurchDims, ChurchType, Position } from '@bohemia/game';

/** Postup stavby po fázích, 0–1 (základy, zdi, střecha, výzdoba). */
export interface SceneChurchProgress {
  foundation: number;
  walls: number;
  roof: number;
  decor: number;
}

/** Kostel ke kreslení – hotový i staveniště. */
export interface SceneChurch {
  id: number;
  type: ChurchType;
  dims: ChurchDims;
  /** Střed hlavní lodi; `rotation` = směr osy vstup → kněžiště. */
  position: Position;
  progress: SceneChurchProgress;
  /** Omítnutý (výzdoba hotová); jinak holý kámen. */
  decorated: boolean;
}

const DONE: SceneChurchProgress = { foundation: 1, walls: 1, roof: 1, decor: 1 };

/** Dostavěný kostel vsi pro scénu: vše hotové, omítnutý podle `decoratedDay`. */
export function sceneChurchOf(church: Church): SceneChurch {
  const decorated = church.decoratedDay !== undefined;
  return {
    id: church.id,
    type: church.type,
    dims: church.dims,
    position: church.position,
    progress: { ...DONE, decor: decorated ? 1 : 0 },
    decorated,
  };
}
