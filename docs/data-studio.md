# BodhAssess Data Studio — Architecture & Design

> A spreadsheet + reporting tool ("Sheets × Data Studio") for **psychometric
> experts** to load live assessment data, compute custom metrics with formulas,
> and build shareable dashboards.

Status: **Phase 1 implemented** (2026-06-03). Phases 2–6 pending.
Author context: requirements gathered 2026-06-03.

## Phase 1 — implementation notes

Shipped: workbooks + sheets + derived columns + co-ownership, end to end,
compiling on both sides (`./mvnw compile` BUILD SUCCESS; `npm run typecheck`
clean).

**Backend** (`com.bodhpsychometric.bodhassess.analytics`):
- Entities `DsWorkbook`, `DsSheet`, `DsDerivedColumn`, `DsWorkbookShare`
  (`ds_*` tables, created by `ddl-auto=update`; child links are plain FK-id
  columns; timestamps via `@PrePersist/@PreUpdate`).
- `ExpressionService` — tokenizer + recursive-descent parser; validates column
  refs against the live `DatasetService` column set, infers result type, and
  classifies CLIENT vs SERVER. Closed whitelist; no SQL/eval yet (Phase 2).
- `DataStudioAccess` (owner / EDITOR / VIEWER / admin guard), `WorkbookService`,
  `SheetService`, `DsMapper`.
- `WorkbookController` (`/api/v1/workbooks…`), `SheetController`
  (`/api/v1/sheets…`, `/api/v1/workbooks/{id}/sheets`). `anyRequest().authenticated()`
  already covers them.

**Frontend** (`bodhassess-app`):
- `dataStudioApi` + types in `lib/api.ts`.
- `lib/data-studio/formula.ts` — client evaluator; `useDerivedColumns` hook
  merges computed columns into the existing glide grid.
- `SheetView` (grid + add-computed-column dialog with debounced live
  `validate-expr`), `data-studio/index` (workbook gallery),
  `data-studio/workbook` (sheet tabs + share dialog). Routes + sidebar entry
  added.

**Deviation from design — client formula engine.** The design named
HyperFormula for client eval. Our grammar uses *infix* `AND`/`OR`/`NOT` and
`==`/`!=`, which differ from HyperFormula's spreadsheet syntax (`AND(...)`
functions, `=`/`<>`); bridging them needs a translation compiler. To guarantee
the browser computes exactly what the server validates, Phase 1 ships a compact
purpose-built evaluator (`formula.ts`) that mirrors `ExpressionService` 1:1.
HyperFormula remains a clean drop-in if we later adopt spreadsheet syntax. No
architectural impact — the hybrid CLIENT/SERVER split is unchanged.

**Deferred to Phase 2 (already scaffolded for):** SERVER-classified columns are
accepted, persisted, and shown with a placeholder + "server" badge; they compute
once `POST /analytics/query` + the AST→SQL compiler land.

---

## 1. Goals & non-goals

### Goals
- Load **live** assessment data (respondent × scores × demographics) into an
  editable grid, **one row per respondent session** by default.
- Let experts add **derived columns** with spreadsheet-style formulas
  (`= (mqt:ANX + mqt:DEP) / 2`, `IF`, `AVERAGEIF`, percentile, z-score…).
- Build **dashboards**: charts, KPI tiles, pivot/summary tables.
- **Persist** workbooks/sheets/dashboards; **share** read-only links.
- **Export** to PDF/print and Excel.

### Non-goals (v1)
- Real-time multi-user co-editing (single-writer per workbook is fine at small scale).
- A standalone analytics microservice (revisit only if data outgrows in-memory eval).
- Replacing the existing audited cell-edit path for *source* data — Data Studio
  derives on top; source edits still go through `PATCH /datasets/sessions/cells`.

