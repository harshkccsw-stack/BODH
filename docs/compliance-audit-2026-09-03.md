# BodhAssess — Compliance & Security Audit

**Date:** 2026-09-03  ·  **Commit audited:** `b4b335ff` (branch `main`)
**Scope:** `spring-social/` (API), `bodhassess-app/` (dashboard), `bodhassess-portal/` (respondent portal), `docker-compose.yml`, `nginx/`, `ops/`
**Method:** static review of source, configuration, deployment and operational scripts in this repository. **No live testing was performed** against `api.bodh.biz` or the production droplet — several findings below carry a verification step that must be run there.

---

## 1. Executive summary

BodhAssess processes **sensitive personal data** — name, email, date of birth, phone, gender, employer code, and psychometric assessment responses — for identified individuals, on behalf of client organizations.

The engineering quality of this codebase is high in places that matter: schema changes are disciplined (Flyway, `ddl-auto: validate`), the activity trail is thoughtfully designed, rich-text input is rejected rather than sanitized, and the container port-publishing policy is a real control born of a real incident. Those are genuine assets and an auditor will credit them.

But the platform currently has **no enforced authentication in either deployment profile**, and its **sole credential is a date of birth** that is itself stored as a visible data field. Those two facts together mean the entire respondent database is reachable, and every account impersonable, by anyone who can reach the API. Everything else in this report is secondary to them.

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 4 |
| Medium | 5 |
| Low | 2 |

**Certification readiness today:** ISO 27001 — not certifiable. SOC 2 Type I — would fail. SOC 2 Type II — no observation period possible until controls exist. DPDP — non-compliant with §8(5) (reasonable security safeguards) and §8(7)/§12 (retention and erasure).

---

## 2. Applicability: which of these frameworks actually bind BodhAssess

Not all nine apply. Stating this precisely matters, because scoping a compliance programme against frameworks you are not subject to wastes money and dilutes the ones that do apply.

| Framework | Applies? | Basis |
|---|---|---|
| **DPDP Act, 2023** | **YES — directly, and primary** | BodhAssess processes digital personal data of individuals in India. It is a **Data Fiduciary** for its own accounts and a **Data Processor** for data supplied by client organizations. Penalties to ₹250 crore for failure of reasonable security safeguards; ₹200 crore for failure to notify a breach. Confirm current commencement dates for each obligation with counsel — the DPDP Rules phase obligations in over time. |
| **ISO/IEC 27001** | **YES — voluntary but commercially necessary** | Enterprise and government buyers of assessment platforms ask for it in procurement. Nothing prevents certification; there is simply no ISMS yet. |
| **ISO/IEC 27007** | **Indirect** | 27007 is the *guideline for auditing an ISMS* — it governs how your certification auditor works, not what you must build. It becomes relevant the day you have an ISMS to audit. It is **not a control set** and cannot be "complied with" on its own. |
| **SOC 2** | **YES — voluntary, high commercial value** | The natural fit for a B2B SaaS handling client-supplied personal data. Security + Confidentiality + Availability are the criteria to scope; Privacy if you make representations about it. |
| **GDPR** | **Conditional — currently NO** | Applies only if you offer assessments to individuals in the EU/EEA or monitor their behaviour. No evidence of EU deployment in this repo (all origins are `.bodh.biz`, storage is sgp1/Singapore). Re-assess before any EU client. |
| **PCI DSS** | **NO — out of scope** | Verified: no cardholder data is stored, processed or transmitted anywhere in the codebase. The only "Payment"/"Billing" strings are dead Metronic template menu entries in `bodhassess-app/src/config/layout.config.tsx` pointing at `#`. Do not spend money here. If billing is added later, use a hosted payment page (SAQ A) and keep card data out of these systems entirely. |
| **RBI SAR (data localization)** | **NO directly — YES by flow-down** | BodhAssess is not a payment system operator, so RBI's payment-data localization circular does not bind it. **But** finding H-1 (full database backups in Singapore) will fail the vendor-assessment stage of any bank or NBFC client, and would be a hard blocker in an SAR-scope engagement. |
| **IS Audit (RBI)** | **NO directly — YES by flow-down** | The annual IS audit obligation sits on the bank/NBFC. As their service provider, BodhAssess would be assessed under RBI's outsourcing guidelines: access control, MFA for privileged access, audit logging, data localization, BCP and right-to-audit clauses. Findings C-1, C-2, H-1 and M-3 are the ones that would be raised. |
| **SEBI** | **NO directly — YES by flow-down if you sell to regulated entities** | SEBI's cyber-security framework (CSCRF) binds the regulated entity, which pushes requirements onto vendors. Same findings apply. Financial-reporting and corporate-governance aspects of a SEBI audit are not engineering matters and are out of this report's scope. |

