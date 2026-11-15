'use client';

import { useEffect, useState, type RefObject } from 'react';
import {
  FORTIFICATIONS,
  defaultChurchDims,
  isManorType,
  type ChurchType,
  type BuildableDwellingType,
  type Landscape,
  type SquareGrid,
  type TileCell,
} from '@bohemia/game';
import {
  placeCemetery,
  placeChurch,
  placeField,
  placeFortification,
  placeOrchard,
  placePen,
  rerouteFortificationSection,
  fillFortificationGateGap,
} from '@/app/game/actions';
import type { Placement } from '@/hooks/use-placement';
import {
  CHURCH_TYPE_NAMES,
  DWELLING_VARIANTS,
  buildItem,
  churchIcon,
  fortVariantKind,
  fortVariantsBlocked,
  penVariantSpecies,
  workshopChoice,
  type WebBuildKind,
} from '@/lib/build-items';
import { checkWithDesecration, squaresWithDesecration } from '@/lib/desecration-warning';
import {
  fortGapNear,
  fortGateGapPreview,
  fortReroutePreview,
  type FortGap,
} from '@/lib/fort-reroute';
import { structureGridAt } from '@/lib/scene/field-cells';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { wholeTarget, type VillageTarget } from '@/lib/scene/village-picking';
import type { PlacementMode, PlacementResult } from '@/lib/scene/village-types';
import {
  FOUNDING_DWELLING_OPTION,
  dwellingHubOption,
  isBuildAffordable,
  type BuildOption,
  type SceneVillage,
  type VillageView,
} from '@/lib/village-view';
import { rightDeniedReason } from '../hud/rights';
import { extendsSelectedPen, squareStructures } from './scene-village';
import type { PendingSites } from './use-pending-sites';
import type { ActionResult } from './village-data';

/**
 * Kostely v nabídce staveb (churches.md – Typy podle okruhu huti): malý a velký typ okruhu huti
 * s ikonou a názvem typu; nejde-li začít (bez huti, bez lomu), zašedlé s důvodem v popisku.
 */
function churchOptions(view: VillageView): Partial<Record<WebBuildKind, BuildOption>> {
  return Object.fromEntries(
    (view.churchBuild ?? []).map((c) => [
      c.kind,
      {
        laborManDays: 0,
        perHa: false,
        perSquare: false,
        upfront: [],
        blocked: c.blocked,
        affordable: c.blocked === null,
        look: { icon: churchIcon(c.type), name: CHURCH_TYPE_NAMES[c.type] },
      } satisfies BuildOption,
    ]),
  );
}

/** Typ kostela tlačítka nabídky (malý / velký okruhu huti); null – ves kostel nenabízí. */
function churchTypeOf(view: VillageView | null, kind: WebBuildKind): ChurchType | null {
  return view?.churchBuild?.find((c) => c.kind === kind)?.type ?? null;
}

/**
 * Server action staveb malovaných po čtvercích podle druhu (obydlí jdou přes `placeDwelling`).
 * Nová stavba po čtvercích = nový řádek tady a záznam v `lib/build-items.ts`.
 */
const SUBMIT_SQUARES: Partial<
  Record<
    WebBuildKind,
    (
      villageId: string,
      cells: TileCell[],
      grid?: SquareGrid,
      variant?: string,
    ) => Promise<ActionResult>
  >
> = {
  // všechny i v natočené mřížce (fields.md – Natočené stavby)
  field: (villageId, cells, grid) => placeField({ villageId, cells, ...(grid ? { grid } : {}) }),
  cemetery: (villageId, cells, grid) =>
    placeCemetery({ villageId, cells, ...(grid ? { grid } : {}) }),
  orchard: (villageId, cells, grid) =>
    placeOrchard({ villageId, cells, ...(grid ? { grid } : {}) }),
  // ohrada podle druhu (oxen.md – Ohrady podle druhu): druh z rozcestníku mřížky staveb
  pen: (villageId, cells, grid, variant) =>
    placePen({
      villageId,
      cells,
      species: penVariantSpecies(variant),
      ...(grid ? { grid } : {}),
    }),
};

