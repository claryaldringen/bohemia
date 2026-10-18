'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape (v produkci stránka vrací 404). Zkouška umisťování
// staveb a vzhledu vsi ve scéně bez přihlášení a databáze: kontroly jsou zjednodušené (stavět
// nejde jen na vodu a přes jiné stavby), ves žije jen ve stavu komponenty. Skutečné rozhraní vsi
// a pravidla umístění patří do hry (/game) a herního jádra, ne sem.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  CEMETERY,
  NO_OBSTACLE_CHANGES,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  fieldPartsFromCells,
  matureTreesByDistance,
  obstaclesOf,
  orchardPartsFromCells,
  surfaceAt,
  type DwellingType,
  type Landscape,
  type ObstacleChanges,
  type PartStage,
  type PlacementCheck,
  type Position,
  type TileCell,
} from '@bohemia/game';
import { GameView } from '@/components/game/GameView';
import { CursorReason } from '@/components/game/hud/CursorReason';
import { Minimap } from '@/components/game/hud/Minimap';
import { dwellingPlacementCost } from '@/lib/build-items';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { CEMETERY_PHASES } from '@/lib/scene/cemetery-layout';
import { FIELD_LOOKS, FIELD_LOOK_LABELS, type FieldLook } from '@/lib/scene/field-look';
import {
  PLANTING_PHASES,
  TREE_GROWTH_YEARS,
  plantingPhase,
  treeGrowth,
} from '@/lib/scene/orchard-layout';
import { tileAt, tileCenter } from '@/lib/scene/tile-at';
import { CONSTRUCTION_PHASES, constructionPhase } from '@/lib/scene/village-construction';
import { REFERENCE_DAY, dateOfDayOfYear } from '@/lib/scene/season-look';
import type {
  SquaresPreview,
  PlacementPreview,
  SceneDwelling,
  SceneField,
} from '@/lib/scene/village-types';
import { formatCells, formatHa, formatManDays, plural } from '@/lib/village-format';
import { demoLabor } from './dev-labor';
import { placementVillageFromScene, type SceneVillage } from '@/lib/village-view';

const STAGES: PartStage[] = [
  'founding',
  'ready',
  'sown',
  'young-fallow',
  'meadow',
  'young-growth',
  'shrub',
  'forest',
];
const SEASON_NAMES = { spring: 'jaro', summer: 'léto', autumn: 'podzim', winter: 'zima' } as const;
/** „Přehrát rok“ – celý rok za tolik sekund. */
const YEAR_PLAY_S = 60;
const buttonClass =
  'rounded bg-stone-800 px-2 py-0.5 text-stone-50 hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300';

type DevCemetery = NonNullable<SceneVillage['cemeteries']>[number];
type DevOrchard = NonNullable<SceneVillage['orchards']>[number];

interface DevWindow extends Window {
  __bohemiaDev?: {
    scene: LandscapeScene;
    setDwellings: (dwellings: SceneDwelling[]) => void;
    setCemeteries: (cemeteries: DevCemetery[]) => void;
    setOrchards: (orchards: DevOrchard[]) => void;
    /** Založí pole na čtvercích (i v lese) – překážky z nich zmizí jako po založení. */
    addField: (cells: TileCell[]) => void;
    /** Pokácí `count` dospělých stromů nejblíž bodu (pařezy). */
    fellTrees: (count: number, near?: { x: number; z: number }) => void;
  };
}

interface DevField {
  id: number;
  parts: { cell: TileCell; x: number; z: number; size: number }[];
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
  const nextId = useRef(1);

  const village = useMemo<SceneVillage>(() => {
    const base: SceneVillage = {
      dwellings,
      fields: fields.map((field): SceneField => ({
        id: field.id,
        parts: field.parts.map((part, i) => devPart(field, part, i, { stage, mixed, lookMode })),
      })),
      cemeteries,
      orchards,
      woodLogs,
      obstacles,
    };
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
    return { ...base, labor };
  }, [
    decoded,
    dwellings,
    fields,
    cemeteries,
    orchards,
    stage,
    mixed,
    lookMode,
    woodLogs,
    obstacles,
    people,
    seasonDay,
  ]);

  useEffect(() => {
    scene?.setVillage(village);
  }, [scene, village]);

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
  const addField = (cells: TileCell[]): void => {
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
    const id = nextId.current++;
    setFields((list) => [...list, { id, parts: fieldParts(decoded, cells) }]);
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

  // Přístup ke scéně a vsi pro snímky z Playwrightu (jen tato vývojová stránka).
  const devActions = useRef({ addField, fellTrees });
  useEffect(() => {
    devActions.current = { addField, fellTrees };
  });
  useEffect(() => {
    if (!scene) return;
    const devWindow = window as DevWindow;
    devWindow.__bohemiaDev = {
      scene,
      setDwellings,
      setCemeteries,
      setOrchards,
      addField: (cells) => devActions.current.addField(cells),
      fellTrees: (count, near) => devActions.current.fellTrees(count, near),
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

  const placeField = (): void => {
    if (!scene) return;
    setPlacing('Pole');
    scene.startPlacement(
      {
        kind: 'squares',
        preview: (cells) => {
          const preview = fakeFieldPreview(decoded, village, cells);
          if (!preview.check.ok) return preview;
          const real = fieldPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
          );
          return { ...preview, cost: { laborManDays: real.foundingCost, trees: 0 } };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'squares') return;
          addField(result.cells);
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
        preview: (cells) => {
          const result = cemeteryPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
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
          const id = nextId.current++;
          const squares = fieldParts(decoded, result.cells);
          setCemeteries((list) => [...list, { id, squares, built: false, progress: 0, graves: 0 }]);
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
        preview: (cells) => {
          const result = orchardPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
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
          const squares = fieldParts(decoded, result.cells).map((square) => ({
            ...square,
            planting: 0,
            growth: 0,
            fruit: false,
          }));
          setOrchards((list) => [...list, { id, squares }]);
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
      // polozemnice má po straně zahrádku – řada je řidší
      const spacing = type === 'polozemnice' ? 13 : 10.5;
      stops.forEach((progress, i) => {
        const x = site.worldX + (i - (stops.length - 1) / 2) * spacing;
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

  const firstSite = dwellings.find((d) => !d.built);
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
            setObstacles(NO_OBSTACLE_CHANGES);
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
                ? ', klik / tažení maluje čtverce, Ctrl ubírá, Enter potvrdí, pravý klik zruší'
                : ', [ ] otáčí, klik postaví, Shift + klik staví dál'}
              )
            </span>
          </span>
        )}
      </div>
      <Minimap landscape={decoded} scene={scene} village={village} />
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

/** Díly pole – políčka ve středech čtverců (bez vody). */
function fieldParts(l: Landscape, cells: TileCell[]): DevField['parts'] {
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
  options: { stage: number; mixed: boolean; lookMode: LookMode },
): SceneField['parts'][number] {
  const sample = field.sample;
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
