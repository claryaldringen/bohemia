// Umisťování staveb (rozcestník) – kontroly jsou rozdělené podle témat do placement-<téma>.ts.
// Podmoduly neimportují odsud, jen přímo ze sourozenců.

export { MAX_CEMETERY_CELLS, MAX_FIELD_CELLS, MAX_ORCHARD_CELLS } from './placement-types';
export type {
  CemeteryPreview,
  DwellingPlacementCheck,
  FieldPreview,
  OrchardPreview,
  PlacementCheck,
  PlacementVillage,
  SacredPlacementCheck,
} from './placement-types';
export {
  canonicalPlot,
  cellCorners,
  dwellingFootprint,
  dwellingPlot,
  nearestPlotVariant,
  plotHousePosition,
  plotHouseRotation,
  rotatedPlot,
  yardRotation,
} from './placement-geometry';
export type { PlacedDwelling } from './placement-geometry';
export { forestClearingsOf, freeDwellingClearings } from './placement-land';
export {
  checkDwellingPlacement,
  checkKilnSite,
  checkPlotPlacement,
  checkWorkshopPlacement,
  dwellingShapeFits,
  existingPlotSquare,
} from './placement-dwellings';
export type { PlotPlacementCheck } from './placement-dwellings';
export { checkPenPlacement, penSquaresFromCells } from './placement-pens';
export type { PenPlacementCheck, PenSquaresCheck } from './placement-pens';
export { placementVillageOf, placementWalk, villageDwellingPositions } from './placement-village';
export {
  forestEdgeDistanceM,
  livestockLandAt,
  squareWaterDistanceM,
  waterDistanceM,
  withForestDistances,
  villageOrigin,
  withLivestockLand,
} from './placement-squares';
export {
  cemeteryPartsFromCells,
  fieldPartsFromCells,
  orchardPartsFromCells,
} from './placement-fields';
export {
  checkSacredBuildingPlacement,
  checkThreshingFloorPlacement,
  sparedOf,
} from './placement-sacred';
export type { ThreshingFloorPlacementCheck } from './placement-sacred';
export {
  checkFortificationPlacement,
  FORT_BAD_GRID,
  FORT_NOT_CONNECTED,
  FORT_OUTSIDE,
  FORT_OVER_BUILDING,
  FORT_OVER_WATER,
  FORT_TOO_SMALL,
  FORT_TOUCHES,
} from './placement-fortifications';
export type { FortPlacementCheck } from './placement-fortifications';
