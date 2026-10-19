'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape (v produkci stránka vrací 404). Zkouška umisťování
// staveb a vzhledu vsi ve scéně bez přihlášení a databáze: kontroly jsou zjednodušené (stavět
// nejde jen na vodu a přes jiné stavby), ves žije jen ve stavu komponenty. Skutečné rozhraní vsi
// a pravidla umístění patří do hry (/game) a herního jádra, ne sem.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  CEMETERY,
  NO_OBSTACLE_CHANGES,
  PLOT_TYPES,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPlotPlacement,
  checkSacredBuildingPlacement,
  fieldPartsFromCells,
  matureTreesByDistance,
  obstaclesOf,
  orchardPartsFromCells,
  ROTATION_STEP,
  sameGrid,
  rotatedPlot,
  sacredSitesOf,
  squareCenter,
  surfaceAt,
  walkGroundOf,
  type DwellingType,
  type SacredBuildingKind,
  type Landscape,
  type ObstacleChanges,
  type PartStage,
  type PlacementCheck,
  type Position,
  type SquareGrid,
  type TileCell,
} from '@bohemia/game';
import { GameView } from '@/components/game/GameView';
import { CursorReason } from '@/components/game/hud/CursorReason';
import { Minimap } from '@/components/game/hud/Minimap';
import { ScenePerfPanel } from '@/components/game/ScenePerfPanel';
import { dwellingPlacementCost, sacredPlacementCost } from '@/lib/build-items';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { CEMETERY_PHASES } from '@/lib/scene/cemetery-layout';
import { structureGridAt, touchingSquares } from '@/lib/scene/field-cells';
import { FIELD_LOOKS, FIELD_LOOK_LABELS, type FieldLook } from '@/lib/scene/field-look';
import {
  PLANTING_PHASES,
  TREE_GROWTH_YEARS,
  plantingPhase,
  treeGrowth,
} from '@/lib/scene/orchard-layout';
import { tileAt, tileCenter } from '@/lib/scene/tile-at';
import { CONSTRUCTION_PHASES, constructionPhase } from '@/lib/scene/village-construction';
import { SACRED_SITE_KIND } from '@/lib/scene/sacred-layout';
import { REFERENCE_DAY, dateOfDayOfYear } from '@/lib/scene/season-look';
import type {
  SquaresPreview,
  PlacementPreview,
  SceneDwelling,
  SceneField,
} from '@/lib/scene/village-types';
import { formatCells, formatHa, formatManDays, plural } from '@/lib/village-format';
import { SACRED_OAK_GROWTH } from '@/lib/sacred-look';
import {
  HOLDINGS_DEMOS,
  HOLDINGS_DEMO_NAMES,
  HOLDINGS_SHOW_DAY,
  holdingsDemo,
  holdingsOverlay,
  simulateHoldings,
  type SimulatedPart,
} from './dev-holdings';
import { demoLabor } from './dev-labor';
import { demoOvergrowth, type OvergrowthDemo } from './dev-overgrowth';
import {
  DEMO_APPLE_STAGES,
  DEMO_ROAD_STAGES,
  demoApplesStage,
  demoRoad,
  demoRoadGap,
  demoRoadStage,
} from './dev-road';
import { demoCartSlope, type CartDemo } from './dev-cart';
import type { CartKind } from '@bohemia/game';
import {
  placementVillageFromScene,
  scenePlot,
  type SceneSacred,
  type SceneVillage,
} from '@/lib/village-view';

const STAGES: PartStage[] = ['founding', 'ready', 'sown', 'young-fallow', 'meadow'];
const SEASON_NAMES = { spring: 'jaro', summer: 'léto', autumn: 'podzim', winter: 'zima' } as const;
/** Stáří obydlí pro pěšiny na vývojové stránce (let; null = odjakživa). */
const PATH_AGES: (number | null)[] = [null, 0.5, 1, 2, 8, 20, 40];
/** Ukázka hospodaření podle polohy domů – po kolika letech simulace se vzorec polí ukáže. */
const HOLDINGS_YEARS = 20;
/** „Přehrát rok“ – celý rok za tolik sekund. */
const YEAR_PLAY_S = 60;
const buttonClass =
  'rounded bg-stone-800 px-2 py-0.5 text-stone-50 hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300';

type DevCemetery = NonNullable<SceneVillage['cemeteries']>[number];
type DevPen = NonNullable<SceneVillage['pens']>[number];
type DevOrchard = NonNullable<SceneVillage['orchards']>[number];
type DevSacredBuilding = SceneSacred['buildings'][number];
const SACRED_NAMES: Record<SacredBuildingKind, string> = { idol: 'Modla', shrine: 'Svatyně' };

interface DevWindow extends Window {
  __bohemiaDev?: {
    scene: LandscapeScene;
    /** Ves, jak ji právě kreslí scéna (snímky z Playwrightu – výběr, kamera). */
    village: () => SceneVillage;
    setDwellings: (dwellings: SceneDwelling[]) => void;
    setCemeteries: (cemeteries: DevCemetery[]) => void;
    setOrchards: (orchards: DevOrchard[]) => void;
    /** Založí pole na čtvercích (i v lese) – překážky z nich zmizí jako po založení. */
    addField: (cells: TileCell[]) => void;
    /** Pokácí `count` dospělých stromů nejblíž bodu (pařezy). */
    fellTrees: (count: number, near?: { x: number; z: number }) => void;
    /** Modly a svatyně (i staveniště) – snímky z Playwrightu. */
    setSacredBuildings: (buildings: DevSacredBuilding[]) => void;
    /**
     * Vymýtí les kolem nejbližšího háje a posvátného dubu – kam se podívat. `grown` – duby jako
     * 60 let po ušetření (o 30 % větší).
     */
    clearSacred: (grown?: boolean) => {
      grove: { x: number; z: number } | null;
      oak: { x: number; z: number } | null;
    };
  };
}

interface DevField {
  id: number;
  /** Natočená mřížka pole (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
  parts: { cell: TileCell; x: number; z: number; size: number; rotation?: number }[];
  /**
   * Ukázka polí: vzhled celého pole (rozpracovaný díl s `work`), nebo `staked` – vytyčené pole
   * před zakládáním. Bez údaje podle přepínače dílů.
   */
  sample?: { look: FieldLook | null; work?: number; before?: FieldLook };
}

/** Vzhled polí na vývojové stránce: podle stadia dílů (a období), nebo jeden vzhled pro všechny. */
type LookMode = 'stage' | FieldLook;
const LOOK_MODES: LookMode[] = ['stage', ...FIELD_LOOKS];

