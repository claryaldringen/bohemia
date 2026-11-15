# Události ze serveru

Prohlížeč se neptá periodicky – server mu změny posílá (Martin 15. 11. 2026: „Ale obecně by klient
neměl tyhle věci periodicky pollovat, ale server by je měl pushovat“). Návrh Clauda: jedno spojení
SSE na prohlížeč, zdroj událostí Postgres `LISTEN` / `NOTIFY`. Plán:
`docs/superpowers/plans/2026-11-15-server-push.md`. Tento soubor roste po úlohách plánu.

## Oznámení v databázi

Oznamují **triggery v databázi** (migrace `packages/db/drizzle/0053_change_notify.sql`), ne kód
adaptérů – oznámí tak každá cesta zápisu (web, worker, e2e pomocníci se zápisem přímo SQL).
`NOTIFY` se doručí až po commitu, rollback nic nepošle. Kanál je jeden, `bohemia_change`
(`CHANGE_CHANNEL`), druh změny je v klíči `k`.

| `k` | Kdy                                                                    | Náklad                                                      |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `v` | ves vložena, nebo změněna `version`, `name`, `settlement_id`           | `{ k, id, ver, p }` – `p` = `settlement.owner_id`           |
| `s` | sídlo vloženo, změněn `owner_id` nebo `archived_at`                    | `{ k, p, op }` – nový a starý vlastník (vložení: `op` null) |
| `n` | vloženo upozornění                                                     | `{ k, p }`                                                  |
| `j` | bod výpravy vložen, nebo změněn `tick`/`state`; výprava změní `status` | `{ k, id, t, p, c }` – `t` null u změny `status`            |
| `c` | bod tažení vložen, nebo změněn `tick`/`state`; tažení změní `status`   | `{ k, id, t, c, a }`                                        |
| `x` | průběh přeskoku času (posílá web, ne trigger)                          | `{ k, p, progress }`                                        |

- `c` = políčka `[x, y]`: skupiny, běžící poslové (jako `cells` ve `village-holds.ts`) a skupiny
  uprchlíků (`alarm.flights[*].cell`). `a` = varované vsi (`alarm.villages[*].villageId` a
  `hosts`) a cíl `target.villageId`, jen uuid. U UPDATE je `c` i `a` sjednocení starého a nového
  stavu, takže odchod z mapy dostane událost bez paměti rozbočovače.
- Samotný `outbox` (`clearOutbox`) neoznamuje. Neoznamuje se ani schránka vsi, záměry a jednání.
- Náklad nad 7900 B (limit `NOTIFY` je 8000 B, měří se `octet_length`) nahradí funkce
  `bohemia_change_notify` krátkým `{ k, id, t, p, big: true }`; `big` znamená „všechna spojení
  s políčkem / vsí“, `parseChange` doplní prázdná `c` a `a`.
- SQL funkce `bohemia_change_cells`, `bohemia_change_alarmed` a `bohemia_change_union` skládají pole
  bez opakování. Triggery: `village_change_notify_ins` / `_upd`, `settlement_change_notify`,
  `player_notice_change_notify`, `journey_checkpoint_change_notify`, `journey_change_notify`,
  `campaign_checkpoint_change_notify`, `campaign_change_notify`.

### Kód

- `packages/db/src/changes.ts` – `DbChange`, `Cell`, `parseChange` (neznámý druh nebo vadný tvar
  = null), `notifyChange(db, change)` (`pg_notify`; v plánu ji volá jen Úloha 6 pro `x`).
- `packages/db/src/adapters/change-listener.ts` – `listenChanges(url, handlers, options)`: vlastní
  `pg.Client` (`keepAlive`, `application_name` výchozí `bohemia-change-listener`) mimo pool,
  `LISTEN bohemia_change`. Po chybě nebo konci spojení se připojí znovu s odklady
  `[1000, 2000, 5000, 10000, 30000]` ms (poslední se opakuje), po obnově zavolá `onReconnect`
  (po prvním připojení ne). Vadný náklad jde do `onError`. `close()` další pokus zruší.
- Testy: `changes.test.ts`, `adapters/__tests__/change-notify.db.test.ts` (triggery),
  `change-listener.db.test.ts`.
