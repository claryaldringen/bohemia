'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { shiftWorldClock, type GridCell, type PlayerNotice, type WorldClock } from '@bohemia/game';
import { ArmyActionsContext } from '@/hooks/use-army';
import { PanelOptionsContext } from '@/hooks/use-panel-options';
import { usePlacement } from '@/hooks/use-placement';
import { fortVariantsBlocked } from '@/lib/build-items';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { selectionDetails } from '@/lib/selection-details';
import { ForeignJourneyScene } from './ForeignJourneyScene';
import { KnownMapContext } from './hud/KnownMapEye';
import { ForeignWarScene } from './ForeignWarScene';
import { GameView } from './GameView';
import { ScenePerfPanel, usePerfFlag } from './ScenePerfPanel';
import { BreakoutButton } from './hud/BreakoutButton';
import { BuildGrid } from './hud/BuildGrid';
import { CursorReason } from './hud/CursorReason';
import { ChurchConfirm } from './hud/ChurchConfirm';
import { FortConfirm } from './hud/FortConfirm';
import { JourneyCursorNote } from './hud/LordJourneyPanel';
import { Minimap } from './hud/Minimap';
import { NoticeLines } from './hud/NoticeLines';
import { JourneyBanner, PlayerDeparturePanel } from './hud/RelocationControls';
import { RightsProvider, VillageIdProvider } from './hud/rights';
import { SelectionPanel } from './hud/SelectionPanel';
import { TopBar } from './hud/TopBar';
import { FoundingPanels } from './village-game/FoundingPanels';
import { GameOverScreen } from './village-game/GameOverScreen';
import { restartFrom, signOutToHome } from './village-game/session';
import { useAlarmActions } from './village-game/use-alarm-actions';
import { useBuildMode } from './village-game/use-build-mode';
import { useDevControls } from './village-game/use-dev-controls';
import { useGateMode } from './village-game/use-gate-mode';
import { useHistoryPanels } from './village-game/use-history-panels';
import { useHouse } from './village-game/use-house';
import { useKnownMap } from './village-game/use-known-map';
import { useLordJourney } from './village-game/use-lord-journey';
import { useLineNaming } from './village-game/use-line-naming';
import { useNoticeLines } from './village-game/use-notice-lines';
import { usePanelSource } from './village-game/use-panel-source';
import { usePanels } from './village-game/use-panels';
import { usePendingSites } from './village-game/use-pending-sites';
import { usePlayerNotices } from './village-game/use-player-notices';
import { usePremiumIntro } from './village-game/use-premium-intro';
import { useSceneE2EHooks, useSceneSync } from './village-game/use-scene-sync';
import { useSelection } from './village-game/use-selection';
import { useSoundToggle } from './village-game/use-sound-toggle';
import { useVillageHotkeys } from './village-game/use-village-hotkeys';
import { useVillageSwitch } from './village-game/use-village-switch';
import { useVillageSync } from './village-game/use-village-sync';
import { useWagonPreview } from './village-game/use-wagon-preview';
import { useWarWatch } from './village-game/use-war-watch';
import { partiesOf } from '@/lib/journey-view';
import { useJourneyScene } from './village-game/use-journey-scene';
import { villageCommands } from './village-game/village-commands';
import type { VillageData } from './village-game/village-data';
import { VillagePanels } from './village-game/VillagePanels';

export type { VillageData } from './village-game/village-data';

