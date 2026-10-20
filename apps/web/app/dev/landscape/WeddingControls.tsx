'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { weddingPhase, type WeddingPhase } from '@/lib/scene/wedding-plan';
import { weddingWindowAt } from './dev-wedding';

/** Jak často se obnoví posuvník a popisek (ms) – obřad běží ve scéně sám. */
const REFRESH_MS = 500;

const PHASE_NAMES: Record<WeddingPhase, string> = {
  before: 'před svatbou',
  coming: 'lidé z okolí přicházejí',
  gathering: 'schází se u domu',
  procession: 'průvod',
  ring: 'staví se kolem páru',
  rites: 'obřad',
  vows: 'pár k sobě',
  home: 'do nového domova',
  done: 'po svatbě',
};

interface Props {
  scene: LandscapeScene | null;
  buttonClass: string;
}

/**
 * Ukázka svatby na vývojové stránce (kinship.md – Svatba ve scéně): posuvník okamžiku obřadu (od
 * začátku dne svatby do rozchodu – hodiny dne ukázky se posunou, obřad pak běží dál sám), co se
 * právě děje a kamera k průvodu nebo k páru, i průběžně („sledovat“).
 */
export function WeddingControls({ scene, buttonClass }: Props): ReactElement {
  const [offset, setOffset] = useState(0);
  const [end, setEnd] = useState(300);
  const [phase, setPhase] = useState<WeddingPhase>('before');
  const [follow, setFollow] = useState(false);

  useEffect(() => {
    if (!scene) return;
    const tick = (): void => {
      const now = Date.now();
      const focus = scene.weddingFocus(now);
      if (!focus) return;
      const t = focus.plan.timeline;
      setOffset(Math.round((now - t.startMs) / 1000));
      setEnd(Math.ceil((focus.plan.figuresUntilMs - t.startMs) / 1000) + 5);
      setPhase(weddingPhase(focus.plan, now));
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
      <label className="flex items-center gap-1" title="Okamžik svatby od začátku dne svatby">
        Obřad
        <input
          type="range"
          min={0}
          max={end}
          step={1}
          value={Math.min(end, Math.max(0, offset))}
          data-testid="dev-wedding-time"
          onChange={(e) => {
            const value = Number(e.target.value);
            setOffset(value);
            scene?.setWorkDayClock(weddingWindowAt(Date.now(), value * 1000));
          }}
        />
        <span className="w-52 tabular-nums" data-testid="dev-wedding-phase">
          {offset} s · {PHASE_NAMES[phase]}
        </span>
      </label>
      <button
        className={buttonClass}
        disabled={!scene}
        onClick={() => {
          const focus = scene?.weddingFocus();
          if (focus) scene?.moveCameraTo(focus.x, focus.z);
        }}
      >
        Ke svatbě
      </button>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        sledovat
      </label>
    </>
  );
}
