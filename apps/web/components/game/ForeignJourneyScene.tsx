'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { GridCell, SeenCell, WorldClock } from '@bohemia/game';
import { setE2EHook } from '@/lib/e2e-hooks';
import { seenSceneKey, seenVillageOf } from '@/lib/journey-scene-view';
import {
  sceneJourneysOf,
  type ExpeditionView,
  type JourneyView,
  type KnownMapResponse,
} from '@/lib/journey-view';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { ForeignMap } from '@/lib/foreign-map';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { axesKey, withTrailContinuations } from '@/lib/trail-view';
import { useForeignTrails } from '@/hooks/use-foreign-trails';
import type { SceneVillage } from '@/lib/village-view-scene-types';
import type { ForeignMapResponse } from '@/lib/war-scene-view';
import { GameView } from './GameView';
import { LordAwayBadge } from './hud/LordAwayBadge';
import { ExpeditionButtons } from './hud/ExpeditionButtons';
import { JourneyCursorNote } from './hud/JourneyCursorNote';
import { Tooltip } from './hud/Tooltip';
import { journeySceneHook } from './village-game/use-journey-scene';
import type { ExpeditionOrders } from './village-game/use-expedition-orders';

// Cizí mapa za vojvodou (lord-control.md – Co vojvoda vidí, Co hráč vidí, Ve scéně; journey.md –
// Scéna cizí mapy): krajina z `GET /api/journey?map=x,y` (404 = zpět na ves), jezdci vlastního
// výjezdu s praporkem a přesýpacími hodinami, závoj mlhy jako při tažení (odkryté ze stopy rodu
// šeré, okolí jezdců jasné) a stavby, jak je muži naposled viděli (`seenVillageOf`). Odjezd ani
// příjezd se tu nekreslí – dvorec tu není. Pravé tlačítko dává vojvodovi rozkazy jako doma
// (`useExpeditionOrders`); ⌂ vrátí pohled na ves, výjezd běží dál.
//
// Známý režim (`known`, Úloha 12a – journey.md – Známá mapa): táž scéna bez jezdců a bez rozkazů,
// otevřená z domova okem u rodu. Krajina i znalost jdou z `GET /api/journey?known=x,y`: odkryté
// místo ze stopy je šeré (nikde není nikdo v dohledu), stavby jsou naposled viděné.

