/** Panel prvku prémiové krajiny – co místo dává hned a co později (jen ikony a popisky). */
import { type ReactElement } from 'react';
import type { SelectionDetails } from '@/lib/selection-details';
import { PREMIUM_TEXTS, premiumLaterTip, premiumNowTip } from '@/lib/premium-view';
import { Tooltip } from '../Tooltip';
import { ROW } from './parts';

/** Ikona s popiskem; bez účinku zašedlá (jako prázdný stupeň zvěře). */
function Effect({
  icon,
  tip,
  active,
  testId,
}: {
  icon: string;
  tip: string;
  active: boolean;
  testId: string;
}): ReactElement {
  return (
    <Tooltip content={tip} placement="above">
      <span data-testid={testId} data-active={active ? 'true' : undefined} tabIndex={0}>
        <img
          src={`/icons/resources/${icon}.png`}
          alt=""
          width={28}
          height={28}
          className={active ? '' : 'opacity-25 grayscale'}
        />
      </span>
    </Tooltip>
  );
}

/**
 * Panel prvku: „hned“ (slunce – dnes) a „později“ (přesýpací hodiny), texty jen v popiscích; co
 * zatím nic nedává, je zašedlé (premium-landscapes.md – Co hráč vidí).
 */
export function PremiumSiteBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'premium-site' }>;
}): ReactElement {
  const texts = PREMIUM_TEXTS[details.type];
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW} data-testid="premium-site-effects">
        <Effect
          icon="date"
          tip={premiumNowTip(details.type)}
          active={texts.now !== null}
          testId="premium-now"
        />
        <Effect
          icon="hourglass"
          tip={premiumLaterTip(details.type)}
          active={texts.later !== null}
          testId="premium-later"
        />
      </div>
    </div>
  );
}
