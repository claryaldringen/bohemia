'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { WorldClock } from '@bohemia/game';
import { useArmyActions } from '@/hooks/use-army';
import { useForeignTrails } from '@/hooks/use-foreign-trails';
import { useEventScope } from '@/hooks/use-server-events';
import { useWarScene } from '@/hooks/use-war-scene';
import type { CampaignResponse } from '@/lib/campaign-view';
import { setE2EHook } from '@/lib/e2e-hooks';
import { seenSceneKey } from '@/lib/journey-scene-view';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { ForeignMap } from '@/lib/foreign-map';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { axesKey, withTrailContinuations } from '@/lib/trail-view';
import { warKeyOfScene } from '@/lib/server-events/protocol';
import type { SceneVillage } from '@/lib/village-view-scene-types';
import {
  armyFocusOf,
  followCellOf,
  foreignVillageOf,
  onTargetMap,
  sceneWarOf,
  type ForeignMapResponse,
  type WatchedMap,
} from '@/lib/war-scene-view';
import { GameView } from './GameView';
import { CampaignMap } from './hud/CampaignMap';
import { Tooltip } from './hud/Tooltip';

// Cizí mapa ve scéně (war.md – Ve scéně – cizí mapa; web-ui.md – Cizí mapa ve scéně): útočník
// sleduje své vojsko ve 3D na mapě, na které stojí. Krajina z `GET /api/campaign/<id>?map=x,y`
// (veřejná, překážky si prohlížeč vygeneruje ze seedu vrstvy), válka z `?scene=x,y` a dál
// z události `war` cizí mapy v rozsahu spojení (server-events.md – Válka) – po mlze války ze
// serveru (vojsko celé, obránci v dohledu, z cizí vsi jen objevené domy). Jen pohled: žádné
// panely ani akce cizí vsi, jen mapa tažení (živé vedení) a návrat na ves. Když vojsko z mapy
// odejde, scéna jde za ním na mapu, kde stojí (nová krajina, mapu po mapě); když tažení skončí
// nebo vojsko přijde domů, vrátí se na vlastní ves sama.
//
// Co rod o mapě zná (`WarSceneView.known`, plán 2026-11-13 – Úloha 12b): stavby, jak je rod
// naposled viděl, stojí od začátku vedle objevených domů a stopa rodu odkryje šeré místo k mlze
// války – jako výjezd a známá mapa (journey.md – Scéna cizí mapy).