### Decisions locked with the architect
| Decision | Choice |
|---|---|
| Core focus | Spreadsheet **and** dashboard, equal weight |
| Data source | **Live** from the Spring/MySQL DB via `DatasetController` |
| Formula engine | **Hybrid** — client (HyperFormula) + server (SQL aggregation) |
| Scale | Small / internal (favor speed-to-build; growth points flagged) |
| Row grain | **One row per respondent session** |
| Build location | **Extend** existing `DatasetController` + `DataGrid.tsx` + analytics page |
| Ownership / tenancy | **Per-practitioner** (psychometric expert) owns workbooks; **co-ownership/sharing between experts is in v1**; entities are an *analysis dimension*, not a security boundary |
| Persistence | **Same MySQL DB, new tables** (`ds_*`) |
| Outputs | Charts, KPI tiles + tables, PDF/print, shareable links |

---

## 2. What already exists (reuse, don't rebuild)

| Asset | Path | Role in Data Studio |
|---|---|---|
| `DatasetController` | `…/controller/DatasetController.java` | **Canonical read source.** `GET /api/v1/datasets/sessions?entityId&questionnaireId` → self-describing grid. |
| `DatasetResponseDto` / `DatasetColumnDto` | `…/payload/` | Column contract: `key` (`respondentName`, `mqt:OPENNESS`, `demo:age`), `label`, `type` (`string\|number\|datetime\|enum`), `group` (`core\|scores\|demographics`), `editable`, `options`. Rows are flat maps + `rowId`, `_updatedAt`. |
| `DataGrid.tsx` | `bodhassess-app/src/components/data-grid/DataGrid.tsx` | Glide-data-grid wrapper. Extend to render derived columns + formula bar. |
| `admin/data-grid.tsx` | `bodhassess-app/src/pages/admin/data-grid.tsx` | Existing grid page; becomes the "Sheet" view entry point. |
| `analytics.tsx` ("BodhLens") | `bodhassess-app/src/pages/analytics.tsx` | NL-query stub. Becomes the **Data Studio** home / dashboard gallery. |
| `datasetsApi` | `bodhassess-app/lib/api.ts` (~L966) | `sessions()`, `editCells()`. Add `analyticsApi` / `dataStudioApi` alongside. |
| Charts | `apexcharts`, `recharts` (installed) | Dashboard widgets. |
| Export | `xlsx` (installed) | Excel export. PDF via print stylesheet. |
| Layout | dnd-kit (installed) | Dashboard canvas drag/resize. |
| Auth | `TokenAuthenticationFilter`, `@CurrentUser UserPrincipal` | Owner = `principal.getId()`. Share links reuse `PublicTokensController` pattern. |

**Key consequence:** ~40% of the backend read path and grid already exist. The
new work is: derived-column formulas, persistence, server aggregation, and the
dashboard builder.

---

## 3. High-level architecture

```
┌─────────────────────────── bodhassess-app (Vite/React) ───────────────────────────┐
│                                                                                    │
│  Data Studio section                                                               │
│  ┌────────────────────┐   ┌─────────────────────┐   ┌──────────────────────────┐  │
│  │ Sheet view         │   │ Formula engine       │   │ Dashboard builder        │  │
│  │ (DataGrid.tsx +    │←──│ HyperFormula (client)│   │ (dnd-kit canvas,         │  │
│  │  derived columns,  │   │  + server eval calls │   │  ApexCharts/Recharts,    │  │
│  │  formula bar)      │   └─────────────────────┘   │  KPI + pivot widgets)    │  │
│  └────────────────────┘                              └──────────────────────────┘  │
│           │  datasetsApi.sessions()        dataStudioApi.* (workbooks/sheets/query) │
└───────────┼───────────────────────────────────────────────────────┼───────────────┘
            │ live read                                               │ definitions + server eval
┌───────────▼───────────────────────────────────────────────────────▼───────────────┐
│                       bodhassess-api-spring  (Spring Boot 2.5)                       │
│                                                                                     │
│  EXISTING                              NEW: com…bodhassess.analytics package         │
│  DatasetController ──► DatasetService  ┌─────────────────────────────────────────┐  │
│   (live sessions grid)                 │ WorkbookController  (CRUD ds_workbook)   │  │
│                                        │ SheetController     (CRUD ds_sheet/cols) │  │
│                                        │ QueryController     (server aggregation) │  │
│                                        │ DashboardController (CRUD + share links) │  │
│                                        │ ExpressionService   (parse→validate→SQL) │  │
│                                        └─────────────────────────────────────────┘  │
│                                                          │                          │
│                                JPA / Hibernate (ddl-auto=update)                    │
└──────────────────────────────────────────┬─────────────────────────────────────────┘
                                            │
                                    ┌───────▼────────┐
                                    │   MySQL 8      │  existing tables (read) + ds_* (new)
                                    └────────────────┘
```