export function DevVillagePreview({ landscape }: { landscape: LandscapeTransfer }): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [dwellings, setDwellings] = useState<SceneDwelling[]>([]);
  const [fields, setFields] = useState<DevField[]>([]);
  const [cemeteries, setCemeteries] = useState<DevCemetery[]>([]);
  const [orchards, setOrchards] = useState<DevOrchard[]>([]);
  // ohrady (oxen.md) – zatím jen ukázka natočené ohrady
  const [pens, setPens] = useState<DevPen[]>([]);
  // posvátná místa (happiness.md): ušetřené duby a háje, modly a svatyně
  const [sacredOaks, setSacredOaks] = useState<SceneSacred['oaks']>([]);
  const [groves, setGroves] = useState<SceneSacred['groves']>([]);
  const [sacredBuildings, setSacredBuildings] = useState<DevSacredBuilding[]>([]);
  const [stage, setStage] = useState(0);
  const [mixed, setMixed] = useState(true);
  const [lookMode, setLookMode] = useState<LookMode>('stage');
  const [placing, setPlacing] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const [smokeAlways, setSmokeAlways] = useState(false);
  const [woodLogs, setWoodLogs] = useState(0);
  // odstraněné a pokácené překážky – pole v lese, kácení (scéna je skryje a les tam nekreslí)
  const [obstacles, setObstacles] = useState<ObstacleChanges>(NO_OBSTACLE_CHANGES);
  // roční období: den v roce (null = podle herního data) a přehrávání roku
  const [seasonDay, setSeasonDay] = useState<number | null>(null);
  const [playingYear, setPlayingYear] = useState(false);
  // lidé ve vsi – ukázkové rozdělení práce podle měsíce (dev-labor.ts)
  const [people, setPeople] = useState(false);
  // vyšlapané pěšiny (paths.md): vidět, teplotní mapa provozu a stáří obydlí (s „Lidé“)
  const [paths, setPaths] = useState(true);
  const [heatmap, setHeatmap] = useState(false);
  const [pathAge, setPathAge] = useState<number | null>(null);
  const [pathInfo, setPathInfo] = useState('');
  // ukázka pevné cesty se stromy v různém stáří (roads.md, dev-road.ts)
  const [road, setRoad] = useState<Pick<SceneVillage, 'roads' | 'roadTrees' | 'roadApples'> | null>(
    null,
  );
  // ukázka vozové sítě na svahu vedle pěšin (wagons.md, dev-cart.ts) – dvoukolák, pak čtyřkolák
  const [cartDemo, setCartDemo] = useState<CartDemo | null>(null);
  // stupeň vylepšení ukázkových cest (dev-road.ts – DEMO_ROAD_STAGES) a stadium jabloní u cesty
  const [roadStage, setRoadStage] = useState(0);
  const [appleStage, setAppleStage] = useState(0);
  // díra mezi úseky ukázky – zacelená jádrem jako v roční kontrole, nebo jak byla (dev-road.ts)
  const [gapClosed, setGapClosed] = useState(true);
  // ukázka zarůstání přílohu a lesa vsi (fields.md – Zarůstání, dev-overgrowth.ts)
  const [overgrowth, setOvergrowth] = useState<OvergrowthDemo | null>(null);
  // hospodaření podle polohy domů (fields.md): obrysy úseků a vzorec polí ze simulace jádra
  const [holdingsOn, setHoldingsOn] = useState(false);
  const [simulated, setSimulated] = useState<Map<string, SimulatedPart> | null>(null);
  const [demo, setDemo] = useState(0);
  const nextId = useRef(1);

  const village = useMemo<SceneVillage>(() => {
    const base: SceneVillage = {
      dwellings,
      fields: [
        ...fields.map((field): SceneField => ({
          id: field.id,
          ...(field.grid ? { grid: field.grid } : {}),
          parts: field.parts.map((part, i) =>
            devPart(field, part, i, { stage, mixed, lookMode, simulated }),
          ),
        })),
        ...(overgrowth ? [overgrowth.field] : []),
      ],
      cemeteries,
      orchards,
      ...(pens.length > 0 ? { pens } : {}),
      woodLogs,
      obstacles: overgrowth
        ? {
            ...obstacles,
            removed: [...new Set([...obstacles.removed, ...overgrowth.cleared])].sort(
              (a, b) => a - b,
            ),
            added: [...(obstacles.added ?? []), ...overgrowth.added],
          }
        : obstacles,
      ...(overgrowth && overgrowth.woods.length > 0 ? { woods: overgrowth.woods } : {}),
      ...(road
        ? {
            roads: demoRoadStage(
              demoRoadGap(road.roads ?? [], gapClosed, walkGroundOf(decoded).terrain),
              roadStage,
            ),
            roadTrees: road.roadTrees ?? [],
            roadApples: demoApplesStage(road.roadApples ?? [], appleStage),
          }
        : {}),
      ...(sacredOaks.length > 0 || groves.length > 0 || sacredBuildings.length > 0
        ? { sacred: { oaks: sacredOaks, groves, buildings: sacredBuildings } }
        : {}),
    };
    if (cartDemo) {
      // ukázka vozů na svahu: obydlí, ohrada se spřežením, díl nahoře a vozová cesta jádra
      return {
        ...base,
        dwellings: [...base.dwellings, ...cartDemo.dwellings],
        pens: [...(base.pens ?? []), ...cartDemo.pens],
        fields: [...base.fields, cartDemo.field],
        roads: [...(base.roads ?? []), ...cartDemo.roads],
        labor: base.labor ?? cartDemo.labor,
        carts: cartDemo.carts,
      };
    }
    if (!people) return base;
    // kácí se u nejbližších stromů k prvnímu staveništi (jako vyhrazené stromy stavby)
    const site = dwellings.find((d) => !d.built);
    const trees = site
      ? matureTreesByDistance(obstaclesOf(decoded), obstacles, site.position, { limit: 3 })
      : [];
    const day = Math.floor(seasonDay ?? REFERENCE_DAY);
    const month = dateOfDayOfYear(day).month;
    const labor = demoLabor(
      base,
      month,
      day,
      trees.map((t) => t.id),
    );
    // stáří vsi pro pěšiny: obydlí stojí `pathAge` let (bez volby odjakživa)
    const aged =
      pathAge === null
        ? base.dwellings
        : base.dwellings.map((d) => ({ ...d, since: day - Math.round(pathAge * 365.25) }));
    return { ...base, dwellings: aged, labor };
  }, [
    decoded,
    dwellings,
    fields,
    cemeteries,
    orchards,
    pens,
    stage,
    mixed,
    lookMode,
    woodLogs,
    obstacles,
    people,
    seasonDay,
    sacredOaks,
    groves,
    sacredBuildings,
    pathAge,
    road,
    roadStage,
    appleStage,
    gapClosed,
    simulated,
    overgrowth,
    cartDemo,
  ]);

  useEffect(() => {
    scene?.setVillage(village);
  }, [scene, village]);

  useEffect(() => {
    scene?.setPathsVisible(paths);
  }, [scene, paths]);

  useEffect(() => {
    scene?.setPathHeatmap(heatmap);
  }, [scene, heatmap]);

  useEffect(() => {
    if (!scene) return;
    const cells = fields.flatMap((f) => f.parts.map((p) => p.cell));
    scene.setHoldingsOverlay(holdingsOn ? holdingsOverlay(decoded, dwellings, cells) : null);
  }, [scene, holdingsOn, decoded, dwellings, fields]);

  // čísla posledního výpočtu pěšin (přepočítají se odloženě po změně vsi)
  useEffect(() => {
    if (!scene) return;
    const timer = setInterval(() => {
      const stats = scene.pathStats();
      setPathInfo(
        stats
          ? `${stats.lines} úseků · ${stats.trips} tras · ${stats.roads} cest · ${stats.trees} stromů · ${stats.ms.toFixed(0)} ms` +
              (stats.terrainMs > 0 ? ` (+ terén ${stats.terrainMs.toFixed(0)} ms)` : '')
          : '',
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [scene]);

  useEffect(() => {
    scene?.setSmokeAlways(smokeAlways);
  }, [scene, smokeAlways]);

  useEffect(() => {
    scene?.setSeasonDay(seasonDay);
  }, [scene, seasonDay]);

  useEffect(() => {
    if (!playingYear) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const days = ((now - last) / 1000 / YEAR_PLAY_S) * 365;
      last = now;
      setSeasonDay((day) => (((day ?? REFERENCE_DAY) - 1 + days) % 365) + 1);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playingYear]);

  /**
   * Pole na čtvercích – díly i v lese a křovinách; překážky dílů (stromy, keře, kameny) zmizí
   * hned jako po založení, ať je vidět vymýcený les.
   */
  const addField = (cells: TileCell[], grid?: SquareGrid): void => {
    const preview = fieldPartsFromCells(
      decoded,
      placementVillageFromScene(village),
      cells,
      devDwellingPositions(decoded, village),
      undefined,
      grid,
    );
    const cleared = preview.parts.flatMap((part) => part.obstacleIds ?? []);
    setObstacles((changes) => ({
      ...changes,
      removed: [...new Set([...changes.removed, ...cleared])].sort((a, b) => a - b),
    }));
    const id = nextId.current++;
    setFields((list) => [
      ...list,
      { id, ...(grid ? { grid } : {}), parts: fieldParts(decoded, cells, grid) },
    ]);
  };

  /**
   * Natočené stavby (Martin 18. 10. 2026 – fields.md, Natočené stavby): u místa vsi natočený
   * pozemek polozemnice (15°, dům vzadu vlevo), pole v mřížce natočené o 30°, sad o 45°, hřbitov
   * o 60° s hroby a ohrada o 15° se zvířaty – v polích, sadech a hřbitovech se pak dá malovat
   * dál (malování se chytí jejich mřížky) a pozemky natáčet klávesami [ a ].
   */
  const showRotated = (): void => {
    scene?.cancelPlacement();
    const { x: sx, y: sy } = decoded.villageSite;
    const at = (dx: number, dy: number): { x: number; z: number } => {
      const c = tileCenter(decoded, sx + dx, sy + dy);
      return { x: c.worldX, z: c.worldZ };
    };
    const site = at(0, 0);
    const plot = rotatedPlot(decoded, { ...at(-2, 0), rotation: ROTATION_STEP }, 'back-left');
    const list: SceneDwelling[] = [
      {
        id: nextId.current++,
        type: 'zemnice',
        position: { x: site.x, z: site.z - 10, rotation: 0 },
        built: true,
        progress: 1,
      },
    ];
    if (plot) {
      const placementVillage = placementVillageFromScene(village);
      const check = checkPlotPlacement(decoded, placementVillage, 'polozemnice', plot);
      if (check.position) {
        list.push({
          id: nextId.current++,
          type: 'polozemnice',
          position: check.position,
          built: true,
          progress: 1,
          plot: scenePlot(decoded, plot),
        });
      }
    }
    setDwellings(list);
    const fieldGrid: SquareGrid = { ...at(3, 3), rotation: 2 * ROTATION_STEP };
    const fieldCells: TileCell[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) fieldCells.push({ x, y });
    const orchardGrid: SquareGrid = { ...at(-4, 4), rotation: 3 * ROTATION_STEP };
    const orchardCells: TileCell[] = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) orchardCells.push({ x, y });
    setFields([]);
    setOrchards([
      {
        id: nextId.current++,
        grid: orchardGrid,
        squares: fieldParts(decoded, orchardCells, orchardGrid).map((square) => ({
          ...square,
          planting: 1,
          growth: treeGrowth(20),
          fruit: true,
        })),
      },
    ]);
    addField(fieldCells, fieldGrid);
    const cemeteryGrid: SquareGrid = { ...at(-4, -4), rotation: 4 * ROTATION_STEP };
    setCemeteries([
      {
        id: nextId.current++,
        grid: cemeteryGrid,
        squares: fieldParts(
          decoded,
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
          cemeteryGrid,
        ),
        built: true,
        progress: 1,
        graves: 70,
      },
    ]);
    const penGrid: SquareGrid = { ...at(3, -3), rotation: ROTATION_STEP };
    setPens([
      {
        id: nextId.current++,
        cell: { x: 0, y: 0 },
        grid: penGrid,
        x: penGrid.x,
        z: penGrid.z,
        size: decoded.cellSizeM,
        rotation: penGrid.rotation,
        built: true,
        progress: 1,
        oxen: 2,
        trainees: 0,
        cows: 1,
      },
    ]);
  };

  /** Pokácí dospělé stromy nejblíž bodu (bez bodu u prvního obydlí nebo místa vsi) – pařezy. */
  const fellTrees = (count: number, near?: { x: number; z: number }): void => {
    const from = near ?? devDwellingPositions(decoded, village)[0]!;
    const trees = matureTreesByDistance(obstaclesOf(decoded), obstacles, from, { limit: count });
    setObstacles((changes) => ({
      ...changes,
      stumps: [...new Set([...changes.stumps, ...trees.map((t) => t.id)])].sort((a, b) => a - b),
    }));
  };

  /**
   * Mýcení lesa s posvátným dubem a hájem: najde nejbližší háj a posvátný dub (vrstva překážek)
   * k místu vsi a založí pole na čtvercích kolem nich – jádro háj z pole vyjme a dub nechá stát,
   * ušetřená místa se ukážou s obětinami a kameny. Vrátí, kde jsou (pro kameru).
   */
  const clearSacred = (
    grown = false,
  ): {
    grove: { x: number; z: number } | null;
    oak: { x: number; z: number } | null;
  } => {
    const sites = sacredSitesOf(obstaclesOf(decoded));
    const site = tileCenter(decoded, decoded.villageSite.x, decoded.villageSite.y);
    const distance = (p: { x: number; z: number }): number =>
      Math.hypot(p.x - site.worldX, p.z - site.worldZ);
    const grove = [...sites.groves].sort((a, b) => distance(a) - distance(b))[0] ?? null;
    const oak = [...sites.oaks].sort((a, b) => distance(a) - distance(b))[0] ?? null;
    const ring = (cells: readonly TileCell[], reach: number): TileCell[] => {
      const out = new Map<string, TileCell>();
      for (const c of cells) {
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const cell = { x: c.x + dx, y: c.y + dy };
            if (cell.x < 0 || cell.y < 0 || cell.x >= decoded.size || cell.y >= decoded.size)
              continue;
            out.set(`${cell.x},${cell.y}`, cell);
          }
        }
      }
      return [...out.values()].filter((c) => surfaceAt(decoded, c.x, c.y) !== 'water');
    };
    const oakCell = oak
      ? {
          x: Math.floor((oak.x + (decoded.size * decoded.cellSizeM) / 2) / decoded.cellSizeM),
          y: Math.floor((oak.z + (decoded.size * decoded.cellSizeM) / 2) / decoded.cellSizeM),
        }
      : null;
    const cells = [...(grove ? ring(grove.cells, 2) : []), ...(oakCell ? ring([oakCell], 1) : [])];
    const preview = fieldPartsFromCells(
      decoded,
      placementVillageFromScene(village),
      cells,
      devDwellingPositions(decoded, village),
    );
    const cleared = preview.parts.flatMap((part) => part.obstacleIds ?? []);
    setObstacles((changes) => ({
      ...changes,
      removed: [...new Set([...changes.removed, ...cleared])].sort((a, b) => a - b),
    }));
    const partCells = preview.parts.flatMap((part) => (part.cell ? [part.cell] : []));
    if (partCells.length > 0) {
      const id = nextId.current++;
      setFields((list) => [...list, { id, parts: fieldParts(decoded, partCells) }]);
    }
    setSacredOaks((list) => [
      ...list.filter((o) => !preview.spared.oaks.some((s) => s.id === o.id)),
      ...preview.spared.oaks.map((o) => ({
        ...o,
        growth: grown ? 1 + SACRED_OAK_GROWTH.extra : 1,
      })),
    ]);
    setGroves((list) => [
      ...list.filter((g) => !preview.spared.groves.some((s) => s.id === g.id)),
      ...preview.spared.groves.map((g) => ({
        id: g.id,
        x: g.x,
        z: g.z,
        squares: fieldParts(decoded, g.cells),
      })),
    ]);
    return {
      grove: grove ? { x: grove.x, z: grove.z } : null,
      oak: oak ? { x: oak.x, z: oak.z } : null,
    };
  };

  // Přístup ke scéně a vsi pro snímky z Playwrightu (jen tato vývojová stránka).
  const devActions = useRef({ addField, fellTrees, clearSacred, village });
  useEffect(() => {
    devActions.current = { addField, fellTrees, clearSacred, village };
  });
  useEffect(() => {
    if (!scene) return;
    const devWindow = window as DevWindow;
    devWindow.__bohemiaDev = {
      scene,
      village: () => devActions.current.village,
      setDwellings,
      setCemeteries,
      setOrchards,
      addField: (cells) => devActions.current.addField(cells),
      fellTrees: (count, near) => devActions.current.fellTrees(count, near),
      setSacredBuildings,
      clearSacred: (grown) => devActions.current.clearSacred(grown),
    };
    return () => {
      delete devWindow.__bohemiaDev;
    };
  }, [scene]);

  const handlers = {
    onCancel: (): void => {
      setPlacing(null);
      setPreview(null);
    },
    onPreview: setPreview,
  };

  const placeDwelling = (type: DwellingType): void => {
    if (!scene) return;
    setPlacing(type === 'zemnice' ? 'Zemnice' : 'Polozemnice');
    if (PLOT_TYPES[type]) {
      // polozemnice na pozemku – kontrola i cena jako ve hře (herní jádro), [ a ] otáčejí pozemek,
      // Tab mění variantu
      scene.startPlacement(
        {
          kind: 'plot',
          type,
          check: (plot) => {
            const placementVillage = placementVillageFromScene(village);
            const check = checkPlotPlacement(decoded, placementVillage, type, plot);
            const cost =
              check.ok && check.position
                ? dwellingPlacementCost(
                    decoded,
                    placementVillage,
                    type,
                    check.position,
                    check,
                    woodLogs,
                  )
                : null;
            return { ...check, cost };
          },
        },
        {
          ...handlers,
          onConfirm: (result) => {
            handlers.onCancel();
            if (result.kind !== 'dwelling' || !result.plot) return;
            const id = nextId.current++;
            const plot = scenePlot(decoded, result.plot);
            setDwellings((list) => [
              ...list,
              { id, type: result.type, position: result.position, built: false, progress: 0, plot },
            ]);
          },
        },
      );
      return;
    }
    scene.startPlacement(
      {
        kind: 'dwelling',
        type,
        check: (position) => {
          const check = fakeDwellingCheck(decoded, village, position);
          if (!check.ok) return { ...check, cost: null };
          // cena jako ve hře – překážky a dřevo podle skutečné vrstvy překážek a klád
          const placementVillage = placementVillageFromScene(village);
          const real = checkDwellingPlacement(decoded, placementVillage, type, position);
          const cost = dwellingPlacementCost(
            decoded,
            placementVillage,
            type,
            position,
            real,
            woodLogs,
          );
          return { ...check, cost };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'dwelling') return;
          const id = nextId.current++;
          setDwellings((list) => [
            ...list,
            { id, type: result.type, position: result.position, built: false, progress: 0 },
          ]);
        },
      },
    );
  };

  /** Modla nebo svatyně se skutečnou kontrolou a cenou z herního jádra (staví se po fázích). */
  const placeSacred = (kind: SacredBuildingKind): void => {
    if (!scene) return;
    setPlacing(SACRED_NAMES[kind]);
    scene.startPlacement(
      {
        kind: 'sacred',
        type: kind,
        check: (position) => {
          const placementVillage = placementVillageFromScene(village);
          const layer = obstaclesOf(decoded);
          const check = checkSacredBuildingPlacement(
            decoded,
            placementVillage,
            kind,
            position,
            layer,
          );
          return {
            ...check,
            cost: check.ok
              ? sacredPlacementCost(placementVillage, kind, position, check, layer)
              : null,
          };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'sacred') return;
          const id = nextId.current++;
          setSacredBuildings((list) => [
            ...list,
            { id, kind: result.type, position: result.position, built: false, progress: 0 },
          ]);
        },
      },
    );
  };

  /**
   * Modly a svatyně ve všech fázích stavby vedle sebe u místa vsi (vytyčení při 0 %, pak
   * středy fází) a hotové na konci řady.
   */
  const showSacred = (): void => {
    scene?.cancelPlacement();
    const site = tileCenter(decoded, decoded.villageSite.x, decoded.villageSite.y);
    const list: DevSacredBuilding[] = [];
    (['idol', 'shrine'] as const).forEach((kind, row) => {
      const phases = CONSTRUCTION_PHASES[SACRED_SITE_KIND[kind]];
      const stops = [0, ...phases.slice(1).map((p) => (p.from + p.to) / 2), 1];
      const spacing = kind === 'idol' ? 7 : 34;
      stops.forEach((progress, i) => {
        const x = site.worldX + (i - (stops.length - 1) / 2) * spacing;
        const z = site.worldZ + (row === 0 ? 12 : 40);
        const tile = tileAt(decoded, x, z);
        if (!tile || surfaceAt(decoded, tile.x, tile.y) === 'water') return;
        list.push({
          id: nextId.current++,
          kind,
          position: { x, z, rotation: Math.PI },
          built: progress >= 1,
          progress,
        });
      });
    });
    setSacredBuildings(list);
  };

  const placeField = (): void => {
    if (!scene) return;
    setPlacing('Pole');
    scene.startPlacement(
      {
        kind: 'squares',
        // natočené pole (fields.md – Natočené stavby): [ a ] otáčejí mřížku, nad polem se malování
        // chytí jeho mřížky
        rotatable: true,
        gridAt: (x, z) =>
          structureGridAt(
            fields.map((f) => ({ ...(f.grid ? { grid: f.grid } : {}), squares: f.parts })),
            x,
            z,
          ),
        preview: (cells, grid) => {
          const real = fieldPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
            undefined,
            grid,
          );
          if (grid) {
            return {
              check: real.check,
              label: `${formatCells(cells.length)} · ${formatHa(real.areaM2)}`,
              blockedCells: real.blockedCells,
              cost: real.check.ok ? { laborManDays: real.foundingCost, trees: 0 } : null,
            };
          }
          const preview = fakeFieldPreview(decoded, village, cells);
          if (!preview.check.ok) return preview;
          return { ...preview, cost: { laborManDays: real.foundingCost, trees: 0 } };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'squares') return;
          // rozšíření pole v jeho mřížce – díly přibudou k poli, které čtverce navazují
          const joined = fieldPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            result.cells,
            village.dwellings.map((d) => d.position),
            undefined,
            result.grid,
          ).joinedFields[0];
          const target = fields.find((f) => f.id === joined);
          if (target) {
            setFields((list) =>
              list.map((f) =>
                f.id === target.id
                  ? { ...f, parts: [...f.parts, ...fieldParts(decoded, result.cells, result.grid)] }
                  : f,
              ),
            );
            return;
          }
          addField(result.cells, result.grid);
        },
      },
    );
  };

  /** Hřbitov se skutečnou kontrolou z herního jádra (i s varováním u obydlí a vody). */
  const placeCemetery = (): void => {
    if (!scene) return;
    setPlacing('Hřbitov');
    scene.startPlacement(
      {
        kind: 'squares',
        // natočený hřbitov (fields.md – Natočené stavby): [ a ] otáčejí mřížku
        rotatable: true,
        gridAt: (x, z) => structureGridAt(cemeteries, x, z),
        preview: (cells, grid) => {
          const result = cemeteryPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
            undefined,
            grid,
          );
          return {
            check: result.check,
            label: `${formatCells(cells.length)} · ${result.capacity} ${plural(result.capacity, 'hrob', 'hroby', 'hrobů')}`,
            blockedCells: result.blockedCells,
            warningCells: result.warningCells,
            cost: result.check.ok ? { laborManDays: result.foundingCost, trees: 0 } : null,
          };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'squares') return;
          const grid = result.grid;
          const squares = fieldParts(decoded, result.cells, grid);
          setCemeteries((list) => {
            // rozšíření hřbitova ve stejné mřížce – čtverce na konec (jako jádro)
            const extended = list.find(
              (c) => sameGrid(c.grid, grid) && touchingSquares(c.squares, squares).length > 0,
            );
            if (extended) {
              return list.map((c) =>
                c === extended ? { ...c, squares: [...c.squares, ...squares] } : c,
              );
            }
            const id = nextId.current++;
            return [
              ...list,
              { id, ...(grid ? { grid } : {}), squares, built: false, progress: 0, graves: 0 },
            ];
          });
        },
      },
    );
  };

  /** Sad se skutečnou kontrolou z herního jádra; vysazuje se tlačítky Stavby ± 10 %. */
  const placeOrchard = (): void => {
    if (!scene) return;
    setPlacing('Sad');
    scene.startPlacement(
      {
        kind: 'squares',
        rotatable: true,
        gridAt: (x, z) => structureGridAt(orchards, x, z),
        preview: (cells, grid) => {
          const result = orchardPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
            undefined,
            grid,
          );
          return {
            check: result.check,
            label: `${formatCells(cells.length)} · ${formatHa(result.areaM2)}`,
            blockedCells: result.blockedCells,
            cost: result.check.ok ? { laborManDays: result.plantingCost, trees: 0 } : null,
          };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'squares') return;
          const id = nextId.current++;
          const grid = result.grid;
          const squares = fieldParts(decoded, result.cells, grid).map((square) => ({
            ...square,
            planting: 0,
            growth: 0,
            fruit: false,
          }));
          setOrchards((list) => [...list, { id, ...(grid ? { grid } : {}), squares }]);
        },
      },
    );
  };

  /** Stromy všech vysazených sadů o `years` let starší (velikost podle stáří). */
  const ageOrchards = (years: number): void =>
    setOrchards((list) =>
      list.map((o) => ({
        ...o,
        squares: o.squares.map((s) => {
          if (s.planting < 1) return s;
          // stáří zpět z velikosti (treeGrowth je lineární do plné velikosti)
          const share = (s.growth - treeGrowth(0)) / (1 - treeGrowth(0));
          const age = Math.max(0, share * TREE_GROWTH_YEARS + years);
          return { ...s, growth: Math.round(treeGrowth(age) * 100) / 100 };
        }),
      })),
    );

  const toggleFruit = (): void =>
    setOrchards((list) =>
      list.map((o) => ({
        ...o,
        squares: o.squares.map((s) => ({ ...s, fruit: s.planting >= 1 && !s.fruit })),
      })),
    );

  /**
   * Sady 2 × 2 čtverce vedle sebe kousek od místa vsi: obě fáze výsadby, mladý sad (s kůly),
   * dorůstající a dospělý sad, dospělý s jablky.
   */
  const showOrchards = (): void => {
    scene?.cancelPlacement();
    const { x: sx, y: sy } = decoded.villageSite;
    const stops: { planting: number; age: number; fruit: boolean }[] = [
      ...PLANTING_PHASES.map((p) => ({ planting: (p.from + p.to) / 2, age: 0, fruit: false })),
      { planting: 1, age: 1, fruit: false },
      { planting: 1, age: 6, fruit: false },
      { planting: 1, age: 20, fruit: false },
      { planting: 1, age: 20, fruit: true },
    ];
    const list: DevOrchard[] = [];
    stops.forEach((stop, i) => {
      const cells: TileCell[] = [];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) cells.push({ x: sx - 8 + i * 3 + dx, y: sy + 2 + dy });
      const squares = fieldParts(decoded, cells);
      if (squares.length < cells.length) return;
      const growth = stop.planting >= 1 ? Math.round(treeGrowth(stop.age) * 100) / 100 : 0;
      list.push({
        id: nextId.current++,
        squares: squares.map((s) => ({ ...s, planting: stop.planting, growth, fruit: stop.fruit })),
      });
    });
    const site = tileCenter(decoded, sx, sy);
    setDwellings([
      {
        id: nextId.current++,
        type: 'zemnice',
        position: { x: site.worldX, z: site.worldZ - 10, rotation: 0 },
        built: true,
        progress: 1,
      },
    ]);
    setOrchards(list);
  };

  const advanceConstruction = (step: number): void => {
    const next = (progress: number): number =>
      Math.min(1, Math.max(0, Math.round((progress + step) * 100) / 100));
    setDwellings((list) =>
      list.map((d) => {
        if (d.built) return d;
        const progress = next(d.progress);
        return { ...d, progress, built: progress >= 1 };
      }),
    );
    setCemeteries((list) =>
      list.map((c) => {
        if (c.built) return c;
        const progress = next(c.progress);
        return { ...c, progress, built: progress >= 1 };
      }),
    );
    setOrchards((list) =>
      list.map((o) => ({
        ...o,
        squares: o.squares.map((s) => {
          if (s.planting >= 1) return s;
          const planting = next(s.planting);
          return { ...s, planting, growth: planting >= 1 ? treeGrowth(0) : 0 };
        }),
      })),
    );
    setSacredBuildings((list) =>
      list.map((b) => {
        if (b.built) return b;
        const progress = next(b.progress);
        return { ...b, progress, built: progress >= 1 };
      }),
    );
  };

  /** Pohřbí do hotových hřbitovů dalších `count` mrtvých (nejvýš do zaplnění). */
  const addGraves = (count: number): void =>
    setCemeteries((list) =>
      list.map((c) => {
        if (!c.built) return c;
        const capacity = c.squares.length * CEMETERY.gravesPerSquare;
        return { ...c, graves: Math.min(capacity, Math.max(0, c.graves + count)) };
      }),
    );

  /**
   * Hřbitovy 2 × 2 čtverce ve všech fázích založení vedle sebe kousek od místa vsi, hotové
   * s hroby a hotový s rozšířením ve stavbě; zemnice před nimi ukáže, kam míří branka.
   */
  const showCemeteries = (): void => {
    scene?.cancelPlacement();
    const { x: sx, y: sy } = decoded.villageSite;
    const stops = [...CEMETERY_PHASES.map((p) => (p.from + p.to) / 2), 1, 1];
    const list: DevCemetery[] = [];
    stops.forEach((progress, i) => {
      const cells: TileCell[] = [];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) cells.push({ x: sx - 7 + i * 3 + dx, y: sy + 2 + dy });
      const squares = fieldParts(decoded, cells);
      if (squares.length < cells.length) return;
      const built = progress >= 1;
      const graves = built ? (i === stops.length - 1 ? 224 : 70) : 0;
      list.push({ id: nextId.current++, squares, built, progress, graves });
    });
    // hotový hřbitov s rozšířením ve stavbě (dva čtverce za ním, kůly zatlučené z poloviny)
    const extended = fieldParts(decoded, [
      { x: sx - 7, y: sy + 5 },
      { x: sx - 6, y: sy + 5 },
      { x: sx - 7, y: sy + 6 },
      { x: sx - 6, y: sy + 6 },
    ]);
    const extension = fieldParts(decoded, [
      { x: sx - 7, y: sy + 7 },
      { x: sx - 6, y: sy + 7 },
    ]).map((square) => ({ ...square, pending: true }));
    if (extended.length === 4 && extension.length === 2) {
      list.push({
        id: nextId.current++,
        squares: [...extended, ...extension],
        built: true,
        progress: 0.3,
        graves: 150,
      });
    }
    const site = tileCenter(decoded, sx, sy);
    setDwellings([
      {
        id: nextId.current++,
        type: 'zemnice',
        position: { x: site.worldX, z: site.worldZ - 10, rotation: 0 },
        built: true,
        progress: 1,
      },
    ]);
    setCemeteries(list);
  };

  /**
   * Ukázka polí: obydlí u místa vsi a vedle sebe pole 2 × 2 čtverce v každém vzhledu – vytyčené,
   * zakládané (rozpracovaný čtverec), zorané, oseté, vzcházející, zelené, zralé, žeň s panáky,
   * strniště, mladý úhor, pastvina a louka na seno (tráva, seč, stohy – řádky sena, kupky
   * a stohy podle období). Rozpracované díly mají práci napůl.
   */
  const showFields = (): void => {
    scene?.cancelPlacement();
    const { x: sx, y: sy } = decoded.villageSite;
    const samples: NonNullable<DevField['sample']>[] = [
      { look: null },
      { look: 'bare', work: 0.5 },
      { look: 'plowed', work: 0.5, before: 'stubble' },
      { look: 'sown' },
      { look: 'sprouted' },
      { look: 'green' },
      { look: 'ripe' },
      { look: 'harvesting', work: 0.5, before: 'ripe' },
      { look: 'stubble' },
      { look: 'young-fallow' },
      { look: 'pasture' },
      { look: 'meadow' },
      { look: 'mown', work: 0.5, before: 'meadow' },
      { look: 'haystacks' },
    ];
    const list: DevField[] = [];
    const cleared: number[] = [];
    samples.forEach((sample, i) => {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const cells: TileCell[] = [];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          cells.push({ x: sx - 9 + col * 3 + dx, y: sy + 2 + row * 3 + dy });
      const parts = fieldParts(decoded, cells);
      if (parts.length < cells.length) return;
      const preview = fieldPartsFromCells(decoded, placementVillageFromScene(village), cells, [
        {
          x: tileCenter(decoded, sx, sy).worldX,
          z: tileCenter(decoded, sx, sy).worldZ,
          rotation: 0,
        },
      ]);
      if (sample.look !== null)
        cleared.push(...preview.parts.flatMap((part) => part.obstacleIds ?? []));
      list.push({ id: nextId.current++, parts, sample });
    });
    const site = tileCenter(decoded, sx, sy);
    setDwellings([
      {
        id: nextId.current++,
        type: 'polozemnice',
        position: { x: site.worldX, z: site.worldZ - 10, rotation: 0 },
        built: true,
        progress: 1,
      },
      {
        id: nextId.current++,
        type: 'zemnice',
        position: { x: site.worldX + 12, z: site.worldZ - 12, rotation: 0.4 },
        built: true,
        progress: 1,
      },
    ]);
    setObstacles((changes) => ({
      ...changes,
      removed: [...new Set([...changes.removed, ...cleared])].sort((a, b) => a - b),
    }));
    setFields(list);
  };

  /** Řada stavenišť ve všech fázích vedle sebe u místa vsi (a hotové obydlí na konci). */
  const showPhases = (): void => {
    scene?.cancelPlacement();
    const site = tileCenter(decoded, decoded.villageSite.x, decoded.villageSite.y);
    const list: SceneDwelling[] = [];
    (['zemnice', 'polozemnice'] as const).forEach((type, row) => {
      const phases = CONSTRUCTION_PHASES[type];
      const stops = [...phases.map((p) => (p.from + p.to) / 2), 1];
      stops.forEach((progress, i) => {
        if (PLOT_TYPES[type]) {
          // polozemnice na pozemcích – políčka vedle sebe za řadou zemnic, dům uprostřed
          const cell = {
            x: decoded.villageSite.x + i - Math.floor(stops.length / 2),
            y: decoded.villageSite.y + 2,
          };
          if (cell.x < 0 || cell.x >= decoded.size || cell.y >= decoded.size) return;
          if (surfaceAt(decoded, cell.x, cell.y) === 'water') return;
          const plot = scenePlot(decoded, { cell, variant: 'center' });
          list.push({
            id: nextId.current++,
            type,
            position: { x: plot.x, z: plot.z, rotation: Math.PI },
            built: progress >= 1,
            progress,
            plot,
          });
          return;
        }
        const x = site.worldX + (i - (stops.length - 1) / 2) * 10.5;
        const z = site.worldZ + row * 14;
        const tile = tileAt(decoded, x, z);
        if (!tile || surfaceAt(decoded, tile.x, tile.y) === 'water') return;
        list.push({
          id: nextId.current++,
          type,
          // vchodem ke kameře (ta se ve výchozím pohledu dívá k +z)
          position: { x, z, rotation: Math.PI },
          built: progress >= 1,
          progress,
        });
      });
    });
    setDwellings(list);
  };

  /**
   * Lidé ve vsi (ukázkové rozdělení práce). Prázdná ves dostane ukázku – šest hotových obydlí kolem místa vsi a pole
   * 3 × 2 čtverce vedle (s osetými díly), ať mají lidé kde pracovat a ovce kde se pást.
   */
  const togglePeople = (): void => {
    if (!people && !dwellings.some((d) => d.built)) {
      scene?.cancelPlacement();
      const { x: sx, y: sy } = decoded.villageSite;
      const site = tileCenter(decoded, sx, sy);
      const list: SceneDwelling[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + 0.4;
        const x = site.worldX + Math.cos(angle) * 13;
        const z = site.worldZ + Math.sin(angle) * 13;
        const tile = tileAt(decoded, x, z);
        if (!tile || surfaceAt(decoded, tile.x, tile.y) === 'water') continue;
        list.push({
          id: nextId.current++,
          type: i % 3 === 0 ? 'polozemnice' : 'zemnice',
          position: { x, z, rotation: angle + Math.PI },
          built: true,
          progress: 1,
        });
      }
      setDwellings(list);
      const cells: TileCell[] = [];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 3; dx++) cells.push({ x: sx + 3 + dx, y: sy - 1 + dy });
      addField(cells.filter((c) => surfaceAt(decoded, c.x, c.y) !== 'water'));
      setMixed(false);
      setStage(STAGES.indexOf('sown'));
    }
    setPeople((on) => !on);
  };

  /**
   * Ukázka zarůstání: díly nepaseného přílohu v každé fázi (louka, křoviny, mladý les) a les vsi
   * v různém stáří – kamera k nim.
   */
  const toggleOvergrowth = (): void => {
    if (overgrowth) {
      setOvergrowth(null);
      return;
    }
    const sample = demoOvergrowth(decoded, nextId.current++);
    setOvergrowth(sample);
    scene?.moveCameraTo(sample.center.x, sample.center.z);
  };

  /**
   * Ukázka vozové sítě na svahu vedle pěšin (wagons.md): vypnuto → jen pěšina (bez vozové cesty)
   * → dvoukolák → čtyřkolák → vypnuto; kamera ke svahu.
   */
  const toggleCarts = (): void => {
    const next: Record<string, CartKind | 'none' | null> = {
      off: 'none',
      none: 'two-wheel',
      'two-wheel': 'four-wheel',
      'four-wheel': null,
    };
    const kind = next[cartDemo?.kind ?? 'off'] ?? null;
    if (!kind) {
      setCartDemo(null);
      scene?.setWorkDayClock(null);
      return;
    }
    // svoz zrychleně za „den“ ukázky 86 s (jako herní den – PLOUGH_DAY_DEBUG), stránka hodiny
    // světa nemá
    scene?.setWorkDayClock(() => ({ startMs: 0, endMs: 86_000 }));
    const sample = demoCartSlope(decoded, obstaclesOf(decoded), kind, {
      dwelling: 9_000_001,
      pen: 9_000_002,
      field: 9_000_003,
      road: 9_000_004,
    });
    setCartDemo(sample);
    if (sample) scene?.moveCameraTo(sample.focus.x, sample.focus.z);
  };

  /** Ukázka pevné cesty se stromy (keř, mladý a plný strom, souš, pařez) – kamera k ní. */
  const toggleRoad = (): void => {
    if (road) {
      setRoad(null);
      return;
    }
    const sample = demoRoad(decoded);
    setRoad({ roads: sample.roads, roadTrees: sample.trees, roadApples: sample.apples });
    // kamera k rozcestí uprostřed první cesty
    scene?.moveCameraTo(sample.focus.x, sample.focus.z);
  };

  /**
   * Ukázka hospodaření podle polohy domů (řadová ves, samoty – střídá se): domy na pozemcích,
   * pole kolem, vzorec polí po HOLDINGS_YEARS letech simulace jádra a obrysy úseků.
   */
  const showHoldings = (): void => {
    scene?.cancelPlacement();
    const kind = HOLDINGS_DEMOS[demo % HOLDINGS_DEMOS.length]!;
    setDemo((d) => d + 1);
    const layout = holdingsDemo(decoded, kind, () => nextId.current++);
    setDwellings(layout.dwellings);
    setFields([]);
    setCemeteries([]);
    setOrchards([]);
    setPens([]);
    addField(layout.cells);
    setSimulated(simulateHoldings(decoded, layout.dwellings, layout.cells, HOLDINGS_YEARS));
    setHoldingsOn(true);
    setPlayingYear(false);
    setSeasonDay(HOLDINGS_SHOW_DAY);
    const site = tileCenter(decoded, decoded.villageSite.x, decoded.villageSite.y);
    scene?.moveCameraTo(site.worldX, site.worldZ);
  };

  /** Vzorec polí současné vývojové vsi po HOLDINGS_YEARS letech simulace (díly připravené). */
  const simulateVillage = (): void => {
    const cells = fields.flatMap((f) => f.parts.map((p) => p.cell));
    setSimulated(simulateHoldings(decoded, dwellings, cells, HOLDINGS_YEARS));
    setPlayingYear(false);
    setSeasonDay(HOLDINGS_SHOW_DAY);
  };

  const firstSite = dwellings.find((d) => !d.built);
  const firstSacredSite = sacredBuildings.find((b) => !b.built);
  const plantingSquare = orchards.flatMap((o) => o.squares).find((s) => s.planting < 1);
  const seasonDate = dateOfDayOfYear(seasonDay ?? REFERENCE_DAY);

  return (
    <>
      <GameView landscape={landscape} onSceneReady={setScene} />
      <div
        data-testid="dev-village"
        className="fixed top-12 left-2 z-10 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-1.5 rounded border-2 border-dashed border-amber-600 bg-stone-100/90 px-2 py-1 text-xs text-stone-700 backdrop-blur dark:bg-stone-950/80 dark:text-stone-300"
      >
        <span className="font-semibold text-amber-700">Vývoj – ves bez DB:</span>
        <button className={buttonClass} disabled={!scene} onClick={() => placeDwelling('zemnice')}>
          Zemnice
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() => placeDwelling('polozemnice')}
        >
          Polozemnice
        </button>
        <button className={buttonClass} disabled={!scene} onClick={placeField}>
          Pole
        </button>
        <button className={buttonClass} onClick={() => fellTrees(20)}>
          Kácet 20 stromů
        </button>
        <button className={buttonClass} disabled={!scene} onClick={placeCemetery}>
          Hřbitov
        </button>
        <button className={buttonClass} disabled={!scene} onClick={placeOrchard}>
          Sad
        </button>
        <button className={buttonClass} disabled={!scene} onClick={showOrchards}>
          Ukázka sadů
        </button>
        <button className={buttonClass} onClick={() => ageOrchards(2)}>
          Sady +2 roky
        </button>
        <button className={buttonClass} onClick={toggleFruit}>
          Jablka
        </button>
        {plantingSquare && (
          <span data-testid="dev-orchard-phase">
            Sad {Math.round(plantingSquare.planting * 100)} % ·{' '}
            {plantingPhase(plantingSquare.planting).label}
          </span>
        )}
        <button className={buttonClass} onClick={() => addGraves(10)}>
          Hroby +10
        </button>
        <button className={buttonClass} disabled={!scene} onClick={showCemeteries}>
          Ukázka hřbitovů
        </button>
        <button className={buttonClass} onClick={() => advanceConstruction(-0.1)}>
          Stavby −10 %
        </button>
        <button className={buttonClass} onClick={() => advanceConstruction(0.1)}>
          Stavby +10 %
        </button>
        {firstSite && (
          <span data-testid="dev-village-phase">
            {Math.round(firstSite.progress * 100)} % ·{' '}
            {constructionPhase(firstSite.type, firstSite.progress).label}
          </span>
        )}
        <button className={buttonClass} disabled={!scene} onClick={() => placeSacred('idol')}>
          Modla
        </button>
        <button className={buttonClass} disabled={!scene} onClick={() => placeSacred('shrine')}>
          Svatyně
        </button>
        <button className={buttonClass} disabled={!scene} onClick={showSacred}>
          Ukázka svatyní
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() => {
            const at = clearSacred();
            const target = at.grove ?? at.oak;
            if (target) scene?.moveCameraTo(target.x, target.z);
          }}
        >
          Mýtit les s posvátným dubem / hájem
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() =>
            setSacredOaks((list) =>
              list.map((o) => ({
                ...o,
                growth: (o.growth ?? 1) > 1 ? 1 : 1 + SACRED_OAK_GROWTH.extra,
              })),
            )
          }
        >
          Posvátné duby +60 let
        </button>
        {firstSacredSite && (
          <span data-testid="dev-sacred-phase">
            {SACRED_NAMES[firstSacredSite.kind]} {Math.round(firstSacredSite.progress * 100)} % ·{' '}
            {
              constructionPhase(SACRED_SITE_KIND[firstSacredSite.kind], firstSacredSite.progress)
                .label
            }
          </span>
        )}
        <button className={buttonClass} disabled={!scene} onClick={showPhases}>
          Ukázka fází
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={togglePeople}
          data-testid="dev-people"
        >
          {people ? 'Lidé ✓' : 'Lidé'}
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() => setPaths((on) => !on)}
          data-testid="dev-paths"
        >
          {paths ? 'Pěšiny ✓' : 'Pěšiny'}
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={toggleRoad}
          title="Ukázka pevné cesty se stromy v každém stadiu (keř, mladý, plný, souš, pařez)"
          data-testid="dev-road"
        >
          {road ? 'Cesta ✓' : 'Cesta'}
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={toggleCarts}
          title="Vozová síť na svahu vedle pěšin – nejdřív jen pěšina, pak vozová cesta dvoukoláku a čtyřkoláku"
          data-testid="dev-carts"
        >
          {cartDemo ? `Vozy: ${cartDemo.note}` : 'Vozy ve svahu'}
        </button>
        {road && (
          <button
            className={buttonClass}
            onClick={() => setRoadStage((s) => (s + 1) % DEMO_ROAD_STAGES.length)}
            title="Stupeň vylepšení ukázkových cest (s rozestavěnými fázemi)"
            data-testid="dev-road-stage"
          >
            Cesta: {DEMO_ROAD_STAGES[roadStage]!.label}
          </button>
        )}
        {road && (
          <button
            className={buttonClass}
            onClick={() => setAppleStage((s) => (s + 1) % DEMO_APPLE_STAGES.length)}
            title="Jabloně podél ukázkové cesty (vytyčení, mladé u kůlu, s jablky, souše)"
            data-testid="dev-road-apples"
          >
            Jabloně: {DEMO_APPLE_STAGES[appleStage]!.label}
          </button>
        )}
        {road && (
          <button
            className={buttonClass}
            onClick={() => setGapClosed((on) => !on)}
            title="Díra 5 m mezi úseky za odbočkou – zacelená jádrem (roční kontrola), nebo jak byla"
            data-testid="dev-road-gap"
          >
            Díra: {gapClosed ? 'zacelená' : 'otevřená'}
          </button>
        )}
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={toggleOvergrowth}
          title="Nepasený příloh v každé fázi zarůstání (louka, křoviny, mladý les) a les vsi 30–70 let"
          data-testid="dev-overgrowth"
        >
          {overgrowth ? 'Zarůstání ✓' : 'Zarůstání'}
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() => setHeatmap((on) => !on)}
          data-testid="dev-path-heatmap"
        >
          {heatmap ? 'Provoz ✓' : 'Provoz'}
        </button>
        <button
          className={buttonClass}
          title="Stáří obydlí pro pěšiny (jen s „Lidé“ – den práce)"
          onClick={() =>
            setPathAge((age) => PATH_AGES[(PATH_AGES.indexOf(age) + 1) % PATH_AGES.length]!)
          }
          data-testid="dev-path-age"
        >
          Stáří:{' '}
          {pathAge === null
            ? 'odjakživa'
            : pathAge < 1
              ? 'půl roku'
              : `${pathAge} ${plural(pathAge, 'rok', 'roky', 'let')}`}
        </button>
        {pathInfo && <span data-testid="dev-path-info">{pathInfo}</span>}
        <button className={buttonClass} onClick={() => setWoodLogs((n) => Math.max(0, n - 10))}>
          Klády −10
        </button>
        <span data-testid="dev-village-wood">{woodLogs} klád</span>
        <button className={buttonClass} onClick={() => setWoodLogs((n) => n + 10)}>
          Klády +10
        </button>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={smokeAlways}
            onChange={(e) => setSmokeAlways(e.target.checked)}
          />
          dým stále
        </label>
        <button className={buttonClass} onClick={() => setStage((s) => (s + 1) % STAGES.length)}>
          Díly: {STAGES[stage]}
        </button>
        <button
          className={buttonClass}
          data-testid="dev-field-look"
          onClick={() =>
            setLookMode((mode) => LOOK_MODES[(LOOK_MODES.indexOf(mode) + 1) % LOOK_MODES.length]!)
          }
        >
          Vzhled: {lookMode === 'stage' ? 'podle stadia a období' : FIELD_LOOK_LABELS[lookMode]}
        </button>
        <button className={buttonClass} disabled={!scene} onClick={showFields}>
          Ukázka polí
        </button>
        <button className={buttonClass} disabled={!scene} onClick={showRotated}>
          Natočené stavby
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={showHoldings}
          data-testid="dev-holdings-demo"
        >
          Hospodaření: {HOLDINGS_DEMO_NAMES[HOLDINGS_DEMOS[demo % HOLDINGS_DEMOS.length]!]}
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() => setHoldingsOn((on) => !on)}
          data-testid="dev-holdings"
        >
          {holdingsOn ? 'Úseky ✓' : 'Úseky'}
        </button>
        <button
          className={buttonClass}
          disabled={!scene || fields.length === 0}
          onClick={simulated ? () => setSimulated(null) : simulateVillage}
          title={`Vzorec polí po ${HOLDINGS_YEARS} letech simulace (dva dospělí v každém domě)`}
        >
          {simulated ? `Po ${HOLDINGS_YEARS} letech ✓` : `Po ${HOLDINGS_YEARS} letech`}
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
          střídat stavy
        </label>
        <label className="flex items-center gap-1" title="Den v roce – roční období krajiny">
          Období
          <input
            type="range"
            min={1}
            max={365}
            step={1}
            value={Math.floor(seasonDay ?? REFERENCE_DAY)}
            data-testid="dev-season-day"
            onChange={(e) => {
              setPlayingYear(false);
              setSeasonDay(Number(e.target.value));
            }}
          />
          <span className="w-28 tabular-nums" data-testid="dev-season-label">
            {seasonDay === null
              ? 'podle data'
              : `${seasonDate.day}. ${seasonDate.month}. · ${SEASON_NAMES[seasonDate.season]}`}
          </span>
        </label>
        <button className={buttonClass} onClick={() => setPlayingYear((playing) => !playing)}>
          {playingYear ? '■ zastavit' : '▶ přehrát rok'}
        </button>
        <button
          className={buttonClass}
          disabled={seasonDay === null}
          onClick={() => {
            setPlayingYear(false);
            setSeasonDay(null);
          }}
        >
          Období podle data
        </button>
        <button
          className={buttonClass}
          onClick={() => {
            scene?.cancelPlacement();
            setDwellings([]);
            setFields([]);
            setCemeteries([]);
            setOrchards([]);
            setPens([]);
            setSacredOaks([]);
            setGroves([]);
            setSacredBuildings([]);
            setObstacles(NO_OBSTACLE_CHANGES);
            setSimulated(null);
          }}
        >
          Smazat ves
        </button>
        {placing && (
          <span data-testid="dev-village-status">
            {placing}: {preview ? `${preview.check.ok ? '✓' : '✗'} ${previewText(preview)}` : '…'}{' '}
            <span className="text-stone-500">
              (Esc zruší
              {placing === 'Pole' || placing === 'Hřbitov' || placing === 'Sad'
                ? `${placing === 'Hřbitov' ? '' : ', [ ] otáčí mřížku před prvním čtvercem'}, klik / tažení maluje čtverce, Ctrl ubírá, Enter potvrdí, pravý klik zruší`
                : `, [ ] otáčí${placing === 'Polozemnice' ? ', Tab mění místo domu' : ''}, klik postaví, Shift + klik staví dál`}
              )
            </span>
          </span>
        )}
      </div>
      <Minimap landscape={decoded} scene={scene} village={village} />
      <ScenePerfPanel scene={scene} />
      {/* u kurzoru totéž co ve hře – cena ikonami s čísly, nebo důvod, proč to nejde */}
      <CursorReason preview={preview} />
    </>
  );
}