export interface BuildMode {
  /** Co hráč umisťuje (tlačítko svítí v mřížce, dokud umisťování běží). */
  placingItem: WebBuildKind | null;
  /** Otevřený rozcestník mřížky staveb – stavba s druhy (ohrada, opevnění). */
  buildGroup: WebBuildKind | null;
  setBuildGroup: (kind: WebBuildKind | null) => void;
  /** Nabídka staveb (mřížka i zkratky) – vymřelá a opuštěná ves nic nestaví. */
  options: Partial<Record<WebBuildKind, BuildOption | null>>;
  /** Vybraná ohrada koní: její rozšíření koně neplatí (horses.md – Koně se stavbou ohrady). */
  extendingVariant: 'horse' | null;
  /** Tlačítko nebo zkratka stavby – rozcestník druhů, nebo umisťování ve scéně. */
  startBuild: (kind: WebBuildKind, variant?: string) => void;
}

/**
 * Stavební režim (web-ui.md – Stavba, mřížka staveb): nabídka staveb, rozcestník druhů
 * a umisťování ve scéně podle druhu umístění (`buildItem(kind).placement`) – obydlí, pozemek,
 * dílna, posvátná stavba, lom, humno, stavby po čtvercích a obvod opevnění z bodů. Hráč staví,
 * kdy chce – zablokovat smí jen cena předem a práva seniorátu. Ve vymřelé vsi umisťování skončí.
 */
