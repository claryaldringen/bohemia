/**
 * Panely výběru opevnění (fortifications.md – Rozhraní): celé opevnění (dvojklik) s údaji
 * a vylepšeními, úsek mezi branami (klik) se zbořením a brána (klik jako na křižovatku).
 */
import { useState, type ReactElement } from 'react';
import { type AssaultMethod, type FortKind, type GateLevel, type WallKind } from '@bohemia/game';
import type { SelectionDetails } from '@/lib/selection-details';
import {
  type FortAssaultIcon,
  type FortAssaultView,
  type FortDemolishOption,
  type FortOccupancyView,
  type FortUpgradeView,
  type FortWorkOption,
} from '@/lib/fort-view';
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
  walkway: 'Palisáda s ochozem',
  crib: 'Roštová hradba',
  chamber: 'Komorová hradba',
  rampart: 'Val s příkopem',
};

/**
 * Ikony druhů – celá cesta (portrét panelu, tlačítka Vylepšit, Postavit jinudy): plot, palisáda
 * a val render z Blenderu, vyšší stupně hradby vlastní kresba (CC0).
 */
export const FORT_ICON_SRC: Record<FortKind, string> = {
  fence: '/icons/resources/fort-fence.png',
  palisade: '/icons/resources/fort-palisade.png',
  walkway: '/icons/resources/fort-walkway.png',
  crib: '/icons/resources/fort-crib.png',
  chamber: '/icons/resources/fort-chamber.png',
  rampart: '/icons/resources/fort-rampart.png',
};

/** Název brány podle druhu opevnění (portrét panelu brány). */
export const FORT_GATE_NAMES: Record<FortKind, string> = {
  fence: 'Brána plotu',
  palisade: 'Brána palisády',
  walkway: 'Brána palisády',
  crib: 'Brána hradby',
  chamber: 'Brána hradby',
  rampart: 'Brána valu',
};

/** Ikona brány (portrét panelu brány, tlačítko Přidat bránu). */
export const FORT_GATE_ICON = '/icons/resources/fort-gate.png';

/** Cílová hradba v nabídce Vylepšit (popisek tlačítka). */
const UPGRADE_NAMES: Record<WallKind, string> = {
  fence: 'Vylepšit na polský plot',
  palisade: 'Vylepšit na palisádu',
  walkway: 'Vylepšit na palisádu s ochozem',
  crib: 'Vylepšit na roštovou hradbu',
  chamber: 'Vylepšit na komorovou hradbu',
};

/**
 * Akce tlačítek panelu opevnění (fortifications.md – Hradby a obrana, Rozhraní a scéna):
 * vylepšit úsek či vše, doplnit val, napustit příkop, vylepšit bránu.
 */
export type FortAction =
  | { kind: 'upgrade'; target: WallKind }
  | { kind: 'rampart' }
  | { kind: 'moat' }
  | { kind: 'gate'; level: GateLevel }
  /** Opustit (`abandoned` true) nebo Vrátit bránu (demolition.md – Rozhodnutí). */
  | { kind: 'gate-abandon'; abandoned: boolean }
  /** Zbořit bránu – zbyde mezera (demolition.md – Rozhodnutí). */
  | { kind: 'gate-demolish' };

/** Zadá akci nad opevněním `fortificationId` u dílu `segment` (null – celé opevnění). */
export type FortActionHandler = (
  fortificationId: number,
  segment: number | null,
  action: FortAction,
) => Promise<void>;

/** Ikony postupů útočníka (žebřík, sekera, oheň, rýč – vlastní kresba CC0). */
const ASSAULT_SRC: Record<FortAssaultIcon, string> = {
  ladder: '/icons/resources/assault-ladder.png',
  cut: '/icons/resources/assault-axe.png',
  burn: '/icons/resources/assault-fire.png',
  dig: '/icons/resources/assault-spade.png',
};

/** Název postupu jádra v popisku. */
const ASSAULT_NAMES: Record<AssaultMethod, string> = {
  open: 'Mezera',
  climb: 'Přelézt plot',
  ladder: 'Žebříky',
  cut: 'Prosekat',
  burn: 'Vypálit',
  dig: 'Odkopat',
  mine: 'Podkopat',
};

