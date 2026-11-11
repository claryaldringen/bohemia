'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChurchDims, PlacementCheck } from '@bohemia/game';
import { setE2EHook } from '@/lib/e2e-hooks';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { PlacementMode, PlacementPreview, PlacementResult } from '@/lib/scene/village-types';

export interface Placement {
  /** Co se právě umisťuje (null = nic). */
  active: PlacementMode['kind'] | null;
  /** Poslední stav pod kurzorem pro bublinu (null = kurzor mimo krajinu nebo nic neběží). */
  preview: PlacementPreview | null;
  /**
   * Spustí umisťování ve scéně; běžící se zruší. `onConfirm` dostane jen prošlé umístění –
   * se Shiftem i víckrát za sebou (umisťování pak běží dál – `keepPlacing`).
   */
  start(
    mode: PlacementMode,
    onConfirm: (result: PlacementResult, keepPlacing: boolean) => void,
  ): void;
  /** Potvrdí umisťování jako Enter; neprošlé běží dál. */
  confirm(): void;
  /** Rozměry kostela z panelu u potvrzení (+/−) – jen při umisťování kostela. */
  setChurchDims(dims: ChurchDims): void;
  cancel(): void;
}

/** Projde potvrzení (z testovacího háčku) stejnou kontrolou jako kliknutí do scény? */
function checkResult(mode: PlacementMode, result: PlacementResult): PlacementCheck {
  if (mode.kind === 'dwelling' && result.kind === 'dwelling' && result.type === mode.type) {
    return mode.check(result.position);
  }
  if (mode.kind === 'plot' && result.kind === 'dwelling' && result.type === mode.type) {
    return result.plot ? mode.check(result.plot) : { ok: false, reason: 'Chybí pozemek.' };
  }
  if (mode.kind === 'squares' && result.kind === 'squares') return mode.preview(result.cells).check;
  if (mode.kind === 'fort-points' && result.kind === 'fort-points') {
    return mode.preview(result.points).check;
  }
  if (mode.kind === 'sacred' && result.kind === 'sacred' && result.type === mode.type) {
    return mode.check(result.position);
  }
  if (mode.kind === 'workshop' && result.kind === 'workshop' && result.craft === mode.craft) {
    return mode.check(result.position);
  }
  if (mode.kind === 'church' && result.kind === 'church' && result.type === mode.type) {
    return mode.check(result.dims, result.position);
  }
  return { ok: false, reason: 'Teď se umisťuje něco jiného.' };
}

/**
 * Umisťování staveb ve scéně pro React: stav pro bublinu a nabídku, zrušení při odchodu.
 * Každé spuštění má vlastní pořadové číslo – ohlášení dřívějšího (zrušeného) umisťování se
 * zahodí.
 */
export function usePlacement(scene: LandscapeScene | null): Placement {
  const [active, setActive] = useState<PlacementMode['kind'] | null>(null);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const tokenRef = useRef(0);

  const start = useCallback(
    (
      mode: PlacementMode,
      onConfirm: (result: PlacementResult, keepPlacing: boolean) => void,
    ): void => {
      if (!scene) return;
      const token = ++tokenRef.current;
      /** Ukončí toto umisťování v rozhraní; false = už neběží (nahradilo ho jiné). */
      const finish = (): boolean => {
        if (tokenRef.current !== token) return false;
        tokenRef.current++;
        setActive(null);
        setPreview(null);
        setE2EHook('confirmPlacement', undefined);
        return true;
      };
      scene.startPlacement(mode, {
        onConfirm: (result, keepPlacing) => {
          if (keepPlacing) {
            if (tokenRef.current === token) onConfirm(result, true);
            return;
          }
          if (finish()) onConfirm(result, false);
        },
        onCancel: () => {
          finish();
        },
        onPreview: (next) => {
          if (tokenRef.current === token) setPreview(next);
        },
      });
      setActive(mode.kind);
      setPreview(null);
      setE2EHook('confirmPlacement', (result) => {
        if (tokenRef.current !== token) throw new Error('Umisťování už neběží.');
        const check = checkResult(mode, result);
        if (!check.ok) throw new Error(check.reason ?? 'Umístění neprošlo kontrolou.');
        finish();
        scene.cancelPlacement(); // uklidí ducha ve scéně; jeho onCancel se už zahodí
        onConfirm(result, false);
      });
    },
    [scene],
  );

  const confirm = useCallback((): void => {
    scene?.confirmPlacement();
  }, [scene]);

  const setChurchDims = useCallback(
    (dims: ChurchDims): void => {
      scene?.setChurchDims(dims);
    },
    [scene],
  );

  const cancel = useCallback((): void => {
    scene?.cancelPlacement();
  }, [scene]);

  // Nová scéna nebo odchod z herní plochy – staré umisťování nemá kam ohlásit výsledek.
  // (Zrušená scéna už umisťování uklidila sama, bez ohlášení – proto stav nulujeme tady.)
  useEffect(() => {
    const tokens = tokenRef;
    return () => {
      tokens.current++;
      scene?.cancelPlacement();
      setActive(null);
      setPreview(null);
      setE2EHook('confirmPlacement', undefined);
    };
  }, [scene]);

  return { active, preview, start, confirm, setChurchDims, cancel };
}
