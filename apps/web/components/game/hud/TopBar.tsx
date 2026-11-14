'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  BAD_YEAR_KINDS,
  FORCED_DISASTER_KINDS,
  getWorldState,
  type BadYearKind,
  type ComputeProgress,
  type ForcedDisasterKind,
  type TimeSkip,
  type WorldClock,
} from '@bohemia/game';
import { useDismiss } from '@/hooks/use-dismiss';
import { useSkipProgress } from '@/hooks/use-skip-progress';
import { clockHandAngle, dateRefreshDelay, dayPartLabel, formatWorldState } from '@/lib/game-date';
import { dayHourAt } from '@/lib/scene/day-light';
import { MENU_HOTKEY } from '@/lib/game-menu';
import { PANEL_HOTKEYS } from '@/lib/panel-keys';
import { formatDecimal, formatInteger, formatPercent, plural } from '@/lib/village-format';
import type { VillageListItem } from '@/lib/village-list';
import type { VillageView } from '@/lib/village-view';
import { FaithCross } from './BaptizeButton';
import { Tooltip } from './Tooltip';
import { LordAwayBadge } from './LordAwayBadge';
import { VillageSwitcher } from './VillageSwitcher';

/**
 * Stav jídla pro barvu ikony nasycení: syto / hlad / velký hlad. Řídí ho energie (hlad –
 * diet.md: hladem se umírá z energie), ne nasycení – ves jen s obilím má nasycení ≈ 80 %
 * natrvalo, a přesto nehladoví.
 */
export function satiationState(
  view: Pick<VillageView, 'hungry' | 'starving'> & { diet: Pick<VillageView['diet'], 'energy'> },
): 'fed' | 'hungry' | 'starving' {
  if (view.starving || view.diet.energy < 0.6) return 'starving';
  if (view.hungry || view.diet.energy < 0.995) return 'hungry';
  return 'fed';
}

const SATIATION_GLOW: Record<ReturnType<typeof satiationState>, string> = {
  fed: 'drop-shadow(0 0 3px rgb(120 210 110 / 0.9))',
  hungry: 'drop-shadow(0 0 3px rgb(240 180 60 / 0.95))',
  starving: 'drop-shadow(0 0 4px rgb(235 70 50 / 1)) saturate(0.6)',
};

/** Popisek snopů v liště (production-chains.md – Humno): nevymlácené zrno. */
export function sheavesName(): string {
  return 'Snopy – nevymláceno (kg zrna)';
}