Namespace all new server code under `com.bodhpsychometric.bodhassess.analytics`
so it can be extracted into its own module/service later without churn.

---

## 4. Data model (new `ds_*` tables)

JPA entities under `…/analytics/model/`. `ddl-auto=update` will create them.
**Definitions are stored; assessment data is never copied** — every open
re-pulls live rows and re-evaluates.

```sql
-- A practitioner's project. Owned by one psychometric expert.
ds_workbook (
  id            BIGINT PK AUTO,
  name          VARCHAR(160) NOT NULL,
  description   VARCHAR(512),
  owner_id      BIGINT NOT NULL,          -- UserPrincipal.id (the expert)
  created_at    DATETIME, updated_at DATETIME,
  INDEX(owner_id)
)

-- A sheet = a bound view over live data + derived columns + display state.
ds_sheet (
  id              BIGINT PK AUTO,
  workbook_id     BIGINT NOT NULL FK->ds_workbook ON DELETE CASCADE,
  name            VARCHAR(160) NOT NULL,
  source_view     VARCHAR(40) NOT NULL DEFAULT 'sessions',  -- matches DatasetResponseDto.view
  source_filters  JSON,        -- {entityId, questionnaireId, ...} forwarded to DatasetController
  grain           VARCHAR(24) NOT NULL DEFAULT 'respondent_session',
  display_state   JSON,        -- column order, widths, hidden, freezes, sort
  sort_order      INT,
  created_at, updated_at,
  INDEX(workbook_id)
)

-- A user-defined computed column. The heart of the spreadsheet feature.
ds_derived_column (
  id            BIGINT PK AUTO,
  sheet_id      BIGINT NOT NULL FK->ds_sheet ON DELETE CASCADE,
  col_key       VARCHAR(80) NOT NULL,     -- stable id, e.g. "calc:wellbeing_index"
  label         VARCHAR(160) NOT NULL,
  expr          TEXT NOT NULL,            -- formula source, e.g. "(mqt:ANX + mqt:DEP)/2"
  eval_target   VARCHAR(8) NOT NULL,      -- 'CLIENT' | 'SERVER'
  result_type   VARCHAR(16) NOT NULL,     -- 'number'|'string'|'boolean'|'datetime'
  format        VARCHAR(40),              -- '0.00', 'pct', etc.
  sort_order    INT,
  UNIQUE(sheet_id, col_key),
  INDEX(sheet_id)
)

-- Co-ownership: grant another expert access to a workbook (v1).
ds_workbook_share (
  id                BIGINT PK AUTO,
  workbook_id       BIGINT NOT NULL FK->ds_workbook ON DELETE CASCADE,
  shared_with_user_id BIGINT NOT NULL,    -- another UserPrincipal.id (expert)
  role              VARCHAR(12) NOT NULL DEFAULT 'EDITOR',  -- 'EDITOR' | 'VIEWER'
  granted_by        BIGINT NOT NULL,
  created_at        DATETIME,
  UNIQUE(workbook_id, shared_with_user_id),
  INDEX(shared_with_user_id)
)

ds_dashboard (
  id            BIGINT PK AUTO,
  workbook_id   BIGINT NOT NULL FK->ds_workbook ON DELETE CASCADE,
  name          VARCHAR(160) NOT NULL,
  layout        JSON,         -- grid layout meta (cols, row height)
  created_at, updated_at,
  INDEX(workbook_id)
)

ds_widget (
  id            BIGINT PK AUTO,
  dashboard_id  BIGINT NOT NULL FK->ds_dashboard ON DELETE CASCADE,
  type          VARCHAR(16) NOT NULL,     -- 'CHART'|'KPI'|'TABLE'|'PIVOT'|'TEXT'
  sheet_id      BIGINT FK->ds_sheet,      -- data binding (nullable for TEXT)
  config        JSON NOT NULL,            -- chart type, x/y, agg, filters, KPI expr, pivot dims
  pos_x INT, pos_y INT, w INT, h INT,
  sort_order    INT,
  INDEX(dashboard_id)
)

-- Read-only share for a dashboard. Reuses the public-token auth pattern.
ds_share_link (
  id            BIGINT PK AUTO,
  dashboard_id  BIGINT NOT NULL FK->ds_dashboard ON DELETE CASCADE,
  token         VARCHAR(64) NOT NULL UNIQUE,
  scope         VARCHAR(16) NOT NULL DEFAULT 'READONLY',
  created_by    BIGINT NOT NULL,
  expires_at    DATETIME,                 -- null = no expiry
  revoked       BOOLEAN DEFAULT FALSE,
  INDEX(token)
)
```

