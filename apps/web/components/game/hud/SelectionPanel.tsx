import { useState, type ReactElement, type ReactNode } from 'react';
import {
  CART_NAMES,
  CRAFT_NAMES,
  MAX_PEN_SQUARES,
  type BuildableDwellingType,
  type DwellingType,
  type FamilyCounts,
} from '@bohemia/game';
import { useOverflowScroll } from '@/hooks/use-overflow-scroll';
import { PART_COLORS, SURFACE_COLORS } from '@/lib/minimap';
import type { VillageTarget } from '@/lib/scene/village-picking';
import {
  CROP_LABELS,
  FIELD_SURFACE_NAMES,
  HERD_LABELS,
  HERD_ORDER,
  PART_STAGE_NAMES,
  fieldPartName,
  orchardSquareName,
  type SelectionBuying,
  type SelectionDetails,
  type SelectionWorkshop,
} from '@/lib/selection-details';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { PEN_NAMES, penVariant } from '@/lib/build-items';
import {
  formatDecimal,
  formatHa,
  formatInteger,
  formatPercent,
  formatYearsShort,
  plural,
} from '@/lib/village-format';
import {
  CRAFT_LOOKS,
  DWELLING_NAMES,
  PRODUCT_ICONS,
  PRODUCT_TITLES,
  boughtProducts,
  productList,
  ROAD_KIND_NAMES,
  ROAD_UPGRADE_NAMES,
  SACRED_BUILDING_NAMES,
  type Craft,
  type WorkshopActivity,
} from '@/lib/village-view';
import type { Direction8, RoadKind, RoadUpgrade, TradeGoods } from '@bohemia/game';
import type { PreviewPeople } from '@/lib/trade-quote';
import { ManorUpgrades, SwathTrees } from './ManorPanel';
import { TradePanel } from './TradePanel';
import {
  CancelRelocationButton,
  LeaveControls,
  RelocateButtons,
  RelocationProgress,
} from './RelocationControls';
import { Tooltip } from './Tooltip';

