# BodhAssess REST API

Base URL (local dev): `http://localhost:8080/api/v1`

All requests/responses are JSON (`Content-Type: application/json`) unless
noted. Every endpoint returns appropriate HTTP status codes (`200` / `201` /
`204` / `400` / `401` / `404` / `500`).

CORS is enabled for `http://localhost:3000` and `http://localhost:3001` out
of the box — add your production origin to `main.go`'s
`cors.Handler(cors.Options{ AllowedOrigins: [...] })` when deploying.

---

## 1. Health

### `GET /health`
No auth. Returns platform + DB health.

```json
{
  "status": "healthy",
  "service": "bodhassess-api",
  "version": "1.0.0-phase1",
  "database": true,
  "time": "2026-04-20T12:00:00Z"
}
```

---

## 2. Respondents

Canonical portal users. Persisted in the `respondents` table.

### `GET /respondents`
List all. Response: `Respondent[]`.

### `POST /respondents`
Create (idempotent — `ON CONFLICT (id) DO UPDATE`).
Body:
```json
{
  "id": "R-007",
  "name": "Arjun Patel",
  "email": "arjun@example.com",
  "dob": "1995-03-14",
  "consent": "Granted"
}
```

### `GET /respondents/:id`

### `PUT /respondents/:id`
Partial update. Any field that's `''` or `0` in the body is treated as "no
change" except for `dob` which accepts clearing.

### `DELETE /respondents/:id`
Cascades to `portal_auth_sessions` via FK.

### `POST /respondents/login`
Body: `{ "id": "R-007", "dob": "1995-03-14" }`.
Success 200:
```json
{
  "token": "e9443a70-5015-442f-928e-caf46e91ccc7",
  "respondent": { "id": "R-007", "name": "Arjun Patel", "email": "…" }
}
```
Failure 401: `invalid credentials`.

### `GET /respondents/me`
Requires `Authorization: Bearer <token>` header (or `?token=…` query).
Returns the respondent the token belongs to, or 401 if token is
invalid/expired.

### `POST /respondents/logout`
Same auth; deletes the server-side session row. 204 on success.

---

## 3. Practitioners

### `GET /practitioners`
### `POST /practitioners`
Body:
```json
{
  "id": "P-007",
  "name": "Dr. Meera Krishnan",
  "email": "meera@apollo.in",
  "role": "Senior Practitioner",
  "verticals": ["Clinical", "Counselling"],
  "status": "Active",
  "last_login": "2026-04-20 09:15"
}
```
### `GET /practitioners/:id`
### `PUT /practitioners/:id`
### `DELETE /practitioners/:id`

---

## 4. Groups (Respondent Groups)

Tree of nested groups. `parent_id` references another group (or null for roots).

### `GET /groups`
Returns every group. Frontend builds the tree client-side.

### `POST /groups`
Idempotent upsert.
```json
{
  "id": "grp-abc123",
  "name": "Grade 9 Students",
  "description": "Optional",
  "parentId": null,
  "memberIds": ["R-001", "R-002"],
  "assignedInstruments": ["PHQ-9 (…)"]
}
```

### `GET /groups/:id`
### `PUT /groups/:id`
### `DELETE /groups/:id`
Cascades to children via FK `ON DELETE CASCADE`.

---

## 5. Measured Qualities (MQ / MQT)

### `GET /qualities`
### `POST /qualities`
Upsert.
```json
{
  "id": "mq-personality",
  "name": "Personality",
  "description": "Big-5 style traits",
  "mqts": [
    { "id": "mqt-e", "name": "Extraversion" },
    { "id": "mqt-o", "name": "Openness" }
  ]
}
```

### `GET /qualities/:id`
### `PUT /qualities/:id`
### `DELETE /qualities/:id`

---

## 6. Verticals (user-created)

### `GET /verticals`
### `POST /verticals`
```json
{ "id": "v-sports", "code": "SPORTS_PSYCH", "name": "Sports Psychology" }
```
### `GET /verticals/:id`
### `DELETE /verticals/:id`

Built-in verticals (CLINICAL, INDUSTRIAL, COUNSELLING, EXPERIMENTS) are NOT
stored in this table — they're implicit on the frontend side. The
`getVerticals()` helper merges them with backend rows.

---

## 7. Published Questionnaires

Full-fidelity questionnaire storage (MQs + questions as JSONB) for user-published instruments.

### `GET /questionnaires`
Query params: `?vertical=CLINICAL` (optional) to filter by vertical.

