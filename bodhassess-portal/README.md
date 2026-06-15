# BodhAssess — Respondent Portal

Standalone React + TypeScript (Vite) app for the respondent assessment-taking
flow, extracted from `bodhassess-app`. It talks to the **same shared** Spring
backend (`bodhassess-api-spring`) — no backend was forked.

## Flow

```
/portal/login                  Sign in (email/phone + DOB)
/portal/register               Token-link registration + self-signup (?token=…)
/portal/assessment             List of allotted assessments
/portal/assessment/:sessionId  Take flow — one route, internal step machine:
                                 terms → demographics → instructions → questions → done
```

Completion is the terminal state of the take route (no separate page). A single
`<RequireAuth>` guard protects the two `/portal/assessment*` routes.

## Local development

```bash
npm install
cp .env.example .env.local   # point VITE_API_URL at your backend
npm run dev                  # http://localhost:3001
```

The backend must allow this origin via `APP_CORS_ALLOWED_ORIGINS`
(`http://localhost:3001` is already in the docker-compose default).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on :3001 |
| `npm run build` | `tsc -b` typecheck + production bundle to `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | Types only |

## Environment (build-time, inlined by Vite)

| Var | Purpose | Default |
|---|---|---|
| `VITE_API_URL` | Shared backend base, incl. `/api/v1` | `http://localhost:4000/api/v1` |
| `VITE_APP_NAME` | Brand name in headers | `BodhAssess` |
| `VITE_AUTH_STORAGE_KEY` | localStorage token key | `bodhassess.auth.token` |
| `VITE_BASE_PATH` | Sub-path mount (root on its own subdomain) | `/` |

## Deployment

Multi-stage `Dockerfile` (node build → nginx). Wired into the root
`docker-compose.yml` as the `portal` service (prod profile) and served at
`portal.bodh.biz` via `nginx/conf.d/default.conf`.

## Notes for the admin app

Registration/QR links generated in `bodhassess-app` (invite/copy-link, the
"Portal URL" string) must point at this app's origin (`https://portal.bodh.biz`).
See `docs/portal-extraction-plan.md` §4–§5.
