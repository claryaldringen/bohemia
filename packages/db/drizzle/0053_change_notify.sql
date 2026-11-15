-- Oznámení změn přes LISTEN/NOTIFY (plán 2026-11-15 – události ze serveru, Úloha 1; docs/code/server-events.md).
-- Triggery oznamují každou cestu zápisu (web, worker, e2e pomocníci); NOTIFY se doručí až po commitu.
-- Náklad nese jen id, verzi a směrování, nad 7900 B se zkrátí na { k, id, t, p, big: true }.
CREATE OR REPLACE FUNCTION bohemia_change_notify(payload jsonb) RETURNS void AS $$
BEGIN
  IF octet_length(payload::text) > 7900 THEN
    payload := jsonb_strip_nulls(jsonb_build_object('k', payload->'k', 'id', payload->'id',
      't', payload->'t', 'p', payload->'p', 'big', true));
  END IF;
  PERFORM pg_notify('bohemia_change', payload::text);
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Políčka [x, y] bodu (jen číselná, celá část): skupiny, běžící poslové a skupiny uprchlíků (jako `cells` ve village-holds.ts), bez opakování.
CREATE OR REPLACE FUNCTION bohemia_change_cells(state jsonb) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_array(q.x, q.y)), '[]'::jsonb)
  FROM (
    SELECT CASE WHEN jsonb_typeof(g->'cell'->'x') = 'number' AND abs((g->'cell'->>'x')::numeric) < 1000000
                THEN trunc((g->'cell'->>'x')::numeric)::int END AS x,
           CASE WHEN jsonb_typeof(g->'cell'->'y') = 'number' AND abs((g->'cell'->>'y')::numeric) < 1000000
                THEN trunc((g->'cell'->>'y')::numeric)::int END AS y
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(state->'groups') = 'array' THEN state->'groups' ELSE '[]'::jsonb END
      || coalesce(jsonb_path_query_array(state->'alarm', '$.messengers[*] ? (@.status == "running")'), '[]'::jsonb)
      || coalesce(jsonb_path_query_array(state->'alarm', '$.flights[*]'), '[]'::jsonb)
    ) g
  ) q
  WHERE q.x IS NOT NULL AND q.y IS NOT NULL
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- Vsi, které o tažení vědí (jen uuid), bez opakování: varované od taktu varování (`warnTick` ≤ takt
-- bodu) a cíl jen s bitvou (obránce ji vidí celou, padlí leží do konce dne). Cíl bez bitvy ani
-- kandidáti hradišť (`hosts`) ne – signál `alarm` by vsi prozradil tažení dřív, než ho spatří.
CREATE OR REPLACE FUNCTION bohemia_change_alarmed(state jsonb) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(DISTINCT a.id), '[]'::jsonb)
  FROM jsonb_array_elements_text(
    coalesce(jsonb_path_query_array(state->'alarm', '$.villages[*] ? (@.warnTick <= $t).villageId',
      jsonb_build_object('t', state->'tick')), '[]'::jsonb)
    || CASE WHEN jsonb_typeof(state->'battle') = 'object'
            THEN coalesce(jsonb_path_query_array(state, '$.target.villageId'), '[]'::jsonb)
            ELSE '[]'::jsonb END
  ) a(id)
  WHERE a.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- Sjednocení dvou polí bez opakování (stará a nová hodnota při UPDATE).
CREATE OR REPLACE FUNCTION bohemia_change_union(a jsonb, b jsonb) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(DISTINCT e), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(a, '[]'::jsonb) || coalesce(b, '[]'::jsonb)) e
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- Ves: id, nová verze a vlastník sídla.
CREATE OR REPLACE FUNCTION village_change_notify() RETURNS trigger AS $$
BEGIN
  BEGIN
    PERFORM bohemia_change_notify(jsonb_build_object('k', 'v', 'id', NEW.id, 'ver', NEW.version,
      'p', (SELECT s.owner_id FROM settlement s WHERE s.id = NEW.settlement_id)));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER village_change_notify_ins AFTER INSERT ON village
  FOR EACH ROW EXECUTE FUNCTION village_change_notify();
--> statement-breakpoint
CREATE TRIGGER village_change_notify_upd AFTER UPDATE ON village
  FOR EACH ROW
  WHEN (OLD.version IS DISTINCT FROM NEW.version OR OLD.name IS DISTINCT FROM NEW.name
        OR OLD.settlement_id IS DISTINCT FROM NEW.settlement_id)
  EXECUTE FUNCTION village_change_notify();
