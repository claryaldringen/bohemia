export * from './types';
export * from './rules';
export * from './people';
export * from './food';
export * from './dwellings';
export * from './fields';
export * from './year-plan';
export * from './labor';
export * from './population';
export * from './cemetery';
// sady – jen čisté funkce; kroky simulace (výsadba, práce a sezóna sadů) zůstávají uvnitř
export {
  ORCHARD_TASK_NAMES,
  firstOrchardSeason,
  harvestedApplesKg,
  monthInWindow,
  nextHarvestSeason,
  orchardAgeYears,
  orchardAreaM2,
  orchardExpectedYieldKg,
  orchardPlantingCost,
  orchardSeason,
  orchardWorkRemaining,
  orchardYear,
  orchardYieldShare,
  seasonBounds,
  squareBearing,
  squareCareWork,
  squareHarvestWork,
  squareYieldKg,
  villageApplesKg,
  villageOrchards,
} from './orchard';
export * from './actions';
export * from './simulate';
export * from './polygon';
export * from './placement';
export * from './obstacles';
export * from './summary';
export * from './names';
export * from './costs';
export * from './wood';
