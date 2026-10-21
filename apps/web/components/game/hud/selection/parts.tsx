/** Společné stavební prvky panelu výběru – portrét, řádky ikon s čísly, ukazatele, příkazy. */
import { type ReactElement, type ReactNode } from 'react';
import { CRAFT_NAMES, type DwellingType } from '@bohemia/game';
import { VillageTarget } from '@/lib/scene/village-picking';
import { formatDecimal, formatInteger, formatPercent } from '@/lib/village-format';
import { CRAFT_LOOKS, DWELLING_NAMES, type Craft } from '@/lib/village-view';
import { Tooltip } from '../Tooltip';

/** Portrét a název – název na jeden řádek, delší rozšíří sloupec portrétu. */
export function Portrait({ icon, name }: { icon: string; name: string }): ReactElement {
  return (
    <div className="flex min-w-20 shrink-0 flex-col items-center gap-1">
      <div className="hud-inset h-20 w-20 overflow-hidden rounded">
        <img
          src={`/icons/build/${icon}.png`}
          alt=""
          width={128}
          height={128}
          className="h-full w-full"
        />
      </div>
      <h2 className="text-center font-serif text-sm leading-tight whitespace-nowrap text-[#f3dfb0]">
        {name}
      </h2>
    </div>
  );
}

/**
 * Tlačítko s ikonou, které vybere jiný cíl ve vsi (dům, ohradu, díl pole, spřežení, vůz, člověka
 * u nich) – popisek je jeden název.
 */
export function TargetButton({
  src,
  name,
  testId,
  target,
  onSelectTarget,
}: {
  src: string;
  name: string;
  testId: string;
  target: VillageTarget;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <button
        type="button"
        data-testid={testId}
        aria-label={name}
        className="hud-icon-button h-7 w-7"
        onClick={() => onSelectTarget?.(target)}
      >
        <img src={src} alt="" width={128} height={128} className="h-full w-full" />
      </button>
    </Tooltip>
  );
}

