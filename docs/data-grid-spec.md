# BodhAssess Data Grid — Spec & Implementation Plan

> Status: **Draft / brainstorm** · Owner: TBD · Last updated: 2026-05-30
>
> A reusable, Google-Sheets-like grid inside the BodhAssess admin app for viewing,
> analyzing, and editing assessment data. Serves all audiences (internal admins,
> client-org admins, researchers/psychometricians).

---

## 1. Goal

One reusable `<DataGrid>` component that can render any dataset "view" with full
spreadsheet feel: cell-range selection, copy/paste, sort/filter/group, derived
(formula) columns, conditional formatting, export, and **audited inline editing**
that writes back to the API.

v1 starts with the **Sessions / Results** view and is built so Respondents and
Raw-answers views drop in with no rework.

### Decisions locked in this brainstorm
- **Primary view:** Sessions/Results first; reusable for all views.
- **Feature depth:** full spreadsheet feel.
- **Grid library:** **Glide Data Grid** (MIT, canvas-based, native cell-range + copy/paste).
- **Editing:** editable **with audit**, scope = **everything incl. flagged score override**.
- **Audience:** all — permissions enforced server-side.

---

## 2. What is one row? (the grain)

Data is deeply relational, so each "view" fixes a row grain:

| View | One row = | Columns | Audience |
|------|-----------|---------|----------|
| **Sessions / Results** (v1) | one `PortalSession` | core fields + per-MQT score columns + demographic columns | core "assess the data" |
| Respondents | one `Respondent` | demographics + summary scores | client/internal admins |
| Raw answers | one `AssessmentAnswer` | respondent, item, option, score | psychometricians |

---

## 3. Data contract

Score columns are **dynamic** (each questionnaire measures different MQ/MQTs), so the
backend describes its own columns. One generic endpoint per view, self-describing:

```
GET /api/datasets/sessions?entityId=&questionnaireId=&page=&size=&sort=&filter=
→ {
    columns: [
      { key:"respondentName", label:"Respondent", type:"string",   group:"core",   editable:true  },
      { key:"instrument",     label:"Instrument", type:"string",   group:"core",   editable:false },
      { key:"completedAt",    label:"Completed",  type:"datetime", group:"core",   editable:true  },
      { key:"status",         label:"Status",     type:"enum", options:[...],       editable:true  },
      { key:"demo:age",       label:"Age",        type:"number",   group:"demo",   editable:true  },
      { key:"mqt:OPENNESS",   label:"Openness",   type:"number",   group:"scores", editable:"override" },
      { key:"answer:Q12",     label:"Q12",        type:"int",      group:"answers", editable:true  }
    ],
    rows: [ { rowId:"<sessionId>", _updatedAt:"…", respondentName:"…", "mqt:OPENNESS":4.2, … } ],
    page: { number, size, totalRows }
  }
```

### Model mapping (verified against current models)
- **Core columns** ← `PortalSession` (respondentName, respondentEmail, instrument,
  instrumentFullName, vertical, language, status, groupName, entityName, createdAt,
  startedAt, completedAt, updatedAt, proctoring, …)
- **Score columns** ← pivot `PortalSession.mqtScores[]` → `PortalSessionMqtScore`
  (`mqtName` becomes column label, `mqtId` the key, `score` the value)
- **Demographic columns** ← pivot `PortalSession.demographics[]` →
  `PortalSessionDemographic` (`fieldKey` → column, `value` → cell)
- **Answer columns** (raw-answers view / expandable) ← `AssessmentAnswer`
  (`questionId`, `optionIndex`, `freeText`)

`rowId` + `_updatedAt` on every row drive edit targeting and optimistic concurrency.

---

## 4. Feature split

**Server-side (scales):** pagination, sort, filter, group, scope/permission enforcement.
**Client-side (instant, in-grid):** cell-range select, copy/paste, column
show/hide/reorder/freeze, derived columns, conditional formatting, footer aggregates,
charts from selection (ApexCharts, already a dependency).

Derived columns + formatting + filters are **view config**, persisted per user in a new
`saved_views` table — never mutates source data.

---

## 5. Editing layer (audited write-back)

### 5.1 Editability tiers — scores are computed, not stored truth
Scoring chain: `AssessmentAnswer.optionIndex` → option scores → `PortalSessionMqtScore.score`.

| Edit target | Effect | v1 behavior |
|---|---|---|
| **Metadata** (status, names, group, demographics, dates) | local field update | directly editable |
| **Raw answer** (`AssessmentAnswer.optionIndex` / `freeText`) | must **recompute** dependent `mqtScores` | editable + recompute cascade |
| **Computed score** (`PortalSessionMqtScore.score`) | breaks link to answers | **flagged override** — stores original + override, badged, reversible |