const noop = (): void => undefined;
const NO_EXPEDITIONS: readonly ExpeditionView[] = [];

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
  expeditions = NO_EXPEDITIONS,
  villageId = null,
  clock,
  orders,
  known,
}: {
  cell: GridCell;
  /** Poslední pohled na výjezd ze serveru (bez interpolace – muže posouvá scéna). */
  journey: JourneyView | null;
  /** Poslední pohledy na všechny výpravy hráče – hloučky na této mapě se kreslí všechny. */
  expeditions?: readonly ExpeditionView[];
  /** Ves, jejíž výběr se drží (ves scény hry) – skupiny jiných vsí nesou ve scéně svou ves. */
  villageId?: string | null;
  /** Hodiny hráče (vývojový posun) – roční období a den ve scéně. */
  clock: WorldClock;
  /** Rozkazy vybraným lidem; ve známém režimu null. */
  orders: ExpeditionOrders | null;
  /** Známý režim: mapa, jak ji zná rod; `onBack` vrátí ves. */
  known?: { onBack: () => void };
}): ReactElement {
  const at = `${cell.x},${cell.y}`;
  const [landscape, setLandscape] = useState<LandscapeTransfer | null>(null);
  // osy pokračování zemských stezek sousedů (trade.md) – nakreslí se i na mapě bez staveb
  const [axes, setAxes] = useState<ForeignMap['trailContinuations'] | null>(null);
  // mapa rodu nebo vazala: pokračování stezky je nad mlhou celé (scéna.setFriendlyMap)
  const [friendly, setFriendly] = useState(false);
  const [knownSeen, setKnownSeen] = useState<SeenCell | null>(null);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const isKnown = known !== undefined;
  const back = known ? known.onBack : (orders?.back ?? noop);
  const bindForeign = orders?.bindForeign;
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  }, [back]);

  // krajina mapy – jen políčko skupiny a jeho sousedé (jinak 404 → zpět na ves)
  useEffect(() => {
    let live = true;
    const url = isKnown ? `/api/journey?known=${at}` : `/api/journey?map=${at}`;
    void fetch(url, { cache: 'no-store' })
      .then((response) => response.json() as Promise<ForeignMapResponse | KnownMapResponse>)
      .then((body) => {
        if (!live) return;
        if ('error' in body) backRef.current();
        else {
          setLandscape(body.map.landscape);
          setAxes('trailContinuations' in body.map ? (body.map.trailContinuations ?? null) : null);
          setFriendly('friendly' in body.map && body.map.friendly === true);
          if ('seen' in body) setKnownSeen(body.seen);
        }
      })
      .catch(() => {
        if (live) backRef.current();
      });
    return () => {
      live = false;
    };
  }, [at, isKnown]);
  const decoded = useMemo(() => (landscape ? decodeLandscape(landscape) : null), [landscape]);

  // pravé tlačítko dává rozkazy i tady (okrajový pás podle strany této mapy)
  const mapSizeM = landscape ? landscape.size * landscape.cellSizeM : 0;
  useEffect(() => {
    if (!scene || mapSizeM <= 0 || !bindForeign) return;
    bindForeign({ scene, mapSizeM });
    return () => bindForeign(null);
  }, [scene, mapSizeM, bindForeign]);

  // jen výjezd na této mapě – jezdci a praporek v cíli
  const here = journey && journey.cell.x === cell.x && journey.cell.y === cell.y ? journey : null;
  const journeys = useMemo(
    () => sceneJourneysOf({ own: expeditions, visitors: [], cell, villageId }),
    [expeditions, cell, villageId],
  );
  useEffect(() => {
    scene?.setWorldClock(clock);
  }, [scene, clock]);
  useEffect(() => {
    scene?.setJourneys(journeys);
  }, [scene, journeys]);
  useEffect(() => {
    scene?.setFriendlyMap(friendly);
  }, [scene, friendly]);
  // mlha jako při tažení – stopa rodu odkryje (šeré), v dohledu je okolí jezdců
  const seen = isKnown ? knownSeen : (here?.seen ?? null);
  const trail = seen?.trail ?? null;
  useEffect(() => {
    scene?.setJourneyFog(trail ?? []);
  }, [scene, trail]);
  // mimo mapu rodu a vazala jen objevené části pokračování stezek – s novou stopou se dočtou
  useForeignTrails(
    isKnown || friendly ? null : `/api/journey?map=${at}&trails`,
    landscape !== null,
    trail?.length ?? 0,
    (trails) => {
      setAxes(trails.trailContinuations ?? null);
      setFriendly(trails.friendly === true);
    },
  );

  // stavby, jak je muži naposled viděli – scéna se přestaví jen při změně znalosti; bez znalosti
  // prázdná ves (bez vsi scéna výběr klikem – muže výjezdu – nehledá)
  const seenKey = useMemo(() => `${seenSceneKey(seen)}#${axesKey(axes)}`, [seen, axes]);
  const shown = useRef<{ scene: LandscapeScene; key: string; village: SceneVillage } | null>(null);
  useEffect(() => {
    if (!scene || !decoded) return;
    if (shown.current?.scene === scene && shown.current.key === seenKey) return;
    const village = withTrailContinuations(seenVillageOf(seen, decoded), axes) ?? {
      dwellings: [],
      fields: [],
    };
    shown.current = { scene, key: seenKey, village };
    scene.setVillage(village);
  }, [scene, decoded, seen, seenKey, axes]);

  // poprvé pohled na skupinu (R se k ní vrací)
  const focused = useRef(false);
  useEffect(() => {
    if (!scene || !here || focused.current) return;
    focused.current = true;
    scene.setCameraHome(here.group.pos.x, here.group.pos.z);
    scene.moveCameraTo(here.group.pos.x, here.group.pos.z);
  }, [scene, here]);
  // známá mapa: pohled na naposled viděnou ves (první stavba), bez ní na první bod stopy
  useEffect(() => {
    if (!scene || !isKnown || !seen || focused.current) return;
    const at =
      seen.parts[0]?.pos ?? (seen.trail[0] ? { x: seen.trail[0][0], z: seen.trail[0][1] } : null);
    if (!at) return;
    focused.current = true;
    scene.setCameraHome(at.x, at.z);
    scene.moveCameraTo(at.x, at.z);
  }, [scene, isKnown, seen]);

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
    <div
      data-testid={isKnown ? 'known-scene' : 'foreign-scene'}
      data-cell={at}
      data-journey={here?.journeyId ?? ''}
    >
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
        {orders?.away && <LordAwayBadge {...orders.away} placement="below-right" />}
        {orders && (
          <ExpeditionButtons people={orders.buttons} command={orders.command} placement="below" />
        )}
      </div>
      {orders && <JourneyCursorNote note={orders.note} />}
    </div>
  );
}