**Recommended posture:** build **one** control set — an ISO 27001-shaped ISMS with DPDP obligations mapped into it — and evidence it once. SOC 2 then reuses ~80% of that evidence, and the RBI/SEBI vendor questionnaires become an exercise in pointing at controls you already have.

---

## 3. Findings

### CRITICAL

---

#### C-1 — Authentication is not enforced in any environment, including production

**Evidence**

- `spring-social/src/main/resources/application.yml` — `app.security.require-auth: ${REQUIRE_AUTH:false}` in **both** the `development` and `production` profiles.
- `spring-social/src/main/java/com/bodhpsychometric/security/ActorFilter.java` — with the flag off the filter *resolves* the bearer token for logging and *serves the request either way*. Nothing is rejected.
- `docker-compose.yml` — the `api` service passes only `SPRING_PROFILES_ACTIVE`, `DB_USERNAME`, `DB_PASSWORD` plus `secrets.env`. `REQUIRE_AUTH` is not set here.
- `controller/registration/RegistrationTokenController.java:57` states it plainly in a code comment: *"SECURITY: nothing in this project has an auth filter yet, so the admin endpoints here are as open as the public one."*

**Impact.** Every endpoint except Data Studio (which enforces its own check in `DataStudioAccess.requireActor()`) is reachable without credentials:

- `GET /api/reports/getRespondents` — paged name, email, organization and attempt status for **every respondent in the platform**, with a `search` parameter.
- `GET /api/reports/getRespondentDetail/{id}` — full profile plus every assessment allotted.
- `POST|PUT|DELETE /api/respondents/*` — create, modify and delete people.
- `POST /api/registration-tokens/create` — **mint registration links that create accounts**.
- All questionnaire, question, assessment, organization and practitioner CRUD.

This is a complete failure of access control. Under DPDP it is a failure of "reasonable security safeguards" (§8(5)) and any exploitation is a reportable personal data breach.

**Unverified.** `secrets.env` is gitignored and not in this repository. It is possible — not likely, given the comment above and the absence of the variable from `docker-compose.yml` — that `REQUIRE_AUTH=true` is set on the droplet. **Verify before acting:**

```bash
# on the production droplet
docker exec bodhpsychometric-api env | grep -E 'REQUIRE_AUTH|JWT_SECRET'
grep -E 'REQUIRE_AUTH|JWT_SECRET' /opt/<app-dir>/secrets.env
# from anywhere — if this returns data, the API is open
curl -s https://api.bodh.biz/api/reports/getRespondents | head -c 300
```

**Fix.** Set `REQUIRE_AUTH=true` and restart. The switch was built to be exactly this cheap, and `RequireAuthTest` already pins the enforcing behaviour. **But do not flip it before C-3** — with the committed signing key still in place, an attacker forges a superadmin token and enforcement buys nothing. Order: rotate the JWT secret → flip enforcement → verify every dashboard and portal page still works (that is the risk the flag exists to manage).

Then close the remaining gap: `require-auth` is *authentication*, not *authorization*. Once on, every caller is someone, but any authenticated practitioner can still call every admin endpoint. The role/`RoleGroup`/`urlPath` model already exists and is returned to the frontend — it is enforced **only in the UI**. Server-side authorization is the follow-on piece of work.

---

#### C-2 — Date of birth is the only credential, for every account type

**Evidence**