const E2E_KEYS = ['armyStats', 'journeyFog', 'moveCameraTo', 'foreignVillage'] as const;

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
  // osy pokračování zemských stezek sousedů (trade.md) – nakreslí se i na mapě bez staveb
  const [axes, setAxes] = useState<ForeignMap['trailContinuations'] | null>(null);
  // mapa rodu nebo vazala: pokračování stezky je nad mlhou celé (scéna.setFriendlyMap)
  const [friendly, setFriendly] = useState(false);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const decoded = useMemo(() => (landscape ? decodeLandscape(landscape) : null), [landscape]);
  const army = useArmyActions();
  const actions = army?.campaign;
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
        else {
          setLandscape(body.map.landscape);
          setAxes(body.map.trailContinuations ?? null);
          setFriendly(body.map.friendly === true);
        }
      })
      .catch(() => {
        if (live) onBackRef.current();
      });
    return () => {
      live = false;
    };
  }, [campaignId, at]);

  useEffect(() => {
    scene?.setFriendlyMap(friendly);
  }, [scene, friendly]);

  // válku na této mapě nese událost `war` (rozsah spojení `scene`), dotaz jen po otevření a mezeře
  useEventScope({ scene: { campaignId, cell: { x: cell.x, y: cell.y } } });
  const war = useWarScene(
    warKeyOfScene(campaignId, cell),
    `/api/campaign/${campaignId}?scene=${at}`,
    true,
  );
  // vojsko z mapy odešlo: scéna jde za ním na mapu, kde teď stojí (pohled na tažení –
  // `followCellOf`); tažení skončilo, vojsko je doma, nebo ho hráč nezná – zpět na vlastní ves
  const sceneWatch = army?.scene ?? null;
  const followRef = useRef(sceneWatch);
  useEffect(() => {
    followRef.current = sceneWatch;
  }, [sceneWatch]);
  useEffect(() => {
    if (war !== null) return;
    let live = true;
    void fetch(`/api/campaign/${campaignId}`, { cache: 'no-store' })
      .then((response) => response.json() as Promise<CampaignResponse>)
      .then((body) => {
        if (!live) return;
        const follow = followRef.current;
        const next =
          'error' in body || !follow
            ? null
            : followCellOf(body.view, { x: cell.x, y: cell.y }, follow.home);
        if (next && follow) follow.watch({ campaignId, cell: next });
        else onBackRef.current();
      })
      .catch(() => {
        if (live) onBackRef.current();
      });
    return () => {
      live = false;
    };
  }, [war, campaignId, cell.x, cell.y]);

  useEffect(() => {
    scene?.setWorldClock(clock);
  }, [scene, clock]);
  useEffect(() => {
    scene?.setWar(sceneWarOf(war ?? null, world, true));
  }, [scene, war, world]);

  // mimo mapu rodu a vazala jen objevené části pokračování stezek – s novou stopou se dočtou
  useForeignTrails(
    friendly ? null : `/api/campaign/${campaignId}?map=${at}&trails`,
    landscape !== null,
    war?.known?.trail.length ?? 0,
    (trails) => {
      setAxes(trails.trailContinuations ?? null);
      setFriendly(trails.friendly === true);
    },
  );

  // co rod o mapě zná (Úloha 12b): stopa odkryje šeré místo k mlze války – závoj jen při změně stopy
  const trailShown = useRef<{ scene: LandscapeScene; key: string } | null>(null);
  useEffect(() => {
    if (!scene || !war) return;
    const trail = war.known?.trail ?? [];
    const key = trail.join(';');
    if ((trailShown.current?.scene === scene ? trailShown.current.key : '') === key) return;
    trailShown.current = { scene, key };
    scene.setJourneyFog(trail.length > 0 ? trail : null);
  }, [scene, war]);

  // objevené domy cizí vsi a stavby, jak je rod naposled viděl – scéna se přestaví jen při novém
  // objevu nebo změně známých staveb
  const shown = useRef<{
    scene: LandscapeScene;
    key: string;
    village: SceneVillage | null;
  } | null>(null);
  useEffect(() => {
    if (!scene || !decoded || !war) return;
    const key = `${(war.buildings ?? []).map((b) => b.id).join(',')}#${seenSceneKey(war.known ?? null)}#${axesKey(axes)}`;
    const drawn = shown.current?.scene === scene ? shown.current : null;
    if (drawn?.key === key) return;
    const village = withTrailContinuations(
      foreignVillageOf(war.buildings, war.known ?? null, decoded, onTargetMap(war)),
      axes,
    );
    shown.current = { scene, key, village };
    // zmizí-li poslední známá stavba, prázdná ves smaže nakreslenou
    if (village || drawn?.village) scene.setVillage(village ?? { dwellings: [], fields: [] });
  }, [scene, decoded, war, axes]);

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
    setE2EHook('journeyFog', (x, z) => scene.fogAt(x, z));
    setE2EHook('moveCameraTo', (x, z, radiusM) => scene.moveCameraTo(x, z, radiusM));
    setE2EHook('foreignVillage', () => ({
      dwellings: (shown.current?.village?.dwellings ?? []).map((d) => ({
        id: d.id,
        built: d.built,
        x: d.position.x,
        z: d.position.z,
      })),
    }));
    return () => {
      for (const key of E2E_KEYS) setE2EHook(key, undefined);
    };
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
