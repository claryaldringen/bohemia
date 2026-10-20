'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { funeralPhase, type FuneralPhase } from '@/lib/scene/funeral-plan';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { windowAt } from './dev-funeral';

/** Jak často se obnoví posuvník a popisek (ms) – obřad běží ve scéně sám. */
const REFRESH_MS = 500;

const PHASE_NAMES: Record<FuneralPhase, string> = {
  before: 'před pohřbem',
  gathering: 'schází se u domu',
  procession: 'průvod',
  laying: 'máry na hranici',
  burning: 'hranice hoří',
  smouldering: 'uhlíky dohasínají',
  done: 'mohyla nasypaná',
};

interface Props {
  scene: LandscapeScene | null;
  buttonClass: string;
}

/**
 * Ukázka pohřbu na vývojové stránce (cemetery.md – Pohřeb ve scéně): posuvník okamžiku obřadu
 * (od začátku dne pohřbu do nasypání mohyly – hodiny dne ukázky se posunou, obřad pak běží dál
 * sám), co se právě děje a kamera k márám nebo k hranici, i průběžně („sledovat“).
 */
export function FuneralControls({ scene, buttonClass }: Props): ReactElement {
  const [offset, setOffset] = useState(0);
  const [end, setEnd] = useState(180);
  const [phase, setPhase] = useState<FuneralPhase>('before');
  const [follow, setFollow] = useState(false);

  useEffect(() => {
    if (!scene) return;
    const tick = (): void => {
      const now = Date.now();
      const focus = scene.funeralFocus(now);
      if (!focus) return;
      const t = focus.timeline;
      setOffset(Math.round((now - t.startMs) / 1000));
      setEnd(Math.ceil((t.coldMs - t.startMs) / 1000) + 5);
      setPhase(funeralPhase(t, now));
      if (follow) scene.moveCameraTo(focus.x, focus.z);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [scene, follow]);

  return (
    <>
      <label className="flex items-center gap-1" title="Okamžik obřadu od začátku dne pohřbu">
        Obřad
        <input
          type="range"
          min={0}
          max={end}
          step={1}
          value={Math.min(end, Math.max(0, offset))}
          data-testid="dev-funeral-time"
          onChange={(e) => {
            const value = Number(e.target.value);
            setOffset(value);
            scene?.setWorkDayClock(windowAt(Date.now(), value * 1000));
          }}
        />
        <span className="w-44 tabular-nums" data-testid="dev-funeral-phase">
          {offset} s · {PHASE_NAMES[phase]}
        </span>
      </label>
      <button
        className={buttonClass}
        disabled={!scene}
        onClick={() => {
          const focus = scene?.funeralFocus();
          if (focus) scene?.moveCameraTo(focus.x, focus.z);
        }}
      >
        K pohřbu
      </button>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        sledovat
      </label>
    </>
  );
}
