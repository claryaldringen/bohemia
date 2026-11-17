import { describe, expect, it } from 'vitest';
import { sacredHubOption } from '../village-view';
import type { BuildOption } from '../village-view-types';

/** Nabídka druhu posvátného místa – jako kostel z `churchOptions` (bez ceny předem). */
function option(blocked: string | null): BuildOption {
  return {
    laborManDays: 0,
    perHa: false,
    perSquare: false,
    upfront: [],
    blocked,
    affordable: blocked === null,
  };
}

const NO_BUILDER = 'Bez stavbyvedoucího huti se kostel stavět nedá.';

describe('rozcestník posvátných míst', () => {
  it('po křtu bez stavbyvedoucího: zašedlý s důvodem kostela', () => {
    const hub = sacredHubOption({
      'church-small': option(NO_BUILDER),
      'church-large': option(NO_BUILDER),
    });
    expect(hub.affordable).toBe(false);
    expect(hub.blocked).toBe(NO_BUILDER);
  });

  it('důvod dává nejlepší nabízený druh, který důvod má', () => {
    const hub = sacredHubOption({
      'church-large': option(null),
      'church-small': option('Malý kostel: chybí lom.'),
    });
    // velký kostel jde začít – rozcestník je dostupný a důvod nenese
    expect(hub.affordable).toBe(true);
    expect(hub.blocked).toBeNull();
  });

  it('nejde-li žádný druh jen pro suroviny, důvod zůstává prázdný', () => {
    const short: BuildOption = { ...option(null), affordable: false };
    const hub = sacredHubOption({ idol: short, shrine: short });
    expect(hub.affordable).toBe(false);
    expect(hub.blocked).toBeNull();
  });
});
