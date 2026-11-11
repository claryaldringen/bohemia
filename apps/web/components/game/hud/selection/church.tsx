'use client';

import type { ReactElement } from 'react';
import type { ChurchWork, MasonCraft } from '@bohemia/game';
import type { SelectionDetails } from '@/lib/selection-details';
import { formatInteger } from '@/lib/village-format';
import { Tooltip } from '../Tooltip';
import { ROW, Stat } from './parts';

/** Druhy práce na kostele v pořadí stavby – ikona a popisek (churches.md – Stavba). */
export const CHURCH_WORK_LABELS: readonly { work: ChurchWork; src: string; name: string }[] = [
  { work: 'quarry', src: '/icons/resources/stone.png', name: 'Lámání kamene a vápence' },
  { work: 'sand', src: '/icons/resources/sand.png', name: 'Kopání písku' },
  { work: 'lime', src: '/icons/resources/lime.png', name: 'Pálení vápna' },
  { work: 'foundation', src: '/icons/resources/fort-moat.png', name: 'Základy' },
  { work: 'walls', src: '/icons/house/mason-mason.png', name: 'Zdi' },
  { work: 'roof', src: '/icons/build/tesar.png', name: 'Krov a střecha' },
  { work: 'decor', src: '/icons/house/mason-plasterer.png', name: 'Výzdoba' },
];

/** Ikona a název mistra huti, který chybí (stavba jeho oboru stojí). */
const MASTER: Record<MasonCraft, { src: string; name: string }> = {
  builder: { src: '/icons/house/mason-builder.png', name: 'Stavbyvedoucí' },
  limeBurner: { src: '/icons/house/mason-limeburner.png', name: 'Vápeník' },
  stonemason: { src: '/icons/house/mason-stonemason.png', name: 'Kameník' },
  mason: { src: '/icons/house/mason-mason.png', name: 'Zedník' },
  plasterer: { src: '/icons/house/mason-plasterer.png', name: 'Štukatér' },
};

/**
 * Kostel a staveniště kostela (churches.md – Stavba, Co kostel dává): u staveniště postup po
 * druzích práce (ikona a %) a stojí-li, ikona chybějícího mistra červeně; vždy kapacita lodí
 * a hroby na hřbitůvku, u dostavěného kostela kněz. Rozestavěný kostel jde zrušit (panel).
 */
export function ChurchBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'church' }>;
}): ReactElement {
  const { site } = details;
  const missing = site?.blocked ? MASTER[site.blocked] : null;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      {site && (
        <div className={ROW} data-testid="selection-church-work">
          {CHURCH_WORK_LABELS.map(({ work, src, name }) => (
            <Stat key={work} src={src} name={name} testId={`selection-church-work-${work}`}>
              {Math.floor(site.work[work] * 100)} %
            </Stat>
          ))}
        </div>
      )}
      <div className={ROW}>
        {missing && (
          <Tooltip
            content={`Chybí mistr: ${missing.name} – práce jeho oboru stojí`}
            placement="above"
          >
            <span
              className="flex shrink-0 items-center gap-1 font-semibold text-red-400"
              data-testid="selection-church-blocked"
              tabIndex={0}
            >
              <img src={missing.src} alt="" width={20} height={20} />!
            </span>
          </Tooltip>
        )}
        <Stat icon="people" name="Vejde se lidí" testId="selection-church-capacity">
          {formatInteger(details.capacity)}
        </Stat>
        <Stat
          src="/icons/build/hrbitov.png"
          name="Hroby na hřbitůvku (obsazené / celkem)"
          testId="selection-church-graves"
        >
          {formatInteger(details.graves.used)} / {formatInteger(details.graves.total)}
        </Stat>
        {details.priest !== undefined && (
          <Stat
            src="/icons/house/priest.png"
            name={details.priest ? 'Kněz kostela' : 'Kostel nemá kněze'}
            alert={!details.priest}
            testId="selection-church-priest"
          >
            {details.priest ? 1 : 0}
          </Stat>
        )}
      </div>
    </div>
  );
}
