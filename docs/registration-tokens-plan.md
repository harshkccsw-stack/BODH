# Token-based respondent self-registration

Phase 1 (resolve a link and draw the form) is **built and verified**.
Phase 2 (actually registering) is designed below but **not built**.

An admin shares a link. A respondent opens it, fills one form, and comes out
the other side as a real `RespondentUser` in the right organization, holding an
allotment for an assessment, already signed in to the portal.

| Scope | Link means | Respondent picks |
| --- | --- | --- |
| **Assessment-scoped** | this org **and** this assessment | nothing — shown locked |
| **Org-scoped** | this org, any assessment in its catalog | one assessment from a dropdown |

---

## 1. Schema (built) — `V6__add_registration_token.sql`

One table, `RegistrationToken`, one row per minted link. Which of two nullable
FK columns is populated **is** the discriminator:

| `organization_id` | `organization_assessment_mapping_id` | meaning |
| --- | --- | --- |
| set | null | org-wide link |
| null | set | one catalog entry |

The organization is deliberately **not** repeated on assessment-scoped rows —
the mapping row already carries it, and a second copy is a second source of
truth that can drift.

That split is what makes "no duplicate links" two ordinary unique keys rather
than a sentinel value or an expression index. A unique key over a nullable
column constrains exactly the rows where the column is present, which is
precisely the set each rule is about:

- `uqRtOrganization` → at most one org-wide link per organization; every
  assessment-scoped row sits outside it.
- `uqRtOrganizationAssessmentMapping` → at most one link per catalog entry.
  Because `uqOamOrganizationAssessment` already makes `(organization,
  assessment)` unique, *"one link per assessment per org"* falls out of a key
  that already existed instead of being a second rule to keep in sync.
- `ckRtScope` → the row must target exactly one of the two. Without it, a row
  with both columns null would slip past both unique keys (they only see
  non-null values) and a row with both set would claim two targets.

Lifecycle columns: `status` (ACTIVE/INACTIVE), `expires_at`, `max_uses`,
`used_count`, `created_at`. One row per target, so rotating is an update in
place — there is no history of retired links. If that is ever wanted it is a
second table, not a second row here.

`token` is `varchar(43) CHARACTER SET ascii COLLATE ascii_bin` — **not** the
schema's default `utf8mb4_0900_ai_ci`, which is case-insensitive and under
which `aB…` and `Ab…` would be the same token: the unique key would reject
distinct tokens and, worse, a lookup would match a wrong-case guess. 43 chars =
32 bytes of `SecureRandom` in Base64url without padding.

**Deletion is composition, not a pre-check.** A link means "register for THIS
org / THIS catalog entry", so it dies with its target. Both FKs are RESTRICT,
so `OrganizationController` clears links *before* deleting catalog rows
(`unassignAssessments`) and before deleting an organization
(`deleteOrganization`).

## 2. Backend (built)

`RegistrationTokenController` → `GET /api/registration-tokens/getByToken/{token}`

**Unauthenticated by design** — the token in the path is the credential, and a
respondent following the link has no account yet. It only reads, and only the
two facts the form needs. Token metadata (use count, expiry, status) is
deliberately **not** in the response: it tells the page nothing and an attacker
something. The minting and revoking endpoints that come next are the admin's
and must not join this path without auth.

Returns organization name + logo, the scope, and `assessments` populated for
**both** scopes so the form has one thing to render — an assessment-scoped link
sends the single fixed assessment with `assessmentId` set (locked field), an
org-scoped link sends the whole ACTIVE catalog with `assessmentId` null
(dropdown).

- **404, one neutral message** for unknown / revoked / expired / used-up alike.
  Naming the reason confirms to a prober that their guess was a real token.
- **409** when the link is real but its assessments are not open — an admin's
  configuration mistake, which the respondent and whoever they call need to be
  able to tell apart from a bad link.
- INACTIVE assessments are filtered from the catalog and reject an
  assessment-scoped link, mirroring the rule
  `RespondentAssessmentController.assign` enforces for admins. A link must not
  be a way around it.

## 3. Portal (built)

`/register/:token` **and** `/portal/register/:token` → `pages/register-token.tsx`.
The bare path is the one that gets printed, QR-coded and pasted into messages;
the `/portal` form keeps it consistent with every other route.

