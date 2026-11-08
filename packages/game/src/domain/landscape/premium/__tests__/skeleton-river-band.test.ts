// Pásmo prémie na kostře – typy řeky (splavná řeka, soutok) na místě „řeka“: rovně i v ohybu.
import { describeSkeletonTypeBands } from './skeleton-type-band';

describeSkeletonTypeBands([
  ['navigable-river', 'rovně'],
  ['navigable-river', 'ohyb'],
  ['confluence', 'rovně'],
  ['confluence', 'ohyb'],
]);
