'use client';

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { getWorldState, type TimeSkip, type WorldClock } from '@bohemia/game';
import { dateRefreshDelay, formatWorldState } from '@/lib/game-date';
import { MENU_HOTKEY } from '@/lib/game-menu';
import { formatDecimal, formatHa, formatInteger, formatPercent } from '@/lib/village-format';
import type { VillageListItem } from '@/lib/village-list';
import type { VillageView } from '@/lib/village-view';
import { Tooltip } from './Tooltip';
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

/** Snopy, které ves nesmí vymlátit (production-chains.md – Humno) – ikona do červena. */
const SHEAVES_WAITING_GLOW = 'drop-shadow(0 0 4px rgb(235 70 50 / 1)) saturate(0.6)';

/**
 * Popisek snopů v liště (production-chains.md – Humno): nevymlácené zrno; bez humna čekají a kazí
 * se.
 */
export function sheavesName(threshing: NonNullable<VillageView['threshing']>): string {
  return threshing.waiting
    ? 'Snopy čekají na humno – kazí se (kg zrna)'
    : 'Snopy – nevymláceno (kg zrna)';
}

function Resource({
  icon,
  name,
  testId,
  children,
  filter,
}: {
  icon: string;
  /** Popisek – název, u nasycení i podíly stravy. */
  name: ReactNode;
  testId: string;
  children?: ReactNode;
  filter?: string;
}): ReactElement {
  return (
    <Tooltip content={name}>
      <span data-hud-block className="flex h-8 items-center gap-1 px-1.5" tabIndex={0}>
        <img
          src={`/icons/resources/${icon}.png`}
          alt=""
          width={26}
          height={26}
          className="h-[26px] w-[26px]"
          style={filter ? { filter } : undefined}
        />
        {children !== undefined && (
          <span data-testid={testId} className="text-sm font-semibold tabular-nums">
            {children}
          </span>
        )}
      </span>
    </Tooltip>
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
 * Luštěniny v horní liště (diet.md – Luštěniny) – když jsou v zásobě, ves je letos seje nebo je
 * dnes jí.
 */
export function showsLegumes(view: Pick<VillageView, 'legumesKg' | 'fields' | 'diet'>): boolean {
  return (
    view.legumesKg >= 1 ||
    view.fields.some((f) => (f.crops.legume ?? 0) > 0) ||
    (view.diet.shares.legumes ?? 0) > 0
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

/** Dřevěné nářadí v horní liště – ves s tesařem nebo s nářadím v zásobě (wagons.md – Tesař). */
export function showsWoodTools(crafts: VillageView['crafts']): boolean {
  return (
    Math.round(crafts.stocks.woodToolsKg ?? 0) > 0 ||
    crafts.workshops.some((w) => w.craft === 'carpenter')
  );
}

/** Popisek vozů v horní liště: kolik dvoukoláků a čtyřkoláků, kolik na cestě (wagons.md). */
export function cartsLabel(carts: VillageView['crafts']['carts']): string {
  const two = carts.filter((c) => c.kind === 'two-wheel').length;
  const four = carts.length - two;
  const away = carts.filter((c) => c.away).length;
  const parts = [`dvoukoláky ${two}`, ...(four > 0 ? [`čtyřkoláky ${four}`] : [])];
  return `Vozy – ${parts.join(', ')}${away > 0 ? ` (na cestě ${away})` : ''}`;
}

/**
 * Zásoby výrobků řemeslníků (crafts.md) – uhlí, nástroje a keramika v kg; v popisku nástrojů
 * a keramiky i pokrytí potřeby vsi (meze produktivity). Dřevěné nářadí a vozy od tesaře
 * (wagons.md) – jen když ves tesaře nebo vozy má.
 */
function CraftStocks({ crafts }: { crafts: VillageView['crafts'] }): ReactElement {
  const { stocks, coverage } = crafts;
  return (
    <>
      <Resource icon="charcoal" name="Uhlí (kg)" testId="village-charcoal">
        {formatInteger(stocks.charcoalKg)}
      </Resource>
      <Resource
        icon="tools"
        name={`Nástroje (kg) – pokrytí potřeby ${formatPercent(coverage.tools)}`}
        testId="village-tools"
      >
        {formatInteger(stocks.toolsKg)}
      </Resource>
      <Resource
        icon="pottery"
        name={`Keramika (kg) – pokrytí potřeby ${formatPercent(coverage.pottery)}`}
        testId="village-pottery"
      >
        {formatInteger(stocks.potteryKg)}
      </Resource>
      {showsWoodTools(crafts) && (
        <Resource
          icon="wood-tools"
          name={`Dřevěné nářadí (kg) – pokrytí potřeby ${formatPercent(coverage.woodTools ?? 0)}`}
          testId="village-wood-tools"
        >
          {formatInteger(stocks.woodToolsKg ?? 0)}
        </Resource>
      )}
      {crafts.carts.length > 0 && (
        <Resource icon="cart" name={cartsLabel(crafts.carts)} testId="village-carts">
          {crafts.carts.length}
        </Resource>
      )}
    </>
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
    <Tooltip content={tooltip} placement="below-left">
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

/**
 * Vývojový režim: tři šipky vedle data – ▶ přeskočí měsíc (30 herních dní), ⏩ rok, ⏭ 10 let.
 * Dokud server přeskočení nedokončí (`pending`), všechna tlačítka čekají.
 */
export function DevTimeButtons({
  pending,
  onSkip,
}: {
  /** Přeskočení, na které se čeká, nebo null. */
  pending: TimeSkip | null;
  onSkip: (skip: TimeSkip) => void;
}): ReactElement {
  return (
    <span data-testid="dev-time" className="flex items-center">
      {TIME_SKIP_BUTTONS.map(({ skip, label, icon }) => (
        <IconButton
          key={skip}
          label={label}
          tooltip={<span className="whitespace-nowrap">{label}</span>}
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
    </span>
  );
}

/**
 * Vývojový režim: druhá ves na téže mapě (jen pro vyzkoušení přepínače vsí – migration.md).
 * Dokud server ves zakládá, tlačítko čeká.
 */
export function DevVillageButton({
  pending,
  onFound,
}: {
  pending: boolean;
  onFound: () => void;
}): ReactElement {
  return (
    <IconButton
      label="Druhá ves na téže mapě"
      tooltip={<span className="whitespace-nowrap">Druhá ves na téže mapě</span>}
      testId="dev-second-village"
      disabled={pending}
      busy={pending}
      onClick={onFound}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M3 11l7-6 7 6v8H3zM17 3h2v3h3v2h-3v3h-2V8h-3V6h3z" />
      </svg>
    </IconButton>
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
  soundOn,
  onToggleSound,
  menuOpen,
  onToggleMenu,
  onRename,
  onSelectVillage,
  devTime,
  devVillage = null,
}: {
  view: VillageView | null;
  /** Hodiny světa hráče – ve vývojovém režimu posunuté o jeho posun času. */
  world: WorldClock;
  /** Čas serveru při renderu – první render v prohlížeči tak sedí s HTML ze serveru. */
  initialNowMs: number;
  soundOn: boolean;
  onToggleSound: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onRename: (name: string) => Promise<string | null>;
  /** Přepne na jinou ves hráče (přepínač vsí). */
  onSelectVillage?: (village: VillageListItem) => void;
  /** Vývojový režim – šipky přeskočení času vedle data; bez něj null. */
  devTime: { pending: TimeSkip | null; onSkip: (skip: TimeSkip) => void } | null;
  /** Vývojový režim – druhá ves na téže mapě; bez něj (nebo bez vsi) null. */
  devVillage?: { pending: boolean; onFound: () => void } | null;
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

  const people = view ? view.people.children + view.people.adults + view.people.elders : 0;
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
        />
      )}
      {view && (
        <div className="ml-2 flex items-center gap-1 border-l border-[#5c4526] pl-2">
          <Resource icon="people" name="Lidé" testId="village-people">
            {people}
          </Resource>
          <Resource icon="food" name="Obilí" testId="village-stores">
            {formatInteger(view.storesKg)}
          </Resource>
          {showsLegumes(view) && (
            <Resource icon="legumes" name="Luštěniny (kg)" testId="village-legumes">
              {formatInteger(view.legumesKg)}
            </Resource>
          )}
          {view.threshing?.sheavesKg !== undefined && (
            <Resource
              icon="sheaves"
              name={sheavesName(view.threshing)}
              testId="village-sheaves"
              {...(view.threshing.waiting ? { filter: SHEAVES_WAITING_GLOW } : {})}
            >
              {formatInteger(view.threshing.sheavesKg)}
            </Resource>
          )}
          <Resource icon="meat" name="Maso" testId="village-meat">
            {formatInteger(view.meatKg)}
          </Resource>
          {showsDairy(view) && (
            <Resource icon="cheese" name={dairyName(view)} testId="village-cheese">
              {formatInteger(view.cheeseKg)}
            </Resource>
          )}
          {(Math.round(view.applesKg) > 0 || view.orchards.length > 0) && (
            <Resource icon="apples" name="Ovoce" testId="village-apples">
              {formatInteger(view.applesKg)}
            </Resource>
          )}
          {showsHay(view) && (
            <Resource icon="hay" name="Seno" testId="village-hay">
              {formatInteger(view.hayKg)}
            </Resource>
          )}
          <Resource icon="fields" name="Pole – celková rozloha" testId="village-fields">
            {formatHa(view.fields.reduce((sum, f) => sum + f.areaM2, 0))}
          </Resource>
          <Resource icon="wood" name="Klády na hromadě" testId="village-wood">
            {formatInteger(view.woodLogs)}
          </Resource>
          {view.crafts.present && <CraftStocks crafts={view.crafts} />}
          <Resource icon="labor" name="Volná práce" testId="village-labor">
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
          <Resource icon="happiness" name="Štěstí" testId="village-happiness">
            {Math.round(view.happiness.value)}
          </Resource>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Resource icon="date" name="Herní datum" testId="game-date">
          <span className="font-serif font-normal">
            {formatWorldState(getWorldState(nowMs, world), world)}
          </span>
        </Resource>
        {devTime && <DevTimeButtons pending={devTime.pending} onSkip={devTime.onSkip} />}
        {devVillage && (
          <DevVillageButton pending={devVillage.pending} onFound={devVillage.onFound} />
        )}
        <span className="mx-1 h-6 border-l border-[#5c4526]" aria-hidden />
        <IconButton
          label="Zvuky krajiny"
          tooltip={soundOn ? 'Zvuk' : 'Bez zvuku'}
          pressed={soundOn}
          onClick={onToggleSound}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
            {soundOn ? (
              <>
                <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
                <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
              </>
            ) : (
              <path d="M16 9.5l5 5m0-5l-5 5" />
            )}
          </svg>
        </IconButton>
        <IconButton
          label="Nabídka"
          tooltip={
            <span className="whitespace-nowrap">
              Nabídka <span className="text-[#bfa77a]">[{MENU_HOTKEY}]</span>
            </span>
          }
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