--> statement-breakpoint
-- Sídlo: nový a starý vlastník (vložení: op null).
CREATE OR REPLACE FUNCTION settlement_change_notify() RETURNS trigger AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM bohemia_change_notify(jsonb_build_object('k', 's', 'p', NEW.owner_id, 'op', NULL::text));
    ELSIF OLD.owner_id IS DISTINCT FROM NEW.owner_id OR OLD.archived_at IS DISTINCT FROM NEW.archived_at THEN
      PERFORM bohemia_change_notify(jsonb_build_object('k', 's', 'p', NEW.owner_id, 'op', OLD.owner_id));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER settlement_change_notify AFTER INSERT OR UPDATE OF owner_id, archived_at ON settlement
  FOR EACH ROW EXECUTE FUNCTION settlement_change_notify();
--> statement-breakpoint
-- Upozornění hráči.
CREATE OR REPLACE FUNCTION player_notice_change_notify() RETURNS trigger AS $$
BEGIN
  BEGIN
    PERFORM bohemia_change_notify(jsonb_build_object('k', 'n', 'p', NEW.player_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER player_notice_change_notify AFTER INSERT ON player_notice
  FOR EACH ROW EXECUTE FUNCTION player_notice_change_notify();
--> statement-breakpoint
-- Bod výpravy: takt a políčka (u UPDATE sjednocení starého a nového stavu), vlastník výpravy.
CREATE OR REPLACE FUNCTION journey_checkpoint_change_notify() RETURNS trigger AS $$
DECLARE cells jsonb;
BEGIN
  BEGIN
    cells := bohemia_change_cells(NEW.state);
    IF TG_OP = 'UPDATE' THEN
      cells := bohemia_change_union(bohemia_change_cells(OLD.state), cells);
    END IF;
    PERFORM bohemia_change_notify(jsonb_build_object('k', 'j', 'id', NEW.journey_id, 't', NEW.tick,
      'p', (SELECT j.player_id FROM journey j WHERE j.id = NEW.journey_id), 'c', cells));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journey_checkpoint_change_notify AFTER INSERT OR UPDATE OF tick, state ON journey_checkpoint
  FOR EACH ROW EXECUTE FUNCTION journey_checkpoint_change_notify();
--> statement-breakpoint
-- Výprava změní status (konec): t null, políčka z bodu.
CREATE OR REPLACE FUNCTION journey_change_notify() RETURNS trigger AS $$
BEGIN
  BEGIN
    PERFORM bohemia_change_notify(jsonb_build_object('k', 'j', 'id', NEW.id, 't', NULL::bigint, 'p', NEW.player_id,
      'c', coalesce((SELECT bohemia_change_cells(cp.state) FROM journey_checkpoint cp WHERE cp.journey_id = NEW.id), '[]'::jsonb)));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journey_change_notify AFTER UPDATE OF status ON journey
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION journey_change_notify();
--> statement-breakpoint
-- Bod tažení: takt, políčka a vsi, které o tažení vědí (u UPDATE sjednocení starého a nového stavu).
CREATE OR REPLACE FUNCTION campaign_checkpoint_change_notify() RETURNS trigger AS $$
DECLARE
  cells jsonb;
  alarmed jsonb;
BEGIN
  BEGIN
    cells := bohemia_change_cells(NEW.state);
    alarmed := bohemia_change_alarmed(NEW.state);
    IF TG_OP = 'UPDATE' THEN
      cells := bohemia_change_union(bohemia_change_cells(OLD.state), cells);
      alarmed := bohemia_change_union(bohemia_change_alarmed(OLD.state), alarmed);
    END IF;
    PERFORM bohemia_change_notify(jsonb_build_object('k', 'c', 'id', NEW.campaign_id, 't', NEW.tick,
      'c', cells, 'a', alarmed));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER campaign_checkpoint_change_notify AFTER INSERT OR UPDATE OF tick, state ON campaign_checkpoint
  FOR EACH ROW EXECUTE FUNCTION campaign_checkpoint_change_notify();
--> statement-breakpoint
-- Tažení změní status (konec): t null, políčka a vsi z bodu.
CREATE OR REPLACE FUNCTION campaign_change_notify() RETURNS trigger AS $$
DECLARE st jsonb;
BEGIN
  BEGIN
    SELECT cp.state INTO st FROM campaign_checkpoint cp WHERE cp.campaign_id = NEW.id;
    PERFORM bohemia_change_notify(jsonb_build_object('k', 'c', 'id', NEW.id, 't', NULL::bigint,
      'c', CASE WHEN st IS NULL THEN '[]'::jsonb ELSE bohemia_change_cells(st) END,
      'a', CASE WHEN st IS NULL THEN '[]'::jsonb ELSE bohemia_change_alarmed(st) END));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bohemia_change (%): %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER campaign_change_notify AFTER UPDATE OF status ON campaign
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION campaign_change_notify();