export function Stat({
  icon,
  src,
  name,
  testId,
  alert = false,
  children,
}: {
  /** Ikona suroviny v `public/icons/resources/` bez přípony. */
  icon?: string;
  /** Jiná ikona – celá cesta (dub z `public/icons/build/`). */
  src?: string;
  name: string;
  testId?: string;
  /** Číslo červeně (něco chybí). */
  alert?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap" tabIndex={0}>
        <img src={src ?? `/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        <span
          data-testid={testId}
          {...(alert ? { 'data-alert': true } : {})}
          className={`text-sm font-semibold tabular-nums ${alert ? 'text-red-400' : ''}`}
        >
          {children}
        </span>
      </span>
    </Tooltip>
  );
}

export function Bar({
  value,
  name,
  testId,
}: {
  value: number;
  name: string;
  testId?: string;
}): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <Tooltip content={`${name} ${percent} %`} placement="above">
      <span
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid={testId}
        tabIndex={0}
        className="hud-bar block h-2.5 w-40"
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </Tooltip>
  );
}

/**
 * Stav stavby (abandonment.md – opuštěné stavby chátrají): ikona stavu s procenty a ikona
 * opuštěné stavby, když k ní nikdo nechodí a chátrá – bez textů navíc (jako v 0 A.D.).
 */
export function Wear({
  condition,
  abandoned,
  name = 'Stav',
}: {
  condition: number;
  abandoned: boolean;
  name?: string;
}): ReactElement {
  const low = condition < 0.45;
  return (
    <span className="flex items-center gap-2">
      <Stat icon="condition" name={name} testId="selection-wear">
        <span className={low ? 'text-red-400' : ''}>{formatPercent(condition)}</span>
      </Stat>
      {abandoned && (
        <Tooltip content="Opuštěno" placement="above">
          <img
            src="/icons/resources/abandoned.png"
            alt="Opuštěno"
            width={20}
            height={20}
            data-testid="selection-abandoned"
            tabIndex={0}
          />
        </Tooltip>
      )}
    </span>
  );
}

/**
 * Oprava stavby, ke které se zase chodí (abandonment.md – Oprava) – průběh jako stavba, bez
 * textů navíc.
 */
export function RepairBar({
  value,
  name = 'Oprava',
}: {
  value: number;
  name?: string;
}): ReactElement {
  return <Bar value={value} name={name} testId="selection-repair" />;
}

/** Portrét a název obydlí, nebo dílny řemesla. */
export function dwellingPortrait(type: DwellingType, craft: Craft | null): ReactElement {
  return craft ? (
    <Portrait icon={CRAFT_LOOKS[craft].icon} name={CRAFT_NAMES[craft]} />
  ) : (
    <Portrait icon={type} name={DWELLING_NAMES[type].nominative} />
  );
}

/** Řádek ikon s čísly – při nedostatku místa se zalomí po celých položkách, ne uvnitř textu. */
export const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-1';

/**
 * Příkazy vybraného objektu vpravo v panelu (jako v 0 A.D.), oddělené čarou od údajů – panel tak
 * roste do šířky, ne do výšky (`hud-split` a `hud-commands` v globals.css; na středně úzkém okně
 * jsou příkazy pod údaji). Rozbalené nabídky (růžice, obchod) se otevírají nad panelem.
 */
export function Commands({
  row = false,
  children,
}: {
  /** Tlačítka vedle sebe (cesta), jinak řádky tlačítek pod sebou. */
  row?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <div data-testid="selection-commands" data-row={row || undefined} className="hud-commands">
      {children}
    </div>
  );
}

/** Dřevo, které stavba ještě musí skácet (forest.md) – ikona a počet stromů. */
export function WoodToFell({ trees }: { trees: number }): ReactElement {
  return (
    <Stat icon="wood" name="Stromy ke skácení" testId="selection-wood">
      {trees}
    </Stat>
  );
}

/** Výměra dílu pole či čtverce sadu v m² – „225 m²“. */
export function formatM2(areaM2: number): string {
  return `${formatInteger(areaM2)} m²`;
}

/** Chůze z nejbližšího obydlí po pěšinách a cestách – ikona šlépějí a metry (paths.md). */
export function Walk({ meters }: { meters: number }): ReactElement {
  return (
    <Stat icon="walk" name="Cesta z domu" testId="selection-walk">
      {formatInteger(meters)} m
    </Stat>
  );
}

/** Ikona bez čísla s popiskem (pasou se stáda, čeká na obnovu…). */
export function Flag({
  icon,
  name,
  testId,
}: {
  icon: string;
  name: string;
  testId: string;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <img
        src={`/icons/resources/${icon}.png`}
        alt={name}
        width={20}
        height={20}
        data-testid={testId}
        tabIndex={0}
      />
    </Tooltip>
  );
}

/**
 * Kolik místo přidává štěstí (happiness.md) – ikona štěstí a „+N“; rozestavěná stavba přidá až
 * po dostavění (bledší).
 */
export function HappinessGain({
  value,
  pending = false,
}: {
  value: number;
  pending?: boolean;
}): ReactElement {
  return (
    <Stat
      icon="happiness"
      name={pending ? 'Štěstí po dostavění' : 'Štěstí'}
      testId="selection-happiness"
    >
      <span className={pending ? 'opacity-60' : ''}>+{value}</span>
    </Stat>
  );
}

/** Přírůstek rychlosti chůze (roads.md – Stromy u cesty zrychlí chůzi) – „+0,03“. */
export function formatSpeedGain(gain: number): string {
  return `+${String(Math.round(gain * 1000) / 1000).replace('.', ',')}`;
}

/** Seno v tunách s jedním desetinným místem – „3,0 t“. */
export function formatTons(kg: number): string {
  return `${formatDecimal(Math.max(0, kg) / 1000, 1)} t`;
}
