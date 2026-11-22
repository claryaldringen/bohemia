// Činnosti, které ve scéně ještě běží, i když je data dalšího dne už nemají (villagers.md –
// Činnosti od začátku do konce; Martin 31. 10. 2026: „Ve vykreslování by lidé měli dělat své
// činnosti od začátku do konce, bez ohledu na to, že např. cesta pro vodu trvá třeba několik dní.
// Z hlediska hry by se to počítalo jako teď“). Karavana a lov jdou ve skutečném čase přirozenou
// chůzí a trvají mnohem déle než v jádru – výprava se v jádru vrátí za pár herních dní, lov je
// den. Data vsi je pak už nemají, scéna je ale dohraje (návrh Clauda): pamatuje si každou viděnou
// karavanu (i s vozy, jak jely) a běžící lov do jejich konce ve skutečném čase. Prohlížeč, který
// ves otevře později, karavanu vrácenou v jádru už nevidí – jen ty, které jádro ještě má.
import type { SceneCart, SceneExpedition, SceneLord, SceneVillage } from '../village-view';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import { cycleIndex, LORD_CYCLE, LORD_CYCLE_S } from './lord-day';
import {
  CARAVAN_LINGER_S,
  caravanPlan,
  caravanPoints,
  caravanTimeline,
  type DayWindow,
} from './caravan';
import { route } from './villager-motion';

/** Karavana, kterou scéna viděla: data výpravy, vozy, jak jely, a konec ve skutečném čase (ms). */
interface SeenCaravan {
  expedition: SceneExpedition;
  carts: SceneCart[];
  endMs: number;
  /** Lidé vsi (id), když karavanu měla data naposled – kdo přibyl potom, přišel s ní. */
  known: ReadonlySet<number>;
}

/**
 * Ves bez toho, co dohrávané karavany (`lingering` – v jádru už doma, ve scéně ještě jdou) teprve
 * přivádějí (návrh Clauda 2. 11. 2026; villagers.md – Bez časosběru): koupené krávy a voli
 * (`cattle.back`) ubudou z ohrad a ze stáda krav, lidé od souseda (`coming`) – kdo ve vsi přibyl
 * po posledních datech s karavanou, nejvýš tolik, kolik jich jde, ne novorozenci – ve vsi ještě
 * nejsou. Až karavana ve scéně dojde, jsou ve vsi. Bez dohrávané karavany beze změny.
 */
export function withoutArriving(
  village: SceneVillage,
  lingering: readonly Pick<SeenCaravan, 'expedition' | 'known'>[],
): SceneVillage {
  let cows = 0;
  let oxen = 0;
  const away = new Set<number>();
  const persons = village.labor?.persons ?? [];
  for (const seen of lingering) {
    cows += seen.expedition.cattle?.back.cows ?? 0;
    oxen += seen.expedition.cattle?.back.oxen ?? 0;
    const fresh = persons
      .filter((p) => !seen.known.has(p.id) && !away.has(p.id) && p.age >= 1)
      .sort((a, b) => b.id - a.id)
      .slice(0, seen.expedition.coming.length);
    for (const p of fresh) away.add(p.id);
  }
  if (cows === 0 && oxen === 0 && away.size === 0) return village;
  let out = village;
  if (cows > 0 || oxen > 0) {
    // z ohrad v pořadí id (jako voli venku – village-pens.ts), krávy i ze stáda na pastvě
    let c = cows;
    let o = oxen;
    const pens = (village.pens ?? [])
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((pen) => {
        const dc = Math.min(pen.cows, c);
        const dox = Math.min(pen.oxen, o);
        c -= dc;
        o -= dox;
        return dc > 0 || dox > 0 ? { ...pen, cows: pen.cows - dc, oxen: pen.oxen - dox } : pen;
      });
    const order = new Map(pens.map((pen) => [pen.id, pen]));
    out = { ...out, ...(village.pens ? { pens: village.pens.map((p) => order.get(p.id)!) } : {}) };
    if (village.livestock && cows > 0) {
      out = {
        ...out,
        livestock: { ...village.livestock, cow: Math.max(0, village.livestock.cow - cows) },
      };
    }
  }
  if (away.size > 0 && out.labor) {
    out = {
      ...out,
      labor: { ...out.labor, persons: persons.filter((p) => !away.has(p.id)) },
    };
  }
  return out;
}

/** Klíč karavany – výprava a den, kdy běžící cesta začala (víc jízd = víc karavan). */
export function caravanKey(e: Pick<SceneExpedition, 'id' | 'startDay' | 'day'>): string {
  return `${e.id}:${e.startDay ?? e.day}`;
}