/**
 * Hratelná ves s rozhraním jako v 0 A.D.: 3D krajina přes celé okno, horní lišta (jméno vsi,
 * suroviny, datum), minimapa vlevo dole, panel výběru dole uprostřed, mřížka staveb vpravo dole
 * a mizející oznámení nahoře. Bez průvodce – hráč staví, kdy chce. Dokud ves není, mřížka
 * nabízí jen zemnici: její umístění ves založí (s navrženým jménem). Stav vsi drží server – po
 * každé akci a na začátku každého herního dne (jen při viditelném panelu; beze změny server
 * odpoví jen „beze změny“) přijde nový VillageView. Ve vymřelé vsi
 * se nestaví; když hráči vymřely všechny vsi, přes zamrzlou scénu je obrazovka porážky
 * s tlačítkem Začít znovu (nové sídlo, stránka se načte znovu). Nabídka hry (tlačítko v liště,
 * F10) nabízí Začít znovu i se živou vsí (po potvrzení) a odhlášení. Ve vývojovém režimu jsou
 * vedle data šipky přeskočení času – hodiny v liště i ve scéně jdou o posun času hráče napřed.
 * Hráč může mít víc vsí (migration.md): jméno vsi v liště je přepínač – ves na stejné mapě se
 * přepne na místě, na jiné mapě se stránka načte znovu (jiná krajina). Akce nesou id vsi.
 * Ctrl / Shift + klik přidá obydlí k výběru, Ctrl + A vybere všechna; panel výběru obydlí
 * nabídne Přestěhovat (nový dům postupně každé domácnosti).
 *
 * Komponenta jen skládá hooky a panely z `village-game/` (web-ui.md – Rozložení `VillageGame`);
 * pořadí hooků drží pořadí efektů scény (válka → hodiny → ves → výběr → náhled vozové cesty).
 */
