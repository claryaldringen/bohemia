/** Panel výběru dílen řemeslníků, rudiště, hliniště a milíře. */
import { type ReactElement } from 'react';
import { AGE, CART_NAMES } from '@bohemia/game';
import { VillageTarget } from '@/lib/scene/village-picking';
import {
  type SelectionBuying,
  type SelectionDetails,
  type SelectionWorkshop,
} from '@/lib/selection-details';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { formatDecimal, formatInteger, formatPercent, plural } from '@/lib/village-format';
import {
  CRAFT_LOOKS,
  PRODUCT_ICONS,
  PRODUCT_TITLES,
  boughtProducts,
  productList,
  type Craft,
  type WorkshopActivity,
} from '@/lib/village-view';
import { DugSiteWorker } from '@/lib/ore-site-view';
import { KilnFetcher } from '@/lib/kiln-view';
import { Tooltip } from '../Tooltip';
import { Stat, Bar, ROW, Flag } from './parts';

/**
 * Co dílna dělá – ikona (výrobek, dřevo, uhlí, lidé) s červeným tónem, když stojí, a popisek
 * v tooltipu; u výroby kolik kg za den.
 */
/** Čeho má ves dost, když řemeslník pomáhá vsi (2. pád). */
export const ENOUGH: Record<Craft, string> = {
  burner: 'Uhlí',
  smith: 'Nástrojů ve vybavení a hřiven',
  potter: 'Keramiky',
  carpenter: 'Vozů a nářadí',
};

