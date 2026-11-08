/**
 * Panely výběru opevnění (fortifications.md – Rozhraní): celé opevnění (dvojklik) s údaji
 * a vylepšeními, úsek mezi branami (klik) se zbořením a brána (klik jako na křižovatku).
 */
import { useState, type ReactElement } from 'react';
import type { FortKind, FortTop } from '@bohemia/game';
import type { SelectionDetails } from '@/lib/selection-details';
import type { FortDemolishOption, FortWorkOption } from '@/lib/fort-view';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { formatInteger, formatPercent } from '@/lib/village-format';
import { ROAD_KIND_NAMES } from '@/lib/village-view';
import { useRightDenied } from '../rights';
import { Tooltip } from '../Tooltip';
import { Bar, Commands, ROW, Stat, TargetButton } from './parts';
import { ROAD_KIND_ICONS } from './roads';

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

/** Název brány podle druhu opevnění (portrét panelu brány). */
export const FORT_GATE_NAMES: Record<FortKind, string> = {
  fence: 'Brána plotu',
  palisade: 'Brána palisády',
  rampart: 'Brána valu',
};

/** Ikona brány (portrét panelu brány, tlačítko Přidat bránu). */
export const FORT_GATE_ICON = '/icons/house/gate.svg';

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

/** Tlačítko Přidat bránu – další klik na obvod přidá bránu (fortifications.md – Brány). */
function GateButton({
  fortificationId,
  gateMode,
  onGateMode,
  denied,
}: {
  fortificationId: number;
  gateMode: boolean;
  onGateMode: ((fortificationId: number | null) => void) | undefined;
  denied: string | null;
}): ReactElement {
  return (
    <CommandButton
      testId="fort-gate"
      name="Přidat bránu – klik na obvod"
      icon={FORT_GATE_ICON}
      pressed={gateMode}
      disabled={!onGateMode}
      busy={false}
      denied={denied}
      onClick={() => onGateMode?.(gateMode ? null : fortificationId)}
    />
  );
}

/** Průběh stavby nebo bourání na opevnění. */
function WorkBar({
  progress,
  work,
}: {
  progress: number | undefined;
  work: string | undefined;
}): ReactElement | null {
  if (progress === undefined) return null;
  return (
    <Bar
      value={progress}
      name={work === 'demolish' || work === 'level' ? 'Bourání' : 'Stavba'}
      testId="selection-fort-progress"
    />
  );
}

/**
 * Celé opevnění včetně bran (dvojklik – Martin 8. 11. 2026): délka obvodu, stav nejslabšího
 * úseku, brány, útočiště, průběh stavby a vylepšení celého opevnění (násobek obrany zrušen
 * 8. 11. 2026 – panel úseku ho nahradí ikonami postupů útočníka, Úloha 17 plánu hradeb).
 */
export function FortificationBody({
  details,
  gateMode = false,
  onWork,
  onGateMode,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification' }>;
  /** Hráč právě klikáním na obvod přidává bránu. */
  gateMode?: boolean;
  /** Zadá vylepšení (server action) – hotovo, až se vrátí. */
  onWork?: (fortificationId: number, work: 'upgrade' | 'top', top?: FortTop) => Promise<void>;
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
  const old = details.oldSegments > 0;
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
          <Stat src={FORT_GATE_ICON} name="Brány" testId="selection-fort-gates">
            {details.gates}
          </Stat>
        </div>
        <div className={ROW}>
          <Stat icon="people" name="Útočiště – lidé" testId="selection-fort-refuge-people">
            {formatInteger(details.refugePeople)}
          </Stat>
          <Stat icon="cow" name="Útočiště – dobytek" testId="selection-fort-refuge-cattle">
            {formatInteger(details.refugeCattle)}
          </Stat>
          <WorkBar progress={details.progress} work={details.work} />
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
        <GateButton
          fortificationId={details.id}
          gateMode={gateMode}
          onGateMode={onGateMode}
          denied={denied}
        />
      </Commands>
    </div>
  );
}

