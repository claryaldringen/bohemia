import type { ReactElement } from 'react';
import type { SelectionDetails } from '@/lib/selection-details';
import { formatInteger } from '@/lib/village-format';
import { ROW, Stat } from './parts';

/** Hromada klád u cesty (forest.md – Mýcení a hromada klád): kolik klád na ní leží. */
export function LogPileBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'log-pile' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat src="/icons/resources/wood.png" name="Klády na hromadě" testId="selection-log-pile">
          {formatInteger(details.logs)}
        </Stat>
      </div>
    </div>
  );
}