- `model/auth/User.java` — *"dob is the credential by product decision"*; stored as a plain `LocalDate`, compared directly.
- `service/DashboardAuthService.java:login` / `service/PortalAuthService.java:login` — `user.getDob().equals(dob)`. No hash, no salt, no KDF, because there is no password.
- No rate limiting, lockout, throttling or CAPTCHA anywhere: greps for `ratelimit`, `bucket4j`, `lockout`, `failedAttempt`, `429` return **nothing**.
- No MFA. No credential rotation. No password-change endpoint. No `logout` server-side — greps for `logout` in the backend return nothing.

**Impact.** Compounding problems, in order of severity:

1. **A date of birth is not a secret.** It is a *data field* — displayed in the dashboard, editable in the respondent form, exported in reports, and typed into the bulk XLSX upload sheet. Every administrator who can see a respondent's profile is holding that respondent's password. Every uploaded spreadsheet is a cleartext credential file, emailed and stored wherever spreadsheets go.
2. **The keyspace is tiny and unthrottled.** A working-age adult's dob is one of roughly 11,000–18,000 dates. With no rate limiting, that is minutes of scripted requests per account. Combined with C-1, the attacker does not even need to guess the email — `/api/reports/getRespondents` hands over the list.
3. **It applies to superadmins too.** The two seeded superadmin accounts in `application.yml` are `admin@bodh` / `2001-01-01` and `superadmin@bodh.biz` / `1990-01-01` — a complete working credential pair, in version control, for the highest-privilege role in the system (see C-3).
4. **Tokens cannot be revoked.** JWTs are stateless with a 12-hour expiry (`JWT_EXPIRY_MINUTES:720`). There is no denylist and no server-side logout, so a compromised token is valid for its full lifetime regardless of what you do to the account.

**Fix.** This is a product decision, so it needs a product-level answer, and the honest recommendation differs by audience:

- **Dashboard/practitioner accounts (do this first, it is not controversial):** real passwords with BCrypt or Argon2id, a minimum-length policy, forced rotation of the seeded superadmins, and TOTP MFA for any account with the `superAdmin` flag. RBI's IS Audit expectations for privileged access make MFA effectively mandatory the moment a bank or NBFC becomes a client.
- **Respondent portal (where the friction argument is real):** dob-only login exists because respondents are one-time users who will not manage a password, and that is a legitimate usability position. Preserve it without preserving the vulnerability: keep dob as a *convenience factor* but pair it with something the respondent possesses — a one-time link or OTP to the email/phone already on file, or a per-attempt access code issued with the assignment. If dob must remain the sole factor as an interim step, then at minimum add per-identifier and per-IP rate limiting with exponential backoff and lockout, which turns a minutes-long attack into an impractical one.
- **Immediately, regardless of the above:** rate-limit `/api/auth/login` and `/api/portal/login`. This is a small change and removes the bulk of the practical risk while the larger decision is made.

---

#### C-3 — Working credentials and signing keys are committed to git

**Evidence**

| Secret | Location | In history since |
|---|---|---|
| JWT HS256 signing key `eb36fabf9a42…6f80` | `application.yml`, both profiles | `be3f0a7e8` (initial spring-social commit) |
| Superadmin identities + dob credentials | `application.yml` — `admin@bodh`/`2001-01-01`, `superadmin@bodh.biz`/`1990-01-01` | same |
| MySQL **root** password `Google.com1` | `docker-compose.yml` default | `75d041757` |
| DB password `bodh` | `application.yml`, `docker-compose.yml`, `.env.example` | multiple |
| Legacy admin password `admin123` | `.env.example` | tracked |

`git ls-files` also confirms `.env`, `bodhassess-app/.env`, `.env.production`, `.env.staging`, `.env.local` and `deploy.production.env` are **tracked**, despite `.gitignore` listing several of them — `.gitignore` does not affect files already added. Their current contents are non-secret (URLs and storage-key names), but the pattern is one commit away from leaking one. `deploy.production.env` also publishes the production host as `root@168.144.118.157`.

**Impact.** If `JWT_SECRET` is not overridden in production, anyone with repository access — 10 contributors are in the log, plus anyone the repo has ever been shared with — can **forge a valid superadmin JWT**. That makes C-1's fix ineffective on its own. The MySQL root password is a full-database credential.

