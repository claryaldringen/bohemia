import type { ReactElement } from 'react';
import type { ExpeditionCommand } from '@bohemia/game';
import type { SelectionDetails } from '@/lib/selection-details';
import { formatInteger } from '@/lib/village-format';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { ExpeditionButtons } from '../ExpeditionButtons';
import { Tooltip } from '../Tooltip';

/**
 * Panel víc vybraných lidí (expeditions.md – Co hráč vidí): řada portrétů (klik vybere jen toho
 * člověka), meč se součtem síly a tlačítka Osedlat, Sesednout a Domů. Jako v 0 A.D. – ikony,
 * slova jen v popiscích.
 */
export function GroupBody({
  details,
  onSelectTarget,
  expeditionCommand,
}: {
  details: Extract<SelectionDetails, { kind: 'people' }>;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
  expeditionCommand?:
    ((c: ExpeditionCommand, screen?: { x: number; y: number }) => void) | undefined;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5" data-testid="selection-people">
      <ul
        data-testid="selection-people-row"
        aria-label="Vybraní lidé"
        className="flex max-w-[26rem] flex-wrap gap-1"
      >
        {details.people.map((m) => (
          <li key={m.id} data-testid={`selection-people-${m.id}`}>
            <Tooltip placement="above" content={m.role}>
              <button
                type="button"
                aria-label={m.role}
                data-testid={`resident-select-${m.id}`}
                onClick={() => onSelectTarget?.({ kind: 'person', id: m.id })}
                className="hud-inset flex h-8 w-8 cursor-pointer items-center justify-center rounded"
              >
                <img src={`/icons/resources/${m.portrait}.png`} alt="" width={24} height={24} />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Tooltip content="Síla skupiny">
          <span className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/house/sword.png" alt="" width={20} height={20} />
            <span data-testid="selection-people-strength">
              {formatInteger(Math.round(details.strength))}
            </span>
          </span>
        </Tooltip>
        {expeditionCommand && (
          <ExpeditionButtons people={details.states} command={expeditionCommand} />
        )}
      </div>
    </div>
  );
}
