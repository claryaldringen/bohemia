/** Panel výběru opevnění (fortifications.md – Rozhraní): údaje a vylepšení, brána kliknutím na obvod. */
import { useState, type ReactElement } from 'react';
import type { FortKind, FortTop } from '@bohemia/game';
import type { SelectionDetails } from '@/lib/selection-details';
import type { FortDemolishOption, FortWorkOption } from '@/lib/fort-view';
import { formatDecimal, formatInteger, formatPercent } from '@/lib/village-format';
import { useRightDenied } from '../rights';
import { Tooltip } from '../Tooltip';
import { Bar, Commands, ROW, Stat } from './parts';

/** Názvy druhů opevnění (portrét, popisky). */
export const FORT_NAMES: Record<FortKind, string> = {
  fence: 'Polský plot',
  palisade: 'Palisáda',
  rampart: 'Val s příkopem',
};

/** Ikony druhů (`/icons/resources/<ikona>.png`) – portrét panelu, rozcestník a tlačítka. */
export const FORT_ICONS: Record<FortKind, string> = {
  fence: 'fort-fence',
  palisade: 'fort-palisade',
  rampart: 'fort-rampart',
};

/** Název nástavby na valu (popisek tlačítka). */
const TOP_NAMES: Record<FortTop, string> = {
  fence: 'Postavit na valu plot',
  palisade: 'Postavit na valu palisádu',
};

/** Barva úseků za životností (oranžově – fortifications.md – Rozhraní). */
const OLD_COLOR = 'text-[#ffb15c]';

/** Popisek tlačítka vylepšení: název, cena (práce a klády) a důvod, proč nejde (červeně). */
function WorkTooltip({ name, option }: { name: string; option: FortWorkOption }): ReactElement {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{name}</span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className="flex items-center gap-1">
          <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
          {formatInteger(option.cost.laborManDays)}
        </span>
        {option.cost.logs > 0 && (
          <span className="flex items-center gap-1">
            <img src="/icons/resources/wood.png" alt="" width={16} height={16} />
            {formatInteger(option.cost.logs)}
          </span>
        )}
      </span>
      {option.blocked && (
        <span data-testid="fort-blocked" className="font-semibold text-red-400">
          {option.blocked}
        </span>
      )}
    </span>
  );
}

/** Název zboření v popisku: plot či palisáda, nástavba valu, nebo srovnání valu. */
function demolishName(fortKind: FortKind, work: FortDemolishOption['work']): string {
  if (work === 'level') return 'Srovnat val úseku';
  return fortKind === 'rampart' ? 'Zbořit nástavbu úseku' : 'Zbořit úsek';
}

/**
 * Popisek Zbořit (demolition.md – Opevnění): název, práce a klády zpět na hromadu (bez klád nic)
 * a důvod, proč nejde (červeně) – u důvodu bez čísel.
 */
function DemolishTooltip({
  name,
  option,
}: {
  name: string;
  option: FortDemolishOption;
}): ReactElement {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{name}</span>
      {option.blocked === null && (
        <span className="flex items-center gap-2 tabular-nums">
          <span className="flex items-center gap-1">
            <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
            {formatInteger(option.cost.laborManDays)}
          </span>
          {option.cost.logs > 0 && (
            <span className="flex items-center gap-1" data-testid="fort-demolish-logs">
              <img src="/icons/resources/wood.png" alt="" width={16} height={16} />
              {`+${formatInteger(option.cost.logs)}`}
            </span>
          )}
        </span>
      )}
      {option.blocked && (
        <span data-testid="fort-blocked" className="font-semibold text-red-400">
          {option.blocked}
        </span>
      )}
    </span>
  );
}