### Sharing & access model
- **Owner** = creating expert (`ds_workbook.owner_id`).
- **Co-ownership (v1):** other experts are granted access via `ds_workbook_share`
  with role `EDITOR` (full edit) or `VIEWER` (read-only). Access check on every
  workbook/sheet/dashboard route = `owner_id == principal.id` **OR** an active
  `ds_workbook_share` row, with `role` gating writes.
- **Share links** (`ds_share_link`) are a *separate*, later concern: read-only,
  tokenized dashboard links (possibly external). Co-ownership is for internal
  experts; share links are for distribution.
- Entities are **not** tenancy boundaries — they appear as a filter
  (`source_filters.entityId`) and as a group-by dimension in queries.

---

## 5. Formula engine (hybrid)

### Column reference grammar
Formulas reference the dataset's self-describing column keys directly, so the
language is stable across questionnaires:

```
mqt:OPENNESS          -- a measured-quality score column
demo:age              -- a demographic column
core:completedAt      -- a core column
calc:wellbeing_index  -- another derived column (DAG-ordered)
```

**Function set (v1 — all of the below are required):**
- *Row-local (CLIENT):* arithmetic, `IF`, `AND/OR/NOT`, `MIN/MAX/ROUND/ABS`,
  `SQRT`, `LOG`.
- *Population / cohort (SERVER):* `AVERAGE/SUM/COUNT`, `AVERAGEIF/COUNTIF`,
  **`PERCENTILE`**, **`PERCENTRANK`**, **`ZSCORE`** (`(x − mean)/sd` over the
  scoped population), **`RANK`**, and **`NORMBAND`** — norm-referenced banding
  that maps a score to a labelled band (e.g. Low/Average/High) from configurable
  cutoffs or percentile breaks.

Population functions accept an optional **scope** argument so cohort math is
explicit, e.g. `ZSCORE(mqt:ANX, BY core:entityName)` (z within each entity) vs
`ZSCORE(mqt:ANX)` (whole population). `NORMBAND` references either inline
cutoffs or a named norm set (future: a `ds_norm_set` table; v1 uses inline
cutoffs/percentile breaks in the formula or column config).

### Where each formula evaluates
| Class | Target | Why |
|---|---|---|
| Row-local: arithmetic over columns in the same row (`(mqt:ANX+mqt:DEP)/2`, `IF(...)`) | **CLIENT** (HyperFormula) | Instant, no round-trip; bounded by loaded rows (fine at small scale). |
| Population / cohort: `ZSCORE`, `PERCENTILE`, `PERCENTRANK`, `RANK`, `NORMBAND`, cohort `AVERAGE` grouped by entity, whole-population rollups | **SERVER** | Needs all rows / `GROUP BY`; not safe to assume the client holds the full population. All are v1. |

`eval_target` is **inferred** from the expression's function set at save time
(and shown as a badge on the column header), with a manual override. The UI
warns when a CLIENT formula references a population function.

### Server expression path (`ExpressionService`)
1. Parse formula → AST (a small, whitelisted grammar — **no eval of arbitrary
   SQL/Java**).
2. Validate column refs against the live `DatasetColumnDto` set for the sheet's
   source view + filters.
3. Compile AST → parameterized SQL fragment over a **read-only** projection of
   the session/score/demographic tables (never string-concatenate user input).