### `POST /questionnaires`
Upsert. On conflict by `id`, updates all fields. Also dedupes by `name`
(so re-publishing with a changed id but same name cleans up the old row).
Body:
```json
{
  "id": "qn-xyz",
  "name": "My Custom PHQ",
  "shortName": "MCPHQ",
  "vertical": "CLINICAL",
  "category": "Depression",
  "description": "…",
  "duration": 5,
  "tier": "T1",
  "languages": ["en","hi"],
  "mqs": [{ "id": "m", "name": "Depression", "mqts": [{ "id": "t", "name": "Severity" }] }],
  "questions": [{
    "id": "q1",
    "stem": "Little interest in things",
    "format": "LIKERT",
    "media_url": "",
    "media_type": "none",
    "clinical_risk_flag": false,
    "risk_flag_rule": "",
    "options": [
      { "text": "Not at all", "scores": [{ "mqt_id": "t", "score": 0 }] },
      { "text": "Several days", "scores": [{ "mqt_id": "t", "score": 1 }] }
    ]
  }],
  "isDemo": false
}
```

### `GET /questionnaires/:id`
### `GET /questionnaires/by-name?name=…`
Case-insensitive lookup by `name` or `short_name`. Used by the portal take
page to resolve the questionnaire attached to a session.

### `DELETE /questionnaires/:id`

---

## 8. Portal Sessions

The live-session table (`portal_sessions`).

### `GET /portal-sessions`
Optional query: `?respondentId=R-001` to filter. Ordered by `created_at DESC`.

### `POST /portal-sessions`
Create a single session.
```json
{
  "id": "SESS-B001",
  "respondentId": "R-001",
  "respondent": "Arjun Patel",
  "respondentEmail": "arjun@example.com",
  "instrument": "PHQ-9",
  "instrumentFullName": "PHQ-9 (Patient Health Questionnaire)",
  "vertical": "Clinical",
  "language": "English",
  "status": "Active",
  "score": "--",
  "consentId": "CONSENT-2026-0012 · http://…/uploads/abc.pdf",
  "proctoring": false,
  "invitationSent": false
}
```

### `POST /portal-sessions/bulk`
Body: `{ "sessions": [ …{session}… ] }`. Returns `{ "created": N }`.
Used by the Groups page to assign one instrument to every member of a group.

### `GET /portal-sessions/:id`

### `PUT /portal-sessions/:id`
Partial update. Setting `status: "Completed"` auto-sets `completed_at` to now
(server-side) if the client didn't supply it.
```json
{
  "status": "Completed",
  "score": "Depression=8, Anxiety=6",
  "answers": { "q1": 2, "q2": 3 },
  "mqtScores": { "Depression": 8, "Anxiety": 6 }
}
```

### `DELETE /portal-sessions/:id`

---

## 9. Item Display State

Per-item display overrides + soft-deletes for the Item Explorer.

### `GET /item-display`
Returns every override/delete row.
```json
[
  { "itemId": "mock-xyz", "override": { "stem": "…", "status": "Validated" }, "deleted": false },
  { "itemId": "mock-deleted", "deleted": true }
]
```

### `POST /item-display/override`
```json
{ "itemId": "mock-xyz", "override": { "stem": "New text" } }
```

### `POST /item-display/:id/delete`
Soft-delete (hides the item in Item Explorer).

### `DELETE /item-display/:id`
Clears the row entirely (restores default display + visibility).

---

## 10. File Upload

### `POST /upload` — multipart

| Field | Description |
|---|---|
| `file` | The uploaded file |

Accepted extensions and caps:

| Extension | media_type | Max size |
|---|---|---|
| jpg / jpeg / png / gif / webp | image | 50 MB |
| mp4 / webm / mov | video | 50 MB |
| mp3 / wav / ogg | audio | 50 MB |
| pdf | document | **2 MB** |

Response 201:
```json
{
  "url": "http://localhost:8080/uploads/e9443a70-….pdf",
  "media_type": "document",
  "filename": "consent.pdf",
  "size": 61
}
```

Uploaded files are served back under `/uploads/<uuid>.<ext>`.

---

## 11. Legacy / partially wired endpoints

These exist in the code (from 001_init.sql) but are NOT the primary path used
by the current UI. Safe to keep; plan to retire once the matching tables are
fully replaced by the newer `portal_*` / `published_questionnaires` tables.

- `GET /instruments` — from the `instruments` table (pre-MQ era)
- `POST /instruments`
- `GET /instruments/:id`
- `GET /instruments/:instrumentId/items`
- `POST /instruments/:instrumentId/items`
- `POST /instruments/:instrumentId/items/bulk`
- `GET /sessions` — from the `sessions` table (pre-MQ era, more structured fields)
- `POST /sessions`
- `GET /sessions/:id`

---

## 12. Conventions

- **IDs:** client-generated strings (e.g. `R-001`, `P-003`, `grp-xxxxxx`, `qn-xxxxxx`)
  for entities authored in the UI. Sessions use `SESS-` prefixes.
  The portal auth token is a UUID generated by Postgres.
- **Timestamps:** RFC 3339 UTC in responses. Database stores `TIMESTAMPTZ`.
- **Soft fields:** empty string (`""`) is normalised to SQL `NULL` on insert
  in most handlers.
- **Error format:** handlers write plain text to `http.Error(w, msg, code)`;
  a few use JSON — not yet standardised. Clients should not parse error bodies
  for structured fields today.