### 5.2 Edit flow
1. Grid emits cell/range edit (Glide gives range paste natively).
2. Frontend batches → `PATCH /api/datasets/sessions/cells`
   body: `[{ rowId, columnKey, oldValue, newValue, rowUpdatedAt }]`.
3. Backend, per cell, in a transaction:
   - assert **column editable** + **user has write scope** for that row's `entityId`
   - **optimistic concurrency**: reject if row `updatedAt` ≠ `rowUpdatedAt` (return fresh value)
   - **validate** by column type (number range, enum membership, date format)
   - apply change; if raw answer → **recompute** session scores; if score override →
     set override flag + keep computed original
   - write one `AuditLogEntry` (reuse existing model + `AuditLogController`):
     `action="cell.edit"`, `targetType`, `targetId`, `beforeJson`, `afterJson`,
     `actorId`, `actorName`
4. Response returns updated rows (incl. recomputed scores) → grid repaints.

### 5.3 Must-design
- **Conflict UI** — optimistic-lock reject → "value changed: keep yours / theirs".
- **Bulk-edit guardrails** — cap range size; one transaction; confirm on large edits;
  N recomputes batched.
- **Override provenance** — overridden score visually badged (conditional formatting),
  reversible to computed value, both values in audit.
- **Write ≠ read permissions** — researcher may read-all/edit-none; client admin edits
  own org metadata only, not scores.

---

## 6. Permissions (all audiences)
Enforced in the dataset query and the PATCH handler, never only in UI:
- **Client-org admin** → rows where `entityId` = their org; edit metadata only.
- **Researcher** → optional PII mask (respondentName/email → stable pseudo-id); read-only.
- **Internal admin** → all rows; full edit incl. score override.

---

## 7. Build vs buy
**Glide Data Grid** chosen: MIT license, canvas virtualization (handles large
psychometric datasets), native cell-range selection + copy/paste — the exact
"spreadsheet feel" features that are painful to hand-build. Keep existing
`@tanstack/react-table` for the app's simpler tables; introduce Glide only for this
analytical grid.

---

## 8. Implementation plan

### Phase 0 — Foundations
- [ ] Add `@glideapps/glide-data-grid` to `bodhassess-app`.
- [ ] Create `saved_views` table + entity/repo (id, userId, viewKey, name, configJson, createdAt).
- [ ] Define shared TS types for the dataset envelope (`columns`, `rows`, `page`).

### Phase 1 — Read grid (independently shippable)
**Backend**
- [ ] `DatasetController` + `DatasetService` with `GET /api/datasets/sessions`.
- [ ] Build dynamic column metadata: core fields + pivot of `mqtScores` + `demographics`.
- [ ] Server-side sort / filter / pagination params; reuse `PortalSessionRepository`.
- [ ] Scope filter by role/entityId in the query.

**Frontend**
- [ ] `<DataGrid>` wrapping Glide, driven by column metadata (in `src/components`).
- [ ] TanStack Query hook `useDataset('sessions', params)`.
- [ ] Sort, per-column filter UI, column show/hide/reorder/freeze, sticky header.
- [ ] CSV / XLSX export of current view.
- [ ] New route/page under `src/pages` linked from the dashboard nav.

### Phase 2 — Analysis
- [ ] Derived/formula columns (safe expression evaluator over visible columns).
- [ ] Conditional formatting rules (score bands → cell color).
- [ ] Footer aggregates (count, mean, median, stddev) per numeric column.
- [ ] Charts from selection via ApexCharts.
- [ ] `saved_views` persistence (save / load / share a view config).

### Phase 3 — Edit: metadata
- [ ] `PATCH /api/datasets/sessions/cells` (batch), type validation, optimistic
      concurrency on `updatedAt`.
- [ ] Write `AuditLogEntry` per cell via existing audit infra.
- [ ] Editable cells in Glide for metadata columns only; conflict-resolution UI.

### Phase 4 — Edit: raw answers
- [ ] Extend PATCH to `AssessmentAnswer` edits.
- [ ] Score **recompute cascade** for affected `PortalSession`; return recomputed rows.

### Phase 5 — Edit: score override
- [ ] Override flag + original-value storage on `PortalSessionMqtScore` (schema add).
- [ ] "Override" edit mode; badge overridden cells; revert-to-computed action.
- [ ] Audit captures computed-original + manual-override.

### Cross-cutting
- [ ] Write-permission checks distinct from read in PATCH handler.
- [ ] Bulk-edit range cap + large-edit confirmation.
- [ ] Tests: dynamic-column pivot, scope filtering, optimistic-lock conflict, recompute correctness, audit entries.

---

## 9. Deferred (post-v1)
- Pivot tables (consider AG Grid Enterprise if needed).
- Real-time multi-user collaboration / presence.
- Respondents & Raw-answers views (envelope already supports them).
- Scheduled exports / report snapshots.
