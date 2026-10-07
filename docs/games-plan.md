# Games as questions — backend plan

Status: PROPOSAL (2026-10-06). Nothing below is built yet.

**Scope: backend only** — schema, game catalog, metric configuration,
question validation, submit/storage, reset/delete, raw-data export. Rendering
the games, the game files themselves, the portal take flow and every
dashboard screen come later in their own plan (§12).

## 1. Decisions

| Topic | Decision |
|---|---|
| Games | Four, each selectable on its own: **Baseline**, **Color Clash**, **Makeworth Clock**, **Group Assignment**. Baseline is always standalone. |
| Group Assignment | **One game** — one game row, one game file — that contains its groups, their conditions and both tasks (Color Clash then Makeworth Clock) inside it. It is not two games linked together. |
| Groups | The **respondent picks** a group (1–9). Each group is a set of conditions (timer/score shown, pause allowed, its instruction text). The pick and the conditions in force are **stored** with the result. |
| Group content | Group names, instruction pages and conditions are **editable** (stored on the game, §4), not hard-coded. |
| Detail level | **Summary numbers**, not trial-by-trial logs. |
| Time per round | Average reaction time on **right** answers only. |
| Per-question settings | Allow on phones (every game); show timer & score, allow pause (standalone Color Clash / Makeworth Clock). |
| Same game twice in a questionnaire | **Not allowed.** |
| Scoring | **No MQ / MQT.** Game values are stored in the database and shown only as columns in the raw-data Excel export. |

## 2. The shape

A `GAMES` question holds **exactly one game**. The server creates the
question's single hidden option pointing at that game — the same pattern as
SHORT_ANSWER's generated text slot (V40). When a respondent finishes the game,
the answer row records "this option was picked", so answers, resets, deletes,
exports and the Reports Hub keep working without special cases. The game's
result is stored beside that answer: the **raw payload** (everything the game
sent) plus one **value row per configured metric**. Which metrics a game has
is data (rows), configurable through the API, not table columns.

## 3. Why not a column per metric

One wide table whose columns are added from the frontend would break the
backend's rules: `ddl-auto: validate` refuses to start on columns the entities
do not know; schema changes go through Flyway only and MySQL DDL cannot roll
back (on the shared staging DB a mistake lands on everyone); `hits` means
different things in different games; and lists (`responseTimes`, `blocks`) do
not fit a column. Metric **definitions** keep the requirement — configure per
game what columns its data has — without DDL. Each definition becomes a
column in the raw-data export, like a demographic field does today.

## 4. Data model — `V41__games.sql`

```
game                    the catalog — one row per game
  game_id         PK
  code            VARCHAR(40) UNIQUE   BASELINE | COLOR_CLASH | MAKEWORTH_CLOCK | GROUP_ASSIGNMENT
  name            VARCHAR(100)         display name (editable)
  description     TEXT NULL
  active          BOOLEAN              inactive = refused on NEW questions; existing ones keep working
  version         INT                  bumped when the game's payload shape changes
  settings        JSON NULL            game-wide content, editable through the API.
                                       GROUP_ASSIGNMENT: { groups: [ { number, label, name,
                                         showHud, allowPause, instructions: { task1: [..], task2: [..] } } ] }
                                       Seeded from today's text and sets (HUD 3/6/9, pause 1/2/3).

game_metric             "the columns" of one game
  game_metric_id  PK
  game_id         FK → game
  metric_key      VARCHAR(60)          unique per game, [a-z0-9_]
  label           VARCHAR(120)         column header in the export
  data_type       NUMBER | TEXT
  unit            VARCHAR(20) NULL     ms, s, px, count …
  json_path       VARCHAR(200)         dot path into the payload, e.g. "clash.hits"
  sort_order      INT
  active          BOOLEAN

question.question_type    enum APPENDED with 'GAMES' (append only — mid-list renumbers stored rows)

question_option  + game_id      FK → game NULL     only on a GAMES question's hidden option
                 + game_config  JSON NULL          { allowMobile } on every game;
                                                   + { showHud, allowPause } on standalone
                                                     COLOR_CLASH / MAKEWORTH_CLOCK

game_result             one per answered game question, per attempt
  game_result_id        PK
  assessment_answer_id  FK → assessment_answer, UNIQUE, ON DELETE CASCADE
  game_id               FK → game
  game_version          INT            version that produced the payload
  payload               JSON           everything the game sent — nothing thrown away
  start_count           INT            how many times the game was (re)started
  completed_at          DATETIME

game_result_value       metrics pulled out of the payload when it is saved
  game_result_id  FK → game_result, ON DELETE CASCADE
  metric_key      VARCHAR(60)
  number_value    DOUBLE NULL
  text_value      VARCHAR(255) NULL
  PK (game_result_id, metric_key)
```