**Verify:** `docker exec bodhpsychometric-api env | grep JWT_SECRET` — if the value matches the one in `application.yml`, treat every token ever issued as compromised.

**Fix.**
1. Rotate the JWT secret to a fresh 32+ byte random value supplied only via `secrets.env`. This invalidates all live sessions — acceptable and desirable.
2. Rotate the MySQL root and application passwords.
3. Change the seeded superadmin dobs in the *database* (the seeder only ever adds, so editing the YAML changes nothing for an existing account), or delete the accounts if unused.
4. Remove defaults from source. Make the app **fail to start** when `JWT_SECRET` is unset in the production profile — a missing secret should be a loud boot failure, never a silent fallback to a public value.
5. `git rm --cached` the tracked `.env` files and confirm `.gitignore` covers them.
6. Rewriting git history is optional and disruptive; rotation is what actually removes the risk. Treat the historical values as permanently public.

---

### HIGH

---

#### H-1 — The entire database is backed up unencrypted to a shared bucket in Singapore

**Evidence** — `ops/README.md`, `ops/bodh-db-backup.sh`, `ops/bodh-backup.env.example`

- Nightly full `mysqldump` → gzip → `s3://storage-c9/bodhpsychometric/` on DigitalOcean Spaces, region **sgp1 (Singapore)**.
- `storage-c9` is explicitly documented as **shared** with another product (~3.4 GB of `bet-reports/`, `navigator-reports/`, `school-logos/`).
- The dump is **gzipped only — not encrypted**. Compression is not confidentiality.
- Retention 10 days, local and remote. Spaces credentials are correctly kept in a root-only `0600` file.

**Impact.** Three distinct problems:

1. **Data residency.** Every respondent's name, email, dob (which is also their password), phone, gender and complete psychometric response history leaves India nightly. This is a cross-border transfer under DPDP and a hard blocker for any RBI- or SEBI-regulated client — the flow-down expectation of India-resident storage is where a vendor assessment will stop.
2. **Tenant segregation.** A shared bucket means a single credential compromise, or one over-broad IAM policy, exposes your data alongside another product's. ISO 27001 A.5.14/A.8.12 and SOC 2 CC6.7 both ask you to demonstrate segregation you cannot currently demonstrate. The prune logic is carefully confined to your prefix, which is good discipline — but confinement of *writes* is not isolation of *reads*.
3. **No encryption at rest.** Anyone who obtains one object obtains the whole database in plaintext.

**Fix.** In priority order: encrypt the dump before upload (`gpg --symmetric --cipher-algo AES256` or age, key held outside the droplet, and **test the restore path**) → move to an India region (DigitalOcean `blr1`, or S3 `ap-south-1`) → move to a dedicated bucket with a scoped-down key → document the retention decision (10 days is short for a compliance narrative; ISO/SOC auditors will ask what it is based on) → **schedule and record a restore test**. The script verifies dump *integrity* (size and `Dump completed` trailer) which is genuinely good, but nothing in `ops/README.md` records that a restore has ever been performed, so your RTO and RPO are currently unproven assertions.

---

#### H-2 — No encryption at rest anywhere in the stack

**Evidence**

- MySQL 8 container on a plain Docker volume (`mysql-data`). No TDE, no encrypted tablespaces, no `--early-plugin-load` keyring in `docker-compose.yml`.
- JDBC URL sets **`useSSL=false`** in both profiles — application-to-database traffic is cleartext on the bridge network.
- Redis persists to a `redis-data` volume and holds partial answers (`bodh:partial:{mappingId}`, 1-day TTL) and staged submissions (`bodh:submit:{mappingId}`, **7-day TTL**) — real response data, unencrypted. `requirepass` is correctly set from `secrets.env`, and loopback-only publishing limits exposure.
- Application-level encryption: greps for `Cipher`, `AES`, `encrypt` in the backend return **nothing**.
- `Organization.logoBase64` and `coBrandLogoBase64` are `LONGTEXT` — not a security issue, but they inflate every dump.

