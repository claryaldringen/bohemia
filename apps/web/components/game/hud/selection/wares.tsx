/** Zásoby zboží vsi v panelu dvorce: kůže, kožešiny, med a vosk (hides-honey.md). */
import { type ReactElement } from 'react';
import type { WaresView } from '@bohemia/game';
import { ROW, Stat } from './parts';

/** Čtyři ikony s čísly; ves bez zboží nebo samé nuly se nevykreslí. */
export function WaresStock({ wares }: { wares: WaresView | null }): ReactElement | null {
  if (!wares) return null;
  const { hides, furs, sheepFurs, honeyKg, waxKg, smallHides } = wares;
  if (hides + furs + honeyKg + waxKg === 0) return null;
  const hideName =
    smallHides === undefined ? 'Kůže' : `Kůže – v přepočtu na skot, z toho malých ${smallHides}`;
  return (
    <div className={ROW} data-testid="selection-wares">
      <Stat icon="hide" name={hideName} testId="wares-hides">
        {hides}
      </Stat>
      <Stat icon="fur" name={`Kožešiny – ovčí ${sheepFurs}`} testId="wares-furs">
        {furs}
      </Stat>
      <Stat icon="honey" name="Med" testId="wares-honey">
        {honeyKg}
      </Stat>
      <Stat icon="wax" name="Vosk" testId="wares-wax">
        {waxKg}
      </Stat>
    </div>
  );
}