/**
 * Úsek opevnění mezi branami (klik – fortifications.md, Rozhraní – Úseky): délka hradby úseku,
 * díly (hotové / všechny), stav nejslabšího dílu (oranžově za životností), stáří nejstaršího,
 * průběh stavby a Zbořit úsek s prací a kládami zpět.
 */
export function FortSectionBody({
  details,
  gateMode = false,
  onDemolish,
  onGateMode,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification-section' }>;
  gateMode?: boolean;
  /** Zboří úsek s dílem `segment` (server action) – hotovo, až se vrátí. */
  onDemolish?: (fortificationId: number, segment: number) => Promise<void>;
  onGateMode?: (fortificationId: number | null) => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const denied = useRightDenied('build');
  const { section } = details;
  const demolish = (): void => {
    if (!onDemolish || busy) return;
    setBusy(true);
    void onDemolish(details.id, section.segments[0]!).finally(() => setBusy(false));
  };
  const old = section.oldParts > 0;
  const name = demolishName(details.fortKind, section.demolish.work);
  return (
    <div className="hud-split">
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <div className={ROW}>
          <Stat icon="walk" name="Délka úseku (m)" testId="selection-fort-section-length">
            {`${formatInteger(section.lengthM)} m`}
          </Stat>
          <Stat
            icon={FORT_ICONS[details.fortKind]}
            name="Díly úseku – hotové / všechny"
            testId="selection-fort-section-parts"
          >
            {section.builtParts === section.parts
              ? section.parts
              : `${section.builtParts}/${section.parts}`}
          </Stat>
          <Stat
            icon="condition"
            name={
              old ? 'Stav nejslabšího dílu – díly za životností' : 'Stav nejslabšího dílu úseku'
            }
            testId="selection-fort-section-state"
          >
            <span data-old={old || undefined} className={old ? OLD_COLOR : ''}>
              {formatPercent(section.weakest)}
            </span>
          </Stat>
          {section.ageYears !== null && (
            <Stat
              icon="date"
              name="Stáří nejstaršího dílu (roky)"
              testId="selection-fort-section-age"
            >
              {section.ageYears}
            </Stat>
          )}
        </div>
        <div className={ROW}>
          <WorkBar progress={details.progress} work={details.work} />
        </div>
      </div>
      <Commands row>
        <CommandButton
          testId="fort-demolish"
          name={name}
          icon="/icons/resources/demolish.svg"
          tooltip={<DemolishTooltip name={name} option={section.demolish} />}
          disabled={section.demolish.blocked !== null || busy || !onDemolish}
          busy={busy}
          denied={denied}
          onClick={demolish}
        />
        <GateButton
          fortificationId={details.id}
          gateMode={gateMode}
          onGateMode={onGateMode}
          denied={denied}
        />
      </Commands>
    </div>
  );
}

/**
 * Brána opevnění (klik jako na křižovatku – fortifications.md, Brány): stav a stáří dílu, ve
 * kterém stojí, a cesta, která jí vede (klik ji vybere). Druh brány je v portrétu. Zrušit bránu
 * zatím nejde.
 */
export function FortGateBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification-gate' }>;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  const { gate, road } = details;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat
          icon="condition"
          name={gate.old ? 'Stav dílu brány – za životností' : 'Stav dílu brány'}
          testId="selection-fort-gate-state"
        >
          <span data-old={gate.old || undefined} className={gate.old ? OLD_COLOR : ''}>
            {formatPercent(gate.state)}
          </span>
        </Stat>
        {gate.ageYears !== null && (
          <Stat icon="date" name="Stáří dílu brány (roky)" testId="selection-fort-gate-age">
            {gate.ageYears}
          </Stat>
        )}
        {road && (
          <TargetButton
            src={`/icons/build/${ROAD_KIND_ICONS[road.roadKind]}.png`}
            name={ROAD_KIND_NAMES[road.roadKind]}
            testId="selection-fort-gate-road"
            target={{ kind: 'road', id: road.id, segment: road.segment }}
            onSelectTarget={onSelectTarget}
          />
        )}
      </div>
    </div>
  );
}