**Impact.** Any filesystem-level access — a stolen volume snapshot, a droplet compromise, a mis-scoped DigitalOcean API token, a decommissioned disk — yields everything in plaintext. Psychometric response data is behaviourally revealing and, depending on the instrument, may attract heightened treatment under DPDP and would be special-category data under GDPR Art. 9.

**Fix.** Enable MySQL InnoDB tablespace encryption (or move to a managed DB with encryption on by default); turn on TLS for the JDBC connection (`useSSL=true` with a proper truststore — the current setting is a dev convenience that shipped to production); consider column-level encryption for dob specifically, since it doubles as a credential; and encrypt backups per H-1.

---

#### H-3 — Session tokens in `localStorage`, one unguarded HTML sink, no CSP

**Evidence**

- Both frontends store the bearer token in `localStorage` (`bodhassess-app/src/lib/practitioner-auth-utils.ts`, `pages/login.tsx`, `pages/portal/*.tsx`, `bodhassess-portal`). Readable by any JavaScript on the origin.
- `model/RichTextHtml.java` is a **strong** control — a strict tag allowlist that *rejects* rather than sanitizes, correctly reasoned in its own comments, and it covers terms, questionnaire and section instructions.
- The gap is elsewhere: `bodhassess-app/src/components/layout/shared/topbar/chat-sheet.tsx:210,248` renders `message.text` through `dangerouslySetInnerHTML` with **no allowlist and no sanitizer**. No `DOMPurify` dependency exists in either project.
- nginx sets **no** `Content-Security-Policy`, so nothing contains a slip.
- No token revocation (see C-2), so a stolen token is good for up to 12 hours.

**Fix.** Add DOMPurify and sanitize at every `dangerouslySetInnerHTML` sink that is not already covered by `RichTextHtml`; ship a `Content-Security-Policy` from nginx; and move tokens to `HttpOnly; Secure; SameSite=Strict` cookies with CSRF protection (the larger change — CSP plus sanitization removes most of the practical risk first).

---

#### H-4 — No security headers, no TLS policy, no edge rate limiting; permissive CORS

**Evidence** — `nginx/conf.d/default.conf`

- Confirmed absent: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`. A grep for `add_header` returns nothing.
- `ssl_protocols` and `ssl_ciphers` are unset — whatever the nginx image defaults to is your TLS policy, undocumented and unpinned. An auditor will ask you to state it; today you cannot.
- No `limit_req` — no rate limiting at the edge, which is where C-2's brute-force protection most cheaply belongs.
- Only `api.bodh.biz` is served here. The `portal.bodh.biz` block is **commented out**, and there is no `admin.bodh.biz` block at all — so where those two are served, and under what TLS and header policy, is **not evidenced in this repository**. That gap needs closing before any audit.
- `config/CorsConfig.java` + production `allowed-origins` — `https://*.bodh.biz` via `allowedOriginPatterns` **with `allowCredentials(true)`**. Every subdomain is a trusted origin, including any that is ever mis-provisioned, parked, or taken over.

**Fix.** Add the header set and an explicit modern TLS policy (TLS 1.2+, named cipher suite); add `limit_req` zones for the two login endpoints; replace the CORS wildcard with the explicit list of origins you actually operate; and document the serving path for the dashboard and portal.

---

### MEDIUM

---

#### M-1 — No CI, no dependency scanning, no SAST

`.github/` contains only Claude modernization hooks — **no workflows**. Greps for `trivy`, `snyk`, `dependency-check`, `codeql`, `semgrep`, `npm audit` return nothing anywhere in the repo.

Current dependency posture is actually good — Spring Boot 4.1.0, Java 25, jjwt 0.12.6 are all current, and there is no obvious vulnerable component. The finding is not "you have a vulnerable dependency"; it is that **nothing would tell you when you do**. ISO 27001 A.8.8 (technical vulnerability management) and SOC 2 CC7.1 both require a defined, evidenced process.

**Fix.** A GitHub Actions workflow running `mvn test`, `npm audit --audit-level=high`, OWASP Dependency-Check or Trivy, and secret scanning (gitleaks) on every PR. Enable Dependabot. This is a half-day of work that produces continuous audit evidence.