export function activityLook(workshop: SelectionWorkshop): {
  icon: string;
  name: string;
  value: string;
  stalled: boolean;
} {
  const product = CRAFT_LOOKS[workshop.craft].product;
  const perDay = `${formatDecimal(workshop.outputPerDayKg, 1)} kg/den`;
  const kiln = workshop.kiln;
  const percent = kiln ? formatPercent(kiln.progress) : '–';
  // vypálené milíře jsou zásobou uhlí – uhlíř z nich nosí kováři (crafts.md – Milíř stojí vždy)
  const burnt = workshop.kilns.filter((k) => k.stage === 'draw');
  const inKiln =
    burnt.length > 0 ? formatInteger(burnt.reduce((sum, k) => sum + k.charcoalKg, 0)) : null;
  // tesař (wagons.md): rozdělaný vůz, pomoc stavbám; vůz, který čeká na kování, se nevyrábí –
  // tesař dělá nářadí (wagons.md – Kování vozů)
  const making = workshop.carpenter?.iron ? null : (workshop.carpenter?.making ?? null);
  const looks: Record<WorkshopActivity, { icon: string; name: string; value: string }> = {
    producing: workshop.iron
      ? {
          icon: 'tools',
          name: 'Kove nástroje z hřiven do vybavení domácností',
          value: perDay,
        }
      : making
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
            name: 'Milíř je vypálený – uhlí z něj vytahá, jak ho kovář spotřebuje, a další začne včas; zatím pomáhá vsi (kg uhlí v milířích)',
            value: inKiln,
          }
        : {
            icon: 'people',
            name: `${ENOUGH[workshop.craft]} je dost na rok – pomáhá vsi na poli a se stavbami`,
            value: '–',
          },
    // řetěz kovárny (production-chains.md – Kovář): tavba a překování houby na hřivny
    smelting: {
      icon: 'bloom',
      name:
        workshop.iron?.bellows === null
          ? 'Taví železnou houbu v redukční peci – bez měchaře polovičním tempem (kg houby u kovárny)'
          : 'Taví železnou houbu v redukční peci (kg houby u kovárny)',
      value: formatDecimal(workshop.iron?.bloomKg ?? 0, 1),
    },
    refining: {
      icon: 'iron-bars',
      name: 'Překovává houbu na hřivny (kg hřiven)',
      value: formatDecimal(workshop.iron?.barsKg ?? 0, 1),
    },
    'no-charcoal': { icon: 'charcoal', name: 'Čeká na uhlí – zatím pomáhá vsi', value: '0' },
    'no-ore': {
      icon: 'ore',
      name: 'Nemá rudu – v okolí není mokřina ani potok, kde ji kopat; zatím pomáhá vsi',
      value: '0',
    },
    'no-clay': {
      icon: 'clay',
      name: 'Nemá hlínu – v okolí není mokřina ani potok, kde ji kopat; zatím pomáhá vsi',
      value: '0',
    },
    digging:
      workshop.craft === 'potter'
        ? {
            icon: 'clay',
            name: 'Kope hlínu na hliništi a nosí ji do dílny (kg hlíny v dílně)',
            value: formatInteger(workshop.clay?.stockKg ?? 0),
          }
        : {
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
    workshop.activity === 'no-clay' ||
    workshop.activity === 'no-wood' ||
    workshop.activity === 'idle' ||
    workshop.activity === 'empty';
  return { ...look, stalled };
}

/**
 * Dílna hrnčíře (crafts.md – Hlína hrnčíře): zásoba hlíny, hliniště (vzdálenost chůze) a kdo hlínu
 * nosí – hrnčíř, nebo vůz se sedlákem.
 */
export function PotterClayStats({
  clay,
}: {
  clay: NonNullable<SelectionWorkshop['clay']>;
}): ReactElement {
  return (
    <>
      <Stat icon="clay" name="Hlína v dílně (kg)" testId="selection-workshop-clay">
        {formatInteger(clay.stockKg)}
      </Stat>
      {clay.site && (
        <Stat
          icon="walk"
          name={`Hliniště u potoka – cesta z dílny (m), zbývá ${formatInteger(clay.site.leftKg)} kg hlíny`}
          testId="selection-workshop-clay-site"
        >
          {`${formatInteger(clay.site.walkM)} m`}
        </Stat>
      )}
      {clay.cart && (
        <Stat
          icon="cart"
          name="Hlínu z hliniště přiveze sedlák s vozem, když to ušetří práci"
          testId="selection-workshop-clay-cart"
        >
          {''}
        </Stat>
      )}
    </>
  );
}

/**
 * Řetěz kovárny (production-chains.md – Kovář): železná houba u kovárny, zásoba hřiven, kterou
 * kovář drží, nástroje ve vybavení domácností s pokrytím potřeby a kdo u tavby šlape měch.
 */
export function SmithIronStats({
  iron,
}: {
  iron: NonNullable<SelectionWorkshop['iron']>;
}): ReactElement {
  const bellows = iron.bellows;
  const helper =
    bellows === null
      ? { icon: 'man', name: 'Kovář taví sám – bez měchaře polovičním tempem', value: '½' }
      : bellows.kind === 'son'
        ? {
            icon: 'child',
            name: 'Měch u tavby šlape syn (věk) – ten den nepase',
            value: `${bellows.age}`,
          }
        : {
            icon: bellows.sex === 'female' ? 'woman' : 'man',
            name: 'Měch u tavby šlape člen domácnosti (věk)',
            value: `${bellows.age}`,
          };
  return (
    <>
      <Stat icon="bloom" name="Železná houba u kovárny (kg)" testId="selection-workshop-bloom">
        {formatDecimal(iron.bloomKg, 1)}
      </Stat>
      <Stat
        icon="iron-bars"
        name="Hřivny, které kovář drží – na rok obnovy nástrojů a kování k vozům (kg)"
        testId="selection-workshop-bars-target"
      >
        {formatInteger(iron.barsTargetKg)}
      </Stat>
      <Stat
        icon="tools"
        name={`Nástroje ve vybavení domácností (kg) – pokrytí potřeby ${formatPercent(iron.coverage)}`}
        testId="selection-workshop-equipment"
      >
        {formatInteger(iron.equipmentKg)}
      </Stat>
      <Stat icon={helper.icon} name={helper.name} testId="selection-workshop-bellows">
        {helper.value}
      </Stat>
    </>
  );
}

/**
 * Kovárna (crafts.md – Uhlí a ruda kováře): zásoba rudy, rudiště (vzdálenost chůze) a kdo nosí
 * uhlí od milíře – synové 10–13 let, kovář sám, nebo vůz se sedlákem.
 */
export function SmithOreStats({
  ore,
}: {
  ore: NonNullable<SelectionWorkshop['ore']>;
}): ReactElement {
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

/** Fáze milíře pro hráče (crafts.md – Milíř u skácených buků). */
export const KILN_STAGE_NAMES: Record<SelectionWorkshop['kilns'][number]['stage'], string> = {
  wood: 'kácí a připravuje buky',
  build: 'staví se',
  burn: 'pálí se',
  draw: 'vypálený – rozebírá se podle odběru kováře',
};

/**
 * Dílna v panelu výběru: co dělá, práce za den, zásoba výrobku (a pokrytí potřeby vsi); uhlíř i jeho
 * milíře – tlačítka je vyberou (`onSelectTarget`).
 */
export function WorkshopRow({
  workshop,
  onSelectTarget,
}: {
  workshop: SelectionWorkshop;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
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
      <SkillStats craft={workshop.craft} skill={workshop.skill} />
      {/* Zásoba jen u uhlíře (uhlí) a kováře (hřivny); keramiku a dřevěné nářadí si řeší každá
          domácnost sama, nikde se neukazují (Martin 24. 10. 2026) */}
      {(workshop.craft === 'burner' || workshop.craft === 'smith') && (
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
      )}
      {workshop.kilns.map((kiln) =>
        kiln.id === null ? null : (
          <Tooltip
            key={kiln.id}
            content={`Milíř – ${KILN_STAGE_NAMES[kiln.stage]}, cesta ze zemnice ${formatInteger(kiln.walkM)} m`}
            placement="above"
          >
            <button
              type="button"
              data-testid="selection-workshop-kiln"
              data-stage={kiln.stage}
              aria-label="Milíř"
              className="hud-icon-button h-7 w-7"
              onClick={() => onSelectTarget?.({ kind: 'kiln', id: kiln.id! })}
            >
              <img
                src="/icons/build/milir.png"
                alt=""
                width={128}
                height={128}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        ),
      )}
      {workshop.carpenter && <CarpenterStats carpenter={workshop.carpenter} />}
      {workshop.iron && <SmithIronStats iron={workshop.iron} />}
      {workshop.ore && <SmithOreStats ore={workshop.ore} />}
      {workshop.clay && <PotterClayStats clay={workshop.clay} />}
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

/** Řemeslník jako učeň – „hrnčíř“ ve větě (1. pád malým). */
export const CRAFTSMAN: Record<Craft, string> = {
  burner: 'uhlíř',
  smith: 'kovář',
  potter: 'hrnčíř',
  carpenter: 'tesař',
};

/** Roky praxe česky – „1,4 roku“, „5 let“. */
export function practiceYears(years: number): string {
  const whole = Math.abs(years - Math.round(years)) < 1e-9;
  return whole
    ? `${formatInteger(years)} ${plural(years, 'rok', 'roky', 'let')}`
    : `${formatDecimal(years, 1)} roku`;
}

/**
 * Učení řemesla v panelu dílny (crafts.md – Učení řemesla): zkušenost řemeslníka – výkon dílny
 * podle praxe (ikona a %) – a synové, kteří se učí (věk; praxe v popisku).
 */
export function SkillStats({
  craft,
  skill,
}: {
  craft: Craft;
  skill: SelectionWorkshop['skill'];
}): ReactElement {
  const learning = skill.share < 1;
  const sons = skill.apprentices;
  return (
    <>
      <Stat
        icon="skill"
        name={
          learning
            ? `Zkušenost řemeslníka – ${CRAFTSMAN[craft]} se teprve učí (praxe ${practiceYears(skill.years)} z 5 let), dílna pracuje pomaleji`
            : `Zkušenost řemeslníka – vyučený ${CRAFTSMAN[craft]}, dílna pracuje naplno`
        }
        testId="selection-workshop-skill"
        alert={learning}
      >
        {formatPercent(skill.share)}
      </Stat>
      {sons.length > 0 && (
        <Stat
          icon={sons.every((s) => s.age >= 14) ? 'man' : 'child'}
          name={`Řemeslu se učí ${sons.length > 1 ? 'synové' : 'syn'} (věk) – ${sons
            .map((s) => `${s.age} let, praxe ${practiceYears(s.years)}`)
            .join('; ')}`}
          testId="selection-workshop-apprentices"
        >
          {sons.map((s) => `${s.age}`).join(', ')}
        </Stat>
      )}
    </>
  );
}

/**
 * Kování k vozu v panelu tesaře (wagons.md – Kování vozů): vůz čeká na kování, nebo pro něj tesař
 * či jeho syn jde do nejbližší vsi s kovářem – dny do návratu.
 */
export function IronStat({
  iron,
}: {
  iron: NonNullable<NonNullable<SelectionWorkshop['carpenter']>['iron']>;
}): ReactElement {
  const trip = iron.trip;
  if (!trip) {
    return (
      <Stat
        icon="tools"
        name={`Čeká na kování k vozu (${formatInteger(iron.kg)} kg) – mezitím dělá dřevěné nářadí`}
        testId="selection-workshop-iron"
        alert
      >
        {`${formatInteger(iron.kg)} kg`}
      </Stat>
    );
  }
  const who = trip.son ? `Syn tesaře (${trip.age} let)` : 'Tesař';
  const where = `do vsi ${trip.to}${trip.direction ? ` (${DIRECTION_NAMES[trip.direction].name})` : ''}`;
  const days = `${trip.daysLeft} ${plural(trip.daysLeft, 'den', 'dny', 'dní')}`;
  // platbu obilím veze vůz se sedlákem, nebo ji nesou nosiči z vsi (wagons.md – Kování vozů)
  const how = trip.cart
    ? `jede s vozem a sedlákem (${CART_NAMES[trip.cart].toLowerCase()} veze obilí na platbu)`
    : trip.porters > 0
      ? `jde ${trip.porters === 1 ? 's 1 nosičem' : `se ${trip.porters} nosiči`} (nesou obilí na platbu)`
      : 'jde';
  return (
    <Stat
      icon={trip.cart ? 'cart' : 'walk'}
      name={`${who} ${how} pro kování k vozu ${where} – zpět za ${days}`}
      testId="selection-workshop-iron"
    >
      {`${trip.direction ? `${DIRECTION_NAMES[trip.direction].arrow} ` : ''}${trip.daysLeft} d`}
    </Stat>
  );
}

/**
 * Tesař v panelu dílny (wagons.md – Co hráč vidí): vozy vsi proti potřebě (dvoukolák na spřežení,
 * čtyřkolák se stezkou), kování k vozu a pokrytí dřevěné práce staveb.
 */
export function CarpenterStats({
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
      {carpenter.iron && <IronStat iron={carpenter.iron} />}
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
export function BuyingRow({ buying }: { buying: SelectionBuying }): ReactElement {
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

/**
 * Texty panelu rudiště kováře a hliniště hrnčíře (crafts.md – Uhlí a ruda kováře, Hlína hrnčíře):
 * ikona suroviny a portrét místa, bubliny, dílna a co tu kdo dělá (první činnost se surovinou,
 * další se k ní vztahují – „kope rudu a nosí ji v koších do kovárny“).
 */
export const DUG_SITE_TEXTS = {
  'ore-site': {
    test: 'ore',
    resource: 'ore',
    portrait: 'rudiste',
    name: 'Rudiště',
    deposit: 'Ruda v ložisku (kg) – zbývá z celého ložiska',
    heap: 'Vykopaná ruda na hromadě u jámy (kg) – čeká na odnos nebo vůz',
    pits: 'Jámy po kopání rudy – po letech zarostou',
    workshop: 'Kovárna',
    workshopIcon: 'kovar',
    walk: 'Cesta z kovárny',
    stock: 'Ruda v kovárně (kg)',
    craftsman: 'Kovář',
    son: 'Syn kováře',
    dig: ['kope rudu', 'kope ji'],
    carry: ['nosí rudu v koších do kovárny', 'nosí ji v koších do kovárny'],
    ride: ['jede s vozem pro rudu', 'jede pro ni s vozem'],
    idle: 'pracuje na rudišti',
    cart: 'Vůz se sedlákem dnes odváží rudu z hromady do kovárny',
  },
  'clay-site': {
    test: 'clay',
    resource: 'clay',
    portrait: 'hliniste',
    name: 'Hliniště',
    deposit: 'Hlína v hliništi (kg) – zbývá z celého hliniště',
    heap: 'Vykopaná hlína na hromadě u jámy (kg) – čeká na odnos nebo vůz',
    pits: 'Jámy po kopání hlíny – po letech zarostou',
    workshop: 'Dílna hrnčíře',
    workshopIcon: 'hrncir',
    walk: 'Cesta z dílny',
    stock: 'Hlína u dílny (kg)',
    craftsman: 'Hrnčíř',
    son: 'Syn hrnčíře',
    dig: ['kope hlínu', 'kope ji'],
    carry: ['nosí hlínu v koších k dílně', 'nosí ji v koších k dílně'],
    ride: ['jede s vozem pro hlínu', 'jede pro ni s vozem'],
    idle: 'pracuje na hliništi',
    cart: 'Vůz se sedlákem dnes odváží hlínu z hromady k dílně',
  },
} as const;

export type DugSiteKind = keyof typeof DUG_SITE_TEXTS;

/** Co dělá člověk z dílny dnes na rudišti či hliništi – popisek (crafts.md). */
export function dugWorkerName(kind: DugSiteKind, worker: DugSiteWorker): string {
  const texts = DUG_SITE_TEXTS[kind];
  const phrases: [boolean, readonly [string, string]][] = [
    [worker.digs, texts.dig],
    [worker.carries, texts.carry],
    [worker.rides, texts.ride],
  ];
  const tasks = phrases
    .filter(([does]) => does)
    .map(([, [first, next]], k) => (k === 0 ? first : next));
  const what =
    tasks.length > 1 ? `${tasks.slice(0, -1).join(', ')} a ${tasks[tasks.length - 1]}` : tasks[0];
  return `${worker.craftsman ? texts.craftsman : texts.son} (věk) dnes ${what ?? texts.idle}`;
}

/**
 * Rudiště kováře a hliniště hrnčíře (crafts.md – Uhlí a ruda kováře – Co hráč vidí, Hlína hrnčíře;
 * Martin 20. 10. 2026: „Půjde rudiště také označit?“): surovina v ložisku (zbývá / celkem),
 * hromada vykopané suroviny u jámy, jámy, dílna – ikona domu, kliknutím ji vybere –, cesta z ní
 * a zásoba v ní; kdo tu dnes pracuje – řemeslník, synové s věkem a vůz se sedlákem (jen když
 * dnes).
 */
export function DugSiteBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: DugSiteKind }>;
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement {
  const texts = DUG_SITE_TEXTS[details.kind];
  const test = texts.test;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat
          icon={texts.resource}
          name={texts.deposit}
          testId={`selection-${test}-deposit`}
          alert={details.leftKg <= 0}
        >
          {`${formatInteger(details.leftKg)} / ${formatInteger(details.depositKg)}`}
        </Stat>
        <Stat icon={texts.resource} name={texts.heap} testId={`selection-${test}-heap`}>
          {formatInteger(details.heapKg)}
        </Stat>
        <Stat
          src={`/icons/build/${texts.portrait}.png`}
          name={texts.pits}
          testId={`selection-${test}-pits`}
        >
          {formatInteger(details.pits)}
        </Stat>
      </div>
      <div className={ROW}>
        <Tooltip content={texts.workshop} placement="above">
          <button
            type="button"
            data-testid={`selection-${test}-workshop`}
            aria-label={texts.workshop}
            className="hud-icon-button h-7 w-7"
            onClick={() => onSelectTarget?.({ kind: 'dwelling', id: details.workshopId })}
          >
            <img
              src={`/icons/build/${texts.workshopIcon}.png`}
              alt=""
              width={128}
              height={128}
              className="h-full w-full"
            />
          </button>
        </Tooltip>
        <Stat icon="walk" name={texts.walk} testId={`selection-${test}-walk`}>
          {`${formatInteger(details.walkM)} m`}
        </Stat>
        <Stat icon={texts.resource} name={texts.stock} testId={`selection-${test}-stock`}>
          {formatInteger(details.stockKg)}
        </Stat>
      </div>
      {(details.workers.length > 0 || details.cart) && (
        <div className={ROW} data-testid={`selection-${test}-today`}>
          {details.workers.map((worker) => (
            <Stat
              key={`${worker.craftsman ? 'k' : 's'}${worker.age}`}
              icon={worker.age < AGE.adult ? 'child' : 'man'}
              name={dugWorkerName(details.kind, worker)}
              testId={`selection-${test}-worker`}
            >
              {worker.age}
            </Stat>
          ))}
          {details.cart && <Flag icon="cart" name={texts.cart} testId={`selection-${test}-cart`} />}
        </div>
      )}
    </div>
  );
}

/** Kdo dnes nosí uhlí od milíře (tooltip). */
export function kilnFetcherName(fetcher: KilnFetcher): string {
  return `${fetcher.smith ? 'Kovář' : 'Syn kováře'} (věk) dnes nosí uhlí od milíře do kovárny`;
}

/** Co je s milířem teď – ikona, popisek a číslo (crafts.md – Milíř u skácených buků). */
export function kilnStageLook(details: Extract<SelectionDetails, { kind: 'kiln' }>): {
  icon: string;
  name: string;
  value: string;
} {
  if (details.stage === 'remnant') {
    return {
      icon: 'overgrowth',
      name: 'Milířiště – černá uhlíkatá zem po rozebraném milíři; za pár let zaroste (jak zarostlo)',
      value: formatPercent(details.progress),
    };
  }
  if (details.stage === 'wood') {
    return {
      icon: 'wood',
      name: 'Uhlíř kácí a připravuje buky na milíř (připravené / v dávce)',
      value: `${details.prepared}/${details.trees}`,
    };
  }
  if (details.stage === 'build') {
    return { icon: 'wood', name: 'Uhlíř staví milíř', value: formatPercent(details.progress) };
  }
  if (details.stage === 'burn') {
    return {
      icon: 'charcoal',
      name: 'Milíř se pálí – uhlíř ho hlídá ve dne i v noci',
      value: formatPercent(details.progress),
    };
  }
  return {
    icon: 'charcoal',
    name: 'Vypálený milíř se rozebírá, jak kovář odebírá uhlí (kg uhlí v milíři / z celého milíře)',
    value: `${formatInteger(details.charcoalKg)} / ${formatInteger(details.yieldKg)}`,
  };
}

/**
 * Milíř nebo milířiště uhlíře (crafts.md – Milíř u skácených buků; Martin 20. 10. 2026: „Vyčleň
 * milíř jako samostatnou stavbu.“): fáze a průběh, uhlí v milíři, uhlíř – ikona dílny, kliknutím ji
 * vybere –, cesta ze zemnice a z kovárny; kdo sem dnes chodí pro uhlí – kovář, syn s věkem, vůz se
 * sedlákem – a jestli tu dnes pracuje uhlíř.
 */
export function KilnBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'kiln' }>;
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement {
  const stage = kilnStageLook(details);
  const today = details.fetchers.length > 0 || details.cart || details.burnerHere;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat icon={stage.icon} name={stage.name} testId="selection-kiln-stage">
          {stage.value}
        </Stat>
      </div>
      <Bar
        value={details.progress}
        name={details.stage === 'remnant' ? 'Zarůstá' : 'Fáze milíře'}
        testId="selection-kiln-progress"
      />
      <div className={ROW}>
        <Tooltip content="Uhlíř" placement="above">
          <button
            type="button"
            data-testid="selection-kiln-burner"
            aria-label="Uhlíř"
            className="hud-icon-button h-7 w-7"
            onClick={() => onSelectTarget?.({ kind: 'dwelling', id: details.burnerId })}
          >
            <img
              src="/icons/build/uhlir.png"
              alt=""
              width={128}
              height={128}
              className="h-full w-full"
            />
          </button>
        </Tooltip>
        <Stat icon="walk" name="Cesta ze zemnice uhlíře" testId="selection-kiln-walk">
          {`${formatInteger(details.burnerWalkM)} m`}
        </Stat>
        {details.smithWalkM !== null && (
          <Stat
            icon="walk"
            name="Cesta z kovárny – odsud sem chodí pro uhlí"
            testId="selection-kiln-smith-walk"
          >
            {`${formatInteger(details.smithWalkM)} m`}
          </Stat>
        )}
      </div>
      {today && (
        <div className={ROW} data-testid="selection-kiln-today">
          {details.burnerHere && (
            <Flag icon="labor" name="Uhlíř tu dnes pracuje" testId="selection-kiln-burner-here" />
          )}
          {details.fetchers.map((fetcher) => (
            <Stat
              key={`${fetcher.smith ? 'k' : 's'}${fetcher.age}`}
              icon={fetcher.age < AGE.adult ? 'child' : 'man'}
              name={kilnFetcherName(fetcher)}
              testId="selection-kiln-fetcher"
            >
              {fetcher.age}
            </Stat>
          ))}
          {details.cart && (
            <Flag
              icon="cart"
              name="Vůz se sedlákem dnes veze uhlí od milíře do kovárny"
              testId="selection-kiln-cart"
            />
          )}
        </div>
      )}
    </div>
  );
}