function previewText(preview: PlacementPreview): string {
  const reason = preview.check.ok ? (preview.check.warning ?? null) : preview.check.reason;
  return [preview.label, reason].filter((text) => text).join(' – ');
}

/** Zjednodušená kontrola obydlí: ne na vodu, ne mimo krajinu, ne přes jinou stavbu nebo pole. */
function fakeDwellingCheck(l: Landscape, village: SceneVillage, p: Position): PlacementCheck {
  const tile = tileAt(l, p.x, p.z);
  if (!tile) return { ok: false, reason: 'Mimo krajinu' };
  if (surfaceAt(l, tile.x, tile.y) === 'water')
    return { ok: false, reason: 'Na vodě stavět nejde' };
  if (village.dwellings.some((d) => Math.hypot(d.position.x - p.x, d.position.z - p.z) < 7)) {
    return { ok: false, reason: 'Překáží jiné obydlí' };
  }
  if (village.fields.some((f) => f.parts.some((c) => c.cell.x === tile.x && c.cell.y === tile.y))) {
    return { ok: false, reason: 'Na poli stavět nejde' };
  }
  return { ok: true, reason: null };
}

/** Obydlí vsi, nebo místo vsi, když žádné není – od nich se měří vzdálenost dílů. */
function devDwellingPositions(l: Landscape, village: SceneVillage): Position[] {
  if (village.dwellings.length > 0) return village.dwellings.map((d) => d.position);
  const site = tileCenter(l, l.villageSite.x, l.villageSite.y);
  return [{ x: site.worldX, z: site.worldZ, rotation: 0 }];
}