---

#### M-2 — Audit trail is well-built but not audit-grade

`ActivityLog` is one of the better pieces of this codebase and deserves credit: every request recorded including reads, actor captured as a **snapshot with no FK** (so the row outlives the account — exactly right for "who deleted this"), deliberate exclusion of bodies, tokens, dob, answers and demographic values, asynchronous write that drops rather than blocks, and a 365-day retention default.

Four gaps stand between it and audit-grade:

1. **No integrity protection.** Rows sit in the same MySQL instance an administrator can reach. Nothing is append-only, hash-chained, or shipped to write-once external storage. An auditor asks: what stops a privileged user editing the log that records what they did?
2. **The auditors are not audited.** `ActivityLogFilter.shouldNotFilter` skips `/api/activity` by design — reasonable to avoid recursion, but it means *"who read the audit trail"* is unanswerable. Sensitive-data-access logging is precisely what SOC 2 CC7.2 and RBI IS Audit look for.
3. **Attribution is empty while C-1 stands.** With `require-auth` off, most rows record `anonymous`. The trail cannot attribute anything, which is the whole point of a trail.
4. **No alerting or monitoring.** Rows are written and viewable; nothing watches them. No SIEM, no anomaly detection, no on-call path.

**Fix.** Ship activity rows to an append-only external store (or hash-chain them in place); log audit-viewer reads to a separate stream; add alerting on the signals that matter (bulk report reads, failed logins, privilege changes).

---

#### M-3 — Data retention and erasure are not implemented

- **Erasure.** `DELETE /api/respondents/delete/{id}` returns **409 Conflict** whenever the respondent has any assessment attempt (`RespondentController.java:199`). This is the correct *data-integrity* choice — but it means the people whose data is most sensitive have **no erasure path at all**. DPDP §12 and GDPR Art. 17 both require one, subject to lawful retention grounds.
- **Retention.** No retention schedule for `AssessmentAnswer`, `DemographicResponse`, or `RespondentUser`. DPDP §8(7) requires erasure once the purpose is served. `ActivityLog` is the only entity with a retention policy (365 days) — apply the same thinking to personal data.
- **Consent withdrawal has no effect.** `RespondentController.java:466-485` handles the transitions correctly — first grant stamps `consentedAt`, revoke clears it — but revoking flips a boolean and deletes nothing. Under DPDP, withdrawal must stop processing and trigger erasure absent another lawful basis.
- **No data-subject request process.** No endpoint, runbook or SLA for access, correction, erasure or grievance. DPDP requires a **Consent Notice**, a published **Grievance Officer**, and a defined response mechanism.

**Credit where due:** consent capture itself is real and better than most — `is_consented` + `consented_at` on `RespondentUser`, plus `AssessmentTerms` showing versioned terms before the first question with a sensible default body. The foundation is there; the lifecycle around it is missing.

**Fix.** Define retention periods per data class and implement a purge job; implement anonymization (sever `RespondentUser` from `User`, retain de-identified answers for statistical validity) as the erasure path that survives the FK constraint; make consent withdrawal trigger it; publish the Consent Notice and Grievance Officer.

---

#### M-4 — No documented ISMS

This is the single largest gap for ISO 27001, ISO 27007 and SOC 2 — and it is not a code problem. **Certification audits assess documented, operating, evidenced processes, not source code.** Currently absent:

- Information security policy set; risk assessment and treatment plan; Statement of Applicability
- Asset inventory and data classification; **Record of Processing Activities** (DPDP/GDPR)
- Access control policy and **periodic access reviews** (10 contributors have repository access; who has droplet, database and Spaces access is not recorded anywhere)
- Supplier register and assessments — DigitalOcean (compute, Spaces), Let's Encrypt, and any subprocessors
- **Incident response and breach notification** runbook — DPDP requires notifying both the Data Protection Board **and every affected Data Principal**, on a clock. There is no plan, no severity model, no comms template, no on-call rotation.
- Business continuity and disaster recovery with a **tested** restore (see H-1)
- Secure SDLC, change management, onboarding/offboarding
- Security awareness training records