/** Název ikony postupu, který tu nejde (zašedlá ikona). */
const ASSAULT_ICON_NAMES: Record<FortAssaultIcon, string> = {
  ladder: 'Žebříky',
  cut: 'Prosekat',
  burn: 'Vypálit',
  dig: 'Odkopat či podkopat',
};

/** Herní hodiny jako „5 h“, od 24 h „1 d 3 h“ (nahoru na celé hodiny). */
export function formatAssaultHours(hours: number): string {
  const h = Math.ceil(hours - 1e-9);
  if (h < 24) return `${h} h`;
  const rest = h % 24;
  return rest === 0 ? `${h / 24} d` : `${Math.floor(h / 24)} d ${rest} h`;
}

/**
 * Ikony postupů útočníka s časem se 4 muži (fortifications.md – Rozhraní a scéna); postup, který
 * tu nejde, zašedlý.
 */
function AssaultStats({ assault }: { assault: readonly FortAssaultView[] }): ReactElement {
  return (
    <>
      {assault.map((a) => {
        const blocked = a.hours4 === null || a.method === null;
        const name = blocked
          ? `${ASSAULT_ICON_NAMES[a.icon]} – tu nejde`
          : `${ASSAULT_NAMES[a.method!]} – ${formatAssaultHours(a.hours4!)} se 4 muži`;
        return (
          <Tooltip key={a.icon} content={name} placement="above">
            <span
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap ${blocked ? 'opacity-40 grayscale' : ''}`}
              tabIndex={0}
              data-testid={`selection-fort-assault-${a.icon}`}
              data-blocked={blocked || undefined}
            >
              <img src={ASSAULT_SRC[a.icon]} alt="" width={20} height={20} />
              <span className="text-sm font-semibold tabular-nums">
                {blocked ? '–' : formatAssaultHours(a.hours4!)}
              </span>
            </span>
          </Tooltip>
        );
      })}
    </>
  );
}

/** Obsazení hradby – muži vsi na délku obvodu (podíl obsazených 5 m ochozu). */
function OccupancyStat({ occupancy }: { occupancy: FortOccupancyView }): ReactElement {
  return (
    <Stat
      src="/icons/resources/fort-occupancy.png"
      name={`Obsazení hradby – ${formatInteger(occupancy.men)} mužů na ${formatInteger(occupancy.lengthM)} m`}
      testId="selection-fort-occupancy"
      alert={occupancy.share < 1}
    >
      {formatPercent(occupancy.share)}
    </Stat>
  );
}

/** Barva úseků za životností (oranžově – fortifications.md – Rozhraní). */
const OLD_COLOR = 'text-[#ffb15c]';

/** Popisek tlačítka vylepšení: název, cena (práce a klády) a důvod, proč nejde (červeně). */
function WorkTooltip({ name, option }: { name: string; option: FortWorkOption }): ReactElement {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{name}</span>
      {(option.cost.laborManDays > 0 || option.cost.logs > 0) && (
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
          {(option.cost.stoneM3 ?? 0) > 0 && (
            <span className="flex items-center gap-1" data-testid="fort-stone">
              <img src="/icons/resources/stone.png" alt="" width={16} height={16} />
              {formatInteger(option.cost.stoneM3!)}
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

/**
 * Tlačítka akcí úseku či celého opevnění (fortifications.md – Hradby a obrana, Rozhraní a scéna):
 * první řádek nabídka Vylepšit (vyšší stupně, zašedlé s důvodem), druhý Doplnit val, Napustit
 * příkop a další tlačítka panelu (`children` – Zbořit, Přidat bránu).
 */
function FortActionCommands({
  all,
  upgrades,
  rampartAdd,
  moat,
  busy,
  denied,
  onRun,
  children,
}: {
  /** Celé opevnění („Vylepšit vše“) – jiné popisky a `data-testid`. */
  all: boolean;
  upgrades: readonly FortUpgradeView[];
  rampartAdd: FortWorkOption | null;
  moat?: FortWorkOption | null;
  busy: boolean;
  denied: string | null;
  /** Zadá akci; chybí – tlačítka zašedlá (náhled bez serveru). */
  onRun: ((action: FortAction) => void) | undefined;
  children: ReactElement | ReactElement[];
}): ReactElement {
  const prefix = all ? 'fort-upgrade-all' : 'fort-upgrade';
  return (
    <Commands>
      {upgrades.length > 0 && (
        <div className="flex gap-1.5">
          {upgrades.map(({ target, option }) => {
            const name = all
              ? UPGRADE_NAMES[target].replace('Vylepšit', 'Vylepšit vše')
              : UPGRADE_NAMES[target];
            return (
              <CommandButton
                key={target}
                testId={`${prefix}-${target}`}
                name={name}
                icon={FORT_ICON_SRC[target]}
                option={option}
                disabled={option.blocked !== null || busy || !onRun}
                busy={busy}
                denied={denied}
                onClick={() => onRun?.({ kind: 'upgrade', target })}
              />
            );
          })}
        </div>
      )}
      <div className="flex gap-1.5">
        {rampartAdd && (
          <CommandButton
            testId="fort-rampart-add"
            name={all ? 'Doplnit val s příkopem pod celé opevnění' : 'Doplnit val s příkopem'}
            icon="/icons/resources/fort-rampart-add.png"
            option={rampartAdd}
            disabled={rampartAdd.blocked !== null || busy || !onRun}
            busy={busy}
            denied={denied}
            onClick={() => onRun?.({ kind: 'rampart' })}
          />
        )}
        {moat && (
          <CommandButton
            testId="fort-moat"
            name="Napustit příkop"
            icon="/icons/resources/fort-moat.png"
            option={moat}
            disabled={moat.blocked !== null || busy || !onRun}
            busy={busy}
            denied={denied}
            onClick={() => onRun?.({ kind: 'moat' })}
          />
        )}
        {children}
      </div>
    </Commands>
  );
}

/** Stav tlačítek akcí panelu – zadá akci a do návratu serveru tlačítka zašedí. */
function useFortAction(
  fortificationId: number,
  onAction: FortActionHandler | undefined,
): { busy: boolean; run: ((segment: number | null, action: FortAction) => void) | undefined } {
  const [busy, setBusy] = useState(false);
  if (!onAction) return { busy, run: undefined };
  return {
    busy,
    run: (segment, action) => {
      if (busy) return;
      setBusy(true);
      void onAction(fortificationId, segment, action).finally(() => setBusy(false));
    },
  };
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
  onAction,
  onGateMode,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification' }>;
  /** Hráč právě klikáním na obvod přidává bránu. */
  gateMode?: boolean;
  /** Zadá „Vylepšit vše“ či val pod celé opevnění (server action) – hotovo, až se vrátí. */
  onAction?: FortActionHandler;
  /** Zapne / vypne přidávání brány kliknutím na obvod. */
  onGateMode?: (fortificationId: number | null) => void;
}): ReactElement {
  const { busy, run } = useFortAction(details.id, onAction);
  const denied = useRightDenied('build');
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
          <OccupancyStat occupancy={details.occupancy} />
          <WorkBar progress={details.progress} work={details.work} />
        </div>
      </div>
      <FortActionCommands
        all
        upgrades={details.upgrades}
        rampartAdd={details.rampartAdd}
        busy={busy}
        denied={denied}
        onRun={run && ((action) => run(null, action))}
      >
        <GateButton
          fortificationId={details.id}
          gateMode={gateMode}
          onGateMode={onGateMode}
          denied={denied}
        />
      </FortActionCommands>
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
  onAction,
  onGateMode,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification-section' }>;
  gateMode?: boolean;
  /** Zboří úsek s dílem `segment` (server action) – hotovo, až se vrátí. */
  onDemolish?: (fortificationId: number, segment: number) => Promise<void>;
  /** Vylepšit úsek, doplnit val, napustit příkop (server action) – hotovo, až se vrátí. */
  onAction?: FortActionHandler;
  onGateMode?: (fortificationId: number | null) => void;
}): ReactElement {
  const [demolishing, setDemolishing] = useState(false);
  const { busy: acting, run } = useFortAction(details.id, onAction);
  const busy = demolishing || acting;
  const denied = useRightDenied('build');
  const { section } = details;
  const segment = section.segments[0]!;
  const demolish = (): void => {
    if (!onDemolish || busy) return;
    setDemolishing(true);
    void onDemolish(details.id, segment).finally(() => setDemolishing(false));
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
            src={FORT_ICON_SRC[details.fortKind]}
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
          <AssaultStats assault={section.assault} />
          <OccupancyStat occupancy={details.occupancy} />
        </div>
        <div className={ROW}>
          <WorkBar progress={details.progress} work={details.work} />
        </div>
      </div>
      <FortActionCommands
        all={false}
        upgrades={section.upgrades}
        rampartAdd={section.rampartAdd}
        moat={section.moat}
        busy={busy}
        denied={denied}
        onRun={run && ((action) => run(segment, action))}
      >
        <CommandButton
          testId="fort-demolish"
          name={name}
          icon="/icons/resources/demolish.png"
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
      </FortActionCommands>
    </div>
  );
}

/** Ikony Opustit a Vrátit jako u staveb (`StructureUseButtons`), Zbořit jako u úseku. */
const GATE_ABANDON_ICON = '/icons/resources/abandon-structure.png';
const GATE_RESTORE_ICON = '/icons/resources/restore.png';

/**
 * Brána opevnění (klik jako na křižovatku – fortifications.md, Brány): stav a stáří dílu, ve
 * kterém stojí, a cesta, která jí vede (klik ji vybere). Druh brány je v portrétu. Příkazy:
 * klešťová brána, věž, Opustit / Vrátit a Zbořit (demolition.md – Rozhodnutí, Martin 14. 11.
 * 2026) – zbořená i shnilá opuštěná brána nechá mezeru, kterou hráč zastaví běžnou stavbou
 * opevnění od brány k bráně.
 */
export function FortGateBody({
  details,
  onSelectTarget,
  onAction,
}: {
  details: Extract<SelectionDetails, { kind: 'fortification-gate' }>;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
  /** Klešťová brána či věž, Opustit / Vrátit a Zbořit (server action) – hotovo, až se vrátí. */
  onAction?: FortActionHandler;
}): ReactElement {
  const { gate, road } = details;
  const denied = useRightDenied('build');
  const { busy, run } = useFortAction(details.id, onAction);
  const levels = (
    [
      ['pincer', gate.pincer, 'Klešťová brána', '/icons/resources/gate-pincer.png'],
      ['tower', gate.tower, 'Věž nad branou', '/icons/resources/gate-tower.png'],
    ] as const
  ).filter((x) => x[1] !== null);
  const abandonName = gate.abandoned
    ? 'Vrátit bránu – zase se bude udržovat'
    : 'Opustit bránu – přestane se udržovat a rozpadne se na mezeru';
  const demolishName = 'Zbořit bránu';
  const body = (
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
        {gate.assault.length > 0 && <AssaultStats assault={gate.assault} />}
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
  return (
    <div className="hud-split">
      {body}
      <Commands row>
        {levels.map(([level, option, name, icon]) => (
          <CommandButton
            key={level}
            testId={`fort-gate-${level}`}
            name={name}
            icon={icon}
            option={option!}
            disabled={option!.blocked !== null || busy || !run}
            busy={busy}
            denied={denied}
            onClick={() => run?.(gate.segment, { kind: 'gate', level })}
          />
        ))}
        <CommandButton
          testId={gate.abandoned ? 'fort-gate-restore' : 'fort-gate-abandon'}
          name={abandonName}
          icon={gate.abandoned ? GATE_RESTORE_ICON : GATE_ABANDON_ICON}
          tooltip={
            <span className="flex flex-col gap-0.5">
              <span>{abandonName}</span>
              {gate.abandonBlocked && (
                <span data-testid="fort-blocked" className="font-semibold text-red-400">
                  {gate.abandonBlocked}
                </span>
              )}
            </span>
          }
          disabled={gate.abandonBlocked !== null || busy || !run}
          busy={busy}
          denied={denied}
          onClick={() => run?.(gate.segment, { kind: 'gate-abandon', abandoned: !gate.abandoned })}
        />
        <CommandButton
          testId="fort-gate-demolish"
          name={demolishName}
          icon="/icons/resources/demolish.png"
          tooltip={<DemolishTooltip name={demolishName} option={gate.demolish} />}
          disabled={gate.demolish.blocked !== null || busy || !run}
          busy={busy}
          denied={denied}
          onClick={() => run?.(gate.segment, { kind: 'gate-demolish' })}
        />
      </Commands>
    </div>
  );
}