/**
 * Zjednodušený náhled pole: čtverce ve vodě a v jiném poli jsou zakázané; cena založení
 * a povrch dílů (louka, křoviny, les) podle herního jádra.
 */
function fakeFieldPreview(l: Landscape, village: SceneVillage, cells: TileCell[]): SquaresPreview {
  const taken = new Set(
    village.fields.flatMap((f) => f.parts.map((p) => `${p.cell.x},${p.cell.y}`)),
  );
  const blockedCells = cells.filter(
    (c) => surfaceAt(l, c.x, c.y) === 'water' || taken.has(`${c.x},${c.y}`),
  );
  const core = fieldPartsFromCells(
    l,
    placementVillageFromScene(village),
    cells,
    devDwellingPositions(l, village),
  );
  const surfaces = (['shrub', 'forest'] as const)
    .filter((s) => core.surfaceCounts[s])
    .map((s) => `${s === 'shrub' ? 'křoviny' : 'les'} ${core.surfaceCounts[s]}`);
  const label = [
    formatCells(cells.length),
    formatHa(cells.length * l.cellSizeM ** 2),
    ...surfaces,
    formatManDays(core.foundingCost),
    ...(core.clearedTrees > 0 ? [`${core.clearedTrees} klád`] : []),
  ].join(' · ');
  const check: PlacementCheck =
    blockedCells.length > 0
      ? { ok: false, reason: 'Ve vodě ani přes jiné pole pole nejde' }
      : { ok: true, reason: null };
  return { check, label, blockedCells };
}

