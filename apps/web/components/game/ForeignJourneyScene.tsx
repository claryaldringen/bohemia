'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { GridCell, WorldClock } from '@bohemia/game';
import { setE2EHook } from '@/lib/e2e-hooks';
import { seenSceneKey, seenVillageOf } from '@/lib/journey-scene-view';
import { sceneJourneysOf, type JourneyView } from '@/lib/journey-view';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { SceneVillage } from '@/lib/village-view-scene-types';
import type { ForeignMapResponse } from '@/lib/war-scene-view';
import { GameView } from './GameView';
import { LordAwayBadge } from './hud/LordAwayBadge';
import { JourneyCursorNote, LordJourneyPanel } from './hud/LordJourneyPanel';
import { Tooltip } from './hud/Tooltip';
import { journeySceneHook } from './village-game/use-journey-scene';
import type { LordJourney } from './village-game/use-lord-journey';

// Cizí mapa za vojvodou (lord-control.md – Co vojvoda vidí, Co hráč vidí, Ve scéně; journey.md –
// Scéna cizí mapy): krajina z `GET /api/journey?map=x,y` (404 = zpět na ves), jezdci vlastního
// výjezdu s praporkem a přesýpacími hodinami, závoj mlhy jako při tažení (odkryté ze stopy rodu
// šeré, okolí jezdců jasné) a stavby, jak je muži naposled viděli (`seenVillageOf`). Odjezd ani
// příjezd se tu nekreslí – dvorec tu není. Pravé tlačítko dává vojvodovi rozkazy jako doma
// (`useLordJourney`); ⌂ vrátí pohled na ves, výjezd běží dál.

const NO_VILLAGE: SceneVillage = { dwellings: [], fields: [] };

const E2E_KEYS = [
  'projectToScreen',
  'moveCameraTo',
  'armyStats',
  'journeyScene',
  'journeyFog',
  'foreignVillage',
] as const;

export function ForeignJourneyScene({
  cell,
  journey,
  clock,
  lord,
}: {
  cell: GridCell;
  /** Poslední pohled na výjezd ze serveru (bez interpolace – muže posouvá scéna). */
  journey: JourneyView | null;
  /** Hodiny hráče (vývojový posun) – roční období a den ve scéně. */
  clock: WorldClock;
  lord: LordJourney;
}): ReactElement {
  const at = `${cell.x},${cell.y}`;
  const [landscape, setLandscape] = useState<LandscapeTransfer | null>(null);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const { back, bindForeign } = lord;
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  }, [back]);

  // krajina mapy – jen políčko skupiny a jeho sousedé (jinak 404 → zpět na ves)
  useEffect(() => {
    let live = true;
    void fetch(`/api/journey?map=${at}`, { cache: 'no-store' })
      .then((response) => response.json() as Promise<ForeignMapResponse>)
      .then((body) => {
        if (!live) return;
        if ('error' in body) backRef.current();
        else setLandscape(body.map.landscape);
      })
      .catch(() => {
        if (live) backRef.current();
      });
    return () => {
      live = false;
    };
  }, [at]);
  const decoded = useMemo(() => (landscape ? decodeLandscape(landscape) : null), [landscape]);

  // pravé tlačítko dává rozkazy i tady (okrajový pás podle strany této mapy)
  const mapSizeM = landscape ? landscape.size * landscape.cellSizeM : 0;
  useEffect(() => {
    if (!scene || mapSizeM <= 0) return;
    bindForeign({ scene, mapSizeM });
    return () => bindForeign(null);
  }, [scene, mapSizeM, bindForeign]);

  // jen výjezd na této mapě – jezdci, praporek v cíli a hodiny při čekání
  const here = journey && journey.cell.x === cell.x && journey.cell.y === cell.y ? journey : null;
  const journeys = useMemo(
    () => sceneJourneysOf({ own: here, visitors: [], cell: here?.cell ?? null }),
    [here],
  );
  useEffect(() => {
    scene?.setWorldClock(clock);
  }, [scene, clock]);
  useEffect(() => {
    scene?.setJourneys(journeys);
  }, [scene, journeys]);
  // mlha jako při tažení – stopa rodu odkryje (šeré), v dohledu je okolí jezdců
  const trail = here?.seen?.trail ?? null;
  useEffect(() => {
    scene?.setJourneyFog(trail ?? []);
  }, [scene, trail]);

  // stavby, jak je muži naposled viděli – scéna se přestaví jen při změně znalosti
  const seen = here?.seen ?? null;
  const seenKey = useMemo(() => seenSceneKey(seen), [seen]);
  const shown = useRef<{ scene: LandscapeScene; key: string; village: SceneVillage } | null>(null);
  useEffect(() => {
    if (!scene || !decoded) return;
    if (shown.current?.scene === scene && shown.current.key === seenKey) return;
    const village = seenVillageOf(seen, decoded);
    if (!village && shown.current?.scene !== scene) return;
    shown.current = { scene, key: seenKey, village: village ?? NO_VILLAGE };
    scene.setVillage(village ?? NO_VILLAGE);
  }, [scene, decoded, seen, seenKey]);

  // poprvé pohled na skupinu (R se k ní vrací)
  const focused = useRef(false);
  useEffect(() => {
    if (!scene || !here || focused.current) return;
    focused.current = true;
    scene.setCameraHome(here.group.pos.x, here.group.pos.z);
    scene.moveCameraTo(here.group.pos.x, here.group.pos.z);
  }, [scene, here]);

  useEffect(() => {
    if (!scene) return;
    setE2EHook('projectToScreen', (x, z) => scene.projectToScreen(x, z));
    setE2EHook('moveCameraTo', (x, z, radiusM) => scene.moveCameraTo(x, z, radiusM));
    setE2EHook('armyStats', () => scene.armyStats());
    setE2EHook('journeyScene', journeySceneHook(scene));
    setE2EHook('journeyFog', (x, z) => scene.fogAt(x, z));
    setE2EHook('foreignVillage', () => ({
      dwellings: (shown.current?.village.dwellings ?? []).map((d) => ({
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
    <div data-testid="foreign-scene" data-cell={at} data-journey={here?.journeyId ?? ''}>
      {landscape ? (
        <GameView landscape={landscape} onSceneReady={setScene} overlays={false} />
      ) : (
        <div className="fixed inset-0 bg-[#a1bfd9]" />
      )}
      <div className="fixed top-2 left-2 z-30 flex items-center gap-1" data-hud-block>
        <Tooltip content="Zpět na ves" placement="below-right">
          <button
            type="button"
            data-testid="foreign-back"
            aria-label="Zpět na ves"
            onClick={back}
            className="hud-panel rounded px-2 py-1"
          >
            ⌂
          </button>
        </Tooltip>
        {lord.away && <LordAwayBadge {...lord.away} placement="below-right" />}
        {lord.panel?.mode === 'away' && <LordJourneyPanel ui={lord.panel} placement="below" />}
      </div>
      <JourneyCursorNote note={lord.note} />
    </div>
  );
}