- **Cascade is allowed here** — a game result is part of its answer (true
  composition). Submit's replace-all, the Reports Hub reset and the respondent
  delete all delete answers; the game rows go with them and none of those
  paths changes. Bulk JPQL deletes skip JPA cascades, so the cascade is at the
  DB level (`ON DELETE CASCADE`, `@OnDelete` on the entity so H2 builds it too).
- **Game rows are seeded, never created through the API**: a `code` must match
  a game the frontend can render. The API can rename, describe, (de)activate,
  edit `settings`, and manage metrics.
- **Adding a metric** is a row, not a migration. The raw payload is kept, so a
  new metric can be **backfilled** over every stored result.
- **Group conditions are copied into the payload** at play time
  (`group`, `groupName`, `showHud`, `allowPause`), so editing a group later
  never changes what an old result says the respondent saw.

## 5. Payloads and seeded metrics

The payload each game must send. The frontend plan will make the game files
send exactly this; the backend validates only that it is a JSON object and
extracts what the metric paths name.

**Mapping:** right = hits, wrong = wrong / falseAlarms, missed = omissions.

**BASELINE** — `{ task1:{hits,falseAlarms,omissions,rts[],grids}, task2:{…},
task1MeanLatencyMs, task2MeanLatencyMs, blocks:{task1[],task2[]},
mouseDistancePx, mouseIdleSeconds, inputTypes[], taskSeconds }`

| key | path | type |
|---|---|---|
| task1_right / task1_wrong / task1_missed | `task1.hits` / `task1.falseAlarms` / `task1.omissions` | number |
| task1_avg_latency_ms | `task1MeanLatencyMs` | number (ms) |
| task2_right / task2_wrong / task2_missed | `task2.hits` / `task2.falseAlarms` / `task2.omissions` | number |
| task2_avg_latency_ms | `task2MeanLatencyMs` | number (ms) |
| mouse_distance_px / mouse_idle_seconds | `mouseDistancePx` / `mouseIdleSeconds` | number |
| time_taken_seconds | `taskSeconds` | number (s) |
| input_types | `inputTypes` | text (list joined with ", ") |

**COLOR_CLASH** — `{ hits, wrong, omissions, responseTimes[], avgLatencyMs,
completionSeconds, mouseDistancePx, mouseIdleSeconds, inputTypes[],
pauseCount, pausedSeconds, showHud, allowPause }`

| key | path |
|---|---|
| right / wrong / missed | `hits` / `wrong` / `omissions` |
| avg_latency_ms | `avgLatencyMs` |
| time_taken_seconds | `completionSeconds` |
| mouse_distance_px / mouse_idle_seconds | `mouseDistancePx` / `mouseIdleSeconds` |
| pause_count / paused_seconds | `pauseCount` / `pausedSeconds` |
| input_types | `inputTypes` |

**MAKEWORTH_CLOCK** — as Color Clash, with `falseAlarms` for wrong and
`jumpSeconds[]` kept in the payload: `wrong` ← `falseAlarms`.