/** Čtvercové tlačítko příkazu panelu s ikonou (jako vylepšení cesty). */
function CommandButton({
  testId,
  name,
  icon,
  option,
  tooltip,
  pressed,
  disabled,
  onClick,
  busy,
  denied,
}: {
  testId: string;
  name: string;
  icon: string;
  option?: FortWorkOption;
  /** Vlastní obsah popisku (jinak název, s `option` cena a důvod). */
  tooltip?: ReactElement;
  pressed?: boolean;
  disabled: boolean;
  onClick: () => void;
  busy: boolean;
  denied: string | null;
}): ReactElement {
  return (
    <Tooltip
      denied={denied}
      placement="above"
      content={tooltip ?? (option ? <WorkTooltip name={name} option={option} /> : name)}
    >
      <button
        type="button"
        data-testid={testId}
        aria-label={name}
        {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
        disabled={disabled || denied !== null}
        aria-busy={busy}
        onClick={onClick}
        className={`hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
      >
        <img src={icon} alt="" width={40} height={40} className="h-full w-full" />
      </button>
    </Tooltip>
  );
}

export function FortificationBody({
  details,
  gateMode = false,
  onWork,
  onDemolish,
  onGateMode,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification' }>;
  /** Hráč právě klikáním na obvod přidává bránu. */
  gateMode?: boolean;
  /** Zadá vylepšení (server action) – hotovo, až se vrátí. */
  onWork?: (fortificationId: number, work: 'upgrade' | 'top', top?: FortTop) => Promise<void>;
  /** Zboří úsek s dílem `segment` (server action) – hotovo, až se vrátí. */
  onDemolish?: (fortificationId: number, segment: number) => Promise<void>;
  /** Zapne / vypne přidávání brány kliknutím na obvod. */
  onGateMode?: (fortificationId: number | null) => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const denied = useRightDenied('build');
  const run = (work: 'upgrade' | 'top', top?: FortTop): void => {
    if (!onWork || busy) return;
    setBusy(true);
    void onWork(details.id, work, top).finally(() => setBusy(false));
  };
  const demolish = (): void => {
    if (!onDemolish || busy) return;
    setBusy(true);
    void onDemolish(details.id, details.segment).finally(() => setBusy(false));
  };
  const section = details.section;
  const old = details.oldSegments > 0;
  const building = details.progress !== undefined;
  return (
    <div className="hud-split">
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <div className={ROW}>
          <Stat icon="walk" name="Délka obvodu (m)" testId="selection-fort-length">
            {`${formatInteger(details.lengthM)} m`}
          </Stat>
          <Stat
            icon="condition"
            name={old ? 'Stav nejslabšího úseku – úseky za životností' : 'Stav nejslabšího úseku'}
            testId="selection-fort-state"
          >
            <span data-old={old || undefined} className={old ? OLD_COLOR : ''}>
              {formatPercent(details.weakest)}
            </span>
          </Stat>
          <Stat src="/icons/house/gate.svg" name="Brány" testId="selection-fort-gates">
            {details.gates}
          </Stat>
          <Stat
            src="/icons/house/shield.svg"
            name="Násobek obrany"
            testId="selection-fort-multiplier"
          >
            {formatDecimal(details.multiplier, 2)}
          </Stat>
        </div>
        <div className={ROW}>
          <Stat icon="people" name="Útočiště – lidé" testId="selection-fort-refuge-people">
            {formatInteger(details.refugePeople)}
          </Stat>
          <Stat icon="cow" name="Útočiště – dobytek" testId="selection-fort-refuge-cattle">
            {formatInteger(details.refugeCattle)}
          </Stat>
          {building && details.progress !== undefined && (
            <Bar
              value={details.progress}
              name={details.work === 'demolish' || details.work === 'level' ? 'Bourání' : 'Stavba'}
              testId="selection-fort-progress"
            />
          )}
        </div>
      </div>
      <Commands row>
        {details.upgrade && (
          <CommandButton
            testId="fort-upgrade"
            name="Vylepšit na palisádu"
            icon={`/icons/resources/${FORT_ICONS.palisade}.png`}
            option={details.upgrade}
            disabled={details.upgrade.blocked !== null || busy || !onWork}
            busy={busy}
            denied={denied}
            onClick={() => run('upgrade')}
          />
        )}
        {details.tops?.map(({ top, option }) => (
          <CommandButton
            key={top}
            testId={`fort-top-${top}`}
            name={TOP_NAMES[top]}
            icon={`/icons/resources/${FORT_ICONS[top]}.png`}
            option={option}
            disabled={option.blocked !== null || busy || !onWork}
            busy={busy}
            denied={denied}
            onClick={() => run('top', top)}
          />
        ))}
        {section && (
          <CommandButton
            testId="fort-demolish"
            name={demolishName(details.fortKind, section.demolish.work)}
            icon="/icons/resources/demolish.svg"
            tooltip={
              <DemolishTooltip
                name={demolishName(details.fortKind, section.demolish.work)}
                option={section.demolish}
              />
            }
            disabled={section.demolish.blocked !== null || busy || !onDemolish}
            busy={busy}
            denied={denied}
            onClick={demolish}
          />
        )}
        <CommandButton
          testId="fort-gate"
          name="Přidat bránu – klik na obvod"
          icon="/icons/house/gate.svg"
          pressed={gateMode}
          disabled={!onGateMode}
          busy={false}
          denied={denied}
          onClick={() => onGateMode?.(gateMode ? null : details.id)}
        />
      </Commands>
    </div>
  );
}