function Resource({
  icon,
  name,
  testId,
  children,
  filter,
  tooltipOff = false,
  iconNode,
}: {
  icon: string;
  /** Vlastní ikona (např. ciferník) místo obrázku. */
  iconNode?: ReactNode;
  /** Popisek – název, u nasycení i podíly stravy. */
  name: ReactNode;
  /** Popisek se neukáže (rozpis zásob je otevřený a číslo by překryl). */
  tooltipOff?: boolean;
  testId: string;
  children?: ReactNode;
  filter?: string;
}): ReactElement {
  return (
    <Tooltip content={name} off={tooltipOff}>
      <span data-hud-block className="flex h-8 items-center gap-1 px-1.5" tabIndex={0}>
        {iconNode ?? (
          <img
            src={`/icons/resources/${icon.includes('.') ? icon : `${icon}.png`}`}
            alt=""
            width={26}
            height={26}
            className="h-[26px] w-[26px]"
            style={filter ? { filter } : undefined}
          />
        )}
        {children !== undefined && (
          <span data-testid={testId} className="text-sm font-semibold tabular-nums">
            {children}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

/** Řádek rozpisu zásob v panelu u ikony lišty – ikona, popisek (v `Tooltip`) a číslo. */
export interface StockRow {
  key: string;
  icon: string;
  name: string;
  amount: number;
}

/** Rozpis zásob plodin (kg): obilí, luštěniny a jablka – snopy jsou mezistupeň zpracování, nepočítají se. */
export function grainStockRows(
  view: Pick<VillageView, 'storesKg' | 'legumesKg' | 'applesKg'>,
): StockRow[] {
  return [
    { key: 'grain', icon: 'food', name: 'Obilí (kg)', amount: view.storesKg },
    { key: 'legumes', icon: 'legumes', name: 'Luštěniny (kg)', amount: view.legumesKg },
    { key: 'apples', icon: 'apples', name: 'Jablka (kg)', amount: view.applesKg },
  ];
}

/** Součet kg plodin v zásobě (obilí, luštěniny, jablka) – číslo u ikony obilí v liště. */
export function grainStockTotal(
  view: Pick<VillageView, 'storesKg' | 'legumesKg' | 'applesKg'>,
): number {
  return grainStockRows(view).reduce((sum, row) => sum + row.amount, 0);
}

/** Rozpis domácích zvířat vsi podle druhů (skot, voli, ovce, kozy, prasata, koně), jen druhy, které ves má. */
export function livestockRows(view: Pick<VillageView, 'livestock' | 'horses'>): StockRow[] {
  const all: StockRow[] = [
    { key: 'cow', icon: 'cow', name: 'Skot', amount: view.livestock.herds.cow },
    { key: 'ox', icon: 'ox', name: 'Voli', amount: view.livestock.oxen },
    { key: 'sheep', icon: 'sheep', name: 'Ovce', amount: view.livestock.herds.sheep },
    { key: 'goat', icon: 'goat', name: 'Kozy', amount: view.livestock.herds.goat },
    { key: 'pig', icon: 'pig', name: 'Prasata', amount: view.livestock.herds.pig },
    { key: 'horse', icon: 'horse', name: 'Koně', amount: view.horses?.count ?? 0 },
  ];
  return all.filter((row) => row.amount > 0);
}

/** Součet kusů domácích zvířat vsi – číslo u ikony dobytka v liště. */
export function livestockTotal(view: Pick<VillageView, 'livestock' | 'horses'>): number {
  return livestockRows(view).reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Ikona zásob v liště s číslem celku; klik otevře u ní malý panel s rozpisem (ikony s čísly, slova
 * v popiscích), další klik, Esc nebo stisk mimo ho zavře – jako panel u data.
 */
export function StockBreakdown({
  icon,
  name,
  total,
  rows,
  testId,
}: {
  icon: string;
  name: string;
  total: number;
  rows: readonly StockRow[];
  /** Číslo celku má `testId`, tlačítko `<testId>-toggle`, panel `<testId>-panel`. */
  testId: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  return (
    <span ref={ref} className="relative flex items-center">
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        aria-label={name}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="cursor-pointer rounded hover:bg-white/5 aria-expanded:bg-white/10"
      >
        <Resource icon={icon} name={name} testId={testId} tooltipOff={open}>
          {formatInteger(total)}
        </Resource>
      </button>
      {open && (
        <span
          data-hud-block
          data-testid={`${testId}-panel`}
          className="hud-panel absolute top-full left-0 z-30 mt-1 flex w-max flex-col gap-0.5 p-1.5 text-sm whitespace-nowrap"
        >
          {rows.map((row) => (
            <span key={row.key} className="flex items-center gap-2 px-1">
              <img
                src={`/icons/resources/${row.icon}.png`}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] shrink-0"
              />
              <span className="text-[#bfa77a]">{row.name}</span>
              <span
                data-testid={`${testId}-${row.key}`}
                className="ml-auto min-w-10 pl-3 text-right font-semibold tabular-nums"
              >
                {formatInteger(row.amount)}
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Lidí ve vsi – děti, dospělí a starší. */
function villagePeople(view: Pick<VillageView, 'people'>): number {
  return view.people.children + view.people.adults + view.people.elders;
}

/** Je ve vsi víc lidí, než kolik uživí pole (fields.md – Co hráč vidí, Pole uživí)? */
export function fieldCapacityShort(view: Pick<VillageView, 'people' | 'fieldCapacity'>): boolean {
  const capacity = view.fieldCapacity;
  return !!capacity && villagePeople(view) > Math.round(capacity.people);
}

/**
 * Lidé v liště: „31“ a u vsi s poli „31 / ≈ 22“ – kolik lidí je a kolik jich uživí pole
 * (Martin 24. 10. 2026: počet lidí a kolik ves uživí v jedné ikoně).
 */
export function peopleLabel(view: Pick<VillageView, 'people' | 'fieldCapacity'>): string {
  const people = formatInteger(villagePeople(view));
  return view.fieldCapacity ? `${people} / ≈ ${formatInteger(view.fieldCapacity.people)}` : people;
}

/** Tooltip lidí: kolik jich je a kolik jich uživí pole (podrobnosti viz `FieldCapacityTooltip`). */
export function PeopleTooltip({ view }: { view: VillageView }): ReactElement {
  if (!view.fieldCapacity) return <span>Lidé</span>;
  return <FieldCapacityTooltip view={view} />;
}

/**
 * Tooltip pole uživí (fields.md – Co hráč vidí): kolik lidí uživí pole v ustáleném oběhu a kolik
 * jich ve vsi je (červeně, když je lidí víc), pod tím pole v oběhu a úrodnost.
 */
export function FieldCapacityTooltip({ view }: { view: VillageView }): ReactElement {
  const capacity = view.fieldCapacity;
  if (!capacity) return <span>Pole</span>;
  return (
    <span className="block" data-testid="field-capacity-tooltip">
      <span className="font-semibold">Pole uživí ≈ {formatInteger(capacity.people)} lidí</span>
      <span
        data-testid="field-capacity-people"
        className={`mt-0.5 flex items-center gap-1 tabular-nums ${fieldCapacityShort(view) ? 'font-semibold text-red-400' : 'text-[#bfa77a]'}`}
      >
        <img src="/icons/resources/people.png" alt="Lidé" width={16} height={16} />
        {villagePeople(view)}
      </span>
      <span className="mt-0.5 block text-[#bfa77a] tabular-nums">
        pole v oběhu {formatDecimal(capacity.rotationHa, 1)} ha · úrodnost{' '}
        {formatInteger(capacity.fertility)}
      </span>
      <span
        data-testid="field-capacity-soil"
        className="mt-0.5 flex items-center gap-1 text-[#bfa77a] tabular-nums"
      >
        <img src="/icons/resources/fields.png" alt="Půda" width={16} height={16} />
        {Math.floor(capacity.soil * 100)} %
      </span>
    </span>
  );
}

/** Zdroje stravy v tooltipu nasycení – ikona, název a podíl na energii (diet.md). */
const DIET_SOURCES: readonly {
  key: keyof VillageView['diet']['shares'];
  icon: string;
  name: string;
}[] = [
  { key: 'grain', icon: 'food', name: 'Obilí' },
  { key: 'legumes', icon: 'legumes', name: 'Luštěniny' },
  { key: 'meat', icon: 'meat', name: 'Maso' },
  { key: 'dairy', icon: 'cheese', name: 'Mléko a sýr' },
  { key: 'eggs', icon: 'eggs', name: 'Vejce' },
  { key: 'fruit', icon: 'apples', name: 'Ovoce' },
];

/**
 * Popisek volné práce (lord.md – Co hráč vidí): u cvičící vojvodovy rodiny řádek s ikonou dvorce
 * a číslem – kolik jich cvičí, při hladu a osevu kolik je jich na poli.
 */
export function LaborTooltip({
  lord,
}: {
  lord: { training: number; field: number; household: number } | null | undefined;
}): ReactElement {
  const family = lord && lord.training + lord.field + lord.household > 0;
  return (
    <span className="flex flex-col gap-0.5">
      <span>Volná práce</span>
      {family && (
        <span data-testid="village-labor-lord" className="flex items-center gap-1 tabular-nums">
          <img src="/icons/resources/manor.png" alt="" width={16} height={16} />
          Vojvodova rodina:{' '}
          {[
            lord.training > 0 ? `${lord.training} cvičí` : null,
            lord.field > 0 ? `${lord.field} na poli` : null,
          ]
            .filter((t) => t !== null)
            .join(', ') || `${lord.household} vede domácnost`}
        </span>
      )}
    </span>
  );
}

/**
 * Tooltip nasycení (diet.md – Co hráč vidí): nasycení, pokrytí energie a bílkovin a podíly obilí,
 * luštěnin, masa, mléka a sýra, vajec a ovoce na energii (ikony a procenta; jídlo uložené před
 * luštěninami je nemá – 0).
 */
export function SatiationTooltip({ view }: { view: VillageView }): ReactElement {
  return (
    <span className="block" data-testid="satiation-tooltip">
      <span className="font-semibold">Nasycení {formatPercent(view.satiation)}</span>
      <span className="mt-0.5 block text-[#bfa77a] tabular-nums">
        energie {formatPercent(view.diet.energy)} · bílkoviny {formatPercent(view.diet.protein)}
      </span>
      <span className="mt-0.5 flex items-center gap-2">
        {DIET_SOURCES.map(({ key, icon, name }) => (
          <span key={key} data-share={key} className="flex items-center gap-0.5 tabular-nums">
            <img src={`/icons/resources/${icon}.png`} alt={name} width={16} height={16} />
            {formatPercent(view.diet.shares[key] ?? 0)}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Popisek štěstí (happiness.md; christianity.md – Štěstí): pod názvem podíl křesťanů (kříž víry)
 * a nespokojenost pohanů se zničenými posvátnými místy (háj) – každý řádek jen, když je nad nulou.
 */
export function HappinessTooltip({
  happiness,
}: {
  happiness: Pick<VillageView['happiness'], 'christianShare' | 'desecration'>;
}): ReactElement {
  const christians = happiness.christianShare ?? 0;
  const desecration = Math.round(happiness.desecration ?? 0);
  return (
    <span className="flex flex-col gap-0.5" data-testid="happiness-tooltip">
      <span>Štěstí</span>
      {christians > 0 && (
        <span data-testid="happiness-christians" className="flex items-center gap-1 tabular-nums">
          <FaithCross size={16} className="h-4 w-4" />
          Křesťané {formatPercent(christians)}
        </span>
      )}
      {desecration > 0 && (
        <span data-testid="happiness-desecration" className="flex items-center gap-1 tabular-nums">
          <img src="/icons/build/haj.png" alt="" width={16} height={16} className="h-4 w-4" />
          Pohané – zničená posvátná místa −{desecration}
        </span>
      )}
    </span>
  );
}

/** Mléko a sýr v horní liště – když je sýr v zásobě nebo se dojí (diet.md – Mléko a sýr). */
export function showsDairy(view: Pick<VillageView, 'cheeseKg' | 'milkLPerDay'>): boolean {
  return view.cheeseKg >= 1 || view.milkLPerDay > 0;
}

/** Popisek mléka a sýra: zásoba v kg, v době dojení i mléko za den. */
export function dairyName(view: Pick<VillageView, 'milkLPerDay'>): string {
  const milk = Math.round(view.milkLPerDay);
  return milk > 0 ? `Sýr (kg) – mléko ${formatInteger(milk)} l/den` : 'Sýr (kg)';
}

/** Seno v horní liště – když ves má hotovou ohradu nebo seno v zásobě (oxen.md). */
export function showsHay(view: Pick<VillageView, 'hayKg' | 'pens'>): boolean {
  return Math.round(view.hayKg) > 0 || view.pens.some((pen) => pen.built);
}

/**
 * Zásoba výrobků řemeslníků v liště – jen hřivny v kg (crafts.md; Martin 20. 10. 2026: „V liště
 * jenom hřivny“). Uhlí ukazuje panel uhlíře, vozy ohrada s voly a tesař, nástroje panel kovárny;
 * keramiku a dřevěné nářadí si řeší každá domácnost sama a nikde se neukazují (Martin
 * 24. 10. 2026).
 */
function CraftStocks({ crafts }: { crafts: VillageView['crafts'] }): ReactElement {
  return (
    <Resource icon="iron-bars" name="Hřivny (kg)" testId="village-iron-bars">
      {formatInteger(crafts.stocks.ironBarsKg ?? 0)}
    </Resource>
  );
}

function HotkeyTip({ name, hotkey }: { name: string; hotkey: string }): ReactElement {
  return (
    <span className="whitespace-nowrap">
      {name} <span className="text-[#bfa77a]">[{hotkey}]</span>
    </span>
  );
}

function IconButton({
  label,
  tooltip,
  pressed,
  expanded,
  keyshortcuts,
  disabled,
  busy,
  testId,
  onClick,
  children,
}: {
  label: string;
  tooltip: ReactNode;
  pressed?: boolean;
  /** Tlačítko otevírá panel (nabídka) – je otevřený? */
  expanded?: boolean;
  keyshortcuts?: string;
  disabled?: boolean;
  /** Akce tlačítka právě běží (čeká se na server). */
  busy?: boolean;
  testId?: string;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    // otevřená nabídka leží pod tlačítkem – popisek (zůstává i po kliknutí, dokud má tlačítko
    // fokus) by ji zakryl
    <Tooltip content={tooltip} placement="below-left" off={expanded === true}>
      <button
        type="button"
        data-hud-block
        data-testid={testId}
        aria-label={label}
        aria-pressed={pressed}
        aria-haspopup={expanded === undefined ? undefined : 'dialog'}
        aria-expanded={expanded}
        aria-keyshortcuts={keyshortcuts}
        aria-busy={busy}
        disabled={disabled}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded text-[#d8c39a] hover:bg-white/5 hover:text-[#ffe9b8] focus-visible:outline-2 focus-visible:outline-[#f3cf86] disabled:cursor-wait disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#d8c39a] aria-busy:animate-pulse aria-expanded:bg-white/10 aria-expanded:text-[#ffe9b8]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Přeskoky času v liště: popisek a ikona (▶ měsíc, ⏩ rok, ⏭ 10 let). */
const TIME_SKIP_BUTTONS: readonly { skip: TimeSkip; label: string; icon: string }[] = [
  { skip: 'month', label: '+1 měsíc', icon: 'M8 5.5v13l10-6.5z' },
  { skip: 'year', label: '+1 rok', icon: 'M3.5 6v12l8.5-6zM12 6v12l8.5-6z' },
  { skip: 'decade', label: '+10 let', icon: 'M2.5 6v12l7.5-6zM10 6v12l7.5-6zM18.5 6h2.5v12h-2.5z' },
];

/** Popisek tlačítek skoku během přepočtu – procenta a dny všech vsí rodu (před první odpovědí 0 %). */
function SkipProgressTip({ progress }: { progress: ComputeProgress | null }): ReactElement {
  return (
    <span className="block whitespace-nowrap">
      Přepočet {skipPercent(progress)} %
      {progress !== null && progress.totalDays > 0 && (
        <span className="block opacity-75">
          {formatInteger(progress.doneDays)} / {formatInteger(progress.totalDays)}{' '}
          {plural(progress.totalDays, 'den', 'dny', 'dní')}
        </span>
      )}
    </span>
  );
}

/** Kolik procent přepočtu je hotovo – dolů na celá, 100 % až po posledním dni. */
function skipPercent(progress: ComputeProgress | null): number {
  if (progress === null || progress.totalDays <= 0) return 0;
  return Math.floor((progress.doneDays / progress.totalDays) * 100);
}

/**
 * Vývojový režim: tři šipky vedle data – ▶ přeskočí měsíc (30 herních dní), ⏩ rok, ⏭ 10 let.
 * Dokud server přeskočení nedokončí (`pending`), všechna tlačítka čekají a pod nimi běží tenký
 * ukazatel přepočtu (průběh se čte z `/api/dev/skip-progress`, procenta a dny v popisku tlačítek).
 */
export function DevTimeButtons({
  pending,
  onSkip,
}: {
  /** Přeskočení, na které se čeká, nebo null. */
  pending: TimeSkip | null;
  onSkip: (skip: TimeSkip) => void;
}): ReactElement {
  const progress = useSkipProgress(pending !== null);
  const percent = skipPercent(progress);
  return (
    <span data-testid="dev-time" className="relative flex items-center">
      {TIME_SKIP_BUTTONS.map(({ skip, label, icon }) => (
        <IconButton
          key={skip}
          label={label}
          tooltip={
            pending === null ? (
              <span className="whitespace-nowrap">{label}</span>
            ) : (
              <SkipProgressTip progress={progress} />
            )
          }
          testId={`dev-skip-${skip}`}
          disabled={pending !== null}
          busy={pending === skip}
          onClick={() => onSkip(skip)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d={icon} />
          </svg>
        </IconButton>
      ))}
      {pending !== null && (
        <span
          role="progressbar"
          aria-label="Přepočet"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-testid="dev-skip-progress"
          className="pointer-events-none absolute inset-x-1 bottom-0 h-[3px] overflow-hidden rounded-full bg-black/45"
        >
          <span
            className="block h-full bg-[#f3cf86] transition-[width] duration-300 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </span>
  );
}

/** Ciferník na 24 hodin s jednou ručičkou – poledne nahoře, jedna otáčka za herní den. */
export function DayDial({ hour }: { hour: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 26 26"
      width={26}
      height={26}
      className="h-[26px] w-[26px]"
      data-testid="day-dial"
      data-hour={hour.toFixed(2)}
    >
      <circle cx="13" cy="13" r="11" fill="#2b2219" stroke="#d8c39a" strokeWidth="1.5" />
      {[0, 6, 12, 18].map((tick) => (
        <line
          key={tick}
          x1="13"
          y1="3.2"
          x2="13"
          y2={tick % 12 === 0 ? '6.2' : '5'}
          stroke="#d8c39a"
          strokeWidth="1.2"
          transform={`rotate(${tick * 15} 13 13)`}
        />
      ))}
      <line
        data-testid="day-dial-hand"
        x1="13"
        y1="13"
        x2="13"
        y2="5.5"
        stroke="#f3cf86"
        strokeWidth="2"
        strokeLinecap="round"
        transform={`rotate(${clockHandAngle(hour)} 13 13)`}
      />
      <circle cx="13" cy="13" r="1.6" fill="#f3cf86" />
    </svg>
  );
}

/** Hodina dne světa, obnovovaná nejvýš jednou za sekundu; null mimo běžící svět. */
function useDayHour(world: WorldClock | undefined): number | null {
  const [hour, setHour] = useState<number | null>(null);
  const { startMs, endMs } = world ?? { startMs: 0, endMs: 0 };
  useEffect(() => {
    if (!world) return;
    const clock = { startMs, endMs };
    const update = (): void => setHour(dayHourAt(Date.now(), clock));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, world === undefined]);
  return world ? hour : null;
}

/**
 * Datum v liště. Ve vývojovém režimu (`devTime`) je klikací: klik otevře u data malý panel
 * s tlačítky zrychlení času, další klik, Esc nebo stisk mimo ho zavře. Mimo vývojový režim je
 * datum jen údaj – zrychlení se neukáže a klik nic neotevře.
 */
export function DateWithDevTime({
  date,
  devTime,
  world,
}: {
  date: string;
  /** Hodiny světa – ciferník denní doby u data; bez nich ikona data. */
  world?: WorldClock;
  devTime: { pending: TimeSkip | null; onSkip: (skip: TimeSkip) => void } | null;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = open && devTime !== null;
  useDismiss(shown, ref, () => setOpen(false));
  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown]);
  const hour = useDayHour(world);
  const dateResource = (
    <Resource
      icon="date"
      iconNode={hour !== null ? <DayDial hour={hour} /> : undefined}
      name={hour !== null ? `Herní datum – ${dayPartLabel(hour)}` : 'Herní datum'}
      testId="game-date"
    >
      <span className="font-serif font-normal">{date}</span>
    </Resource>
  );
  if (devTime === null) return dateResource;
  return (
    <span ref={ref} className="relative flex items-center">
      <button
        type="button"
        data-testid="game-date-toggle"
        aria-label="Zrychlení času"
        aria-expanded={shown}
        onClick={() => setOpen((value) => !value)}
        className="cursor-pointer rounded hover:bg-white/5 aria-expanded:bg-white/10"
      >
        {dateResource}
      </button>
      {shown && (
        <span
          data-hud-block
          data-testid="dev-time-panel"
          className="hud-panel absolute top-full right-0 z-30 mt-1 flex items-center p-1"
        >
          <DevTimeButtons pending={devTime.pending} onSkip={devTime.onSkip} />
        </span>
      )}
    </span>
  );
}

/** Vynutit zlý rok – ikona a popisek druhu (vývojový režim). */
const BAD_YEAR_LOOKS: Record<BadYearKind, { icon: string; label: string }> = {
  dry: { icon: 'drought', label: 'Suché léto' },
  drought: { icon: 'drought', label: 'Kruté sucho' },
  wet: { icon: 'rain', label: 'Deštivé léto' },
  wetHarvest: { icon: 'rain', label: 'Mokré žně' },
  blackFrost: { icon: 'frost', label: 'Holomráz' },
  long: { icon: 'frost', label: 'Dlouhá sněžná zima' },
};

/** Vynutit pohromu na zítřek – ikona a popisek druhu (vývojový režim). */
const DISASTER_LOOKS: Record<ForcedDisasterKind, { icon: string; label: string }> = {
  hail: { icon: 'hail', label: 'Kroupy' },
  flood: { icon: 'flood', label: 'Stoletá voda' },
  fire: { icon: 'fire', label: 'Požár' },
  tornado: { icon: 'tornado', label: 'Smršť' },
};

/** Vynucení pohrom ve vývojovém režimu – co čeká na server, nebo null. */
export type DevDisasterChoice =
  { kind: 'year'; value: BadYearKind } | { kind: 'disaster'; value: ForcedDisasterKind };

/**
 * Vývojový režim (disasters.md – plán P10): „Vynutit zlý rok“ (letošní léto či zima – ukáže se,
 * až bude vidět) a „Vynutit pohromu“ (zítra) – každé otevře řadu ikon druhů pod lištou.
 */
export function DevDisasterButtons({
  pending,
  onForce,
}: {
  pending: boolean;
  onForce: (choice: DevDisasterChoice) => void;
}): ReactElement {
  const [open, setOpen] = useState<'year' | 'disaster' | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(open !== null, ref, () => setOpen(null));
  const choices: { key: string; icon: string; label: string; choice: DevDisasterChoice }[] =
    open === 'year'
      ? BAD_YEAR_KINDS.map((value) => ({
          key: value,
          ...BAD_YEAR_LOOKS[value],
          choice: { kind: 'year', value },
        }))
      : open === 'disaster'
        ? FORCED_DISASTER_KINDS.map((value) => ({
            key: value,
            ...DISASTER_LOOKS[value],
            choice: { kind: 'disaster', value },
          }))
        : [];
  return (
    <span ref={ref} data-testid="dev-disasters" className="relative flex items-center">
      <IconButton
        label="Vynutit zlý rok"
        tooltip={<span className="whitespace-nowrap">Vynutit zlý rok</span>}
        testId="dev-bad-year"
        expanded={open === 'year'}
        disabled={pending}
        busy={pending}
        onClick={() => setOpen(open === 'year' ? null : 'year')}
      >
        <img src="/icons/resources/drought.png" alt="" width={20} height={20} />
      </IconButton>
      <IconButton
        label="Vynutit pohromu"
        tooltip={<span className="whitespace-nowrap">Vynutit pohromu</span>}
        testId="dev-disaster"
        expanded={open === 'disaster'}
        disabled={pending}
        busy={pending}
        onClick={() => setOpen(open === 'disaster' ? null : 'disaster')}
      >
        <img src="/icons/resources/tornado.png" alt="" width={20} height={20} />
      </IconButton>
      {choices.length > 0 && (
        <span
          data-hud-block
          data-testid="dev-disaster-choices"
          className="hud-panel absolute top-10 right-0 z-50 flex gap-1 p-1"
        >
          {choices.map(({ key, icon, label, choice }) => (
            <IconButton
              key={key}
              label={label}
              tooltip={<span className="whitespace-nowrap">{label}</span>}
              testId={`dev-force-${key}`}
              onClick={() => {
                setOpen(null);
                onForce(choice);
              }}
            >
              <img src={`/icons/resources/${icon}.png`} alt="" width={22} height={22} />
            </IconButton>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Horní lišta jako v 0 A.D.: jméno vsi (přepínač vsí hráče – migration.md; dvojklik nebo tužka =
 * přejmenovat), ikony s čísly – lidé, obilí, maso, mléko a sýr (když je sýr nebo se dojí), ovoce
 * (když nějaké je, nebo ves má sad – diet.md), seno (když ves má ohradu nebo seno – oxen.md),
 * pole, klády na hromadě, uhlí, nástroje a keramika (jen ves s řemesly – crafts.md), volná práce,
 * nasycení (barva ikony podle energie, v popisku energie, bílkoviny a podíly stravy),
 * štěstí (happiness.md), herní datum (ve vývojovém režimu se šipkami přeskočení času) – a vpravo
 * zvuk a nabídka hry (F10: Začít znovu, Odhlásit).
 */
export function TopBar({
  view,
  world,
  initialNowMs,
  menuOpen,
  onToggleMenu,
  onRename,
  onSelectVillage,
  onSetSteward,
  devTime,
  devDisasters = null,
  house = null,
  war = null,
  lordAway = null,
  chronicle = null,
  notices = null,
}: {
  view: VillageView | null;
  /** Hodiny světa hráče – ve vývojovém režimu posunuté o jeho posun času. */
  world: WorldClock;
  /** Čas serveru při renderu – první render v prohlížeči tak sedí s HTML ze serveru. */
  initialNowMs: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onRename: (name: string) => Promise<string | null>;
  /** Přepne na jinou ves hráče (přepínač vsí). */
  onSelectVillage?: (village: VillageListItem) => void;
  /** Zapne / vypne správce vsi (přepínač v seznamu vsí). */
  onSetSteward?: (villageId: string, on: boolean) => Promise<unknown>;
  /** Vývojový režim – po kliku na datum panel s tlačítky přeskoku času; bez něj null. */
  devTime: { pending: TimeSkip | null; onSkip: (skip: TimeSkip) => void } | null;
  /** Vývojový režim – vynutit zlý rok a pohromu; bez něj (nebo bez vsi) null. */
  devDisasters?: { pending: boolean; onForce: (choice: DevDisasterChoice) => void } | null;
  /** Prapor panelu „Rod a vazalové“: počet vazalů, čekající věci (pečeť) a otevření panelu. */
  house?: { vassals: number; waiting: number; open: boolean; onToggle: () => void } | null;
  /** Zkřížené oštěpy (počet válek) a štít s hodinami (ochrana nového rodu, zbývající dny). */
  war?: {
    wars: number;
    protectionDaysLeft: number | null;
    open: boolean;
    onToggle: () => void;
  } | null;
  /** Kniha panelu Kronika (absence.md – Návrat): otevření panelu; bez vsi null. */
  /** Vojvoda na výjezdu (lord-control.md): portrét s podkovou v liště; klik ho vybere. */
  lordAway?: { name: string | null; selected: boolean; onSelect: () => void } | null;
  chronicle?: { open: boolean; onToggle: () => void } | null;
  /** Zvonek panelu Upozornění: počet nových (mezi nejnovějšími načtenými) a otevření panelu. */
  notices?: { unread: number; open: boolean; onToggle: () => void } | null;
}): ReactElement {
  const [nowMs, setNowMs] = useState(initialNowMs);
  // Datum se obnoví na začátku dalšího herního dne (ostrý svět ≈ 86 s), ne každou sekundu –
  // lišta se jinak zbytečně překresluje. Po změně hodin (přeskočení času) hned.
  const { startMs, endMs } = world;
  useEffect(() => {
    const clock = { startMs, endMs };
    let timer = setTimeout(function tick(): void {
      const now = Date.now();
      setNowMs(now);
      const delay = dateRefreshDelay(now, clock);
      if (delay !== null) timer = setTimeout(tick, delay);
    }, 0);
    return () => clearTimeout(timer);
  }, [startMs, endMs]);

  const satiation = view ? satiationState(view) : 'fed';

  return (
    <header
      data-testid="top-bar"
      className="hud-panel fixed inset-x-0 top-0 z-20 flex h-11 items-center gap-1 rounded-none border-x-0 border-t-0 px-2"
    >
      {view && (
        <VillageSwitcher
          name={view.name}
          currentId={view.id}
          villages={view.villages}
          onSelect={(village) => onSelectVillage?.(village)}
          onRename={onRename}
          steward={view.steward.on}
          onSetSteward={onSetSteward}
        />
      )}
      {view && (
        <div className="ml-2 flex items-center gap-1 border-l border-[#5c4526] pl-2">
          <Resource icon="people" name={<PeopleTooltip view={view} />} testId="village-people">
            <span className={fieldCapacityShort(view) ? 'text-red-400' : undefined}>
              {peopleLabel(view)}
            </span>
          </Resource>
          <StockBreakdown
            icon="food"
            name="Obilí, luštěniny a jablka (kg)"
            total={grainStockTotal(view)}
            rows={grainStockRows(view)}
            testId="village-stores"
          />
          {view.threshing?.sheavesKg !== undefined && (
            <Resource icon="sheaves" name={sheavesName()} testId="village-sheaves">
              {formatInteger(view.threshing.sheavesKg)}
            </Resource>
          )}
          <Resource icon="meat" name="Maso" testId="village-meat">
            {formatInteger(view.meatKg)}
          </Resource>
          <StockBreakdown
            icon="cow"
            name="Dobytek"
            total={livestockTotal(view)}
            rows={livestockRows(view)}
            testId="village-livestock"
          />
          {showsDairy(view) && (
            <Resource icon="cheese" name={dairyName(view)} testId="village-cheese">
              {formatInteger(view.cheeseKg)}
            </Resource>
          )}
          {showsHay(view) && (
            <Resource icon="hay" name="Seno" testId="village-hay">
              {formatInteger(view.hayKg)}
            </Resource>
          )}
          <Resource icon="wood" name="Klády na hromadách" testId="village-wood">
            {formatInteger(view.woodLogs)}
          </Resource>
          {view.stoneSupply && (view.stoneSupply.m3 >= 0.5 || view.stoneSupply.quarry) && (
            <Resource icon="stone" name="Kámen na hromadách (m³)" testId="village-stone">
              {formatInteger(view.stoneSupply.m3)}
            </Resource>
          )}
          {view.crafts.present && <CraftStocks crafts={view.crafts} />}
          <Resource icon="labor" name={<LaborTooltip lord={view.lord} />} testId="village-labor">
            {formatDecimal(Math.max(0, view.commonLaborPerDay), 1)}
          </Resource>
          <span data-testid="village-satiation" data-state={satiation} className="contents">
            <Resource
              icon="satiation"
              name={<SatiationTooltip view={view} />}
              testId="village-satiation-value"
              filter={SATIATION_GLOW[satiation]}
            />
          </span>
          <Resource
            icon="happiness"
            name={<HappinessTooltip happiness={view.happiness} />}
            testId="village-happiness"
          >
            {Math.round(view.happiness.value)}
          </Resource>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        {lordAway && <LordAwayBadge {...lordAway} />}
        <DateWithDevTime
          date={formatWorldState(getWorldState(nowMs, world), world)}
          devTime={devTime}
          world={world}
        />
        {devDisasters && (
          <DevDisasterButtons pending={devDisasters.pending} onForce={devDisasters.onForce} />
        )}
        <span className="mx-1 h-6 border-l border-[#5c4526]" aria-hidden />
        {chronicle && (
          <IconButton
            label="Kronika"
            tooltip={<HotkeyTip name="Kronika" hotkey={PANEL_HOTKEYS.chronicle.label} />}
            keyshortcuts={PANEL_HOTKEYS.chronicle.label}
            testId="chronicle-toggle"
            expanded={chronicle.open}
            onClick={chronicle.onToggle}
          >
            <img
              src="/icons/resources/chronicle.png"
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px]"
            />
          </IconButton>
        )}
        {notices && (
          <IconButton
            label="Upozornění"
            tooltip={<HotkeyTip name="Upozornění" hotkey={PANEL_HOTKEYS.notices.label} />}
            keyshortcuts={PANEL_HOTKEYS.notices.label}
            testId="notices-toggle"
            expanded={notices.open}
            onClick={notices.onToggle}
          >
            <span className="relative flex h-6 items-center">
              <img
                src="/icons/resources/bell.png"
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px]"
              />
              {notices.unread > 0 && (
                <span
                  data-testid="notices-unread"
                  className="absolute -top-1.5 -right-2.5 min-w-[14px] rounded-full bg-[#f3cf86] px-1 text-center text-[10px] leading-[14px] font-bold text-[#2b2219] tabular-nums"
                >
                  {notices.unread}
                </span>
              )}
            </span>
          </IconButton>
        )}
        {house && (
          <IconButton
            label="Rod a vazalové"
            tooltip="Rod a vazalové"
            testId="house-toggle"
            expanded={house.open}
            onClick={house.onToggle}
          >
            <span className="relative flex h-6 items-center gap-0.5">
              <img
                src="/icons/house/banner.png"
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px]"
              />
              <span data-testid="house-vassal-count" className="text-xs font-semibold tabular-nums">
                {house.vassals}
              </span>
              {house.waiting > 0 && (
                <span
                  data-testid="house-waiting"
                  className="absolute -top-2 -right-3 flex items-center"
                >
                  <img src="/icons/house/seal.png" alt="" width={14} height={14} />
                  <span className="text-[10px] font-bold tabular-nums">{house.waiting}</span>
                </span>
              )}
            </span>
          </IconButton>
        )}
        {war && (
          <IconButton
            label="Válka"
            tooltip="Válka"
            testId="war-toggle"
            expanded={war.open}
            onClick={war.onToggle}
          >
            <span
              data-testid="war-count"
              data-wars={war.wars}
              className={`relative flex h-6 items-center gap-0.5 ${war.wars === 0 ? 'opacity-40' : ''}`}
            >
              <img
                src="/icons/house/spears.png"
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px]"
              />
              <span className="text-xs font-semibold tabular-nums">{war.wars}</span>
            </span>
          </IconButton>
        )}
        {war && war.protectionDaysLeft !== null && (
          <Tooltip
            content={`Ochrana nového rodu – ještě ${war.protectionDaysLeft} ${
              war.protectionDaysLeft === 1 ? 'den' : war.protectionDaysLeft < 5 ? 'dny' : 'dní'
            }`}
          >
            <span
              tabIndex={0}
              data-testid="protection-shield"
              data-days={war.protectionDaysLeft}
              aria-label={`Ochrana nového rodu – ještě ${war.protectionDaysLeft} dní`}
              className="flex h-6 items-center gap-0.5"
            >
              <img
                src="/icons/house/shield-hourglass.png"
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px]"
              />
              <span className="text-xs font-semibold tabular-nums">{war.protectionDaysLeft}</span>
            </span>
          </Tooltip>
        )}
        <IconButton
          label="Nabídka"
          tooltip={<HotkeyTip name="Nabídka" hotkey={MENU_HOTKEY} />}
          expanded={menuOpen}
          keyshortcuts={MENU_HOTKEY}
          onClick={onToggleMenu}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          >
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </IconButton>
      </div>
    </header>
  );
}