**GROUP_ASSIGNMENT** — one payload for the whole game:
`{ group, groupName, showHud, allowPause, clash:{…Color Clash fields},
clock:{…Makeworth Clock fields}, pageTimes:{ task1:{previewMs, previewVisits,
instructionsMs, instructionsVisits}, task2:{…} } }`

| key | path |
|---|---|
| group / group_name | `group` / `groupName` |
| show_hud / allow_pause | `showHud` / `allowPause` |
| clash_right / clash_wrong / clash_missed | `clash.hits` / `clash.wrong` / `clash.omissions` |
| clash_avg_latency_ms / clash_time_taken_seconds | `clash.avgLatencyMs` / `clash.completionSeconds` |
| clash_mouse_distance_px / clash_mouse_idle_seconds | `clash.mouseDistancePx` / `clash.mouseIdleSeconds` |
| clash_pause_count / clash_paused_seconds | `clash.pauseCount` / `clash.pausedSeconds` |
| clock_right / clock_wrong / clock_missed | `clock.hits` / `clock.falseAlarms` / `clock.omissions` |
| clock_avg_latency_ms / clock_time_taken_seconds | `clock.avgLatencyMs` / `clock.completionSeconds` |
| clock_mouse_distance_px / clock_mouse_idle_seconds | `clock.mouseDistancePx` / `clock.mouseIdleSeconds` |
| clock_pause_count / clock_paused_seconds | `clock.pauseCount` / `clock.pausedSeconds` |
| clash_preview_ms / clash_instructions_ms / clash_instructions_visits | `pageTimes.task1.*` |
| clock_preview_ms / clock_instructions_ms / clock_instructions_visits | `pageTimes.task2.*` |

**Extraction rules:** a number path must hold a number (a boolean is stored
as 1/0); a text path takes a string, number or boolean, and a list of those
joined with ", ", truncated to 255. A path that is missing, null, or the wrong
shape writes **no value row** — a missing number is never a 0.

## 6. Game catalog API

Project style, `GameController`:

| Endpoint | Does |
|---|---|
| `GET /api/games/getAll` | games with metric count and how many questions use each |
| `GET /api/games/getById/{id}` | one game with its metrics and settings |
| `PUT /api/games/update/{id}` | name, description, active, settings |
| `POST /api/games/{id}/metrics/create` | add a metric |
| `PUT /api/games/{id}/metrics/update/{metricId}` | label, unit, path, type, order, active |
| `DELETE /api/games/{id}/metrics/delete/{metricId}` | only while it has no stored values |
| `POST /api/games/{id}/metrics/test-path` | `{jsonPath, dataType}` → what it extracts from the latest stored payloads |
| `POST /api/games/{id}/metrics/backfill/{metricId}` | re-extract one metric over every stored result |

Rules:
- `metric_key` unique per game, `[a-z0-9_]{1,60}`; **fixed once values exist**
  (it names an export column).
- A metric with values cannot be deleted — deactivate it. Inactive metrics are
  not extracted on new submits and are not exported.
- Changing `json_path` or `data_type` does not rewrite stored values — run
  backfill.
- `settings` for GROUP_ASSIGNMENT is validated: 1–9 groups, unique numbers,
  label and name required, booleans for the conditions, instruction pages as
  lists of strings. Other games: `settings` must be null for now.
- Deactivating a game used by questions is allowed (existing questions keep
  working; new ones are refused).

## 7. Question validation (QuestionController)

- `GAMES` → the server owns the options: exactly one generated option with
  the chosen `game_id` (an ACTIVE game for a new question), no text, no
  media, no selection rule, no rows. A client-sent options list is refused.
- `game_config`: `allowMobile` boolean on every game; `showHud` /
  `allowPause` booleans only on COLOR_CLASH / MAKEWORTH_CLOCK. Unknown keys
  refused. Group Assignment's HUD/pause come from its groups, not here.
- **No MQ / MQT scores** on a GAMES question or its option — refused.
- **Answers freeze it** (existing rule): changing the game on an answered
  question → 409. `game_config` changes are allowed (they affect future
  attempts only).