/** Konec karavany ve skutečném čase (ms) – po návratu a chvíli v hloučku; bez stezky či okna null. */
export function caravanEndMs(
  e: SceneExpedition,
  trails: SceneVillage['trails'],
  window: DayWindow | null,
): number | null {
  const points = caravanPoints(e, trails);
  if (!window || points.length < 2) return null;
  const L = route(points.map((p) => [p.x, p.z] as const)).length;
  const plan = caravanPlan(e);
  const columns = { out: plan.out.length, back: plan.back.length };
  return caravanTimeline(e, window, L, columns).endMs + CARAVAN_LINGER_S * 1000;
}

/** Paměť běžících činností scény – jedna na ves (landscape-scene.ts). */
export class ActivityMemory {
  private caravans = new Map<string, SeenCaravan>();
  /** Jízdy rodiny, jak byly na začátku běžící výcvikové jízdy cyklu (`slot`). */
  private ride: {
    slot: number;
    lord: Pick<SceneLord, 'riders' | 'borderTrailId' | 'escort'>;
  } | null = null;

  /**
   * Ves doplněná o činnosti, které ve skutečném čase `nowMs` ještě běží: karavany, které data už
   * nemají (napřed – vůz dojede rozjetou cestu, než vyrazí na další), s vozy, jak jely; a lov, dokud
   * se lovci nevrátí – nový lov se ukáže až po návratu z běžícího. Vstupní ves nemění.
   */
  apply(
    village: SceneVillage,
    nowMs: number,
    dayWindow: (day: number) => DayWindow | null,
  ): SceneVillage {
    const incoming = village.expeditions ?? [];
    const keys = new Set(incoming.map(caravanKey));
    const known = new Set((village.labor?.persons ?? []).map((p) => p.id));
    for (const e of incoming) {
      const endMs = caravanEndMs(e, village.trails, dayWindow(e.startDay ?? e.day));
      if (endMs === null) continue;
      const carts = (village.carts ?? []).filter((c) => e.carts.includes(c.id));
      this.caravans.set(caravanKey(e), { expedition: e, carts, endMs, known });
    }
    for (const [key, seen] of this.caravans) if (seen.endMs <= nowMs) this.caravans.delete(key);
    const lingering = [...this.caravans.entries()]
      .filter(([key]) => !keys.has(key))
      .map(([, seen]) => seen);
    let out = village;
    if (lingering.length > 0) {
      // vůz dohrávané karavany jede s ní, i když je v jádru už doma
      const kept = new Map<number, SceneCart>();
      for (const seen of lingering) for (const c of seen.carts) kept.set(c.id, c);
      const carts = (village.carts ?? []).map((c) =>
        kept.has(c.id) && c.job?.activity !== 'trade' ? kept.get(c.id)! : c,
      );
      out = {
        ...withoutArriving(village, lingering),
        expeditions: [...lingering.map((seen) => seen.expedition), ...incoming],
        ...(village.carts ? { carts } : {}),
      };
    }
    return this.rideAt(out, nowMs);
  }

  /**
   * Výcviková jízda cyklu (lord-day.ts – `rideSlot`) trvá minuty, tedy přes víc herních dní – kdo
   * jede, kudy (objížďka, k hranici) a doprovod výpravy zůstanou až do jejího konce takové, jaké
   * byly, když scéna jízdu poprvé viděla (jinak by jezdec uprostřed jízdy přeskočil na jinou trasu
   * nebo zmizel, když ho data dalšího dne už nemají – lov, zranění). Mimo jízdu beze změny.
   */
  private rideAt(village: SceneVillage, nowMs: number): SceneVillage {
    const t = (nowMs - LIVESTOCK_EPOCH_MS) / 1000;
    const k = cycleIndex(t);
    const from = k * LORD_CYCLE_S + LORD_CYCLE.ride;
    if (t < from || t >= from + LORD_CYCLE.rideMax) {
      this.ride = null;
      return village;
    }
    const lord = village.labor?.lord;
    if (!lord || !village.labor) return village;
    if (!this.ride || this.ride.slot !== k) {
      const seen: Pick<SceneLord, 'riders' | 'borderTrailId' | 'escort'> = {};
      if (lord.riders) seen.riders = lord.riders;
      if (lord.borderTrailId !== undefined) seen.borderTrailId = lord.borderTrailId;
      if (lord.escort) seen.escort = lord.escort;
      this.ride = { slot: k, lord: seen };
      return village;
    }
    const kept: SceneLord = { ...lord };
    delete kept.riders;
    delete kept.borderTrailId;
    delete kept.escort;
    return { ...village, labor: { ...village.labor, lord: { ...kept, ...this.ride.lord } } };
  }
}