export function useBuildMode({
  scene,
  decoded,
  view,
  viewRef,
  villageError,
  placement,
  selected,
  setSelected,
  sceneVillageRef,
  foundingName,
  sites,
  runBuildAction,
}: {
  scene: LandscapeScene | null;
  decoded: Landscape;
  view: VillageView | null;
  viewRef: RefObject<VillageView | null>;
  villageError: string | null;
  placement: Placement;
  selected: VillageTarget | null;
  setSelected: (target: VillageTarget | null) => void;
  sceneVillageRef: RefObject<SceneVillage>;
  /** Vojvoda ještě nemá jméno – ves se nezakládá. */
  foundingName: boolean;
  sites: PendingSites;
  runBuildAction: (action: () => Promise<ActionResult>) => Promise<void>;
}): BuildMode {
  const [placingItem, setPlacingItem] = useState<WebBuildKind | null>(null);
  // otevřený rozcestník mřížky staveb – stavba s druhy (ohrada – oxen.md, Ohrady podle druhu)
  const [buildGroup, setBuildGroup] = useState<WebBuildKind | null>(null);
  const { placementScene, placementVillage } = sites;
  const cancelPlacement = placement.cancel;

  // Ves vymřela uprostřed umisťování – stavba už nejde, umisťování skončí.
  const extinct = Boolean(view?.extinct);
  useEffect(() => {
    if (extinct) cancelPlacement();
  }, [extinct, cancelPlacement]);

  // vybraná ohrada koní: její rozšíření koně neplatí (horses.md – Koně se stavbou ohrady)
  const extendingVariant = extendsSelectedPen(
    sceneVillageRef.current,
    selected && wholeTarget(selected),
    'horse',
  )
    ? 'horse'
    : null;

  // vymřelá a opuštěná ves nic nestaví – nabídka staveb je prázdná (i zkratky); lidé na cestě
  // po příjezdu umisťují první zemnici (migration.md – fáze 4)
  const options: Partial<Record<WebBuildKind, BuildOption | null>> = view
    ? view.extinct || view.abandoned
      ? {}
      : view.journey
        ? view.journey.arrived
          ? { dwelling: FOUNDING_DWELLING_OPTION, zemnice: null }
          : {}
        : // opevnění nemá pevnou cenu – cena je u kurzoru podle délky obvodu; kostel bez ceny
          // předem, jen typ okruhu huti a důvod, proč nejde (churches.md – Stavba)
          {
            ...view.build,
            dwelling: dwellingHubOption(view.build),
            fortification: null,
            ...churchOptions(view),
          }
    : villageError === null
      ? { dwelling: FOUNDING_DWELLING_OPTION, zemnice: null }
      : {};

  /** Umisťování obydlí: zemnice půdorysem u kurzoru, polozemnice na pozemku (políčku). */
  const dwellingMode = (type: BuildableDwellingType): PlacementMode => {
    const item = buildItem(type);
    if (item.placement === 'plot') {
      return {
        kind: 'plot',
        type,
        check: (plot) =>
          checkWithDesecration(placementScene(), (village) =>
            item.check(decoded, village, plot, viewRef.current?.woodLogs ?? 0),
          ),
      };
    }
    if (item.placement !== 'footprint') throw new Error(`${type} se neumisťuje jako obydlí.`);
    return {
      kind: 'dwelling',
      type,
      check: (position) =>
        checkWithDesecration(placementScene(), (village) =>
          item.check(decoded, village, position, viewRef.current?.woodLogs ?? 0),
        ),
    };
  };

  const startBuild = (requestedKind: WebBuildKind, requestedVariant?: string): void => {
    let kind = requestedKind;
    let variant = requestedVariant;
    // dokud se nepojmenuje vojvoda, ves se nezakládá – ani zkratkou, ani klikem mimo panel jména
    if (!scene || foundingName || !(kind in options)) return;
    // seniorát: stavět v cizí vsi rodu smí jen senior (zkratka nesmí obejít zašedlé tlačítko)
    if (rightDeniedReason(view?.rights, 'build') !== null) return;
    // zkratka druhu obydlí (Z, X, 1) vybere druh v rozcestníku obydlí rovnou
    if (buildItem(kind).hubOf === 'dwelling') {
      variant = kind;
      kind = 'dwelling';
    }
    if (kind === 'dwelling') {
      // druh, který ves nenabízí (první zemnice zakládá ves), nejde; s jediným druhem se rozcestník přeskočí
      const offered = DWELLING_VARIANTS.filter((v) => v.id in options);
      if (variant !== undefined && !offered.some((v) => v.id === variant)) return;
      if (variant === undefined && offered.length === 1) variant = offered[0]!.id;
    }
    const item = buildItem(kind);
    if (item.placement === 'workshop') {
      // rozcestník dílny je až od roku 750; do té doby tlačítko i klávesa staví rovnou dnešní dílnu
      const choice = workshopChoice(item, options[kind], variant);
      if (choice.kind === 'denied') return;
      if (choice.kind === 'start') variant = choice.type;
    }
    // stavba s druhy je rozcestník: tlačítko i zkratka otevřou v mřížce druhy, znovu je zavřou
    if (
      (item.placement === 'squares' ||
        item.placement === 'fort-points' ||
        item.placement === 'dwellings' ||
        item.placement === 'workshop') &&
      item.variants &&
      variant === undefined
    ) {
      if (buildGroup !== kind) placement.cancel();
      setBuildGroup(buildGroup === kind ? null : kind);
      return;
    }
    // roštová a komorová hradba až od svého roku – zašedlé tlačítko druhu nejde obejít
    if (
      kind === 'fortification' &&
      variant &&
      view &&
      fortVariantsBlocked(view.dayIndex)[variant]
    ) {
      return;
    }
    setBuildGroup(null);
    const option = options[kind];
    // vybraný díl pole či čtverec sadu patří své stavbě (mřížka rozšíření)
    const chosen = selected && wholeTarget(selected);
    if (
      !isBuildAffordable(
        option,
        variant,
        extendsSelectedPen(sceneVillageRef.current, chosen, variant),
      )
    ) {
      return;
    }
    setSelected(null);
    setPlacingItem(kind);
    if (item.placement === 'fort-points') {
      // obvod z bodů (fortifications.md – Obvod): návrh hry u kurzoru, body upraví hráč; u mezery
      // od brány k bráně (zbořený úsek) návrh nového úseku s konci v branách (demolition.md –
      // Rozhodnutí, Martin 14. 11. 2026: „Když bude chtít hráč úsek postavit, prostě ho
      // standardně postaví“)
      const fortVariant = item.variants.find((v) => v.id === variant) ?? item.variants[0]!;
      const fortKind = fortVariantKind(fortVariant.id);
      let gap: FortGap | null = null;
      placement.start(
        {
          kind: 'fort-points',
          variant: fortVariant,
          bandM: FORTIFICATIONS.bandM[fortKind],
          get fixedEnds(): boolean {
            return gap !== null;
          },
          // otvor po zbořené bráně – jen konce otvoru (D45)
          get fixedRoute(): boolean {
            return gap?.gate === true;
          },
          propose: ([x, z]) => {
            gap = fortGapNear(sceneVillageRef.current?.forts ?? [], decoded, [x, z]);
            if (gap) return gap.proposal;
            return item.propose(
              decoded,
              placementVillage(),
              { x, z },
              fortVariant.id,
              sceneVillageRef.current?.grainPits,
            );
          },
          preview: (points) =>
            gap?.gate
              ? fortGateGapPreview(decoded, {
                  fort: gap.fort,
                  segment: gap.segment,
                  target: fortKind,
                  woodSupply: viewRef.current?.woodSupply ?? 0,
                  ...(viewRef.current?.stoneSupply
                    ? { stoneSupply: viewRef.current.stoneSupply }
                    : {}),
                })
              : gap
                ? fortReroutePreview(decoded, placementVillage(), points, {
                    fort: gap.fort,
                    segment: gap.segment,
                    target: fortKind,
                    day: viewRef.current?.dayIndex ?? 0,
                    woodSupply: viewRef.current?.woodSupply ?? 0,
                    ...(viewRef.current?.stoneSupply
                      ? { stoneSupply: viewRef.current.stoneSupply }
                      : {}),
                  })
                : {
                    ...squaresWithDesecration(placementScene(), (village) =>
                      item.check(decoded, village, points, fortVariant.id, {
                        woodSupply: viewRef.current?.woodSupply ?? 0,
                        ...(viewRef.current?.stoneSupply
                          ? { stoneSupply: viewRef.current.stoneSupply }
                          : {}),
                      }),
                    ),
                    label: '',
                  },
        },
        (result) => {
          const villageId = viewRef.current?.id;
          if (result.kind !== 'fort-points' || !villageId) return;
          if (gap?.gate) {
            const { fort, segment } = gap;
            void runBuildAction(() =>
              fillFortificationGateGap({
                villageId,
                fortificationId: fort.id,
                segment,
                target: fortKind,
              }),
            );
            return;
          }
          if (gap && fortKind !== 'rampart') {
            const { fort, segment } = gap;
            void runBuildAction(() =>
              rerouteFortificationSection({
                villageId,
                fortificationId: fort.id,
                segment,
                points: result.points.slice(1, -1),
                target: fortKind,
              }),
            );
            return;
          }
          void runBuildAction(() =>
            placeFortification({
              villageId,
              points: result.points,
              kind: fortVariantKind(result.variant),
            }),
          );
        },
      );
      return;
    }
    if (item.placement === 'squares') {
      const submit = SUBMIT_SQUARES[kind];
      if (!submit) throw new Error(`Stavba ${kind} nemá server action.`);
      // vybraná stavba stejného druhu: malování začne v její mřížce (rozšíření); u ohrady jen
      // ohrada druhu vybraného v rozcestníku (oxen.md – Ohrady podle druhu)
      const structures = squareStructures(sceneVillageRef.current, kind, variant);
      const chosenId = chosen && chosen.kind === kind && 'id' in chosen ? chosen.id : null;
      const start = chosenId === null ? undefined : structures.find((s) => s.id === chosenId)?.grid;
      placement.start(
        {
          kind: 'squares',
          preview: (cells, grid, kindVariant) => ({
            ...squaresWithDesecration(placementScene(), (village) =>
              item.check(decoded, village, cells, grid, kindVariant, {
                woodSupply: viewRef.current?.woodSupply ?? 0,
              }),
            ),
            label: '',
          }),
          ...(item.variants ? { variants: item.variants, ...(variant ? { variant } : {}) } : {}),
          ...(item.rotatable
            ? {
                rotatable: true,
                gridAt: (x: number, z: number, kindVariant?: string) =>
                  structureGridAt(
                    squareStructures(sceneVillageRef.current, kind, kindVariant),
                    x,
                    z,
                  ),
                ...(start ? { grid: start } : {}),
              }
            : {}),
        },
        (result) => {
          const villageId = viewRef.current?.id;
          if (result.kind === 'squares' && villageId) {
            void runBuildAction(() => submit(villageId, result.cells, result.grid, result.variant));
          }
        },
      );
      return;
    }
    const onDwelling = (result: PlacementResult): void => {
      // dvorec hráč nestaví – vznikne přestavbou dvorce vsi (trade.md)
      if (result.kind === 'dwelling' && !isManorType(result.type)) {
        sites.buildDwelling(result.type, result.position, result.plot);
      }
    };
    if (item.placement === 'plot' || item.placement === 'footprint') {
      placement.start(dwellingMode(item.dwellingType), onDwelling);
      return;
    }
    if (item.placement === 'dwellings') {
      // druh z rozcestníku obydlí: umisťuje se jako samostatná stavba (`buildItem(variant)`)
      const type = DWELLING_VARIANTS.find((v) => v.id === variant)?.id;
      if (type) placement.start(dwellingMode(type), onDwelling);
      return;
    }
    if (item.placement === 'workshop') {
      // vybraný druh dílny (rozcestník), jinak dnešní dílna
      const workshopType = (item.variants.find((v) => v.id === variant) ?? item.variants[0]!).id;
      placement.start(
        {
          kind: 'workshop',
          craft: item.craft,
          type: workshopType,
          check: (position) =>
            checkWithDesecration(placementScene(), (village) =>
              item.check(decoded, village, position, viewRef.current?.woodLogs ?? 0, workshopType),
            ),
        },
        (result) => {
          if (result.kind === 'workshop') {
            sites.buildWorkshop(result.craft, result.position, result.type);
          }
        },
      );
      return;
    }
    if (item.placement === 'sacred') {
      placement.start(
        {
          kind: 'sacred',
          type: item.sacredKind,
          check: (position) =>
            checkWithDesecration(placementScene(), (village) =>
              item.check(decoded, village, position),
            ),
        },
        (result) => {
          if (result.kind === 'sacred') sites.buildSacred(result.type, result.position);
        },
      );
      return;
    }
    if (item.placement === 'quarry') {
      placement.start(
        { kind: 'quarry', check: (position) => item.check(decoded, placementVillage(), position) },
        (result) => {
          if (result.kind === 'quarry') sites.buildQuarry(result.position);
        },
      );
      return;
    }
    if (item.placement === 'church') {
      const type = churchTypeOf(view, item.kind);
      if (!type) return;
      placement.start(
        {
          kind: 'church',
          type,
          dims: defaultChurchDims(type),
          check: (dims, position) =>
            checkWithDesecration(placementScene(), (village) =>
              item.check(decoded, village, type, dims, position),
            ),
        },
        (result) => {
          const villageId = viewRef.current?.id;
          if (result.kind === 'church' && villageId) {
            void runBuildAction(() =>
              placeChurch({
                villageId,
                type: result.type,
                dims: result.dims,
                position: result.position,
              }),
            );
          }
        },
      );
      return;
    }
    if (item.placement === 'threshing-floor') {
      placement.start(
        {
          kind: 'threshing-floor',
          check: (position) =>
            checkWithDesecration(placementScene(), (village) =>
              item.check(decoded, village, position, viewRef.current?.woodLogs ?? 0),
            ),
        },
        (result) => {
          if (result.kind === 'threshing-floor') sites.buildThreshingFloor(result.position);
        },
      );
      return;
    }
  };

  return {
    placingItem,
    buildGroup,
    setBuildGroup,
    options,
    extendingVariant,
    startBuild,
  };
}