- **One question per game per questionnaire:** placing a second GAMES
  question with the same game → 409 naming the one already placed. Checked
  on the placement write (`PUT /api/questionnaire/{id}/questions`) and on
  question update when it is already placed.
- XLSX question upload and the AI import: `GAMES` refused in v1.

## 8. Submit and storage

- `AnswerEntry` gains `gameResult` (JSON object) and `startCount` (int ≥ 1).
  On a GAMES question: exactly one entry, its `optionId` = the hidden slot,
  `gameResult` required, ≤ 256 KB serialized. On any other type both are
  refused. Error messages name the question by its navigator label, like the
  existing submit errors.
- `AssessmentSubmissionWriter` (replace-all): answer row → `game_result`
  (payload, `game_version` from the game row, `start_count`, `completed_at`)
  → one `game_result_value` per ACTIVE metric that extracts a value. The raw
  payload is stored even when no metric matches.
- Redis staging, the digest and the partial snapshot already carry
  `AnswerEntry`; the two new fields ride along. A partial snapshot with a
  game result keeps it on resume.
- Reset, respondent delete and replace-all: nothing to add — the cascade.
- MemoryMesh attempt sync (`/api/sync/memorymesh/attempts`): refuses an
  assessment containing a GAMES question in v1.

## 9. Raw-data Excel export

The only place game values are shown (`/api/reports/export/assessment/...`,
both the per-assessment and per-respondent variants):

- For each GAMES question, one column per ACTIVE metric, in `sort_order`,
  header `"<tag> · <game name> · <metric label>"` (e.g.
  `Q_7 · Color Clash · Right`). Values come from `game_result_value`.
- The question's own answer cell reads `Completed`.
- No value → blank cell, never 0.
- The scoring-key sheet lists no rows for a GAMES question.
- The Reports Hub info popup counts a GAMES question as answered once its
  result exists (it already counts the answer row).

## 10. Phases (backend)

| Phase | What | Tests |
|---|---|---|
| 1 | V41 + entities + seed (4 games, §5 metrics, Group Assignment settings); `GameController`; extraction service; test-path; backfill | seed present; metric key rules / fixed-once-used / delete blocked; settings validation; extraction number/text/list/missing/wrong-type; backfill |
| 2 | `QuestionType.GAMES` accepted: generated option, `game_config`, no-scores rule, freeze, one-per-questionnaire | create/update/refusals for each rule; placement 409 |
| 3 | Submit: `gameResult` / `startCount`, writer, staging/partial carry-through, MemoryMesh refusal | required/refused/size; values written; replace-all and reset cascade; resubmit replaces |
| 4 | Raw-data export columns | one column per active metric, blank for missing, inactive excluded, no scoring-key rows |

Each phase ends with `./mvnw -B test` green and a live curl smoke against
:8080 with `__smoke__` data deleted afterwards. **V41 runs against whichever
database `DB_PORT` points at — confirm local vs shared staging before the
first boot.**

## 11. Scoring

Games have **no MQ and no MQTs**: not mapped to the taxonomy, nothing added
to MQT totals, no bands. A game's score is its metric values — right, wrong,
missed, average reaction time on right answers, mouse px, instruction-page
time, etc. — **stored in the database** (`game_result.payload` and
`game_result_value`) and **shown only** as raw-data export columns. Further
scoring happens on that sheet.

## 12. Deferred — the frontend plan (not part of this one)

Recorded so nothing is lost; to be planned separately:

- The game files: one shared props contract (`config`, `onComplete`); Group
  Assignment as a single game file that holds its groups and both tasks and
  sends the §5 payload; reading group content from `game.settings`.
- Where the games live (they are in `bodhassess-app`; respondents take
  assessments in `bodhassess-portal`) and the code → component registry.
- Portal: full-screen game renderer, no navigation until finished, not
  replayable, restart on reload (`startCount`), the phone block when
  `allowMobile` is off.
- Dashboard: the Games question type in the question form; the Games page
  (metrics, test path, backfill, group editor).
