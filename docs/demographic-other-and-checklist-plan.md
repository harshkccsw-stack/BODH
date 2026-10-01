# Demographic CHECKLIST type and the write-in "Other" choice

**STATUS (2026-10-01): BUILT AND VERIFIED.** `V39` applied to the local
database (`bodh-local-mysql`, port 3310; the running server rebooted clean
under `ddl-auto: validate`). `./mvnw -B test` green at **473** (5 new in
`DemographicChecklistTest`). Both frontends typecheck and build. A live smoke
against 8080 covered every 400 and 409 below; its `__smoke__` rows were
deleted afterwards.

## 1. What was asked

- **Write-in "Other"**: a Dropdown can have an "Other (specify)" choice. Picking
  it shows a text box, and the respondent must type. A plain "Other" with no
  text box is still just an ordinary option — nothing new.
- **CHECKLIST**: a new demographic type where the respondent ticks any number
  of options ("Digital Device(s) Used"). It can have the same write-in.
- No min/max tick limits and no exclusive "None of these" for now.

## 2. Storage — no new table

### The field

Options live in `demographic_field_option`, exactly like a Dropdown's. The
write-in is **not** an option row: it is `demographic_field.other_option_label`
(NULL = none) and is always delivered last.

| demographic_field_id | field_type | label | other_option_label |
|---|---|---|---|
| 6 | CHECKLIST | Devices used | Other (specify) |

### The answer — one row per tick

| field | response_value | option_value | other_text |
|---|---|---|---|
| 6 (Checklist) | Smartphone | Smartphone | NULL |
| 6 (Checklist) | Laptop | Laptop | NULL |
| 6 (Checklist) | Other (specify) | Other (specify) | Smart glasses |
| 5 (Dropdown) | Delhi | *(empty)* | NULL |

- The unique key is (respondent, assessment, field, **option_value**). It
  replaced (respondent, assessment, field).
- `option_value` is `''` on every non-checklist row (the column DEFAULT), so
  Text / Number / Date / Dropdown keep the database's one-answer-per-field
  guarantee. A checklist gets one row per distinct tick.
- It is `''` and not NULL because MySQL never treats two NULLs as equal.
- It is `utf8mb4_bin` so the key compares exactly. The table's `ai_ci`
  collation would treat "Cafe" and "Café" as the same key.
- `other_text` is `VARCHAR(255)` and is set only on the row that picked the
  write-in.

## 3. Risks, and what handles each

| # | Risk | Handled by |
|---|---|---|
| 1 | The old key refused a second tick | Key swap in V39, adding the new key before dropping the old one (errno 1553) |
| 2 | Single-value fields losing their DB guarantee | `option_value = ''`, tested by `theDatabaseStillAllowsOneAnswerPerSingleValueField` |
| 3 | Readers that map rows by field keeping only the last tick | Export and Data Studio collect a list per field; the respondent-detail count uses distinct fields |
| 4 | A duplicate tick causing a 500 at commit | `checklistTicks` collapses repeats |
| 5 | Case/accent collisions in the key | `utf8mb4_bin`; options must also differ ignoring case |
| 6 | Renaming an answered option dropping ticks from the export | 409: a choice anyone picked can't be renamed or removed. The same applies to the write-in label and to Dropdowns |
| 7 | A type change on answered data | 409: the type is fixed once a field has answers (any type) |

## 4. API (no new endpoints)

- `POST/PUT /api/demographic-fields/create|update` accept `CHECKLIST` and
  `otherOptionLabel`. Rules (`DemographicFieldController.choiceProblem`,
  mirrored in `demographics.tsx`):
  - at least one option;
  - options distinct ignoring case;
  - the write-in may not repeat an option;
  - no `]` in a checklist choice, because it would end a Data Studio
    `[demo:…]` reference;
  - free-input types keep neither options nor a write-in.
- `POST /api/portal/assessments/begin/{id}`: `DemographicEntry` gained
  `values` (CHECKLIST only) and `otherText`.
  - A checklist sent as `value`, or a single-value field sent as `values`, is
    a 400.
  - Every tick must exactly match a choice.
  - A required checklist needs at least one tick.
  - Write-in picked → text required and at most 255 characters (counted in
    code points).
  - Text with no write-in picked → 400.
- `GET /api/portal/assessments/getById/{id}`: each field carries
  `otherOptionLabel`.
- Export (`ExportSheetResponse`):
  - `DemographicColumn` gained `fieldType`, `options` and `otherOptionLabel`;
  - `ExportRow` gained `demographicSelections` (checklist ticks in choice
    order) and `demographicOtherTexts`;
  - `demographics` holds a checklist's ticks joined with `"; "`.

## 5. Reading it back

- **Excel "Raw Data"** (`reportApis.ts` `demographicCells`):
  - a Checklist is one column per choice, `Label: Choice`, holding 1 or 0 —
    blank when never answered;
  - any field with a write-in adds a `Label (specified)` column;
  - Dropdowns stay one column.
- **Data Studio**:
  - `demo:<id>` holds the joined ticks;
  - `demo:<id>:opt:<choice>` is 1 / 0 / null, keyed by the choice's TEXT so
    that reordering can't repoint a formula;
  - `demo:<id>:other` holds the typed text;
  - a Dropdown's enum filter includes the write-in.
- **Portal**:
  - Checklists render Google-Forms style: a full-width, single-column list
    of plain rows, each a square marker beside its label, with no tile around
    each choice;
  - a checklist's write-in is the question runner's "Other…" row: label and
    an always-visible underline box on one line, and focusing the box ticks
    it. A dropdown's write-in box appears under the select once Other is
    picked;
  - the field's `placeholder` is the box's hint (default "Please specify");
    a choice field had no other use for it.

## 6. Known edges, not handled

- Converting an existing plain "Other (specify)" option into the write-in:
  delete the option and switch the write-in on with the **same text**. Old
  answers then stay in the same group, but have no `other_text`.
- Switching a write-in off after people have used it is refused (risk 6). If
  that is ever wanted, the old `other_text` stays in the DB but no column
  shows it.
- **MemoryMesh's import** (`/api/sync/memorymesh/assessments/{id}`) now sees
  `CHECKLIST` and `otherOptionLabel`. MemoryMesh must tolerate both before a
  questionnaire with a checklist is imported there.
