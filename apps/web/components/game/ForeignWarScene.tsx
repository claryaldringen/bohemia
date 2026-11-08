'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { WorldClock } from '@bohemia/game';
import { useArmyActions } from '@/hooks/use-army';
import { useWarScene } from '@/hooks/use-war-scene';
import { setE2EHook } from '@/lib/e2e-hooks';
import type { LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import {
  armyFocusOf,
  foreignVillageOf,
  sceneWarOf,
  type ForeignMapResponse,
  type WatchedMap,
} from '@/lib/war-scene-view';
import { GameView } from './GameView';
import { CampaignMap } from './hud/CampaignMap';
import { Tooltip } from './hud/Tooltip';

// Cizí mapa ve scéně (war.md – Ve scéně – cizí mapa; web-ui.md – Cizí mapa ve scéně): útočník
// sleduje své vojsko ve 3D na mapě, na které stojí. Krajina z `GET /api/campaign/<id>?map=x,y`
// (veřejná, překážky si prohlížeč vygeneruje ze seedu vrstvy), válka z `?scene=x,y` – po mlze války
// ze serveru (vojsko celé, obránci v dohledu, z cizí vsi jen objevené domy). Jen pohled: žádné
// panely ani akce cizí vsi, jen mapa tažení (živé vedení) a návrat na ves. Když vojsko z mapy
// odejde nebo tažení skončí, scéna se vrátí na vlastní ves sama.

export function ForeignWarScene({
  watch,
  world,
  clock,
  onBack,
}: {
  watch: WatchedMap;
  /** Svět jako na serveru – konec herního dne boje (padlí). */
  world: WorldClock;
  /** Hodiny hráče (vývojový posun) – roční období a den ve scéně. */
  clock: WorldClock;
  onBack: () => void;
}): ReactElement {
  const { campaignId, cell } = watch;
  const at = `${cell.x},${cell.y}`;
  const [landscape, setLandscape] = useState<LandscapeTransfer | null>(null);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const actions = useArmyActions()?.campaign;
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  // krajina cizí mapy – jen pro účastníka tažení a mapu, kterou vojsko zná (jinak 404 → domů)
  useEffect(() => {
    let live = true;
    void fetch(`/api/campaign/${campaignId}?map=${at}`, { cache: 'no-store' })
      .then((response) => response.json() as Promise<ForeignMapResponse>)
      .then((body) => {
        if (!live) return;
        if ('error' in body) onBackRef.current();
        else setLandscape(body.map.landscape);
      })
      .catch(() => {
        if (live) onBackRef.current();
      });
    return () => {
      live = false;
    };
  }, [campaignId, at]);

  const war = useWarScene(`/api/campaign/${campaignId}?scene=${at}`, true);
  // vojsko z mapy odešlo, tažení skončilo, nebo ho hráč nezná – zpět na vlastní ves
  useEffect(() => {
    if (war === null) onBackRef.current();
  }, [war]);

  useEffect(() => {
    scene?.setWorldClock(clock);
  }, [scene, clock]);
  useEffect(() => {
    scene?.setWar(sceneWarOf(war ?? null, world, true));
  }, [scene, war, world]);

  // objevené domy cizí vsi – scéna se přestaví jen při novém objevu
  const shown = useRef<{ scene: LandscapeScene; key: string } | null>(null);
  useEffect(() => {
    const village = foreignVillageOf(war?.buildings);
    if (!scene || !village) return;
    const key = village.dwellings.map((d) => d.id).join(',');
    if (shown.current?.scene === scene && shown.current.key === key) return;
    shown.current = { scene, key };
    scene.setVillage(village);
  }, [scene, war]);

  // poprvé pohled na vojsko (R se k němu vrací)
  const focused = useRef(false);
  useEffect(() => {
    if (!scene || !war || focused.current) return;
    const focus = armyFocusOf(war);
    if (!focus) return;
    focused.current = true;
    scene.setCameraHome(focus.x, focus.z);
    scene.moveCameraTo(focus.x, focus.z);
  }, [scene, war]);

  useEffect(() => {
    if (!scene) return;
    setE2EHook('armyStats', () => scene.armyStats());
    return () => setE2EHook('armyStats', undefined);
  }, [scene]);

  return (
    <div data-testid="foreign-scene" data-cell={at} data-campaign={campaignId}>
      {landscape ? (
        <GameView landscape={landscape} onSceneReady={setScene} overlays={false} />
      ) : (
        <div className="fixed inset-0 bg-[#a1bfd9]" />
      )}
      <div className="fixed top-2 left-2 z-30 flex gap-1" data-hud-block>
        <Tooltip content="Zpět na ves">
          <button
            type="button"
            data-testid="foreign-back"
            aria-label="Zpět na ves"
            onClick={onBack}
            className="hud-panel rounded px-2 py-1"
          >
            ⌂
          </button>
        </Tooltip>
        {actions && (
          <Tooltip content="Mapa tažení">
            <button
              type="button"
              data-testid="foreign-campaign-map"
              aria-label="Mapa tažení"
              aria-pressed={mapOpen}
              onClick={() => setMapOpen((open) => !open)}
              className="hud-panel rounded px-2 py-1"
            >
              ⚔
            </button>
          </Tooltip>
        )}
      </div>
      {actions && mapOpen && (
        <div className="fixed right-2 bottom-2 z-30">
          <CampaignMap
            campaignId={campaignId}
            actions={actions}
            onClose={() => setMapOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