export function VillageGame({
  landscape,
  seed,
  settlementId,
  initialVillage,
  world,
  timeOffsetDays: initialTimeOffsetDays,
  devMode,
  email,
  initialNowMs,
  languageChoice = false,
  homeCell = null,
}: {
  landscape: LandscapeTransfer;
  /** Seed krajiny sídla – podle něj hra navrhne jméno vsi. */
  seed: number;
  /** Sídlo (mapa) načtené krajiny – ves z jiného sídla se přepne novým načtením stránky. */
  settlementId: string;
  initialVillage: VillageData;
  /** Svět jako na serveru – herní datum v liště a dým z obydlí podle herního dne. */
  world: WorldClock;
  /** Posun času hráče ve dnech (vývojový režim) – hodiny v liště a ve scéně jdou o tolik napřed. */
  timeOffsetDays: number;
  /** Vývojový režim účtu – šipky přeskočení času vedle data. */
  devMode: boolean;
  /** E-mail přihlášeného hráče (popisek odhlášení v nabídce). */
  email: string;
  /** Čas serveru při renderu (datum v liště sedí s HTML ze serveru). */
  initialNowMs: number;
  /** Účet přes Google bez založené vsi – v úvodu řádek ikon jazyků (newcomers.md). */
  languageChoice?: boolean;
  /** Políčko sídla v mřížce světa (null – odříznuté) – vojsko na něm ukazuje scéna vsi sama. */
  homeCell?: GridCell | null;
}): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  // ukazatel výkonu scény – jen s `?perf=1` (ScenePerfPanel.tsx)
  const perfOn = usePerfFlag();
  const { notices, pushNotice, mergeNotices, expireNotice } = useNoticeLines();
  const [timeOffsetDays, setTimeOffsetDays] = useState(initialTimeOffsetDays);
  // Hodiny hráče: svět posunutý o jeho posun času – datum, roční období i dým jako na serveru.
  const clock = useMemo(() => shiftWorldClock(world, timeOffsetDays), [world, timeOffsetDays]);
  const { soundOn, toggleSound } = useSoundToggle(scene);
  const placement = usePlacement(scene);

  // Stav vsi ze serveru. Upozornění mezi hráči z dotazu obslouží `usePlayerNotices` níž (panely
  // potřebují `viewRef`) – dotaz je volá přes ref.
  const playerNoticesRef = useRef<(received: readonly PlayerNotice[] | undefined) => void>(
    () => undefined,
  );
  const {
    village,
    view,
    villageError,
    viewRef,
    runAction,
    runBuildAction,
    refresh: refreshVillage,
  } = useVillageSync({
    initialVillage,
    landscape,
    decoded,
    settlementId,
    clock,
    pushNotice,
    playerNotices: playerNoticesRef,
  });
  const gameOver = view?.gameOver === true;

  // Rod, panely z lišty a upozornění mezi hráči
  const house = useHouse({ villageMissing: village === null });
  const panels = usePanels({
    refreshHouse: house.refresh,
    refreshEscheats: house.refreshEscheats,
    setHouseError: house.setError,
    viewRef,
  });
  // Klik na upozornění varování otevře panel dvorce té vsi (plán 2026-11-09 – Úloha 13); funkce
  // vzniká až u přepínání vsí níž, upozornění ji volají přes ref
  const openAlarmRef = useRef<(villageId: string) => void>(() => undefined);
  const playerNotices = usePlayerNotices({
    refreshHouse: house.refresh,
    openHouse: panels.openHouse,
    openWar: panels.openWar,
    openLevy: panels.openLevy,
    openVillage: openAlarmRef,
    mergeNotices,
  });
  const showPlayerNotices = playerNotices.show;
  useEffect(() => {
    playerNoticesRef.current = showPlayerNotices;
  }, [showPlayerNotices]);
  const war = useWarWatch({
    scene,
    settlementId,
    gameOver,
    world,
    homeCell,
    villageId: view?.id ?? null,
  });
  // Po konci hry je přes všechno obrazovka porážky – nabídka se neukáže.
  const menuShown = panels.menuOpen && !gameOver;
  const { chronicle, noticeHistory } = useHistoryPanels({
    view,
    noticeTick: playerNotices.tick,
    othersOpen: panels.houseOpen || panels.warOpen || menuShown,
    closeOthers: panels.closeAll,
    hotkeys: !menuShown && !gameOver,
  });
  const naming = useLineNaming({
    village,
    view,
    sceneReady: scene !== null,
    gameOver,
    newcomer: house.newcomer,
    viewRef,
    runAction,
  });
  usePremiumIntro({ scene, decoded, hasVillage: view !== null, pushNotice });

  // Scéna, výběr a stavby
  const sites = usePendingSites({
    view,
    viewRef,
    decoded,
    seed,
    founderNameRef: naming.founderNameRef,
    runBuildAction,
  });
  const { sceneVillage } = sites;
  useSceneSync({
    scene,
    clock,
    sceneVillage,
    home: view?.scene.dwellings[0]?.position ?? null,
  });
  const {
    selected,
    setSelected,
    current,
    personState,
    draftState,
    sceneVillageRef,
    setSonPreview,
  } = useSelection({ scene, sceneVillage, viewRef });
  const knownMap = useKnownMap();
  const lordJourney = useLordJourney({
    scene,
    view,
    selected,
    setSelected,
    homeCell,
    mapSizeM: decoded.size * decoded.cellSizeM,
    refreshVillage,
  });
  const journeys = useJourneyScene({
    scene,
    villageId: view?.id ?? null,
    cell: homeCell,
    own: lordJourney.journey.expeditions.latest,
  });
  const alarmActions = useAlarmActions({ view, selected, pushNotice });
  const wagonPlan = useWagonPreview({ scene, current, view, sceneVillage });
  useSceneE2EHooks(scene);
  const { gateFort, setGateFort } = useGateMode({ scene, selected, viewRef, runBuildAction });
  const build = useBuildMode({
    scene,
    decoded,
    view,
    viewRef,
    villageError,
    placement,
    selected,
    setSelected,
    sceneVillageRef,
    foundingName: naming.foundingName,
    sites,
    runBuildAction,
  });
  const { buildGroup, setBuildGroup, startBuild } = build;

  // Nabídka hry: otevření zruší umisťování i výběr – v nabídce se nestaví ani nevybírá.
  const cancelPlacement = placement.cancel;
  const openMenu = (): void => {
    if (gameOver) return;
    cancelPlacement();
    setSelected(null);
    setBuildGroup(null);
    panels.showMenu();
  };
  useVillageHotkeys({
    startBuild,
    openMenu,
    placementActive: placement.active,
    setSelected,
    setBuildGroup,
    setGateFort,
    sceneVillageRef,
  });
  const switchVillage = useVillageSwitch({
    scene,
    view,
    viewRef,
    settlementId,
    runAction,
    pushNotice,
    cancelPlacement,
    setSelected,
    openAlarm: openAlarmRef,
  });
  const dev = useDevControls({ viewRef, runAction, pushNotice, setTimeOffsetDays });
  const commands = villageCommands({
    scene,
    viewRef,
    runAction,
    runBuildAction,
    pushNotice,
    setSelected,
  });
  const panelSource = usePanelSource(view);
  const restart = (abandon: boolean): Promise<string | null> =>
    restartFrom(viewRef.current, abandon);
  const { foundingName, lineNotice } = naming;

  if (war.watching && !gameOver) {
    return (
      <ArmyActionsContext.Provider value={war.armyActions}>
        <ForeignWarScene
          key={`${war.watching.campaignId}@${war.watching.cell.x},${war.watching.cell.y}`}
          watch={war.watching}
          world={world}
          clock={clock}
          onBack={war.backHome}
        />
      </ArmyActionsContext.Provider>
    );
  }
  // Scéna za vojvodou na cizí mapě (journey.md – Scéna cizí mapy) – jako u tažení jen jedna scéna
  // Babylonu naráz: scéna a rozhraní vsi se odpojí, návrat je načte znovu
  if (lordJourney.watching && !gameOver) {
    return (
      <ForeignJourneyScene
        key={`${lordJourney.watching.x},${lordJourney.watching.y}`}
        cell={lordJourney.watching}
        journey={lordJourney.journey.latest}
        expeditions={lordJourney.journey.expeditions.latest}
        clock={clock}
        lord={lordJourney}
      />
    );
  }

  // Známá mapa z domova (journey.md – Známá mapa): tatáž scéna bez jezdců, otevřená okem u rodu
  if (knownMap.cell && !gameOver) {
    return (
      <ForeignJourneyScene
        key={`known-${knownMap.cell.x},${knownMap.cell.y}`}
        cell={knownMap.cell}
        journey={null}
        clock={clock}
        lord={null}
        known={{ onBack: knownMap.back }}
      />
    );
  }

  return (
    <PanelOptionsContext.Provider value={panelSource}>
      <KnownMapContext.Provider value={knownMap.actions}>
        <RightsProvider value={view?.rights ?? null}>
          <VillageIdProvider value={view?.id ?? null}>
            <ArmyActionsContext.Provider value={war.armyActions}>
              <GameView landscape={landscape} onSceneReady={setScene} overlays={false} />
              {perfOn && <ScenePerfPanel scene={scene} showLoad />}
              <TopBar
                view={view}
                world={clock}
                initialNowMs={initialNowMs}
                menuOpen={menuShown}
                onToggleMenu={() => (menuShown ? panels.closeMenu() : openMenu())}
                onRename={commands.rename}
                onSelectVillage={switchVillage}
                onSetSteward={commands.toggleSteward}
                house={{
                  vassals: house.view?.vassals.length ?? 0,
                  waiting: house.view?.waiting ?? 0,
                  open: panels.houseOpen,
                  onToggle: () => (panels.houseOpen ? panels.closeHouse() : panels.openHouse()),
                }}
                war={{
                  wars: house.view?.wars.length ?? 0,
                  protectionDaysLeft: house.view?.protectionDaysLeft ?? null,
                  open: panels.warOpen,
                  onToggle: () => (panels.warOpen ? panels.closeWar() : panels.openWar()),
                }}
                lordAway={lordJourney.away}
                chronicle={
                  view && !view.extinct
                    ? { open: chronicle.open, onToggle: chronicle.toggle }
                    : null
                }
                notices={{
                  unread: noticeHistory.unread,
                  open: noticeHistory.open,
                  onToggle: noticeHistory.toggle,
                }}
                devTime={devMode ? { pending: dev.skipping, onSkip: dev.skipTimeBy } : null}
              />
              {war.breakout && (
                <BreakoutButton denied={war.breakout.denied} onOrder={war.orderDefenderBreakout} />
              )}
              <Minimap
                landscape={decoded}
                scene={scene}
                village={sceneVillage}
                isolated={house.view?.isolated === true}
              />
              <SelectionPanel
                details={selectionDetails(
                  view,
                  sceneVillage,
                  current,
                  personState,
                  draftState,
                  partiesOf(lordJourney.journey.expeditions.views, view?.id ?? null),
                  journeys,
                )}
                lordJourney={lordJourney.panel}
                alarm={alarmActions}
                ennoble={{
                  targets: (view?.villages ?? []).filter(
                    (v) => v.awaitingLord && v.id !== view?.id,
                  ),
                  onEnnoble: commands.ennoble,
                }}
                onSelectTarget={setSelected}
                onPreviewSon={setSonPreview}
                gateFort={gateFort}
                onGateMode={setGateFort}
                onFortReroute={build.startReroute}
                wagonPlan={wagonPlan}
                {...commands.selection}
              />
              <BuildGrid
                options={build.options}
                active={placement.active ? build.placingItem : null}
                disabled={scene === null || foundingName}
                group={buildGroup}
                extendingVariant={build.extendingVariant}
                {...(view && buildGroup === 'fortification'
                  ? { blockedVariants: fortVariantsBlocked(view.dayIndex) }
                  : {})}
                onBuild={startBuild}
              />
              <NoticeLines
                notices={notices}
                status={villageError === null ? null : `Ves teď nejde zobrazit: ${villageError}`}
                pinned={
                  lineNotice
                    ? {
                        kind: lineNotice.kind,
                        text: lineNotice.text,
                        count: lineNotice.count,
                        onOpen: () => naming.openLineName(lineNotice.personId),
                      }
                    : null
                }
                onExpire={expireNotice}
              />
              <FoundingPanels
                view={view}
                languageChoice={languageChoice}
                house={house}
                naming={naming}
              />
              <CursorReason preview={placement.active ? placement.preview : null} />
              <JourneyCursorNote note={lordJourney.note} />
              {placement.active === 'fort-points' ? (
                <FortConfirm
                  reason={
                    placement.preview?.check.ok
                      ? null
                      : (placement.preview?.check.reason ?? 'Obvod ještě nejde položit.')
                  }
                  onConfirm={placement.confirm}
                />
              ) : null}
              {placement.active === 'church' && placement.preview?.church ? (
                <ChurchConfirm
                  type={placement.preview.church.type}
                  dims={placement.preview.church.dims}
                  reason={
                    placement.preview.check.ok
                      ? null
                      : (placement.preview.check.reason ?? 'Kostel sem postavit nejde.')
                  }
                  onDims={placement.setChurchDims}
                  onConfirm={placement.confirm}
                />
              ) : null}
              <VillagePanels
                view={view}
                viewRef={viewRef}
                menuShown={menuShown}
                email={email}
                onRestart={() => restart(true)}
                onSignOut={signOutToHome}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                devMenu={
                  devMode && view && !view.extinct
                    ? { pending: dev.forcingDisaster, onForce: dev.forceDisasterChoice }
                    : null
                }
                panels={panels}
                house={house}
                chronicle={chronicle}
                noticeHistory={noticeHistory}
                onSelectVillage={switchVillage}
              />
              {view?.journey && <JourneyBanner journey={view.journey} />}
              {view?.pendingDeparture && !view.journey && (
                <PlayerDeparturePanel
                  departure={view.pendingDeparture}
                  onPreview={setSonPreview}
                  onChoose={commands.choosePlayerDeparture}
                />
              )}
              <GameOverScreen view={view} onRestart={() => restart(false)} />
            </ArmyActionsContext.Provider>
          </VillageIdProvider>
        </RightsProvider>
      </KnownMapContext.Provider>
    </PanelOptionsContext.Provider>
  );
}
