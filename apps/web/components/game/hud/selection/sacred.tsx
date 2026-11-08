/** Panel výběru posvátných míst – dub, háj, modla a svatyně. */
import { type ReactElement } from 'react';
import { type SelectionDetails } from '@/lib/selection-details';
import { formatInteger, formatPercent } from '@/lib/village-format';
import { Stat, Bar, Wear, RepairBar, HappinessGain } from './parts';
import { DemolitionBar } from '../StructureUseButtons';

/** Dospělé duby – ikona dubu a počet (háj: duby v háji, stavba: duby ke skácení). */
export function Oaks({
  count,
  name,
  testId,
}: {
  count: number;
  name: string;
  testId: string;
}): ReactElement {
  return (
    <Stat src="/icons/build/dub.png" name={name} testId={testId}>
      {count}
    </Stat>
  );
}

/**
 * Stáří posvátného dubu (háj: nejstaršího dubu) – ikona data a roky jako u obydlí a sadu;
 * neznámé se neukáže.
 */
export function OakAge({ years }: { years: number | null }): ReactElement | null {
  if (years === null) return null;
  return (
    <Stat icon="date" name="Stáří (roky)" testId="selection-age">
      {formatInteger(years)}
    </Stat>
  );
}

export const SACRED_ICONS: Record<Extract<SelectionDetails, { kind: 'sacred' }>['type'], string> = {
  idol: 'modla',
  shrine: 'svatyne',
};

export function SacredBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'sacred' }>;
}): ReactElement {
  if (details.building === null) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <HappinessGain value={details.happiness} />
          <Wear condition={details.condition} abandoned={details.abandoned} />
        </div>
        {details.repair !== null && <RepairBar value={details.repair} />}
        <DemolitionBar use={details.use} />
      </div>
    );
  }
  if (details.demolition !== undefined) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <Stat icon="labor" name="Bourání">
            {formatPercent(details.demolition)}
          </Stat>
        </div>
        <Bar value={details.demolition} name="Bourání" testId="selection-demolition" />
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-center gap-1.5">
      <div className="flex items-center gap-3">
        <Stat icon="labor" name="Stavba">
          {formatPercent(details.building)}
        </Stat>
        <HappinessGain value={details.happiness} pending />
        {details.oaksToFell > 0 && (
          <Oaks count={details.oaksToFell} name="Duby ke skácení" testId="selection-oaks" />
        )}
      </div>
      <Bar value={details.building} name="Stavba" testId="selection-progress" />
    </div>
  );
}