4. Execute; return computed column values keyed by `rowId`.

**Security note:** the formula language is a closed whitelist compiled to
*parameterized* SQL. No raw SQL, no reflection, no arbitrary code. This is the
single most important safety property of the design.

---

## 6. REST API contract (new `analytics` package)

Base: `/api/v1`. All require Bearer auth except the public share route.
Owner check: `workbook.owner_id == principal.id` (or admin).

```
# Workbooks
GET    /workbooks                         -> [WorkbookDto]   (owner's)
POST   /workbooks                         {name, description} -> WorkbookDto
GET    /workbooks/{id}                    -> WorkbookDto (with sheets, dashboards)
PUT    /workbooks/{id}                    -> WorkbookDto
DELETE /workbooks/{id}

# Sheets + derived columns
POST   /workbooks/{id}/sheets             {name, sourceView, sourceFilters, grain} -> SheetDto
GET    /sheets/{id}                       -> SheetDto (definition only)
GET    /sheets/{id}/data                  -> { columns[], rows[] }   # live pull + SERVER-derived cols merged
PUT    /sheets/{id}                       -> SheetDto (rename, displayState, filters)
DELETE /sheets/{id}
POST   /sheets/{id}/columns               {label, expr, evalTarget?, resultType, format} -> DerivedColumnDto
PUT    /sheets/{id}/columns/{colKey}      -> DerivedColumnDto
DELETE /sheets/{id}/columns/{colKey}
POST   /sheets/{id}/validate-expr         {expr} -> { ok, evalTarget, resultType, errors[], referencedColumns[] }

# Aggregation / query (powers KPIs, pivots, charts)
POST   /analytics/query                   QueryRequest -> QueryResult
#   QueryRequest = {
#     sourceView, sourceFilters,
#     dimensions: [colKey...],            # group by (e.g. ["core:entityName"])
#     measures:   [{ expr, agg, label }], # agg = sum|avg|count|min|max|p25|p50|p75
#     filters:    [{ colKey, op, value }],
#     having?, sort?, limit?
#   }
#   QueryResult = { columns[], rows[] }

# Dashboards + widgets
POST   /workbooks/{id}/dashboards         {name} -> DashboardDto
GET    /dashboards/{id}                   -> DashboardDto (widgets + layout)
PUT    /dashboards/{id}                   -> DashboardDto (layout)
DELETE /dashboards/{id}
POST   /dashboards/{id}/widgets           {type, sheetId, config, pos} -> WidgetDto
PUT    /widgets/{id}                      -> WidgetDto
DELETE /widgets/{id}

# Share links (read-only) — public consume reuses PublicTokensController pattern
POST   /dashboards/{id}/share             {expiresAt?} -> { token, url }
DELETE /share-links/{token}               (revoke)
GET    /public/dashboards/{token}         -> rendered DashboardDto + data   # NO auth
```

`GET /sheets/{id}/data` is the integration seam: it calls the existing
`DatasetService.sessions(...)`, then merges SERVER-evaluated derived columns.
CLIENT columns are computed in the browser from the same payload.

---

## 7. Frontend structure (Data Studio section)

Routes (add to `src/router.tsx`, under `PrivateRoute`):
```
/data-studio                      -> Workbook gallery (repurpose analytics.tsx shell)
/data-studio/wb/:wid              -> Workbook (tabs: Sheets | Dashboards)
/data-studio/wb/:wid/sheet/:sid   -> Sheet (grid + formula bar)
/data-studio/wb/:wid/dash/:did    -> Dashboard builder
/public/dash/:token               -> public read-only dashboard (PublicRoute)
```

Components (`src/components/data-studio/`):
- `SheetView` — wraps existing `DataGrid.tsx`; adds a **formula bar**, "add
  computed column" dialog (with live `validate-expr` preview), column badges
  (CLIENT/SERVER), per-column format.
- `useHyperFormula` — hook that builds a HyperFormula instance from the loaded
  rows + CLIENT derived columns; recomputes on edit.
- `DashboardCanvas` — dnd-kit grid of widgets.
- `widgets/` — `ChartWidget` (ApexCharts), `KpiWidget`, `TableWidget`,
  `PivotWidget`. Each binds to a sheet or a `/analytics/query`.