Organization logo and name sit above the form. The assessment field renders
locked or as a dropdown from the same `assessments` array; an org-wide link
with exactly one open assessment is pre-selected, since a dropdown of one is a
choice nobody can get right or wrong. Identity fields (name, email, dob, phone,
employee id) are laid out but **submit is disabled** — that is phase 2.

The old `pages/register.tsx` (`?token=` against the dead v2 `/public/tokens/…`)
is untouched and still routed at `/portal/register`. Nothing new depends on it.

## 4. Phase 2 — the registration transaction (NOT built)

`POST /api/registration-tokens/register/{token}` — one `@Transactional` service
method, validate-everything-then-write, the two-pass shape the bulk endpoints
already use.

**Pass 1 — validate:**

1. Re-resolve and re-check the token (usable, target still mapped). The GET is
   advisory; this is the gate.
2. Assessment: fixed by the link, or required in the body **and** verified
   against the org's catalog — never trust the picker. Must be ACTIVE.
3. `dob` required (it is the credential); `email` required, trimmed.
4. Email branch — the branch that decides the product:
   - **no `User`** → clean create.
   - **`User` exists, dob matches, no respondent profile** → attach one, as
     `RespondentController.create` already does for admins.
   - **dob matches, respondent profile exists** → unaffiliated: join the
     token's org, allot, sign in. Already in *this* org: allot if needed, sign
     in. Already in **another** org: **409, refuse** — membership is single and
     silently moving someone takes their whole history with them.
   - **dob does not match** → 409 "an account with this email already exists —
     sign in instead". Never reveal the dob, never overwrite it.
5. `employeeId` if collected: alphanumeric (load-bearing — no `@`, so portal
   login can keep splitting one field on it), upper-cased, pre-checked unique
   within the org via `countByEmployeeIdInOrganization`.
6. Never `catch` a `DataIntegrityViolationException` inside the transaction —
   it marks the transaction rollback-only and 500s at commit even after a 409
   is returned.

**Pass 2 — write:** `User` (then `serialId = USR-%06d`, derived from the
generated id — easy to forget, nothing complains until a screen shows a blank
code) → `RespondentUser` with the token's organization → `RespondentAssessmentMapping`
NOT_STARTED → bump `used_count` → `jwt.issueToken(user)`. Return the bearer plus
`respondentAssessmentMappingId` so the portal lands on
`/portal/assessment/{id}`.

**Two concurrency notes:**

- Two people submitting the same new email at once: both pass the pre-check,
  the loser hits `uqUserEmail` at commit. The catch must sit **outside** the
  transaction boundary — a `RegistrationService` (`@Transactional`) with the
  controller mapping the violation to 409.
- `used_count` vs `max_uses`: read-then-increment lets two concurrent
  registrations consume the last use. The increment must be
  `UPDATE … SET used_count = used_count + 1 WHERE token = ? AND (max_uses IS NULL OR used_count < max_uses)`
  with the registration failing if it affects 0 rows.

**Consent** stays false at registration — the take flow's terms step already
records it. **Demographics** are per-attempt and stay in the take flow.

## 5. Also still to build

- Admin minting / rotating / revoking, and surfacing the link on the
  organization page (Copy / Rotate / Revoke, `used / max`). Nothing can create
  a token today except SQL.
- URL composition: backend returns the bare token; the admin app composes
  `${VITE_PORTAL_URL}/register/${token}`, keeping deployment URLs out of the
  backend. Switch to an `app.portal.base-url` property the day links get
  emailed.
- Rate limiting. The endpoint is public and phase 2 writes rows; with no Spring
  Security filter the 256-bit token is the only gate.

## 6. Consequences worth knowing

- Self-registration creates members and allotments, so `unassign-assessments`'
  existing "has member assignment(s) — remove those first" 409 will fire far
  more often. Nothing to change; expect it.
- Same link twice does nothing new: `RespondentAssessmentMapping` is unique per
  (respondent, assessment) with no attempt number, so a returning respondent is
  signed in and shown the attempt they already have. Re-takes would be an
  `attemptNumber` change to RAM, not to this feature.
- The link is a bearer credential in a URL — it leaks through history, Referer,
  screenshots and forwarded messages. Revoke and expiry are the mitigation.