**Fix.** This is 3–6 months of deliberate work. Start with: asset inventory + Record of Processing Activities + risk register + incident response plan. Those four unlock most of the rest and are what a DPDP regulator would ask for first.

---

#### M-5 — Single-host production with root SSH deployment

`deploy.production.env` → `REMOTE_HOST=root@168.144.118.157`. One droplet running MySQL, Redis, the API and nginx. Deployment is as **root**. No HA, no failover, no documented patch cadence, no host hardening baseline, no log shipping, no IDS/HIPS. Availability is a SOC 2 criterion and BCP is an ISO 27001 requirement; both are currently unevidenced.

**Credit:** the port-publishing policy in `docker-compose.yml` is a genuinely good control — everything bound to `127.0.0.1` except nginx, with `/usr/local/sbin/docker-port-guard.sh` adding `DOCKER-USER` DROP rules as a second layer, and a correct note that **Docker writes iptables directly and bypasses ufw**. That came from a real Shadowserver notice about exposed Redis and was handled properly. Keep it and document it — it is exactly the kind of evidence an auditor wants.

**Fix.** Non-root deploy user with scoped sudo; SSH keys only with root login disabled; documented patching; managed database (which also solves H-2's encryption and backup residency); and eventually a second host.

---

### LOW

**L-1 — Verbose error messages in production.** `spring.web.error.include-message: always` in the production profile. Stack traces are correctly suppressed (`include-stacktrace: never`) and `ApiExceptionHandler` is well-built, so the exposure is small — but exception *messages* can leak internal structure. Consider `on-param` for production.

**L-2 — Employee-ID login can silently fail on collision.** `PortalAuthService.byEmployeeId` returns a generic 401 when an employee ID + dob matches more than one person across organizations. The reasoning is documented and correct (rejecting beats guessing, and email login still works), but the affected user gets an unexplainable failure with no signal to support. Log the collision so it is diagnosable.

---

## 4. Control mapping

| Finding | ISO 27001:2022 | SOC 2 (TSC) | DPDP 2023 | RBI IS Audit / SAR flow-down |
|---|---|---|---|---|
| C-1 No auth enforcement | A.5.15, A.5.18, A.8.3 | CC6.1, CC6.2, CC6.3 | §8(5) | Access control — critical |
| C-2 DOB as credential | A.5.17, A.8.5 | CC6.1 | §8(5) | MFA for privileged access |
| C-3 Committed secrets | A.5.17, A.8.24 | CC6.1 | §8(5) | Key management |
| H-1 Offshore shared backups | A.5.14, A.8.12, A.8.13 | CC6.7, A1.2 | §16 cross-border | **Data localization — blocker** |
| H-2 No encryption at rest | A.8.24 | CC6.1, CC6.7 | §8(5) | Encryption standards |
| H-3 Token storage / XSS | A.8.26, A.8.28 | CC6.1, CC6.8 | §8(5) | Application security |
| H-4 Headers / TLS / CORS | A.8.9, A.8.20, A.8.21, A.8.24 | CC6.6, CC6.7 | §8(5) | Network security |
| M-1 No CI / scanning | A.8.8, A.8.25, A.8.28 | CC7.1, CC8.1 | §8(5) | Vulnerability management |
| M-2 Audit trail gaps | A.8.15, A.8.16 | CC7.2, CC7.3 | §8(5) | Audit logging |
| M-3 Retention / erasure | A.5.34, A.8.10 | P4.2, P4.3, C1.2 | §8(7), §12, §13 | Data lifecycle |
| M-4 No ISMS | Clauses 4–10, A.5.1 | CC1–CC5, CC9 | §8(4), §8(6) | Governance |
| M-5 Single host / root deploy | A.5.30, A.8.6, A.8.9 | A1.1, A1.2, CC6.1 | §8(5) | BCP/DR |

---

## 5. What is already working

Worth stating explicitly — these are real controls that will earn credit, and none should be lost during remediation:

- **Flyway with `ddl-auto: validate`** — disciplined, reviewable, non-repudiable schema change control. Directly satisfies change-management expectations (ISO A.8.32, SOC 2 CC8.1).
- **`ActivityLog`** — every request, actor as an FK-less snapshot, no sensitive payloads, async and non-blocking, bounded queue that drops rather than OOMs, retention policy. A strong foundation (M-2 lists what is left).
- **`RichTextHtml`** — reject-don't-sanitize allowlist with the reasoning documented in the code. The right call, correctly argued.
- **Container port policy** — loopback-only binding plus `DOCKER-USER` DROP rules, with the ufw-bypass trap correctly identified. Incident-driven and well handled.
- **Backup integrity discipline** — verified dump before upload, upload confirmed before prune, so failures degrade to *stale* backups and never to *no* backups. That reasoning is better than most production systems have.
- **Credential-oblivious auth responses** — identical messages for unknown identifier and wrong dob; workbook strangers get 404 rather than 403 (`DataStudioAccess`). Correct enumeration hygiene.
- **`DataStudioAccess`** — a proper four-level authorization model with a single enforcement point. **This is the pattern the rest of the API needs.**
- **`RequireAuthTest`** — enforcing mode is already pinned by tests, so flipping C-1's switch is a known quantity rather than an experiment.
- **E.164 phone validation and `@BirthDate` bounds** — single-source validation rules with the cross-field constraint handled properly.

---

## 6. Remediation roadmap

### Immediate — this week

Do these in order; the order matters.

1. **Verify** whether `REQUIRE_AUTH` and `JWT_SECRET` are overridden in production (commands in C-1 and C-3).
2. **Rotate** the JWT secret, MySQL root and app passwords, and the seeded superadmin credentials **in the database**.
3. **Enable `REQUIRE_AUTH=true`** and regression-test both frontends end to end.
4. **Rate-limit** both login endpoints (nginx `limit_req` is the fastest path).
5. **Encrypt** the nightly backup before upload, and **test a restore**.
6. **Add security headers and a TLS policy** to nginx; replace the `*.bodh.biz` CORS wildcard.
7. **Sanitize** the `chat-sheet.tsx` HTML sink.

### 30 days

Server-side authorization on every admin endpoint (extend the `DataStudioAccess` pattern) · real passwords + MFA for dashboard accounts · CI with dependency, secret and static scanning · move backups to an India region and a dedicated bucket · MySQL encryption at rest and TLS on the JDBC connection · non-root deploy user.

### 90 days

Decide and implement the portal's second authentication factor · retention schedule and purge job · anonymization-based erasure path · Consent Notice, Grievance Officer and DSR process · incident response and breach notification runbook · asset inventory and Record of Processing Activities · risk register.

### 6 months

ISMS documentation set and internal audit · access reviews and supplier assessments · BCP/DR with tested restore · security awareness training · then engage a certification body for ISO 27001 Stage 1, and a CPA firm for SOC 2 Type I with a Type II observation window to follow.

---

## 7. Open questions requiring information outside this repository

1. Is `REQUIRE_AUTH=true` set in production `secrets.env`? *(Determines whether C-1 is theoretical or live.)*
2. Is `JWT_SECRET` overridden in production? *(Determines whether every issued token is forgeable.)*
3. Where are `admin.bodh.biz` and `portal.bodh.biz` served from? No nginx block exists for either — their TLS and header posture is unknown.
4. Has a backup restore ever been tested end to end? *(RTO/RPO are unproven without it.)*
5. Who currently holds droplet, database, and DigitalOcean Spaces access? *(Needed for the access review; no record exists.)*
6. Do any current or prospective clients fall under RBI, SEBI, or EU jurisdiction? *(Determines whether the flow-down and GDPR rows in §2 become live obligations.)*
7. Is there an existing DPA or security schedule with client organizations? *(Determines your controller/processor position under DPDP.)*

---

*Prepared from static analysis of commit `b4b335ff`. Findings marked "verify" require confirmation on the production host before being treated as confirmed or dismissed. This report covers technical and organizational security controls; it is not legal advice — confirm DPDP obligations and commencement dates with counsel.*