- `ExportMenu` — Excel (`xlsx`, already used) + PDF via print stylesheet
  (`@media print` + a clean print layout; server render only if needed later).

API client: add `dataStudioApi` to `lib/api.ts` next to `datasetsApi`, reusing
`jsonFetch`.

---

## 8. Phasing (each phase shippable)

**v1 = Phases 1–3.** Phase 4+ are post-v1.

| Phase | In v1? | Scope | New artifacts |
|---|---|---|---|
| **1. Sheets + formulas + co-ownership** | ✅ v1 | Workbooks/sheets persistence; **co-ownership (`ds_workbook_share`, EDITOR/VIEWER)**; wrap grid; CLIENT derived columns via HyperFormula; `validate-expr`. | `ds_workbook/sheet/derived_column/workbook_share`; Workbook+Sheet controllers + access guard; `ExpressionService` (parse/validate); `SheetView`, `useHyperFormula`. |
| **2. Server aggregation + population math** | ✅ v1 | `POST /analytics/query`; SERVER-eval columns; `GET /sheets/{id}/data` merge; **`PERCENTILE/PERCENTRANK/ZSCORE/RANK/NORMBAND`**; KPI + pivot data. | `QueryController`, AST→SQL compiler, population-function SQL, query DTOs. |
| **3. Dashboard builder** | ✅ v1 | Canvas, chart/KPI/table/pivot widgets, persistence. | `ds_dashboard/widget`; `DashboardController`; widget components. |
| **4. Export (print→PDF) + Excel** | ⬜ next phase | Print-stylesheet → PDF; Excel export via `xlsx`. *(Explicitly deferred past v1.)* | `ExportMenu`, print layout. |
| **5. Share links** | ⬜ later | Read-only tokenized dashboard links; public route. Scope (internal vs external) **TBD**. | `ds_share_link`; `/public/dashboards/{token}`. |
| **6. BodhLens NL** | ⬜ later | Wire the NL stub to generate `QueryRequest`/formula suggestions via the Claude API (the analytics page already advertises it). | NL→query service. |

---

## 9. Risks & growth points (small-scale → larger)

- **Client eval ceiling.** HyperFormula over loaded rows is fine for thousands
  of rows; beyond ~50k, push more formulas SERVER-side or paginate. *Growth
  point: make `eval_target` default to SERVER above a row threshold.*
- **Live re-pull cost.** Every sheet open re-queries `DatasetController`.
  *Growth point: add a short-TTL cache (Redis already in stack via LiveTracking)
  keyed by `(sourceView, filters)`.*
- **`ddl-auto=update`** is convenient but not a migration story. *Growth point:
  introduce Flyway before this hits production data.*
- **Expression safety** is the critical invariant — keep the whitelist closed;
  never compile user text into raw SQL.
- **Share-link exposure.** Read-only, tokenized, revocable, optional expiry; no
  PII beyond what the dashboard already aggregates. Confirm consent/compliance
  rules (there's a `compliance/` section in the app) before enabling external
  sharing of respondent-level data.

---

## 10. Resolved with the architect (2026-06-03)
1. **Cohort math** — ✅ **All** of `PERCENTILE`, `PERCENTRANK`, `ZSCORE`, `RANK`,
   `NORMBAND` are v1 (server grammar, §5).
2. **Share scope** — ⏳ **Deferred.** Internal-vs-external decision to be made
   later; share links are Phase 5 anyway, so this doesn't block v1.
3. **Co-ownership** — ✅ **Yes, in v1.** `ds_workbook_share` (EDITOR/VIEWER) lands
   in Phase 1 (§4, §8).
4. **PDF** — ✅ **Print-to-PDF**, but **Phase 4 (next phase), not v1.**
5. **BodhLens** — ⏳ **Later** (Phase 6), layered on `/analytics/query`.

### Still to confirm before Phase 2
- `NORMBAND` norm sources: inline cutoffs/percentile breaks in v1 — do you need a
  persisted, reusable **norm set** (`ds_norm_set`) soon after? (Common for
  standardized instruments with published norms.)
```