/** Portrét a název – název na jeden řádek, delší rozšíří sloupec portrétu. */
function Portrait({ icon, name }: { icon: string; name: string }): ReactElement {
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

function Stat({
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

function Bar({
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
function Wear({
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
function RepairBar({ value, name = 'Oprava' }: { value: number; name?: string }): ReactElement {
  return <Bar value={value} name={name} testId="selection-repair" />;
}

/** Portrét a název obydlí, nebo dílny řemesla. */
function dwellingPortrait(type: DwellingType, craft: Craft | null): ReactElement {
  return craft ? (
    <Portrait icon={CRAFT_LOOKS[craft].icon} name={CRAFT_NAMES[craft]} />
  ) : (
    <Portrait icon={type} name={DWELLING_NAMES[type].nominative} />
  );
}

/**
 * Co dílna dělá – ikona (výrobek, dřevo, uhlí, lidé) s červeným tónem, když stojí, a popisek
 * v tooltipu; u výroby kolik kg za den.
 */
/** Čeho má ves dost, když řemeslník pomáhá vsi (2. pád). */
const ENOUGH: Record<Craft, string> = {
  burner: 'Uhlí',
  smith: 'Nástrojů',
  potter: 'Keramiky',
  carpenter: 'Vozů a nářadí',
};

function activityLook(workshop: SelectionWorkshop): {
  icon: string;
  name: string;
  value: string;
  stalled: boolean;
} {
  const product = CRAFT_LOOKS[workshop.craft].product;
  const perDay = `${formatDecimal(workshop.outputPerDayKg, 1)} kg/den`;
  const kiln = workshop.kiln;
  const percent = kiln ? formatPercent(kiln.progress) : '–';
  // vypálený milíř je zásobou uhlí – uhlíř z něj nosí kováři (crafts.md – Milíř stojí vždy)
  const inKiln = kiln?.stage === 'draw' ? formatInteger(kiln.charcoalKg) : null;
  // tesař (wagons.md): rozdělaný vůz, pomoc stavbám
  const making = workshop.carpenter?.making ?? null;
  const looks: Record<WorkshopActivity, { icon: string; name: string; value: string }> = {
    producing: making
      ? {
          icon: 'cart',
          name: `Vyrábí vůz – ${CART_NAMES[making.kind].toLowerCase()}`,
          value: formatPercent(making.progress),
        }
      : {
          icon: product.icon,
          name: `Vyrábí – ${product.name.toLowerCase()}`,
          value: perDay,
        },
    helping: {
      icon: 'labor',
      name: 'Pomáhá se stavbami – dřevěné části opracuje rychleji (pokrytí dřevěné práce)',
      value: formatPercent(workshop.carpenter?.woodworkCoverage ?? 0),
    },
    felling: {
      icon: 'wood',
      name:
        workshop.craft === 'burner'
          ? 'Kácí a připravuje buky na milíř'
          : workshop.craft === 'carpenter'
            ? 'Nemá klády – kácí strom'
            : 'Kácí dřevo',
      value: kiln ? `${kiln.prepared}/${kiln.trees}` : perDay,
    },
    building: { icon: 'wood', name: 'Staví milíř', value: percent },
    burning: { icon: 'charcoal', name: 'Pálí milíř – hlídá ve dne i v noci', value: percent },
    drawing: {
      icon: 'charcoal',
      name: 'Rozebírá milíř a třídí uhlí pro kováře (kg uhlí, které v milíři zbývá)',
      value: inKiln ?? percent,
    },
    planting: { icon: 'labor', name: 'Sází mladé buky na pařezy', value: `${workshop.toPlant}` },
    resting:
      workshop.craft === 'burner' && inKiln !== null
        ? {
            icon: 'charcoal',
            name: 'Milíř je vypálený – uhlí z něj vytahá, jak ho kovář spotřebuje; zatím pomáhá vsi (kg uhlí v milíři)',
            value: inKiln,
          }
        : {
            icon: 'people',
            name: `${ENOUGH[workshop.craft]} je dost na rok – pomáhá vsi na poli a se stavbami`,
            value: '–',
          },
    'no-charcoal': { icon: 'charcoal', name: 'Čeká na uhlí – zatím pomáhá vsi', value: '0' },
    'no-ore': {
      icon: 'ore',
      name: 'Nemá rudu – v okolí není mokřina ani potok, kde ji kopat; zatím pomáhá vsi',
      value: '0',
    },
    digging: {
      icon: 'ore',
      name: 'Kope rudu na rudišti a nosí ji do kovárny (kg rudy v kovárně)',
      value: formatInteger(workshop.ore?.stockKg ?? 0),
    },
    'no-wood': {
      icon: 'wood',
      name:
        workshop.craft === 'burner'
          ? 'Čeká na dřevo – nejsou dospělé buky, zatím pomáhá vsi'
          : workshop.craft === 'carpenter'
            ? 'Nemá klády ani co kácet – zatím pomáhá vsi'
            : 'Čeká na dřevo – není co kácet, zatím pomáhá vsi',
      value: '0',
    },
    idle: { icon: 'labor', name: 'Nemá kdo pracovat', value: '0' },
    empty: { icon: 'people', name: 'Prázdná – nikdo tu nebydlí', value: '0' },
    settled: { icon: 'people', name: 'Právě se nastěhovali – v dílně začnou zítra', value: '–' },
  };
  const look = looks[workshop.activity];
  const stalled =
    workshop.activity === 'no-charcoal' ||
    workshop.activity === 'no-ore' ||
    workshop.activity === 'no-wood' ||
    workshop.activity === 'idle' ||
    workshop.activity === 'empty';
  return { ...look, stalled };
}

/**
 * Kovárna (crafts.md – Uhlí a ruda kováře): zásoba rudy, rudiště (vzdálenost chůze) a kdo nosí
 * uhlí od milíře – synové 10–13 let, kovář sám, nebo vůz se sedlákem.
 */
function SmithOreStats({ ore }: { ore: NonNullable<SelectionWorkshop['ore']> }): ReactElement {
  const sons = ore.sons.map((age) => `${age}`).join(', ');
  const carrier = ore.cart
    ? {
        icon: 'cart',
        name: 'Uhlí od milíře a rudu z rudiště přiveze sedlák s vozem, když to ušetří práci',
        value: '',
      }
    : ore.sons.length > 0
      ? {
          icon: 'child',
          name: `Uhlí od milíře nosí ${ore.sons.length > 1 ? 'synové' : 'syn'} (věk) – ten den nepasou`,
          value: sons,
        }
      : { icon: 'man', name: 'Uhlí od milíře nosí kovář sám – ten den kove méně', value: '' };
  return (
    <>
      <Stat icon="ore" name="Ruda v kovárně (kg)" testId="selection-workshop-ore">
        {formatInteger(ore.stockKg)}
      </Stat>
      {ore.site && (
        <Stat
          icon="walk"
          name={`Rudiště v mokřině u potoka – cesta z kovárny (m), v ložisku zbývá ${formatInteger(ore.site.leftKg)} kg rudy`}
          testId="selection-workshop-ore-site"
        >
          {`${formatInteger(ore.site.walkM)} m`}
        </Stat>
      )}
      <Stat icon={carrier.icon} name={carrier.name} testId="selection-workshop-carrier">
        {carrier.value}
      </Stat>
    </>
  );
}

/** Dílna v panelu výběru: co dělá, práce za den, zásoba výrobku (a pokrytí potřeby vsi). */
function WorkshopRow({ workshop }: { workshop: SelectionWorkshop }): ReactElement {
  const activity = activityLook(workshop);
  const product = CRAFT_LOOKS[workshop.craft].product;
  return (
    <div
      data-testid="selection-workshop"
      data-activity={workshop.activity}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <Stat icon={activity.icon} name={activity.name} testId="selection-workshop-activity">
        <span className={activity.stalled ? 'text-red-400' : ''}>{activity.value}</span>
      </Stat>
      <Stat icon="labor" name="Práce v dílně za den" testId="selection-workshop-labor">
        {formatDecimal(workshop.laborPerDay, 1)}
      </Stat>
      <Stat
        icon={product.icon}
        name={
          workshop.coverage === null
            ? `${product.name} v zásobě (kg)`
            : `${product.name} v zásobě (kg) – pokrytí potřeby vsi ${formatPercent(workshop.coverage)}`
        }
        testId="selection-workshop-stock"
      >
        {formatInteger(workshop.stockKg)}
      </Stat>
      {workshop.kiln?.forest && (
        <Stat icon="wood" name="Milíř stojí v lese u těžby" testId="selection-workshop-forest">
          les
        </Stat>
      )}
      {workshop.carpenter && <CarpenterStats carpenter={workshop.carpenter} />}
      {workshop.ore && <SmithOreStats ore={workshop.ore} />}
      {workshop.buying && (
        <Stat
          icon={product.icon}
          name={`Vlastní dílna nemá vstupy – vesničané dokupují u souseda (${DIRECTION_NAMES[workshop.buying.direction].name}, ${workshop.buying.days} dní cesty)`}
          testId="selection-workshop-buying"
        >
          {DIRECTION_NAMES[workshop.buying.direction].arrow}
        </Stat>
      )}
      {workshop.craft === 'burner' && workshop.toPlant > 0 && workshop.activity !== 'planting' && (
        <Stat
          icon="labor"
          name="Pařezy buků, na které ještě zasadí mladý buk (sází na jaře a na podzim)"
          testId="selection-workshop-to-plant"
        >
          {workshop.toPlant}
        </Stat>
      )}
    </div>
  );
}

/**
 * Tesař v panelu dílny (wagons.md – Co hráč vidí): vozy vsi proti potřebě (dvoukolák na spřežení,
 * čtyřkolák se stezkou) a pokrytí dřevěné práce staveb.
 */
function CarpenterStats({
  carpenter,
}: {
  carpenter: NonNullable<SelectionWorkshop['carpenter']>;
}): ReactElement {
  const kinds = (['two-wheel', 'four-wheel'] as const).filter(
    (kind) => carpenter.cartTargets[kind] > 0 || carpenter.carts.some((c) => c.kind === kind),
  );
  return (
    <>
      {kinds.map((kind) => {
        const carts = carpenter.carts.filter((c) => c.kind === kind);
        const away = carts.filter((c) => c.away).length;
        const target = carpenter.cartTargets[kind];
        return (
          <Stat
            key={kind}
            icon="cart"
            name={`${CART_NAMES[kind]} – vozy vsi / potřeba${away > 0 ? `, ${away} na cestě` : ''}`}
            testId={`selection-workshop-carts-${kind}`}
          >
            {carts.length}/{target}
          </Stat>
        );
      })}
      <Stat
        src="/icons/build/tesar.png"
        name="Pokrytí dřevěné práce staveb tesařem (stavby dnes)"
        testId="selection-workshop-woodwork"
      >
        {formatPercent(carpenter.woodworkCoverage)}
      </Stat>
    </>
  );
}

/**
 * Dvorec: kde ves bere výrobky řemeslníků (crafts.md – Nákup u sousedů) – ikona výrobku se šipkou
 * k sousedovi s řemeslníkem (vlastní dílna ✓) a nákupy na cestě (lidé a dny do návratu). Jen
 * ikony, věty v popiscích.
 */
function BuyingRow({ buying }: { buying: SelectionBuying }): ReactElement {
  return (
    <div data-testid="selection-buying" className={ROW}>
      {buying.sources.map((source) => (
        <Stat
          key={source.product}
          icon={PRODUCT_ICONS[source.product]}
          name={
            source.own
              ? `${PRODUCT_TITLES[source.product]} – vlastní řemeslník`
              : source.direction
                ? `${PRODUCT_TITLES[source.product]} – vesničané kupují u souseda (${DIRECTION_NAMES[source.direction].name}, ${source.days} dní cesty${source.trail ? ' po stezce' : ' krajinou'}), když se jim to vyplatí`
                : `${PRODUCT_TITLES[source.product]} – žádný soused je nedělá`
          }
          testId={`selection-buying-${source.product}`}
        >
          {source.own ? '✓' : source.direction ? DIRECTION_NAMES[source.direction].arrow : '–'}
        </Stat>
      ))}
      {buying.purchases.map((purchase, k) => (
        <Stat
          key={k}
          icon="hourglass"
          name={`Vesničané jdou koupit ${productList(boughtProducts(purchase.get))} k sousedovi (${DIRECTION_NAMES[purchase.direction].name}) – ${purchase.group} lidí, za ${formatInteger(purchase.payKg)} kg obilí; vrátí se za ${purchase.daysLeft} dní`}
          testId="selection-buying-trip"
        >
          {DIRECTION_NAMES[purchase.direction].arrow} {purchase.daysLeft}
        </Stat>
      ))}
    </div>
  );
}

/** Řádek ikon s čísly – při nedostatku místa se zalomí po celých položkách, ne uvnitř textu. */
const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-1';

/**
 * Příkazy vybraného objektu vpravo v panelu (jako v 0 A.D.), oddělené čarou od údajů – panel tak
 * roste do šířky, ne do výšky (`hud-split` a `hud-commands` v globals.css; na středně úzkém okně
 * jsou příkazy pod údaji). Rozbalené nabídky (růžice, obchod) se otevírají nad panelem.
 */
function Commands({
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

/** Akce panelu nad obydlími – přestěhování domácnosti a jeho zrušení (migration.md). */
interface RelocationActions {
  /** Začne umisťovat nové domy domácností `householdIds` (postupně, jeden za druhým). */
  onRelocate?: (type: BuildableDwellingType, householdIds: readonly number[]) => void;
  /** Zruší rozestavěné stěhování (stavba nového domu) – hotovo, až se vrátí. */
  onCancelRelocation?: (constructionId: number) => Promise<void>;
  /**
   * Odejít do nové vsi (migration.md – fáze 3 a 4): na téže mapě (`here` – hráč pak umístí první
   * zemnici), nebo na novou mapu ve směru.
   */
  onLeave?: (target: 'here' | Direction8, householdIds: readonly number[]) => void;
}

/** Vylepšení vsi z dvorce vojvody (trade.md) – zemská stezka a obchod. */
interface ManorActions {
  /** Zadá stavbu zemské stezky do směru (server action) – hotovo, až se vrátí. */
  onBuildTrail?: (direction: Direction8) => Promise<void>;
  /**
   * Vyšle výpravu k sousedovi (server action) – hotovo, až se vrátí; vrátí důvod, proč ji server
   * odmítl, nebo null (panel obchodu ho ukáže pod tlačítkem).
   */
  onSendExpedition?: (
    direction: Direction8,
    give: TradeGoods,
    get: TradeGoods,
    people: PreviewPeople,
  ) => Promise<string | null | void>;
}

function DwellingBody({
  details,
  onRelocate,
  onCancelRelocation,
  onLeave,
  onBuildTrail,
  onSendExpedition,
}: {
  details: Extract<SelectionDetails, { kind: 'dwelling' }>;
} & RelocationActions &
  ManorActions): ReactElement {
  const tone = details.overcrowded ? 'text-red-400' : details.full ? 'text-[#f3cf86]' : '';
  const commands = details.manor !== null || details.relocate !== null || details.leave !== null;
  return (
    <div className="hud-split">
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        {details.workshop && <WorkshopRow workshop={details.workshop} />}
        {details.buying && <BuyingRow buying={details.buying} />}
        <div className={ROW}>
          <Stat icon="people" name="Obyvatelé" testId="selection-occupants">
            <span className={tone}>
              {details.occupants}/{details.capacity}
            </span>
          </Stat>
          <Stat icon="date" name="Stáří (roky)">
            {details.ageYears}
          </Stat>
        </div>
        <FamilyRow family={details.family} />
        {/* nejvýš 8 věků v řádku (8 × 1,75rem + mezery) – dvorec má 10 lidí a víc */}
        <ul
          data-testid="selection-ages"
          aria-label="Věk obyvatel"
          className="flex max-w-[15.75rem] flex-wrap gap-1"
        >
          {details.ages.map((age, i) => (
            <li
              key={i}
              className="hud-inset min-w-7 rounded px-1 text-center text-xs tabular-nums text-[#ecdfc4]"
            >
              {age}
            </li>
          ))}
        </ul>
        <Bar value={details.condition} name="Stav" testId="selection-condition" />
        {details.rebuild && (
          <div className={ROW}>
            <Bar value={details.rebuild.progress} name="Přestavba" />
            {details.rebuild.treesToFell > 0 && <WoodToFell trees={details.rebuild.treesToFell} />}
          </div>
        )}
        {details.relocation && (
          <RelocationProgress
            constructionId={details.relocation.constructionId}
            progress={details.relocation.progress}
            onCancel={onCancelRelocation}
          />
        )}
      </div>
      {commands && (
        <Commands>
          {details.manor && (
            <ManorUpgrades
              manor={details.manor}
              onBuildTrail={onBuildTrail}
              trade={() => (
                <TradePanel
                  neighbours={details.manor?.neighbours ?? []}
                  onSend={onSendExpedition}
                />
              )}
            />
          )}
          {(details.relocate || details.leave) && (
            <div className="flex items-center gap-2">
              {details.relocate && (
                <RelocateButtons
                  options={details.relocate}
                  households={1}
                  onRelocate={onRelocate ? (type) => onRelocate(type, [details.id]) : undefined}
                />
              )}
              <LeaveControls leave={details.leave} onLeave={onLeave} />
            </div>
          )}
        </Commands>
      )}
    </div>
  );
}

/**
 * Víc vybraných obydlí (migration.md – Výběr víc obydlí): kolik domácností a lidí, Přestěhovat
 * (nový dům postupně každé domácnosti, která se může stěhovat) a Odejít (růžice odchodu).
 */
function DwellingsBody({
  details,
  onRelocate,
  onLeave,
}: {
  details: Extract<SelectionDetails, { kind: 'dwellings' }>;
} & RelocationActions): ReactElement {
  return (
    <div className="hud-split">
      <div className={`${ROW} min-w-0`}>
        <Stat src="/icons/build/zemnice.png" name="Domácnosti" testId="selection-households">
          {details.households}
        </Stat>
        <Stat icon="people" name="Lidé" testId="selection-people">
          {details.people}
        </Stat>
      </div>
      <Commands>
        <div className="flex items-center gap-2">
          {details.relocate && (
            <RelocateButtons
              options={details.relocate}
              households={details.relocatable.length}
              onRelocate={onRelocate ? (type) => onRelocate(type, details.relocatable) : undefined}
            />
          )}
          <LeaveControls leave={details.leave} onLeave={onLeave} />
        </div>
      </Commands>
    </div>
  );
}

/**
 * Rodiny v obydlí (kinship.md – Co hráč vidí): muži, ženy, děti, starší a manželské páry – ikony
 * s čísly, bez slov (rozhraní jako v 0 A.D.).
 */
function FamilyRow({ family }: { family: FamilyCounts }): ReactElement {
  const items: { icon: string; name: string; value: number }[] = [
    { icon: 'man', name: 'Muži', value: family.men },
    { icon: 'woman', name: 'Ženy', value: family.women },
    { icon: 'child', name: 'Děti', value: family.boys + family.girls },
    { icon: 'elder', name: 'Starší', value: family.elderMen + family.elderWomen },
    { icon: 'ring', name: 'Manželské páry', value: family.couples },
  ];
  return (
    <div data-testid="selection-family" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <Stat
          key={item.icon}
          icon={item.icon}
          name={item.name}
          testId={`selection-family-${item.icon}`}
        >
          {item.value}
        </Stat>
      ))}
    </div>
  );
}

/** Dřevo, které stavba ještě musí skácet (forest.md) – ikona a počet stromů. */
function WoodToFell({ trees }: { trees: number }): ReactElement {
  return (
    <Stat icon="wood" name="Stromy ke skácení" testId="selection-wood">
      {trees}
    </Stat>
  );
}

function FieldBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'field' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        <Stat icon="food" name="Úrodnost" testId="selection-fertility">
          {Math.round(details.fertility)}
        </Stat>
        {details.ashBonus > 0 && (
          <Tooltip
            content={`Popel z vymýceného lesa – úrodnost +40 první sezónu osevu, +20 druhou (${details.ashParts} ${plural(details.ashParts, 'díl', 'díly', 'dílů')})`}
            placement="above"
          >
            <span
              data-testid="selection-ash"
              tabIndex={0}
              className="text-xs font-semibold text-amber-300 tabular-nums"
            >
              +{details.ashBonus}
            </span>
          </Tooltip>
        )}
        {details.crops.map(({ crop, count }) => (
          <Stat
            key={crop}
            icon={CROP_LABELS[crop].icon}
            name={CROP_LABELS[crop].name}
            testId={`selection-crop-${crop}`}
          >
            {count}
          </Stat>
        ))}
        {details.overgrowingM2 > 0 && (
          <Stat icon="overgrowth" name="Zarůstá" testId="selection-overgrowing">
            {formatHa(details.overgrowingM2)}
          </Stat>
        )}
      </div>
      <ul aria-label="Díly pole" className="flex flex-wrap gap-x-2.5 gap-y-1">
        {details.stages.map(({ stage, count }) => (
          <li key={stage}>
            <Tooltip content={PART_STAGE_NAMES[stage]} placement="above">
              <span
                data-stage={stage}
                tabIndex={0}
                className="flex items-center gap-1 text-xs tabular-nums"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm border border-black/50"
                  style={{ background: `rgb(${PART_COLORS[stage].join(' ')})` }}
                />
                {count}
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
      {details.surfaces.length > 0 && (
        <ul aria-label="Povrch dílů při založení" className="flex flex-wrap gap-x-2.5 gap-y-1">
          {details.surfaces.map(({ surface, count }) => (
            <li key={surface}>
              <Tooltip content={FIELD_SURFACE_NAMES[surface]} placement="above">
                <span
                  data-surface={surface}
                  tabIndex={0}
                  className="flex items-center gap-1 text-xs tabular-nums"
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full border border-black/50"
                    style={{ background: `rgb(${SURFACE_COLORS[surface].join(' ')})` }}
                  />
                  {count}
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      {details.founding !== null && <Bar value={details.founding} name="Založení" />}
    </div>
  );
}

/** Výměra dílu pole či čtverce sadu v m² – „225 m²“. */
function formatM2(areaM2: number): string {
  return `${formatInteger(areaM2)} m²`;
}

/** Chůze z nejbližšího obydlí po pěšinách a cestách – ikona šlépějí a metry (paths.md). */
function Walk({ meters }: { meters: number }): ReactElement {
  return (
    <Stat icon="walk" name="Cesta z domu" testId="selection-walk">
      {formatInteger(meters)} m
    </Stat>
  );
}

/** Ikona bez čísla s popiskem (pasou se stáda, čeká na obnovu…). */
function Flag({
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

/** Příprava půdy dílu – ikona a popisek podle úlohy (fields.md – Práce, oxen.md). */
const PREP_LOOKS: Record<'reclaim' | 'plough' | 'dig', { icon: string; name: string }> = {
  reclaim: { icon: 'labor', name: 'Rozrytí drnu přílohu' },
  plough: { icon: 'ox', name: 'Orba rádlem' },
  dig: { icon: 'labor', name: 'Kopání motykou' },
};

/**
 * Díl pole (fields.md – Co hráč vidí; Martin 19. 10. 2026: „Když kliknu na pole, zobrazí se mi
 * jen to jedno políčko s parametry.“): výměra, úrodnost (v popisku přirozená), cesta z domu
 * a hospodářství – ikona domu, kliknutím vybere dům; osetý díl letošní práci (příprava půdy,
 * setí s ikonou plodiny, sklizeň) a kolikátý rok je v osevu; příloh roky ladem, zarůstání,
 * pastvu a seč; zakládaný díl průběh, zbývající práci a stromy na klády.
 */
function FieldPartBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'field-part' }>;
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement {
  const { crop, holding, founding } = details;
  const fallow = details.fallowYears !== null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatM2(details.areaM2)}
          </span>
        </Tooltip>
        <Stat
          icon="food"
          name={`Úrodnost – přirozená ${details.naturalFertility}`}
          testId="selection-fertility"
        >
          {details.fertility}
        </Stat>
        {details.ashBonus > 0 && (
          <Tooltip
            content="Popel z vymýceného lesa – úrodnost +40 první sezónu osevu, +20 druhou"
            placement="above"
          >
            <span
              data-testid="selection-ash"
              tabIndex={0}
              className="text-xs font-semibold text-amber-300 tabular-nums"
            >
              +{details.ashBonus}
            </span>
          </Tooltip>
        )}
        <Walk meters={details.walkM} />
        {holding && (
          <Tooltip
            content={`Hospodářství – ${DWELLING_NAMES[holding.type].nominative.toLowerCase()}`}
            placement="above"
          >
            <button
              type="button"
              data-testid="selection-holding"
              aria-label="Hospodářství"
              className="hud-icon-button h-7 w-7"
              onClick={() => onSelectTarget?.({ kind: 'dwelling', id: holding.dwellingId })}
            >
              <img
                src={`/icons/build/${holding.type}.png`}
                alt=""
                width={128}
                height={128}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        )}
        {details.surface !== 'meadow' && (
          <Tooltip content={FIELD_SURFACE_NAMES[details.surface]} placement="above">
            <span data-surface={details.surface} tabIndex={0} className="flex items-center">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-full border border-black/50"
                style={{ background: `rgb(${SURFACE_COLORS[details.surface].join(' ')})` }}
              />
            </span>
          </Tooltip>
        )}
      </div>
      {crop && (
        <div className={ROW}>
          {crop.prep && (
            <Stat
              icon={PREP_LOOKS[crop.prep.task].icon}
              name={PREP_LOOKS[crop.prep.task].name}
              testId="selection-prep"
            >
              {formatPercent(crop.prep.share)}
            </Stat>
          )}
          <Stat
            icon={CROP_LABELS[crop.crop].icon}
            name={`Setí – ${CROP_LABELS[crop.crop].name}`}
            testId={`selection-sow-${crop.crop}`}
          >
            {formatPercent(crop.sow)}
          </Stat>
          <Stat icon="harvest" name="Sklizeň" testId="selection-harvest">
            {formatPercent(crop.harvest)}
          </Stat>
          {details.sownYears !== null && (
            <Stat icon="date" name="Rok osevu za sebou" testId="selection-sown-years">
              {details.sownYears + 1}.
            </Stat>
          )}
        </div>
      )}
      {fallow && (
        <div className={ROW}>
          <Stat icon="date" name="Ladem (roky)" testId="selection-fallow-years">
            {details.fallowYears}
          </Stat>
          {details.overgrowthYears > 0 && (
            <Stat icon="overgrowth" name="Bez pastvy a seče (roky)" testId="selection-overgrowth">
              {details.overgrowthYears}
            </Stat>
          )}
          {details.grazed === true && (
            <Flag icon="sheep" name="Pasou se tu stáda" testId="selection-grazed" />
          )}
          {details.mow !== null && (
            <Stat icon="hay" name="Seč sena" testId="selection-mow">
              {formatPercent(details.mow)}
            </Stat>
          )}
        </div>
      )}
      {founding && (
        <div className={ROW}>
          <Bar value={founding.progress} name="Založení" testId="selection-progress" />
          <Stat icon="labor" name="Zbývá práce (člověkodny)" testId="selection-labor-left">
            {formatDecimal(founding.laborLeft, 1)}
          </Stat>
          {founding.trees > 0 && (
            <Stat icon="wood" name="Stromy – dají klády" testId="selection-trees">
              {founding.trees}
            </Stat>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Čtverec sadu (orchard.md – Co hráč vidí): výměra, stáří, úroda čtverce a cesta z domu;
 * výsadba či obnova průběhem, čtverec čekající na obnovu ikonou přesýpacích hodin.
 */
function OrchardSquareBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'orchard-square' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatM2(details.areaM2)}
          </span>
        </Tooltip>
        {details.ageYears !== null && (
          <Stat icon="date" name="Stáří (roky)" testId="selection-age">
            {details.ageYears}
          </Stat>
        )}
        <Stat icon="apples" name="Úroda (kg)" testId="selection-yield">
          {formatInteger(details.expectedYieldKg)}
        </Stat>
        <Walk meters={details.walkM} />
        {details.renewal && details.planting === null && (
          <Flag icon="hourglass" name="Čeká na obnovu" testId="selection-renewal" />
        )}
      </div>
      {details.planting !== null && (
        <div className="flex items-center gap-1.5">
          <Bar
            value={details.planting}
            name={details.renewal ? 'Obnova' : 'Výsadba'}
            testId="selection-progress"
          />
          {details.plantingWaits && (
            <Flag
              icon="date"
              name="Sází se na jaře a na podzim"
              testId="selection-planting-waits"
            />
          )}
        </div>
      )}
    </div>
  );
}

function CemeteryBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'cemetery' }>;
}): ReactElement {
  if (!details.built) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <Bar value={details.building ?? 0} name="Založení" testId="selection-progress" />
      </div>
    );
  }
  const full = details.freePlaces === 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {/* místa na hroby – mohyla významného zabere víc míst (cemetery.md) */}
        <Tooltip content={`Hroby – pohřbených ${details.graves}`} placement="above">
          <span
            data-testid="selection-graves"
            tabIndex={0}
            className={`text-sm font-semibold tabular-nums ${full ? 'text-red-400' : ''}`}
          >
            {details.usedPlaces}/{details.capacity}
          </span>
        </Tooltip>
        <Stat icon="date" name="Místo na roky" testId="selection-years">
          {formatYearsShort(details.yearsLeft)}
        </Stat>
        <Wear condition={details.condition} abandoned={details.abandoned} name="Plot – stav" />
      </div>
      {details.building !== null && <Bar value={details.building} name="Rozšíření" />}
      {details.repair !== null && <RepairBar value={details.repair} name="Oprava plotu" />}
    </div>
  );
}

function OrchardBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'orchard' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        {details.ageYears !== null && (
          <Stat icon="date" name="Stáří (roky)" testId="selection-age">
            {details.ageYears}
          </Stat>
        )}
        <Stat icon="apples" name="Úroda (kg)" testId="selection-yield">
          {formatInteger(details.expectedYieldKg)}
        </Stat>
      </div>
      {details.planting !== null && (
        <div className="flex items-center gap-1.5">
          <Bar value={details.planting} name="Výsadba" testId="selection-progress" />
          {details.plantingWaits && (
            <Tooltip content="Sází se na jaře a na podzim" placement="above">
              <img
                data-testid="selection-planting-waits"
                src="/icons/resources/date.png"
                alt="Sází se na jaře a na podzim"
                width={18}
                height={18}
                tabIndex={0}
              />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kolik místo přidává štěstí (happiness.md) – ikona štěstí a „+N“; rozestavěná stavba přidá až
 * po dostavění (bledší).
 */
function HappinessGain({
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

/** Dospělé duby – ikona dubu a počet (háj: duby v háji, stavba: duby ke skácení). */
function Oaks({
  count,
  name,
  testId,
}: {
  count: number;
  name: string;
  testId: string;
}): ReactElement {
  return (
    <Stat src="/icons/build/dub.png" name={name} testId={testId}>
      {count}
    </Stat>
  );
}

/**
 * Stáří posvátného dubu (háj: nejstaršího dubu) – ikona data a roky jako u obydlí a sadu;
 * neznámé se neukáže.
 */
function OakAge({ years }: { years: number | null }): ReactElement | null {
  if (years === null) return null;
  return (
    <Stat icon="date" name="Stáří (roky)" testId="selection-age">
      {formatInteger(years)}
    </Stat>
  );
}

/** Seno v tunách s jedním desetinným místem – „3,0 t“. */
function formatTons(kg: number): string {
  return `${formatDecimal(Math.max(0, kg) / 1000, 1)} t`;
}

/**
 * Ohrada (oxen.md – Co hráč vidí, Ohrady podle druhu): rozestavěná jen průběh stavby; hotová druh
 * zvířat s obsazením a místy na noc (v ohradě / místa), místa všech ohrad druhu / kolik jich stádo
 * potřebuje (červeně, když chybí – Martin 20. 10. 2026), čtverce (nejvýš 4), rozšíření ve stavbě,
 * seno, stav (chátrání, oprava), stáda vsi s pastvou; ohrada spřežení voly, stáří spřežení (kolik
 * let ještě slouží) a průběh výcviku. Spřežení se cvičí samo (Martin 19. 10. 2026) – tlačítko není.
 */
function PenBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'pen' }>;
}): ReactElement {
  const squares = (
    <Stat icon="fields" name="Čtverce ohrady (nejvýš 4)" testId="selection-pen-squares">
      {details.squares}/{MAX_PEN_SQUARES}
    </Stat>
  );
  if (!details.built) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <Stat icon="labor" name="Stavba">
            {formatPercent(details.progress)}
          </Stat>
          {squares}
        </div>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
      </div>
    );
  }
  const animal = penVariant(details.species);
  const team = details.species === 'team';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {team ? (
          <Stat icon="ox" name="Voli v ohradě" testId="selection-oxen">
            {details.oxen}
          </Stat>
        ) : (
          <Stat
            icon={animal.icon}
            name={`${animal.name} v ohradě na noc / místa`}
            testId="selection-pen-animals"
          >
            {formatInteger(details.animals)}/{formatInteger(details.places)}
          </Stat>
        )}
        {details.herdPlaces && (
          <Stat
            src="/icons/build/ohrada.png"
            name={`Místa v ohradách – ${animal.name.toLowerCase()}: všechny ohrady / potřeba (u domů ${formatInteger(details.herdPlaces.home)})`}
            testId="selection-pen-need"
            alert={details.herdPlaces.pens < details.herdPlaces.needed}
          >
            {formatInteger(details.herdPlaces.pens)}/{formatInteger(details.herdPlaces.needed)}
          </Stat>
        )}
        {squares}
        <Stat icon="hay" name="Seno" testId="selection-hay">
          {formatTons(details.hayKg)}
        </Stat>
        {details.milkLPerDay > 0 && (
          <Stat icon="cheese" name="Mléko stád (l/den)" testId="selection-milk">
            {formatInteger(details.milkLPerDay)}
          </Stat>
        )}
        <Wear condition={details.condition} abandoned={details.abandoned} />
      </div>
      {details.repair !== null && <RepairBar value={details.repair} />}
      {details.extension !== null && (
        <Bar value={details.extension} name="Rozšíření ohrady" testId="selection-extension" />
      )}
      <ul aria-label="Stáda vsi" className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {HERD_ORDER.map((species) => (
          <li key={species}>
            <Stat
              icon={HERD_LABELS[species].icon}
              name={HERD_LABELS[species].name}
              testId={`selection-herd-${species}`}
            >
              {formatInteger(details.herds[species])}
            </Stat>
          </li>
        ))}
        <li>
          <Stat icon="chicken" name="Slepice" testId="selection-herd-chicken">
            {formatInteger(details.chickens)}
          </Stat>
        </li>
        <li>
          <Tooltip content="Pastva – spásáno / celkem" placement="above">
            <span
              data-testid="selection-pasture"
              tabIndex={0}
              className={`text-xs font-semibold tabular-nums ${details.grazingHa > details.pastureHa ? 'text-red-400' : ''}`}
            >
              {formatDecimal(details.grazingHa, 1)}/{formatDecimal(details.pastureHa, 1)} ha
            </span>
          </Tooltip>
        </li>
      </ul>
      {details.team && (
        <div className="flex items-center gap-3">
          <Stat icon="ox" name="Spřežení – stáří (roky)" testId="selection-team-age">
            {details.team.ageYears}
          </Stat>
          <Stat icon="hourglass" name="Spřežení – slouží ještě (roky)" testId="selection-team-left">
            {details.team.yearsLeft}
          </Stat>
        </div>
      )}
      {details.training && (
        <div className="flex items-center gap-1.5">
          <Bar
            value={details.training.progress}
            name="Výcvik spřežení"
            testId="selection-training"
          />
          <Stat icon="hourglass" name="Výcvik – zbývá dní" testId="selection-training-days">
            {formatInteger(details.training.daysLeft)}
          </Stat>
        </div>
      )}
    </div>
  );
}

/** Portréty stupňů cesty a ikony tlačítek vylepšení (`/icons/build/<ikona>.png`). */
export const ROAD_KIND_ICONS: Record<RoadKind, string> = {
  trodden: 'cesta',
  cart: 'cesta-vyjezdena',
  improved: 'cesta-upravena',
  causeway: 'hat',
};

/**
 * Pevná cesta (roads.md – Co hráč vidí, Cesta pro hráče – celý řetěz úseků): délka, u cesty
 * z víc stupňů délka po stupních, vozová část, stáří, stromy u ní, jabloně (z nich plodící),
 * mokřina a brody; rozestavěné vylepšení a výsadba jabloní průběh; tlačítka vylepšení a „Vysadit
 * jabloně“ (ikony, cena v popisku jako v 0 A.D.) – když nejde, zašedlé s důvodem červeně.
 */
function RoadBody({
  details,
  onUpgrade,
  onPlantApples,
}: {
  details: Extract<SelectionDetails, { kind: 'road' }>;
  onUpgrade?: (roadId: number, upgrade: RoadUpgrade) => Promise<void>;
  onPlantApples?: (roadId: number) => Promise<void>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const run = (upgrade: RoadUpgrade): void => {
    if (!onUpgrade || busy) return;
    setBusy(true);
    void onUpgrade(details.id, upgrade).finally(() => setBusy(false));
  };
  const plant = (): void => {
    if (!onPlantApples || busy) return;
    setBusy(true);
    void onPlantApples(details.id).finally(() => setBusy(false));
  };
  const { apples } = details;
  return (
    <div className="hud-split">
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <div className={ROW}>
          <Tooltip content="Délka" placement="above">
            <span
              data-testid="selection-length"
              tabIndex={0}
              className="text-sm font-semibold tabular-nums"
            >
              {formatInteger(details.lengthM)} m
            </span>
          </Tooltip>
          {details.kinds.length > 1 &&
            details.kinds.map((k) => (
              <Stat
                key={k.kind}
                src={`/icons/build/${ROAD_KIND_ICONS[k.kind]}.png`}
                name={ROAD_KIND_NAMES[k.kind]}
                testId={`selection-road-${k.kind}`}
              >
                {formatInteger(k.lengthM)} m
              </Stat>
            ))}
          <Stat icon="date" name="Stáří (roky)" testId="selection-road-age">
            {details.ageYears}
          </Stat>
          <Oaks count={details.trees} name="Stromy u cesty" testId="selection-road-trees" />
          {apples.trees > 0 && (
            <Stat icon="apples" name="Jabloně (plodí)" testId="selection-road-apples">
              {apples.trees}
              {apples.bearing < apples.trees ? ` (${apples.bearing})` : ''}
            </Stat>
          )}
          {(details.wetM > 0 || details.fords > 0) && (
            <Tooltip content="Mokřina a brody" placement="above">
              <span
                data-testid="selection-wet"
                tabIndex={0}
                className="text-xs font-semibold tabular-nums"
              >
                {formatInteger(details.wetM)} m · {details.fords}×
              </span>
            </Tooltip>
          )}
        </div>
        {details.building && (
          <div className={ROW}>
            <Bar value={details.building.progress} name="Vylepšení" testId="selection-progress" />
            {details.building.treesToFell > 0 && (
              <WoodToFell trees={details.building.treesToFell} />
            )}
          </div>
        )}
        {apples.planting && (
          <div className={ROW}>
            <Bar
              value={apples.planting.progress}
              name="Výsadba jabloní"
              testId="selection-apples-progress"
            />
            {apples.planting.waits && (
              <Tooltip content="Sází se na jaře a na podzim" placement="above">
                <img
                  data-testid="selection-apples-waits"
                  src="/icons/resources/date.png"
                  alt="Sází se na jaře a na podzim"
                  width={18}
                  height={18}
                  tabIndex={0}
                />
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <Commands row>
        {details.upgrades.map((option) => (
          <Tooltip
            key={option.upgrade}
            placement="above"
            content={
              <span className="flex flex-col gap-0.5">
                <span>{ROAD_UPGRADE_NAMES[option.upgrade]}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="flex items-center gap-1">
                    <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
                    {formatDecimal(option.laborManDays, 0)}
                  </span>
                  {option.trees > 0 && (
                    <span className="flex items-center gap-1">
                      <img src="/icons/resources/wood.png" alt="" width={16} height={16} />
                      {option.trees}
                    </span>
                  )}
                  {option.swathTrees > 0 && <SwathTrees trees={option.swathTrees} />}
                </span>
                {option.blocked && (
                  <span data-testid="road-upgrade-blocked" className="font-semibold text-red-400">
                    {option.blocked}
                  </span>
                )}
              </span>
            }
          >
            <button
              type="button"
              data-testid={`road-upgrade-${option.upgrade}`}
              aria-label={ROAD_UPGRADE_NAMES[option.upgrade]}
              disabled={option.blocked !== null || busy || !onUpgrade}
              aria-busy={busy}
              onClick={() => run(option.upgrade)}
              className={`hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
            >
              <img
                src={`/icons/build/${ROAD_KIND_ICONS[option.upgrade]}.png`}
                alt=""
                width={40}
                height={40}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        ))}
        <Tooltip
          placement="above"
          content={
            <span className="flex flex-col gap-0.5">
              <span>Vysadit jabloně</span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="flex items-center gap-1">
                  <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
                  {formatDecimal(apples.option.laborManDays, 0)}
                </span>
                {apples.option.trees > 0 && (
                  <span className="flex items-center gap-1">
                    <img src="/icons/resources/apples.png" alt="" width={16} height={16} />
                    {apples.option.trees}
                  </span>
                )}
              </span>
              {apples.option.blocked && (
                <span data-testid="road-apples-blocked" className="font-semibold text-red-400">
                  {apples.option.blocked}
                </span>
              )}
              {!apples.option.blocked && apples.option.warning && (
                <span
                  data-testid="road-apples-warning"
                  className="font-semibold whitespace-pre-line text-[#ffc27a]"
                >
                  {apples.option.warning}
                </span>
              )}
            </span>
          }
        >
          <button
            type="button"
            data-testid="road-plant-apples"
            aria-label="Vysadit jabloně"
            disabled={apples.option.blocked !== null || busy || !onPlantApples}
            aria-busy={busy}
            onClick={plant}
            className={`hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
          >
            <img
              src="/icons/build/jablone.png"
              alt=""
              width={40}
              height={40}
              className="h-full w-full"
            />
          </button>
        </Tooltip>
      </Commands>
    </div>
  );
}

const SACRED_ICONS: Record<Extract<SelectionDetails, { kind: 'sacred' }>['type'], string> = {
  idol: 'modla',
  shrine: 'svatyne',
};

function SacredBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'sacred' }>;
}): ReactElement {
  if (details.building === null) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <HappinessGain value={details.happiness} />
          <Wear condition={details.condition} abandoned={details.abandoned} />
        </div>
        {details.repair !== null && <RepairBar value={details.repair} />}
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-center gap-1.5">
      <div className="flex items-center gap-3">
        <Stat icon="labor" name="Stavba">
          {formatPercent(details.building)}
        </Stat>
        <HappinessGain value={details.happiness} pending />
        {details.oaksToFell > 0 && (
          <Oaks count={details.oaksToFell} name="Duby ke skácení" testId="selection-oaks" />
        )}
      </div>
      <Bar value={details.building} name="Stavba" testId="selection-progress" />
    </div>
  );
}

/**
 * Panel výběru dole uprostřed (jako v 0 A.D.) – jen když je něco vybrané: portrét, typ
 * a ikony s čísly. Obydlí: obyvatelé, věk obyvatel, stav, stáří (u přestavby i stromy ke
 * skácení), dílna navíc co dělá, práci za den a zásobu výrobku (crafts.md); staveniště: průběh
 * stavby a stromy, které ještě musí skácet;
 * díl pole (klik): co na něm je, výměra, úrodnost, cesta, hospodářství (`onSelectTarget` vybere
 * dům), letošní práce nebo příloh; pole (dvojklik): výměra, úrodnost, díly podle stadia; hřbitov:
 * hroby, na kolik let místo vystačí a průběh založení / rozšíření; čtverec sadu (klik): výměra,
 * stáří, úroda a výsadba či obnova; sad (dvojklik): výměra, stáří, úroda příští sklizně a průběh
 * výsadby;
 * posvátný dub, háj, modla a svatyně: kolik přidávají štěstí (háj i počet dubů), rozestavěná
 * modla a svatyně průběh stavby a duby ke skácení; ohrada: zvířata, seno, stáda, spřežení
 * a výcvik (cvičí se samo); pevná cesta: délka, stáří, stromy,
 * vylepšení (`onUpgradeRoad`) a výsadba jabloní (`onPlantRoadApples`). Obydlí a víc vybraných
 * obydlí: Přestěhovat (`onRelocate`), Odejít (zatím zašedlé) a průběh stěhování se zrušením
 * (`onCancelRelocation` – migration.md).
 */
export function SelectionPanel({
  details,
  onSelectTarget,
  onRelocate,
  onCancelRelocation,
  onLeave,
  onUpgradeRoad,
  onPlantRoadApples,
  onBuildTrail,
  onSendExpedition,
}: {
  details: SelectionDetails | null;
  /** Vybere jiný cíl ve vsi – dům hospodářství z panelu dílu pole. */
  onSelectTarget?: (target: VillageTarget) => void;
  /** Zadá vylepšení pevné cesty (server action) – hotovo, až se vrátí. */
  onUpgradeRoad?: (roadId: number, upgrade: RoadUpgrade) => Promise<void>;
  /** Zadá výsadbu jabloní podél pevné cesty (server action) – hotovo, až se vrátí. */
  onPlantRoadApples?: (roadId: number) => Promise<void>;
} & RelocationActions &
  ManorActions): ReactElement | null {
  const [panelRef, scroll] = useOverflowScroll();
  if (!details) return null;
  let portrait: ReactElement;
  let body: ReactElement;
  if (details.kind === 'road') {
    portrait = (
      <Portrait icon={ROAD_KIND_ICONS[details.roadKind]} name={ROAD_KIND_NAMES[details.roadKind]} />
    );
    body = (
      <RoadBody
        key={details.id}
        details={details}
        onUpgrade={onUpgradeRoad}
        onPlantApples={onPlantRoadApples}
      />
    );
  } else if (details.kind === 'pen') {
    portrait = <Portrait icon="ohrada" name={PEN_NAMES[details.species]} />;
    body = <PenBody key={details.id} details={details} />;
  } else if (details.kind === 'field') {
    portrait = <Portrait icon="pole" name="Pole" />;
    body = <FieldBody details={details} />;
  } else if (details.kind === 'field-part') {
    portrait = <Portrait icon="pole" name={fieldPartName(details)} />;
    body = <FieldPartBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'orchard-square') {
    portrait = <Portrait icon="sad" name={orchardSquareName(details)} />;
    body = <OrchardSquareBody details={details} />;
  } else if (details.kind === 'cemetery') {
    portrait = <Portrait icon="hrbitov" name="Hřbitov" />;
    body = <CemeteryBody details={details} />;
  } else if (details.kind === 'orchard') {
    portrait = <Portrait icon="sad" name="Sad" />;
    body = <OrchardBody details={details} />;
  } else if (details.kind === 'sacred-oak') {
    portrait = details.snag ? (
      <Portrait icon="sous" name="Posvátná souš" />
    ) : (
      <Portrait icon="dub" name="Posvátný dub" />
    );
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <div className={ROW}>
          <HappinessGain value={details.happiness} />
          <OakAge years={details.ageYears} />
        </div>
      </div>
    );
  } else if (details.kind === 'grove') {
    portrait = <Portrait icon="haj" name="Dubový háj" />;
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <div className={ROW}>
          <HappinessGain value={details.happiness} />
          <Oaks count={details.oaks} name="Dospělé duby" testId="selection-grove-oaks" />
          <OakAge years={details.ageYears} />
        </div>
      </div>
    );
  } else if (details.kind === 'sacred') {
    portrait = (
      <Portrait icon={SACRED_ICONS[details.type]} name={SACRED_BUILDING_NAMES[details.type]} />
    );
    body = <SacredBody details={details} />;
  } else if (details.kind === 'site') {
    portrait = dwellingPortrait(details.type, details.craft);
    body = (
      <div className="flex flex-col items-start justify-center gap-1.5">
        <div className={ROW}>
          <Stat icon="labor" name="Stavba">
            {formatPercent(details.progress)}
          </Stat>
          {details.treesToFell > 0 && <WoodToFell trees={details.treesToFell} />}
        </div>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
        {details.relocates !== null && (
          <CancelRelocationButton constructionId={details.id} onCancel={onCancelRelocation} />
        )}
      </div>
    );
  } else if (details.kind === 'dwellings') {
    portrait = <Portrait icon="zemnice" name={`Obydlí (${details.ids.length})`} />;
    body = <DwellingsBody details={details} onRelocate={onRelocate} onLeave={onLeave} />;
  } else {
    // dvorec vojvody (trade.md) – i když je to zatím zemnice zakladatelů
    portrait = details.manor ? (
      <Portrait icon={details.type} name="Dvorec vojvody" />
    ) : (
      dwellingPortrait(details.type, details.workshop?.craft ?? null)
    );
    body = (
      <DwellingBody
        details={details}
        onRelocate={onRelocate}
        onCancelRelocation={onCancelRelocation}
        onLeave={onLeave}
        onBuildTrail={onBuildTrail}
        onSendExpedition={onSendExpedition}
      />
    );
  }
  // Panel roste s obsahem (w-max) do mezí `hud-selection` (globals.css – mezi minimapou a mřížkou
  // staveb, nejvýš 70 % okna); text se nezalamuje, širší obsah se zalomí po celých položkách.
  return (
    <section
      ref={panelRef}
      data-testid="selection-panel"
      data-kind={details.kind}
      data-scroll={scroll || undefined}
      data-hud-block
      aria-label="Výběr"
      className="hud-panel hud-selection fixed left-1/2 z-20 w-max min-w-[20rem] -translate-x-1/2 p-2 whitespace-nowrap"
    >
      <div className="flex min-h-24 gap-3">
        {portrait}
        {body}
      </div>
    </section>
  );
}