/**
 * Díly pole – políčka ve středech čtverců (bez vody); v natočené mřížce (fields.md – Natočené
 * stavby) čtverce mřížky se středem a natočením (vodu hlídá kontrola z jádra).
 */
function fieldParts(l: Landscape, cells: TileCell[], grid?: SquareGrid): DevField['parts'] {
  if (grid) {
    return cells.map((cell) => {
      const c = squareCenter(l, grid, cell);
      return { cell, x: c.x, z: c.z, size: l.cellSizeM, rotation: grid.rotation };
    });
  }
  return cells
    .filter((c) => surfaceAt(l, c.x, c.y) !== 'water')
    .map((cell) => {
      const c = tileCenter(l, cell.x, cell.y);
      return { cell, x: c.worldX, z: c.worldZ, size: l.cellSizeM };
    });
}

/**
 * Díl pole vývojové vsi: ukázkové pole má svůj vzhled (rozpracovaný díl je ten nejblíž, ostatní
 * hotové), jinak stadium z přepínače dílů a vzhled z přepínače vzhledu (podle stadia ho odhadne
 * scéna z data – přehrání roku projde orbu, setí, růst, žeň a strniště).
 */
function devPart(
  field: DevField,
  part: DevField['parts'][number],
  index: number,
  options: {
    stage: number;
    mixed: boolean;
    lookMode: LookMode;
    simulated: ReadonlyMap<string, SimulatedPart> | null;
  },
): SceneField['parts'][number] {
  const sample = field.sample;
  const simulated = sample ? undefined : options.simulated?.get(`${part.cell.x},${part.cell.y}`);
  if (simulated) return { ...part, id: index + 1, ...simulated };
  if (sample) {
    if (sample.look === null)
      return { ...part, id: index + 1, stage: 'founding', look: 'bare', work: 0 };
    const stage =
      sample.look === 'bare'
        ? 'founding'
        : sample.look === 'young-fallow'
          ? 'young-fallow'
          : ['pasture', 'meadow', 'mown', 'haystacks'].includes(sample.look)
            ? 'meadow'
            : 'sown';
    // rozpracovaný je první díl, ostatní mají vzhled celé
    const work = sample.work !== undefined ? (index === 0 ? sample.work : 1) : undefined;
    return {
      ...part,
      id: index + 1,
      stage: stage === 'founding' && work === 1 ? 'ready' : stage,
      look: sample.look,
      ...(work !== undefined ? { work } : {}),
      ...(sample.before ? { before: sample.before } : {}),
      // od orby do strniště oralo spřežení rádlem – kulaté vnější rohy (oxen.md)
      ...(stage === 'sown' ? { ploughed: true as const } : {}),
    };
  }
  const stage = STAGES[(options.stage + (options.mixed ? index : 0)) % STAGES.length]!;
  if (options.lookMode === 'stage') {
    // zakládaný díl: první rozpracovaný, ostatní jen vytyčené
    return stage === 'founding'
      ? { ...part, id: index + 1, stage, work: index === 0 ? 0.5 : 0 }
      : { ...part, id: index + 1, stage };
  }
  const look = options.mixed
    ? FIELD_LOOKS[(FIELD_LOOKS.indexOf(options.lookMode) + index) % FIELD_LOOKS.length]!
    : options.lookMode;
  return { ...part, id: index + 1, stage, look };
}
